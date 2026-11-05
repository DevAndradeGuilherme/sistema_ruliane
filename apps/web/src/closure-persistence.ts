import { prisma, Prisma } from '@financeiro/db';
import { normalizedClosureSchema } from '@financeiro/contracts';
import { z } from 'zod';
import { ApiError, type Actor } from './errors.ts';

/** Called after a private upload and deterministic normalization. No public import endpoint exists yet. */
const requestSchema = z.object({
  normalized: normalizedClosureSchema,
  document: z.object({ filename: z.string().min(1), mimeType: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), storageKey: z.string().min(1) }),
  businessDate: z.iso.date(),
  closedAt: z.iso.datetime({ offset: true }),
  openedAt: z.iso.datetime({ offset: true }).nullable(),
  rawReportText: z.string().nullable().optional(),
});
export async function persistClosure(actor: Actor, raw: unknown) {
  if (actor.role !== 'FINANCEIRO') throw new ApiError(403, 'Acesso somente leitura');
  const input = requestSchema.parse(raw);
  const n = input.normalized;
  if (!n.number || !n.terminal || !n.closedAtLocal) throw new ApiError(422, 'Identidade do fechamento incompleta');
  if (n.closedAtLocal.slice(0, 10) !== input.closedAt.slice(0, 10)) throw new ApiError(422, 'Data local divergente');
  const businessDate = new Date(`${input.businessDate}T00:00:00Z`);
  const existing = await prisma.document.findUnique({ where: { organizationId_sha256: { organizationId: actor.organizationId, sha256: input.document.sha256 } }, include: { closure: true } });
  if (existing) return { repeated: true, closureId: existing.closure?.id ?? null, documentId: existing.id };
  const logical = await prisma.cashClosure.findUnique({ where: { organizationId_closureNumber_terminal_businessDate: { organizationId: actor.organizationId, closureNumber: n.number, terminal: n.terminal, businessDate } } });
  if (logical) throw new ApiError(409, 'Fechamento lógico já registrado com outro arquivo');
  try {
    return await prisma.$transaction(async tx => {
      const doc = await tx.document.create({ data: { organizationId: actor.organizationId, kind: 'FECHAMENTO_CAIXA', ...input.document, status: 'PENDENTE_REVISAO' } });
      const closure = await tx.cashClosure.create({ data: { organizationId: actor.organizationId, documentId: doc.id, closureNumber: n.number!, terminal: n.terminal!, businessDate,
        operatorCode: n.operatorCode, operatorName: n.operatorName, openedAt: input.openedAt ? new Date(input.openedAt) : null, closedAt: new Date(input.closedAt),
        statusRaw: n.statusRaw, rawReportText: input.rawReportText, reportedCloseTotal: n.summary.reportedCloseTotal, calculatedReportTotal: n.detail.calculatedReportTotalPrinted,
        reportedVariance: n.detail.variancePrinted, reportedCashNet: n.summary.cashNet, reviewStatus: 'PENDENTE_REVISAO',
      } });
      const summary = [['Dinheiro', n.summary.cashNet], ['Crédito', n.summary.credit], ['Débito', n.summary.debit], ['Vencimento', n.summary.due], ['Transferência Pix', n.summary.pixTransfer]] as const;
      for (const [ordinal, [labelRaw, value]] of summary.entries()) if (value !== null) await tx.cashClosureLine.create({ data: { closureId: closure.id, section: 'SUMMARY', ordinal, labelRaw, amount: value } });
      for (const [ordinal, line] of n.detail.otherEntries.entries()) if (line.amount !== null) await tx.cashClosureLine.create({ data: { closureId: closure.id, section: 'OTHER_ENTRIES', ordinal, labelRaw: line.labelRaw, amount: line.amount } });
      for (const [ordinal, line] of n.detail.smartTefLines.entries()) if (line.amount !== null) await tx.cashClosureLine.create({ data: { closureId: closure.id, section: 'SMARTTEF', ordinal, labelRaw: line.labelRaw, amount: line.amount } });
      for (const [sourceOrdinal, withdrawal] of n.withdrawals.entries()) if (withdrawal.amount !== null) await tx.cashMovement.create({ data: { organizationId: actor.organizationId, closureId: closure.id, kind: 'SANGRIA', sourceOrdinal, descriptionRaw: withdrawal.labelRaw, amount: withdrawal.amount } });
      for (const warning of n.validationWarnings) await tx.reviewIssue.create({ data: { organizationId: actor.organizationId, closureId: closure.id, code: 'NORMALIZATION_WARNING', severity: 'MEDIA', observed: warning } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorUserId: actor.id, action: 'IMPORT', entityName: 'CashClosure', entityId: closure.id, after: { documentId: doc.id, sha256: doc.sha256, parserVersion: n.parserVersion }, channel: 'IMPORTACAO' } });
      return { repeated: false, closureId: closure.id, documentId: doc.id };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ApiError(409, 'Documento ou fechamento duplicado');
    throw error;
  }
}
