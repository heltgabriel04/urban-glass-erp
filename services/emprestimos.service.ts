import { supabase } from "@/lib/supabase/client";
import type { Emprestimo, EmprestimoInsert, EmprestimoUpdate, EmprestimoParcela } from "@/types";
import { calcularTabelaPrice } from "@/lib/amortizacao";
import { registrarLog } from "./log.service";

const BUCKET = "contabilidade-anexos";

export async function getEmprestimos(filtro: { ativo?: boolean } = {}): Promise<Emprestimo[]> {
  let query = supabase.from("emprestimos").select("*").order("descricao");
  if (filtro.ativo !== undefined) query = query.eq("ativo", filtro.ativo);
  const { data, error } = await query;
  if (error) { console.error("getEmprestimos:", error); return []; }
  return data as Emprestimo[];
}

export async function criarEmprestimo(input: EmprestimoInsert): Promise<Emprestimo | null> {
  const { data, error } = await supabase.from("emprestimos").insert([input as never]).select().single();
  if (error) { console.error("criarEmprestimo:", error); return null; }
  const emprestimo = data as Emprestimo;
  registrarLog({ acao: "criou", tabela: "emprestimos", registro_id: String(emprestimo.id), descricao: `Criou empréstimo ${emprestimo.descricao}` });
  return emprestimo;
}

export async function atualizarEmprestimo(id: number, patch: EmprestimoUpdate): Promise<boolean> {
  const { error } = await supabase.from("emprestimos").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarEmprestimo:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "emprestimos", registro_id: String(id), descricao: `Atualizou empréstimo #${id}`, campos_alterados: patch as Record<string, unknown> });
  return true;
}

export async function inativarEmprestimo(id: number): Promise<boolean> {
  const { error } = await supabase.from("emprestimos").update({ ativo: false, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("inativarEmprestimo:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "emprestimos", registro_id: String(id), descricao: `Inativou empréstimo #${id}` });
  return true;
}

export async function reativarEmprestimo(id: number): Promise<boolean> {
  const { error } = await supabase.from("emprestimos").update({ ativo: true, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("reativarEmprestimo:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "emprestimos", registro_id: String(id), descricao: `Reativou empréstimo #${id}` });
  return true;
}

/** Gera o plano de amortização (Tabela Price) — só funciona se o empréstimo ainda não tiver parcelas. */
export async function gerarParcelasEmprestimo(emprestimoId: number): Promise<{ ok: boolean; motivo?: string }> {
  const { count } = await supabase.from("emprestimos_parcelas").select("id", { count: "exact", head: true }).eq("emprestimo_id", emprestimoId);
  if ((count ?? 0) > 0) return { ok: false, motivo: "Este empréstimo já tem parcelas geradas." };

  const { data: emp } = await supabase.from("emprestimos").select("*").eq("id", emprestimoId).maybeSingle();
  if (!emp) return { ok: false, motivo: "Empréstimo não encontrado." };
  const e = emp as Emprestimo;

  const tabela = calcularTabelaPrice(e.valor_contratado, e.taxa_juros_pct_am, e.numero_parcelas, e.data_primeira_parcela);
  const linhas = tabela.map((p) => ({ emprestimo_id: emprestimoId, ...p }));

  const { error } = await supabase.from("emprestimos_parcelas").insert(linhas as never);
  if (error) return { ok: false, motivo: error.message };

  registrarLog({ acao: "criou", tabela: "emprestimos_parcelas", registro_id: String(emprestimoId), descricao: `Gerou ${tabela.length} parcela(s) do empréstimo #${emprestimoId} (Tabela Price)` });
  return { ok: true };
}

export async function getParcelasEmprestimo(emprestimoId: number): Promise<EmprestimoParcela[]> {
  const { data, error } = await supabase.from("emprestimos_parcelas").select("*").eq("emprestimo_id", emprestimoId).order("numero_parcela");
  if (error) { console.error("getParcelasEmprestimo:", error); return []; }
  return data as EmprestimoParcela[];
}

export async function marcarParcelaEmprestimoPaga(parcelaId: number, dataPagamento: string, comprovanteUrl?: string | null): Promise<boolean> {
  const { error } = await supabase.from("emprestimos_parcelas").update({
    status: "pago", data_pagamento: dataPagamento, comprovante_url: comprovanteUrl ?? null, updated_at: new Date().toISOString(),
  } as never).eq("id", parcelaId);
  if (error) { console.error("marcarParcelaEmprestimoPaga:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "emprestimos_parcelas", registro_id: String(parcelaId), descricao: `Marcou parcela de empréstimo #${parcelaId} como paga` });
  return true;
}

export async function reabrirParcelaEmprestimo(parcelaId: number): Promise<boolean> {
  const { error } = await supabase.from("emprestimos_parcelas").update({
    status: "pendente", data_pagamento: null, updated_at: new Date().toISOString(),
  } as never).eq("id", parcelaId);
  if (error) { console.error("reabrirParcelaEmprestimo:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "emprestimos_parcelas", registro_id: String(parcelaId), descricao: `Reabriu parcela de empréstimo #${parcelaId}` });
  return true;
}

export async function uploadAnexoEmprestimo(area: "emprestimos" | "emprestimos-parcelas", id: number, file: File, tipo: string): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `${area}/${id}/${tipo}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadAnexoEmprestimo:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
