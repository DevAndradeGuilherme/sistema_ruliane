import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Visão geral | Controle financeiro', template: '%s | Controle financeiro' },
  description: 'Interface de acompanhamento financeiro',
};

const navigation = [
  { href: '/', label: 'Visão geral', icon: '◫' },
  { href: '/contas', label: 'Contas a pagar', icon: '▤' },
  { href: '/fechamentos', label: 'Fechamentos', icon: '▣' },
  { href: '/sangrias', label: 'Sangrias', icon: '⇢' },
  { href: '/revisao', label: 'Revisão', icon: '◇' },
  { href: '/relatorios', label: 'Relatórios', icon: '▥' },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><div className="app-shell">
    <aside className="sidebar" aria-label="Navegação principal">
      <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">F</span><span>Financeiro<small>Controle e conferência</small></span></Link>
      <nav className="nav-list" aria-label="Seções">{navigation.map(item => <Link key={item.href} href={item.href}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
      <div className="sidebar-foot">Interface em preparação<br /><span>Sem dados conectados</span></div>
    </aside>
    <div className="workspace"><header className="topbar"><span className="topbar-name">Controle financeiro</span><span className="environment">Ambiente de interface</span></header><main id="conteudo" className="main-content">{children}</main></div>
  </div></body></html>;
}
