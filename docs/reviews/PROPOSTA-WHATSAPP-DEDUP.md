# Proposta para revisão — deduplicação persistente de inbound WhatsApp

**Estado em 05/11/2026:** migration aplicada **somente** no PostgreSQL DEV `financeiro` em `127.0.0.1:5432`, volume `infra_postgres_dev`, após autorização explícita. Nenhum acesso a produção, VPS ou webhook. Prisma confirmou `Database schema is up to date!` e as três tabelas existem. Alterações em `packages/db/prisma/schema.prisma` e `packages/db/prisma/migrations/20261105000200_whatsapp_inbound_dedup/migration.sql`.

## Schema e isolamento

| Modelo novo | Campos essenciais | Chaves e índices |
|---|---|---|
| `WhatsAppInstance` | `name`, `organizationId`, `active` (inicialmente `false`), timestamps | PK `name` global: cada instância pertence a uma única organização; FK organização; índice `(organizationId, active)`; UNIQUE `(name, organizationId)` para FK composta. |
| `InboundMessageClaim` | `organizationId`, `instanceName`, `providerMessageId`, `receivedAt`, `state`, `leaseOwner`, `claimedAt`, `leaseUntil`, `attempts`, `completedAt`, `expiresAt` | UNIQUE `(organizationId, instanceName, providerMessageId)`; FK composta da instância e organização; índices `(state, leaseUntil)` e `(state, expiresAt)`; checks de estado, lease, tentativas e ID não vazio. |
| `InboundFinancialEffect` | `organizationId`, `claimId`, `effectKey`, `entityType`, `entityId`, `createdAt` | UNIQUE `(organizationId, effectKey)`; FK composta do claim e organização; índices por claim e entidade; key não vazia. |

O servidor obtém a organização da instância cadastrada no PostgreSQL, autenticada pela configuração do webhook, **não** de `organizationId` enviado no payload. Antes do claim, a lógica existente rejeita instância errada, JID não autorizado, grupos, `fromMe` e timestamp fora da janela. A instância é globalmente única, coerente com a unicidade já existente em `WhatsAppMessage(instanceName, providerMessageId)`; a chave de claim inclui a organização para impor escopo também na consulta e nas FKs. Nunca persistir texto, JID, payload ou segredo nas três tabelas novas.

`InboundFinancialEffect` não tem FK polimórfica para conta/pagamento/despesa. A existência da entidade é garantida pelo serviço que grava receipt e mutação **na mesma transação**; teste de integração precisa verificar essa regra. O banco impede receipts duplicados por `effectKey`, mesmo entre mensagens diferentes. A chave deve representar a **ação confirmada** (por exemplo, UUID do rascunho confirmado + tipo/ordinal da operação), ser estável entre retries e nunca ser construída só a partir do horário do worker. Para pagamentos, usar também essa chave em `PayablePayment.idempotencyKey`. O serviço deve reservar `entityId` UUID antes da transação e inserir o receipt **antes** da mutação, para serializar concorrentes pela constraint UNIQUE.

## Claim atômico e leases

O adapter PostgreSQL deverá substituir a store em memória da TASK-003. Um claim usa uma única instrução `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE` e `RETURNING`; o índice UNIQUE serializa disputas entre conexões. O `leaseOwner` é UUID aleatório gerado por tentativa. Duração inicial proposta: 60 segundos, medida pelo relógio do PostgreSQL. O worker deve renovar o lease condicionalmente antes do vencimento para trabalhos longos; nunca executar operação financeira após perder o lease sem passar pelo receipt idempotente.

```sql
INSERT INTO "InboundMessageClaim"
  ("id", "organizationId", "instanceName", "providerMessageId", "receivedAt",
   "state", "leaseOwner", "claimedAt", "leaseUntil", "attempts")
VALUES ($1, $2, $3, $4, $5, 'PROCESSING', $6, statement_timestamp(),
        statement_timestamp() + INTERVAL '60 seconds', 1)
ON CONFLICT ("organizationId", "instanceName", "providerMessageId")
DO UPDATE SET "leaseOwner" = EXCLUDED."leaseOwner",
              "claimedAt" = statement_timestamp(),
              "leaseUntil" = statement_timestamp() + INTERVAL '60 seconds',
              "attempts" = "InboundMessageClaim"."attempts" + 1
WHERE "InboundMessageClaim"."state" = 'PROCESSING'
  AND "InboundMessageClaim"."leaseUntil" <= statement_timestamp()
RETURNING "id", "leaseOwner", "leaseUntil";
```

Uma linha retornada significa `claimed`; zero linhas significa `duplicate` (lease vigente ou `DONE`). `complete` faz `UPDATE ... SET state='DONE', completedAt=statement_timestamp(), expiresAt=statement_timestamp()+INTERVAL '7 days' WHERE id=$id AND organizationId=$org AND leaseOwner=$token AND state='PROCESSING' AND leaseUntil>statement_timestamp()`. Zero linhas indica dono antigo/lease perdido e deve ser tratado como falha, não sucesso. `release` faz `DELETE` somente com os mesmos predicados de dono/estado e `NOT EXISTS` receipt; só pode ser chamado quando comprovadamente nenhum efeito foi iniciado. Claims `DONE` ficam por **pelo menos sete dias**; a limpeza pode excluir apenas `DONE` vencidos **sem receipt financeiro**. Claims com receipt permanecem para preservar o FK e a auditoria. Claims `PROCESSING` expirados são reassumíveis, não expurgados automaticamente.

**Mudança de contrato necessária antes da ativação:** a porta `InboundDedupStore` hoje recebe só a chave em `complete/release`. Ela precisa devolver um handle com `claimId` e `leaseOwner` no `claim` e exigir esse handle em `complete`, `release` e `renew`. Sem esse token, um callback antigo poderia finalizar o lease de outro worker. O serviço PostgreSQL isolado já usa o handle; a porta da TASK-003, adapter Evolution e webhook não foram alterados.

## Falhas e efeitos financeiros

1. Crash antes do claim: nenhuma linha, retry normal.
2. Crash depois do claim e antes do efeito: lease expira; outro worker assume. `release` só é seguro nesse caso.
3. Crash dentro da transação de receipt + conta/pagamento/despesa: rollback de ambos. Retry pode refazer.
4. Commit financeiro concluído, crash antes de `complete`: retry após lease encontra o receipt UNIQUE e retorna o resultado existente, sem criar segundo lançamento; depois marca claim como `DONE`. Um worker concorrente que tente inserir o mesmo `effectKey` aguarda a transação anterior e perde pelo índice único.
5. Worker antigo termina depois da reassunção: `leaseOwner` diferente impede `complete/release`; o receipt impede novo efeito financeiro mesmo se ambos executarem lógica de negócio.

Não basta marcar `DONE` antes de gravar o efeito: isso perderia comandos. Tampouco basta só o claim: leases podem expirar após um commit financeiro. A garantia de não duplicar lançamentos depende da transação do receipt, da UNIQUE e, para pagamento, da chave idempotente já existente. Envio de respostas WhatsApp é efeito externo diferente: uma falha após envio pode repetir a resposta, exigindo outbox/idempotência do provedor em trabalho separado.

## Confirmação de preservação

O SQL aprovado contém apenas `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` e `ALTER TABLE ... ADD CONSTRAINT` referentes às três tabelas novas. **Não contém `DROP`, `TRUNCATE`, reset, alteração de tabelas existentes nem atualização/exclusão de dados.** As tabelas começaram vazias e `WhatsAppInstance.active=false`; a migration isolada não liga o webhook. Foi aplicada somente no DEV após a autorização da etapa seguinte.

## Plano de testes no PostgreSQL DEV e execução

1. Aplicar a migration somente no banco DEV identificado e conferir `prisma migrate status`; antes da aplicação, as tabelas TASK-001 e a migration inicial foram conferidas. Não foi feita comparação de contagem/checksum de dados preexistentes; o SQL não altera essas tabelas.
2. Duas conexões independentes, 20 claims simultâneos da mesma chave: exatamente um recebe handle; os outros recebem duplicate. Repetir com duas organizações/instâncias cadastradas e provar isolamento por FK e filtro.
3. Lease vigente bloqueia; lease expirado permite um único novo dono; `complete/release` do dono antigo afetam zero linhas; renovação com dono correto prolonga o lease.
4. `DONE` não é reassumido; `release` após receipt ou após `DONE` afeta zero linhas; `expiresAt` respeita sete dias; limpeza preserva claims com receipt.
5. Criar receipt + payable/pagamento em transação; simular rollback, crash após commit antes de complete, duas confirmações concorrentes e conflito de `effectKey`; verificar uma entidade e uma trilha de auditoria. Testar também `PayablePayment.idempotencyKey` e falha antes/depois do commit.
6. Tentar referências de instância/claim de outra organização e verificar erro de FK; provar que `active=false` não é aceito pela camada de entrada.
7. Confirmar que nenhum teste usa credenciais reais, payload real ou banco de produção.

## Rollback e riscos

**Antes da aplicação:** remover os arquivos propostos da branch; nenhum estado de banco precisa ser revertido. **Depois da aplicação:** desligar qualquer novo processamento, manter as tabelas e seus dados, reverter o código consumidor e investigar. Não executar `DROP` automático: remover tabelas/enum seria destrutivo e exigiria backup, verificação de receipts e autorização específica. Uma migration corretiva aditiva é preferível se houver problema no schema.

Riscos: incompatibilidade temporária da porta `InboundDedupStore`, lease de 60 s curto para jobs longos sem renovação, crescimento de claims/receipts, IDs de provedor maiores que 255 caracteres, falha de migração por nomes de índices já ocupados ou schema divergente, bloqueio breve de catálogo ao criar FKs/índices e resposta WhatsApp repetida após falha externa. A migration deve ser revisada contra o schema efetivamente implantado no DEV antes de qualquer aplicação.

## Resultado DEV e condições antes de ativar webhook

O teste `packages/db/test/inbound-dedup.test.ts` usou duas conexões Prisma ao DEV, 20 claims concorrentes e dados sintéticos removidos ao final. Passaram: um único vencedor, lease expirado reassumido, `complete/release` do dono antigo negados, renovação, isolamento por organização/instância, bloqueio de instância inativa, rollback de receipt + conta, repetição após commit sem segunda conta, `effectKey` único entre mensagens, pagamento com `idempotencyKey` único, retenção de sete dias e preservação de claims com receipt. O serviço `PostgresInboundClaims` não está ligado à Evolution.

**Recuperação após HTTP 200:** a migration aplicada armazena apenas identificadores e estado, sem conteúdo da mensagem ou trabalho pendente. Se a Evolution não reenviar, a expiração do lease não cria um novo job e o comando não pode ser reconstruído. Portanto **não há recuperação autônoma garantida após HTTP 200** com o schema atual. Antes de ativar o webhook, projetar e aprovar uma inbox durável com conteúdo normalizado mínimo e proteção de dados, ou uma fila transacional equivalente: persistir a mensagem/trabalho antes da resposta 200, acordar worker por varredura de pendências e provar recuperação após crash. Isso exige proposta e autorização separadas; não alterar esta migration já aplicada nem usar a store atual como garantia falsa. Até lá, o webhook deve permanecer desativado.

**Estabilidade da `effectKey`:** a aplicação deverá persistir o rascunho e sua confirmação com identificador estável; derivar a chave de organização + identificador do rascunho confirmado + tipo/ordinal da ação. Reentregas ou reassunções devem reutilizar exatamente a mesma chave. O serviço atual recebe a chave do chamador; ainda falta implementar a fonte persistente do rascunho e teste ponta a ponta de confirmação. Nunca gerar uma nova chave aleatória por tentativa.

**Worker antigo:** `applyFinancialEffect` bloqueia a linha do claim com `FOR UPDATE` e exige `leaseOwner` atual, organização/instância/mensagem, estado `PROCESSING`, lease vigente e instância ativa. Um worker que perdeu o lease não inicia outro efeito. Se o lease vencer durante uma transação já iniciada, a linha bloqueada impede reassunção até commit/rollback; após commit, a `effectKey` única impede novo lançamento. `complete/release` também exigem o token. O callback financeiro deve usar o `entityId` reservado e executar toda a mutação no mesmo `tx`; um callback que fizer I/O fora da transação não recebe essa garantia.

**Retenção e auditoria:** `DONE` sem efeito pode ser removido só após `expiresAt` (mínimo sete dias). Claims com receipt financeiro permanecem porque o FK impede exclusão e preserva a trilha; receipts e auditorias financeiras não são apagados pela limpeza. Claims `PROCESSING` vencidos são reassumíveis. Revisar política de retenção de IDs de mensagens e capacidade antes de produção.

**Contratos TASK-003 pendentes:** `InboundDedupStore.claim` deve retornar handle com `claimId`/`leaseOwner` e distinguir instância inativa; `complete` e `release` devem exigir o handle e informar se a operação falhou; acrescentar `renew`. O `WebhookOutcome.accepted` deve transportar esse handle até o worker, e o handler só deve responder 200 depois de persistir o trabalho durável. A semântica atual de `release` só vale antes de qualquer efeito. Revisar os testes existentes da store em memória e do processor para a nova porta antes de conectar `PostgresInboundClaims`.
