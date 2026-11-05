import { createHash, timingSafeEqual } from 'node:crypto';

export type SecretCheck = 'ok' | 'not_configured' | 'missing' | 'mismatch';

/** Segredos curtos são rejeitados na configuração (fail-closed). */
export const MIN_SECRET_LENGTH = 32;

/**
 * Valida o cabeçalho `X-Webhook-Secret` (mecanismo real do webhook já cadastrado: segredo estático
 * em header, sem HMAC do corpo). Compara digests SHA-256 com `timingSafeEqual`, de modo que o
 * tempo não depende do comprimento nem do prefixo correto.
 */
export function checkWebhookSecret(
  provided: string | readonly string[] | undefined,
  expected: string | readonly (string | undefined)[] | undefined,
): SecretCheck {
  // Vários segredos válidos permitem rotação sem janela de indisponibilidade (atual + próximo).
  const valid = (Array.isArray(expected) ? expected : [expected]).filter(
    (s): s is string => typeof s === 'string' && s.length >= MIN_SECRET_LENGTH,
  );
  if (valid.length === 0) return 'not_configured';
  if (typeof provided !== 'string' || provided.length === 0) return 'missing'; // arrays/duplicados = inválido
  const a = createHash('sha256').update(provided).digest();
  let match = false;
  for (const s of valid) {
    // sem curto-circuito: o tempo não revela qual segredo (ou se algum) casou
    if (timingSafeEqual(a, createHash('sha256').update(s).digest())) match = true;
  }
  return match ? 'ok' : 'mismatch';
}

/** Busca cabeçalho sem diferenciar maiúsculas (Node entrega minúsculas; outros runtimes não). */
export function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | string[] | undefined {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) return headers[k];
  return undefined;
}
