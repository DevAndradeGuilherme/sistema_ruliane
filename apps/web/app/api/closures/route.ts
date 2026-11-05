import { NextResponse } from 'next/server';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
import { actor, responseError } from '@/src/api';
import { closuresPageSchema, validatedJson } from '@/src/response-contracts';

const query = z.object({ date: z.iso.date().optional(), operator: z.string().trim().max(120).optional(),
  reviewStatus: z.enum(['PROCESSADO', 'PENDENTE_REVISAO', 'REJEITADO']).optional(), page: z.coerce.number().int().min(1).default(1) });
export async function GET(req: Request) {
  try {
    const a = await actor();
    const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    const where = { organizationId: a.organizationId, businessDate: q.date ? new Date(`${q.date}T00:00:00Z`) : undefined,
      operatorName: q.operator ? { contains: q.operator, mode: 'insensitive' as const } : undefined, reviewStatus: q.reviewStatus };
    const [items, total] = await prisma.$transaction([
      prisma.cashClosure.findMany({ where, orderBy: [{ closedAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * 50, take: 50 }),
      prisma.cashClosure.count({ where }),
    ]);
    return validatedJson(closuresPageSchema, { items: items.map(c => ({
      id: c.id, closureNumber: c.closureNumber, terminal: c.terminal, businessDate: c.businessDate.toISOString().slice(0, 10),
      closedAt: c.closedAt.toISOString(), operatorName: c.operatorName, reportedCloseTotal: c.reportedCloseTotal?.toFixed(2) ?? null,
      calculatedReportTotal: c.calculatedReportTotal?.toFixed(2) ?? null, reportedVariance: c.reportedVariance?.toFixed(2) ?? null,
      calculatedVariance: c.calculatedVariance?.toFixed(2) ?? null, reportedCashNet: c.reportedCashNet?.toFixed(2) ?? null,
      reviewStatus: c.reviewStatus,
    })), total, page: q.page, pageSize: 50 });
  } catch (error) { return responseError(error); }
}
