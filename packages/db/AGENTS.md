# Banco de dados — escopo exclusivo

Leia `docs/CONTRACTS.md`, RN-03, RN-04, RN-06, RN-09, RN-11, RN-13 do contexto. Alterações em `schema.prisma` e migrations dependem de autorização do integrador. Não executar reset/force de banco, especialmente fora de desenvolvimento. Toda migração com dados existentes precisa de plano de preservação; use UNIQUE por hash e chave de fechamento; Data @db.Date para vencimento. Testar atomicidade e vínculos de sangria/despesa.
