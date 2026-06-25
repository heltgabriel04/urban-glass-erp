import { supabase } from '@/lib/supabase/client';

export interface EstoqueItem {
  id: number;
  produto_id: number | null;
  cod: string;
  chapas_entrada: number;
  m2_entrada: number;
  m2_consumido: number;
  m2_saldo: number;
  chapas_saldo: number;
  m2_por_chapa: number;
  custo_m2: number;
  updated_at: string;
  produtos?: { nome: string; id: number };
}

export interface RetalhoItem {
  id?: string;
  produto_id?: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  espessura?: number | null;
  m2: number;
  chapa_origem: string;
  pedido_origem: string;
  localizacao?: string | null;
  box?: string | null;
  dt_gerado: string;
  status: string;
  created_at?: string;
}

// ── Estoque ───────────────────────────────────────────────────────────────────

export async function getEstoque(): Promise<EstoqueItem[]> {
  const { data, error } = await supabase
    .from('estoque')
    .select('*, produtos(id, nome)')
    .order('id');
  if (error) { console.error('getEstoque:', error); return []; }
  return data as EstoqueItem[];
}

export async function getEstoqueByProdutoNome(produtoNome: string): Promise<EstoqueItem | null> {
  const { data, error } = await supabase
    .from('estoque')
    .select('*, produtos!inner(id, nome)')
    .eq('produtos.nome', produtoNome)
    .limit(1)
    .maybeSingle();
  if (error) { console.error('getEstoqueByProdutoNome:', error); return null; }
  return data as EstoqueItem | null;
}

export async function baixarChapasEstoque(
  produtoNome: string,
  chapasUsadas: number,
  m2Consumido: number,
  produtoId?: number
): Promise<boolean> {
  // Prefere a busca por produto_id (FK — robusta a renome/duplicidade de nome).
  // Cai para a busca por nome quando o id não é conhecido (ex.: sincronização
  // a partir do histórico de otimizações, que só guarda o nome do produto).
  const { data: estoqueItems, error: errBusca } = produtoId != null
    ? await supabase
        .from('estoque')
        .select('id, chapas_saldo, m2_saldo, m2_consumido')
        .eq('produto_id', produtoId)
        .limit(1)
    : await supabase
        .from('estoque')
        .select('id, chapas_saldo, m2_saldo, m2_consumido, produtos!inner(nome)')
        .eq('produtos.nome', produtoNome)
        .limit(1);

  if (errBusca || !estoqueItems || estoqueItems.length === 0) {
    console.warn('baixarChapasEstoque: produto não encontrado no estoque:', produtoNome, produtoId ?? '');
    return false;
  }

  const item = estoqueItems[0] as { id: number; chapas_saldo: number; m2_saldo: number; m2_consumido: number };
  const novoSaldoChapas = Math.max(0, Number(item.chapas_saldo) - chapasUsadas);
  const novoSaldoM2     = Math.max(0, parseFloat((Number(item.m2_saldo) - m2Consumido).toFixed(4)));
  const novoConsumido   = parseFloat((Number(item.m2_consumido) + m2Consumido).toFixed(4));

  const { error } = await supabase
    .from('estoque')
    .update({
      chapas_saldo:  novoSaldoChapas,
      m2_saldo:      novoSaldoM2,
      m2_consumido:  novoConsumido,
      updated_at:    new Date().toISOString(),
    } as never)
    .eq('id', item.id);

  if (error) { console.error('baixarChapasEstoque:', error); return false; }
  return true;
}

export async function reverterBaixaEstoque(
  produtoNome: string,
  chapasDevolvidas: number,
  m2Devolvido: number
): Promise<boolean> {
  const { data: estoqueItems, error: errBusca } = await supabase
    .from('estoque')
    .select('id, chapas_saldo, m2_saldo, m2_consumido, produtos!inner(nome)')
    .eq('produtos.nome', produtoNome)
    .limit(1);

  if (errBusca || !estoqueItems || estoqueItems.length === 0) return false;

  const item = estoqueItems[0];
  const { error } = await supabase
    .from('estoque')
    .update({
      chapas_saldo: Number(item.chapas_saldo) + chapasDevolvidas,
      m2_saldo:     parseFloat((Number(item.m2_saldo) + m2Devolvido).toFixed(4)),
      m2_consumido: parseFloat(Math.max(0, Number(item.m2_consumido) - m2Devolvido).toFixed(4)),
      updated_at:   new Date().toISOString(),
    } as never)
    .eq('id', item.id);

  if (error) { console.error('reverterBaixaEstoque:', error); return false; }
  return true;
}

// ── Retalhos ──────────────────────────────────────────────────────────────────

export async function getRetalhos(): Promise<RetalhoItem[]> {
  const { data, error } = await supabase
    .from('retalhos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('getRetalhos:', error); return []; }
  return data as RetalhoItem[];
}

export async function salvarRetalhos(retalhos: Omit<RetalhoItem, 'id' | 'created_at'>[]): Promise<boolean> {
  if (retalhos.length === 0) return true;
  const rows = retalhos.map(r => ({ ...r, id: crypto.randomUUID() }));
  const { error } = await supabase.from('retalhos').insert(rows as never[]);
  if (error) { console.error('salvarRetalhos:', error); return false; }
  return true;
}

export async function deletarRetalho(id: number): Promise<boolean> {
  const { error } = await supabase.from('retalhos').delete().eq('id', id);
  if (error) { console.error('deletarRetalho:', error); return false; }
  return true;
}

export async function atualizarStatusRetalho(id: number, status: string): Promise<boolean> {
  const { error } = await supabase.from('retalhos').update({ status } as never).eq('id', id);
  if (error) { console.error('atualizarStatusRetalho:', error); return false; }
  return true;
}