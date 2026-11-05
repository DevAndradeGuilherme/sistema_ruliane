# Financeiro — monorepo preparado para Claude Code + Codex

**Status:** fundação de projeto / scaffold, **não é um sistema financeiro operacional**.

Sistema interno para duas pessoas: financeiro (web e WhatsApp) e proprietária (consultas e lembretes no WhatsApp). Compromissos da agenda são digitados manualmente; fechamentos de caixa (3–4 por dia, aproximadamente) chegam por PDF ou imagem e serão extraídos automaticamente. Pagamentos em dinheiro são registrados por sangrias, não como linhas da agenda.

**Requisitos não negociáveis:** Evolution API para WhatsApp e OpenAI para consultas da proprietária. Nenhuma IA pode executar SQL genérico, pagar contas ou inventar valores.

## Primeira leitura

1. [`AGENTS.md`](AGENTS.md) — instruções compactas de projeto para Codex e colaboradores.
2. [`CLAUDE.md`](CLAUDE.md) — orientação de entrada para Claude Code.
3. [`docs/CONTEXTO_MESTRE_SISTEMA_FINANCEIRO.md`](docs/CONTEXTO_MESTRE_SISTEMA_FINANCEIRO.md) — fonte de verdade das regras de negócio.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — divisões e contratos.
5. [`docs/MULTI_AGENT_WORKFLOW.md`](docs/MULTI_AGENT_WORKFLOW.md) — agentes, tarefas, worktrees e integração.

## Estrutura

```text
apps/web/               Next.js App Router (interface e API HTTP)
apps/worker/            processos assíncronos (BullMQ a implementar)
packages/domain/        cálculos financeiros puros e testes executáveis
packages/db/            Prisma 7, schema de partida, migrations futuras
packages/contracts/     validação de dados de entrada com Zod
packages/integrations/  portas/adaptadores Evolution API, OpenAI e S3
infra/                  serviços locais de apoio
.claude/agents/         perfis Claude Code
.codex/agents/          perfis Codex
AGENTS.md               instruções para Codex
CLAUDE.md               instruções para Claude Code
docs/tasks/             tarefas por dependência e área
```

## Primeiro uso

```bash
# Requisitos: Node 22+, Corepack, Docker + Docker Compose (opcional para testes locais)
corepack enable
corepack pnpm install
cp .env.example .env

# Infra local (PostgreSQL, Redis e MinIO)
docker compose -f infra/compose.dev.yml up -d

# Gerar cliente e iniciar schema inicial do banco (somente dev)
corepack pnpm db:validate
corepack pnpm db:generate
corepack pnpm db:migrate

# Frontend em http://localhost:3000
corepack pnpm dev
```

Se `pnpm` já estiver no PATH, substitua `corepack pnpm` por `pnpm`. `db:migrate` criará uma migração inicial **localmente**; **o coordenador deve revisar e versionar** a migração antes de produção. Em ambiente não interativo, use os comandos Prisma adequados para deploy depois de gerar as migrations.

O ponto de entrada `/api/health` é apenas **liveness**, não confirma banco/Redis/Evolution. O frontend apresenta uma tela inicial sem dados fictícios. O worker ainda precisa da implementação dos processadores antes de executar jobs reais.

### Testes já executáveis sem instalar pacotes

```bash
node --experimental-strip-types --test packages/domain/test/*.test.ts
```

Eles verificam conciliação do fechamento de exemplo (R$ 7.386,58 vs R$ 7.500,67, divergência de R$ -114,09), sangrias e saldo de contas parciais. O PDF real e a foto não são distribuídos no repositório: mantenha-os em storage privado.

## Ordem de implementação

**Base sequencial:** TASK-001 (Prisma/infra/autenticação) e contratos. Depois podem ocorrer em paralelo TASK-002 (parser do PDV), TASK-003 (Evolution), TASK-004 (web). Em seguida, serviços de contas, pagamentos, worker, bot e integração end-to-end. Veja [`docs/tasks/`](docs/tasks/).

**Nunca compartilhar a mesma árvore de trabalho entre agentes que estejam editando código.** Criar uma branch e um Git worktree por agente. Somente o integrador altera dependências globais e migrations após acordo.

## O que NÃO está pronto

Autenticação, migrations verificadas, cadastro e pagamento real de contas, importação completa de PDFs, persistência, integração ativa Evolution API, IA funcional, armazenamento S3 e lembretes. Os respectivos arquivos são pontos de partida e contratos de desenvolvimento, não funcionalidades implementadas.
