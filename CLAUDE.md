# Claude Code — início rápido

Leia primeiro `AGENTS.md` e `docs/CONTEXTO_MESTRE_SISTEMA_FINANCEIRO.md`. Estas são as regras comuns a Claude Code e Codex. **Não copie a especificação inteira para este arquivo**: mantenha-o pequeno.

- Agentes especializados estão em `.claude/agents/`; seleção por escopo e tarefa.
- Regras condicionais em `.claude/rules/`.
- Atribuições e tarefas em `docs/MULTI_AGENT_WORKFLOW.md` e `docs/tasks/`.
- Para mudanças concorrentes: um Git worktree por agente. Antes de delegar edição, delimitar caminhos permitidos e critérios de aceite; evitar mudanças simultâneas em arquivos comuns.
- Para revisão, use `revisor-seguranca`, que deve apenas reportar achados, sem alterar código.
- Nunca declarar uma integração externa funcional por existir somente uma interface/stub.

Comandos locais: `corepack pnpm install`, `corepack pnpm dev`, `corepack pnpm check`; testes puros independentes de instalação: `node --experimental-strip-types --test packages/domain/test/*.test.ts`.
