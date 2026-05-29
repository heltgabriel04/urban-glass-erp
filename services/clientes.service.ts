import { supabase } from '@/lib/supabase/client';
import type { Cliente, ClienteInsert, ClienteUpdate } from '@/types';

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
  return data as Cliente;
}

export async function toggleAtivoCliente(id: number, ativo: boolean) {
  return updateCliente(id, { ativo });
}

export async function deletarCliente(id: number): Promise<boolean> {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) { console.error('deletarCliente:', error); return false; }
  return true;
}