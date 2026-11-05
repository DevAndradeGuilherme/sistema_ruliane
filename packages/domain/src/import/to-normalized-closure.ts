import type { ParsedClosing } from './types.ts';

/** Converte somente os campos do contrato; evidências e reconciliação ficam no ParsedClosing. */
export function toNormalizedClosure(parsed: ParsedClosing) {
  const entry = (item: { labelRaw: string; amount: string | null }) => ({
    labelRaw: item.labelRaw,
    amount: item.amount,
  });

  return {
    parserVersion: parsed.parserVersion,
    number: parsed.number,
    terminal: parsed.terminal,
    operatorCode: parsed.operatorCode,
    operatorName: parsed.operatorName,
    openedAtLocal: parsed.openedAtLocal,
    closedAtLocal: parsed.closedAtLocal,
    statusRaw: parsed.statusRaw,
    summary: { ...parsed.summary },
    detail: {
      cashSales: parsed.detail.cashSales,
      cashWithdrawalsTotal: parsed.detail.cashWithdrawalsTotal,
      cashNet: parsed.detail.cashNet,
      otherEntries: parsed.detail.otherEntries.map(entry),
      otherEntriesTotal: parsed.detail.otherEntriesTotal,
      calculatedReportTotalPrinted: parsed.detail.calculatedReportTotalPrinted,
      variancePrinted: parsed.detail.variancePrinted,
      smartTefTotal: parsed.detail.smartTefTotal,
      smartTefLines: parsed.detail.smartTefLines.map(entry),
    },
    withdrawals: parsed.withdrawals.map(entry),
    validationWarnings: [...parsed.validationWarnings],
  };
}
