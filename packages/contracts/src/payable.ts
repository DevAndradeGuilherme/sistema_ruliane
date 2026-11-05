import { z } from 'zod';

export const moneyDecimalSchema = z.string().regex(/^\d+\.\d{2}$/, 'Use formato decimal 123.45');
export const civilDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const payableCreateSchema = z.object({
  description: z.string().trim().min(2).max(500),
  supplierId: z.uuid().optional(),
  amountExpected: moneyDecimalSchema,
  dueDate: civilDateSchema,
  plannedMethod: z.enum(['A_DEFINIR', 'BOLETO', 'CHEQUE', 'PIX', 'TRANSFERENCIA', 'DINHEIRO', 'OUTRO']).default('A_DEFINIR'),
  installmentNumber: z.int().min(1).optional(),
  installmentTotal: z.int().min(1).optional(),
  notes: z.string().max(3000).optional(),
}).refine((x) => x.installmentNumber === undefined || x.installmentTotal === undefined || x.installmentNumber <= x.installmentTotal,
  'Parcela não pode exceder total');

export type PayableCreate = z.infer<typeof payableCreateSchema>;
