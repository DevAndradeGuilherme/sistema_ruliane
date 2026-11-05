import { NextResponse } from 'next/server';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
import { actor, responseError, ApiError } from '@/src/api';
import { closureDetailSchema, validatedJson } from '@/src/response-contracts';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const a = await actor();
    const id = z.uuid().parse((await ctx.params).id);
    const c = await prisma.cashClosure.findFirst({ where: { id, organizationId: a.organizationId }, include: {
      lines: { orderBy: [{ section: 'asc' }, { ordinal: 'asc' }] }, movements: true, issues: true,
    } });
    if (!c) throw new ApiError(404, 'Fechamento não encontrado');
    const job = await prisma.importJob.findFirst({ where: { documentId: c.documentId }, orderBy: { createdAt: 'desc' }, select: { parserVersion: true, payload: true } });
    return validatedJson(closureDetailSchema, {
      id: c.id, closureNumber: c.closureNumber, terminal: c.terminal, businessDate: c.businessDate.toISOString().slice(0, 10),
      closedAt: c.closedAt.toISOString(), operatorName: c.operatorName, reviewStatus: c.reviewStatus,
      reportedCloseTotal: c.reportedCloseTotal?.toFixed(2) ?? null, calculatedReportTotal: c.calculatedReportTotal?.toFixed(2) ?? null,
      reportedVariance: c.reportedVariance?.toFixed(2) ?? null, calculatedVariance: c.calculatedVariance?.toFixed(2) ?? null,
      reportedCashNet: c.reportedCashNet?.toFixed(2) ?? null, parserVersion: job?.parserVersion ?? null, normalized: job?.payload ?? null,
      lines: c.lines.map(x => ({ section: x.section, ordinal: x.ordinal, labelRaw: x.labelRaw, methodNormalized: x.methodNormalized, amount: x.amount.toFixed(2) })),
      movements: c.movements.map(x => ({ id: x.id, kind: x.kind, sourceOrdinal: x.sourceOrdinal, descriptionRaw: x.descriptionRaw, amount: x.amount.toFixed(2), classification: x.classification })),
      issues: c.issues.map(x => ({ code: x.code, severity: x.severity, expected: x.expected, observed: x.observed })),
    });
  } catch (error) { return responseError(error); }
}
