# ADR-0001 — Monorepo modular e ownership por worktree

**Status:** aprovado para scaffold — 05/11/2026.

**Contexto:** equipe pequena (duas pessoas usuárias, vários agentes de desenvolvimento); riscos de concorrência sobre regras financeiras, migrations e contratos.

**Decisão:** manter Next.js App Router como web e API, worker separado com BullMQ, domínio e contratos em pacotes próprios; uma única base PostgreSQL para a aplicação. Claude Code e Codex utilizam worktrees separados, instruções curtas na raiz e fonte centralizada do negócio em `docs/`. Contratos e migrations têm dono exclusivo.

**Consequências:** diffs claros, revisão independente, menos custo operacional que microsserviços. Exige integrador humano para resolver dependências e conflitos.
