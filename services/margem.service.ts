import { supabase } from '@/lib/supabase/client';
import { getLotesParaCustoPorProduto } from './lotes.service';
import { custoPeps } from '@/lib/custoLote';

export interface MargemPedido {
  pedido_id: string;
  cliente_nome: string;
  dt_pedido: string;
  receita: number;
  custo: number | null;        // null = custo indisponível (ver custoIndisponivel)
  margem: number | null;
  margemPct: number | null;
  semCusto: boolean;           // true = nenhum item teve NENHUM dado de custo (nem histórico, nem lote) — comportamento pré-lotes preservado
  custoIndisponivel: boolean;  // true = pelo menos 1 item depende de um lote com custo_m2 ainda não definido (pendente do contador) — nunca vira 0 silenciosamente
  envolveDataEstimada: boolean; // true = o custo PEPS de pelo menos 1 item (tier 3) consumiu algum lote com dt_entrada_estimada — ordem de fila não 100% confiável pra esses casos (ver lib/custoLote.ts)
}

/**
 * Margem bruta por pedido (aproximada):
 *   receita = pedidos.valor_total
 *   custo   = Σ (item.m2 × custo_m2), exceto itens de vidro do cliente
 *
 * O custo/m² usado é, em ordem de prioridade: (1) o custo histórico gravado
 * em estoque_movimentacoes no momento da baixa daquele item específico
 * (chapa inteira avulsa), (2) o custo histórico da otimização daquele pedido
 * + produto (peças cortadas), (3) custo PEPS ATUAL entre os lotes do produto
 * (custoPeps, ver lib/custoLote.ts — método definitivo confirmado pelo
 * contador em 2026-07-22), como fallback pra pedidos antigos de antes do
 * livro-razão existir. Se o tier 3 vier `null` (a fila PEPS precisou de um
 * lote sem custo_m2 definido) e não houver tier 1/2 pra aquele item, o
 * pedido inteiro fica marcado `custoIndisponivel` — nunca é tratado como
 * custo zero. Se o tier 3 tocar algum lote com dt_entrada_estimada=true, o
 * pedido fica marcado `envolveDataEstimada` (aviso, não bloqueio — a fila
 * PEPS entre lotes de data estimada não é garantidamente a ordem real).
 * Ainda NÃO inclui custo de lapidação/mão de obra.
 */
/**
 * `filtro` (inicio/fim, 'YYYY-MM-DD') limita a busca a um período — sem ele,
 * traz o histórico inteiro (uso legítimo do relatório de Margem geral).
 * Sem o filtro, quem chama pra calcular UM mês (ex.: CMV) acaba varrendo
 * toda a história de pedidos/itens/movimentações da empresa à toa.
 */
export async function getMargemPorPedido(filtro?: { inicio?: string; fim?: string }): Promise<MargemPedido[]> {
  let pedidosQuery = supabase.from('pedidos').select('id, dt_pedido, valor_total, status, clientes ( nome )').neq('status', 'Cancelado');
  if (filtro?.inicio) pedidosQuery = pedidosQuery.gte('dt_pedido', filtro.inicio);
  if (filtro?.fim) pedidosQuery = pedidosQuery.lte('dt_pedido', filtro.fim);

  const [lotesPorProduto, pedidosRes] = await Promise.all([
    getLotesParaCustoPorProduto(),
    pedidosQuery,
  ]);
  if (pedidosRes.error) { console.error('getMargemPorPedido:', pedidosRes.error); return []; }

  const pedidosData = (pedidosRes.data ?? []) as Array<{ id: string; dt_pedido: string; valor_total: number; clientes?: { nome?: string } }>;
  if (pedidosData.length === 0) return [];
  const pedidoIds = pedidosData.map(p => p.id);

  const itensRes = await supabase
    .from('itens_pedido').select('id, pedido_id, produto_id, m2, vidro_cliente')
    .in('pedido_id', pedidoIds);
  const itensData = (itensRes.data ?? []) as Array<{ id: number; pedido_id: string; produto_id: number | null; m2: number; vidro_cliente: boolean }>;

  // origem_id de estoque_movimentacoes é pedido_id (tipo 'otimizacao') OU
  // item_pedido.id (tipo 'pedido_chapa') — restringe às duas famílias de id
  // que de fato pertencem ao recorte de pedidos já filtrado acima.
  const origemIds = [...pedidoIds, ...itensData.map(it => String(it.id))];
  const movsRes = origemIds.length > 0
    ? await supabase.from('estoque_movimentacoes')
        .select('origem_tipo, origem_id, produto_id, custo_unitario_m2')
        .in('origem_tipo', ['otimizacao', 'pedido_chapa'])
        .not('custo_unitario_m2', 'is', null)
        .in('origem_id', origemIds)
    : { data: [] as never[] };

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
  const indisponivelPorPedido = new Map<string, boolean>();
  const dataEstimadaPorPedido = new Map<string, boolean>();
  for (const it of itensData) {
    if (it.vidro_cliente) continue; // cliente trouxe o vidro → sem custo de chapa

    // Tier 1/2 (histórico real, já gravado no momento da baixa) tem
    // prioridade e nunca é null aqui (filtrado via .not('custo_unitario_m2', 'is', null)
    // na query acima) — só cai pro tier 3 (PEPS ATUAL entre lotes)
    // quando não existe registro histórico pra esse item.
    const custoHistorico = custoPorItem.get(it.id)
      ?? (it.produto_id != null ? custoPorPedidoProduto.get(`${it.pedido_id}|${it.produto_id}`) : undefined);

    if (custoHistorico !== undefined) {
      custoPorPedido.set(it.pedido_id, (custoPorPedido.get(it.pedido_id) ?? 0) + Number(it.m2) * custoHistorico);
      if (custoHistorico > 0) temCustoPorPedido.set(it.pedido_id, true);
      continue;
    }

    const resultadoPeps = it.produto_id != null
      ? custoPeps(lotesPorProduto.get(it.produto_id) ?? [], Number(it.m2))
      : { custoM2: null, envolveDataEstimada: false };
    if (resultadoPeps.custoM2 == null) {
      // Sem histórico E sem custo PEPS disponível (produto sem lote ativo,
      // ou a fila PEPS precisou de um lote sem custo_m2 definido) — marca
      // o pedido inteiro como indisponível em vez de somar 0 silenciosamente.
      indisponivelPorPedido.set(it.pedido_id, true);
      continue;
    }
    custoPorPedido.set(it.pedido_id, (custoPorPedido.get(it.pedido_id) ?? 0) + Number(it.m2) * resultadoPeps.custoM2);
    if (resultadoPeps.custoM2 > 0) temCustoPorPedido.set(it.pedido_id, true);
    if (resultadoPeps.envolveDataEstimada) dataEstimadaPorPedido.set(it.pedido_id, true);
  }

  return pedidosData
    .map(p => {
      const receita = Number(p.valor_total) || 0;
      const custoIndisponivel = !!indisponivelPorPedido.get(p.id);
      const custo   = custoIndisponivel ? null : parseFloat((custoPorPedido.get(p.id) ?? 0).toFixed(2));
      const margem  = custo == null ? null : parseFloat((receita - custo).toFixed(2));
      return {
        pedido_id:    p.id,
        cliente_nome: p.clientes?.nome ?? '—',
        dt_pedido:    p.dt_pedido,
        receita, custo, margem,
        margemPct:    margem == null ? null : (receita > 0 ? (margem / receita) * 100 : 0),
        semCusto:     !temCustoPorPedido.get(p.id) && !custoIndisponivel,
        custoIndisponivel,
        envolveDataEstimada: !!dataEstimadaPorPedido.get(p.id),
      };
    })
    // Indisponível (margem null) vai pro fim, não pro meio do ranking — não
    // é "margem zero", é "não sabemos".
    .sort((a, b) => (b.margem ?? -Infinity) - (a.margem ?? -Infinity));
}
