import { supabase } from '@/lib/supabase/client';
import type { Fornecedor, FornecedorInsert, FornecedorUpdate } from '@/types';
import { registrarLog } from './log.service';

export async function getFornecedores(apenasAtivos = false) {
  let query = supabase.from('fornecedores').select('*').order('nome');
  if (apenasAtivos) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) { console.error('getFornecedores:', error); return []; }
  return data as Fornecedor[];
}

export async function createFornecedor(fornecedor: FornecedorInsert) {
  const { data, error } = await supabase
    .from('fornecedores')
    .insert([fornecedor as never])
    .select()
    .single();
  if (error) { console.error('createFornecedor:', error); return null; }
  registrarLog({
    acao: 'criou', tabela: 'fornecedores', registro_id: String((data as Fornecedor).id),
    descricao: `Criou fornecedor ${(data as Fornecedor).nome}`,
    campos_alterados: { nome: (data as Fornecedor).nome, categoria: (data as Fornecedor).categoria },
  });
  return data as Fornecedor;
}

export async function updateFornecedor(id: number, updates: FornecedorUpdate) {
  const { data, error } = await supabase
    .from('fornecedores')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateFornecedor:', error); return null; }
  registrarLog({
    acao: 'editou', tabela: 'fornecedores', registro_id: String(id),
    descricao: `Editou fornecedor ${(data as Fornecedor).nome}`,
    campos_alterados: updates as Record<string, unknown>,
  });
  return data as Fornecedor;
}

export async function deletarFornecedor(id: number): Promise<boolean> {
  const { error } = await supabase.from('fornecedores').delete().eq('id', id);
  if (error) { console.error('deletarFornecedor:', error); return false; }
  registrarLog({ acao: 'excluiu', tabela: 'fornecedores', registro_id: String(id), descricao: `Excluiu fornecedor #${id}` });
  return true;
}
