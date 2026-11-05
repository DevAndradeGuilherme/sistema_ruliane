import { NextResponse } from 'next/server';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
import { actor, responseError } from '@/src/api';
import { cashMovementsPageSchema, validatedJson } from '@/src/response-contracts';

const query = z.object({ classification: z.enum(['DESPESA_OPERACIONAL', 'DEVOLUCAO_CLIENTE', 'ADIANTAMENTO', 'RETIRADA_INTERNA', 'OUTROS', 'NAO_CLASSIFICADA']).optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(), page: z.coerce.number().int().min(1).default(1) });
export async function GET(req: Request) {
  try {
    const a = await actor();
    const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    const where = { organizationId: a.organizationId, kind: 'SANGRIA' as const, classification: q.classification,
      closure: q.from || q.to ? { businessDate: { gte: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined,
        lte: q.to ? new Date(`${q.to}T00:00:00Z`) : undefined } } : undefined };
    const [items, total] = await prisma.$transaction([
      prisma.cashMovement.findMany({ where, include: { closure: { select: { businessDate: true, closureNumber: true } }, payment: { select: { id: true } }, expense: { select: { id: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * 50, take: 50 }),
      prisma.cashMovement.count({ where }),
    ]);
    return validatedJson(cashMovementsPageSchema, { items: items.map(x => ({ id: x.id, closureNumber: x.closure.closureNumber,
      businessDate: x.closure.businessDate.toISOString().slice(0, 10), descriptionRaw: x.descriptionRaw,
      amount: x.amount.toFixed(2), classification: x.classification, paymentId: x.payment?.id ?? null,
      expenseId: x.expense?.id ?? null })), total, page: q.page, pageSize: 50 });
  } catch (error) { return responseError(error); }
}
