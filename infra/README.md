# Infra local

`compose.dev.yml` levanta PostgreSQL, Redis e MinIO em loopback local; não instala Evolution API nem conecta OpenAI. `cp .env.example .env` cria credenciais somente de desenvolvimento. Para Evolution, TASK-003 deve homologar release oficial, configuração de eventos, segredo do webhook e banco **separado** do sistema. Para produção: TLS, senhas fortes, versões/digests fixos, backups e nenhuma porta do banco/Redis/MinIO pública.

## Seed DEV

Após inspeção/aprovação do SQL e migration em banco local **descartável**, defina `DATABASE_URL`, `DEV_ORGANIZATION_ID` (UUID escolhido pelo operador), `DEV_ORGANIZATION_NAME` e `DEV_SEED_CONFIRM=local-disposable`; execute `corepack pnpm --filter @financeiro/db exec tsx seed.ts`. O seed exige host de banco em loopback, não roda com `NODE_ENV=production`, cria somente uma organização e é idempotente por ID. Não cria usuário, senha, dados financeiros ou credenciais padrão. O comando `pnpm db:migrate` só deve ser usado após revisão do SQL e confirmação do estado do banco.
