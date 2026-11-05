# HANDOFF — Integração Fase 1

**Branch:** `integration/fase-1`
**Status:** quatro entregas integradas; TASK-005 ainda não iniciada.

## Commits integrados

| Ordem | Tarefa | Commit original | Merge |
|---|---|---|---|
| 1 | TASK-001, banco e contratos | `6240c408` | `e7f9d83` |
| 2 | TASK-002, parser | `180fee6` | `1614821` |
| 3 | TASK-003, Evolution | `4d0a20b` | `ac35978` |
| 4 | TASK-004, web | `bcbd8ab` | `454ba64` |

O worktree estava limpo antes dos merges. Todos foram `--no-ff`, sem conflito de Git; histórico original preservado. Nenhuma outra branch foi editada e não houve merge em `master`.

## Decisões e ajustes de compatibilidade

- `packages/domain/src/index.ts` agora exporta o parser. `toNormalizedClosure` converte `ParsedClosing` para a forma de `normalizedClosureSchema`, mantém ausência como `null` e transporta avisos. Evidências (`rawLines`, `raw`, linha, reconciliação) permanecem no resultado original para a revisão, sem serem descartadas da origem.
- SmartTEF permanece em `detail.smartTefTotal`/`smartTefLines`, separado das entradas e dos totais. O adaptador não calcula nem adiciona receita.
- O contrato permite `null` para campos ausentes; o schema Prisma exige `closureNumber`, `terminal`, `businessDate`, `closedAt` e valor de cada `CashClosureLine`/`CashMovement`. TASK-005 deve impedir persistência de fechamento incompleto, preservar original e criar pendência de revisão. `businessDate` deve vir da data civil impressa, e a conversão de hora local em `closedAt` deve usar `America/Sao_Paulo` explicitamente.
- `sourceOrdinal` de sangria e chave lógica `(organizationId, closureNumber, terminal, businessDate)` precisam ser estáveis no importador persistente. `Document` tem unicidade por `(organizationId, sha256)`. O parser puro não faz deduplicação em banco.
- A UI espera decimal string, data civil `YYYY-MM-DD`, timestamp com fuso, `null` para indisponível, paginação e `organizationId` imposto pela sessão. As consultas do HANDOFF-TASK-004 ainda não existem; telas são estados vazios, sem autenticação ou lançamento.
- O script raiz `pnpm test` executa domínio, contratos e Evolution. `.env.example` documenta o segredo seguinte para a janela de rotação, sem valor real.
- Dois testes herdados do parser foram corrigidos: remoção de linha tolera CRLF; comparação de formatos ignora apenas evidências de posição/texto que variam com a quebra de linha. Nenhuma regra contábil foi alterada.

## Validação executada

| Comando | Resultado |
|---|---|
| `corepack pnpm install --frozen-lockfile` | passou; lockfile inalterado |
| `corepack pnpm db:validate` | passou |
| `corepack pnpm db:generate` | passou, Prisma 7.10.1 |
| `corepack pnpm check` | passou; 47 testes e typecheck dos pacotes/apps |
| `corepack pnpm test` | passou; 47/47 |
| `node --experimental-strip-types --test packages/integrations/test/*.test.ts` | passou; 21/21, mocks sem envio externo |
| `corepack pnpm --filter @financeiro/web build` | passou; rotas estáticas/dinâmicas compiladas |
| `prisma migrate status` no DEV | banco atualizado com 1 migration |
| `node --experimental-strip-types --test packages/db/test/integrity.test.ts` no DEV | passou; 2/2, isolamento, duplicidade e concorrência |
| `git diff --check` | passou |

O runner Node e o Prisma Engine receberam `spawn EPERM` em tentativas dentro do sandbox; os comandos necessários foram repetidos fora dele e passaram. O teste de banco foi iniciado somente após confirmar `infra-postgres-1`, porta `127.0.0.1:5432`, projeto Compose `infra` e montagem do volume `infra_postgres_dev`. Os volumes `evolution-local_*` e `gestaofin_*` são de outros projetos e não foram tocados. Nenhum reset, deploy ou migration foi executado nesta integração.

## Segurança, pendências e riscos

- As FKs compostas e testes DEV protegem vínculos entre organizações; consultas da TASK-005 ainda precisam filtrar por `organizationId` da sessão e aplicar RBAC. A proprietária continua somente leitura.
- Valores financeiros usam strings decimais nos contratos, centavos `bigint` no domínio e `Decimal(14,2)` no Prisma. A migration impõe checks/triggers adicionais; migrations futuras devem preservá-los.
- A Evolution possui apenas a porta `InboundDedupStore` e implementação em memória para testes. **Antes de ligar o webhook**, criar deduplicação persistente atômica em PostgreSQL por `(instance_name, provider_message_id)`, com estado, lease e retenção, e testar concorrência entre réplicas. `WhatsAppMessage` tem unicidade da mensagem, mas não implementa a semântica de claim/complete/release.
- A rota cadastrada na Evolution é **`/api/v1/webhooks/evolution/`** (barra final); ela ainda não existe no app. Criar a rota autenticada por `X-Webhook-Secret`, com limite de corpo, rate limit e allowlist. Não alterar o webhook existente sem autorização.
- O segredo de webhook exposto anteriormente permanece **comprometido** até rotação autorizada. Não ativar tráfego real com esse segredo. Nenhuma mensagem real foi enviada, e VPS/Evolution não foram modificadas.
- Os testes da Evolution usam payloads sintéticos; falta validar evento sanitizado da instância real e o formato de envio em homologação autorizada. A janela de 10 minutos descarta mensagem antiga com HTTP 200; avaliar alerta e recuperação após indisponibilidade.
- O parser foi validado com fixture sintética baseada nos valores documentados, não com extração do PDF real. Validar layout autorizado fora do Git antes de confiar em importação automática.
- Varredura dos arquivos versionados não encontrou token OpenAI, chave privada, valores de `EVOLUTION_API_KEY` ou `EVOLUTION_WEBHOOK_SECRET`. `.env.example` contém apenas parâmetros e credenciais de desenvolvimento identificadas como tais; nenhum PDF, foto ou imagem original foi versionado.

## Requisitos para iniciar TASK-005

1. Definir auth/sessão e RBAC; obter `organizationId` exclusivamente no servidor e aplicar escopo a toda consulta e gravação.
2. Ligar contratos de contas/pagamentos ao Prisma com centavos no domínio, idempotência de pagamentos e testes de saldo parcial e concorrência.
3. Implementar respostas paginadas e sem números fictícios para as telas da TASK-004, conforme `docs/handoffs/TASK-004.md`.
4. Planejar persistência do importador com hash/chave lógica, revisão de campos ausentes, fuso local e `sourceOrdinal` estável; não tratar sangria como despesa automática.
5. Para ativar Evolution futuramente, concluir dedup PostgreSQL, rota exata, proteção de origem e rotação do segredo comprometido mediante autorização específica.
