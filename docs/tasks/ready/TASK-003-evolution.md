# TASK-003 — Adapter Evolution API e normalizador de webhook

**Agente:** integracoes-whatsapp-ia. **Branch:** `feat/task-003-evolution`. **Pré-requisitos:** homologar release da Evolution (a confirmar em ambiente dev).

**Ownership:** `packages/integrations/src/evolution/**` + testes isolados. Propor, não editar, contracts globais sem acordo.

## Escopo

1. Conferir documentação/payloads da **Evolution API oficial** na versão implantada; registrar versão e eventos em ADR.
2. Implementar `sendText`, status de conexão e normalização de `MESSAGES_UPSERT` ou evento equivalente da versão escolhida.
3. Webhook seguro: proteger origem, JID/grupo/fromMe, mensagem duplicada; a idempotência definitiva será persistida pela camada web/worker.
4. Criar testes com payloads sanitizados reais e mocks de rede; sem envio involuntário.

## Critérios de aceite

- API evolutiva isolada por adapter, sem endpoints espalhados por módulos.
- Desconectado/erro/retry sinalizados; confirmação de envio ≠ entrega.
- Inbound não autorizado rejeitado; sem logs de token.

**Fora do escopo:** OpenAI de consultas, banco financeiro, processamento de lembretes.
