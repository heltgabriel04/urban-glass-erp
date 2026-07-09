import { supabase } from "@/lib/supabase/client";
import type { ChecklistItem, ContabilidadeFechamento, StatusChecklistItem } from "@/types";
import { CHECKLIST_ITENS, itemDisponivel } from "@/lib/contabilidadeChecklist";
import { registrarLog } from "./log.service";

const BUCKET = "contabilidade-anexos";

function calcularPercentual(itens: ChecklistItem[]): number {
  const aplicaveis = itens.filter((i) => i.status !== "nao_aplicavel");
  if (aplicaveis.length === 0) return 0;
  const concluidos = aplicaveis.filter((i) => i.status === "concluido").length;
  return Math.round((concluidos / aplicaveis.length) * 4) * 25;
}

export async function getOrCreateFechamento(ano: number, mes: number): Promise<{ fechamento: ContabilidadeFechamento; itens: ChecklistItem[] }> {
  const { data: existente } = await supabase
    .from("contabilidade_fechamentos")
    .select("*")
    .eq("competencia_ano", ano)
    .eq("competencia_mes", mes)
    .maybeSingle();

  let fechamento = existente as ContabilidadeFechamento | null;
  if (!fechamento) {
    const { data: criado, error } = await supabase
      .from("contabilidade_fechamentos")
      .insert([{ competencia_ano: ano, competencia_mes: mes } as never])
      .select()
      .single();
    if (error) throw new Error(error.message);
    fechamento = criado as ContabilidadeFechamento;
  }

  const novosItens = CHECKLIST_ITENS.map((def) => ({
    fechamento_id: fechamento!.id,
    item_key: def.key,
    status: (itemDisponivel(def) ? "pendente" : "nao_aplicavel") as StatusChecklistItem,
  }));
  await supabase
    .from("contabilidade_checklist_itens")
    .upsert(novosItens as never, { onConflict: "fechamento_id,item_key", ignoreDuplicates: true });

  const { data: itens } = await supabase
    .from("contabilidade_checklist_itens")
    .select("*")
    .eq("fechamento_id", fechamento.id)
    .order("id");

  return { fechamento, itens: (itens ?? []) as ChecklistItem[] };
}

export async function atualizarItemChecklist(
  itemId: number,
  patch: { status?: StatusChecklistItem; responsavel?: string | null; data_conclusao?: string | null; observacao?: string | null }
): Promise<boolean> {
  const { data: item, error } = await supabase
    .from("contabilidade_checklist_itens")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", itemId)
    .select()
    .single();
  if (error) { console.error("atualizarItemChecklist:", error); return false; }

  const fechamentoId = (item as ChecklistItem).fechamento_id;
  const { data: itens } = await supabase
    .from("contabilidade_checklist_itens")
    .select("*")
    .eq("fechamento_id", fechamentoId);
  const percentual = calcularPercentual((itens ?? []) as ChecklistItem[]);
  await supabase
    .from("contabilidade_fechamentos")
    .update({ percentual, updated_at: new Date().toISOString() } as never)
    .eq("id", fechamentoId);

  registrarLog({
    acao: "atualizou",
    tabela: "contabilidade_checklist_itens",
    registro_id: String(itemId),
    descricao: `Atualizou item de checklist #${itemId}`,
    campos_alterados: patch as Record<string, unknown>,
  });
  return true;
}

export async function uploadAnexoChecklistItem(itemId: number, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `checklist/${itemId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadAnexoChecklistItem:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function concluirFechamento(fechamentoId: number, usuarioEmail: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data: itens } = await supabase
    .from("contabilidade_checklist_itens")
    .select("*")
    .eq("fechamento_id", fechamentoId);
  const pendentes = ((itens ?? []) as ChecklistItem[]).filter(
    (i) => i.status === "pendente" || i.status === "em_andamento"
  );
  if (pendentes.length > 0) {
    return { ok: false, motivo: `Existem ${pendentes.length} item(ns) pendente(s) no checklist.` };
  }

  const { error } = await supabase
    .from("contabilidade_fechamentos")
    .update({
      status: "concluido",
      concluido_em: new Date().toISOString(),
      concluido_por: usuarioEmail,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", fechamentoId);
  if (error) return { ok: false, motivo: error.message };

  registrarLog({
    acao: "atualizou",
    tabela: "contabilidade_fechamentos",
    registro_id: String(fechamentoId),
    descricao: `Concluiu fechamento mensal #${fechamentoId}`,
  });
  return { ok: true };
}

export async function reabrirFechamento(fechamentoId: number): Promise<boolean> {
  const { error } = await supabase
    .from("contabilidade_fechamentos")
    .update({ status: "aberto", concluido_em: null, concluido_por: null, updated_at: new Date().toISOString() } as never)
    .eq("id", fechamentoId);
  if (error) { console.error("reabrirFechamento:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "contabilidade_fechamentos",
    registro_id: String(fechamentoId),
    descricao: `Reabriu fechamento mensal #${fechamentoId}`,
  });
  return true;
}
