import { prisma, Prisma } from '@financeiro/db';
import { payableCreateSchema, payablePaymentCreateSchema } from '@financeiro/contracts';
import { decimalStringToCents, centsToDecimalString, pendingPayableBalance } from '@financeiro/domain';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ApiError, type Actor } from './errors.ts';

const uuid = z.uuid();
function requireFinanceiro(actor: Actor) { if (actor.role !== 'FINANCEIRO') throw new ApiError(403, 'Acesso somente leitura'); }
const editSchema = z.object({
  description: payableCreateSchema.safeExtend({}).shape.description.optional(),
  supplierId: z.uuid().nullable().optional(),
  amountExpected: payableCreateSchema.safeExtend({}).shape.amountExpected.optional(),
  dueDate: payableCreateSchema.safeExtend({}).shape.dueDate.optional(),
  plannedMethod: payableCreateSchema.safeExtend({}).shape.plannedMethod.optional(),
  notes: z.string().max(3000).nullable().optional(),
  installmentNumber: z.int().min(1).optional(),
});
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const amount = (value: { toFixed(digits: number): string }) => value.toFixed(2);
const audit = (tx: Prisma.TransactionClient, actor: Actor, action: string, entityName: string, entityId: string, before: unknown, after: unknown) => tx.auditLog.create({ data: {
  organizationId: actor.organizationId, actorUserId: actor.id, action, entityName, entityId,
  before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, channel: 'WEB',
} });
const payableJson = (p: { id: string; description: string; amountExpected: { toFixed(digits: number): string }; dueDate: Date; status: string; supplierId: string | null; plannedMethod: string; notes: string | null }) => ({
  id: p.id, description: p.description, amountExpected: amount(p.amountExpected), dueDate: p.dueDate.toISOString().slice(0, 10), status: p.status,
  supplierId: p.supplierId, plannedMethod: p.plannedMethod, notes: p.notes,
});

async function createPayableOnce(actor: Actor, raw: unknown, id: string) {
  requireFinanceiro(actor);
  const input = payableCreateSchema.parse(raw);
  if (input.supplierId && !await prisma.supplier.findFirst({ where: { id: input.supplierId, organizationId: actor.organizationId } })) throw new ApiError(404, 'Fornecedor não encontrado');
  return prisma.$transaction(async tx => {
    const group = input.installmentTotal ? await tx.installmentGroup.create({ data: { organizationId: actor.organizationId, description: input.description, totalCount: input.installmentTotal } }) : null;
    const p = await tx.payable.create({ data: { id, organizationId: actor.organizationId, createdById: actor.id, description: input.description,
      supplierId: input.supplierId, amountExpected: input.amountExpected, dueDate: date(input.dueDate), plannedMethod: input.plannedMethod,
      installmentNumber: input.installmentNumber, notes: input.notes,
      installmentGroupId: group?.id,
    } });
    await audit(tx, actor, 'CREATE', 'Payable', p.id, {}, { ...payableJson(p), inputFingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex') });
    return { ...payableJson(p), repeated: false };
  });
}

export async function createPayable(actor: Actor, raw: unknown, idempotencyKey: string) {
  requireFinanceiro(actor);
  const id = uuid.parse(idempotencyKey);
  const input = payableCreateSchema.parse(raw);
  const inputFingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  async function repeated() {
    const found = await prisma.payable.findUnique({ where: { id } });
    if (!found) return null;
    if (found.organizationId !== actor.organizationId || found.createdById !== actor.id) throw new ApiError(409, 'Chave de idempotência usada com dados diferentes');
    const creation = await prisma.auditLog.findFirst({ where: { organizationId: actor.organizationId, entityName: 'Payable', entityId: id, action: 'CREATE' }, select: { after: true } });
    const recorded = creation?.after as { inputFingerprint?: unknown } | null | undefined;
    if (recorded?.inputFingerprint !== inputFingerprint) throw new ApiError(409, 'Chave de idempotência usada com dados diferentes');
    return { ...payableJson(found), repeated: true };
  }
  const prior = await repeated();
  if (prior) return prior;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await createPayableOnce(actor, input, id); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
        const found = await repeated();
        if (found) return found;
        if (attempt < 2) continue;
      }
      throw error;
    }
  }
  throw new ApiError(409, 'Conflito concorrente');
}

export async function editPayable(actor: Actor, id: string, raw: unknown) {
  requireFinanceiro(actor);
  uuid.parse(id); const input = editSchema.parse(raw);
  if (input.supplierId && !await prisma.supplier.findFirst({ where: { id: input.supplierId, organizationId: actor.organizationId } })) throw new ApiError(404, 'Fornecedor não encontrado');
  return prisma.$transaction(async tx => {
    const current = await tx.payable.findFirst({ where: { id, organizationId: actor.organizationId }, include: { payments: { where: { voidedAt: null } } } });
    if (!current) throw new ApiError(404, 'Conta não encontrada');
    if (current.status === 'CANCELADA') throw new ApiError(409, 'Conta cancelada');
    const newExpected = input.amountExpected ?? amount(current.amountExpected);
    if (decimalStringToCents(newExpected) < current.payments.reduce((sum, p) => sum + decimalStringToCents(amount(p.amount)), 0n)) throw new ApiError(409, 'Valor menor que pagamentos existentes');
    const changed = await tx.payable.update({ where: { id }, data: {
      description: input.description, supplierId: input.supplierId, amountExpected: input.amountExpected,
      dueDate: input.dueDate ? date(input.dueDate) : undefined, plannedMethod: input.plannedMethod, notes: input.notes,
      installmentNumber: input.installmentNumber,
      status: current.payments.length ? (decimalStringToCents(pendingPayableBalance(newExpected, current.payments.map(p => amount(p.amount)))) === 0n ? 'PAGA' : 'PARCIALMENTE_PAGA') : 'ABERTA',
    } });
    await audit(tx, actor, 'UPDATE', 'Payable', id, payableJson(current), payableJson(changed));
    return payableJson(changed);
  }, { isolationLevel: 'Serializable' });
}

export async function cancelPayable(actor: Actor, id: string) {
  requireFinanceiro(actor);
  uuid.parse(id);
  return prisma.$transaction(async tx => {
    const p = await tx.payable.findFirst({ where: { id, organizationId: actor.organizationId }, include: { payments: { where: { voidedAt: null } } } });
    if (!p) throw new ApiError(404, 'Conta não encontrada');
    if (p.payments.length) throw new ApiError(409, 'Conta com pagamento não pode ser cancelada');
    if (p.status === 'CANCELADA') return payableJson(p);
    const updated = await tx.payable.update({ where: { id }, data: { status: 'CANCELADA', canceledAt: new Date() } });
    await audit(tx, actor, 'CANCEL', 'Payable', id, payableJson(p), payableJson(updated));
    return payableJson(updated);
  }, { isolationLevel: 'Serializable' });
}

export async function recordPayment(actor: Actor, raw: unknown) {
  requireFinanceiro(actor);
  const input = payablePaymentCreateSchema.parse(raw);
  if (!input.idempotencyKey) throw new ApiError(400, 'idempotencyKey obrigatório');
  if (input.method === 'DINHEIRO' && !input.cashMovementId) throw new ApiError(400, 'Pagamento em dinheiro exige sangria vinculada');
  if (input.method !== 'DINHEIRO' && input.cashMovementId) throw new ApiError(400, 'Sangria exige pagamento em dinheiro');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const existing = await tx.payablePayment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey! } } });
        if (existing) {
          if (existing.voidedAt || existing.payableId !== input.payableId || amount(existing.amount) !== input.amount || existing.method !== input.method || existing.cashMovementId !== (input.cashMovementId ?? null) || existing.paidAt.toISOString() !== new Date(input.paidAt).toISOString() || existing.externalRef !== (input.externalRef ?? null)) throw new ApiError(409, 'Chave de idempotência usada com dados diferentes');
          return { id: existing.id, amount: amount(existing.amount), repeated: true };
        }
        const p = await tx.payable.findFirst({ where: { id: input.payableId, organizationId: actor.organizationId }, include: { payments: { where: { voidedAt: null } } } });
        if (!p) throw new ApiError(404, 'Conta não encontrada');
        if (p.status === 'CANCELADA') throw new ApiError(409, 'Conta cancelada');
        const balance = pendingPayableBalance(amount(p.amountExpected), p.payments.map(x => amount(x.amount)));
        if (decimalStringToCents(input.amount) > decimalStringToCents(balance)) throw new ApiError(409, 'Pagamento excede saldo');
        if (input.cashMovementId) {
          const movement = await tx.cashMovement.findFirst({ where: { id: input.cashMovementId, organizationId: actor.organizationId, kind: 'SANGRIA' }, include: { payment: true, expense: true } });
          if (!movement || movement.payment || movement.expense || amount(movement.amount) !== input.amount) throw new ApiError(409, 'Sangria indisponível ou valor divergente');
        }
        const payment = await tx.payablePayment.create({ data: { organizationId: actor.organizationId, payableId: p.id, amount: input.amount,
          paidAt: new Date(input.paidAt), method: input.method, externalRef: input.externalRef, idempotencyKey: input.idempotencyKey,
          cashMovementId: input.cashMovementId, recordedById: actor.id } });
        const newBalance = centsToDecimalString(decimalStringToCents(balance) - decimalStringToCents(input.amount));
        await tx.payable.update({ where: { id: p.id }, data: { status: newBalance === '0.00' ? 'PAGA' : 'PARCIALMENTE_PAGA' } });
        await tx.expense.create({ data: { organizationId: actor.organizationId, description: p.description, amount: input.amount,
          occurredAt: new Date(input.paidAt), origin: 'PAGAMENTO_CONTA', paymentId: payment.id,
          supplierId: p.supplierId, categoryId: p.categoryId } });
        await audit(tx, actor, 'PAY', 'Payable', p.id, { balance }, { paymentId: payment.id, amount: input.amount, balance: newBalance });
        return { id: payment.id, amount: input.amount, balance: newBalance, repeated: false };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
      throw error;
    }
  }
  throw new ApiError(409, 'Conflito concorrente');
}

export async function classifySangria(actor: Actor, id: string, raw: unknown) {
  requireFinanceiro(actor); uuid.parse(id);
  const { classification } = z.object({ classification: z.enum(['DESPESA_OPERACIONAL','DEVOLUCAO_CLIENTE','ADIANTAMENTO','RETIRADA_INTERNA','OUTROS']) }).parse(raw);
  return prisma.$transaction(async tx => {
    const m = await tx.cashMovement.findFirst({ where: { id, organizationId: actor.organizationId, kind: 'SANGRIA' }, include: { payment: true, expense: true } });
    if (!m) throw new ApiError(404, 'Sangria não encontrada');
    if (m.classification !== 'NAO_CLASSIFICADA') throw new ApiError(409, 'Sangria já classificada');
    if (m.payment && classification !== 'DESPESA_OPERACIONAL') throw new ApiError(409, 'Sangria vinculada a pagamento');
    const updated = await tx.cashMovement.update({ where: { id }, data: { classification, reviewedAt: new Date() } });
    if (classification === 'DESPESA_OPERACIONAL' && !m.payment && !m.expense) await tx.expense.create({ data: { organizationId: actor.organizationId, description: m.descriptionRaw, amount: m.amount, occurredAt: new Date(), origin: 'SANGRIA', cashMovementId: id } });
    await audit(tx, actor, 'CLASSIFY', 'CashMovement', id, { classification: m.classification }, { classification });
    return { id: updated.id, classification: updated.classification };
  }, { isolationLevel: 'Serializable' });
}
