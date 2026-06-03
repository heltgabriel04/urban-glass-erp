// services/financeiro.service.ts
import { supabase } from '@/lib/supabase/client';
import type { FinanceiroCliente, FaturamentoMensal, Lancamento, LancamentoInsert } from '@/types';

export async function getFinanceiroClientes() {
  const { data, error } = await supabase
    .from('financeiro_clientes')
    .select('*')
    .order('faturado', { ascending: false });

  if (error) { console.error('getFinanceiroClientes:', error); return []; }
  return data as FinanceiroCliente[];
}

export async function getFaturamentoMensal(ano?: number) {
  let query = supabase
    .from('faturamento_mensal')
    .select('*')
    .order('mes');

  if (ano) query = query.eq('ano', ano);

  const { data, error } = await query;
  if (error) { console.error('getFaturamentoMensal:', error); return []; }
  return data as FaturamentoMensal[];
}

export async function getLancamentos() {
  const { data, error } = await supabase
    .from('lancamentos')
    .select(`*, clientes ( id, nome )`)
    .order('vencimento', { ascending: true });

  if (error) { console.error('getLancamentos:', error); return []; }
  return data as Lancamento[];
}

export async function getLancamentosPorPedido(pedidoId: string) {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: true });

  if (error) { console.error('getLancamentosPorPedido:', error); return []; }
  return data as Lancamento[];
}

export async function deletarLancamento(id: number) {
  const { error } = await supabase.from('lancamentos').delete().eq('id', id);
  if (error) { console.error('deletarLancamento:', error); return false; }
  return true;
}

export async function createLancamento(lancamento: LancamentoInsert) {
  const { data, error } = await supabase
    .from('lancamentos')
    .insert([lancamento as never])
    .select()
    .single();

  if (error) { console.error('createLancamento:', error); return null; }
  return data as Lancamento;
}

// ─── Cria lançamentos parcelados ao salvar pedido ───────────
export async function criarLancamentosParcelados({
  pedidoId,
  clienteId,
  parcelas,
}: {
  pedidoId: string;
  clienteId: number;
  parcelas: { data: string; valor: number }[];
}) {
  // Remove lançamentos anteriores do mesmo pedido (evita duplicatas em re-save)
  await supabase.from('lancamentos').delete().eq('pedido_id', pedidoId);

  const total = parcelas.length;

  const inserts: LancamentoInsert[] = parcelas
    .filter(p => p.data && p.valor > 0)
    .map((p, i) => ({
      tipo: 'Entrada' as const,
      descricao: total === 1
        ? `Recebimento · ${pedidoId}`
        : `Parcela ${i + 1}/${total} · ${pedidoId}`,
      valor: p.valor,
      status: 'A Receber' as const,
      vencimento: p.data,
      pedido_id: pedidoId,
      cliente_id: clienteId,
    }));

  if (inserts.length === 0) return true;

  const { error } = await supabase.from('lancamentos').insert(inserts as never[]);
  if (error) { console.error('criarLancamentosParcelados:', error); return false; }
  return true;
}