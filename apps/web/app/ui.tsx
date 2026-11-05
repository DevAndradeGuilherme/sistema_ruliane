import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>;
}

export function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true">▤</span><h3>{title}</h3><p>{description}</p></div>;
}

export function StatCard({ label, hint }: { label: string; hint: string }) {
  return <div className="stat-card"><span>{label}</span><strong aria-label={`${label}: indisponível`}>—</strong><small>{hint}</small></div>;
}

export function StatusBadge({ status }: { status: 'Em aberto' | 'Pago' | 'Parcial' | 'Vencido' | 'Em revisão' | 'Não classificada' }) {
  return <span className="status-badge">{status}</span>;
}

/** Formata uma data civil YYYY-MM-DD sem conversão de fuso. */
export function formatCivilDate(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}

/** Recebe decimal string do contrato; não faz cálculos financeiros. */
export function formatBRL(value: string | null | undefined): string {
  if (value == null || !/^-?\d+\.\d{2}$/.test(value)) return '—';
  const negative = value.startsWith('-');
  const [whole, cents] = (negative ? value.slice(1) : value).split('.');
  return `${negative ? '-' : ''}R$ ${(whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^0+(?=\d)/, '')},${cents}`;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="back-link" href={href}>← {children}</Link>;
}
