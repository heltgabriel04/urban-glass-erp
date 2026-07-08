import { supabase } from '@/lib/supabase/client';

export interface DRELinhaDespesa { categoria: string; valor: number; }

export interface DRE {
  receita: number;          // faturamento (Σ valor_total dos pedidos no período)
  cmv: number;              // custo das chapas (aprox., custo_m2 atual)
  lucroBruto: number;       // receita − cmv
  despesas: DRELinhaDespesa[];
  despesasTotal: number;
  resultado: number;        // lucroBruto − despesas
  margemBrutaPct: number;
  margemLiquidaPct: number;
}

function periodo(ano: number, mes: number | null): { ini: string; fim: string } {
  if (mes) {
    const mm = String(mes).padStart(2, '0');
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return { ini: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}` };
  }
  return { ini: `${ano}-01-01`, fim: `${ano}-12-31` };
}

/**
 * DRE por competência:
 *   Receita Bruta (faturamento por dt_pedido)
 *   (−) CMV (custo das chapas; custo_m2 atual, sem lapidação)
 *   = Lucro Bruto
 *   (−) Despesas operacionais (lançamentos de Saída por vencimento, agrupados pelo Plano de Contas)
 *   = Resultado
 */
export async function getDRE(ano: number, mes: number | null): Promise<DRE> {
  const { ini, fim } = periodo(ano, mes);

  const [pedidosRes, estoqueRes, despesasRes] = await Promise.all([
    supabase.from('pedidos').select('id, valor_total').neq('status', 'Cancelado').gte('dt_pedido', ini).lte('dt_pedido', fim),
    supabase.from('estoque').select('produto_id, custo_m2'),
    supabase.from('lancamentos').select('valor, vencimento, plano_contas(descricao)').eq('tipo', 'Saída').gte('vencimento', ini).lte('vencimento', fim),
  ]);

  const pedidos = (pedidosRes.data ?? []) as Array<{ id: string; valor_total: number }>;
  const receita = parseFloat(pedidos.reduce((a, p) => a + (Number(p.valor_total) || 0), 0).toFixed(2));

  // CMV dos pedidos do período
  let cmv = 0;
  const pedidoIds = pedidos.map(p => p.id);
  if (pedidoIds.length) {
    const custoM2 = new Map<number, number>();
    for (const e of (estoqueRes.data ?? []) as Array<{ produto_id: number | null; custo_m2: number }>) {
      if (e.produto_id != null) custoM2.set(e.produto_id, Number(e.custo_m2) || 0);
    }
    const { data: itens } = await supabase
      .from('itens_pedido')
      .select('produto_id, m2, vidro_cliente')
      .in('pedido_id', pedidoIds);
    for (const it of (itens ?? []) as Array<{ produto_id: number | null; m2: number; vidro_cliente: boolean }>) {
      if (it.vidro_cliente) continue;
      const c = it.produto_id != null ? (custoM2.get(it.produto_id) ?? 0) : 0;
      cmv += Number(it.m2) * c;
    }
    cmv = parseFloat(cmv.toFixed(2));
  }

  const lucroBruto = parseFloat((receita - cmv).toFixed(2));

  // Despesas agrupadas pelo Plano de Contas (mesma referência usada em
  // Contas a Pagar/Receber — antes lia um campo texto solto e divergia)
  const porCat = new Map<string, number>();
  for (const d of (despesasRes.data ?? []) as unknown as Array<{ valor: number; plano_contas: { descricao: string } | null }>) {
    const cat = d.plano_contas?.descricao?.trim() || 'Sem categoria';
    porCat.set(cat, (porCat.get(cat) ?? 0) + (Number(d.valor) || 0));
  }
  const despesas = [...porCat.entries()]
    .map(([categoria, valor]) => ({ categoria, valor: parseFloat(valor.toFixed(2)) }))
    .sort((a, b) => b.valor - a.valor);
  const despesasTotal = parseFloat(despesas.reduce((a, d) => a + d.valor, 0).toFixed(2));
  const resultado = parseFloat((lucroBruto - despesasTotal).toFixed(2));

  return {
    receita, cmv, lucroBruto, despesas, despesasTotal, resultado,
    margemBrutaPct:   receita > 0 ? (lucroBruto / receita) * 100 : 0,
    margemLiquidaPct: receita > 0 ? (resultado / receita) * 100 : 0,
  };
}
