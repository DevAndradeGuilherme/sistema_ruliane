# TASK-004 — Shell responsivo para contas e fechamentos

**Agente:** frontend. **Branch:** `feat/task-004-web`. **Pré-requisitos:** nenhum; usar dados vazios ou mocks explicitamente marcados.

**Ownership:** `apps/web/app/**` exceto `app/api/**`; componentes locais de UI. Dependências globais somente com integrador.

## Escopo

1. Estruturar navegação e telas vazias: dashboard, contas a pagar, detalhe de conta, fechamentos, sangrias, revisão e relatórios.
2. UX responsiva pt-BR com estados vazios, carregamento e erro; acessibilidade básica.
3. Preparar componentes de data civil, moeda BRL e status sem duplicar cálculos de domínio.
4. Especificar interfaces de dados esperadas e consultar backend para integração posterior.

## Critérios de aceite

- `pnpm --filter @financeiro/web build` passa após instalar pacotes.
- Nenhum valor fictício aparece como lançamento real.
- Sem endpoint administrativo exposto nem páginas que afirmem login funcional.

**Fora do escopo:** criar contas no banco, API de pagamentos, segurança de sessão.
