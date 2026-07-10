import { supabase } from "@/lib/supabase/client";
import type { Consorcio, ConsorcioInsert, ConsorcioUpdate, ConsorcioParcela, ConsorcioLance, ConsorcioLanceInsert, ConsorcioLanceUpdate } from "@/types";
import { gerarParcelasFixas } from "@/lib/amortizacao";
import { registrarLog } from "./log.service";

const BUCKET = "contabilidade-anexos";

export async function getConsorcios(filtro: { ativo?: boolean } = {}): Promise<Consorcio[]> {
  let query = supabase.from("consorcios").select("*").order("descricao");
  if (filtro.ativo !== undefined) query = query.eq("ativo", filtro.ativo);
  const { data, error } = await query;
  if (error) { console.error("getConsorcios:", error); return []; }
  return data as Consorcio[];
}

export async function criarConsorcio(input: ConsorcioInsert): Promise<Consorcio | null> {
  const { data, error } = await supabase.from("consorcios").insert([input as never]).select().single();
  if (error) { console.error("criarConsorcio:", error); return null; }
  const consorcio = data as Consorcio;
  registrarLog({ acao: "criou", tabela: "consorcios", registro_id: String(consorcio.id), descricao: `Criou consórcio ${consorcio.descricao}` });
  return consorcio;
}

export async function atualizarConsorcio(id: number, patch: ConsorcioUpdate): Promise<boolean> {
  const { error } = await supabase.from("consorcios").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarConsorcio:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "consorcios", registro_id: String(id), descricao: `Atualizou consórcio #${id}`, campos_alterados: patch as Record<string, unknown> });
  return true;
}

export async function inativarConsorcio(id: number): Promise<boolean> {
  const { error } = await supabase.from("consorcios").update({ ativo: false, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("inativarConsorcio:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "consorcios", registro_id: String(id), descricao: `Inativou consórcio #${id}` });
  return true;
}

export async function reativarConsorcio(id: number): Promise<boolean> {
  const { error } = await supabase.from("consorcios").update({ ativo: true, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("reativarConsorcio:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "consorcios", registro_id: String(id), descricao: `Reativou consórcio #${id}` });
  return true;
}

export async function marcarContemplado(consorcioId: number, dataContemplacao: string, cartaUrl?: string | null): Promise<boolean> {
  const { error } = await supabase.from("consorcios").update({
    status: "contemplado", contemplado_em: dataContemplacao, carta_contemplacao_url: cartaUrl ?? null, updated_at: new Date().toISOString(),
  } as never).eq("id", consorcioId);
  if (error) { console.error("marcarContemplado:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "consorcios", registro_id: String(consorcioId), descricao: `Marcou consórcio #${consorcioId} como contemplado` });
  return true;
}

/** Gera N parcelas iguais — só funciona se o consórcio ainda não tiver parcelas. */
export async function gerarParcelasConsorcio(consorcioId: number): Promise<{ ok: boolean; motivo?: string }> {
  const { count } = await supabase.from("consorcios_parcelas").select("id", { count: "exact", head: true }).eq("consorcio_id", consorcioId);
  if ((count ?? 0) > 0) return { ok: false, motivo: "Este consórcio já tem parcelas geradas." };

  const { data: cons } = await supabase.from("consorcios").select("*").eq("id", consorcioId).maybeSingle();
  if (!cons) return { ok: false, motivo: "Consórcio não encontrado." };
  const c = cons as Consorcio;

  const tabela = gerarParcelasFixas(c.valor_parcela, c.numero_parcelas, c.data_adesao);
  const linhas = tabela.map((p) => ({ consorcio_id: consorcioId, ...p }));

  const { error } = await supabase.from("consorcios_parcelas").insert(linhas as never);
  if (error) return { ok: false, motivo: error.message };

  registrarLog({ acao: "criou", tabela: "consorcios_parcelas", registro_id: String(consorcioId), descricao: `Gerou ${tabela.length} parcela(s) do consórcio #${consorcioId}` });
  return { ok: true };
}

export async function getParcelasConsorcio(consorcioId: number): Promise<ConsorcioParcela[]> {
  const { data, error } = await supabase.from("consorcios_parcelas").select("*").eq("consorcio_id", consorcioId).order("numero_parcela");
  if (error) { console.error("getParcelasConsorcio:", error); return []; }
  return data as ConsorcioParcela[];
}

export async function marcarParcelaConsorcioPaga(parcelaId: number, dataPagamento: string, comprovanteUrl?: string | null): Promise<boolean> {
  const { error } = await supabase.from("consorcios_parcelas").update({
    status: "pago", data_pagamento: dataPagamento, comprovante_url: comprovanteUrl ?? null, updated_at: new Date().toISOString(),
  } as never).eq("id", parcelaId);
  if (error) { console.error("marcarParcelaConsorcioPaga:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "consorcios_parcelas", registro_id: String(parcelaId), descricao: `Marcou parcela de consórcio #${parcelaId} como paga` });
  return true;
}

export async function reabrirParcelaConsorcio(parcelaId: number): Promise<boolean> {
  const { error } = await supabase.from("consorcios_parcelas").update({
    status: "pendente", data_pagamento: null, updated_at: new Date().toISOString(),
  } as never).eq("id", parcelaId);
  if (error) { console.error("reabrirParcelaConsorcio:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "consorcios_parcelas", registro_id: String(parcelaId), descricao: `Reabriu parcela de consórcio #${parcelaId}` });
  return true;
}

export async function getLancesConsorcio(consorcioId: number): Promise<ConsorcioLance[]> {
  const { data, error } = await supabase.from("consorcios_lances").select("*").eq("consorcio_id", consorcioId).order("data", { ascending: false });
  if (error) { console.error("getLancesConsorcio:", error); return []; }
  return data as ConsorcioLance[];
}

export async function criarLance(input: ConsorcioLanceInsert): Promise<ConsorcioLance | null> {
  const { data, error } = await supabase.from("consorcios_lances").insert([input as never]).select().single();
  if (error) { console.error("criarLance:", error); return null; }
  const lance = data as ConsorcioLance;
  registrarLog({ acao: "criou", tabela: "consorcios_lances", registro_id: String(lance.id), descricao: `Criou lance de ${lance.valor} no consórcio #${lance.consorcio_id}` });
  return lance;
}

export async function atualizarLance(id: number, patch: ConsorcioLanceUpdate): Promise<boolean> {
  const { error } = await supabase.from("consorcios_lances").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarLance:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "consorcios_lances", registro_id: String(id), descricao: `Atualizou lance #${id}`, campos_alterados: patch as Record<string, unknown> });
  return true;
}

export async function uploadAnexoConsorcio(area: "consorcios" | "consorcios-parcelas", id: number, file: File, tipo: string): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `${area}/${id}/${tipo}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadAnexoConsorcio:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
