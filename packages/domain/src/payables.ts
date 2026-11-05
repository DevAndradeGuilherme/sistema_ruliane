import { decimalStringToCents, centsToDecimalString } from './money.ts';

/** Saldo de uma conta após pagamentos confirmados (não inclui pagamentos estornados). */
export function pendingPayableBalance(
  amountExpected: string,
  paymentsConfirmed: readonly string[],
): string {
  const expected = decimalStringToCents(amountExpected);
  if (expected < 0n) throw new Error('Conta com valor negativo');
  let paid = 0n;
  for (const amount of paymentsConfirmed) {
    const cents = decimalStringToCents(amount);
    if (cents <= 0n) throw new Error('Pagamento deve ser positivo');
    paid += cents;
  }
  if (paid > expected) throw new Error('Pagamento excede valor previsto');
  return centsToDecimalString(expected - paid);
}
