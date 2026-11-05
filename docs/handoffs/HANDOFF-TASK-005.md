# HANDOFF — TASK-005 backend financeiro

Branch: `feat/task-005-backend`. Nenhum merge, deploy, reset ou migration foi executado.

## Arquivos

- `apps/web/src/{auth,auth-credentials,auth-types,api,errors,finance,closure-persistence}.ts`, `apps/web/scripts/provision-user.ts`, `apps/web/test/finance.test.ts`
- `apps/web/app/api/{auth,payables,payments,suppliers,expenses,cash-movements,closures}/**`, `apps/web/app/login/page.tsx`, `apps/web/tsconfig.json`, `apps/web/next-env.d.ts` (regenerado pelo Next), `apps/web/package.json`
- `packages/db/src/index.ts`, `packages/db/package.json`, `pnpm-lock.yaml`, este handoff.

## Operações

- Auth.js Credentials com Argon2id, JWT de 8 horas, reconsulta de usuário ativo e papel no backend. Provisionamento individual pelo script com `PROVISION_ORGANIZATION_ID`, `PROVISION_NAME`, `PROVISION_EMAIL`, `PROVISION_PASSWORD` (mínimo 12 caracteres), `PROVISION_ROLE`, `DATABASE_URL` e `corepack pnpm exec tsx apps/web/scripts/provision-user.ts`. Configurar `AUTH_SECRET` seguro e URL/host de produção na implantação. Não há credenciais reais no repositório.
- `GET/POST /api/payables`; `GET/PATCH/DELETE /api/payables/:id` (detalhe inclui saldo e parcelas; DELETE é cancelamento lógico e recusa conta paga); `GET /api/payables/:id/audit`; `POST /api/payments` (chave idempotente obrigatória; transação serializable, saldo e status); `GET/POST /api/suppliers`; `GET/POST /api/expenses` (POST exige UUID de operação no campo `id`); `GET /api/cash-movements`, `PATCH /api/cash-movements/:id`; `GET /api/closures`, `GET /api/closures/:id`.
- Consultas paginadas a 50; valores JSON com duas casas; datas civis `YYYY-MM-DD`. Toda consulta e mutação filtra `organizationId` da sessão. Papel da proprietária somente leitura. Dinheiro exige sangria previamente registrada, do mesmo valor e organização. A despesa do pagamento em dinheiro é vinculada ao pagamento; a sangria não cria outra despesa.
- `persistClosure` é caso de uso interno, sem rota de upload: salva documento, fechamento, resumo, outras entradas, SmartTEF, sangrias e avisos em transação. Hash e chave lógica existentes impedem duplicação; campos ausentes permanecem nulos e o fechamento fica pendente de revisão. O chamador precisa fornecer timestamps com offset explícito e arquivo já armazenado de forma privada.

## Testes e verificações

- `node --experimental-strip-types --test packages/domain/test/*.test.ts`: 23 passaram (fora do sandbox por `spawn EPERM`).
- `node --experimental-strip-types --test apps/web/test/finance.test.ts` com `TEST_DATABASE_URL` de PostgreSQL local: passou. Cobre Argon2id, senha inválida, papel, escopo entre organizações, edição, saldo, idempotência, pagamentos concorrentes, auditoria, sangria classificada e pagamento em dinheiro sem duplicar despesa. Dados sintéticos removidos após o teste.
- `corepack pnpm --filter @financeiro/web typecheck` e `corepack pnpm --filter @financeiro/web build`: passaram.

## Proposta de schema dependente de aprovação

TASK-003 define `InboundDedupStore`; a unicidade de `WhatsAppMessage(instanceName, providerMessageId)` não basta para claim/complete/release. Propor tabela `InboundMessageClaim` com chave única `(instanceName, providerMessageId)`, `state` (`PROCESSING`, `COMPLETED`), `leaseOwner`, `leaseUntil`, `attempts`, `completedAt`, `expiresAt`, `createdAt`, `updatedAt` e índices de lease/retenção. Claim: `INSERT ... ON CONFLICT ... WHERE state != COMPLETED AND leaseUntil < now()` em transação; complete/release condicionados ao `leaseOwner`; teste com duas conexões e limpeza após retenção. **Proposta apenas: nenhuma migration aplicada.** A ativação do webhook depende de aprovação desta migration e dos requisitos de segurança da TASK-003.

## Pendências e riscos

- Criar endpoint privado de upload e fluxo de revisão/publicação de fechamento; `persistClosure` ainda não foi exercitado em teste integrado.
- Cheque (número, banco, emissão, compensação) e boleto (linha digitável, banco) exigem campos novos; por enquanto os pagamentos registram método e `externalRef`. Propor extensão de schema/contrato antes de implementar esses detalhes.
- Idempotência persistente de criação de contas não existe no schema; reenvio de `POST /api/payables` pode criar outra conta. O identificador de `POST /api/expenses` previne reenvio do mesmo lançamento manual; comparar descrições não é deduplicação confiável.
- A autenticação reconsulta usuário ativo e papel, mas revogação imediata de sessão individual e limite de tentativas de login ainda precisam de desenho operacional. A tela de login é funcional, mas as páginas da TASK-004 ainda não consomem as rotas; relatórios e dashboard agregados permanecem pendentes.
- Antes de conectar frontend: criar sessão por `/api/auth`, usar os endpoints acima, enviar `idempotencyKey` estável por tentativa de pagamento e UUID estável para despesa manual, nunca enviar `organizationId`/`role`, e mostrar erros 401/403/409 sem repetir automaticamente mutações com nova chave.
