import { supabase } from '@/lib/supabase/client';

function fmtData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface ParticipacaoEntidade { nome: string; valor: number; percentual: number; }
export interface Concentracao {
  itens: ParticipacaoEntidade[];          // top N + "Outros"
  top5Pct: number;                        // % do total nos 5 maiores
  maiorPct: number;                       // % do total no maior isolado
  maiorNome: string | null;
  total: number;
}

function montarConcentracao(porNome: Map<string, number>, topN = 5): Concentracao {
  const total = [...porNome.values()].reduce((a, v) => a + v, 0);
  const ordenado = [...porNome.entries()].sort((a, b) => b[1] - a[1]);
  if (total <= 0 || ordenado.length === 0) {
    return { itens: [], top5Pct: 0, maiorPct: 0, maiorNome: null, total: 0 };
  }
  const top = ordenado.slice(0, topN);
  const outrosValor = ordenado.slice(topN).reduce((a, [, v]) => a + v, 0);
  const itens: ParticipacaoEntidade[] = top.map(([nome, valor]) => ({ nome, valor, percentual: (valor / total) * 100 }));
  if (outrosValor > 0) itens.push({ nome: 'Outros', valor: outrosValor, percentual: (outrosValor / total) * 100 });
  const top5Pct = (ordenado.slice(0, 5).reduce((a, [, v]) => a + v, 0) / total) * 100;
  return { itens, top5Pct, maiorPct: (ordenado[0][1] / total) * 100, maiorNome: ordenado[0][0], total };
}

// Concentração de faturamento por cliente — soma de lançamentos de
// Entrada (normal, não devolução/adiantamento) nos últimos N meses.
export async function getConcentracaoClientes(mesesAtras = 12): Promise<Concentracao> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - mesesAtras);
  const { data, error } = await supabase
    .from('lancamentos')
    .select('valor, clientes(nome)')
    .eq('tipo', 'Entrada')
    .eq('natureza', 'normal')
    .is('deletado_em', null)
    .not('cliente_id', 'is', null)
    .gte('created_at', fmtData(desde));
  if (error) { console.error('getConcentracaoClientes:', error); return montarConcentracao(new Map()); }

  const porCliente = new Map<string, number>();
  for (const l of (data ?? []) as unknown as { valor: number; clientes: { nome: string } | null }[]) {
    const nome = l.clientes?.nome ?? 'Sem cliente';
    porCliente.set(nome, (porCliente.get(nome) ?? 0) + Number(l.valor));
  }
  return montarConcentracao(porCliente);
}

// Concentração de despesa por fornecedor — mesmo critério, lado Saída.
export async function getConcentracaoFornecedores(mesesAtras = 12): Promise<Concentracao> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - mesesAtras);
  const { data, error } = await supabase
    .from('lancamentos')
    .select('valor, fornecedor')
    .eq('tipo', 'Saída')
    .eq('natureza', 'normal')
    .is('deletado_em', null)
    .not('fornecedor', 'is', null)
    .gte('created_at', fmtData(desde));
  if (error) { console.error('getConcentracaoFornecedores:', error); return montarConcentracao(new Map()); }

  const porFornecedor = new Map<string, number>();
  for (const l of (data ?? []) as unknown as { valor: number; fornecedor: string | null }[]) {
    const nome = l.fornecedor?.trim() || 'Sem fornecedor';
    porFornecedor.set(nome, (porFornecedor.get(nome) ?? 0) + Number(l.valor));
  }
  return montarConcentracao(porFornecedor);
}

export interface ClienteInativo { id: number; nome: string; totalPedidos: number; ultimoPedidoEm: string; diasSemPedido: number; }

// Clientes com histórico de pedido consistente (>= minPedidos) que
// pararam de comprar há mais de `diasCorte` dias — sinal de perda
// silenciosa, não é estatística, é olhar direto pro dado.
export async function getClientesInativos(diasCorte = 60, minPedidos = 3): Promise<ClienteInativo[]> {
  const { data, error } = await supabase
    .from('pedidos')
    .select('cliente_id, dt_pedido, clientes(nome)')
    .neq('status', 'Cancelado')
    .not('cliente_id', 'is', null);
  if (error) { console.error('getClientesInativos:', error); return []; }

  const porCliente = new Map<number, { nome: string; count: number; maxData: string }>();
  for (const p of (data ?? []) as unknown as { cliente_id: number; dt_pedido: string; clientes: { nome: string } | null }[]) {
    const atual = porCliente.get(p.cliente_id);
    if (!atual) {
      porCliente.set(p.cliente_id, { nome: p.clientes?.nome ?? '—', count: 1, maxData: p.dt_pedido });
    } else {
      atual.count += 1;
      if (p.dt_pedido > atual.maxData) atual.maxData = p.dt_pedido;
    }
  }

  const hoje = new Date();
  const hojeStr = fmtData(hoje);
  const limite = fmtData(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasCorte));

  const inativos: ClienteInativo[] = [];
  for (const [id, info] of porCliente) {
    if (info.count < minPedidos) continue;
    if (info.maxData > limite) continue;
    const dias = Math.round((new Date(hojeStr).getTime() - new Date(info.maxData).getTime()) / 86_400_000);
    inativos.push({ id, nome: info.nome, totalPedidos: info.count, ultimoPedidoEm: info.maxData, diasSemPedido: dias });
  }
  return inativos.sort((a, b) => b.diasSemPedido - a.diasSemPedido).slice(0, 10);
}
