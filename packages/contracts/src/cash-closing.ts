import { z } from 'zod';

const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,11})\.\d{2}$/).nullable();
const rawEntry = z.object({ labelRaw: z.string().min(1), amount: decimal });

/** Resultado normalizado de extrator local ou de extração visual OpenAI.
 * Campo ausente = null, nunca número inventado. */
export const normalizedClosureSchema = z.object({
  parserVersion: z.string().min(1),
  number: z.string().nullable(),
  terminal: z.string().nullable(),
  operatorCode: z.string().nullable(),
  operatorName: z.string().nullable(),
  openedAtLocal: z.iso.datetime({ local: true }).nullable(),
  closedAtLocal: z.iso.datetime({ local: true }).nullable(),
  statusRaw: z.string().nullable(),
  summary: z.object({
    cashNet: decimal,
    credit: decimal,
    debit: decimal,
    due: decimal,
    pixTransfer: decimal,
    reportedCloseTotal: decimal,
  }),
  detail: z.object({
    cashSales: decimal,
    cashWithdrawalsTotal: decimal,
    cashNet: decimal,
    otherEntries: z.array(rawEntry),
    otherEntriesTotal: decimal,
    calculatedReportTotalPrinted: decimal,
    variancePrinted: decimal,
    smartTefTotal: decimal,
    smartTefLines: z.array(rawEntry),
  }),
  withdrawals: z.array(rawEntry),
  validationWarnings: z.array(z.string()),
});
export type NormalizedClosure = z.infer<typeof normalizedClosureSchema>;
