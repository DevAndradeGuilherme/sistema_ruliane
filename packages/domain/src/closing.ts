import { decimalStringToCents, centsToDecimalString } from './money.ts';

export type ClosureReconciliationInput = {
  /** Os valores devem ser strings "123.45" obtidas de um documento. */
  cashSales: string;
  cashWithdrawals: string;
  cashNetPrinted: string;
  otherEntriesPrinted: string;
  totalCalculatedPrinted: string;
  closingTotalPrinted: string;
  variancePrinted: string;
  summaryDebit: string;
  detailedDebit: string;
  summaryDue: string;
  detailedDue: string;
  smartTefPrinted: string;
};

export type ReconciliationIssue = {
  code: string;
  difference: string;
};

/**
 * Confere aritmética sem modificar os campos originais do documento.
 * SmartTEF é SUBCONJUNTO informativo: não se soma a estas entradas.
 */
export function reconcileClosure(input: ClosureReconciliationInput) {
  const c = decimalStringToCents;
  const netCalculated = c(input.cashSales) - c(input.cashWithdrawals);
  const detailTotalCalculated = netCalculated + c(input.otherEntriesPrinted);
  const varianceCalculated = c(input.closingTotalPrinted) - detailTotalCalculated;
  const debitDifference = c(input.summaryDebit) - c(input.detailedDebit);
  const dueDifference = c(input.summaryDue) - c(input.detailedDue);
  const issues: ReconciliationIssue[] = [];

  function mismatch(code: string, difference: bigint): void {
    if (difference !== 0n) issues.push({ code, difference: centsToDecimalString(difference) });
  }

  mismatch('CASH_SUBTOTAL_MISMATCH', c(input.cashNetPrinted) - netCalculated);
  mismatch('DETAIL_TOTAL_MISMATCH', c(input.totalCalculatedPrinted) - detailTotalCalculated);
  mismatch('REPORTED_VARIANCE_MISMATCH', c(input.variancePrinted) - varianceCalculated);
  mismatch('SUMMARY_DETAIL_DEBIT_MISMATCH', debitDifference);
  mismatch('SUMMARY_DETAIL_VENCIMENTO_MISMATCH', dueDifference);
  mismatch('CASH_VARIANCE_NONZERO', varianceCalculated);

  return {
    original: { ...input },
    recalculated: {
      cashNet: centsToDecimalString(netCalculated),
      totalCalculated: centsToDecimalString(detailTotalCalculated),
      variance: centsToDecimalString(varianceCalculated),
    },
    issues,
    requiresReview: issues.length > 0,
  };
}
