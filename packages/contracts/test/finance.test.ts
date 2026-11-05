import assert from 'node:assert/strict';
import test from 'node:test';
import { civilDateSchema, payableCreateSchema, payablePaymentCreateSchema } from '../src/payable.ts';
import { normalizedClosureSchema } from '../src/cash-closing.ts';

test('civil date rejects nonexistent dates', () => {
  assert.equal(civilDateSchema.safeParse('2026-02-29').success, false);
  assert.equal(civilDateSchema.safeParse('2028-02-29').success, true);
});

test('payable and payment reject zero, excess precision and floating numbers', () => {
  const payable = { description: 'Conta teste', amountExpected: '1.00', dueDate: '2026-11-05' };
  assert.equal(payableCreateSchema.safeParse(payable).success, true);
  for (const amountExpected of ['0.00', '1.001', '1000000000000.00', 1.00]) {
    assert.equal(payableCreateSchema.safeParse({ ...payable, amountExpected }).success, false);
  }
  const payment = { payableId: '384f8028-082d-4e69-b12c-ce2e51c3bfa5', amount: '1.00', paidAt: '2026-11-05T15:00:00-03:00', method: 'PIX' };
  assert.equal(payablePaymentCreateSchema.safeParse(payment).success, true);
  assert.equal(payablePaymentCreateSchema.safeParse({ ...payment, method: 'A_DEFINIR' }).success, false);
  assert.equal(payablePaymentCreateSchema.safeParse({ ...payment, idempotencyKey: ' ' }).success, false);
  assert.equal(payablePaymentCreateSchema.safeParse({ ...payment, paidAt: '2026-11-05T15:00:00' }).success, false);
});

test('closure retains signed printed variance and validates local timestamps', () => {
  const closure = {
    parserVersion: 'test', number: '1', terminal: '2', operatorCode: null, operatorName: null,
    openedAtLocal: null, closedAtLocal: '2026-11-05T15:11:00', statusRaw: null,
    summary: { cashNet: null, credit: null, debit: null, due: null, pixTransfer: null, reportedCloseTotal: '7386.58' },
    detail: { cashSales: null, cashWithdrawalsTotal: null, cashNet: null, otherEntries: [], otherEntriesTotal: null,
      calculatedReportTotalPrinted: '7500.67', variancePrinted: '-114.09', smartTefTotal: null, smartTefLines: [] },
    withdrawals: [], validationWarnings: [],
  };
  assert.equal(normalizedClosureSchema.safeParse(closure).success, true);
  assert.equal(normalizedClosureSchema.safeParse({ ...closure, closedAtLocal: '2026-02-30T15:11:00' }).success, false);
});
