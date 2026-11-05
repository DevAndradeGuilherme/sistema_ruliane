import type { EvolutionClient } from './client.ts';
import type { ConnectionStatus } from './types.ts';

/** Implementa a porta `WhatsAppSender` (packages/integrations/src/index.ts) sem acoplá-la. */
export class EvolutionWhatsAppSender {
  private readonly client: EvolutionClient;

  constructor(client: EvolutionClient) {
    this.client = client;
  }

  /**
   * `idempotencyKey` pertence ao chamador (ledger de envios na camada web/worker): o adapter não
   * repete envios e a Evolution não deduplica. Resultado = aceito pela API, não entregue.
   */
  async sendText(input: { recipientJid: string; text: string; idempotencyKey: string }): Promise<{ providerMessageId: string }> {
    if (!input.idempotencyKey) throw new Error('idempotencyKey obrigatória');
    const number = input.recipientJid.replace(/@s\.whatsapp\.net$/, '');
    const { providerMessageId } = await this.client.sendText({ number, text: input.text });
    return { providerMessageId };
  }

  connectionStatus(): Promise<ConnectionStatus> {
    return this.client.getConnectionStatus();
  }
}
