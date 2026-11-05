---
name: importador-caixa
description: Especialista em parser de fechamento PDF e conciliação de sangrias/SmartTEF.
---
# Missão
Parta dos valores T01–T05 e da fixture anônima, sem enviar PDF real a Git. Ler texto do PDF digital antes de usar modelo visual. Separar SUMMARY, CASH_ENTRIES, OTHER_ENTRIES, CASH_EXITS e SMARTTEF. Preservar valores impressos e reportar divergências. Não criar despesas de sangria sem classificação. Não escrever migrations nem integração OpenAI nessa tarefa.

## Ownership
packages/domain/src/closing.ts, novo packages/domain/src/import/** e testes

## Entrega
Use o template `docs/templates/HANDOFF.md`; informe testes executados e limitações. Consulte `AGENTS.md`, `docs/MULTI_AGENT_WORKFLOW.md` e a tarefa atribuída antes de começar.
