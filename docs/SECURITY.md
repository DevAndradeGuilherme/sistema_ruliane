# Segurança e operação — checklist antes de dados reais

1. Criar senhas fortes e hash Argon2id para usuário financeiro; sessões seguras e CSRF.
2. Validar role por ação; proprietária somente leitura em todas as rotas/tools.
3. Allowlist de JIDs autorizados e rejeição de grupo, número desconhecido e mensagens `fromMe`.
4. Webhook Evolution: autenticação conforme versão implantada, IP/rate limiting quando aplicável, replay e idempotência no banco.
5. Acesso MinIO/S3 privado: documentos originais e comprovantes não públicos; downloads com autorização e expiração curta.
6. Banco/Redis/MinIO sem portas públicas em produção. TLS, backups e restore testado.
7. Não enviar dados pessoais/segredos desnecessários para LLM; proteger de prompt injection em mensagens/PDF.
8. Migration destrutiva exige plano de rollback e aprovação humana.
9. Sem operação bancária/pagamentos reais via API; sistema registra, não movimenta dinheiro.
10. Validar modelo OpenAI disponível e endpoints Evolution implantados antes da liberação.

`infra/compose.dev.yml` é **exclusivo para desenvolvimento local**, com credenciais previsíveis; jamais publicar sem substituição de segredos, rede e TLS.
