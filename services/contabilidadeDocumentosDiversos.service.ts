import { supabase } from "@/lib/supabase/client";
import type { DocumentoDiverso, DocumentoDiversoInsert } from "@/types";
import { registrarLog } from "./log.service";
import { getUltimoPlanoContas } from "./lancamentos.service";

const BUCKET = "contabilidade-anexos";
const SELECT = "*, fornecedores ( id, nome, cnpj )";

export interface FiltroDocumentosDiversos {
  competenciaAno?: number;
  competenciaMes?: number;
  categoria?: DocumentoDiverso["categoria"];
}

export async function getDocumentosDiversos(filtro: FiltroDocumentosDiversos = {}): Promise<DocumentoDiverso[]> {
  let query = supabase
    .from("documentos_diversos")
    .select(SELECT)
    .is("deletado_em", null)
    .order("created_at", { ascending: false });

  if (filtro.competenciaAno) query = query.eq("competencia_ano", filtro.competenciaAno);
  if (filtro.competenciaMes) query = query.eq("competencia_mes", filtro.competenciaMes);
  if (filtro.categoria) query = query.eq("categoria", filtro.categoria);

  const { data, error } = await query;
  if (error) { console.error("getDocumentosDiversos:", error); return []; }
  return data as DocumentoDiverso[];
}

/** Cria o documento e, na mesma chamada, o lançamento de Saída vinculado
 *  em Contas a Pagar — mesmo espírito de gerarContaAPagarDaCompra em
 *  services/compras.service.ts, mas sem checagem de idempotência: aqui a
 *  criação acontece uma vez só, nunca é re-chamada pro mesmo documento. */
export async function criarDocumentoDiverso(input: DocumentoDiversoInsert): Promise<DocumentoDiverso | null> {
  const sugestao = input.fornecedor_id
    ? await getUltimoPlanoContas({ fornecedorId: input.fornecedor_id })
    : { planoContasId: null };

  const { data: lancamento, error: errLanc } = await supabase
    .from("lancamentos")
    .insert([{
      tipo: "Saída",
      descricao: input.descricao,
      valor: input.valor,
      status: "Pendente",
      vencimento: input.vencimento,
      documento: null,
      fornecedor_id: input.fornecedor_id,
      plano_contas_id: sugestao.planoContasId,
      pedido_id: null,
      cliente_id: null,
    } as never])
    .select("id")
    .single();
  if (errLanc || !lancamento) { console.error("criarDocumentoDiverso (lancamento):", errLanc); return null; }

  const lancamentoId = (lancamento as { id: number }).id;

  const { data, error } = await supabase
    .from("documentos_diversos")
    .insert([{ ...input, lancamento_id: lancamentoId } as never])
    .select(SELECT)
    .single();
  if (error) { console.error("criarDocumentoDiverso:", error); return null; }

  const doc = data as DocumentoDiverso;
  registrarLog({
    acao: "criou",
    tabela: "documentos_diversos",
    registro_id: String(doc.id),
    descricao: `Criou documento diverso (${doc.categoria}) — R$ ${doc.valor.toFixed(2)}`,
    campos_alterados: input as unknown as Record<string, unknown>,
  });
  return doc;
}

export async function atualizarDocumentoDiverso(
  id: number,
  patch: Partial<DocumentoDiversoInsert> & { pdf_url?: string | null }
): Promise<boolean> {
  const { error } = await supabase
    .from("documentos_diversos")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("atualizarDocumentoDiverso:", error); return false; }
  return true;
}

// Nunca DELETE físico — só marca deletado_em/deletado_por/motivo_exclusao.
export async function softDeleteDocumentoDiverso(
  id: number,
  usuarioEmail: string,
  motivo?: string
): Promise<boolean> {
  const { error } = await supabase
    .from("documentos_diversos")
    .update({
      deletado_em: new Date().toISOString(),
      deletado_por: usuarioEmail,
      motivo_exclusao: motivo ?? null,
    } as never)
    .eq("id", id);
  if (error) { console.error("softDeleteDocumentoDiverso:", error); return false; }
  registrarLog({
    acao: "excluiu",
    tabela: "documentos_diversos",
    registro_id: String(id),
    descricao: `Excluiu documento diverso #${id}${motivo ? ` — ${motivo}` : ""}`,
  });
  return true;
}

export async function uploadAnexoDocumentoDiverso(documentoId: number, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `diversos/${documentoId}/pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadAnexoDocumentoDiverso:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
