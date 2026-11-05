/** Tipos e erros do adapter Evolution API (v2.3.7). Sem dependências externas. */

export type EvolutionErrorKind =
  | 'timeout' // sem resposta no prazo
  | 'network' // falha de transporte
  | 'auth' // 401/403 da Evolution (api key inválida)
  | 'http' // outro status não-2xx
  | 'invalid_response' // corpo fora do formato esperado
  | 'send_disabled'; // envio não habilitado explicitamente

/**
 * Erro do adapter. Nunca carrega apikey, URL com credenciais, corpo da requisição ou conteúdo
 * de mensagem — somente metadados seguros para log.
 */
export class EvolutionError extends Error {
  readonly kind: EvolutionErrorKind;
  readonly status: number | undefined;
  /** true quando repetir a MESMA chamada é seguro (somente leituras). */
  readonly retryable: boolean;
  /** true quando o envio pode ter sido realizado apesar do erro (timeout/rede após enviar). */
  readonly outcomeUnknown: boolean;

  constructor(
    kind: EvolutionErrorKind,
    message: string,
    opts: { status?: number; retryable?: boolean; outcomeUnknown?: boolean } = {},
  ) {
    super(message);
    this.name = 'EvolutionError';
    this.kind = kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.outcomeUnknown = opts.outcomeUnknown ?? false;
  }
}

/** Subconjunto estrutural de `fetch`; permite injetar mocks e evita dependência de DOM lib. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

export type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';

/** Mensagem recebida normalizada. Compatível com `InboundWhatsappMessage` (packages/contracts). */
export interface NormalizedInboundMessage {
  instanceName: string;
  providerMessageId: string;
  senderJid: string;
  fromMe: boolean;
  isGroup: boolean;
  text: string | null;
  /** ISO-8601 UTC derivado de `messageTimestamp` do provedor. */
  receivedAt: string;
}

export type SenderRole = 'FINANCEIRO' | 'PROPRIETARIA';

export interface AllowedSender {
  jid: string;
  role: SenderRole;
}
