# Orientações permanentes — agentes de programação

## Fonte de verdade e prioridade

- Requisito do usuário > `docs/CONTEXTO_MESTRE_SISTEMA_FINANCEIRO.md` > ADRs aprovadas > tarefas aprovadas > implementação.
- Ler `docs/ARCHITECTURE.md`, `docs/MULTI_AGENT_WORKFLOW.md` e a tarefa atribuída antes de editar.
- Não reinterpretar automaticamente linha manuscrita, sangria, boleto, pagamento, venda ou saldo bancário.
- Não substituir Evolution API por outro canal WhatsApp; não substituir OpenAI por outro provedor de IA para a dona.

## Regras financeiras imutáveis

- Usar centavos inteiros/bigint nas funções de domínio e `Decimal(14,2)` no PostgreSQL; jamais `float` para valores de negócio.
- Uma sangria não é automaticamente despesa; não criar despesa duas vezes.
- Fechamento importado não é venda nova ao reimportar; idempotência por hash e chave lógica.
- Preservar valor impresso, apurado e divergência; não corrigir silenciosamente.
- SmartTEF é detalhamento, não receita adicional.
- Proprietária: somente leitura. Financeiro via WhatsApp: confirmação explícita antes de gravar.
- Consultas OpenAI: ferramentas tipadas, read-only, escopo imposto pelo servidor; nunca executar SQL arbitrário do modelo.
- Retorno financeiro sem dados confiáveis deve informar a limitação, não estimar.

## Convenções operacionais

- Monorepo pnpm; Node 22+, TypeScript strict; Next.js App Router; Prisma PostgreSQL; Redis/BullMQ.
- Preferir serviços pequenos com contratos explícitos, Zod nas bordas e testes de regressão por regra alterada.
- Arquivos: `apps/web`, `apps/worker`, `packages/{domain,db,contracts,integrations}`.
- Não gravar secrets, dados pessoais de operadores, PDF real ou imagem da agenda no Git.
- Não executar migrations destrutivas, deploy ou serviços externos sem instrução/aceite explícito.
- Evitar edição concorrente de `package.json`, `pnpm-lock.yaml`, `schema.prisma`, `docs/CONTEXTO...`.

## Protocolo ao receber tarefa

1. Abrir `docs/tasks/...` e conferir pré-requisitos e ownership (`docs/OWNERSHIP.md`).
2. Trabalhar em branch/worktree próprio; informar dependência ou proposta de alteração em contrato antes de quebrá-lo.
3. Implementar + testes; para comportamento financeiro, criar caso em `packages/domain/test/` ou teste de integração correspondente.
4. Rodar `node --experimental-strip-types --test packages/domain/test/*.test.ts` e verificações pertinentes.
5. Entregar resumo, arquivos modificados, comandos executados, limitações e riscos. Nunca declarar funcionalidade pronta sem executar teste real.

## Code review rules

Priorizar perdas de integridade, duplicidade, autorização indevida, exposição de dados, divergência de caixa não preservada, datas/fuso errados, jobs duplicados, chamadas não idempotentes e testes ausentes. Segurança e correção precedem estilo.
