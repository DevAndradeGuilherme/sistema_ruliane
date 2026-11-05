# TASK-006 — Filas, importação e lembretes

**Agente:** orquestrador-jobs. **Depende de:** TASK-001, TASK-002, TASK-003, TASK-005.

Criar fila idempotente de importação (arquivo original S3 privado, SHA-256, chave lógica, transação ACID) e revisão; agendar notificação de vencimento às 08:00 `America/Sao_Paulo` com chave única de entrega por tipo/usuário/organização/data. Respeitar status aberto/atrasado/parcial e balance; evitar retries duplicados. Testes T06–T13 e T19–T20. Não marcar entrega sem evidência provider.
