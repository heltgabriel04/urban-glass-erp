import { supabase } from "@/lib/supabase/client";
import type { GrupoItemEstoqueGeral, ItemEstoqueGeral, ItemEstoqueGeralInsert, ItemEstoqueGeralUpdate } from "@/types";
import { registrarLog } from "./log.service";

export interface FiltroItensEstoqueGerais {
  grupo?: GrupoItemEstoqueGeral;
  ativo?: boolean;
  busca?: string;
}

export async function getItensEstoqueGerais(filtro: FiltroItensEstoqueGerais = {}): Promise<ItemEstoqueGeral[]> {
  let query = supabase
    .from("itens_estoque_gerais")
    .select("*, fornecedores ( id, nome, cnpj )")
    .order("descricao");

  if (filtro.grupo) query = query.eq("grupo", filtro.grupo);
  if (filtro.ativo !== undefined) query = query.eq("ativo", filtro.ativo);
  if (filtro.busca?.trim()) {
    const q = filtro.busca.trim();
    query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) { console.error("getItensEstoqueGerais:", error); return []; }
  return data as ItemEstoqueGeral[];
}

export async function getItemEstoqueGeralById(id: number): Promise<ItemEstoqueGeral | null> {
  const { data, error } = await supabase
    .from("itens_estoque_gerais")
    .select("*, fornecedores ( id, nome, cnpj )")
    .eq("id", id)
    .maybeSingle();
  if (error) { console.error("getItemEstoqueGeralById:", error); return null; }
  return data as ItemEstoqueGeral | null;
}

export async function criarItemEstoqueGeral(input: ItemEstoqueGeralInsert): Promise<ItemEstoqueGeral | null> {
  const { data, error } = await supabase
    .from("itens_estoque_gerais")
    .insert([input as never])
    .select()
    .single();
  if (error) { console.error("criarItemEstoqueGeral:", error); return null; }
  const item = data as ItemEstoqueGeral;
  registrarLog({
    acao: "criou",
    tabela: "itens_estoque_gerais",
    registro_id: String(item.id),
    descricao: `Criou item de estoque geral ${item.codigo} — ${item.descricao}`,
    campos_alterados: input as unknown as Record<string, unknown>,
  });
  return item;
}

export async function atualizarItemEstoqueGeral(id: number, patch: ItemEstoqueGeralUpdate): Promise<boolean> {
  const { error } = await supabase
    .from("itens_estoque_gerais")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("atualizarItemEstoqueGeral:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "itens_estoque_gerais",
    registro_id: String(id),
    descricao: `Atualizou item de estoque geral #${id}`,
    campos_alterados: patch as Record<string, unknown>,
  });
  return true;
}

// Nunca DELETE físico — o cadastro pode ter FK de movimentações apontando pra ele.
export async function inativarItemEstoqueGeral(id: number): Promise<boolean> {
  const { error } = await supabase
    .from("itens_estoque_gerais")
    .update({ ativo: false, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("inativarItemEstoqueGeral:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "itens_estoque_gerais",
    registro_id: String(id),
    descricao: `Inativou item de estoque geral #${id}`,
  });
  return true;
}

export async function reativarItemEstoqueGeral(id: number): Promise<boolean> {
  const { error } = await supabase
    .from("itens_estoque_gerais")
    .update({ ativo: true, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("reativarItemEstoqueGeral:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "itens_estoque_gerais",
    registro_id: String(id),
    descricao: `Reativou item de estoque geral #${id}`,
  });
  return true;
}
