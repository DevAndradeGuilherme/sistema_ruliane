import assert from 'node:assert/strict';
import test from 'node:test';
import { brMoneyToCents, centsToDecimalString, decimalStringToCents } from '../src/money.ts';
import { pendingPayableBalance } from '../src/payables.ts';
import { reconcileClosure } from '../src/closing.ts';

const sample = {
  cashSales: '1349.85',
  cashWithdrawals: '214.50',
  cashNetPrinted: '1135.35',
  otherEntriesPrinted: '6365.32',
  totalCalculatedPrinted: '7500.67',
  closingTotalPrinted: '7386.58',
  variancePrinted: '-114.09',
  summaryDebit: '2003.71',
  detailedDebit: '2117.71',
  summaryDue: '210.50',
  detailedDue: '210.59',
  smartTefPrinted: '624.73',
} as const;

test('pt-BR sem float: R$ 1.135,35 vira 113535 centavos', () => {
  assert.equal(brMoneyToCents('R$ 1.135,35'), 113535n);
  assert.equal(centsToDecimalString(-11409n), '-114.09');
  assert.equal(decimalStringToCents('0.09'), 9n);
  assert.throws(() => decimalStringToCents('1.135,35'));
});

test('fechamento real: 1349,85 - 214,50 = 1135,35', () => {
  const result = reconcileClosure(sample);
  assert.equal(result.recalculated.cashNet, '1135.35');
  assert.equal(result.recalculated.totalCalculated, '7500.67');
  assert.equal(result.recalculated.variance, '-114.09');
  assert.equal(result.original.closingTotalPrinted, '7386.58');
});

test('preserva -114,09 e relata diferença de débito -114,00 e vencimento -0,09', () => {
  const result = reconcileClosure(sample);
  assert.deepEqual(result.issues, [
    { code: 'SUMMARY_DETAIL_DEBIT_MISMATCH', difference: '-114.00' },
    { code: 'SUMMARY_DETAIL_VENCIMENTO_MISMATCH', difference: '-0.09' },
    { code: 'CASH_VARIANCE_NONZERO', difference: '-114.09' },
  ]);
  assert.equal(result.requiresReview, true);
});

test('SmartTEF não é somado de novo em outras entradas', () => {
  const result = reconcileClosure({ ...sample, smartTefPrinted: '999999.00' });
  assert.equal(result.recalculated.totalCalculated, '7500.67');
});

test('saldo pendente de conta parcialmente paga', () => {
  assert.equal(pendingPayableBalance('500.00', ['120.00', '80.00']), '300.00');
  assert.equal(pendingPayableBalance('500.00', []), '500.00');
  assert.equal(pendingPayableBalance('500.00', ['500.00']), '0.00');
  assert.throws(() => pendingPayableBalance('500.00', ['501.00']));
});
