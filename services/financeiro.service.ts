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

export async function createLancamento(lancamento: LancamentoInsert) {
  const { data, error } = await supabase
    .from('lancamentos')
    .insert([lancamento as never])
    .select()
    .single();

  if (error) { console.error('createLancamento:', error); return null; }
  return data as Lancamento;
}