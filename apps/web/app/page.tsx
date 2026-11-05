import { EmptyState, PageHeading, Panel, StatCard } from './ui';

export default function Dashboard() {
  return <>
    <PageHeading eyebrow="Visão geral" title="Dashboard financeiro" description="Acompanhe o período, os compromissos e os dados que precisam de conferência." />
    <div className="notice" role="status">Dados financeiros ainda não conectados. Os indicadores abaixo aguardam a integração com a API.</div>
    <section className="stats" aria-label="Indicadores financeiros">
      <StatCard label="Entradas informadas pelo PDV" hint="Fechamentos do período" />
      <StatCard label="Despesas pagas" hint="Pagamentos confirmados" />
      <StatCard label="Compromissos em aberto" hint="Saldo pendente" />
      <StatCard label="Pendências de revisão" hint="Fechamentos e sangrias" />
    </section>
    <div className="two-columns">
      <Panel title="Próximos vencimentos" description="Contas previstas para os próximos dias"><EmptyState title="Nenhum dado disponível" description="Os vencimentos aparecerão após a integração das contas a pagar." /></Panel>
      <Panel title="Entradas e saídas" description="Valores separados por natureza e período"><EmptyState title="Sem movimentações para exibir" description="Fechamentos e pagamentos confirmados serão apresentados em grupos distintos." /></Panel>
    </div>
  </>;
}
