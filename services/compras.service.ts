import { supabase } from '@/lib/supabase/client';
import type { Compra, CompraInsert, CompraItemInsert } from '@/types';
import { registrarMovimentacao, reverterMovimentacao } from './estoqueMovimentacoes.service';

export async function getProximoIdCompra(): Promise<string> {
  const { data } = await supabase
    .from('compras')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  let proximoNum = 1;
  if (data && data.length > 0) {
    const n = parseInt((data[0] as { id: string }).id.replace('C-', ''), 10);
    if (!isNaN(n)) proximoNum = n + 1;
  }
  return `C-${String(proximoNum).padStart(3, '0')}`;
}

export async function getCompras(): Promise<Compra[]> {
  const { data, error } = await supabase
    .from('compras')
    .select('*, fornecedores ( id, nome ), compras_itens ( *, produtos ( id, nome, cod, chapas_por_colar ) )')
    .order('created_at', { ascending: false });
  if (error) { console.error('getCompras:', error); return []; }
  return data as Compra[];
}

export async function createCompra(
  compra: Omit<CompraInsert, 'id' | 'status' | 'dt_recebimento'>,
  itens: Omit<CompraItemInsert, 'compra_id'>[]
): Promise<Compra | null> {
  const id = await getProximoIdCompra();
  const { data, error } = await supabase
    .from('compras')
    .insert([{ ...compra, id, status: 'rascunho', dt_recebimento: null } as never])
    .select()
    .single();
  if (error) { console.error('createCompra:', error); return null; }

  if (itens.length > 0) {
    const itensComId = itens.map(i => ({ ...i, compra_id: id }));
    const { error: errItens } = await supabase.from('compras_itens').insert(itensComId as never);
    if (errItens) console.error('createCompra itens:', errItens);
  }

  return data as Compra;
}

export async function deletarCompra(compraId: string): Promise<boolean> {
  const { data: compra } = await supabase.from('compras').select('status').eq('id', compraId).maybeSingle();
  if ((compra as { status: string } | null)?.status === 'recebido') {
    const { data: itens } = await supabase.from('compras_itens').select('id').eq('compra_id', compraId);
    for (const item of (itens ?? []) as Array<{ id: number }>) {
      await reverterMovimentacao('compra', `ci-${item.id}`);
    }
  }
  await supabase.from('compras_itens').delete().eq('compra_id', compraId);
  const { error } = await supabase.from('compras').delete().eq('id', compraId);
  if (error) { console.error('deletarCompra:', error); return false; }
  return true;
}

/** Confirma o recebimento: gera a entrada de cada item no livro-razão de
 *  estoque (idempotente — chamar de novo não duplica) e marca a compra como recebida. */
export async function confirmarRecebimento(compraId: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data: compra } = await supabase.from('compras').select('id, status').eq('id', compraId).maybeSingle();
  if (!compra) return { ok: false, motivo: 'compra não encontrada' };
  if ((compra as { status: string }).status === 'recebido') return { ok: true };

  const { data: itens, error: errItens } = await supabase
    .from('compras_itens')
    .select('id, produto_id, chapas, m2, custo_unitario_m2')
    .eq('compra_id', compraId);
  if (errItens) return { ok: false, motivo: errItens.message };

  for (const item of (itens ?? []) as Array<{ id: number; produto_id: number | null; chapas: number; m2: number; custo_unitario_m2: number }>) {
    if (!item.produto_id) continue;
    const res = await registrarMovimentacao({
      produtoId: item.produto_id,
      tipo: 'entrada_compra', origemTipo: 'compra', origemId: `ci-${item.id}`,
      chapas: item.chapas, m2: item.m2, custoUnitarioM2: item.custo_unitario_m2,
    });
    if (!res.ok && !res.jaExistia) return { ok: false, motivo: `item ${item.id}: ${res.motivo}` };
  }

  const { error } = await supabase
    .from('compras')
    .update({ status: 'recebido', dt_recebimento: new Date().toISOString() } as never)
    .eq('id', compraId);
  if (error) return { ok: false, motivo: error.message };

  return { ok: true };
}
