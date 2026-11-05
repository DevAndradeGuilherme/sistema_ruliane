import { prisma, Prisma } from '@financeiro/db';
import { normalizedClosureSchema } from '@financeiro/contracts';
import { z } from 'zod';
import { ApiError, type Actor } from './errors.ts';
import { decimalStringToCents, centsToDecimalString } from '@financeiro/domain';

/** Called after a private upload and deterministic normalization. No public import endpoint exists yet. */
const requestSchema = z.object({
  normalized: normalizedClosureSchema,
  document: z.object({ filename: z.string().min(1), mimeType: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), storageKey: z.string().min(1) }),
  businessDate: z.iso.date(),
  closedAt: z.iso.datetime({ offset: true }),
  openedAt: z.iso.datetime({ offset: true }).nullable(),
  rawReportText: z.string().nullable().optional(),
});
export async function persistClosure(actor: Actor, raw: unknown, attempt = 0): Promise<{ repeated: boolean; closureId: string; documentId: string }> {
  if (actor.role !== 'FINANCEIRO') throw new ApiError(403, 'Acesso somente leitura');
  const input = requestSchema.parse(raw);
  const n = input.normalized;
  if (!n.number || !n.terminal || !n.closedAtLocal) throw new ApiError(422, 'Identidade do fechamento incompleta');
  function saoPauloLocal(value: string) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
    const part = (type: string) => parts.find(x => x.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
  }
  if (n.closedAtLocal.slice(0, 19) !== saoPauloLocal(input.closedAt) ||
      (n.openedAtLocal !== null && (!input.openedAt || n.openedAtLocal.slice(0, 19) !== saoPauloLocal(input.openedAt)))) throw new ApiError(422, 'Data local divergente');
  const businessDate = new Date(`${input.businessDate}T00:00:00Z`);
  const existing = await prisma.document.findUnique({ where: { organizationId_sha256: { organizationId: actor.organizationId, sha256: input.document.sha256 } }, include: { closure: true } });
  if (existing?.closure) return { repeated: true, closureId: existing.closure.id, documentId: existing.id };
  if (existing && existing.kind !== 'FECHAMENTO_CAIXA') throw new ApiError(409, 'Hash pertence a documento de outro tipo');
  const logical = await prisma.cashClosure.findUnique({ where: { organizationId_closureNumber_terminal_businessDate: { organizationId: actor.organizationId, closureNumber: n.number, terminal: n.terminal, businessDate } } });
  if (logical) throw new ApiError(409, 'Fechamento lógico já registrado com outro arquivo');
  const c = decimalStringToCents;
  const calculatedTotal = n.detail.cashSales !== null && n.detail.cashWithdrawalsTotal !== null && n.detail.otherEntriesTotal !== null
    ? centsToDecimalString(c(n.detail.cashSales) - c(n.detail.cashWithdrawalsTotal) + c(n.detail.otherEntriesTotal)) : null;
  const calculatedVariance = calculatedTotal !== null && n.summary.reportedCloseTotal !== null
    ? centsToDecimalString(c(n.summary.reportedCloseTotal) - c(calculatedTotal)) : null;
  try {
    return await prisma.$transaction(async tx => {
      const doc = existing ?? await tx.document.create({ data: { organizationId: actor.organizationId, kind: 'FECHAMENTO_CAIXA', ...input.document, status: 'PENDENTE_REVISAO' } });
      await tx.importJob.create({ data: { documentId: doc.id, state: 'PENDENTE_REVISAO', parserVersion: n.parserVersion, payload: n as Prisma.InputJsonValue, finishedAt: new Date() } });
      const closure = await tx.cashClosure.create({ data: { organizationId: actor.organizationId, documentId: doc.id, closureNumber: n.number!, terminal: n.terminal!, businessDate,
        operatorCode: n.operatorCode, operatorName: n.operatorName, openedAt: input.openedAt ? new Date(input.openedAt) : null, closedAt: new Date(input.closedAt),
        statusRaw: n.statusRaw, rawReportText: input.rawReportText, reportedCloseTotal: n.summary.reportedCloseTotal, calculatedReportTotal: calculatedTotal,
        reportedVariance: n.detail.variancePrinted, calculatedVariance, reportedCashNet: n.summary.cashNet, reviewStatus: 'PENDENTE_REVISAO',
      } });
      const summary = [['Dinheiro', n.summary.cashNet], ['Crédito', n.summary.credit], ['Débito', n.summary.debit], ['Vencimento', n.summary.due], ['Transferência Pix', n.summary.pixTransfer]] as const;
      for (const [ordinal, [labelRaw, value]] of summary.entries()) if (value !== null) await tx.cashClosureLine.create({ data: { closureId: closure.id, section: 'SUMMARY', ordinal, labelRaw, amount: value } });
      for (const [ordinal, line] of n.detail.otherEntries.entries()) if (line.amount !== null) await tx.cashClosureLine.create({ data: { closureId: closure.id, section: 'OTHER_ENTRIES', ordinal, labelRaw: line.labelRaw, amount: line.amount } });
      for (const [ordinal, line] of n.detail.smartTefLines.entries()) if (line.amount !== null) await tx.cashClosureLine.create({ data: { closureId: closure.id, section: 'SMARTTEF', ordinal, labelRaw: line.labelRaw, amount: line.amount } });
      for (const [index, withdrawal] of n.withdrawals.entries()) if (withdrawal.amount !== null) await tx.cashMovement.create({ data: { organizationId: actor.organizationId, closureId: closure.id, kind: 'SANGRIA', sourceOrdinal: index + 1, descriptionRaw: withdrawal.labelRaw, amount: withdrawal.amount } });
      for (const warning of n.validationWarnings) await tx.reviewIssue.create({ data: { organizationId: actor.organizationId, closureId: closure.id, code: 'NORMALIZATION_WARNING', severity: 'MEDIA', observed: warning } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorUserId: actor.id, action: 'IMPORT', entityName: 'CashClosure', entityId: closure.id, after: { documentId: doc.id, sha256: doc.sha256, parserVersion: n.parserVersion }, channel: 'IMPORTACAO' } });
      return { repeated: false, closureId: closure.id, documentId: doc.id };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) return persistClosure(actor, raw, attempt + 1);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const doc = await prisma.document.findUnique({ where: { organizationId_sha256: { organizationId: actor.organizationId, sha256: input.document.sha256 } }, include: { closure: true } });
      if (doc?.closure) return { repeated: true, closureId: doc.closure.id, documentId: doc.id };
      throw new ApiError(409, 'Fechamento lógico já registrado com outro arquivo');
    }
    throw error;
  }
}
