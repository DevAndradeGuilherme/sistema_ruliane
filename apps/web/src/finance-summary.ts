import { prisma } from '@financeiro/db';
import { centsToDecimalString, decimalStringToCents } from '@financeiro/domain';
import { z } from 'zod';
import { ApiError, type Actor } from './errors.ts';
import { summaryResponseSchema } from './response-contracts.ts';

const periodSchema = z.object({ from: z.iso.date(), to: z.iso.date() });
export async function financeSummary(actor: Actor, raw: unknown) {
  const period = periodSchema.parse(raw);
  if (period.from > period.to) throw new ApiError(400, 'Período inválido');
  const from = new Date(`${period.from}T00:00:00Z`), to = new Date(`${period.to}T00:00:00Z`);
  const [closures, expenses, payables, reviewCount] = await Promise.all([
    prisma.cashClosure.findMany({ where: { organizationId: actor.organizationId, businessDate: { gte: from, lte: to } }, select: { reportedCloseTotal: true, reviewStatus: true, reportedVariance: true } }),
    prisma.$queryRaw<Array<{ amount: { toFixed(digits: number): string }; origin: string }>>`
      SELECT "amount", "origin"::text AS origin FROM "Expense"
      WHERE "organizationId"=${actor.organizationId}::uuid AND "voidedAt" IS NULL
        AND ("occurredAt" AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${period.from}::date AND ${period.to}::date`,
    prisma.payable.findMany({ where: { organizationId: actor.organizationId, status: { in: ['ABERTA', 'PARCIALMENTE_PAGA'] } },
      include: { supplier: { select: { name: true } }, payments: { where: { voidedAt: null }, select: { amount: true } } }, orderBy: { dueDate: 'asc' } }),
    prisma.reviewIssue.count({ where: { organizationId: actor.organizationId, resolvedAt: null, closure: { businessDate: { gte: from, lte: to } } } }),
  ]);
  const sum = (values: string[]) => centsToDecimalString(values.reduce((acc, value) => acc + decimalStringToCents(value), 0n));
  const totals = closures.filter(x => x.reportedCloseTotal !== null).map(x => x.reportedCloseTotal!.toFixed(2));
  const expenseByOrigin = Object.fromEntries(['SANGRIA', 'PAGAMENTO_CONTA', 'MANUAL'].map(origin => [origin, sum(expenses.filter(x => x.origin === origin).map(x => x.amount.toFixed(2)))]));
  const pending = payables.map(p => ({ id: p.id, description: p.description, supplier: p.supplier?.name ?? null,
    dueDate: p.dueDate.toISOString().slice(0, 10), status: p.status, balance: centsToDecimalString(decimalStringToCents(p.amountExpected.toFixed(2)) - p.payments.reduce((v, x) => v + decimalStringToCents(x.amount.toFixed(2)), 0n)) }));
  const reviewPending = closures.filter(x => x.reviewStatus !== 'PROCESSADO').length;
  return summaryResponseSchema.parse({
    period: { ...period, timezone: 'America/Sao_Paulo' },
    pdv: { nature: 'VALOR_FECHAMENTO_IMPRESSO', amount: totals.length ? sum(totals) : null,
      closureCount: closures.length, includedClosures: totals.length, missingTotals: closures.length - totals.length,
      reviewPending, coverage: reviewPending || totals.length !== closures.length ? 'REVIEW_REQUIRED' : 'UNKNOWN' },
    expenses: { nature: 'DESPESAS_REGISTRADAS', amount: sum(expenses.map(x => x.amount.toFixed(2))), count: expenses.length, byOrigin: expenseByOrigin },
    pendingPayables: { nature: 'SALDO_DE_CONTAS_ABERTAS', amount: sum(pending.map(x => x.balance)), count: pending.length, nextDue: pending.slice(0, 10) },
    reviewIssues: { pending: reviewCount },
    limitations: ['Cobertura dos turnos não confirmada', 'Valores do PDV não representam saldo bancário', ...(reviewPending || totals.length !== closures.length ? ['Fechamentos pendentes ou com valores ausentes'] : [])],
  });
}
