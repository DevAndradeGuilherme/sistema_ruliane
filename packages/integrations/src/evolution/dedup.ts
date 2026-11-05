/**
 * PORTA de deduplicação persistente. A implementação de produção pertence à camada web/worker
 * (banco compartilhado entre réplicas) e NÃO é feita neste adapter. Contrato exigido:
 *
 *  - Unicidade `(instance_name, provider_message_id)` garantida pelo BANCO
 *    (`INSERT ... ON CONFLICT DO NOTHING` + checagem de linhas afetadas); nunca "SELECT depois INSERT".
 *  - `claim` é atômico entre réplicas: de N chamadas concorrentes para a mesma chave, exatamente
 *    uma retorna `'claimed'`.
 *  - Estados: `processing` (com lease) → `done`. Claim em `processing` com lease expirado pode ser
 *    reassumido por outra réplica (recupera crash entre claim e processamento).
 *  - `release` só apaga a chave se ainda `processing` e pertencente ao chamador (falha ANTES de efeito colateral).
 *  - Retenção das chaves `done` >= 7 dias (muito maior que `maxMessageAgeMs`), para que uma chave
 *    expurgada já esteja fora da janela de idade aceita e seja barrada por `stale_message`.
 *  - Persistir apenas: instance_name, provider_message_id, received_at, state, claimed_at. Nunca o texto.
 */
export interface DedupKey {
  instanceName: string;
  providerMessageId: string;
}

export interface InboundDedupStore {
  claim(key: DedupKey, meta: { receivedAt: string }): Promise<'claimed' | 'duplicate'>;
  /** Marca como processada de forma definitiva. */
  complete(key: DedupKey): Promise<void>;
  /** Libera o claim após falha antes de efeitos colaterais, permitindo o retry do provedor. */
  release(key: DedupKey): Promise<void>;
}

/**
 * Implementação EM MEMÓRIA — apenas testes/desenvolvimento local. NÃO protege múltiplas réplicas
 * nem sobrevive a restart; não usar em produção.
 */
export class InMemoryDedupStore implements InboundDedupStore {
  private readonly rows = new Map<string, { state: 'processing' | 'done'; claimedAt: number }>();
  private readonly leaseMs: number;
  private readonly now: () => number;

  constructor(opts: { leaseMs?: number; now?: () => number } = {}) {
    this.leaseMs = opts.leaseMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  private k(key: DedupKey): string {
    return JSON.stringify([key.instanceName, key.providerMessageId]);
  }

  async claim(key: DedupKey): Promise<'claimed' | 'duplicate'> {
    const id = this.k(key);
    const row = this.rows.get(id);
    const t = this.now();
    if (row && (row.state === 'done' || t - row.claimedAt < this.leaseMs)) return 'duplicate';
    this.rows.set(id, { state: 'processing', claimedAt: t }); // síncrono: sem await entre leitura e escrita
    return 'claimed';
  }

  async complete(key: DedupKey): Promise<void> {
    const row = this.rows.get(this.k(key));
    if (row) row.state = 'done';
  }

  async release(key: DedupKey): Promise<void> {
    const id = this.k(key);
    if (this.rows.get(id)?.state === 'processing') this.rows.delete(id);
  }
}
