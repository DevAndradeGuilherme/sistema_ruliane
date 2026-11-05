---
paths:
  - "packages/db/**"
---
- Não alterar migrations antigas já aplicadas em ambientes compartilhados.
- Testar UNIQUE por hash e chave lógica de fechamento; manter campos originais do PDF.
- Mudanças na relação despesa/sangria/pagamento exigem testes de transação e reversão.
- Solicitar revisão do integrador antes de schema migration.
