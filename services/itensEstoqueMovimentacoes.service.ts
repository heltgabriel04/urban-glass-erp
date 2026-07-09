import { supabase } from "@/lib/supabase/client";
import type { ItemEstoqueMovimentacao, OrigemMovimentacaoItemEstoque, TipoMovimentacaoItemEstoque } from "@/types";
import { registrarLog } from "./log.service";

export interface RegistrarMovimentacaoItemParams {
  itemId: number;
  tipo: TipoMovimentacaoItemEstoque;
  origemTipo?: OrigemMovimentacaoItemEstoque;
  /** Chave de idempotência junto com item. Omita para lançamentos manuais. */
  origemId?: string;
  documentoFiscalId?: number | null;
  /** Positivo = entrada, negativo = saída/perda. Ignorado (forçado a 0) em 'transferencia'. */
  quantidade: number;
  /**
   * Custo desta movimentação. Em entradas, recalcula o custo médio ponderado.
   * Em saídas, se omitido, é preenchido com o custo médio vigente — é isso
   * que registra o CMV histórico daquela baixa.
   */
  custoUnitario?: number | null;
  localizacaoOrigem?: string | null;
  /** Obrigatório quando tipo='transferencia'. */
  localizacaoDestino?: string | null;
  usuario?: string | null;
  obs?: string | null;
}

export interface ResultadoMovimentacaoItem {
  ok: boolean;
  jaExistia?: boolean;
  motivo?: string;
  alertaMinimo?: boolean;
  alertaMensagem?: string;
}

export async function registrarMovimentacaoItem(params: RegistrarMovimentacaoItemParams): Promise<ResultadoMovimentacaoItem> {
  const {
    itemId, tipo, origemTipo = "manual", origemId, documentoFiscalId,
    custoUnitario, localizacaoOrigem, localizacaoDestino, usuario, obs,
  } = params;
  let quantidade = params.quantidade;

  if (origemId) {
    const { data: existente } = await supabase
      .from("itens_estoque_movimentacoes")
      .select("id")
      .eq("origem_tipo", origemTipo)
      .eq("origem_id", origemId)
      .eq("item_id", itemId)
      .maybeSingle();
    if (existente) return { ok: true, jaExistia: true };
  }

  const { data: itemRow } = await supabase
    .from("itens_estoque_gerais")
    .select("id, saldo_qtd, custo_medio, estoque_minimo, localizacao")
    .eq("id", itemId)
    .maybeSingle();
  if (!itemRow) return { ok: false, motivo: `Item de estoque #${itemId} não encontrado` };
  const item = itemRow as { id: number; saldo_qtd: number; custo_medio: number; estoque_minimo: number; localizacao: string | null };

  if (tipo === "saldo_inicial") {
    const { count } = await supabase
      .from("itens_estoque_movimentacoes")
      .select("id", { count: "exact", head: true })
      .eq("item_id", itemId);
    if ((count ?? 0) > 0) {
      return { ok: false, motivo: "Este item já tem movimentações — use Ajuste em vez de Saldo Inicial." };
    }
  }

  if (tipo === "transferencia") {
    if (!localizacaoDestino) return { ok: false, motivo: "Informe a localização de destino." };
    quantidade = 0;
  }

  // Bloqueia saída que levaria saldo a negativo
  if (quantidade < 0 && Number(item.saldo_qtd) + quantidade < -0.001) {
    return { ok: false, motivo: `Saldo insuficiente: ${item.saldo_qtd} disponível, tentativa de saída de ${Math.abs(quantidade)}` };
  }

  const novoSaldo = tipo === "transferencia"
    ? Number(item.saldo_qtd)
    : parseFloat((Number(item.saldo_qtd) + quantidade).toFixed(3));

  const custoEfetivo = tipo === "transferencia"
    ? Number(item.custo_medio)
    : (custoUnitario ?? (quantidade < 0 ? Number(item.custo_medio) : null));

  // Custo médio ponderado: só recalcula em entrada (quantidade>0) com custo informado.
  let novoCustoMedio = Number(item.custo_medio ?? 0);
  if (tipo !== "transferencia" && quantidade > 0 && custoUnitario != null) {
    const saldoAnterior = Number(item.saldo_qtd);
    novoCustoMedio = saldoAnterior + quantidade > 0
      ? parseFloat((((saldoAnterior * Number(item.custo_medio ?? 0)) + (quantidade * custoUnitario)) / (saldoAnterior + quantidade)).toFixed(4))
      : custoUnitario;
  }

  const agora = new Date().toISOString();
  const updatePatch: Record<string, unknown> = {
    saldo_qtd: novoSaldo,
    custo_medio: novoCustoMedio,
    ultima_movimentacao_em: agora,
    updated_at: agora,
  };
  if (tipo === "entrada") updatePatch.ultima_compra_em = agora;
  if (tipo === "transferencia") updatePatch.localizacao = localizacaoDestino;

  const { error: errUpd } = await supabase.from("itens_estoque_gerais").update(updatePatch as never).eq("id", itemId);
  if (errUpd) return { ok: false, motivo: errUpd.message };

  const { error: errIns } = await supabase.from("itens_estoque_movimentacoes").insert({
    item_id: itemId, tipo, origem_tipo: origemTipo, origem_id: origemId ?? null,
    documento_fiscal_id: documentoFiscalId ?? null,
    quantidade, custo_unitario: custoEfetivo,
    saldo_apos: novoSaldo, custo_medio_apos: novoCustoMedio,
    localizacao_origem: tipo === "transferencia" ? (localizacaoOrigem ?? item.localizacao ?? null) : null,
    localizacao_destino: tipo === "transferencia" ? localizacaoDestino : null,
    usuario: usuario ?? null, obs: obs ?? null,
  } as never);
  if (errIns) return { ok: false, motivo: errIns.message };

  registrarLog({
    acao: "criou",
    tabela: "itens_estoque_movimentacoes",
    registro_id: String(itemId),
    descricao: `Registrou movimentação (${tipo}) no item de estoque #${itemId}`,
    campos_alterados: { tipo, quantidade, custo_unitario: custoEfetivo },
  });

  if (item.estoque_minimo > 0 && novoSaldo <= item.estoque_minimo && tipo !== "transferencia") {
    return { ok: true, alertaMinimo: true, alertaMensagem: `Estoque abaixo do mínimo: ${novoSaldo} (mínimo: ${item.estoque_minimo})` };
  }
  return { ok: true };
}

/**
 * Só permite reverter a(s) movimentação(ões) mais recente(s) de cada item
 * envolvido — reverter fora de ordem corromperia os snapshots saldo_apos/
 * custo_medio_apos das linhas seguintes.
 */
export async function reverterMovimentacaoItem(
  alvo: { movimentacaoId: number } | { origemTipo: OrigemMovimentacaoItemEstoque; origemId: string }
): Promise<ResultadoMovimentacaoItem> {
  let movsQuery = supabase.from("itens_estoque_movimentacoes").select("id, item_id");
  movsQuery = "movimentacaoId" in alvo
    ? movsQuery.eq("id", alvo.movimentacaoId)
    : movsQuery.eq("origem_tipo", alvo.origemTipo).eq("origem_id", alvo.origemId);
  const { data: movsData, error } = await movsQuery;
  if (error) return { ok: false, motivo: error.message };
  const movs = (movsData ?? []) as Array<{ id: number; item_id: number }>;
  if (movs.length === 0) return { ok: true };

  const itemIds = Array.from(new Set(movs.map((m) => m.item_id)));

  for (const itemId of itemIds) {
    const maxIdAlvo = Math.max(...movs.filter((m) => m.item_id === itemId).map((m) => m.id));
    const { data: maisRecente } = await supabase
      .from("itens_estoque_movimentacoes")
      .select("id")
      .eq("item_id", itemId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maisRecente && (maisRecente as { id: number }).id > maxIdAlvo) {
      return { ok: false, motivo: `Existem movimentações mais recentes para o item #${itemId} — não é possível reverter fora de ordem.` };
    }
  }

  for (const itemId of itemIds) {
    const idsAlvo = movs.filter((m) => m.item_id === itemId).map((m) => m.id);
    await supabase.from("itens_estoque_movimentacoes").delete().in("id", idsAlvo);

    const { data: ultima } = await supabase
      .from("itens_estoque_movimentacoes")
      .select("saldo_apos, custo_medio_apos")
      .eq("item_id", itemId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    const linha = ultima as { saldo_apos: number; custo_medio_apos: number } | null;
    await supabase.from("itens_estoque_gerais").update({
      saldo_qtd: linha?.saldo_apos ?? 0,
      custo_medio: linha?.custo_medio_apos ?? 0,
      updated_at: new Date().toISOString(),
    } as never).eq("id", itemId);
  }

  registrarLog({
    acao: "excluiu",
    tabela: "itens_estoque_movimentacoes",
    descricao: `Reverteu movimentação(ões) ${movs.map((m) => m.id).join(", ")}`,
  });
  return { ok: true };
}

export async function getMovimentacoesPorItem(itemId: number): Promise<ItemEstoqueMovimentacao[]> {
  const { data, error } = await supabase
    .from("itens_estoque_movimentacoes")
    .select("*, itens_estoque_gerais ( id, codigo, descricao, unidade ), documentos_fiscais ( id, numero_documento, tipo )")
    .eq("item_id", itemId)
    .order("id", { ascending: false });
  if (error) { console.error("getMovimentacoesPorItem:", error); return []; }
  return data as ItemEstoqueMovimentacao[];
}

export interface FiltroMovimentacoes {
  tipo?: TipoMovimentacaoItemEstoque;
  itemId?: number;
  documentoFiscalId?: number;
  inicio?: string;
  fim?: string;
}

export async function getMovimentacoes(filtro: FiltroMovimentacoes = {}): Promise<ItemEstoqueMovimentacao[]> {
  let query = supabase
    .from("itens_estoque_movimentacoes")
    .select("*, itens_estoque_gerais ( id, codigo, descricao, unidade ), documentos_fiscais ( id, numero_documento, tipo )")
    .order("id", { ascending: false });

  if (filtro.tipo) query = query.eq("tipo", filtro.tipo);
  if (filtro.itemId) query = query.eq("item_id", filtro.itemId);
  if (filtro.documentoFiscalId) query = query.eq("documento_fiscal_id", filtro.documentoFiscalId);
  if (filtro.inicio) query = query.gte("created_at", filtro.inicio);
  if (filtro.fim) query = query.lte("created_at", filtro.fim);

  const { data, error } = await query;
  if (error) { console.error("getMovimentacoes:", error); return []; }
  return data as ItemEstoqueMovimentacao[];
}
