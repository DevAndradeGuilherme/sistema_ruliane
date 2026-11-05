import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { decimalStringToCents } from '@financeiro/domain';

const raw = process.env.TEST_DATABASE_URL;
const url = raw ? new URL(raw) : null;
if (url && (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname !== '/financeiro')) throw new Error('Teste aceita apenas PostgreSQL local financeiro');
test('backend financeiro: autenticação, escopo, saldo, concorrência, sangria e auditoria', { skip: !raw }, async () => {
  process.env.DATABASE_URL = raw!;
  const [{ prisma }, { createPayable, editPayable, recordPayment, classifySangria }, { verifyCredentials }, { default: argon2 }] = await Promise.all([
    import('@financeiro/db'), import('../src/finance.ts'), import('../src/auth-credentials.ts'), import('argon2'),
  ]);
  const org = await prisma.organization.create({ data: { name: `Teste ${randomUUID()}` } });
  const other = await prisma.organization.create({ data: { name: `Teste ${randomUUID()}` } });
  const email = `${randomUUID()}@example.invalid`;
  const user = await prisma.user.create({ data: { organizationId: org.id, name: 'Teste Financeiro', role: 'FINANCEIRO', loginEmail: email, passwordHash: await argon2.hash('senha-teste', { type: argon2.argon2id }) } });
  const owner = await prisma.user.create({ data: { organizationId: org.id, name: 'Teste Proprietaria', role: 'PROPRIETARIA' } });
  const actor = { id: user.id, organizationId: org.id, role: 'FINANCEIRO' as const };
  const ownerActor = { id: owner.id, organizationId: org.id, role: 'PROPRIETARIA' as const };
  try {
    assert.equal((await verifyCredentials({ email, password: 'senha-teste' }))?.id, user.id);
    assert.equal(await verifyCredentials({ email, password: 'errada' }), null);
    await assert.rejects(createPayable(ownerActor, { description: 'Vedada', amountExpected: '1.00', dueDate: '2026-11-05' }), /somente leitura/);
    const p = await createPayable(actor, { description: 'Conta de teste', amountExpected: '100.00', dueDate: '2026-11-05' });
    await assert.rejects(editPayable({ ...actor, organizationId: other.id }, p.id, { description: 'Cruzada' }), /não encontrada/);
    await editPayable(actor, p.id, { amountExpected: '90.00' });
    const payment = { payableId: p.id, amount: '60.00', paidAt: '2026-11-05T12:00:00-03:00', method: 'PIX' as const, idempotencyKey: randomUUID() };
    const first = await recordPayment(actor, payment);
    assert.equal(first.repeated, false);
    assert.equal((await recordPayment(actor, payment)).repeated, true);
    await assert.rejects(recordPayment(actor, { ...payment, amount: '61.00' }), /Chave de idempotência/);
    await assert.rejects(editPayable(actor, p.id, { amountExpected: '50.00' }), /menor que pagamentos/);
    const concurrent = await Promise.allSettled([
      recordPayment(actor, { ...payment, amount: '20.00', idempotencyKey: randomUUID() }),
      recordPayment(actor, { ...payment, amount: '20.00', idempotencyKey: randomUUID() }),
    ]);
    assert.equal(concurrent.filter(x => x.status === 'fulfilled').length, 1);
    const persisted = await prisma.payable.findUniqueOrThrow({ where: { id: p.id }, include: { payments: true } });
    assert.equal(persisted.payments.reduce((sum,x) => sum + decimalStringToCents(x.amount.toFixed(2)), 0n), 8000n);
    assert.equal(persisted.status, 'PARCIALMENTE_PAGA');
    assert.equal(await prisma.auditLog.count({ where: { organizationId: org.id, entityId: p.id } }), 4);
    await assert.rejects(recordPayment(actor, { ...payment, amount: '21.00', idempotencyKey: randomUUID() }), /excede saldo/);
    assert.equal(await prisma.auditLog.count({ where: { organizationId: org.id, entityId: p.id } }), 4);
    await assert.rejects(recordPayment(actor, { ...payment, amount: '1.00', method: 'DINHEIRO', idempotencyKey: randomUUID() }), /sangria vinculada/);
    const doc = await prisma.document.create({ data: { organizationId: org.id, kind: 'FECHAMENTO_CAIXA', filename: 'sintetico.pdf', mimeType: 'application/pdf', sha256: 'a'.repeat(64), storageKey: `test/${randomUUID()}` } });
    const closure = await prisma.cashClosure.create({ data: { organizationId: org.id, documentId: doc.id, closureNumber: 'TESTE', terminal: '1', businessDate: new Date('2026-11-05T00:00:00Z'), closedAt: new Date() } });
    const m = await prisma.cashMovement.create({ data: { organizationId: org.id, closureId: closure.id, kind: 'SANGRIA', sourceOrdinal: 1, descriptionRaw: 'Compra teste', amount: '10.00' } });
    await assert.rejects(classifySangria(ownerActor, m.id, { classification: 'DESPESA_OPERACIONAL' }), /somente leitura/);
    await classifySangria(actor, m.id, { classification: 'DESPESA_OPERACIONAL' });
    await assert.rejects(classifySangria(actor, m.id, { classification: 'DESPESA_OPERACIONAL' }), /já classificada/);
    assert.equal(await prisma.expense.count({ where: { cashMovementId: m.id } }), 1);
    const otherMovement = await prisma.cashMovement.create({ data: { organizationId: org.id, closureId: closure.id, kind: 'SANGRIA', sourceOrdinal: 2, descriptionRaw: 'Pagamento teste', amount: '10.00' } });
    const cash = await recordPayment(actor, { ...payment, amount: '10.00', method: 'DINHEIRO', cashMovementId: otherMovement.id, idempotencyKey: randomUUID() });
    assert.equal(cash.balance, '0.00');
    await classifySangria(actor, otherMovement.id, { classification: 'DESPESA_OPERACIONAL' });
    assert.equal(await prisma.expense.count({ where: { paymentId: cash.id } }), 1);
    assert.equal(await prisma.expense.count({ where: { cashMovementId: otherMovement.id } }), 0);
  } finally {
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
    await prisma.expense.deleteMany({ where: { organizationId: org.id } });
    await prisma.payablePayment.deleteMany({ where: { organizationId: org.id } });
    await prisma.payable.deleteMany({ where: { organizationId: org.id } });
    await prisma.cashMovement.deleteMany({ where: { organizationId: org.id } });
    await prisma.cashClosure.deleteMany({ where: { organizationId: org.id } });
    await prisma.document.deleteMany({ where: { organizationId: org.id } });
    await prisma.user.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.organization.delete({ where: { id: other.id } });
  }
});
