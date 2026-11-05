# Validação executada neste scaffold

**Data:** 05/11/2026. **Node local:** 22.16.0.

## Executado e aprovado

- `node --experimental-strip-types --test packages/domain/test/*.test.ts`: **5/5 testes passaram**.
- Parse dos arquivos `.json` com `json.loads`: aprovado.
- Parse dos arquivos `.toml` com `tomllib`: aprovado (configuração Codex e perfis).
- Consistência básica de blocos no `schema.prisma`: verificação sintática simples de chaves; **não equivale a `prisma validate`**.

## Ainda não validado em execução

- `pnpm install`, `prisma validate`, `prisma generate`, migrations, `next build`, Docker Compose e integrações externas: **não executados** por indisponibilidade de acesso ao registry npm e ausência dos serviços neste ambiente.
- Autenticação, webhooks, OpenAI Responses, leitura do PDF binário, pagamentos e job de lembretes: **não implementados**, previstos em tarefas.

**Gate obrigatório antes de desenvolver sobre a base:** concluir TASK-001 com instalação de dependências, validação Prisma real, migrations e build Next.js. Nunca tratar scaffold como sistema pronto para produção.
