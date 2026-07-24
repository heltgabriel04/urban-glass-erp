import { supabase } from '@/lib/supabase/client';
import { registrarLog } from './log.service';
import type { PedidoObservacao } from '@/types';

export async function getObservacoesPorPedido(pedidoId: string): Promise<PedidoObservacao[]> {
  const { data, error } = await supabase
    .from('pedido_observacoes')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });

  if (error) { console.error('getObservacoesPorPedido:', error); return []; }
  return data as PedidoObservacao[];
}

export async function createObservacao(pedidoId: string, texto: string): Promise<PedidoObservacao | null> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('pedido_observacoes')
    .insert([{ pedido_id: pedidoId, texto, usuario_email: user?.email ?? null } as never])
    .select()
    .single();

  if (error) { console.error('createObservacao:', error); return null; }

  registrarLog({
    acao: "criou", tabela: "pedido_observacoes", registro_id: (data as PedidoObservacao).id,
    descricao: `Adicionou observação ao pedido ${pedidoId}`,
  });

  return data as PedidoObservacao;
}

export async function deletarObservacao(id: string, pedidoId: string): Promise<boolean> {
  const { error } = await supabase.from('pedido_observacoes').delete().eq('id', id);
  if (error) { console.error('deletarObservacao:', error); return false; }

  registrarLog({
    acao: "excluiu", tabela: "pedido_observacoes", registro_id: id,
    descricao: `Excluiu observação do pedido ${pedidoId}`,
  });
  return true;
}

export async function updateObservacao(id: string, pedidoId: string, texto: string): Promise<boolean> {
  const { data, error } = await supabase.from('pedido_observacoes').update({ texto } as never).eq('id', id).select();
  if (error) { console.error('updateObservacao:', error); return false; }
  if (!data || data.length === 0) { console.error('updateObservacao: nenhuma linha atualizada (RLS ou id inexistente)'); return false; }

  registrarLog({
    acao: "editou", tabela: "pedido_observacoes", registro_id: id,
    descricao: `Editou observação do pedido ${pedidoId}`,
  });
  return true;
}
