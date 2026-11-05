# Board de tarefas versionado

A pasta contém **instruções para agentes**, não tarefas sendo executadas automaticamente. Cada tarefa tem dependências, caminhos permitidos, aceite e evidência de execução. O integrador move o arquivo de `ready/` para `in-progress/` e `done/` com um commit de coordenação (não é um lock distribuído; usar Git branch/worktree e PR).

## Sequência

| Tarefa | Estado inicial | Agente | Depende de |
|---|---|---|---|
| TASK-001 | ready | arquitetura-db | — |
| TASK-002 | ready | importador-caixa | — (não editar schema) |
| TASK-003 | ready | integracoes-whatsapp-ia | — (versão Evolution deve ser validada) |
| TASK-004 | ready | frontend | — (sem consumir API ainda) |
| TASK-005 | backlog | backend-financeiro | TASK-001 |
| TASK-006 | backlog | orquestrador-jobs | TASK-001, 002, 003, 005 |
| TASK-007 | backlog | integracoes-whatsapp-ia | TASK-001, 003, 005 |
| TASK-008 | backlog | revisor-seguranca | 001–007, conforme PR |

As tarefas paralelas **não podem modificar arquivos compartilhados** simultaneamente. TASK-002 cria parser em `packages/domain`, TASK-003 cria adapters em `packages/integrations` e TASK-004 cria telas sem contrato back-end até TASK-005.
