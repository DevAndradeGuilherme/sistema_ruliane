# Handoff — TASK-004

**Agente:** frontend  
**Branch/worktree:** `feat/task-004-web` / `financeiro-web`  
**Status:** concluído para o shell visual; integração de dados pendente da TASK-005

## Alterações

- Arquivos alterados: `apps/web/app/**` (layout, estilos, páginas e componentes locais).
- Contratos compartilhados alterados: nenhum.
- Rotas de interface: `/`, `/contas`, `/contas/[id]`, `/fechamentos`, `/sangrias`, `/revisao`, `/relatorios`.
- Estados de carregamento, erro e página inexistente estão no App Router. Dados ausentes são informados explicitamente. Não há ações de gravação.

## Interfaces necessárias para integração com a TASK-005

Todas as consultas devem ser autorizadas no servidor, com `organizationId` extraído da sessão. Valores monetários em JSON devem vir como **decimal string** (`"1234.56"`); datas civis em `YYYY-MM-DD`; timestamps com fuso explícito. `null` significa indisponível, sem estimativa visual.

| Tela | Consulta de leitura esperada | Campos necessários |
|---|---|---|
| Dashboard | `GET /api/dashboard?from=&to=` | período e completude; entradas informadas pelo PDV, despesas pagas, saldo de contas em aberto e contagem de pendências, cada um com natureza e origem; próximos vencimentos |
| Contas | `GET /api/payables?status=&from=&to=&supplier=` | `id`, fornecedor/descrição, vencimento, valor original, saldo pendente, parcela, status, paginação |
| Detalhe | `GET /api/payables/:id` e pagamentos da conta | obrigação, parcelas e pagamentos com valor, data efetiva, meio, origem, vínculo com sangria e status de confirmação |
| Fechamentos | `GET /api/closures?date=&operator=&reviewStatus=` e detalhe | data/hora, turno se conhecido, número do caixa, terminal, operador, valor impresso, total apurado, diferença impressa, status de revisão; resumo e detalhamento por forma, SmartTEF em seção própria |
| Sangrias | `GET /api/cash-movements?classification=&from=&to=` | fechamento de origem, data, descrição original, valor, classificação, vínculo com despesa/pagamento, status de revisão |
| Revisão | consulta paginada de pendências | tipo, origem, motivo, valor impresso/apurado/diferença quando aplicável, data, estado de revisão |
| Relatórios | `GET /api/reports/*?from=&to=` | período, completude, natureza do total, agrupamentos de contas/despesas/PDV/divergências, pendências que limitem interpretação |

Os caminhos seguem a proposta em `docs/CONTEXTO_MESTRE_SISTEMA_FINANCEIRO.md`; a TASK-005 deve confirmar as respostas antes de ligar as telas. A UI não calcula saldos ou conciliações. `formatCivilDate` e `formatBRL` são apenas apresentação.

## Validação

- Comando: `corepack pnpm --filter @financeiro/web typecheck` — passou.
- Comando: `corepack pnpm --filter @financeiro/web build` — passou fora do sandbox; a primeira execução compilou, mas recebeu `spawn EPERM` no sandbox.
- Comando: `node --experimental-strip-types --test packages/domain/test/*.test.ts` — 5 testes passaram.
- Casos cobertos: navegação estática, estados vazios, carregamento e erro; distinção visual entre grandezas financeiras. Sem testes de domínio novos porque nenhuma regra financeira foi alterada.

## Riscos e limites

- Listagens e filtros são estrutura visual sem consultas ativas. Não há autenticação nem API nesta tarefa.
- `app/error.tsx` trata erros de segmentos; falha do layout raiz exige tratamento próprio na integração.
- Detalhe `/contas/[id]` ainda não busca dados; nenhum identificador é mostrado como conta real.

## Pendências para o integrador

- Confirmar formato de resposta e paginação com a TASK-005; conectar leitura e filtros sem expor dados fora do escopo da sessão.
- Rever a apresentação com dados autorizados de homologação e validar responsividade/acessibilidade no navegador.
