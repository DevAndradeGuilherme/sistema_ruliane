# ADR-0002 — Valores sem ponto flutuante e dados do PDV preservados

**Status:** aprovado para scaffold — 05/11/2026.

**Decisão:** cálculos de domínio em `bigint` (centavos); JSON com strings decimais; banco PostgreSQL/Prisma `Decimal(14,2)`. Relatórios preservam valores impressos em campos distintos dos recálculos. Sangrias, SmartTEF e recebíveis têm representação própria.

**Justificativa:** impedir arredondamentos e dupla contagem dos exemplos de 30/10/2026.
