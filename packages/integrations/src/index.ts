/** Portas estáveis; adapters de rede serão implementados depois da homologação. */
export interface WhatsAppSender {
  sendText(input: { recipientJid: string; text: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>;
  connectionStatus(): Promise<'connected' | 'disconnected' | 'unknown'>;
}

export interface DocumentStorage {
  putPrivate(input: { key: string; bytes: Uint8Array; contentType: string }): Promise<void>;
  getPrivate(key: string): Promise<Uint8Array>;
}

/** Apenas consultas autorizadas ao domínio; NUNCA acesso SQL genérico. */
export interface ReadOnlyFinanceTools {
  listPayables(input: { organizationId: string; from: string; to: string; limit: number }): Promise<unknown>;
  summarizeClosures(input: { organizationId: string; from: string; to: string }): Promise<unknown>;
}

export * from "./evolution/index.ts";
