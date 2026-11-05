import { brMoneyToCents, centsToDecimalString } from '../money.ts';

/** Normaliza quebras de linha, NBSP e tabs; NÃO altera conteúdo visível. */
export function splitLines(text: string): string[] {
  return text
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll(' ', ' ')
    .replaceAll('\t', ' ')
    .split('\n')
    .map((l) => l.replace(/\s+$/u, ''));
}

/** Minúsculas, sem acentos, espaços colapsados: usado apenas para comparar rótulos. */
export function foldLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const TRAILING_MONEY = /^(.*?)(?:(-)\s*)?(?:R\$\s*)?(?:(-)\s*)?(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\s*$/u;

export type SplitMoney = { label: string; amount: string };

/**
 * Separa "rótulo ... R$ 1.135,35" em rótulo + decimal string.
 * Aceita "-R$ 114,09", "R$ -114,09" e "-114,09". Retorna null se a linha
 * não termina em valor pt-BR válido (nunca adivinha).
 */
export function splitTrailingMoney(line: string): SplitMoney | null {
  const m = TRAILING_MONEY.exec(line.trim());
  if (!m) return null;
  const [, labelPart = '', sign1, sign2, integer = '', cents = ''] = m;
  const negative = Boolean(sign1) || Boolean(sign2);
  const label = labelPart.replace(/[\s:.\-–—]+$/u, '').trim();
  const brText = `${negative ? '-' : ''}${integer},${cents}`;
  try {
    return { label, amount: centsToDecimalString(brMoneyToCents(brText)) };
  } catch {
    return null;
  }
}

/** "30/10/2026 15:11" -> "2026-10-30T15:11:00"; null se inválido. */
export function toLocalIso(date: string, time: string): string | null {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [day, month, year, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${d[3]}-${d[2]}-${d[1]}T${t[1]}:${t[2]}:00`;
}
