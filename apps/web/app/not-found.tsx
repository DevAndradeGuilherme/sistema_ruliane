import Link from 'next/link';
export default function NotFound() { return <div className="state-page"><h1>Página não encontrada</h1><p>O endereço informado não existe.</p><Link className="button" href="/">Voltar à visão geral</Link></div>; }
