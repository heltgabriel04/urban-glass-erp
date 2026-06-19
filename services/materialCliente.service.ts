import { supabase } from '@/lib/supabase/client';
import type { MaterialClienteMov, MaterialClienteMovInsert } from '@/types';

/**
 * Registra um movimento de vidro do cliente. 'entrada' e 'saida_producao' são
 * idempotentes por item_pedido_id (índice único parcial no banco) — chamar de
 * novo simplesmente não duplica. 'devolucao' e 'perda' são sempre inseridos.
 */
export async function registrarMovimentoCliente(
  payload: MaterialClienteMovInsert
): Promise<{ ok: boolean; jaExistia?: boolean; motivo?: string }> {
  if (payload.tipo === 'entrada' || payload.tipo === 'saida_producao') {
    if (!payload.item_pedido_id) return { ok: false, motivo: 'item_pedido_id obrigatório para entrada/saida_producao' };
    const { data: existente } = await supabase
      .from('material_cliente_mov')
      .select('id')
      .eq('item_pedido_id', payload.item_pedido_id)
      .eq('tipo', payload.tipo)
      .maybeSingle();
    if (existente) return { ok: true, jaExistia: true };
  }

  const { error } = await supabase.from('material_cliente_mov').insert(payload as never);
  if (error) return { ok: false, motivo: error.message };
  return { ok: true };
}

export async function getMovimentacoesPorPedido(pedidoId: string): Promise<MaterialClienteMov[]> {
  const { data, error } = await supabase
    .from('material_cliente_mov')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('dt_movimento', { ascending: true });
  if (error) { console.error('getMovimentacoesPorPedido (material cliente):', error); return []; }
  return data as MaterialClienteMov[];
}

export async function deletarMovimentacoesPorPedido(pedidoId: string): Promise<void> {
  await supabase.from('material_cliente_mov').delete().eq('pedido_id', pedidoId);
}
