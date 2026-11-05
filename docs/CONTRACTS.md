# Contratos iniciais e versionamento

## Fronteiras

- JSON financeiro: valores como decimal string (`"7386.58"`), **nunca float**.
- Data civil: `YYYY-MM-DD`; timestamp: ISO 8601 com fuso ou UTC explícito.
- O resumo, detalhamento, sangrias e SmartTEF são seções diferentes. Ver `packages/contracts/src/cash-closing.ts`.
- O extrator deve retornar campos ausentes como `null` e anexar motivo de revisão; proibir preenchimento por aproximação.
- Webhook Evolution recebido precisa de normalização para evento interno. O envelope público **não** é um contrato estável.

## Contrato de saída para importação

O normalizador gera `NormalizedClosure` com: número, terminal, operador, datas, situação, totais impressos, resumo, linhas de outras entradas, sangrias e SmartTEF. Conserva texto bruto e evidências de origem em `Document`/`ImportJob`. Persistência só depois de dedup e validação determinística.

## API de consultas da dona

Nunca fornecer ferramenta `execute_sql`. As tools devem ser interfaces server-side que incluem `organizationId` via sessão (não parâmetro do modelo) e limite de resultados: `listar_contas_a_pagar`, `resumo_contas_a_pagar`, `consultar_pagamentos`, `resumo_fechamentos`, `listar_sangrias`, `resumo_despesas`, `listar_pendencias_revisao`.

## Alteração de contrato

Somente o integrador aprova alterações compartilhadas: abrir ADR se mudar semântica financeira; atualizar consumers, fixture, schema e testes no mesmo PR; documentar breaking changes. Outros agentes podem propor alteração e aguardar aprovação. Ver `docs/MULTI_AGENT_WORKFLOW.md`.
