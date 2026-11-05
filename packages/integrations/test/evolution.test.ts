import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EvolutionClient,
  EvolutionError,
  EvolutionWhatsAppSender,
  InMemoryDedupStore,
  allowlistFromEnv,
  checkWebhookSecret,
  createWebhookProcessor,
  normalizeMessagesUpsert,
} from '../src/evolution/index.ts';
import type { FetchLike, WebhookLogger } from '../src/evolution/index.ts';

// Todos os valores abaixo são FICTÍCIOS. Payloads são sintéticos, baseados no formato documentado
// do evento messages.upsert da Evolution v2.x — não são capturas reais.
const SECRET = 'fake-webhook-secret-for-tests-0123456789abcdef';
const API_KEY = 'fake-api-key-for-tests';
const INSTANCE = 'inst-test';
const FIN = '5511900000001@s.whatsapp.net';
const OWNER = '5511900000002@s.whatsapp.net';
const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);

function upsert(over: { id?: string; jid?: string; fromMe?: boolean; text?: string | null; ts?: number; instance?: string; extra?: object } = {}) {
  return {
    event: 'messages.upsert',
    instance: over.instance ?? INSTANCE,
    apikey: 'must-never-be-logged',
    data: {
      key: { remoteJid: over.jid ?? FIN, fromMe: over.fromMe ?? false, id: over.id ?? 'MSG-1', ...(over.extra ?? {}) },
      pushName: 'Fulano',
      message: over.text === null ? { imageMessage: {} } : { conversation: over.text ?? 'saldo de hoje' },
      messageType: 'conversation',
      messageTimestamp: Math.floor((over.ts ?? NOW) / 1000),
    },
  };
}

function setup(over: Partial<Parameters<typeof createWebhookProcessor>[0]> = {}) {
  const logs: string[] = [];
  const logger: WebhookLogger = { info: (e, f) => logs.push(`${e} ${JSON.stringify(f)}`) };
  const dedup = new InMemoryDedupStore({ now: () => NOW });
  const p = createWebhookProcessor({
    expectedSecret: SECRET,
    instanceName: INSTANCE,
    allowedSenders: [{ jid: FIN, role: 'FINANCEIRO' }, { jid: OWNER, role: 'PROPRIETARIA' }],
    dedup,
    now: () => NOW,
    logger,
    ...over,
  });
  return { p, logs, dedup };
}
const hdr = { 'x-webhook-secret': SECRET };

// ---------- segredo ----------
test('segredo: aceita correto; rejeita ausente, errado, duplicado e não configurado', () => {
  assert.equal(checkWebhookSecret(SECRET, SECRET), 'ok');
  assert.equal(checkWebhookSecret(undefined, SECRET), 'missing');
  assert.equal(checkWebhookSecret('', SECRET), 'missing');
  assert.equal(checkWebhookSecret('x'.repeat(SECRET.length), SECRET), 'mismatch');
  assert.equal(checkWebhookSecret(SECRET.slice(0, -1), SECRET), 'mismatch');
  assert.equal(checkWebhookSecret([SECRET, SECRET], SECRET), 'missing');
  assert.equal(checkWebhookSecret(SECRET, undefined), 'not_configured');
  assert.equal(checkWebhookSecret('', ''), 'not_configured');
  assert.equal(checkWebhookSecret('short', 'short'), 'not_configured');
});

test('processor: sem segredo configurado rejeita tudo com 503 (fail-closed)', async () => {
  const { p } = setup({ expectedSecret: undefined });
  const r = await p.handle({ headers: { 'x-webhook-secret': 'qualquer' }, body: upsert() });
  assert.deepEqual([r.kind, r.httpStatus], ['rejected', 503]);
});

test('processor: cabeçalho ausente/errado → 401; nome do cabeçalho case-insensitive', async () => {
  const { p } = setup();
  assert.equal((await p.handle({ headers: {}, body: upsert() })).httpStatus, 401);
  assert.equal((await p.handle({ headers: { 'x-webhook-secret': 'errado' }, body: upsert() })).httpStatus, 401);
  assert.equal((await p.handle({ headers: { 'X-Webhook-Secret': SECRET }, body: upsert() })).kind, 'accepted');
});

test('segredo: durante rotação aceita atual e próximo; rejeita o antigo depois de removido', () => {
  const next = 'fake-NEXT-secret-for-tests-0123456789abcdefgh';
  assert.equal(checkWebhookSecret(next, [SECRET, next]), 'ok');
  assert.equal(checkWebhookSecret(SECRET, [SECRET, next]), 'ok');
  assert.equal(checkWebhookSecret(SECRET, [next]), 'mismatch');
  assert.equal(checkWebhookSecret(SECRET, [undefined, 'curto']), 'not_configured');
});

// ---------- normalização ----------
test('normalize: texto simples, extendedText, mídia e LID com número alternativo', () => {
  const a = normalizeMessagesUpsert(upsert({ text: 'oi' }));
  assert.ok(a.ok && a.message.text === 'oi' && a.message.receivedAt === new Date(NOW).toISOString());

  const ext = upsert();
  (ext.data as any).message = { extendedTextMessage: { text: 'longo' } };
  const b = normalizeMessagesUpsert(ext);
  assert.ok(b.ok && b.message.text === 'longo');

  const c = normalizeMessagesUpsert(upsert({ text: null }));
  assert.ok(c.ok && c.message.text === null);

  const d = normalizeMessagesUpsert(upsert({ jid: '123@lid', extra: { remoteJidAlt: '5511900000001:7@s.whatsapp.net' } }));
  assert.ok(d.ok && d.message.senderJid === FIN);
});

test('normalize: evento diferente, formato inválido e timestamp inválido', () => {
  assert.deepEqual(normalizeMessagesUpsert({ event: 'connection.update' }), { ok: false, reason: 'unsupported_event' });
  assert.deepEqual(normalizeMessagesUpsert('x'), { ok: false, reason: 'invalid_body' });
  assert.deepEqual(normalizeMessagesUpsert({ event: 'MESSAGES_UPSERT', instance: 'i', data: {} }), { ok: false, reason: 'invalid_shape' });
  const bad = upsert();
  (bad.data as any).messageTimestamp = 'abc';
  assert.deepEqual(normalizeMessagesUpsert(bad), { ok: false, reason: 'invalid_timestamp' });
});

// ---------- fluxo do webhook ----------
test('processor: aceita remetente autorizado com papel correto', async () => {
  const { p } = setup();
  const r = await p.handle({ headers: hdr, body: upsert({ jid: OWNER }) });
  assert.ok(r.kind === 'accepted');
  assert.equal(r.role, 'PROPRIETARIA');
  assert.equal(r.message.text, 'saldo de hoje');
});

test('processor: bloqueia fromMe, grupo, remetente fora da allowlist e allowlist vazia', async () => {
  const { p } = setup();
  const reason = async (b: unknown) => {
    const r = await p.handle({ headers: hdr, body: b });
    return r.kind === 'ignored' ? r.reason : r.kind;
  };
  assert.equal(await reason(upsert({ fromMe: true })), 'from_me');
  assert.equal(await reason(upsert({ jid: '120363000000000000@g.us', id: 'G1' })), 'group_or_broadcast');
  assert.equal(await reason(upsert({ jid: 'status@broadcast', id: 'G2' })), 'group_or_broadcast');
  assert.equal(await reason(upsert({ jid: '5511999999999@s.whatsapp.net', id: 'U1' })), 'sender_not_allowed');
  assert.equal(await reason(upsert({ jid: '999@lid', id: 'U2' })), 'sender_not_allowed');
  assert.equal(await reason({ event: 'connection.update' }), 'unsupported_event');

  const empty = setup({ allowedSenders: [] });
  const r = await empty.p.handle({ headers: hdr, body: upsert() });
  assert.equal(r.kind === 'ignored' && r.reason, 'sender_not_allowed');
});

test('processor: instância diferente → 403; remetente não autorizado não ocupa a deduplicação', async () => {
  const { p, dedup } = setup();
  const w = await p.handle({ headers: hdr, body: upsert({ instance: 'outra' }) });
  assert.deepEqual([w.kind, w.httpStatus], ['rejected', 403]);
  await p.handle({ headers: hdr, body: upsert({ jid: '5511999999999@s.whatsapp.net', id: 'X' }) });
  assert.equal(await dedup.claim({ instanceName: INSTANCE, providerMessageId: 'X' }), 'claimed');
});

test('processor: mensagem repetida é ignorada; retry após release() é permitido; após complete() não', async () => {
  const { p } = setup();
  const first = await p.handle({ headers: hdr, body: upsert() });
  assert.ok(first.kind === 'accepted');
  const dup = await p.handle({ headers: hdr, body: upsert() });
  assert.equal(dup.kind === 'ignored' && dup.reason, 'duplicate');

  await first.release(); // falha antes do efeito → provedor pode reenviar
  const retry = await p.handle({ headers: hdr, body: upsert() });
  assert.ok(retry.kind === 'accepted');
  await retry.complete();
  const again = await p.handle({ headers: hdr, body: upsert() });
  assert.equal(again.kind === 'ignored' && again.reason, 'duplicate');
});

test('processor: 2 réplicas com a mesma store processam entrega concorrente apenas uma vez', async () => {
  const shared = new InMemoryDedupStore({ now: () => NOW });
  const a = setup({ dedup: shared }).p;
  const b = setup({ dedup: shared }).p;
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).handle({ headers: hdr, body: upsert({ id: 'CONC' }) })),
  );
  assert.equal(results.filter((r) => r.kind === 'accepted').length, 1);
  assert.equal(results.filter((r) => r.kind === 'ignored' && r.reason === 'duplicate').length, 9);
});

test('dedup: claim em processamento com lease expirado pode ser reassumido; done nunca', async () => {
  let t = NOW;
  const s = new InMemoryDedupStore({ leaseMs: 1000, now: () => t });
  const k = { instanceName: INSTANCE, providerMessageId: 'L' };
  assert.equal(await s.claim(k), 'claimed');
  assert.equal(await s.claim(k), 'duplicate');
  t += 1001; // réplica original caiu
  assert.equal(await s.claim(k), 'claimed');
  await s.complete(k);
  t += 10 * 24 * 3600_000;
  assert.equal(await s.claim(k), 'duplicate');
});

test('processor: mensagem antiga ou do futuro é barrada ANTES do claim (replay após expurgo)', async () => {
  const { p, dedup } = setup();
  const old = await p.handle({ headers: hdr, body: upsert({ id: 'OLD', ts: NOW - 11 * 60_000 }) });
  assert.equal(old.kind === 'ignored' && old.reason, 'stale_message');
  const future = await p.handle({ headers: hdr, body: upsert({ id: 'FUT', ts: NOW + 3 * 60_000 }) });
  assert.equal(future.kind === 'ignored' && future.reason, 'stale_message');
  assert.equal(await dedup.claim({ instanceName: INSTANCE, providerMessageId: 'OLD' }), 'claimed');
});

test('processor: logs não contêm segredo, apikey do payload, texto nem JID completo', async () => {
  const { p, logs } = setup();
  const ok = await p.handle({ headers: hdr, body: upsert({ text: 'conteudo-sensivel-123' }) });
  await p.handle({ headers: hdr, body: upsert({ text: 'conteudo-sensivel-123' }) }); // duplicata
  await p.handle({ headers: { 'x-webhook-secret': 'errado' }, body: upsert() });
  await p.handle({ headers: hdr, body: upsert({ jid: '5511999999999@s.whatsapp.net', id: 'U' }) });
  assert.ok(ok.kind === 'accepted' && logs.length >= 4);
  const all = logs.join('\n');
  for (const forbidden of [SECRET, 'errado', 'must-never-be-logged', 'conteudo-sensivel-123', FIN, '5511999999999@', 'MSG-1']) {
    assert.ok(!all.includes(forbidden), `log vaza: ${forbidden}`);
  }
});

test('allowlistFromEnv ignora vazios e normaliza sufixo de dispositivo', () => {
  assert.deepEqual(allowlistFromEnv({ FINANCEIRO_WHATSAPP_JID: '5511900000001:3@S.whatsapp.net', PROPRIETARIA_WHATSAPP_JID: '' }), [
    { jid: FIN, role: 'FINANCEIRO' },
  ]);
  assert.deepEqual(allowlistFromEnv({}), []);
});

// ---------- cliente HTTP (somente mocks; nenhuma rede) ----------
type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function mockFetch(responses: Array<{ status: number; body?: unknown } | 'hang' | 'throw'>) {
  const calls: Call[] = [];
  const fn: FetchLike = (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, ...(init.body !== undefined ? { body: init.body } : {}) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    if (r === 'throw') return Promise.reject(new Error(`ECONNREFUSED http://10.0.0.5 ${API_KEY}`));
    if (r === 'hang') {
      return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    }
    return Promise.resolve({ status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) });
  };
  return { fn, calls };
}
const client = (f: FetchLike, over: object = {}) =>
  new EvolutionClient({ baseUrl: 'http://127.0.0.1:18080/', apiKey: API_KEY, instanceName: INSTANCE, fetch: f, sleep: async () => {}, ...over });

test('cliente: connectionState mapeia open/close/connecting/desconhecido e envia apikey', async () => {
  const map: Array<[string, string]> = [['open', 'connected'], ['close', 'disconnected'], ['connecting', 'disconnected'], ['???', 'unknown']];
  for (const [state, expected] of map) {
    const m = mockFetch([{ status: 200, body: { instance: { instanceName: INSTANCE, state } } }]);
    assert.equal(await client(m.fn).getConnectionStatus(), expected);
    assert.equal(m.calls[0]!.url, `http://127.0.0.1:18080/instance/connectionState/${INSTANCE}`);
    assert.equal(m.calls[0]!.method, 'GET');
    assert.equal(m.calls[0]!.headers.apikey, API_KEY);
  }
});

test('cliente: GET repete em 503 e depois sucede; não repete em 401', async () => {
  const ok = { status: 200, body: { instance: { state: 'open' } } };
  const m = mockFetch([{ status: 503 }, { status: 502 }, ok]);
  assert.equal(await client(m.fn).getConnectionStatus(), 'connected');
  assert.equal(m.calls.length, 3);

  const u = mockFetch([{ status: 401 }, ok]);
  await assert.rejects(client(u.fn).getConnectionStatus(), (e: EvolutionError) => e.kind === 'auth' && e.status === 401);
  assert.equal(u.calls.length, 1);

  const exhausted = mockFetch([{ status: 500 }]);
  await assert.rejects(client(exhausted.fn).getConnectionStatus(), (e: EvolutionError) => e.kind === 'http');
  assert.equal(exhausted.calls.length, 3);
});

test('cliente: timeout é sinalizado e a mensagem de erro não vaza credenciais/host', async () => {
  const m = mockFetch(['hang']);
  await assert.rejects(client(m.fn, { timeoutMs: 20, maxReadRetries: 1 }).getConnectionStatus(), (e: EvolutionError) => e.kind === 'timeout' && e.retryable);
  assert.equal(m.calls.length, 2);

  const n = mockFetch(['throw']);
  await assert.rejects(client(n.fn, { maxReadRetries: 0 }).getConnectionStatus(), (e: EvolutionError) => {
    assert.equal(e.kind, 'network');
    assert.ok(!e.message.includes(API_KEY) && !e.message.includes('10.0.0.5'));
    return true;
  });
});

test('cliente: estado ausente vira unknown; construtor exige apikey', async () => {
  const m = mockFetch([{ status: 200 }]);
  assert.equal(await client(m.fn).getConnectionStatus(), 'unknown');
  assert.throws(() => new EvolutionClient({ baseUrl: 'http://x', apiKey: '', instanceName: 'i', fetch: m.fn }), EvolutionError);
});

test('envio: desabilitado por padrão — fetch nunca é chamado', async () => {
  const m = mockFetch([{ status: 201, body: { key: { id: 'X' } } }]);
  const sender = new EvolutionWhatsAppSender(client(m.fn));
  await assert.rejects(sender.sendText({ recipientJid: FIN, text: 'oi', idempotencyKey: 'k' }), (e: EvolutionError) => e.kind === 'send_disabled');
  assert.equal(m.calls.length, 0);
});

test('envio (mock, habilitado): payload correto, id retornado, sem retry em 500 nem em timeout', async () => {
  const m = mockFetch([{ status: 201, body: { key: { id: 'OUT-1' }, status: 'PENDING' } }]);
  const sender = new EvolutionWhatsAppSender(client(m.fn, { sendEnabled: true }));
  assert.deepEqual(await sender.sendText({ recipientJid: FIN, text: 'oi', idempotencyKey: 'k1' }), { providerMessageId: 'OUT-1' });
  assert.equal(m.calls[0]!.url, `http://127.0.0.1:18080/message/sendText/${INSTANCE}`);
  assert.deepEqual(JSON.parse(m.calls[0]!.body!), { number: '5511900000001', text: 'oi' });

  const e500 = mockFetch([{ status: 500 }]);
  await assert.rejects(
    new EvolutionWhatsAppSender(client(e500.fn, { sendEnabled: true })).sendText({ recipientJid: FIN, text: 'oi', idempotencyKey: 'k2' }),
    (e: EvolutionError) => e.kind === 'http' && !e.retryable && e.outcomeUnknown,
  );
  assert.equal(e500.calls.length, 1);

  const to = mockFetch(['hang']);
  await assert.rejects(
    client(to.fn, { sendEnabled: true, timeoutMs: 20 }).sendText({ number: '1', text: 'x' }),
    (e: EvolutionError) => e.kind === 'timeout' && e.outcomeUnknown && !e.retryable,
  );
  assert.equal(to.calls.length, 1);

  await assert.rejects(sender.sendText({ recipientJid: FIN, text: 'oi', idempotencyKey: '' }));
});
