import { NextResponse } from 'next/server';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
import { actor, responseError } from '@/src/api';
import { reviewIssuesPageSchema, validatedJson } from '@/src/response-contracts';

const query = z.object({ page: z.coerce.number().int().min(1).default(1), pendingOnly: z.enum(['true', 'false']).default('true') });
export async function GET(req: Request) {
  try {
    const a = await actor();
    const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    const where = { organizationId: a.organizationId, resolvedAt: q.pendingOnly === 'true' ? null : undefined };
    const [items, total] = await prisma.$transaction([
      prisma.reviewIssue.findMany({ where, include: { closure: { select: { businessDate: true, closureNumber: true, reportedCloseTotal: true, calculatedReportTotal: true, reportedVariance: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * 50, take: 50 }),
      prisma.reviewIssue.count({ where }),
    ]);
    return validatedJson(reviewIssuesPageSchema, { items: items.map(x => ({ id: x.id, recordType: x.recordType, recordId: x.recordId,
      closureId: x.closureId, closureNumber: x.closure?.closureNumber ?? null,
      businessDate: x.closure?.businessDate.toISOString().slice(0, 10) ?? null, code: x.code, severity: x.severity,
      expected: x.expected, observed: x.observed, note: x.note, resolvedAt: x.resolvedAt?.toISOString() ?? null,
      reportedCloseTotal: x.closure?.reportedCloseTotal?.toFixed(2) ?? null,
      calculatedReportTotal: x.closure?.calculatedReportTotal?.toFixed(2) ?? null,
      reportedVariance: x.closure?.reportedVariance?.toFixed(2) ?? null,
      createdAt: x.createdAt.toISOString() })), total, page: q.page, pageSize: 50 });
  } catch (error) { return responseError(error); }
}
