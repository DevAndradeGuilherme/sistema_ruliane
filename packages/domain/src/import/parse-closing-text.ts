import { centsToDecimalString, decimalStringToCents } from '../money.ts';
import { reconcileClosure } from '../closing.ts';
import { foldLabel, splitLines, splitTrailingMoney, toLocalIso } from './text.ts';
import {
  PARSER_VERSION,
  type ClosureSection,
  type OtherEntry,
  type ParseIssue,
  type ParsedClosing,
  type ParsedEntry,
  type ParseStatus,
  type PaymentMethod,
  type RawLine,
  type Withdrawal,
} from './types.ts';

/** Issues que indicam extração incompleta/ambígua (não apenas divergência do documento). */
const EXTRACTION_CODES = new Set([
  'MISSING_FIELD',
  'UNRECOGNIZED_LINE',
  'DUPLICATE_FIELD_CONFLICT',
  'INVALID_DATETIME',
  'AMBIGUOUS_DETAIL_METHOD',
  'RECONCILIATION_SKIPPED',
  'SMARTTEF_TOTAL_MISSING',
]);

const REQUIRED_FIELDS: readonly string[] = [
  'number',
  'terminal',
  'operatorCode',
  'operatorName',
  'openedAtLocal',
  'closedAtLocal',
  'statusRaw',
  'summary.cashNet',
  'summary.credit',
  'summary.debit',
  'summary.due',
  'summary.pixTransfer',
  'summary.reportedCloseTotal',
  'detail.cashSales',
  'detail.cashWithdrawalsTotal',
  'detail.cashNet',
  'detail.otherEntriesTotal',
  'detail.calculatedReportTotalPrinted',
  'detail.variancePrinted',
];

const SUMMARY_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^dinheiro\b/, 'summary.cashNet'],
  [/^credito\b/, 'summary.credit'],
  [/^vencimento\b/, 'summary.due'],
  [/^debito\b/, 'summary.debit'],
  [/^(transf(\.|erencia)? ?pix|pix)\b/, 'summary.pixTransfer'],
];

/** Totais/rótulos únicos reconhecidos em qualquer seção (ordem importa: "diferença" antes de "VF"). */
const TOTAL_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^diferenca\b/, 'detail.variancePrinted'],
  [/^(valor do fechamento|vf)\b/, 'summary.reportedCloseTotal'],
  [/^total (do caixa )?apurado\b/, 'detail.calculatedReportTotalPrinted'],
  [/^total (de )?sangrias?\b/, 'detail.cashWithdrawalsTotal'],
  [/^subtotal dinheiro\b/, 'detail.cashNet'],
  [/^outras entradas\b/, 'detail.otherEntriesTotal'],
  [/^total smarttef\b/, 'detail.smartTefTotal'],
];

function methodOf(label: string): PaymentMethod | null {
  const f = foldLabel(label);
  if (/boleto/.test(f)) return 'BOLETO';
  if (/vencimento/.test(f)) return 'VENCIMENTO';
  if (/credito/.test(f)) return 'CREDITO';
  if (/debito/.test(f)) return 'DEBITO';
  if (/transf|pix/.test(f)) return 'TRANSF_PIX';
  if (/dinheiro/.test(f)) return 'DINHEIRO';
  return null;
}

function sectionHeader(folded: string): ClosureSection | 'DETAIL' | 'TITLE' | null {
  if (/^fechamento de caixa$/.test(folded)) return 'TITLE';
  if (/^resumo\b/.test(folded)) return 'SUMMARY';
  if (/^detalhamento\b/.test(folded)) return 'DETAIL';
  if (/^entradas em dinheiro\b/.test(folded)) return 'CASH_ENTRIES';
  if (/^(saidas|sangrias)( ?\/ ?(saidas|sangrias))?$/.test(folded)) return 'WITHDRAWALS';
  if (/^outras entradas$/.test(folded)) return 'OTHER_ENTRIES';
  if (/^transacoes smarttef\b/.test(folded)) return 'SMARTTEF';
  return null;
}

/**
 * Parser determinístico do TEXTO do fechamento de caixa do PDV.
 *
 * - Puro: sem I/O, sem relógio, sem aleatoriedade; mesmo texto => mesmo JSON.
 * - Não converte PDF/OCR; recebe o texto já extraído.
 * - Nunca estima: campo ausente = null + issue; linha desconhecida => issue com `raw`.
 * - Números impressos são preservados; divergências são sinalizadas, não corrigidas.
 * - SmartTEF é detalhe informativo e nunca entra em somas.
 */
export function parseClosingText(text: string): ParsedClosing {
  const lines = splitLines(text);
  const values = new Map<string, string>();
  const issues: ParseIssue[] = [];
  const rawLines: RawLine[] = [];
  const otherEntries: OtherEntry[] = [];
  const withdrawals: Withdrawal[] = [];
  const smartTefLines: ParsedEntry[] = [];
  let section: ClosureSection = 'HEADER';
  let smartTefSeen = false;

  function setOnce(field: string, value: string, raw: string, line: number): void {
    const existing = values.get(field);
    if (existing === undefined) {
      values.set(field, value);
    } else if (existing !== value) {
      issues.push({
        code: 'DUPLICATE_FIELD_CONFLICT',
        severity: 'high',
        field,
        message: `Campo repetido com valor diferente; mantido o primeiro (${existing}).`,
        raw,
        line,
      });
    }
  }

  function unrecognized(raw: string, line: number): void {
    issues.push({
      code: 'UNRECOGNIZED_LINE',
      severity: 'warning',
      message: 'Linha não reconhecida; preservada em raw, nada foi inferido.',
      raw,
      line,
    });
  }

  function headerField(raw: string, line: number): boolean {
    let matched = false;
    const dt = (re: RegExp, field: string): boolean => {
      const m = re.exec(raw);
      if (!m) return false;
      const iso = toLocalIso(m[1] ?? '', m[2] ?? '');
      if (iso === null) {
        issues.push({
          code: 'INVALID_DATETIME',
          severity: 'warning',
          field,
          message: 'Data/hora inválida no documento.',
          raw,
          line,
        });
      } else {
        setOnce(field, iso, raw, line);
      }
      return true;
    };
    const dateTime = String.raw`(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})`;
    if (dt(new RegExp(String.raw`^abertura\s*:?\s*${dateTime}`, 'iu'), 'openedAtLocal')) return true;
    if (
      dt(
        new RegExp(String.raw`^data(?:\s+do\s+relat[oó]rio)?(?:\s*/\s*fechamento)?\s*:?\s*${dateTime}`, 'iu'),
        'closedAtLocal',
      )
    ) {
      return true;
    }
    const caixa = /\bcaixa\s*(?:n[º°o.]*)?\s*:?\s*(\d+)/iu.exec(raw);
    if (caixa?.[1]) {
      setOnce('number', caixa[1], raw, line);
      matched = true;
    }
    const terminal = /\bterminal\s*:?\s*(\d+)/iu.exec(raw);
    if (terminal?.[1]) {
      setOnce('terminal', terminal[1], raw, line);
      matched = true;
    }
    if (matched) return true;
    const operator = /^operador\s*:?\s*(\d+)\s*[-–—]\s*(.+)$/iu.exec(raw.trim());
    if (operator?.[1] && operator[2]) {
      setOnce('operatorCode', operator[1], raw, line);
      setOnce('operatorName', operator[2].trim(), raw, line);
      return true;
    }
    const status = /^situa[cç][aã]o\s*:?\s*(.+)$/iu.exec(raw.trim());
    if (status?.[1]) {
      setOnce('statusRaw', status[1].trim(), raw, line);
      return true;
    }
    return false;
  }

  lines.forEach((rawUntrimmed, index) => {
    const line = index + 1;
    const raw = rawUntrimmed.trim();
    if (raw === '' || /^[-=_*\s]+$/u.test(raw)) return;
    const folded = foldLabel(raw);
    const money = splitTrailingMoney(raw);

    if (money === null) {
      const header = sectionHeader(folded);
      if (header === 'TITLE' || header === 'DETAIL') {
        rawLines.push({ line, section, raw });
        return;
      }
      if (header !== null) {
        section = header;
        if (header === 'SMARTTEF') smartTefSeen = true;
        rawLines.push({ line, section, raw });
        return;
      }
      rawLines.push({ line, section, raw });
      if (section === 'HEADER' && headerField(raw, line)) return;
      unrecognized(raw, line);
      return;
    }

    rawLines.push({ line, section, raw });
    const label = foldLabel(money.label);

    // Totais únicos: valem em qualquer seção.
    const total = TOTAL_LABELS.find(([re]) => re.test(label));
    if (total) {
      if (total[1] === 'detail.smartTefTotal') smartTefSeen = true;
      setOnce(total[1], money.amount, raw, line);
      return;
    }

    switch (section) {
      case 'SUMMARY': {
        const target = SUMMARY_LABELS.find(([re]) => re.test(label));
        if (target) setOnce(target[1], money.amount, raw, line);
        else unrecognized(raw, line);
        return;
      }
      case 'CASH_ENTRIES':
        if (/^vendas em dinheiro\b/.test(label)) setOnce('detail.cashSales', money.amount, raw, line);
        else unrecognized(raw, line);
        return;
      case 'WITHDRAWALS':
        withdrawals.push({
          labelRaw: money.label,
          amount: money.amount,
          raw,
          line,
          classification: 'NAO_CLASSIFICADA',
        });
        return;
      case 'OTHER_ENTRIES':
        otherEntries.push({
          labelRaw: money.label,
          amount: money.amount,
          raw,
          line,
          method: methodOf(money.label),
        });
        return;
      case 'SMARTTEF':
        smartTefLines.push({ labelRaw: money.label, amount: money.amount, raw, line });
        return;
      default:
        unrecognized(raw, line);
    }
  });

  // Vendas do detalhamento por método (para conferir resumo x detalhe).
  function detailAmount(method: PaymentMethod, field: string): string | null {
    const hits = otherEntries.filter((e) => e.method === method);
    if (hits.length === 1) return hits[0]?.amount ?? null;
    issues.push({
      code: hits.length === 0 ? 'MISSING_FIELD' : 'AMBIGUOUS_DETAIL_METHOD',
      severity: 'warning',
      field,
      message:
        hits.length === 0
          ? `Linha de detalhamento ${method} não encontrada.`
          : `Mais de uma linha de detalhamento ${method}; nada foi somado ou escolhido.`,
      count: hits.length,
    });
    return null;
  }

  const get = (key: string): string | null => values.get(key) ?? null;

  for (const field of REQUIRED_FIELDS) {
    if (!values.has(field)) {
      issues.push({ code: 'MISSING_FIELD', severity: 'warning', field, message: `Campo ausente: ${field}.` });
    }
  }

  if (!smartTefSeen) {
    issues.push({
      code: 'SMARTTEF_SECTION_ABSENT',
      severity: 'info',
      field: 'detail.smartTefTotal',
      message: 'Seção/total SmartTEF não encontrados; permanece null.',
    });
  } else if (!values.has('detail.smartTefTotal') && smartTefLines.length > 0) {
    issues.push({
      code: 'SMARTTEF_TOTAL_MISSING',
      severity: 'warning',
      field: 'detail.smartTefTotal',
      message: 'Linhas SmartTEF sem total impresso.',
    });
  }

  const debitDetail = detailAmount('DEBITO', 'detail.otherEntries[DEBITO]');
  const dueDetail = detailAmount('VENCIMENTO', 'detail.otherEntries[VENCIMENTO]');

  // Conferências de soma entre itens e totais impressos (apenas sinalizam).
  const sum = (items: readonly { amount: string | null }[]): bigint =>
    items.reduce((acc, i) => acc + (i.amount === null ? 0n : decimalStringToCents(i.amount)), 0n);
  function sumCheck(code: string, field: string, items: readonly { amount: string | null }[], printed: string | null): void {
    if (printed === null) return;
    const diff = decimalStringToCents(printed) - sum(items);
    if (diff !== 0n) {
      issues.push({
        code,
        severity: 'warning',
        field,
        message: 'Soma dos itens difere do total impresso; ambos preservados.',
        difference: centsToDecimalString(diff),
      });
    }
  }
  sumCheck('WITHDRAWALS_SUM_MISMATCH', 'withdrawals', withdrawals, get('detail.cashWithdrawalsTotal'));
  sumCheck('OTHER_ENTRIES_SUM_MISMATCH', 'detail.otherEntries', otherEntries, get('detail.otherEntriesTotal'));
  if (smartTefLines.length > 0) {
    sumCheck('SMARTTEF_LINES_SUM_MISMATCH', 'detail.smartTefLines', smartTefLines, get('detail.smartTefTotal'));
  }

  if (withdrawals.length > 0) {
    issues.push({
      code: 'WITHDRAWALS_REQUIRE_CLASSIFICATION',
      severity: 'warning',
      field: 'withdrawals',
      message: 'Sangrias não são despesas automaticamente; exigem classificação.',
      count: withdrawals.length,
      total: centsToDecimalString(sum(withdrawals)),
    });
  }

  // Reconciliação aritmética reutilizando closing.ts, somente com todos os campos impressos.
  const needed = {
    cashSales: get('detail.cashSales'),
    cashWithdrawals: get('detail.cashWithdrawalsTotal'),
    cashNetPrinted: get('detail.cashNet'),
    otherEntriesPrinted: get('detail.otherEntriesTotal'),
    totalCalculatedPrinted: get('detail.calculatedReportTotalPrinted'),
    closingTotalPrinted: get('summary.reportedCloseTotal'),
    variancePrinted: get('detail.variancePrinted'),
    summaryDebit: get('summary.debit'),
    detailedDebit: debitDetail,
    summaryDue: get('summary.due'),
    detailedDue: dueDetail,
  };
  let recalculated: ParsedClosing['reconciliation']['recalculated'] = null;
  const missing = Object.entries(needed)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (missing.length > 0) {
    issues.push({
      code: 'RECONCILIATION_SKIPPED',
      severity: 'warning',
      message: `Reconciliação não executada; faltam: ${missing.join(', ')}.`,
    });
  } else {
    const result = reconcileClosure({
      ...(needed as { [K in keyof typeof needed]: string }),
      // smartTefPrinted não participa de nenhuma conta em reconcileClosure (SmartTEF é detalhe).
      smartTefPrinted: get('detail.smartTefTotal') ?? '0.00',
    });
    recalculated = result.recalculated;
    for (const i of result.issues) {
      issues.push({
        code: i.code,
        severity: i.code.startsWith('SUMMARY_DETAIL') ? 'warning' : 'high',
        message: 'Divergência apurada; valores impressos preservados, nada foi corrigido.',
        difference: i.difference,
      });
    }
  }

  const extractionIncomplete = issues.some((i) => EXTRACTION_CODES.has(i.code));
  const parseStatus: ParseStatus = extractionIncomplete
    ? 'needs_review'
    : issues.some((i) => i.severity !== 'info')
      ? 'parsed_with_discrepancy'
      : 'parsed';

  return {
    parserVersion: PARSER_VERSION,
    parseStatus,
    requiresReview: parseStatus !== 'parsed',
    number: get('number'),
    terminal: get('terminal'),
    operatorCode: get('operatorCode'),
    operatorName: get('operatorName'),
    openedAtLocal: get('openedAtLocal'),
    closedAtLocal: get('closedAtLocal'),
    statusRaw: get('statusRaw'),
    summary: {
      cashNet: get('summary.cashNet'),
      credit: get('summary.credit'),
      debit: get('summary.debit'),
      due: get('summary.due'),
      pixTransfer: get('summary.pixTransfer'),
      reportedCloseTotal: get('summary.reportedCloseTotal'),
    },
    detail: {
      cashSales: get('detail.cashSales'),
      cashWithdrawalsTotal: get('detail.cashWithdrawalsTotal'),
      cashNet: get('detail.cashNet'),
      otherEntries,
      otherEntriesTotal: get('detail.otherEntriesTotal'),
      calculatedReportTotalPrinted: get('detail.calculatedReportTotalPrinted'),
      variancePrinted: get('detail.variancePrinted'),
      smartTefTotal: get('detail.smartTefTotal'),
      smartTefLines,
    },
    withdrawals,
    reconciliation: { recalculated },
    issues,
    validationWarnings: issues.map((i) => i.code),
    rawLines,
  };
}
