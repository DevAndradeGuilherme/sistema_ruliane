/** Centavos em bigint. Retorne strings decimais no JSON e Prisma Decimal no banco. */
export type Centavos = bigint;

export function decimalStringToCents(value: string): Centavos {
  if (!/^-?\d+\.\d{2}$/.test(value)) {
    throw new Error(`Valor decimal inválido (use 2 casas): ${value}`);
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction] = unsigned.split('.');
  if (integer === undefined || fraction === undefined) {
    throw new Error('Valor decimal inválido');
  }
  const result = BigInt(integer) * 100n + BigInt(fraction);
  return negative ? -result : result;
}

/** Para valores brasileiros exibidos na agenda ou no PDF: 1.135,35. */
export function brMoneyToCents(value: string): Centavos {
  const cleaned = value.trim().replace(/^R\$\s*/, '').replaceAll(' ', '');
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(cleaned)) {
    throw new Error(`Valor monetário pt-BR inválido: ${value}`);
  }
  return decimalStringToCents(cleaned.replaceAll('.', '').replace(',', '.'));
}

export function centsToDecimalString(value: Centavos): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integer = absolute / 100n;
  const cents = absolute % 100n;
  return `${negative ? '-' : ''}${integer}.${cents.toString().padStart(2, '0')}`;
}

export function sumCents(values: readonly Centavos[]): Centavos {
  return values.reduce((sum, item) => sum + item, 0n);
}
