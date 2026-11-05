import { EvolutionError } from './types.ts';
import type { ConnectionStatus, FetchLike } from './types.ts';

export interface EvolutionClientConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  fetch: FetchLike;
  /** Timeout por tentativa. Padrão 8s. */
  timeoutMs?: number;
  /** Retentativas extras SOMENTE para leituras (GET). Padrão 2. */
  maxReadRetries?: number;
  retryBaseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Trava de segurança: sem `true` explícito `sendText` NUNCA chama a rede.
   * A habilitação real depende de aprovação do responsável.
   */
  sendEnabled?: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class EvolutionClient {
  private readonly cfg: Required<Omit<EvolutionClientConfig, 'fetch'>> & { fetch: FetchLike };

  constructor(cfg: EvolutionClientConfig) {
    if (!cfg.apiKey) throw new EvolutionError('auth', 'EVOLUTION_API_KEY não configurada');
    if (!cfg.instanceName) throw new EvolutionError('invalid_response', 'Instância não configurada');
    this.cfg = {
      ...cfg,
      baseUrl: cfg.baseUrl.replace(/\/+$/, ''),
      timeoutMs: cfg.timeoutMs ?? 8000,
      maxReadRetries: cfg.maxReadRetries ?? 2,
      retryBaseDelayMs: cfg.retryBaseDelayMs ?? 250,
      sleep: cfg.sleep ?? defaultSleep,
      sendEnabled: cfg.sendEnabled ?? false,
    };
  }

  /** GET /instance/connectionState/{instance} — somente leitura. */
  async getConnectionStatus(): Promise<ConnectionStatus> {
    const body = await this.request('GET', `/instance/connectionState/${encodeURIComponent(this.cfg.instanceName)}`);
    const state = (body as { instance?: { state?: unknown } } | null)?.instance?.state;
    if (typeof state !== 'string') return 'unknown';
    if (state === 'open') return 'connected';
    if (state === 'close' || state === 'connecting') return 'disconnected';
    return 'unknown';
  }

  /**
   * POST /message/sendText/{instance}. Sem retry automático: a Evolution não oferece chave de
   * idempotência, então repetir pode duplicar a mensagem. `accepted` significa "aceita pela API",
   * NÃO entrega nem leitura.
   */
  async sendText(input: { number: string; text: string }): Promise<{ providerMessageId: string; status: 'accepted' }> {
    if (!this.cfg.sendEnabled) {
      throw new EvolutionError('send_disabled', 'Envio desabilitado (sendEnabled=false); nenhuma chamada de rede feita');
    }
    const body = await this.request(
      'POST',
      `/message/sendText/${encodeURIComponent(this.cfg.instanceName)}`,
      { number: input.number, text: input.text },
      { retry: false },
    );
    const id = (body as { key?: { id?: unknown } } | null)?.key?.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new EvolutionError('invalid_response', 'Resposta de envio sem key.id', { outcomeUnknown: true });
    }
    return { providerMessageId: id, status: 'accepted' };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
    opts: { retry?: boolean } = {},
  ): Promise<unknown> {
    const canRetry = (opts.retry ?? method === 'GET') && method === 'GET';
    const attempts = canRetry ? this.cfg.maxReadRetries + 1 : 1;
    let last: EvolutionError | undefined;
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.once(method, path, payload);
      } catch (e) {
        last = e as EvolutionError;
        if (!last.retryable || i === attempts - 1) throw last;
        await this.cfg.sleep(this.cfg.retryBaseDelayMs * 2 ** i);
      }
    }
    throw last!;
  }

  private async once(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    const isRead = method === 'GET';
    try {
      const init: Parameters<FetchLike>[1] = {
        method,
        headers: { apikey: this.cfg.apiKey, 'content-type': 'application/json' },
        signal: ctrl.signal,
      };
      if (payload !== undefined) init.body = JSON.stringify(payload);
      const res = await this.cfg.fetch(`${this.cfg.baseUrl}${path}`, init);
      const raw = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new EvolutionError('auth', `Evolution recusou a credencial (HTTP ${res.status})`, { status: res.status });
      }
      if (res.status < 200 || res.status >= 300) {
        const transient = res.status === 429 || res.status >= 500;
        throw new EvolutionError('http', `Evolution respondeu HTTP ${res.status}`, {
          status: res.status,
          retryable: isRead && transient,
          outcomeUnknown: !isRead && res.status >= 500,
        });
      }
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        throw new EvolutionError('invalid_response', 'Corpo da resposta não é JSON', { outcomeUnknown: !isRead });
      }
    } catch (e) {
      if (e instanceof EvolutionError) throw e;
      if (ctrl.signal.aborted) {
        throw new EvolutionError('timeout', `Timeout após ${this.cfg.timeoutMs}ms`, {
          retryable: isRead,
          outcomeUnknown: !isRead,
        });
      }
      // Não propagar a mensagem original: pode conter URL/host internos.
      throw new EvolutionError('network', 'Falha de rede ao chamar a Evolution', {
        retryable: isRead,
        outcomeUnknown: !isRead,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
