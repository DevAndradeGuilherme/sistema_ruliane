import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseClosingText, splitTrailingMoney } from '../src/import/index.ts';

const FIXTURE = readFileSync(
  new URL('./fixtures/fechamento-2000908.sanitized.txt', import.meta.url),
  'utf8',
);
const codes = (r: ReturnType<typeof parseClosingText>) => r.issues.map((i) => i.code);

test('T01 cabeçalho: caixa, terminal, operador, datas, situação', () => {
  const r = parseClosingText(FIXTURE);
  assert.equal(r.number, '2000908');
  assert.equal(r.terminal, '2');
  assert.equal(r.operatorCode, '67');
  assert.equal(r.operatorName, 'OPERADOR TESTE');
  assert.equal(r.openedAtLocal, '2026-10-30T07:04:00');
  assert.equal(r.closedAtLocal, '2026-10-30T15:11:00');
  assert.equal(r.statusRaw, 'Fechado');
});

test('T02 resumo e valor do fechamento', () => {
  const r = parseClosingText(FIXTURE);
  assert.deepEqual(r.summary, {
    cashNet: '1135.35',
    credit: '3362.04',
    debit: '2003.71',
    due: '210.50',
    pixTransfer: '674.98',
    reportedCloseTotal: '7386.58',
  });
});

test('T03 detalhamento: 1349,85 - 214,50 = 1135,35; outras 6365,32; total 7500,67', () => {
  const r = parseClosingText(FIXTURE);
  assert.equal(r.detail.cashSales, '1349.85');
  assert.equal(r.detail.cashWithdrawalsTotal, '214.50');
  assert.equal(r.detail.cashNet, '1135.35');
  assert.equal(r.detail.otherEntriesTotal, '6365.32');
  assert.equal(r.detail.calculatedReportTotalPrinted, '7500.67');
  assert.deepEqual(
    r.detail.otherEntries.map((e) => [e.labelRaw, e.amount, e.method]),
    [
      ['Vendas Vencimento', '210.59', 'VENCIMENTO'],
      ['Vendas C. Credito', '3042.50', 'CREDITO'],
      ['Vendas C Debito', '2117.71', 'DEBITO'],
      ['Vendas Boleto', '319.54', 'BOLETO'],
      ['Vendas Transf', '674.98', 'TRANSF_PIX'],
    ],
  );
  assert.deepEqual(r.reconciliation.recalculated, {
    cashNet: '1135.35',
    totalCalculated: '7500.67',
    variance: '-114.09',
  });
});

test('T04 divergência preservada: -114,09 impresso; débito -114,00; vencimento -0,09', () => {
  const r = parseClosingText(FIXTURE);
  assert.equal(r.detail.variancePrinted, '-114.09');
  assert.equal(r.summary.reportedCloseTotal, '7386.58');
  const diff = (code: string) => r.issues.find((i) => i.code === code)?.difference;
  assert.equal(diff('CASH_VARIANCE_NONZERO'), '-114.09');
  assert.equal(diff('SUMMARY_DETAIL_DEBIT_MISMATCH'), '-114.00');
  assert.equal(diff('SUMMARY_DETAIL_VENCIMENTO_MISMATCH'), '-0.09');
  // valores impressos não foram "corrigidos"
  assert.equal(r.summary.debit, '2003.71');
  assert.equal(r.parseStatus, 'parsed_with_discrepancy');
  assert.equal(r.requiresReview, true);
});

test('quatro sangrias não classificadas, total 214,50, sem virar despesa', () => {
  const r = parseClosingText(FIXTURE);
  assert.deepEqual(
    r.withdrawals.map((w) => [w.labelRaw, w.amount, w.classification]),
    [
      ['Sangria banana loja', '8.00', 'NAO_CLASSIFICADA'],
      ['Sangria devoluçao ao cliente', '4.50', 'NAO_CLASSIFICADA'],
      ['Sangria maquina de urso nao fu', '2.00', 'NAO_CLASSIFICADA'],
      ['Sangria vale lacy', '200.00', 'NAO_CLASSIFICADA'],
    ],
  );
  const issue = r.issues.find((i) => i.code === 'WITHDRAWALS_REQUIRE_CLASSIFICATION');
  assert.equal(issue?.count, 4);
  assert.equal(issue?.total, '214.50');
  assert.ok(!codes(r).includes('WITHDRAWALS_SUM_MISMATCH'));
});

test('T05 SmartTEF é detalhe: 624,73 armazenado e nunca somado de novo', () => {
  const r = parseClosingText(FIXTURE);
  assert.equal(r.detail.smartTefTotal, '624.73');
  assert.equal(r.detail.smartTefLines.length, 2);
  assert.equal(r.detail.otherEntriesTotal, '6365.32');
  assert.equal(r.reconciliation.recalculated?.totalCalculated, '7500.67');
  assert.ok(!codes(r).includes('SMARTTEF_LINES_SUM_MISMATCH'));
  // Alterar o SmartTEF não altera nenhum total/reconciliação.
  const changed = parseClosingText(FIXTURE.replace('R$ 624,73', 'R$ 9.999,00').replace('R$ 400,00', 'R$ 9.774,27'));
  assert.equal(changed.detail.smartTefTotal, '9999.00');
  assert.deepEqual(changed.reconciliation, parseClosingText(FIXTURE).reconciliation);
  assert.deepEqual(
    changed.issues.filter((i) => i.code !== 'SMARTTEF_LINES_SUM_MISMATCH'),
    parseClosingText(FIXTURE).issues,
  );
});

test('linha desconhecida: mantém raw, marca revisão, não inventa dados', () => {
  const text = FIXTURE.replace('Situação: Fechado', 'Situação: Fechado\nBandeira misteriosa XPTO');
  const r = parseClosingText(text);
  const issue = r.issues.find((i) => i.code === 'UNRECOGNIZED_LINE');
  assert.equal(issue?.raw, 'Bandeira misteriosa XPTO');
  assert.equal(issue?.line, 7);
  assert.equal(r.parseStatus, 'needs_review');
  assert.equal(r.statusRaw, 'Fechado');
});

test('linha de valor desconhecida em seção de resumo não é somada', () => {
  const r = parseClosingText(FIXTURE.replace('Débito R$ 2.003,71', 'Cheque R$ 10,00\nDébito R$ 2.003,71'));
  assert.equal(r.parseStatus, 'needs_review');
  assert.ok(r.issues.some((i) => i.code === 'UNRECOGNIZED_LINE' && i.raw === 'Cheque R$ 10,00'));
  assert.equal(r.summary.debit, '2003.71');
});

test('campo ausente vira null + MISSING_FIELD e pula reconciliação, sem estimar', () => {
  const r = parseClosingText(FIXTURE.replace('Total do caixa apurado (C+D-E) R$ 7.500,67\n', ''));
  assert.equal(r.detail.calculatedReportTotalPrinted, null);
  assert.ok(r.issues.some((i) => i.code === 'MISSING_FIELD' && i.field === 'detail.calculatedReportTotalPrinted'));
  assert.ok(codes(r).includes('RECONCILIATION_SKIPPED'));
  assert.equal(r.reconciliation.recalculated, null);
  assert.equal(r.parseStatus, 'needs_review');
});

test('texto vazio: tudo null e revisão', () => {
  const r = parseClosingText('');
  assert.equal(r.number, null);
  assert.equal(r.summary.reportedCloseTotal, null);
  assert.equal(r.parseStatus, 'needs_review');
  assert.equal(r.requiresReview, true);
});

test('campo repetido com valor diferente: mantém o primeiro e sinaliza', () => {
  const r = parseClosingText(FIXTURE + '\nValor do fechamento (VF): R$ 1,00\n');
  assert.equal(r.summary.reportedCloseTotal, '7386.58');
  assert.ok(codes(r).includes('DUPLICATE_FIELD_CONFLICT'));
});

test('soma das sangrias diferente do total impresso é sinalizada', () => {
  const r = parseClosingText(FIXTURE.replace('Sangria vale lacy R$ 200,00', 'Sangria vale lacy R$ 100,00'));
  const issue = r.issues.find((i) => i.code === 'WITHDRAWALS_SUM_MISMATCH');
  assert.equal(issue?.difference, '100.00');
  assert.equal(r.detail.cashWithdrawalsTotal, '214.50');
});

test('reprocessamento determinístico e tolerante a CRLF/NBSP', () => {
  const a = parseClosingText(FIXTURE);
  const b = parseClosingText(FIXTURE);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = parseClosingText(FIXTURE.replaceAll('\n', '\r\n').replaceAll('R$ ', 'R$ '));
  assert.deepEqual(
    { ...c, rawLines: [] },
    { ...a, rawLines: [] },
    'só os textos brutos (rawLines/raw) podem diferir',
  );
});

test('splitTrailingMoney: sinais e milhar, sem float', () => {
  assert.deepEqual(splitTrailingMoney('Diferença -R$ 114,09'), { label: 'Diferença', amount: '-114.09' });
  assert.deepEqual(splitTrailingMoney('Diferença R$ -114,09'), { label: 'Diferença', amount: '-114.09' });
  assert.deepEqual(splitTrailingMoney('Total R$ 1.135,35'), { label: 'Total', amount: '1135.35' });
  assert.equal(splitTrailingMoney('Caixa: 2000908'), null);
  assert.equal(splitTrailingMoney('Total 1.13,35'), null);
});

test('SmartTEF ausente permanece null (nunca 0.00) e não bloqueia a reconciliação', () => {
  const noTef = FIXTURE.slice(0, FIXTURE.indexOf('TRANSAÇÕES SMARTTEF'));
  const r = parseClosingText(noTef);
  assert.equal(r.detail.smartTefTotal, null);
  assert.deepEqual(r.detail.smartTefLines, []);
  assert.ok(codes(r).includes('SMARTTEF_SECTION_ABSENT'));
  assert.equal(r.reconciliation.recalculated?.totalCalculated, '7500.67');
  assert.ok(!JSON.stringify(r).includes('smartTefPrinted'));
  assert.equal(r.parseStatus, 'parsed_with_discrepancy');
});

test('SmartTEF com total 0,00 impresso é preservado como 0.00 (diferente de ausente)', () => {
  const r = parseClosingText(FIXTURE.replace('Total SmartTEF R$ 624,73', 'Total SmartTEF R$ 0,00'));
  assert.equal(r.detail.smartTefTotal, '0.00');
});
