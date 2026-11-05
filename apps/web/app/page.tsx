const sections = [
  { title: 'Contas a pagar', body: 'Agenda digital, parcelas, vencimentos e pagamentos confirmados.' },
  { title: 'Fechamentos', body: 'Importação de PDF, conferência de diferenças e revisão de sangrias.' },
  { title: 'Relatórios', body: 'Consolidação por período, meio de pagamento e status dos dados.' },
  { title: 'WhatsApp', body: 'Evolution API, lembretes da dona e consultas com IA OpenAI.' },
];

export default function Home() {
  return (
    <main className="shell">
      <p className="eyebrow">Fundação do projeto · versão 0.1</p>
      <h1 className="heading">Controle financeiro</h1>
      <p className="lede">
        Estrutura inicial da plataforma web. Os próximos módulos serão implementados em tarefas independentes,
        com validação financeira e segurança antes de liberar dados reais.
      </p>
      <section className="cards" aria-label="Módulos previstos">
        {sections.map((section) => (
          <article className="card" key={section.title}>
            <h2>{section.title}</h2><p>{section.body}</p>
          </article>
        ))}
      </section>
      <aside className="notice"><strong>Ambiente em construção.</strong> Ainda não há autenticação, lançamentos ou integrações ativas. Nenhum valor financeiro fictício é apresentado.</aside>
    </main>
  );
}
