# Handoff — TASK-001

**Agente:** arquitetura-db
**Branch/worktree:** `feat/task-001-db` / `C:\Users\guilherme\Documents\financeiro-db`
**Status:** implementação e validação DEV concluídas; revisão de integração pendente

## Alterações

- Arquivos alterados: `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20261105000100_init/migration.sql`, `packages/db/prisma/migrations/migration_lock.toml`, `packages/db/seed.ts`, `packages/db/test/integrity.test.ts`, `packages/contracts/src/cash-closing.ts`, `packages/contracts/src/payable.ts`, `packages/contracts/test/finance.test.ts`, `infra/README.md`, este handoff.
- Contratos alterados: data civil validada no calendário; valor monetário limitado a `DECIMAL(14,2)`; criação de pagamento tipada, distinta de sangria; timestamps locais de fechamento validados.
- Fechamento único por `(organizationId, closureNumber, terminal, businessDate)`. O hash do documento permanece único por organização. `businessDate` deve ser derivada da data local impressa; `closedAt` preserva o instante recebido.
- Chaves estrangeiras compostas impedem vínculos entre organizações para conta, pagamento, despesa, movimento, documento, usuários e entidades relacionadas.
- Cada movimento de caixa tem `sourceOrdinal` único por fechamento/tipo; pagamento aceita `idempotencyKey` única por organização. Os consumidores devem fornecer esses campos conforme a fonte e a tentativa de gravação.
- SQL adiciona checks e triggers para pagamentos parciais não excederem a conta, uso exclusivo de sangria por pagamento ou despesa, valores positivos e consistência dos vínculos. A despesa de pagamento deve referenciar o pagamento; a sangria vinculada a ele não cria outra despesa.

## Validação

- `corepack pnpm install --frozen-lockfile`: passou; lockfile sem alteração.
- `corepack pnpm db:validate`: passou (Prisma 7.10.1).
- `corepack pnpm db:generate`: passou.
- `corepack pnpm typecheck`: passou em todos os pacotes/apps com script, após repetição fora do sandbox (`spawn EPERM` na primeira tentativa).
- `corepack pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck seed.ts test/integrity.test.ts` em `packages/db`: passou.
- `node --experimental-strip-types --test packages/contracts/test/*.test.ts`: 3/3 passaram.
- `node --experimental-strip-types --test packages/domain/test/*.test.ts`: 5/5 passaram.
- `node --experimental-strip-types --test packages/db/test/integrity.test.ts` com `TEST_DATABASE_URL` do DEV: 2/2 passaram. Casos: FKs entre organizações, hash, chave lógica, ordinal de sangria, chave de pagamento, soma de pagamentos, dupla despesa e duas transações concorrentes.
- `docker compose -f infra/compose.dev.yml config --quiet`: passou. Antes da aplicação não havia contêineres/volumes do projeto `infra`; a porta 5432 estava livre. O contêiner criado `infra-postgres-1` monta apenas `infra_postgres_dev`, rotulado `com.docker.compose.project=infra`. Os volumes existentes `evolution-local_evolution_postgres_data` e `gestaofin_dbdata` têm projetos diferentes e não foram acessados.
- `git diff --check`: passou.
- SQL gerado por `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`; o prefixo gerado coincide com o schema após as últimas alterações. Usuário aprovou a aplicação no DEV novo. `prisma migrate deploy` aplicou `20261105000100_init` em `financeiro` no `127.0.0.1:5432`; `prisma migrate status`: schema atualizado. Não houve reset, force, drop ou acesso a outro banco.
- Seed DEV executado duas vezes com ID gerado localmente: `Organização DEV criada`, depois `Organização DEV já existe`. Nenhuma senha/usuário criado.

## SQL para revisão

Arquivo completo: `packages/db/prisma/migrations/20261105000100_init/migration.sql`. A migration cria tabelas, enums, índices e FKs; a parte manual começa em `-- Financial invariants not expressible in Prisma schema` e contém checks e quatro funções/cinco triggers. Revisar especialmente o bloqueio da linha da conta em `enforce_payable_balance`, a exclusividade em `enforce_movement_use` e a chave lógica de fechamento. Não há `DROP`, `TRUNCATE` nem `DELETE` no SQL da migration.

## Riscos e limites

- Migration inicial foi gerada **a partir de schema vazio** e aplicada somente no volume DEV novo, aprovado pelo usuário. Qualquer outro banco exige inventário e plano de preservação próprios.
- Concorrência de pagamentos foi testada no PostgreSQL DEV; concorrência de dois autores tentando vincular a mesma sangria não teve teste simultâneo dedicado, embora o gatilho bloqueie a linha da sangria e o teste sequencial tenha passado.
- Novos campos obrigatórios `businessDate`, `organizationId` em pagamento/movimento e `sourceOrdinal` em movimento exigem atualização dos consumidores futuros; nenhum consumer foi alterado neste escopo. `idempotencyKey` de pagamento é opcional no banco, mas deve ser enviada pelos casos de uso que precisam resistir a retries.
- `Prisma schema` não representa checks/triggers: futuras migrations devem preservar o SQL manual.

## Pendências para o integrador

- Revisar contratos `businessDate`, `sourceOrdinal` e `idempotencyKey` com os consumidores da TASK-002 e TASK-005 antes da integração.
- Redis e MinIO não foram iniciados: a migration e os testes de TASK-001 usaram apenas PostgreSQL.
- Revisar diff e integrar branch; não houve merge automático.
