# Handoff — TASK-002

**Agente:** importador-caixa
**Branch/worktree:** `feat/task-002-importador` · `../financeiro-importador`
**Status:** concluído para revisão (sem merge) — testes e typecheck limpos; layout real do PDV **não validado** (ver limites).

## Alterações
- Novos: `packages/domain/src/import/{types,text,parse-closing-text,index}.ts`
- Novos: `packages/domain/test/import-closing.test.ts`, `packages/domain/test/fixtures/fechamento-2000908.sanitized.txt`
- Reutiliza `closing.ts` (`reconcileClosure`) e `money.ts` sem alterá-los.
- Contratos alterados: nenhum. `packages/contracts/**`, `package.json` e `src/index.ts` não foram tocados.

## API
`parseClosingText(text: string): ParsedClosing` (importar de `src/import/index.ts`).
Pura e determinística (sem relógio/aleatoriedade/I-O). Não faz upload, PDF→texto, banco, OCR, IA nem WhatsApp.

### Exemplo de saída (fixture sintética, resumido)
```json
{
  "parserVersion": "pdv-text-1.0.0",
  "parseStatus": "parsed_with_discrepancy",
  "requiresReview": true,
  "number": "2000908", "terminal": "2", "operatorCode": "67", "operatorName": "OPERADOR TESTE",
  "openedAtLocal": "2026-10-30T07:04:00", "closedAtLocal": "2026-10-30T15:11:00", "statusRaw": "Fechado",
  "summary": { "cashNet": "1135.35", "credit": "3362.04", "debit": "2003.71", "due": "210.50",
               "pixTransfer": "674.98", "reportedCloseTotal": "7386.58" },
  "detail": { "cashSales": "1349.85", "cashWithdrawalsTotal": "214.50", "cashNet": "1135.35",
              "otherEntriesTotal": "6365.32", "calculatedReportTotalPrinted": "7500.67",
              "variancePrinted": "-114.09", "smartTefTotal": "624.73" },
  "withdrawals": [{ "labelRaw": "Sangria vale lacy", "amount": "200.00", "classification": "NAO_CLASSIFICADA", "line": 24 }],
  "reconciliation": { "recalculated": { "cashNet": "1135.35", "totalCalculated": "7500.67", "variance": "-114.09" } },
  "issues": [
    { "code": "WITHDRAWALS_REQUIRE_CLASSIFICATION", "count": 4, "total": "214.50" },
    { "code": "SUMMARY_DETAIL_DEBIT_MISMATCH", "difference": "-114.00" },
    { "code": "SUMMARY_DETAIL_VENCIMENTO_MISMATCH", "difference": "-0.09" },
    { "code": "CASH_VARIANCE_NONZERO", "difference": "-114.09" }
  ]
}
```
(arrays `otherEntries`, `smartTefLines`, `rawLines` omitidos aqui.)

### Status
- `parsed`: completo, sem issues. `parsed_with_discrepancy`: completo; só divergências/pendências (ex.: sangrias a classificar, -114,09).
- `needs_review`: campo ausente/duplicado conflitante/ambíguo, data inválida ou **linha não reconhecida** (mantida em `issues[].raw`).

## Validação
- `corepack pnpm install --frozen-lockfile`: OK; `package.json` e `pnpm-lock.yaml` inalterados (o aviso do pnpm sobre build scripts ignorados não afeta este pacote).
- `corepack pnpm test` em `packages/domain`: 21 testes, 21 passam, 0 falham (5 pré-existentes + 16 do parser).
- `corepack pnpm typecheck` (`tsc -p tsconfig.json --noEmit`, tsconfig existente): sem erros.
- Centavos/sem float: busca por `Number(`, `parseFloat`, `toFixed`, `Math.`, `/ 100` em `src/import/` sem ocorrências. Texto pt-BR -> `brMoneyToCents` (bigint) -> `centsToDecimalString`; somas em `bigint`. Nenhuma operação numérica de ponto flutuante sobre dinheiro.
- SmartTEF ausente: `detail.smartTefTotal` fica `null` (+ issue `SMARTTEF_SECTION_ABSENT`, info); `0.00` só aparece se o documento imprimir 0,00 (coberto por teste). O `'0.00'` passado a `reconcileClosure` é descartado e não aparece na saída. Nenhuma correção em arquivo de outro agente foi necessária.
- Cobertos: T01–T05; 1349,85−214,50=1135,35; total 7500,67; VF 7386,58; diferença −114,09 (débito −114,00, vencimento −0,09); 4 sangrias não classificadas; SmartTEF não altera totais nem reconciliação; linha desconhecida; campo ausente; campo repetido conflitante; soma de sangrias ≠ total; texto vazio; reprocessamento idêntico (`JSON.stringify` igual; CRLF/NBSP tolerados); valor pt-BR malformado rejeitado.

## Riscos e limites
- **A fixture é sintética.** Rótulos/ordem das seções foram montados a partir dos números e rótulos documentados em `CONTEXTO_MESTRE` §3.3; o texto extraído do PDF real pode vir com ordem, quebras de linha ou colunas diferentes (ex.: rótulo e valor em linhas separadas). Validar com texto real autorizado antes de confiar; linhas fora do padrão caem em `UNRECOGNIZED_LINE`, não em dado inventado.
- As linhas SmartTEF da fixture (400,00 + 224,73) são inventadas apenas para somarem 624,73.
- `reconcileClosure` exige `smartTefPrinted`, mas não o usa em conta alguma; se o total SmartTEF faltar, o parser passa `'0.00'` só para satisfazer o tipo e descarta o valor (não aparece na saída). Melhoria opcional para o dono de `closing.ts`: tornar `smartTefPrinted` opcional/`null` e eliminar o placeholder.
- `method` em `otherEntries` é normalização best-effort; Boleto não é reclassificado como crédito/dinheiro.
- Sem conferência resumo×detalhe para Crédito (+Boleto) e Pix: só débito e vencimento, conforme `closing.ts`.
- Fallback OpenAI: não implementado. Ponto de entrada natural: quando `parseStatus === 'needs_review'` por extração incompleta, o chamador decide usar o fallback; o resultado deve passar pelas mesmas reconciliações.
- Dedup por hash/chave lógica fica fora deste parser (campos `number`, `terminal`, `closedAtLocal` estão disponíveis para a chave).

## Pendências para o integrador
- Exportar `./import/index.ts` em `packages/domain/src/index.ts` (não alterado por ownership).
- Decidir se `ParsedClosing` deve alimentar `normalizedClosureSchema` (contrato): campos são superconjunto (acrescentam `raw`, `line`, `method`, `classification`, `issues`, `rawLines`); `otherEntries`/`withdrawals` do contrato aceitam só `labelRaw`+`amount`. Proposta: mapear na borda, sem alterar o contrato agora.
- Obter texto real autorizado (fora do Git) para validar o layout e ajustar rótulos.
