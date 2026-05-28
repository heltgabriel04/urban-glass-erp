// services/pedidos.service.ts
import { supabase } from '@/lib/supabase/client';
import type { Pedido, PedidoInsert, PedidoUpdate, ItemPedidoInsert, StatusPedido } from '@/types';

export async function getPedidos(filtroStatus?: StatusPedido) {
  let query = supabase
    .from('pedidos')
    .select(`
      *,
      clientes ( id, nome, cidade, tel )
    `)
    .order('created_at', { ascending: false });

  if (filtroStatus) {
    query = query.eq('status', filtroStatus);
  }

  const { data, error } = await query;
  if (error) { console.error('getPedidos:', error); return []; }
  return data as Pedido[];
}

export async function getPedidoById(id: string) {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      clientes ( * ),
      itens_pedido ( * )
    `)
    .eq('id', id)
    .single();

  if (error) { console.error('getPedidoById:', error); return null; }
  return data as Pedido;
}

export async function createPedido(pedido: PedidoInsert, itens: ItemPedidoInsert[] = []) {
  const { data, error } = await supabase
    .from('pedidos')
    .insert([pedido as never])
    .select()
    .single();

  if (error) { console.error('createPedido:', error); return null; }

  if (itens.length > 0) {
    const itensComId = itens.map(i => ({ ...i, pedido_id: (data as Pedido).id }));
    const { error: errItens } = await supabase.from('itens_pedido').insert(itensComId as never);
    if (errItens) console.error('createPedido itens:', errItens);
  }

  return data as Pedido;
}

export async function updatePedido(id: string, updates: PedidoUpdate) {
  const { data, error } = await supabase
    .from('pedidos')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('updatePedido:', error); return null; }
  return data as Pedido;
}

export async function avancarStatusPedido(id: string, statusAtual: StatusPedido) {
  const FLUXO: StatusPedido[] = [
    'Aguardando otimização',
    'Em Produção – Corte',
    'Em Produção – Lapidação',
    'Separação',
    'Saiu para entrega',
    'Entregue',
    'Finalizado',
  ];
  const idx = FLUXO.indexOf(statusAtual);
  if (idx === -1 || idx === FLUXO.length - 1) return null;
  return updatePedido(id, { status: FLUXO[idx + 1] });
}

export async function registrarRecebimento(pedidoId: string, valor: number) {
  // 1. busca pedido para ter cliente_id e valor atual
  const pedido = await getPedidoById(pedidoId);
  if (!pedido) return null;

  // 2. atualiza valor_recebido no pedido
  const novoRecebido = Number(pedido.valor_recebido) + valor;
  const pedidoAtualizado = await updatePedido(pedidoId, { valor_recebido: novoRecebido });
  if (!pedidoAtualizado) return null;

  // 3. cria lançamento em lancamentos para o Fluxo de Caixa refletir
  const hoje = new Date().toISOString().split('T')[0]; // date → YYYY-MM-DD
  const { error: errLanc } = await supabase.from('lancamentos').insert({
    tipo: 'Entrada',
    descricao: `Recebimento pedido ${pedidoId}`,
    valor,
    status: 'Pago',
    vencimento: hoje,
    pedido_id: pedidoId,
    cliente_id: pedido.clientes?.id ?? pedido.cliente_id ?? null,
  } as never);

  if (errLanc) console.error('registrarRecebimento — lancamento:', errLanc);

  return pedidoAtualizado;
}

export async function getProximoIdPedido(): Promise<string> {
  const { count } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true });
  return `P-${String((count || 0) + 1).padStart(3, '0')}`;
}