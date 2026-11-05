# TASK-001 — Validar banco, contratos e infraestrutura

**Agente:** arquitetura-db. **Branch:** `feat/task-001-db`. **Pré-requisitos:** nenhum.

**Ownership:** `packages/db/**`, `packages/contracts/**`, `infra/**`. Arquivos globais apenas após coordenador aprovar.

## Escopo

1. Conferir e corrigir schema Prisma 7 (múltiplas organizações previstas, mas uma usada). Garantir integridade dos relacionamentos, índices, hash e chave lógica do fechamento.
2. Instalar dependências, gerar client, rodar `prisma validate` e criar primeira migration não destrutiva, com revisão humana.
3. Validar contratos Zod e datas civis, diferenciar sangrias e pagamentos.
4. Documentar `db:seed` seguro para uma organização, sem criar senha padrão de produção.
5. Checar conexões PostgreSQL/Redis/MinIO locais com Docker e documentar os resultados.

## Critérios de aceite

- `pnpm db:validate`, `pnpm db:generate`, `pnpm db:migrate` funcionam contra banco de desenvolvimento.
- Constraints suportam um fechamento por identidade lógica e documento por hash/organização.
- Modelos têm campos originais e calculados; pagamentos parciais e vínculos de sangria não criam despesa duplicada.
- Nenhuma migração destructive, senha pública ou dado original no Git.

**Fora do escopo:** UI, endpoint de login, webhooks, queries de negócio.
