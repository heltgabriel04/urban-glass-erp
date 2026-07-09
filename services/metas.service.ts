import { supabase } from '@/lib/supabase/client';
import type { MetaFinanceira, MetaFinanceiraInsert, MetaFinanceiraUpdate } from '@/types';
import { registrarLog } from './log.service';

export async function getMetas(ano?: number): Promise<MetaFinanceira[]> {
  let query = supabase.from('metas_financeiras').select('*').order('ano', { ascending: false }).order('mes');
  if (ano) query = query.eq('ano', ano);
  const { data, error } = await query;
  if (error) { console.error('getMetas:', error); return []; }
  return data as MetaFinanceira[];
}

// Meta de um mês+tipo específico, ou null se não foi definida — usado
// pelo dashboard pra saber se mostra a barra de progresso ou não.
export async function getMeta(ano: number, mes: number, tipo: 'Entrada' | 'Saída'): Promise<MetaFinanceira | null> {
  const { data, error } = await supabase
    .from('metas_financeiras').select('*')
    .eq('ano', ano).eq('mes', mes).eq('tipo', tipo)
    .maybeSingle();
  if (error) { console.error('getMeta:', error); return null; }
  return data as MetaFinanceira | null;
}

// Cria ou substitui a meta daquele ano+mês+tipo (upsert pela unique key).
export async function salvarMeta(meta: MetaFinanceiraInsert): Promise<MetaFinanceira | null> {
  const { data, error } = await supabase
    .from('metas_financeiras')
    .upsert([meta] as never[], { onConflict: 'ano,mes,tipo' })
    .select()
    .single();
  if (error) { console.error('salvarMeta:', error); return null; }
  registrarLog({
    acao: 'criou', tabela: 'metas_financeiras', registro_id: String((data as MetaFinanceira).id),
    descricao: `Definiu meta de ${meta.tipo} para ${meta.mes}/${meta.ano}: R$ ${meta.valor_meta.toFixed(2)}`,
    campos_alterados: { ano: meta.ano, mes: meta.mes, tipo: meta.tipo, valor_meta: meta.valor_meta },
  });
  return data as MetaFinanceira;
}

export async function atualizarMeta(id: number, updates: MetaFinanceiraUpdate): Promise<MetaFinanceira | null> {
  const { data, error } = await supabase.from('metas_financeiras').update(updates as never).eq('id', id).select().single();
  if (error) { console.error('atualizarMeta:', error); return null; }
  registrarLog({
    acao: 'editou', tabela: 'metas_financeiras', registro_id: String(id),
    descricao: `Editou meta #${id}`,
    campos_alterados: updates as Record<string, unknown>,
  });
  return data as MetaFinanceira;
}

export async function deletarMeta(id: number): Promise<boolean> {
  const { error } = await supabase.from('metas_financeiras').delete().eq('id', id);
  if (error) { console.error('deletarMeta:', error); return false; }
  registrarLog({ acao: 'excluiu', tabela: 'metas_financeiras', registro_id: String(id), descricao: `Excluiu meta #${id}` });
  return true;
}
