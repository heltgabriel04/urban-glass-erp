import { supabase } from "@/lib/supabase/client";
import type { ConfigFiscalProduto, ConfigFiscalPadrao, Produto } from "@/types";
import { registrarLog } from "./log.service";

// ─── Padrão global ────────────────────────────────────────

export const PADRAO_FALLBACK: ConfigFiscalPadrao = {
  id: 1, regime: "normal",
  aliq_icms_dentro: 18, aliq_icms_fora: 12,
  aliq_pis: 1.65, aliq_cofins: 7.6, aliq_ipi: 0,
  cst_icms_padrao: "00",
  cfop_dentro_padrao: "5102", cfop_fora_padrao: "6102",
  ncm_padrao: "70031200",
  updated_at: "",
};

export async function getConfigPadrao(): Promise<ConfigFiscalPadrao> {
  const { data, error } = await supabase
    .from("config_fiscal_padrao")
    .select("*")
    .eq("id", 1)
    .single();
  if (error || !data) return { ...PADRAO_FALLBACK };
  return data as ConfigFiscalPadrao;
}

export async function salvarConfigPadrao(
  input: Omit<ConfigFiscalPadrao, "id" | "updated_at">
): Promise<boolean> {
  const { error } = await supabase
    .from("config_fiscal_padrao")
    .upsert({ id: 1, ...input, updated_at: new Date().toISOString() } as never, {
      onConflict: "id",
    });
  if (error) { console.error("salvarConfigPadrao:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "config_fiscal_padrao",
    registro_id: "1",
    descricao: "Parâmetros fiscais padrão atualizados",
    campos_alterados: input as Record<string, unknown>,
  });
  return true;
}

// ─── Config por produto ───────────────────────────────────

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

export async function getConfigFiscalProdutos(
  produtoIds: number[]
): Promise<Map<number, ConfigFiscalProduto>> {
  if (produtoIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("config_fiscal_produtos")
    .select("*")
    .in("produto_id", produtoIds);
  if (error) { console.error("getConfigFiscalProdutos:", error); return new Map(); }
  return new Map((data ?? []).map((c) => [c.produto_id, c as ConfigFiscalProduto]));
}

export interface ConfigFiscalProdutoInput {
  produto_id: number;
  ncm: string;
  cfop_dentro: string;
  cfop_fora: string;
  cst_icms: string;
  // alíquotas herdadas do padrão global (sempre salvas junto para compatibilidade com notas.service)
  aliq_icms: number;
  aliq_pis: number;
  aliq_cofins: number;
  aliq_ipi: number;
}

export async function salvarConfigFiscalProduto(input: ConfigFiscalProdutoInput): Promise<boolean> {
  const { error } = await supabase
    .from("config_fiscal_produtos")
    .upsert({ ...input, updated_at: new Date().toISOString() } as never, {
      onConflict: "produto_id",
    });
  if (error) { console.error("salvarConfigFiscalProduto:", error); return false; }
  registrarLog({
    acao: "atualizou",
    tabela: "config_fiscal_produtos",
    registro_id: String(input.produto_id),
    descricao: `Config fiscal do produto #${input.produto_id} atualizada`,
    campos_alterados: input as unknown as Record<string, unknown>,
  });
  return true;
}

export async function removerConfigFiscalProduto(produto_id: number): Promise<boolean> {
  const { error } = await supabase
    .from("config_fiscal_produtos")
    .delete()
    .eq("produto_id", produto_id);
  if (error) { console.error("removerConfigFiscalProduto:", error); return false; }
  return true;
}

// Salva config para todos os produtos de uma vez usando o padrão global
export async function aplicarPadraoATodos(
  produtos: Produto[],
  padrao: ConfigFiscalPadrao
): Promise<{ ok: number; erro: number }> {
  let ok = 0, erro = 0;
  for (const p of produtos) {
    const sucesso = await salvarConfigFiscalProduto({
      produto_id: p.id,
      ncm: padrao.ncm_padrao,
      cfop_dentro: padrao.cfop_dentro_padrao,
      cfop_fora: padrao.cfop_fora_padrao,
      cst_icms: padrao.cst_icms_padrao,
      aliq_icms: padrao.aliq_icms_dentro,
      aliq_pis: padrao.aliq_pis,
      aliq_cofins: padrao.aliq_cofins,
      aliq_ipi: padrao.aliq_ipi,
    });
    sucesso ? ok++ : erro++;
  }
  return { ok, erro };
}
