import { createHash } from 'node:crypto';
import type { InboundDedupStore } from './dedup.ts';
import { canonicalJid, normalizeMessagesUpsert } from './normalize.ts';
import { checkWebhookSecret, getHeader } from './webhook-auth.ts';
import type { AllowedSender, NormalizedInboundMessage, SenderRole } from './types.ts';

export type IgnoreReason =
  | 'unsupported_event'
  | 'from_me'
  | 'group_or_broadcast'
  | 'sender_not_allowed'
  | 'stale_message'
  | 'duplicate';

export type RejectReason =
  | 'secret_not_configured'
  | 'secret_missing'
  | 'secret_mismatch'
  | 'invalid_body'
  | 'invalid_shape'
  | 'invalid_timestamp'
  | 'wrong_instance';

export type WebhookOutcome =
  | {
      kind: 'accepted';
      httpStatus: 200;
      message: NormalizedInboundMessage;
      role: SenderRole;
      /** Chamar após persistir/enfileirar o efeito. Mantém a deduplicação definitiva. */
      complete(): Promise<void>;
      /** Chamar se falhou ANTES de qualquer efeito; permite o retry do provedor. */
      release(): Promise<void>;
    }
  | { kind: 'ignored'; httpStatus: 200; reason: IgnoreReason }
  | { kind: 'rejected'; httpStatus: 400 | 401 | 403 | 503; reason: RejectReason };

/** Log sem conteúdo sensível: apenas códigos, contadores e identificadores mascarados. */
export interface WebhookLogger {
  info(event: string, fields: Record<string, string | number | boolean>): void;
}

export interface WebhookProcessorConfig {
  /** EVOLUTION_WEBHOOK_SECRET (+ opcionalmente o próximo segredo durante rotação). Ausente/curto ⇒ todas as requisições são rejeitadas (503). */
  expectedSecret: string | readonly (string | undefined)[] | undefined;
  instanceName: string;
  /** Lista vazia ⇒ ninguém autorizado. */
  allowedSenders: readonly AllowedSender[];
  dedup: InboundDedupStore;
  now?: () => number;
  /** Idade máxima aceita. Padrão 10 min. Complementa — não substitui — a deduplicação persistente. */
  maxMessageAgeMs?: number;
  /** Tolerância a relógio adiantado. Padrão 2 min. */
  maxFutureSkewMs?: number;
  logger?: WebhookLogger;
}

export function maskJid(jid: string): string {
  const [user = '', server = ''] = jid.split('@');
  return `${user.slice(0, 4)}***${user.slice(-2)}@${server}`;
}

const shortHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8);

/** Monta a allowlist a partir de FINANCEIRO_WHATSAPP_JID / PROPRIETARIA_WHATSAPP_JID (vazios são ignorados). */
export function allowlistFromEnv(env: Record<string, string | undefined>): AllowedSender[] {
  const out: AllowedSender[] = [];
  const f = env.FINANCEIRO_WHATSAPP_JID?.trim();
  const p = env.PROPRIETARIA_WHATSAPP_JID?.trim();
  if (f) out.push({ jid: canonicalJid(f), role: 'FINANCEIRO' });
  if (p) out.push({ jid: canonicalJid(p), role: 'PROPRIETARIA' });
  return out;
}

/**
 * Pipeline: segredo → normalização → instância → fromMe/grupo → allowlist → idade → claim persistente.
 * O claim vem por último para que remetentes não autorizados jamais ocupem a tabela de deduplicação.
 * O handler HTTP (apps/web) deve responder `httpStatus` e chamar `complete()`/`release()`.
 */
export function createWebhookProcessor(cfg: WebhookProcessorConfig) {
  const now = cfg.now ?? Date.now;
  const maxAge = cfg.maxMessageAgeMs ?? 10 * 60_000;
  const maxFuture = cfg.maxFutureSkewMs ?? 2 * 60_000;
  const log = cfg.logger?.info.bind(cfg.logger) ?? (() => {});
  const allowed = new Map(cfg.allowedSenders.map((s) => [canonicalJid(s.jid), s.role]));

  const reject = (httpStatus: 400 | 401 | 403 | 503, reason: RejectReason): WebhookOutcome => {
    log('evolution.webhook.rejected', { reason, httpStatus });
    return { kind: 'rejected', httpStatus, reason };
  };
  const ignore = (reason: IgnoreReason, extra: Record<string, string | number | boolean> = {}): WebhookOutcome => {
    log('evolution.webhook.ignored', { reason, ...extra });
    return { kind: 'ignored', httpStatus: 200, reason };
  };

  return {
    async handle(req: { headers: Record<string, string | string[] | undefined>; body: unknown }): Promise<WebhookOutcome> {
      const auth = checkWebhookSecret(getHeader(req.headers, 'x-webhook-secret'), cfg.expectedSecret);
      if (auth === 'not_configured') return reject(503, 'secret_not_configured');
      if (auth === 'missing') return reject(401, 'secret_missing');
      if (auth === 'mismatch') return reject(401, 'secret_mismatch');

      const n = normalizeMessagesUpsert(req.body);
      if (!n.ok) {
        if (n.reason === 'unsupported_event') return ignore('unsupported_event');
        return reject(400, n.reason);
      }
      const m = n.message;
      if (m.instanceName !== cfg.instanceName) return reject(403, 'wrong_instance');
      if (m.fromMe) return ignore('from_me');
      if (m.isGroup) return ignore('group_or_broadcast');

      const role = allowed.get(m.senderJid);
      if (!role) return ignore('sender_not_allowed', { sender: maskJid(m.senderJid) });

      const age = now() - Date.parse(m.receivedAt);
      if (age > maxAge || age < -maxFuture) return ignore('stale_message', { ageSeconds: Math.round(age / 1000) });

      const key = { instanceName: m.instanceName, providerMessageId: m.providerMessageId };
      const claim = await cfg.dedup.claim(key, { receivedAt: m.receivedAt });
      if (claim === 'duplicate') return ignore('duplicate', { msg: shortHash(m.providerMessageId) });

      log('evolution.webhook.accepted', { role, sender: maskJid(m.senderJid), msg: shortHash(m.providerMessageId) });
      return {
        kind: 'accepted',
        httpStatus: 200,
        message: m,
        role,
        complete: () => cfg.dedup.complete(key),
        release: () => cfg.dedup.release(key),
      };
    },
  };
}
