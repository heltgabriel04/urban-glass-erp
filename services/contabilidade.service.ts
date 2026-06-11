import { supabase } from "@/lib/supabase/client";
import type { ConfigFiscalProduto, Produto } from "@/types";
import { registrarLog } from "./log.service";

export interface ProdutoComConfig {
  produto: Produto;
  config: ConfigFiscalProduto | null;
}

export async function getProdutosComConfigFiscal(): Promise<ProdutoComConfig[]> {
  const [{ data: prods }, { data: configs }] = await Promise.all([
    supabase.from("produtos").select("*").order("cod"),
    supabase.from("config_fiscal_produtos").select("*"),
  ]);
  const map = new Map((configs ?? []).map((c) => [c.produto_id, c as ConfigFiscalProduto]));
  return (prods ?? []).map((p) => ({ produto: p as Produto, config: map.get(p.id) ?? null }));
}

export type ConfigFiscalInput = Omit<ConfigFiscalProduto, "updated_at">;

export async function salvarConfigFiscal(input: ConfigFiscalInput): Promise<boolean> {
  const { error } = await supabase
    .from("config_fiscal_produtos")
    .upsert({ ...input, updated_at: new Date().toISOString() } as never, {
      onConflict: "produto_id",
    });
  if (error) { console.error("salvarConfigFiscal:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "config_fiscal_produtos",
    registro_id: String(input.produto_id),
    descricao: `Configuração fiscal do produto #${input.produto_id} atualizada`,
    campos_alterados: input as Record<string, unknown>,
  });
  return true;
}

export async function removerConfigFiscal(produto_id: number): Promise<boolean> {
  const { error } = await supabase
    .from("config_fiscal_produtos")
    .delete()
    .eq("produto_id", produto_id);
  if (error) { console.error("removerConfigFiscal:", error); return false; }
  return true;
}
