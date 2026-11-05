# Protocolo de colaboração entre Claude Code e Codex

## Coordenação

**Um agente integrador (humano + assistente principal)** escolhe tarefas, aprova contratos, integra branches e faz revisão final. Claude e Codex **não são dois autores soltos no mesmo diretório**. Use 1 branch e 1 Git worktree por agente, com PRs/diffs pequenos. Escolher quem implementa por área, não por marca do modelo.

- Claude Code lê `CLAUDE.md` e configura `.claude/agents/*.md`.
- Codex lê `AGENTS.md` e pode usar `.codex/agents/*.toml`.
- Ambos obedecem à mesma fonte de verdade `docs/CONTEXTO_MESTRE_SISTEMA_FINANCEIRO.md`.
- Tarefa e contrato são únicos (`docs/tasks`, `packages/contracts`), não duas versões divergentes de especificação.

## Passo a passo prático

Na pasta do repositório inicializado:

```bash
git init
git add .
git commit -m "chore: estrutura inicial multiagentes"

git worktree add ../financeiro-db -b feat/task-001-db
git worktree add ../financeiro-importador -b feat/task-002-importador
git worktree add ../financeiro-web -b feat/task-004-web

# Em terminais independentes, inicie:
# terminal A: cd ../financeiro-db && codex
# terminal B: cd ../financeiro-importador && claude
# terminal C: cd ../financeiro-web && codex (ou claude)
```

**Observação:** comandos de execução de agentes variam pela instalação/assinatura. Não use `--yolo` nem remova solicitações de permissão para contornar bloqueios. Subagentes sem isolamento de arquivos não substituem worktrees.

## Delegação recomendada

1. Coordenador define `TASK-XXX`, branch, arquivos permitidos, interfaces, dependências, teste de aceite e checkpoint.
2. Agente lê contexto e tarefa. Se encontrar ambiguidade, registra suposição reversível e risco, sem mudar semântica financeira.
3. Agente modifica somente arquivos da área. Mudanças em schema/contratos/deps globais exigem mensagem ao integrador.
4. Agente testa e prepara relatório conforme `docs/templates/HANDOFF.md`.
5. Revisor independente lê diff + contexto, reporta problemas em ordem de gravidade.
6. Integrador faz merge/cherry-pick **apenas após contratos estáveis, CI e revisão**.

## Política de concorrência

**Pode ocorrer em paralelo:** parser puro do PDF, montagem visual sem API definitiva, pesquisa/adapter Evolution com contratos isolados. **Deve ocorrer em série:** migrations Prisma; auth/RBAC antes do bot de consultas; criação de pagamentos antes da baixa de sangrias; tabelas antes da persistência; consulta read-only após serviços de leitura.

## Definition of Done (DoD)

- [ ] Requisitos e casos de aceite da tarefa satisfeitos.
- [ ] Nenhuma quebra de RN-01 a RN-16 do contexto mestre.
- [ ] Testes unitários/integrados novos executados; registrar comando e resultado.
- [ ] Contratos validados, sem arquivos de outro agente reescritos.
- [ ] Logs não contêm chaves ou conteúdo sensível desnecessário.
- [ ] Migrações revisadas, sem drop ou alteração destrutiva implícita.
- [ ] Código revisado por outro agente ou humano.
- [ ] Handoff preenchido: mudanças, evidências, riscos e pendências.

## Prompt de abertura para coordenador

> Leia `AGENTS.md`, `CLAUDE.md`, `docs/CONTEXTO_MESTRE_SISTEMA_FINANCEIRO.md`, `docs/MULTI_AGENT_WORKFLOW.md` e as tarefas em `docs/tasks/ready/`. Proponha a ordem de execução com dependências e um dono por área. Não modifique código nem contratos compartilhados antes de estabelecer ownership. Delegue tarefas independentes em worktrees separados. Nunca trate sangrias como despesas por padrão nem SmartTEF como receita adicional.
