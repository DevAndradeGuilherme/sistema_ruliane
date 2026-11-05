import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Controle financeiro',
  description: 'Plataforma interna de contas e fechamentos de caixa',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
