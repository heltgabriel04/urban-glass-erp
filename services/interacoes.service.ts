import { supabase } from '@/lib/supabase/client';
import type { InteracaoCliente, InteracaoClienteInsert } from '@/types';
import type { InteracaoComCliente } from '@/lib/crmAnalytics';

// Todas as interações de todos os clientes, com o nome do cliente já embutido
// — usada pelos relatórios analíticos de CRM (app/relatorios/page.tsx), não
// pela página individual do cliente (que usa getInteracoesPorCliente acima).
export async function getTodasInteracoes(): Promise<InteracaoComCliente[]> {
  const { data, error } = await supabase
    .from('interacoes_cliente')
    .select('id, cliente_id, tipo, data, proximo_contato, clientes(nome)')
    .order('data', { ascending: false });
  if (error) { console.error('getTodasInteracoes:', error); return []; }
  return (data as unknown as Array<InteracaoCliente & { clientes: { nome: string } | null }>).map(i => ({
    id: i.id,
    cliente_id: i.cliente_id,
    clienteNome: i.clientes?.nome ?? '—',
    tipo: i.tipo,
    data: i.data,
    proximo_contato: i.proximo_contato,
  }));
}

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
