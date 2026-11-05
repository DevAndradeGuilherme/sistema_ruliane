# Adapters ainda não implementados

A Evolution API é obrigatória. No TASK-003, escolher a versão oficial homologada e implementar o adaptador `WhatsAppSender` e normalizador de webhook com teste de payload real, checagem de `fromMe`, JID e grupos.

A OpenAI Responses API é obrigatória para a proprietária. Após os serviços read-only existirem, implementar function calling restrito, sem SQL aberto, sem edição e com logging seguro.

S3/MinIO deverá armazenar documentos originais em bucket privado e expor apenas URLs assinadas/autorizadas.
