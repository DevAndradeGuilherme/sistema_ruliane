# Proposta separada — inbox durável WhatsApp

**Status:** desenho para revisão. Nenhuma tabela, migration, webhook, worker ou envio foi implementado nesta tarefa. `InboundMessageClaim` e `InboundFinancialEffect` já existem no PostgreSQL DEV, mas não guardam conteúdo suficiente para recuperar uma entrega após HTTP 200.

## Dados propostos

Criar em migration futura uma tabela `InboundInbox` com `id`, `organizationId`, `instanceName`, `providerMessageId`, `authorizedUserId`, `receivedAt`, `persistedAt`, `state` (`PENDING`, `PROCESSING`, `DONE`, `FAILED_REVIEW`), `nextAttemptAt`, `attempts`, `processedAt`, `errorCode`, `payloadCiphertext`, `encryptionKeyId`, `attachmentStorageKey` opcional e `expiresAt`. UNIQUE `(organizationId, instanceName, providerMessageId)`; FKs compostas para organização/instância/usuário; índice de varredura `(state, nextAttemptAt)` e de retenção. O payload contém somente dados normalizados necessários ao comando, com limite de tamanho e criptografia em repouso; nunca armazenar corpo bruto da Evolution, `apikey`, cabeçalhos secretos ou arquivo em base64. Anexos ficam em armazenamento privado por hash/chave, com ACL e retenção próprias. A proposta de schema/SQL será submetida separadamente antes de qualquer migration.

## Recebimento antes do HTTP 200

1. Validar segredo, origem, instância ativa, formato, `fromMe`, grupo, JID autorizado e janela temporal na borda. Resolver `organizationId` e `authorizedUserId` no servidor, nunca do payload.
2. Normalizar e criptografar o conteúdo mínimo. Inserir `InboundInbox` em transação curta com chave UNIQUE; se já existir, retornar o mesmo ID e estado, sem duplicar trabalho.
3. **Só responder HTTP 200 após commit do inbox.** Falha no commit retorna 5xx para permitir reentrega. Eventos ignorados por regra recebem 200 sem trabalho, com motivo/código sem conteúdo em log.
4. Após commit, tentar enfileirar BullMQ com `jobId = inbox.id`. A fila acelera, mas não é a fonte de verdade. Uma varredura periódica no PostgreSQL reenfileira linhas `PENDING` vencidas e `PROCESSING` com claim expirado; assim um crash após 200 e antes de enqueue não perde o comando.

## Worker, leases e efeitos financeiros

O worker carrega a linha da inbox pelo ID, verifica instância ativa/usuário ainda autorizado e obtém um **handle** de `PostgresInboundClaims.claim` com `claimId` e `leaseOwner` UUID. Dois workers disputam a UNIQUE e apenas um recebe lease. Trabalhos longos renovam o lease; `complete`, `release` e `renew` exigem o token. Worker antigo não pode gravar efeito: `applyFinancialEffect` verifica dono/lease/escopo sob `FOR UPDATE` antes da transação financeira. Após crash, a varredura encontra a inbox e um novo worker reassume o claim vencido.

Para comandos de escrita, a mensagem inicial cria um rascunho durável e **não** grava lançamento. A confirmação explícita referencia `draftId` e versão; `effectKey = organização + draftId + versão confirmada + tipo/ordinal da ação`, codificada de modo estável e limitada a 200 caracteres. Retries e mensagens duplicadas reutilizam a mesma chave. `InboundFinancialEffect` e conta/pagamento/despesa são gravados na mesma transação; pagamento também usa a chave em `PayablePayment.idempotencyKey`. O `entityId` reservado pelo serviço precisa ser o ID efetivo da entidade. Se o commit ocorreu antes de um crash, o próximo worker encontra o receipt e apenas conclui o processamento. Se a transação falhou, ambos rollbackam e o worker tenta novamente.

Para respostas externas, adicionar outbox durável com chave única por resposta e estado de entrega. Isso evita perder a intenção de envio, mas não garante entrega exatamente uma vez se a Evolution aceitar a mensagem e a confirmação da API se perder; essa limitação deve ser mostrada em logs/status e depende de idempotência do provedor, se disponível.

## Duplicados, janela e retenção

Reentrega de mensagem já presente na inbox retorna 200 sem novo trabalho, inclusive se a mensagem agora estiver fora da janela de dez minutos; a linha pendente continua recuperável pela varredura. Mensagem **nova** já fora da janela é ignorada/registrada como rejeitada sem processar comando. Relógio adiantado segue a tolerância existente da TASK-003. Repetição com mesmo ID e conteúdo conflitante deve gerar alerta de revisão sem sobrescrever o primeiro payload.

Propor TTL curto e configurável para `payloadCiphertext` após `DONE` (por exemplo, 7 dias após conclusão), sujeito à política LGPD e necessidade operacional. Apagar conteúdo por job de retenção, mantendo metadados mínimos, claim e receipts financeiros para auditoria conforme prazo aprovado. Anexos privados têm política própria. Logs guardam códigos e IDs mascarados; acesso ao conteúdo exige RBAC, rastreio e criptografia gerenciada fora do banco. Falhas permanentes vão para `FAILED_REVIEW`, não para descarte silencioso.

## Integração TASK-003 e testes futuros

Alterar a porta `InboundDedupStore` para retornar handle e exigir token em `complete/release/renew`; adaptar `WebhookOutcome` e processamento assíncrono. O handler deve persistir inbox antes de 200, não fazer mutação financeira na requisição. Homologar payload sanitizado da versão Evolution, rotação do segredo e limites de corpo/origem antes de ativar.

Testar em PostgreSQL DEV: crash antes/depois do commit da inbox, depois de 200 e antes do enqueue, perda do job Redis, duas réplicas, lease expirado e antigo worker, falha antes/depois do commit financeiro, reentrega fora da janela, conteúdo conflitante, confirmação duplicada e varredura de pendências. **Sem migration aprovada e sem esses testes, o webhook permanece desativado.**
