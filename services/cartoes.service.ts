import { supabase } from "@/lib/supabase/client";
import type {
  Cartao, CartaoInsert, CartaoUpdate, CartaoFatura, CartaoFaturaInsert, CartaoFaturaUpdate,
  CartaoLancamento, CartaoLancamentoInsert, CartaoLancamentoUpdate,
} from "@/types";
import { registrarLog } from "./log.service";

const BUCKET = "contabilidade-anexos";

// ─── Cartões (cadastro) ────────────────────────────────────

export async function getCartoes(filtro: { ativo?: boolean } = {}): Promise<Cartao[]> {
  let query = supabase.from("cartoes").select("*").order("nome");
  if (filtro.ativo !== undefined) query = query.eq("ativo", filtro.ativo);
  const { data, error } = await query;
  if (error) { console.error("getCartoes:", error); return []; }
  return data as Cartao[];
}

export async function criarCartao(input: CartaoInsert): Promise<Cartao | null> {
  const { data, error } = await supabase.from("cartoes").insert([input as never]).select().single();
  if (error) { console.error("criarCartao:", error); return null; }
  const cartao = data as Cartao;
  registrarLog({ acao: "criou", tabela: "cartoes", registro_id: String(cartao.id), descricao: `Criou cartão ${cartao.nome}` });
  return cartao;
}

export async function atualizarCartao(id: number, patch: CartaoUpdate): Promise<boolean> {
  const { error } = await supabase.from("cartoes").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarCartao:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "cartoes", registro_id: String(id), descricao: `Atualizou cartão #${id}`, campos_alterados: patch as Record<string, unknown> });
  return true;
}

export async function inativarCartao(id: number): Promise<boolean> {
  const { error } = await supabase.from("cartoes").update({ ativo: false, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("inativarCartao:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "cartoes", registro_id: String(id), descricao: `Inativou cartão #${id}` });
  return true;
}

export async function reativarCartao(id: number): Promise<boolean> {
  const { error } = await supabase.from("cartoes").update({ ativo: true, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("reativarCartao:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "cartoes", registro_id: String(id), descricao: `Reativou cartão #${id}` });
  return true;
}

// ─── Faturas ─────────────────────────────────────────────

export interface FiltroFaturas {
  cartaoId?: number;
  status?: CartaoFatura["status"];
  competenciaAno?: number;
  competenciaMes?: number;
}

interface FaturaComLancamento extends CartaoFatura {
  lancamentos?: { status: string; dt_pagamento: string | null } | null;
}

export async function getFaturas(filtro: FiltroFaturas = {}): Promise<CartaoFatura[]> {
  let query = supabase
    .from("cartoes_faturas")
    .select("*, cartoes ( id, nome, tipo ), lancamentos ( status, dt_pagamento )")
    .order("competencia_ano", { ascending: false })
    .order("competencia_mes", { ascending: false });
  if (filtro.cartaoId) query = query.eq("cartao_id", filtro.cartaoId);
  if (filtro.status) query = query.eq("status", filtro.status);
  if (filtro.competenciaAno) query = query.eq("competencia_ano", filtro.competenciaAno);
  if (filtro.competenciaMes) query = query.eq("competencia_mes", filtro.competenciaMes);
  const { data, error } = await query;
  if (error) { console.error("getFaturas:", error); return []; }

  const faturas = (data ?? []) as unknown as FaturaComLancamento[];
  for (const f of faturas) {
    if (f.lancamentos?.status === "Pago" && f.status !== "paga") {
      const dataPagamento = f.lancamentos.dt_pagamento ?? new Date().toISOString().split("T")[0];
      await supabase.from("cartoes_faturas").update({ status: "paga", data_pagamento: dataPagamento } as never).eq("id", f.id);
      f.status = "paga";
      f.data_pagamento = dataPagamento;
    }
    delete f.lancamentos;
  }
  return faturas as CartaoFatura[];
}

export async function criarFatura(input: CartaoFaturaInsert): Promise<CartaoFatura | null> {
  const { data, error } = await supabase.from("cartoes_faturas").insert([{ ...input, valor_total: 0 } as never]).select().single();
  if (error) { console.error("criarFatura:", error); return null; }
  const fatura = data as CartaoFatura;
  registrarLog({ acao: "criou", tabela: "cartoes_faturas", registro_id: String(fatura.id), descricao: `Criou fatura ${fatura.competencia_mes}/${fatura.competencia_ano} do cartão #${fatura.cartao_id}` });
  return fatura;
}

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/** Cria o lançamento único da fatura fechada em `lancamentos` — o cartão
 *  corporativo debita a conta numa parcela só, na data de vencimento da
 *  fatura, independente de quantas compras aconteceram dentro dela. O
 *  detalhamento por compra continua vivo em cartoes_lancamentos, não se
 *  perde. Idempotente: só roda se a fatura ainda não tiver lancamento_id. */
async function gerarLancamentoDaFatura(faturaId: number): Promise<void> {
  const { data: faturaRow } = await supabase
    .from("cartoes_faturas")
    .select("id, valor_total, data_vencimento, competencia_ano, competencia_mes, lancamento_id, cartoes ( nome )")
    .eq("id", faturaId)
    .maybeSingle();
  if (!faturaRow) return;
  const fatura = faturaRow as unknown as {
    id: number; valor_total: number; data_vencimento: string | null;
    competencia_ano: number; competencia_mes: number; lancamento_id: number | null;
    cartoes: { nome: string } | null;
  };
  if (fatura.lancamento_id) return; // já gerado antes, não duplica

  const nomeCartao = fatura.cartoes?.nome ?? "cartão";
  const mesLabel = MESES_ABREV[fatura.competencia_mes - 1] ?? String(fatura.competencia_mes);

  const { data: lancamento, error } = await supabase
    .from("lancamentos")
    .insert([{
      tipo: "Saída",
      descricao: `Fatura cartão ${nomeCartao} — ${mesLabel}/${fatura.competencia_ano}`,
      valor: fatura.valor_total,
      status: "Pendente",
      vencimento: fatura.data_vencimento,
      plano_contas_id: null,
      fornecedor_id: null,
      pedido_id: null,
      cliente_id: null,
    } as never])
    .select("id")
    .single();
  if (error || !lancamento) { console.error("gerarLancamentoDaFatura:", error); return; }

  await supabase.from("cartoes_faturas").update({ lancamento_id: (lancamento as { id: number }).id } as never).eq("id", faturaId);
}

export async function atualizarFatura(id: number, patch: CartaoFaturaUpdate): Promise<boolean> {
  const { error } = await supabase.from("cartoes_faturas").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarFatura:", error); return false; }
  if (patch.status === "fechada") await gerarLancamentoDaFatura(id);
  registrarLog({ acao: "atualizou", tabela: "cartoes_faturas", registro_id: String(id), descricao: `Atualizou fatura #${id}`, campos_alterados: patch as Record<string, unknown> });
  return true;
}

async function recalcularValorTotalFatura(faturaId: number): Promise<void> {
  const { data } = await supabase.from("cartoes_lancamentos").select("valor").eq("fatura_id", faturaId).is("deletado_em", null);
  const total = ((data ?? []) as Array<{ valor: number }>).reduce((s, l) => s + Number(l.valor), 0);
  await supabase.from("cartoes_faturas").update({ valor_total: parseFloat(total.toFixed(2)), updated_at: new Date().toISOString() } as never).eq("id", faturaId);
}

// ─── Lançamentos (detalhamento da fatura) ───────────────────

export async function getLancamentosFatura(faturaId: number): Promise<CartaoLancamento[]> {
  const { data, error } = await supabase.from("cartoes_lancamentos").select("*, fornecedores ( id, nome )").eq("fatura_id", faturaId).is("deletado_em", null).order("data");
  if (error) { console.error("getLancamentosFatura:", error); return []; }
  return data as CartaoLancamento[];
}

export async function getLancamentosCartao(cartaoId: number, filtro: { semFatura?: boolean } = {}): Promise<CartaoLancamento[]> {
  let query = supabase.from("cartoes_lancamentos").select("*, fornecedores ( id, nome )").eq("cartao_id", cartaoId).is("deletado_em", null).order("data", { ascending: false });
  if (filtro.semFatura) query = query.is("fatura_id", null);
  const { data, error } = await query;
  if (error) { console.error("getLancamentosCartao:", error); return []; }
  return data as CartaoLancamento[];
}

export async function criarLancamentoCartao(input: CartaoLancamentoInsert): Promise<CartaoLancamento | null> {
  const { data, error } = await supabase.from("cartoes_lancamentos").insert([input as never]).select().single();
  if (error) { console.error("criarLancamentoCartao:", error); return null; }
  const lanc = data as CartaoLancamento;
  if (lanc.fatura_id) await recalcularValorTotalFatura(lanc.fatura_id);

  // Débito sem fatura debita a conta na hora — gera o lançamento já aqui,
  // um por compra (diferente do crédito, que agrega tudo na fatura).
  if (!lanc.fatura_id) {
    const { data: cartaoRow } = await supabase.from("cartoes").select("tipo").eq("id", lanc.cartao_id).maybeSingle();
    const tipoCartao = (cartaoRow as { tipo: "credito" | "debito" } | null)?.tipo;
    if (tipoCartao === "debito") {
      const { data: lancamento, error: errLanc } = await supabase
        .from("lancamentos")
        .insert([{
          tipo: "Saída",
          descricao: lanc.descricao,
          valor: lanc.valor,
          status: "Pendente",
          vencimento: lanc.data,
          plano_contas_id: lanc.plano_contas_id,
          fornecedor_id: lanc.fornecedor_id,
          pedido_id: null,
          cliente_id: null,
        } as never])
        .select("id")
        .single();
      if (!errLanc && lancamento) {
        await supabase.from("cartoes_lancamentos").update({ lancamento_id: (lancamento as { id: number }).id } as never).eq("id", lanc.id);
        lanc.lancamento_id = (lancamento as { id: number }).id;
      } else {
        console.error("criarLancamentoCartao (lancamento débito):", errLanc);
      }
    }
  }

  registrarLog({ acao: "criou", tabela: "cartoes_lancamentos", registro_id: String(lanc.id), descricao: `Criou lançamento de cartão: ${lanc.descricao} (${lanc.valor})` });
  return lanc;
}

export async function atualizarLancamentoCartao(id: number, patch: CartaoLancamentoUpdate): Promise<boolean> {
  const { data: antes } = await supabase.from("cartoes_lancamentos").select("fatura_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("cartoes_lancamentos").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarLancamentoCartao:", error); return false; }
  const faturaId = patch.fatura_id ?? (antes as { fatura_id: number | null } | null)?.fatura_id;
  if (faturaId) await recalcularValorTotalFatura(faturaId);
  registrarLog({ acao: "atualizou", tabela: "cartoes_lancamentos", registro_id: String(id), descricao: `Atualizou lançamento de cartão #${id}`, campos_alterados: patch as Record<string, unknown> });
  return true;
}

// Nunca DELETE físico — só marca deletado_em/deletado_por/motivo_exclusao (mesmo padrão de documentos_fiscais).
export async function softDeleteLancamentoCartao(id: number, usuarioEmail: string, motivo?: string): Promise<boolean> {
  const { data: lanc } = await supabase.from("cartoes_lancamentos").select("fatura_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("cartoes_lancamentos").update({
    deletado_em: new Date().toISOString(), deletado_por: usuarioEmail, motivo_exclusao: motivo ?? null,
  } as never).eq("id", id);
  if (error) { console.error("softDeleteLancamentoCartao:", error); return false; }
  const faturaId = (lanc as { fatura_id: number | null } | null)?.fatura_id;
  if (faturaId) await recalcularValorTotalFatura(faturaId);
  registrarLog({ acao: "excluiu", tabela: "cartoes_lancamentos", registro_id: String(id), descricao: `Excluiu lançamento de cartão #${id}${motivo ? ` — ${motivo}` : ""}` });
  return true;
}

// ─── Storage ────────────────────────────────────────────────

export async function uploadAnexoCartao(area: "cartoes" | "cartoes-faturas" | "cartoes-lancamentos", id: number, file: File, tipo: string): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `${area}/${id}/${tipo}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadAnexoCartao:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
