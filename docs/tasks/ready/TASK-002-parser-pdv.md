# TASK-002 — Parser determinístico para fechamento de caixa

**Agente:** importador-caixa. **Branch:** `feat/task-002-importador`. **Pré-requisitos:** nenhum; não modificar schema.

**Ownership:** novos arquivos sob `packages/domain/src/import/`, testes sob `packages/domain/test/`; reutilizar `closing.ts`. Se o contrato Zod precisar de ajuste, propor ao integrador.

## Escopo

1. Parser de **texto** do extrato do PDV, preservando seções e rótulos de origem; a conversão PDF binário → texto será conectada posteriormente.
2. Extrair cabeçalho, resumo, entradas em dinheiro, saídas/sangrias, outras entradas, SmartTEF.
3. Normalizar dinheiro para strings decimais, sem float; alertar campos ausentes/ambíguos.
4. Reconciliar sem mudar números impressos; sinalizar diferença -114,09 e quatro sangrias sem classificação.
5. Estruturar caminho para fallback OpenAI sem implementá-lo nesta task.

## Critérios de aceite

- Casos T01–T05 passam com texto de fixture sem identificação, não requer dados de empresa em Git.
- Reprocessar mesmo texto produz o mesmo JSON normalizado (sem criar lançamentos no banco).
- Não somar SmartTEF ou seções resumo+detalhe duas vezes.
- Se linha não casar, manter `raw` e marcar revisão, não inventar dados.

**Fora do escopo:** upload, banco, OCR, IA, webhooks.
