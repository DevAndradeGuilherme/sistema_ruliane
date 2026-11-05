import { z } from 'zod';

/** Contrato INTERNO. O webhook real será normalizado pelo adapter Evolution homologado. */
export const inboundWhatsappMessageSchema = z.object({
  instanceName: z.string().min(1),
  providerMessageId: z.string().min(1),
  senderJid: z.string().min(1),
  fromMe: z.boolean(),
  isGroup: z.boolean(),
  text: z.string().nullable(),
  receivedAt: z.string(),
});
export type InboundWhatsappMessage = z.infer<typeof inboundWhatsappMessageSchema>;
