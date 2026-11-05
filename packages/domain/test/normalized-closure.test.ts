import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizedClosureSchema } from '../../contracts/src/cash-closing.ts';
import { parseClosingText, toNormalizedClosure } from '../src/index.ts';

const fixture = readFileSync(new URL('./fixtures/fechamento-2000908.sanitized.txt', import.meta.url), 'utf8');

test('parser público produz contrato normalizado sem somar SmartTEF', () => {
  const parsed = parseClosingText(fixture);
  const normalized = normalizedClosureSchema.parse(toNormalizedClosure(parsed));
  assert.equal(normalized.summary.reportedCloseTotal, '7386.58');
  assert.equal(normalized.detail.smartTefTotal, '624.73');
  assert.equal(normalized.detail.calculatedReportTotalPrinted, '7500.67');
  assert.equal(normalized.detail.variancePrinted, '-114.09');
  assert.deepEqual(normalized.validationWarnings, parsed.validationWarnings);
  assert.deepEqual(normalized.withdrawals[0], {
    labelRaw: parsed.withdrawals[0]?.labelRaw,
    amount: parsed.withdrawals[0]?.amount,
  });
});

test('campos ausentes seguem null no contrato', () => {
  const parsed = parseClosingText('');
  const normalized = normalizedClosureSchema.parse(toNormalizedClosure(parsed));
  assert.equal(normalized.number, null);
  assert.equal(normalized.closedAtLocal, null);
  assert.equal(normalized.summary.reportedCloseTotal, null);
  assert.equal(normalized.detail.smartTefTotal, null);
  assert.equal(normalized.detail.variancePrinted, null);
  assert.ok(normalized.validationWarnings.length > 0);
});
