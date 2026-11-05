import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const connectionString = process.env.TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : null;
if (target && (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) || target.port !== '5432' || target.pathname !== '/financeiro')) throw new Error('Teste aceita somente PostgreSQL DEV local financeiro:5432');

test('claims PostgreSQL: concorrência, leases, escopo, receipt e retenção', { skip: !connectionString }, async () => {
  process.env.DATABASE_URL = connectionString!;
  const [{ prisma, PostgresInboundClaims, InactiveWhatsAppInstance, LostInboundLease }, { PrismaClient }, { PrismaPg }] = await Promise.all([
    import('../src/index.ts'), import('../generated/prisma/client.ts'), import('@prisma/adapter-pg'),
  ]);
  const replica = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const a = new PostgresInboundClaims(prisma), b = new PostgresInboundClaims(replica);
  const orgA = await prisma.organization.create({ data: { name: `Dedup A ${randomUUID()}` } });
  const orgB = await prisma.organization.create({ data: { name: `Dedup B ${randomUUID()}` } });
  const instanceName = `dev-${randomUUID()}`;
  const otherInstanceName = `dev-${randomUUID()}`;
  try {
    await prisma.whatsAppInstance.createMany({ data: [
      { name: instanceName, organizationId: orgA.id, active: false },
      { name: otherInstanceName, organizationId: orgB.id, active: true },
    ] });
    const key = { organizationId: orgA.id, instanceName, providerMessageId: randomUUID(), receivedAt: new Date() };
    await assert.rejects(a.claim(key), InactiveWhatsAppInstance);
    assert.equal(await prisma.inboundMessageClaim.count({ where: { organizationId: orgA.id } }), 0);
    await prisma.whatsAppInstance.update({ where: { name: instanceName }, data: { active: true } });
    const claims = await Promise.all(Array.from({ length: 20 }, (_, n) => (n % 2 ? a : b).claim(key)));
    assert.equal(claims.filter(Boolean).length, 1);
    const first = claims.find(Boolean)!;
    assert.equal(await a.claim(key), null);
    assert.equal(await prisma.inboundMessageClaim.count({ where: { organizationId: orgA.id, instanceName, providerMessageId: key.providerMessageId } }), 1);
    await assert.rejects(a.claim({ ...key, organizationId: orgB.id }), InactiveWhatsAppInstance);
    const other = await b.claim({ ...key, organizationId: orgB.id, instanceName: otherInstanceName });
    assert.ok(other);
    await prisma.inboundMessageClaim.update({ where: { id: first.id }, data: { claimedAt: new Date(Date.now() - 120_000), leaseUntil: new Date(Date.now() - 60_000) } });
    const second = await b.claim(key);
    assert.ok(second);
    assert.notEqual(second.leaseOwner, first.leaseOwner);
    assert.equal(await a.complete(first), false);
    assert.equal(await a.release(first), false);
    await assert.rejects(a.applyFinancialEffect(first, randomUUID(), 'PAYABLE', async () => {}), LostInboundLease);
    assert.equal(await b.renew(second), true);

    const failedKey = randomUUID();
    await assert.rejects(b.applyFinancialEffect(second, failedKey, 'PAYABLE', async (tx, id) => {
      await tx.payable.create({ data: { id, organizationId: orgA.id, description: 'Falha sintética', amountExpected: '10.00', dueDate: new Date('2026-11-05T00:00:00Z') } });
      throw new Error('Falha após criar conta dentro da transação');
    }), /Falha após criar/);
    assert.equal(await prisma.inboundFinancialEffect.count({ where: { organizationId: orgA.id, effectKey: failedKey } }), 0);
    assert.equal(await prisma.payable.count({ where: { organizationId: orgA.id, description: 'Falha sintética' } }), 0);

    const effectKey = randomUUID();
    const writePayable = async (tx: Parameters<typeof b.applyFinancialEffect>[3] extends (tx: infer T, id: string) => Promise<void> ? T : never, id: string) => {
      await tx.payable.create({ data: { id, organizationId: orgA.id, description: 'Conta WhatsApp teste', amountExpected: '100.00', dueDate: new Date('2026-11-05T00:00:00Z') } });
    };
    const effect = await b.applyFinancialEffect(second, effectKey, 'PAYABLE', writePayable);
    assert.equal(effect.repeated, false);
    await assert.rejects(prisma.inboundFinancialEffect.create({ data: { organizationId: orgA.id, claimId: second.id, effectKey, entityType: 'PAYABLE', entityId: randomUUID() } }), { code: 'P2002' });
    await b.applyFinancialEffect(other!, effectKey, 'PAYABLE', async (tx, id) => {
      await tx.payable.create({ data: { id, organizationId: orgB.id, description: 'Conta outra organização', amountExpected: '1.00', dueDate: new Date('2026-11-05T00:00:00Z') } });
    });
    assert.equal(await prisma.inboundFinancialEffect.count({ where: { organizationId: orgA.id, effectKey } }), 1);
    assert.equal(await prisma.inboundFinancialEffect.count({ where: { organizationId: orgB.id, effectKey } }), 1);
    assert.deepEqual(await b.applyFinancialEffect(second, effectKey, 'PAYABLE', writePayable), { entityId: effect.entityId, repeated: true });
    const anotherClaim = await a.claim({ ...key, providerMessageId: randomUUID() });
    assert.ok(anotherClaim);
    assert.deepEqual(await a.applyFinancialEffect(anotherClaim, effectKey, 'PAYABLE', writePayable), { entityId: effect.entityId, repeated: true });
    assert.equal(await prisma.payable.count({ where: { organizationId: orgA.id, description: 'Conta WhatsApp teste' } }), 1);
    assert.equal(await b.release(second), false);
    assert.equal(await b.complete(second), true);
    assert.equal(await b.claim(key), null);

    const payClaim = await a.claim({ ...key, providerMessageId: randomUUID() });
    assert.ok(payClaim);
    const paymentKey = randomUUID();
    const payment = await a.applyFinancialEffect(payClaim, paymentKey, 'PAYMENT', async (tx, id) => {
      await tx.payablePayment.create({ data: { id, organizationId: orgA.id, payableId: effect.entityId, amount: '20.00', paidAt: new Date(), method: 'PIX', idempotencyKey: paymentKey } });
    });
    assert.equal(payment.repeated, false);
    assert.equal((await b.applyFinancialEffect(payClaim, paymentKey, 'PAYMENT', async () => { throw new Error('Não deve repetir pagamento'); })).repeated, true);
    assert.equal(await prisma.payablePayment.count({ where: { organizationId: orgA.id, idempotencyKey: paymentKey } }), 1);
    assert.equal(await a.complete(payClaim), true);

    const cleanupKey = { ...key, providerMessageId: randomUUID() };
    const cleanupClaim = await a.claim(cleanupKey); assert.ok(cleanupClaim);
    assert.equal(await a.complete(cleanupClaim), true);
    assert.equal(await a.cleanupDone(), 0);
    const past = new Date(Date.now() - 9 * 86_400_000);
    const expired = new Date(Date.now() - 2 * 86_400_000);
    await prisma.inboundMessageClaim.updateMany({ where: { id: { in: [cleanupClaim.id, second.id] } }, data: { completedAt: past, expiresAt: expired } });
    assert.equal(await a.cleanupDone(), 1);
    assert.equal(await prisma.inboundMessageClaim.count({ where: { id: cleanupClaim.id } }), 0);
    assert.equal(await prisma.inboundMessageClaim.count({ where: { id: second.id } }), 1);
    assert.equal(await a.release(anotherClaim), true);
    assert.equal(await b.complete(other!), true);
  } finally {
    await prisma.expense.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.payablePayment.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.inboundFinancialEffect.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.payable.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.inboundMessageClaim.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.whatsAppInstance.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await replica.$disconnect();
  }
});
