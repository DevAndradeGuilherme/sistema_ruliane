# Contratos de leitura para a TASK-004

Todos os endpoints abaixo exigem sessão; `organizationId` e papel vêm do servidor. PROPRIETARIA tem somente leitura. Valores monetários são strings decimais com duas casas; data civil é `YYYY-MM-DD`; timestamps são ISO UTC. Listas têm `{items,total,page,pageSize}` com páginas de 50, exceto dashboard/relatório.

| Tela | Endpoint implementado | Campos e semântica |
|---|---|---|
| Dashboard | `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` | `period`, `pdv` (soma de **valor de fechamento impresso**, quantidade incluída/ausente e revisão), `expenses` por origem, `pendingPayables` e próximos 10 vencimentos, `reviewIssues`, `limitations`. Schema Zod server-side em `apps/web/src/response-contracts.ts`. `coverage` é `UNKNOWN` ou `REVIEW_REQUIRED`; nunca afirma completude sem cadastro dos turnos esperados. |
| Contas | `GET /api/payables?status=&from=&to=&supplier=&page=` | `id`, `description`, `supplier`, `dueDate`, `amountExpected`, `balance`, `status`, `installmentNumber`. Saldo usa centavos do domínio e pagamentos não estornados. |
| Detalhe | `GET /api/payables/:id`, `GET /api/payables/:id/audit` | Conta com saldo, parcelas da mesma série, pagamentos, meio efetivo, data e `cashMovementId`; auditoria paginada até 100 eventos. Instrumentos estruturados aguardam aprovação de schema. |
| Fechamentos | `GET /api/closures?date=&operator=&reviewStatus=&page=`, `GET /api/closures/:id` | Valores impressos/recalculados separados, revisão, linhas por seção e sangrias. Detalhe inclui `normalized` original salvo no `ImportJob`, com campos ausentes `null` e SmartTEF em seção própria. Nenhuma soma de SmartTEF no dashboard. |
| Sangrias | `GET /api/cash-movements?classification=&from=&to=&page=` | Fechamento/data, texto e valor originais, classificação, vínculo a pagamento ou despesa. Data filtra `businessDate` do fechamento. |
| Revisão | `GET /api/review-issues?pendingOnly=true&page=` | Código, gravidade, origem, campos esperado/observado, totais e diferença impressa quando há fechamento, estado resolvido. |
| Relatórios | `GET /api/reports/summary?from=&to=` | Mesmo contrato de resumo do dashboard, com naturezas e limitações explícitas. Não há saldo bancário nem conciliação de recebíveis. |

O contrato de resposta foi verificado por `summaryResponseSchema` em tempo de execução e por teste integrado com fechamento sintético no PostgreSQL DEV. Os demais formatos seguem os campos listados acima e precisam de teste HTTP com sessão da TASK-004 antes de conectar a interface. Nenhum campo ausente é substituído por zero no fechamento; ausência de documento retorna `pdv.amount: null`, enquanto uma soma sobre lista vazia de despesas/contas retorna `"0.00"` com contagem zero e limitação de cobertura. Não inferir que 3–4 fechamentos por dia foram todos importados.

Escrita de conta: `POST /api/payables` exige `Idempotency-Key` UUID v4 estável por tentativa. Resposta `201` na criação e `200` no reenvio idêntico; chave reutilizada com outro conteúdo retorna `409`. O UUID se torna o ID da conta, garantido pela PK do PostgreSQL. O frontend não deve trocar a chave ao repetir uma requisição cujo resultado de rede é desconhecido.
