/** Filas futuras; rotas web podem enfileirar somente após o registro da importação no banco. */
export const QUEUE_NAMES = {
  cashClosures: 'cash-closures',
  dailyReminders: 'daily-reminders',
  whatsappInbound: 'whatsapp-inbound',
} as const;
