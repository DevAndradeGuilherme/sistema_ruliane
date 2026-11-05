# Arquitetura — visão para desenvolvedores e agentes

## Decisão estrutural

**Monorepo modular, não microsserviços.** `apps/web` concentra interface Next.js e rotas API server-side; `apps/worker` processará tarefas fora da requisição; `packages/` compartilha contratos, domínio, banco e integrações. Não criar API Fastify separada sem ADR, pois o contexto mestre decidiu Next.js + rotas API.

```text
FINANCEIRO WEB -> Next.js routes -> casos de uso -> PostgreSQL/Prisma
FINANCEIRO WhatsApp -> Evolution webhook -> auth/JID -> rascunho+confirmação -> caso de uso
PROPRIETÁRIA WhatsApp -> Evolution webhook -> role -> OpenAI Responses (tools read-only)
Uploads -> S3 privado -> fila Redis/BullMQ -> parser PDF -> validação -> fechamento/revisão
Scheduler worker 08:00 America/Sao_Paulo -> contas pendentes -> Evolution -> log/idempotência
```

## Fronteiras de domínio

| Módulo | Dono | Responsabilidade |
|---|---|---|
| `packages/domain` | domínio | aritmética, parcelas, regras de reconciliação sem I/O |
| `packages/contracts` | contratos | Zod para pedidos, fechamento extraído, webhooks normalizados |
| `packages/db` | dados | Prisma, transações, constraints, migrations e seed seguro |
| `packages/integrations` | integrações | adaptadores Versionados Evolution, OpenAI e S3; sem regra contábil |
| `apps/web` | web/API | autenticação, autorização, telas, validação de entrada e casos de uso |
| `apps/worker` | jobs | ingestão, retries, lembretes e status de entrega |

## Padrões invariantes

- `organizationId` é definido pelo servidor a partir da identidade, **nunca aceito livremente do cliente ou da IA**.
- Strings decimais normatizadas em contratos JSON; no domínio, `bigint` em centavos; no banco, `Decimal(14,2)`.
- Datas de vencimento representam uma data local comercial, não uma hora UTC arbitrária; formatar em `America/Sao_Paulo`.
- Reportar caixa: valores **originais** e **recalculados**, com anomalias; jamais sobrescrever divergência do documento.
- Fontes separadas: `payable`, `payment`, `expense`, `cashMovement`, `cashClosureLine`. Não usar uma tabela genérica de "entradas/saídas" como única fonte.
- Importações e webhooks com chave de idempotência **persistida em banco**; a fila sozinha não garante exatamente-uma-vez.
- OpenAI consulta somente ferramentas conhecidas; backend valida escopo, papéis, limites e filtros.
- Nenhum endpoint externo Evolution é fixado sem validar versão e payloads reais em homologação.

## Sequência de dependências

1. Schema + autenticação e contratos versionados (integrador aprova).
2. Em paralelo: parser determinístico de caixa, adapter Evolution, interface de contas com dados de teste isolados.
3. Persistência e telas de obrigações/pagamentos; ingestão assíncrona e revisão de sangrias.
4. Lembretes idempotentes; OpenAI read-only; automação do financeiro com confirmação.
5. Auditoria, backup, LGPD, testes E2E e aceite para produção.

## Riscos relevantes

**Duplicidade de sangria/despesa**, **sobrecontagem SmartTEF**, **remessa de WhatsApp a JID não autorizado**, **anexos indevidamente públicos**, **diferença de caixa "corrigida" pela IA**, **lembretes duplicados em retries**, **instruções maliciosas em PDF/mensagens**. Todo PR que toque esses temas deve adicionar teste específico.
