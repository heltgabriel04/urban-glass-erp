import { supabase } from "@/lib/supabase/client";
import { getMargemPorPedido } from "./margem.service";
import type { GrupoItemEstoqueGeral } from "@/types";

export interface InventarioItemLinha {
  item_id: number;
  codigo: string;
  descricao: string;
  grupo: GrupoItemEstoqueGeral;
  unidade: string;
  saldo_qtd: number;
  custo_medio: number;
  valor_total: number;
}

export async function getInventarioAtual(filtro: { grupo?: GrupoItemEstoqueGeral } = {}): Promise<InventarioItemLinha[]> {
  let query = supabase
    .from("itens_estoque_gerais")
    .select("id, codigo, descricao, grupo, unidade, saldo_qtd, custo_medio, valor_total")
    .eq("ativo", true)
    .order("descricao");
  if (filtro.grupo) query = query.eq("grupo", filtro.grupo);

  const { data, error } = await query;
  if (error) { console.error("getInventarioAtual:", error); return []; }
  return ((data ?? []) as Array<{
    id: number; codigo: string; descricao: string; grupo: GrupoItemEstoqueGeral; unidade: string;
    saldo_qtd: number; custo_medio: number; valor_total: number;
  }>).map((i) => ({
    item_id: i.id, codigo: i.codigo, descricao: i.descricao, grupo: i.grupo, unidade: i.unidade,
    saldo_qtd: Number(i.saldo_qtd), custo_medio: Number(i.custo_medio), valor_total: Number(i.valor_total),
  }));
}

/**
 * Reconstrói o saldo/custo médio de cada item num instante do passado, sem
 * replay de deltas: pega a última linha do ledger antes/até `dataCorte` de
 * cada item (que já grava saldo_apos/custo_medio_apos) — é isso que permite
 * calcular Estoque Inicial/Final de um período pra fórmula de CMV.
 */
export async function getInventarioEm(dataCorte: string, filtro: { grupo?: GrupoItemEstoqueGeral } = {}): Promise<InventarioItemLinha[]> {
  const [{ data: movs, error: errMovs }, { data: itens, error: errItens }] = await Promise.all([
    supabase
      .from("itens_estoque_movimentacoes")
      .select("item_id, saldo_apos, custo_medio_apos")
      .lte("created_at", dataCorte)
      .order("id", { ascending: false }),
    supabase.from("itens_estoque_gerais").select("id, codigo, descricao, grupo, unidade"),
  ]);
  if (errMovs) { console.error("getInventarioEm (movs):", errMovs); return []; }
  if (errItens) { console.error("getInventarioEm (itens):", errItens); return []; }

  const ultimaPorItem = new Map<number, { saldo_apos: number; custo_medio_apos: number }>();
  for (const m of (movs ?? []) as Array<{ item_id: number; saldo_apos: number; custo_medio_apos: number }>) {
    if (!ultimaPorItem.has(m.item_id)) ultimaPorItem.set(m.item_id, m);
  }

  let itensFiltrados = (itens ?? []) as Array<{ id: number; codigo: string; descricao: string; grupo: GrupoItemEstoqueGeral; unidade: string }>;
  if (filtro.grupo) itensFiltrados = itensFiltrados.filter((i) => i.grupo === filtro.grupo);

  return itensFiltrados.map((i) => {
    const u = ultimaPorItem.get(i.id);
    const saldo_qtd = Number(u?.saldo_apos ?? 0);
    const custo_medio = Number(u?.custo_medio_apos ?? 0);
    return {
      item_id: i.id, codigo: i.codigo, descricao: i.descricao, grupo: i.grupo, unidade: i.unidade,
      saldo_qtd, custo_medio, valor_total: parseFloat((saldo_qtd * custo_medio).toFixed(2)),
    };
  });
}

export interface CMVFamiliaItensGerais {
  estoqueInicial: number;
  compras: number;
  estoqueFinal: number;
  cmv: number;
}

export interface CMVPeriodo {
  inicio: string;
  fim: string;
  /** Vidro não expõe EI/Compras/EF: o ledger de vidro (estoque_movimentacoes)
   *  só guarda saldo/custo ATUAL, não histórico por linha — não dá pra
   *  reconstruir esses valores num período passado sem mexer nele. */
  vidro: { cmv: number };
  itensGerais: CMVFamiliaItensGerais;
  cmvTotal: number;
  receita: number;
  lucroBruto: number;
  margemBrutaPct: number;
}

/** inicio/fim no formato 'YYYY-MM-DD'. */
export async function getCMVPeriodo(inicio: string, fim: string): Promise<CMVPeriodo> {
  const inicioAbertura = `${inicio}T00:00:00.000`;
  const fimFechamento = `${fim}T23:59:59.999`;
  const corteInicial = new Date(new Date(inicioAbertura).getTime() - 1).toISOString();

  const [margens, entradasRes, ei, ef] = await Promise.all([
    getMargemPorPedido(),
    supabase
      .from("itens_estoque_movimentacoes")
      .select("quantidade, custo_unitario")
      .eq("tipo", "entrada")
      .gte("created_at", inicioAbertura)
      .lte("created_at", fimFechamento),
    getInventarioEm(corteInicial),
    getInventarioEm(fimFechamento),
  ]);

  const margensPeriodo = margens.filter((m) => m.dt_pedido >= inicio && m.dt_pedido <= fim);
  const receita = margensPeriodo.reduce((s, m) => s + m.receita, 0);
  const cmvVidro = margensPeriodo.reduce((s, m) => s + m.custo, 0);

  const comprasValor = ((entradasRes.data ?? []) as Array<{ quantidade: number; custo_unitario: number | null }>)
    .reduce((s, m) => s + Number(m.quantidade) * Number(m.custo_unitario ?? 0), 0);

  const estoqueInicial = ei.reduce((s, i) => s + i.valor_total, 0);
  const estoqueFinal = ef.reduce((s, i) => s + i.valor_total, 0);
  const cmvItensGerais = parseFloat((estoqueInicial + comprasValor - estoqueFinal).toFixed(2));

  const cmvTotal = parseFloat((cmvVidro + cmvItensGerais).toFixed(2));
  const lucroBruto = parseFloat((receita - cmvTotal).toFixed(2));

  return {
    inicio, fim,
    vidro: { cmv: parseFloat(cmvVidro.toFixed(2)) },
    itensGerais: {
      estoqueInicial: parseFloat(estoqueInicial.toFixed(2)),
      compras: parseFloat(comprasValor.toFixed(2)),
      estoqueFinal: parseFloat(estoqueFinal.toFixed(2)),
      cmv: cmvItensGerais,
    },
    cmvTotal,
    receita: parseFloat(receita.toFixed(2)),
    lucroBruto,
    margemBrutaPct: receita > 0 ? parseFloat(((lucroBruto / receita) * 100).toFixed(2)) : 0,
  };
}
