import { supabase } from '@/lib/supabase/client';
import type { ContaBancaria, ContaBancariaInsert, ContaBancariaUpdate } from '@/types';
import { registrarLog } from './log.service';

export async function getContasBancarias(apenasAtivas = false) {
  let query = supabase.from('contas_bancarias').select('*').order('nome');
  if (apenasAtivas) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) { console.error('getContasBancarias:', error); return []; }
  return data as ContaBancaria[];
}

export async function createContaBancaria(conta: ContaBancariaInsert) {
  const { data, error } = await supabase
    .from('contas_bancarias')
    .insert([conta as never])
    .select()
    .single();
  if (error) { console.error('createContaBancaria:', error); return null; }
  registrarLog({
    acao: 'criou', tabela: 'contas_bancarias', registro_id: String((data as ContaBancaria).id),
    descricao: `Criou conta bancária ${(data as ContaBancaria).nome}`,
    campos_alterados: { nome: (data as ContaBancaria).nome, tipo: (data as ContaBancaria).tipo },
  });
  return data as ContaBancaria;
}

export async function updateContaBancaria(id: number, updates: ContaBancariaUpdate) {
  const { data, error } = await supabase
    .from('contas_bancarias')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateContaBancaria:', error); return null; }
  registrarLog({
    acao: 'editou', tabela: 'contas_bancarias', registro_id: String(id),
    descricao: `Editou conta bancária ${(data as ContaBancaria).nome}`,
    campos_alterados: updates as Record<string, unknown>,
  });
  return data as ContaBancaria;
}

export async function deletarContaBancaria(id: number): Promise<boolean> {
  const { error } = await supabase.from('contas_bancarias').delete().eq('id', id);
  if (error) { console.error('deletarContaBancaria:', error); return false; }
  registrarLog({ acao: 'excluiu', tabela: 'contas_bancarias', registro_id: String(id), descricao: `Excluiu conta bancária #${id}` });
  return true;
}
