import { supabase } from '@/lib/supabase/client';
import type { Pedido, PedidoInsert, PedidoUpdate, ItemPedidoInsert, StatusPedido } from '@/types';

export async function getPedidos(filtroStatus?: StatusPedido) {
  let query = supabase
    .from('pedidos')
    .select(`*, clientes ( id, nome, cidade, tel )`)
    .order('created_at', { ascending: false });

  if (filtroStatus) query = query.eq('status', filtroStatus);

  const { data, error } = await query;
  if (error) { console.error('getPedidos:', error); return []; }
  return data as Pedido[];
}

export async function getPedidoById(id: string) {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`*, clientes ( * ), itens_pedido ( * )`)
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

const FLUXO: StatusPedido[] = [
  'Aguardando otimização',
  'Em Produção – Corte',
  'Em Produção – Lapidação',
  'Separação',
  'Finalizado',
  'Entregue',
];

export async function avancarStatusPedido(id: string, statusAtual: StatusPedido) {
  const idx = FLUXO.indexOf(statusAtual);
  if (idx === -1 || idx === FLUXO.length - 1) return null;
  return updatePedido(id, { status: FLUXO[idx + 1] });
}

export async function retrocederStatusPedido(id: string, statusAtual: StatusPedido) {
  const idx = FLUXO.indexOf(statusAtual);
  if (idx <= 0) return null;
  return updatePedido(id, { status: FLUXO[idx - 1] });
}

export async function deletarPedido(pedidoId: string): Promise<boolean> {
  await supabase.from('lancamentos').delete().eq('pedido_id', pedidoId);
  await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoId);
  await supabase.from('orcamentos').update({ pedido_id: null } as never).eq('pedido_id', pedidoId);
  const { error } = await supabase.from('pedidos').delete().eq('id', pedidoId);
  if (error) { console.error('deletarPedido:', error); return false; }
  return true;
}

export async function registrarRecebimento(pedidoId: string, valor: number) {
  const pedido = await getPedidoById(pedidoId);
  if (!pedido) return null;

  const novoRecebido = Number(pedido.valor_recebido) + valor;
  const pedidoAtualizado = await updatePedido(pedidoId, { valor_recebido: novoRecebido });
  if (!pedidoAtualizado) return null;

  const hoje = new Date().toISOString().split('T')[0];
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
  const { data } = await supabase
    .from('pedidos')
    .select('id')
    .order('id', { ascending: false });

  let proximoNum = 1;
  if (data && data.length > 0) {
    const nums = data
      .map((p: any) => parseInt(p.id.replace('P-', ''), 10))
      .filter((n: number) => !isNaN(n));
    if (nums.length > 0) proximoNum = Math.max(...nums) + 1;
  }
  return `P-${String(proximoNum).padStart(3, '0')}`;
}