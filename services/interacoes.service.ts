import { supabase } from '@/lib/supabase/client';
import type { InteracaoCliente, InteracaoClienteInsert } from '@/types';

export async function getInteracoesPorCliente(clienteId: number): Promise<InteracaoCliente[]> {
  const { data, error } = await supabase
    .from('interacoes_cliente')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('data', { ascending: false });
  if (error) { console.error('getInteracoesPorCliente:', error); return []; }
  return data as InteracaoCliente[];
}

export async function createInteracao(input: InteracaoClienteInsert): Promise<InteracaoCliente | null> {
  const { data, error } = await supabase
    .from('interacoes_cliente')
    .insert([input as never])
    .select()
    .single();
  if (error) { console.error('createInteracao:', error); return null; }
  return data as InteracaoCliente;
}

export async function deletarInteracao(id: number): Promise<boolean> {
  const { error } = await supabase.from('interacoes_cliente').delete().eq('id', id);
  if (error) { console.error('deletarInteracao:', error); return false; }
  return true;
}
