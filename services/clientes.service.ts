import { supabase } from '@/lib/supabase/client';
import type { Cliente, ClienteInsert, ClienteUpdate } from '@/types';
import { registrarLog } from './log.service';

export async function getClientes(apenasAtivos = false) {
  let query = supabase
    .from('clientes')
    .select('*')
    .order('nome');

  if (apenasAtivos) query = query.eq('ativo', true);

  const { data, error } = await query;
  if (error) { console.error('getClientes:', error); return []; }
  return data as Cliente[];
}

export async function getClienteById(id: number) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) { console.error('getClienteById:', error); return null; }
  return data as Cliente;
}

export async function createCliente(cliente: ClienteInsert) {
  const { data, error } = await supabase
    .from('clientes')
    .insert([cliente as never])
    .select()
    .single();

  if (error) { console.error('createCliente:', error); return null; }
  registrarLog({
    acao: "criou", tabela: "clientes", registro_id: String((data as Cliente).id),
    descricao: `Criou cliente ${(data as Cliente).nome}`,
    campos_alterados: { nome: (data as Cliente).nome, tipo_pessoa: (data as Cliente).tipo_pessoa },
  });
  return data as Cliente;
}

export async function updateCliente(id: number, updates: ClienteUpdate) {
  const { data, error } = await supabase
    .from('clientes')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('updateCliente:', error); return null; }
  registrarLog({
    acao: "editou", tabela: "clientes", registro_id: String(id),
    descricao: `Editou cliente ${(data as Cliente).nome}`,
    campos_alterados: updates as Record<string, unknown>,
  });
  return data as Cliente;
}

export async function toggleAtivoCliente(id: number, ativo: boolean) {
  return updateCliente(id, { ativo });
}

export async function deletarCliente(id: number): Promise<boolean> {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) { console.error('deletarCliente:', error); return false; }
  registrarLog({ acao: "excluiu", tabela: "clientes", registro_id: String(id), descricao: `Excluiu cliente #${id}` });
  return true;
}