# Ownership de arquivos em desenvolvimento multiagente

| Área | Agente principal | Pode editar sem coordenação? |
|---|---|---|
| `apps/web/app/**`, componentes web | `frontend` | Sim (exceto contratos compartilhados) |
| `apps/web/app/api/**` e casos de uso | `backend-financeiro` | Sim, combinado previamente com frontend |
| `apps/worker/**` | `orquestrador-jobs` | Sim |
| `packages/domain/**`, parser de PDV | `importador-caixa` para importação; `backend-financeiro` para pagamentos | Não se ambos atuam no mesmo módulo; dividir por arquivo |
| `packages/integrations/**` | `integracoes-whatsapp-ia` | Sim para adapter próprio |
| `packages/db/prisma/**` | `arquitetura-db` | **Único dono** |
| `packages/contracts/**` | `arquitetura-db` / integrador | **Único dono por PR** |
| `infra/**` | `arquitetura-db` | Sim, combinado com integrador |
| `package.json`, lockfile, `AGENTS.md`, `CLAUDE.md`, ADRs, `.env.example` | integrador | **Exclusivo** |
| código em PR sob revisão | `revisor-seguranca` | Revisão somente, não altera |

A matriz define **preferência de ownership**, não capacidade técnica nem autorização para ignorar revisão. Todo agente deve entregar PR/diff isolado e testes.
