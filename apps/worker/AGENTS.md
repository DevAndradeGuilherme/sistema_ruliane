# Worker BullMQ

Retries e agendamentos são **at-least-once**: cada job deve ter idempotência no PostgreSQL. Lembrete de 08h em America/Sao_Paulo tem chave diária única e não pode duplicar por falha. Não enviar WhatsApp sem validação de JID e sem autorização. Importação exige SHA-256, chave de negócio e transação atômica antes de consolidar números. Nunca consumir fila antes do processador estar implementado/testado.
