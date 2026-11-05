# Aplicação web/API

Consultar `docs/ARCHITECTURE.md` e `docs/CONTRACTS.md`. Não expor rotas CRUD sem Auth.js/sessão, RBAC e validação Zod. Proprietária não tem permissão de escrita. Valor financeiro em string decimal, nunca float. Não criar dashboard com dados fictícios como se fossem reais. Separar handlers HTTP de serviços; não inserir regra contábil nas páginas React.
