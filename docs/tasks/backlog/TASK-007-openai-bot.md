# TASK-007 — Assistente da proprietária via OpenAI

**Agente:** integracoes-whatsapp-ia. **Depende de:** TASK-001, TASK-003, TASK-005.

Integrar OpenAI Responses API somente com ferramentas server-side read-only e escopo de organização fixado pelo backend. Validar argumentos da tool, limitar período e linhas, sem `execute_sql`. Contextualizar vendas do PDV versus dinheiro líquido, despesas realizadas, previsão e saldo bancário indisponível. Rate limit, proteção contra prompt injection em descrição/PDF, métricas de custo seguras. Testes T15–T18, T22. Proibido permitir escrita via dona.
