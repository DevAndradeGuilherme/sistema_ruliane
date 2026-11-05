import type { NormalizedInboundMessage } from './types.ts';

export type NormalizeFailure =
  | 'invalid_body'
  | 'unsupported_event'
  | 'invalid_shape'
  | 'invalid_timestamp';

export type NormalizeResult =
  | { ok: true; message: NormalizedInboundMessage }
  | { ok: false; reason: NormalizeFailure };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/** Remove sufixo de dispositivo (`5511...:12@s.whatsapp.net` → `5511...@s.whatsapp.net`) e normaliza caixa. */
export function canonicalJid(jid: string): string {
  const [user = '', server = ''] = jid.trim().toLowerCase().split('@');
  return `${user.split(':')[0]}@${server}`;
}

function toIso(ts: unknown): string | undefined {
  let secs: number | undefined;
  if (typeof ts === 'number') secs = ts;
  else if (typeof ts === 'string' && /^\d+$/.test(ts)) secs = Number(ts);
  else if (isRecord(ts) && typeof ts.low === 'number') secs = ts.low; // Long serializado
  if (secs === undefined || !Number.isFinite(secs) || secs <= 0) return undefined;
  const d = new Date(secs * 1000);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Normaliza o evento `MESSAGES_UPSERT` (também aceito como `messages.upsert`) da Evolution v2.3.7.
 * O corpo é dado externo não confiável: toda leitura é defensiva e nada além dos campos usados é mantido.
 * NÃO valida autenticidade, allowlist nem duplicidade — isso é papel de `webhook.ts`.
 */
export function normalizeMessagesUpsert(body: unknown): NormalizeResult {
  if (!isRecord(body)) return { ok: false, reason: 'invalid_body' };
  const event = str(body.event)?.toUpperCase().replace(/[.\-]/g, '_');
  if (event !== 'MESSAGES_UPSERT') return { ok: false, reason: 'unsupported_event' };

  const instanceName = str(body.instance);
  const data = body.data;
  if (!instanceName || !isRecord(data) || !isRecord(data.key)) return { ok: false, reason: 'invalid_shape' };

  const key = data.key;
  const id = str(key.id);
  const remoteJid = str(key.remoteJid);
  if (!id || !remoteJid || typeof key.fromMe !== 'boolean') return { ok: false, reason: 'invalid_shape' };

  const receivedAt = toIso(data.messageTimestamp);
  if (!receivedAt) return { ok: false, reason: 'invalid_timestamp' };

  let sender = canonicalJid(remoteJid);
  // Contas com endereçamento por LID: usar o número real quando a Evolution o fornece.
  if (sender.endsWith('@lid')) {
    const alt = str(key.remoteJidAlt);
    if (alt && canonicalJid(alt).endsWith('@s.whatsapp.net')) sender = canonicalJid(alt);
  }
  const isGroup = sender.endsWith('@g.us') || sender.endsWith('@broadcast') || sender.endsWith('@newsletter');

  const msg = isRecord(data.message) ? data.message : {};
  const ext = isRecord(msg.extendedTextMessage) ? msg.extendedTextMessage : {};
  const text = str(msg.conversation) ?? str(ext.text) ?? null;

  return {
    ok: true,
    message: { instanceName, providerMessageId: id, senderJid: sender, fromMe: key.fromMe, isGroup, text, receivedAt },
  };
}
