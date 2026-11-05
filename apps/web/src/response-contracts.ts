import { z } from 'zod';
import { normalizedClosureSchema } from '@financeiro/contracts';
export function validatedJson<T extends z.ZodType>(schema: T, data: unknown): Response { return Response.json(schema.parse(data)); }

const money = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/);
const civil = z.iso.date();
const timestamp = z.iso.datetime({ offset: true });
const pagination = { total: z.number().int().nonnegative(), page: z.number().int().min(1), pageSize: z.literal(50) };
const payableStatus = z.enum(['ABERTA', 'PARCIALMENTE_PAGA', 'PAGA', 'CANCELADA']);
const payableItem = z.object({ id: z.uuid(), description: z.string(), supplier: z.string().nullable(), dueDate: civil,
  amountExpected: money, balance: money, status: payableStatus, installmentNumber: z.number().int().nullable() });
export const payablesPageSchema = z.object({ items: z.array(payableItem), ...pagination });
const payment = z.object({ id: z.uuid(), amount: money, paidAt: timestamp, method: z.string(), externalRef: z.string().nullable(), cashMovementId: z.uuid().nullable() });
export const payableDetailSchema = z.object({ id: z.uuid(), description: z.string(), supplier: z.string().nullable(), amountExpected: money,
  balance: money, dueDate: civil, status: payableStatus, plannedMethod: z.string(), notes: z.string().nullable(),
  installmentNumber: z.number().int().nullable(), installments: z.array(z.object({ id: z.uuid(), installmentNumber: z.number().int().nullable(),
    dueDate: civil, amountExpected: money, balance: money, status: payableStatus })), payments: z.array(payment) });
const closureItem = z.object({ id: z.uuid(), closureNumber: z.string(), terminal: z.string(), businessDate: civil, closedAt: timestamp,
  operatorName: z.string().nullable(), reportedCloseTotal: money.nullable(), calculatedReportTotal: money.nullable(),
  reportedVariance: money.nullable(), calculatedVariance: money.nullable(), reportedCashNet: money.nullable(),
  reviewStatus: z.enum(['PROCESSADO', 'PENDENTE_REVISAO', 'REJEITADO']) });
export const closuresPageSchema = z.object({ items: z.array(closureItem), ...pagination });
export const closureDetailSchema = closureItem.extend({ parserVersion: z.string().nullable(), normalized: normalizedClosureSchema.nullable(),
  lines: z.array(z.object({ section: z.string(), ordinal: z.number().int(), labelRaw: z.string(), methodNormalized: z.string().nullable(), amount: money })),
  movements: z.array(z.object({ id: z.uuid(), kind: z.string(), sourceOrdinal: z.number().int(), descriptionRaw: z.string(), amount: money, classification: z.string() })),
  issues: z.array(z.object({ code: z.string(), severity: z.string(), expected: z.string().nullable(), observed: z.string().nullable() })) });
export const cashMovementsPageSchema = z.object({ items: z.array(z.object({ id: z.uuid(), closureNumber: z.string(), businessDate: civil,
  descriptionRaw: z.string(), amount: money, classification: z.string(), paymentId: z.uuid().nullable(), expenseId: z.uuid().nullable() })), ...pagination });
export const reviewIssuesPageSchema = z.object({ items: z.array(z.object({ id: z.uuid(), recordType: z.string().nullable(), recordId: z.string().nullable(),
  closureId: z.uuid().nullable(), closureNumber: z.string().nullable(), businessDate: civil.nullable(), code: z.string(), severity: z.string(),
  expected: z.string().nullable(), observed: z.string().nullable(), note: z.string().nullable(), resolvedAt: timestamp.nullable(),
  reportedCloseTotal: money.nullable(), calculatedReportTotal: money.nullable(), reportedVariance: money.nullable(), createdAt: timestamp })), ...pagination });
const nextDue = z.object({ id: z.uuid(), description: z.string(), supplier: z.string().nullable(), dueDate: civil,
  status: z.enum(['ABERTA', 'PARCIALMENTE_PAGA']), balance: money });
export const summaryResponseSchema = z.object({
  period: z.object({ from: civil, to: civil, timezone: z.literal('America/Sao_Paulo') }),
  pdv: z.object({ nature: z.literal('VALOR_FECHAMENTO_IMPRESSO'), amount: money.nullable(), closureCount: z.number().int().nonnegative(),
    includedClosures: z.number().int().nonnegative(), missingTotals: z.number().int().nonnegative(), reviewPending: z.number().int().nonnegative(),
    coverage: z.enum(['UNKNOWN', 'REVIEW_REQUIRED']) }),
  expenses: z.object({ nature: z.literal('DESPESAS_REGISTRADAS'), amount: money, count: z.number().int().nonnegative(),
    byOrigin: z.object({ SANGRIA: money, PAGAMENTO_CONTA: money, MANUAL: money }) }),
  pendingPayables: z.object({ nature: z.literal('SALDO_DE_CONTAS_ABERTAS'), amount: money, count: z.number().int().nonnegative(), nextDue: z.array(nextDue).max(10) }),
  reviewIssues: z.object({ pending: z.number().int().nonnegative() }), limitations: z.array(z.string()),
});
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;
