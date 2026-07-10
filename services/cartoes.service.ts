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

export async function getFaturas(filtro: FiltroFaturas = {}): Promise<CartaoFatura[]> {
  let query = supabase.from("cartoes_faturas").select("*, cartoes ( id, nome, tipo )").order("competencia_ano", { ascending: false }).order("competencia_mes", { ascending: false });
  if (filtro.cartaoId) query = query.eq("cartao_id", filtro.cartaoId);
  if (filtro.status) query = query.eq("status", filtro.status);
  if (filtro.competenciaAno) query = query.eq("competencia_ano", filtro.competenciaAno);
  if (filtro.competenciaMes) query = query.eq("competencia_mes", filtro.competenciaMes);
  const { data, error } = await query;
  if (error) { console.error("getFaturas:", error); return []; }
  return data as CartaoFatura[];
}

export async function criarFatura(input: CartaoFaturaInsert): Promise<CartaoFatura | null> {
  const { data, error } = await supabase.from("cartoes_faturas").insert([{ ...input, valor_total: 0 } as never]).select().single();
  if (error) { console.error("criarFatura:", error); return null; }
  const fatura = data as CartaoFatura;
  registrarLog({ acao: "criou", tabela: "cartoes_faturas", registro_id: String(fatura.id), descricao: `Criou fatura ${fatura.competencia_mes}/${fatura.competencia_ano} do cartão #${fatura.cartao_id}` });
  return fatura;
}

export async function atualizarFatura(id: number, patch: CartaoFaturaUpdate): Promise<boolean> {
  const { error } = await supabase.from("cartoes_faturas").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarFatura:", error); return false; }
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
