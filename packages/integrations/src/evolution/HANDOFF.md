# Handoff — TASK-003 (Adapter Evolution API v2.3.7)

**Agente:** integracoes-whatsapp-ia
**Branch/worktree:** `feat/task-003-evolution` (sem merge; nada commitado)
**Status:** pronto para revisão (parcial quanto à ativação: depende do backend e de homologação autorizada — ver Pendências)

## Alterações
- Novos (todos em `packages/integrations/`): `src/evolution/{types,client,sender,webhook-auth,normalize,dedup,webhook,index}.ts`, `test/evolution.test.ts`, este arquivo.
- Editado: `packages/integrations/src/index.ts` (+1 linha reexportando `./evolution/index.ts`).
- Contratos alterados: nenhum. `NormalizedInboundMessage` é estruturalmente compatível com `InboundWhatsappMessage` (`packages/contracts`). Não toquei `package.json`, `.env.example`, lockfile, schema, `apps/**`, nem a VPS.

## O que foi verificado no ambiente (somente GET)
- Evolution `2.3.7`, instância `finance-whatsapp-dev` em `open`, via túnel `127.0.0.1:18080`.
- Webhook já cadastrado na instância (**não alterado**): URL `https://finance.devguiandrade.com.br/api/v1/webhooks/evolution/`, evento único `MESSAGES_UPSERT`, `webhookByEvents=false`, `webhookBase64=false`, autenticação por **header estático `X-Webhook-Secret`** (sem HMAC do corpo).
- A rota ilustrativa em `CONTEXTO_MESTRE` (`/api/webhooks/evolution`) difere da cadastrada (`/api/v1/webhooks/evolution/`, com barra final). **A rota do backend deve ser `/api/v1/webhooks/evolution/`** (ou o webhook deve ser reconfigurado, com autorização).
- **A ativação do webhook depende do backend**: hoje não existe rota em `apps/web` que o receba. Até lá, não há consumo de eventos.

## Uso (para o integrador / backend-financeiro)
```ts
const processor = createWebhookProcessor({
  expectedSecret: [process.env.EVOLUTION_WEBHOOK_SECRET, process.env.EVOLUTION_WEBHOOK_SECRET_NEXT],
  instanceName: process.env.EVOLUTION_INSTANCE_NAME!,
  allowedSenders: allowlistFromEnv(process.env),
  dedup: new PrismaInboundDedupStore(), // a implementar (contrato abaixo)
});
const out = await processor.handle({ headers: req.headers, body: await req.json() });
// responder out.httpStatus; se out.kind==='accepted': processar/enfileirar → out.complete(); se falhar antes de efeito → out.release() e responder 5xx
```
Variáveis: `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_WEBHOOK_SECRET` (≥32 caracteres; mais curto = não configurado = 503), `FINANCEIRO_WHATSAPP_JID`, `PROPRIETARIA_WHATSAPP_JID`. `EVOLUTION_WEBHOOK_SECRET_NEXT` (opcional) só existe durante rotação (`.env.example` é do integrador). Sugerido para o backend: limitar o tamanho do corpo e aplicar rate limit antes de `handle`.

## Defesas implementadas
1. **Segredo**: `X-Webhook-Secret`, case-insensitive; digests SHA-256 + `timingSafeEqual`, sem curto-circuito entre segredos; header duplicado = inválido; segredo ausente/curto ⇒ **503 fail-closed**.
2. **Allowlist** por JID canônico (sufixo de dispositivo removido); lista vazia ⇒ ninguém. Bloqueia `fromMe`, `@g.us`, `@broadcast`, `@newsletter`. `@lid` só é aceito se a Evolution fornecer `remoteJidAlt` com o número real.
3. **Replay/duplicidade em duas camadas independentes**: (a) claim persistente atômico por `(instância, id da mensagem)` — a idade da mensagem **não** é a proteção primária; (b) rejeição por idade (>10 min ou >2 min no futuro) para que chaves já expurgadas não permitam replay. Claim vem por último: remetentes não autorizados nunca ocupam a tabela.
4. **Logs**: só código de motivo, status, papel, JID mascarado e hash curto do id. Testado que segredo, `apikey` do payload, texto e JID completo não aparecem.
5. **Cliente**: timeout (8s), retry com backoff **somente em GET** (timeout/rede/429/5xx); `401/403` → `auth`; erros não carregam apikey, host nem corpo. **Envio**: sem retry (Evolution não tem idempotência), `outcomeUnknown=true` em timeout/5xx, e **desabilitado por padrão** (`sendEnabled=false` ⇒ nenhuma chamada de rede). Sucesso = “aceito pela API”, nunca “entregue”.

## Contrato necessário para a deduplicação persistente (a implementar fora desta task)
Dono sugerido: `arquitetura-db` (tabela) + `backend-financeiro` (implementação da porta `InboundDedupStore`). Detalhes em `dedup.ts`. Resumo:
- Tabela, ex.: `inbound_webhook_event(instance_name, provider_message_id, received_at, state ['processing'|'done'], claimed_at)` com **UNIQUE(instance_name, provider_message_id)**.
- `claim`: `INSERT … ON CONFLICT DO NOTHING`; se conflitar e a linha estiver `processing` com lease vencido (ex.: 60 s), reassumir com `UPDATE … WHERE state='processing' AND claimed_at < now()-lease` verificando linhas afetadas. Atomicidade pelo banco ⇒ seguro com várias réplicas.
- `complete`: `state='done'`. `release`: `DELETE … WHERE state='processing'`.
- Retenção de `done` ≥ 7 dias. Não gravar texto nem payload.
- `InMemoryDedupStore` é só para testes: não protege várias réplicas nem sobrevive a restart.

## Procedimento de rotação do segredo (NÃO executado)
Pré-requisitos: autorização explícita do responsável; novo segredo gerado localmente (≥48 bytes aleatórios, ex.: `openssl rand -hex 32` ou mais), nunca em chat, commit ou log. **Motivo**: o segredo atual foi exposto no transcript da sessão de 2026-11-05 e deve ser substituído antes de habilitar a integração real.
1. **Preparar** (sem impacto): guardar o segredo novo no secret store/`.env` do backend como `EVOLUTION_WEBHOOK_SECRET_NEXT`, mantendo o atual em `EVOLUTION_WEBHOOK_SECRET`. Implantar o backend; o processor aceita os dois.
2. **Verificar o backend** (sem tocar na Evolution): `curl -i -X POST <url> -H "X-Webhook-Secret: $NEXT" -H 'content-type: application/json' -d '{"event":"connection.update"}'` ⇒ esperado `200` (ignored). Com segredo errado ⇒ `401`. (Os valores vêm de variáveis de shell, nunca digitados na linha de comando salva no histórico.)
3. **Registrar o estado anterior**: salvar fora do Git a configuração atual do webhook (`GET /webhook/find/<instância>`) em local protegido, sem expor no terminal/transcript; é o insumo do rollback.
4. **Atualizar a Evolution** (requer autorização; confirmar o formato exato na documentação da imagem 2.3.7 antes — o corpo de `POST /webhook/set/<instância>` não foi validado nesta task): reenviar a **mesma** configuração (url, eventos `MESSAGES_UPSERT`, flags) trocando apenas `headers.X-Webhook-Secret` pelo novo.
5. **Verificar**: `GET /webhook/find` confirma url/eventos/enabled inalterados (comparar sem imprimir o segredo); enviar uma mensagem de teste autorizada **com aprovação do responsável** e conferir nos logs `evolution.webhook.accepted`; não pode haver `secret_mismatch`.
6. **Concluir**: promover o novo valor para `EVOLUTION_WEBHOOK_SECRET`, remover `_NEXT`, reimplantar; testar que o segredo antigo agora responde `401`. Revogar cópias do antigo.
7. **Rollback** (se houver `secret_mismatch`/falha de entrega): reaplicar na Evolution a configuração salva no passo 3 (o backend ainda aceita o segredo antigo enquanto `_NEXT` coexistir); só remover o antigo após estabilizar. Se o backend falhar ao subir, reverter o deploy — a Evolution continua com o segredo antigo até o passo 4.
Observação: webhooks perdidos durante a troca não são reentregues pela Evolution de forma garantida; fazer fora do horário de uso e conferir mensagens do intervalo manualmente.

## Validação (executada neste worktree)
- `corepack pnpm install --frozen-lockfile` → OK (217 pacotes, lockfile inalterado).
- `corepack pnpm --filter @financeiro/integrations typecheck` → OK, sem erros.
- Typecheck adicional de `src` + `test` com tsconfig temporário fora do repositório → OK (o tsconfig do pacote só inclui `src`).
- `corepack pnpm check` (testes de domínio + typecheck de todo o monorepo) → OK.
- `node --experimental-strip-types --test packages/integrations/test/*.test.ts packages/domain/test/*.test.ts` → 26 testes, 26 aprovados, 0 falhas.
- **Atenção**: o script `test` da raiz roda apenas `packages/domain/test`; os testes do adapter exigem o comando acima (alterar `package.json` é do integrador).
- Cobertos: segredo (ausente/curto/errado/duplicado/rotação com dois segredos), normalização (texto, extendedText, mídia, LID, evento/timestamp/forma inválidos), allowlist, `fromMe`, grupo/broadcast, instância errada, duplicidade, concorrência entre 2 réplicas (1 aceita em 10), release/complete, lease expirado, mensagem antiga/futura, ausência de vazamento em logs, cliente (estado, apikey no header, retry só em GET, timeout, erro sem credenciais, envio desabilitado por padrão, envio mockado sem retry).
- **Não validado contra sistemas reais**: nenhum teste usa a Evolution ou o PostgreSQL. A deduplicação persistente **não está implementada**: existe apenas a porta `InboundDedupStore` e uma store em memória para testes.

## Janela de 10 minutos (`maxMessageAgeMs`) e indisponibilidade
- Mensagens com `messageTimestamp` mais antigo que 10 min (ou >2 min no futuro) são **descartadas com HTTP 200** (`ignored: stale_message`). Como a resposta é 200, o provedor **não** tenta reenviá-las.
- **Impacto**: se o backend (ou o túnel/proxy) ficar indisponível por mais de ~10 min, mensagens reentregues pela Evolution depois disso serão **perdidas silenciosamente** para o fluxo financeiro. Dentro de 10 min, retries são processados normalmente. O comportamento de retry da Evolution 2.3.7 não foi verificado.
- Por que existe: a janela só impede replay de chaves já expurgadas; a proteção primária é o claim persistente. Alargar a janela exige alargar a retenção (>= 7 dias hoje cobre janelas de até horas).
- Mitigações para o backend: alertar quando `evolution.webhook.ignored` com `reason=stale_message` ocorrer (o log traz `ageSeconds`, sem conteúdo); permitir configurar `maxMessageAgeMs` (suportado) e manter retenção > janela; após qualquer indisponibilidade, pedir ao financeiro/proprietária para reenviar comandos feitos no período; o fluxo financeiro exige confirmação explícita, então uma mensagem perdida nunca grava dados.
- Aceitar como “stale” também protege contra relógio da Evolution muito defasado; se isso ocorrer, os logs mostrarão idades anormais.

## Requisitos de segurança para homologação (checklist)
1. **Autenticação do endpoint** `/api/v1/webhooks/evolution/`: sempre via `createWebhookProcessor`; sem segredo (ou <32 caracteres) responde 503; cabeçalho ausente/errado responde 401. Nunca expor o endpoint sem esse processor, nem em modo debug. Limitar o tamanho do corpo e aplicar rate limit antes de `handle`; restringir origem (IP/rede do servidor Evolution) no proxy quando possível; TLS obrigatório.
2. **Segredo**: gerado aleatoriamente (>= 32 bytes), guardado só no secret store/`.env`, nunca em Git, chat, logs ou linha de comando. O segredo anteriormente exposto em sessão **não deve ser reutilizado**: substituir antes de habilitar o tráfego real (procedimento de rotação abaixo; execução depende de autorização).
3. **Replay**: o claim persistente (UNIQUE no banco, multi-réplica) deve existir **antes** da homologação; a store em memória não serve. Verificar com um teste de integração real: mesma mensagem 2x e concorrente ⇒ um único processamento. Segredo estático não impede forja por quem o possua.
4. **Allowlist**: `FINANCEIRO_WHATSAPP_JID` e `PROPRIETARIA_WHATSAPP_JID` preenchidos com o JID **exatamente como a Evolution o entrega** (atenção ao 9º dígito e a `@lid`); ambos vazios ⇒ ninguém autorizado (comportamento seguro). Confirmar que grupo, número desconhecido e `fromMe` não geram resposta nem dados.
5. **Dados**: não persistir texto bruto nem o payload na tabela de deduplicação; não logar corpo, cabeçalhos nem JID completo; o campo `apikey` presente no payload da Evolution é credencial da instância e deve ser descartado, nunca registrado.
6. **Envio**: manter `sendEnabled=false` até aprovação explícita; primeiro envio de teste somente para número autorizado e com aprovação do responsável; ledger de envios com `idempotencyKey` na camada web/worker.
7. **Não alterar** a instância, o webhook cadastrado nem a VPS sem autorização; leituras (GET) são permitidas.

## Riscos e limites
- **Nenhum envio real e nenhum POST/PUT na Evolution** foram feitos; só GET de `/`, `connectionState` e `webhook/find`. O formato de `sendText` (`{number, text}` → `key.id`) vem do conhecimento da API v2 e **não foi validado contra a instância**; confirmar na primeira homologação autorizada.
- **Payloads dos testes são sintéticos**, no formato documentado de `messages.upsert`; a task pedia payloads reais sanitizados — falta capturar um evento real (com autorização) e comparar, principalmente `messageTimestamp`, `remoteJid`/`remoteJidAlt` (LID) e mídia.
- Segredo estático em header: quem o obtiver pode forjar eventos (inclusive remetente e id novos); allowlist e dedup não impedem forja. Mitigar na borda (restrição de origem/IP no proxy, TLS, rate limit) e com rotação periódica.
- O JID da allowlist é comparado exatamente: números brasileiros podem chegar com ou sem o 9º dígito; cadastrar o JID como a Evolution o entrega.
- Só `MESSAGES_UPSERT`; `data` como array, `connection.update` e status de entrega/leitura não são tratados (confirmação de entrega exigiria `MESSAGES_UPDATE`, hoje não assinado).
- Desconexões da conexão WhatsApp Web: `getConnectionStatus()` informa, mas o monitoramento periódico/alerta é da camada worker.

## Pendências para o integrador
- Criar a rota `/api/v1/webhooks/evolution/` em `apps/web` (backend-financeiro) e a tabela/implementação de `InboundDedupStore` (arquitetura-db + backend-financeiro).
- Adicionar `EVOLUTION_WEBHOOK_SECRET_NEXT` ao `.env.example` (se adotar a rotação) e registrar ADR da versão 2.3.7 e do mecanismo de autenticação.
- **Preencher manualmente `EVOLUTION_WEBHOOK_SECRET` no `.env`** com o NOVO segredo (decisão do responsável); a rotação na Evolution aguarda autorização.
- **Ainda NÃO autorizados** (decisão do responsável): captura de payload real, envio real e execução da rotação. A rotação está apenas documentada/preparada (código aceita dois segredos).
- Implementar a deduplicação persistente em PostgreSQL e o teste de integração do item 3 do checklist antes de qualquer homologação.
- Não iniciadas, por instrução: TASK-006 e TASK-007.
