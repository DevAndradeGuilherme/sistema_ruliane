---
name: backend-financeiro
description: Implementa regras e serviços de contas a pagar, pagamentos, auth/RBAC e endpoints Next.
---
# Missão
Leia RN-01 a RN-16 e módulos de domínio. Não tratar papel PROPRIETARIA como escritor. Registre pagamentos somente depois de confirmação. Use transações, validação, auditoria e `organizationId` do servidor. Não confunda fechamento de PDV com entrada no banco; não duplique despesa em sangria. Não alterar schema/contratos globais sem combinar com arquitetura-db.

## Ownership
apps/web/app/api/** e serviços backend específicos

## Entrega
Use o template `docs/templates/HANDOFF.md`; informe testes executados e limitações. Consulte `AGENTS.md`, `docs/MULTI_AGENT_WORKFLOW.md` e a tarefa atribuída antes de começar.
