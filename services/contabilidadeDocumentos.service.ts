import { supabase } from "@/lib/supabase/client";
import type { DocumentoFiscal, DocumentoFiscalInsert } from "@/types";
import { registrarLog } from "./log.service";

const BUCKET = "contabilidade-anexos";

export interface FiltroDocumentosFiscais {
  tipo?: DocumentoFiscal["tipo"];
  entrada?: boolean;
  competenciaAno?: number;
  competenciaMes?: number;
  fornecedorId?: number;
}

export async function getDocumentosFiscais(filtro: FiltroDocumentosFiscais = {}): Promise<DocumentoFiscal[]> {
  let query = supabase
    .from("documentos_fiscais")
    .select("*, fornecedores ( id, nome, cnpj )")
    .is("deletado_em", null)
    .order("created_at", { ascending: false });

  if (filtro.tipo) query = query.eq("tipo", filtro.tipo);
  if (filtro.entrada !== undefined) query = query.eq("entrada", filtro.entrada);
  if (filtro.competenciaAno) query = query.eq("competencia_ano", filtro.competenciaAno);
  if (filtro.competenciaMes) query = query.eq("competencia_mes", filtro.competenciaMes);
  if (filtro.fornecedorId) query = query.eq("fornecedor_id", filtro.fornecedorId);

  const { data, error } = await query;
  if (error) { console.error("getDocumentosFiscais:", error); return []; }
  return data as DocumentoFiscal[];
}

export async function getDocumentoFiscalById(id: number): Promise<DocumentoFiscal | null> {
  const { data, error } = await supabase
    .from("documentos_fiscais")
    .select("*, fornecedores ( id, nome, cnpj )")
    .eq("id", id)
    .maybeSingle();
  if (error) { console.error("getDocumentoFiscalById:", error); return null; }
  return data as DocumentoFiscal | null;
}

export async function getDocumentoFiscalPorChaveAcesso(chaveAcesso: string): Promise<DocumentoFiscal | null> {
  const { data, error } = await supabase
    .from("documentos_fiscais")
    .select("*, fornecedores ( id, nome, cnpj )")
    .eq("chave_acesso", chaveAcesso)
    .is("deletado_em", null)
    .maybeSingle();
  if (error) { console.error("getDocumentoFiscalPorChaveAcesso:", error); return null; }
  return data as DocumentoFiscal | null;
}

export async function criarDocumentoFiscal(input: DocumentoFiscalInsert): Promise<DocumentoFiscal | null> {
  const { data, error } = await supabase
    .from("documentos_fiscais")
    .insert([input as never])
    .select()
    .single();
  if (error) { console.error("criarDocumentoFiscal:", error); return null; }
  const doc = data as DocumentoFiscal;
  registrarLog({
    acao: "criou",
    tabela: "documentos_fiscais",
    registro_id: String(doc.id),
    descricao: `Criou documento fiscal (${doc.tipo}) — competência ${doc.competencia_mes}/${doc.competencia_ano}`,
    campos_alterados: input as unknown as Record<string, unknown>,
  });
  return doc;
}

export async function atualizarDocumentoFiscal(
  id: number,
  patch: Partial<DocumentoFiscalInsert>
): Promise<boolean> {
  const { error } = await supabase
    .from("documentos_fiscais")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("atualizarDocumentoFiscal:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "documentos_fiscais",
    registro_id: String(id),
    descricao: `Atualizou documento fiscal #${id}`,
    campos_alterados: patch as Record<string, unknown>,
  });
  return true;
}

// Nunca DELETE físico — só marca deletado_em/deletado_por/motivo_exclusao.
export async function softDeleteDocumentoFiscal(
  id: number,
  usuarioEmail: string,
  motivo?: string
): Promise<boolean> {
  const { error } = await supabase
    .from("documentos_fiscais")
    .update({
      deletado_em: new Date().toISOString(),
      deletado_por: usuarioEmail,
      motivo_exclusao: motivo ?? null,
    } as never)
    .eq("id", id);
  if (error) { console.error("softDeleteDocumentoFiscal:", error); return false; }
  registrarLog({
    acao: "excluiu",
    tabela: "documentos_fiscais",
    registro_id: String(id),
    descricao: `Excluiu documento fiscal #${id}${motivo ? ` — ${motivo}` : ""}`,
  });
  return true;
}

export async function uploadAnexoDocumentoFiscal(
  documentoId: number,
  file: File,
  tipo: "xml" | "pdf" | "foto"
): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? (tipo === "xml" ? "xml" : "pdf");
  const path = `documentos/${documentoId}/${tipo}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadAnexoDocumentoFiscal:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
