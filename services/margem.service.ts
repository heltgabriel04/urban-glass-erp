import { supabase } from '@/lib/supabase/client';

export interface MargemPedido {
  pedido_id: string;
  cliente_nome: string;
  dt_pedido: string;
  receita: number;
  custo: number;       // CMV — custo histórico quando disponível, senão custo_m2 atual
  margem: number;      // receita − custo
  margemPct: number;   // margem / receita × 100
  semCusto: boolean;   // true se nenhum item teve custo (custo_m2 ausente)
}

/**
 * Margem bruta por pedido (aproximada):
 *   receita = pedidos.valor_total
 *   custo   = Σ (item.m2 × custo_m2), exceto itens de vidro do cliente
 *
 * O custo/m² usado é, em ordem de prioridade: (1) o custo histórico gravado
 * em estoque_movimentacoes no momento da baixa daquele item específico
 * (chapa inteira avulsa), (2) o custo histórico da otimização daquele pedido
 * + produto (peças cortadas), (3) o custo_m2 ATUAL do estoque, como fallback
 * pra pedidos antigos de antes do livro-razão existir.
 * Ainda NÃO inclui custo de lapidação/mão de obra.
 */
export async function getMargemPorPedido(): Promise<MargemPedido[]> {
  const [estoqueRes, pedidosRes, itensRes, movsRes] = await Promise.all([
    supabase.from('estoque').select('produto_id, custo_m2'),
    supabase.from('pedidos').select('id, dt_pedido, valor_total, status, clientes ( nome )').neq('status', 'Cancelado'),
    supabase.from('itens_pedido').select('id, pedido_id, produto_id, m2, vidro_cliente'),
    supabase.from('estoque_movimentacoes')
      .select('origem_tipo, origem_id, produto_id, custo_unitario_m2')
      .in('origem_tipo', ['otimizacao', 'pedido_chapa'])
      .not('custo_unitario_m2', 'is', null),
  ]);

  if (pedidosRes.error) { console.error('getMargemPorPedido:', pedidosRes.error); return []; }

  const custoM2PorProduto = new Map<number, number>();
  for (const e of (estoqueRes.data ?? []) as Array<{ produto_id: number | null; custo_m2: number }>) {
    if (e.produto_id != null) custoM2PorProduto.set(e.produto_id, Number(e.custo_m2) || 0);
  }

  // 'pedido_chapa': origem_id = item_pedido.id → custo exato daquele item.
  const custoPorItem = new Map<number, number>();
  // 'otimizacao': origem_id = pedido_id → custo da baixa daquele pedido+produto.
  const custoPorPedidoProduto = new Map<string, number>();
  for (const m of (movsRes.data ?? []) as Array<{ origem_tipo: string; origem_id: string | null; produto_id: number; custo_unitario_m2: number }>) {
    if (!m.origem_id) continue;
    if (m.origem_tipo === 'pedido_chapa') custoPorItem.set(Number(m.origem_id), Number(m.custo_unitario_m2));
    else if (m.origem_tipo === 'otimizacao') custoPorPedidoProduto.set(`${m.origem_id}|${m.produto_id}`, Number(m.custo_unitario_m2));
  }

  const custoPorPedido = new Map<string, number>();
  const temCustoPorPedido = new Map<string, boolean>();
  for (const it of (itensRes.data ?? []) as Array<{ id: number; pedido_id: string; produto_id: number | null; m2: number; vidro_cliente: boolean }>) {
    if (it.vidro_cliente) continue; // cliente trouxe o vidro → sem custo de chapa
    const custoM2 =
      custoPorItem.get(it.id) ??
      (it.produto_id != null ? custoPorPedidoProduto.get(`${it.pedido_id}|${it.produto_id}`) : undefined) ??
      (it.produto_id != null ? custoM2PorProduto.get(it.produto_id) : undefined) ??
      0;
    custoPorPedido.set(it.pedido_id, (custoPorPedido.get(it.pedido_id) ?? 0) + Number(it.m2) * custoM2);
    if (custoM2 > 0) temCustoPorPedido.set(it.pedido_id, true);
  }

  return ((pedidosRes.data ?? []) as Array<{ id: string; dt_pedido: string; valor_total: number; clientes?: { nome?: string } }>)
    .map(p => {
      const receita = Number(p.valor_total) || 0;
      const custo   = parseFloat((custoPorPedido.get(p.id) ?? 0).toFixed(2));
      const margem  = parseFloat((receita - custo).toFixed(2));
      return {
        pedido_id:    p.id,
        cliente_nome: p.clientes?.nome ?? '—',
        dt_pedido:    p.dt_pedido,
        receita, custo, margem,
        margemPct:    receita > 0 ? (margem / receita) * 100 : 0,
        semCusto:     !temCustoPorPedido.get(p.id),
      };
    })
    .sort((a, b) => b.margem - a.margem);
}
