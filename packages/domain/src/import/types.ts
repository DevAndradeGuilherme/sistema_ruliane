/**
 * Tipos de saída do parser de TEXTO do fechamento de caixa do PDV.
 *
 * Formato espelha `NormalizedClosure` (packages/contracts/src/cash-closing.ts),
 * sem dependência de Zod, e acrescenta evidências (linha de origem), issues
 * estruturadas e a reconciliação. Valores monetários são SEMPRE strings
 * decimais ("1135.35"); campo ausente = null. Nunca estimar.
 */

export const PARSER_VERSION = 'pdv-text-1.0.0';

export type ClosureSection =
  | 'HEADER'
  | 'SUMMARY'
  | 'CASH_ENTRIES'
  | 'WITHDRAWALS'
  | 'OTHER_ENTRIES'
  | 'SMARTTEF';

export type PaymentMethod = 'DINHEIRO' | 'CREDITO' | 'DEBITO' | 'VENCIMENTO' | 'BOLETO' | 'TRANSF_PIX';

/** Item de seção com rótulo bruto preservado. */
export type ParsedEntry = {
  /** Rótulo exatamente como impresso (sem o valor). */
  labelRaw: string;
  /** Decimal string ("8.00") ou null se o valor não pôde ser lido. */
  amount: string | null;
  /** Linha completa de origem. */
  raw: string;
  /** Número da linha (1-based) no texto de entrada. */
  line: number;
};

export type OtherEntry = ParsedEntry & {
  /** Método normalizado best-effort; null se o rótulo não for reconhecido. Não reclassifica. */
  method: PaymentMethod | null;
};

export type Withdrawal = ParsedEntry & {
  /** Sangria nunca é despesa automaticamente. */
  classification: 'NAO_CLASSIFICADA';
};

export type IssueSeverity = 'info' | 'warning' | 'high';

export type ParseIssue = {
  code: string;
  severity: IssueSeverity;
  /** Campo do resultado afetado (ex.: "summary.credit"). */
  field?: string;
  message: string;
  /** Diferença decimal assinada (reconciliação). */
  difference?: string;
  /** Texto bruto envolvido (linhas não reconhecidas, conflitos). */
  raw?: string;
  line?: number;
  /** Quantidade de itens (ex.: sangrias a classificar). */
  count?: number;
  /** Total decimal relacionado ao issue. */
  total?: string;
};

export type ParseStatus =
  /** Extraído por completo, sem nenhum issue. */
  | 'parsed'
  /** Extraído por completo; há apenas divergências/pendências de conferência. */
  | 'parsed_with_discrepancy'
  /** Campo ausente/ambíguo ou linha não reconhecida: exige revisão humana. */
  | 'needs_review';

export type RawLine = { line: number; section: ClosureSection | null; raw: string };

export type ParsedClosingReconciliation = {
  /** Mesmos campos de `reconcileClosure(...).recalculated`; null se não foi possível reconciliar. */
  recalculated: { cashNet: string; totalCalculated: string; variance: string } | null;
};

export type ParsedClosing = {
  parserVersion: string;
  parseStatus: ParseStatus;
  requiresReview: boolean;

  number: string | null;
  terminal: string | null;
  operatorCode: string | null;
  operatorName: string | null;
  openedAtLocal: string | null;
  closedAtLocal: string | null;
  statusRaw: string | null;

  summary: {
    cashNet: string | null;
    credit: string | null;
    debit: string | null;
    due: string | null;
    pixTransfer: string | null;
    reportedCloseTotal: string | null;
  };

  detail: {
    cashSales: string | null;
    cashWithdrawalsTotal: string | null;
    cashNet: string | null;
    otherEntries: OtherEntry[];
    otherEntriesTotal: string | null;
    calculatedReportTotalPrinted: string | null;
    variancePrinted: string | null;
    /** Detalhamento informativo; JAMAIS somado a outras entradas/total. */
    smartTefTotal: string | null;
    smartTefLines: ParsedEntry[];
  };

  withdrawals: Withdrawal[];
  reconciliation: ParsedClosingReconciliation;
  issues: ParseIssue[];
  /** Códigos de `issues`, na mesma ordem (compatível com `validationWarnings` do contrato). */
  validationWarnings: string[];
  /** Todas as linhas não vazias, com seção atribuída, para a tela de revisão. */
  rawLines: RawLine[];
};
