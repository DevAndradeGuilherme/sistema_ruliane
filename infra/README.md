# Infra local

`compose.dev.yml` levanta PostgreSQL, Redis e MinIO em loopback local; não instala Evolution API nem conecta OpenAI. `cp .env.example .env` cria credenciais somente de desenvolvimento. Para Evolution, TASK-003 deve homologar release oficial, configuração de eventos, segredo do webhook e banco **separado** do sistema. Para produção: TLS, senhas fortes, versões/digests fixos, backups e nenhuma porta do banco/Redis/MinIO pública.
