import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const connectionString = process.env.TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : null;
if (target && (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) || target.port !== '5432' || target.pathname !== '/financeiro')) throw new Error('Teste aceita somente PostgreSQL DEV financeiro em loopback');

test('fechamento normalizado: original, ausências, divergência, SmartTEF e dedup', { skip: !connectionString }, async () => {
  process.env.DATABASE_URL = connectionString!;
  const [{ prisma }, { persistClosure }, { financeSummary }] = await Promise.all([import('@financeiro/db'), import('../src/closure-persistence.ts'), import('../src/finance-summary.ts')]);
  const org = await prisma.organization.create({ data: { name: `Fechamento teste ${randomUUID()}` } });
  const other = await prisma.organization.create({ data: { name: `Fechamento teste ${randomUUID()}` } });
  const user = await prisma.user.create({ data: { organizationId: org.id, name: 'Teste', role: 'FINANCEIRO' } });
  const otherUser = await prisma.user.create({ data: { organizationId: other.id, name: 'Teste B', role: 'FINANCEIRO' } });
  const actor = { id: user.id, organizationId: org.id, role: 'FINANCEIRO' as const };
  const n = {
    parserVersion: 'fixture-test-1', number: `C-${randomUUID()}`, terminal: '2', operatorCode: '67', operatorName: 'Operador sintético',
    openedAtLocal: '2026-10-30T07:04:00', closedAtLocal: '2026-10-30T15:11:00', statusRaw: 'Fechado',
    summary: { cashNet: '1135.35', credit: '3362.04', debit: '2003.71', due: '210.50', pixTransfer: '674.98', reportedCloseTotal: '7386.58' },
    detail: { cashSales: '1349.85', cashWithdrawalsTotal: '214.50', cashNet: '1135.35',
      otherEntries: [{ labelRaw: 'Vendas Vencimento', amount: '210.59' }, { labelRaw: 'Vendas C. Credito', amount: '3042.50' }, { labelRaw: 'Vendas C Debito', amount: '2117.71' }, { labelRaw: 'Vendas Boleto', amount: '319.54' }, { labelRaw: 'Vendas Transf', amount: '674.98' }],
      otherEntriesTotal: '6365.32', calculatedReportTotalPrinted: '7500.67', variancePrinted: '-114.09',
      smartTefTotal: '624.73', smartTefLines: [{ labelRaw: 'SMARTTEF', amount: '624.73' }] },
    withdrawals: [{ labelRaw: 'Sangria teste', amount: '214.50' }], validationWarnings: ['Divergência impressa preservada'],
  };
  const document = (hash: string) => ({ filename: 'fixture-sintetica.pdf', mimeType: 'application/pdf', sha256: hash, storageKey: `test/${randomUUID()}` });
  const request = { normalized: n, document: document(randomUUID().replaceAll('-', '').padEnd(64, 'a')), businessDate: '2026-10-30', closedAt: '2026-10-30T15:11:00-03:00', openedAt: '2026-10-30T07:04:00-03:00', rawReportText: 'Texto sintético sem dados reais' };
  try {
    await assert.rejects(persistClosure({ ...actor, role: 'PROPRIETARIA' }, request), /somente leitura/);
    const first = await persistClosure(actor, request);
    assert.equal(first.repeated, false);
    const repeated = await persistClosure(actor, request);
    assert.equal(repeated.closureId, first.closureId);
    assert.equal(repeated.repeated, true);
    const c = await prisma.cashClosure.findUniqueOrThrow({ where: { id: first.closureId }, include: { lines: true, movements: true, issues: true, document: { include: { importJobs: true } } } });
    assert.equal(c.reportedCloseTotal?.toFixed(2), '7386.58');
    assert.equal(c.calculatedReportTotal?.toFixed(2), '7500.67');
    assert.equal(c.reportedVariance?.toFixed(2), '-114.09');
    assert.equal(c.calculatedVariance?.toFixed(2), '-114.09');
    assert.equal(c.reportedCashNet?.toFixed(2), '1135.35');
    assert.equal(c.lines.filter(x => x.section === 'SMARTTEF').length, 1);
    assert.equal(c.lines.find(x => x.section === 'SMARTTEF')?.amount.toFixed(2), '624.73');
    assert.equal(c.movements.length, 1);
    assert.equal(c.movements[0]?.classification, 'NAO_CLASSIFICADA');
    assert.equal(c.issues.length, 1);
    assert.equal(c.document.importJobs.length, 1);
    const payload = c.document.importJobs[0]?.payload as typeof n;
    assert.equal(payload.detail.calculatedReportTotalPrinted, '7500.67');
    assert.equal(payload.detail.smartTefTotal, '624.73');
    const summary = await financeSummary(actor, { from: '2026-10-30', to: '2026-10-30' });
    assert.equal(summary.pdv.amount, '7386.58');
    assert.equal(summary.pdv.nature, 'VALOR_FECHAMENTO_IMPRESSO');
    assert.equal(summary.pdv.coverage, 'REVIEW_REQUIRED');
    assert.equal(summary.expenses.amount, '0.00');
    assert.equal(summary.pendingPayables.amount, '0.00');
    await assert.rejects(persistClosure(actor, { ...request, document: document(randomUUID().replaceAll('-', '').padEnd(64, 'b')) }), /Fechamento lógico/);
    assert.equal(await prisma.document.count({ where: { organizationId: org.id } }), 1);

    const missing = { ...n, number: `M-${randomUUID()}`, summary: { ...n.summary, debit: null }, detail: { ...n.detail, cashSales: null, smartTefTotal: null, smartTefLines: [] }, withdrawals: [{ labelRaw: 'Sangria sem valor', amount: null }], validationWarnings: ['Campo ausente'] };
    const missingRequest = { ...request, normalized: missing, document: document(randomUUID().replaceAll('-', '').padEnd(64, 'c')) };
    const race = await Promise.all(Array.from({ length: 4 }, () => persistClosure(actor, missingRequest)));
    assert.equal(new Set(race.map(x => x.closureId)).size, 1);
    const mc = await prisma.cashClosure.findUniqueOrThrow({ where: { id: race[0]!.closureId }, include: { lines: true, movements: true, document: { include: { importJobs: true } } } });
    assert.equal(mc.calculatedReportTotal, null);
    assert.equal(mc.calculatedVariance, null);
    assert.equal(mc.lines.filter(x => x.section === 'SMARTTEF').length, 0);
    assert.equal(mc.movements.length, 0);
    const mp = mc.document.importJobs[0]?.payload as typeof missing;
    assert.equal(mp.summary.debit, null);
    assert.equal(mp.detail.cashSales, null);
    assert.equal(mp.detail.smartTefTotal, null);
    assert.equal(mp.withdrawals[0]?.amount, null);
    assert.equal(await prisma.cashClosure.count({ where: { organizationId: org.id } }), 2);
    const isolated = await persistClosure({ id: otherUser.id, organizationId: other.id, role: 'FINANCEIRO' }, { ...request, document: { ...request.document, storageKey: `test/${randomUUID()}` } });
    assert.equal(isolated.repeated, false);
    assert.notEqual(isolated.closureId, first.closureId);
  } finally {
    const organizations = [org.id, other.id];
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: organizations } } });
    await prisma.reviewIssue.deleteMany({ where: { organizationId: { in: organizations } } });
    const closures = await prisma.cashClosure.findMany({ where: { organizationId: { in: organizations } }, select: { id: true } });
    await prisma.cashMovement.deleteMany({ where: { organizationId: { in: organizations } } });
    await prisma.cashClosureLine.deleteMany({ where: { closureId: { in: closures.map(x => x.id) } } });
    await prisma.cashClosure.deleteMany({ where: { organizationId: { in: organizations } } });
    const docs = await prisma.document.findMany({ where: { organizationId: { in: organizations } }, select: { id: true } });
    await prisma.importJob.deleteMany({ where: { documentId: { in: docs.map(x => x.id) } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: organizations } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: organizations } } });
    await prisma.organization.deleteMany({ where: { id: { in: [org.id, other.id] } } });
  }
});
