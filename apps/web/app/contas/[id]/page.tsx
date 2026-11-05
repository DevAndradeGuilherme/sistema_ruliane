import type { Metadata } from 'next';
import { BackLink, EmptyState, PageHeading, Panel } from '../../ui';
export const metadata: Metadata = { title: 'Detalhe da conta' };
export default function DetalheConta() { return <><BackLink href="/contas">Contas a pagar</BackLink><PageHeading eyebrow="Conta a pagar" title="Detalhamento da conta" description="Dados da obrigação, parcelas e histórico de pagamentos confirmados." /><div className="two-columns"><Panel title="Dados da conta"><EmptyState title="Conta indisponível" description="O detalhe será carregado pela API quando a integração estiver pronta." /></Panel><Panel title="Pagamentos"><EmptyState title="Sem pagamentos para exibir" description="Somente pagamentos registrados e confirmados serão mostrados aqui." /></Panel></div></>; }
