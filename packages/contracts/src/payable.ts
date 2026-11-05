import { z } from 'zod';

export const moneyDecimalSchema = z.string().regex(/^(?:0|[1-9]\d{0,11})\.\d{2}$/, 'Use formato decimal 123.45 até DECIMAL(14,2)');
export const positiveMoneyDecimalSchema = moneyDecimalSchema.refine((value) => value !== '0.00', 'Valor deve ser positivo');
export const civilDateSchema = z.iso.date();

export const payableCreateSchema = z.object({
  description: z.string().trim().min(2).max(500),
  supplierId: z.uuid().optional(),
  amountExpected: positiveMoneyDecimalSchema,
  dueDate: civilDateSchema,
  plannedMethod: z.enum(['A_DEFINIR', 'BOLETO', 'CHEQUE', 'PIX', 'TRANSFERENCIA', 'DINHEIRO', 'OUTRO']).default('A_DEFINIR'),
  installmentNumber: z.int().min(1).optional(),
  installmentTotal: z.int().min(1).optional(),
  notes: z.string().max(3000).optional(),
}).refine((x) => x.installmentNumber === undefined || x.installmentTotal === undefined || x.installmentNumber <= x.installmentTotal,
  'Parcela não pode exceder total');

export type PayableCreate = z.infer<typeof payableCreateSchema>;

/** Pagamento é uma baixa da conta; sangria é uma movimentação do caixa. */
export const payablePaymentCreateSchema = z.object({
  payableId: z.uuid(),
  amount: positiveMoneyDecimalSchema,
  paidAt: z.iso.datetime({ offset: true }),
  method: z.enum(['BOLETO', 'CHEQUE', 'PIX', 'TRANSFERENCIA', 'DINHEIRO', 'OUTRO']),
  externalRef: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  cashMovementId: z.uuid().optional(),
});
export type PayablePaymentCreate = z.infer<typeof payablePaymentCreateSchema>;
