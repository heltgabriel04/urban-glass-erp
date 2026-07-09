import { supabase } from "@/lib/supabase/client";
import type { AtivoImobilizado, AtivoImobilizadoInsert, AtivoImobilizadoUpdate, CategoriaAtivoImobilizado } from "@/types";
import { registrarLog } from "./log.service";

const BUCKET = "contabilidade-anexos";
const SELECT = "*, fornecedores ( id, nome, cnpj ), plano_contas ( id, codigo_estruturado, descricao )";

export interface FiltroAtivosImobilizados {
  categoria?: CategoriaAtivoImobilizado;
  ativo?: boolean;
  busca?: string;
}

export async function getAtivosImobilizados(filtro: FiltroAtivosImobilizados = {}): Promise<AtivoImobilizado[]> {
  let query = supabase.from("ativos_imobilizados").select(SELECT).order("descricao");

  if (filtro.categoria) query = query.eq("categoria", filtro.categoria);
  if (filtro.ativo !== undefined) query = query.eq("ativo", filtro.ativo);
  if (filtro.busca?.trim()) {
    const q = filtro.busca.trim();
    query = query.or(`numero_patrimonio.ilike.%${q}%,descricao.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) { console.error("getAtivosImobilizados:", error); return []; }
  return data as AtivoImobilizado[];
}

export async function getAtivoImobilizadoById(id: number): Promise<AtivoImobilizado | null> {
  const { data, error } = await supabase.from("ativos_imobilizados").select(SELECT).eq("id", id).maybeSingle();
  if (error) { console.error("getAtivoImobilizadoById:", error); return null; }
  return data as AtivoImobilizado | null;
}

export async function criarAtivoImobilizado(input: AtivoImobilizadoInsert): Promise<AtivoImobilizado | null> {
  const { data, error } = await supabase.from("ativos_imobilizados").insert([input as never]).select().single();
  if (error) { console.error("criarAtivoImobilizado:", error); return null; }
  const ativo = data as AtivoImobilizado;
  registrarLog({
    acao: "criou",
    tabela: "ativos_imobilizados",
    registro_id: String(ativo.id),
    descricao: `Criou ativo imobilizado ${ativo.numero_patrimonio} — ${ativo.descricao}`,
    campos_alterados: input as unknown as Record<string, unknown>,
  });
  return ativo;
}

export async function atualizarAtivoImobilizado(id: number, patch: AtivoImobilizadoUpdate): Promise<boolean> {
  const { error } = await supabase
    .from("ativos_imobilizados")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("atualizarAtivoImobilizado:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "ativos_imobilizados",
    registro_id: String(id),
    descricao: `Atualizou ativo imobilizado #${id}`,
    campos_alterados: patch as Record<string, unknown>,
  });
  return true;
}

// Nunca DELETE físico.
export async function inativarAtivoImobilizado(id: number): Promise<boolean> {
  const { error } = await supabase
    .from("ativos_imobilizados")
    .update({ ativo: false, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("inativarAtivoImobilizado:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "ativos_imobilizados", registro_id: String(id), descricao: `Inativou ativo imobilizado #${id}` });
  return true;
}

export async function reativarAtivoImobilizado(id: number): Promise<boolean> {
  const { error } = await supabase
    .from("ativos_imobilizados")
    .update({ ativo: true, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("reativarAtivoImobilizado:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "ativos_imobilizados", registro_id: String(id), descricao: `Reativou ativo imobilizado #${id}` });
  return true;
}

export async function uploadAnexoAtivoImobilizado(
  ativoId: number,
  file: File,
  tipo: "xml" | "pdf" | "manual" | "foto"
): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `ativo-imobilizado/${ativoId}/${tipo}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadAnexoAtivoImobilizado:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
