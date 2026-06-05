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

export async function recalcularRecebido(pedidoId: string) {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('valor')
    .eq('pedido_id', pedidoId)
    .eq('tipo', 'Entrada')
    .eq('status', 'Pago');  // <-- só pagos

  if (error) { console.error('recalcularRecebido:', error); return null; }

  const total = (data ?? []).reduce((a, l) => a + Number(l.valor), 0);
  return updatePedido(pedidoId, { valor_recebido: total });
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

export async function getCreditoCliente(clienteId: number): Promise<number> {
  const { data, error } = await supabase
    .from('clientes')
    .select('credito')
    .eq('id', clienteId)
    .single();
  if (error) return 0;
  return Number((data as any).credito ?? 0);
}

export async function atualizarCreditoCliente(clienteId: number, novoCredito: number): Promise<boolean> {
  const { error } = await supabase
    .from('clientes')
    .update({ credito: Math.max(0, novoCredito) } as never)
    .eq('id', clienteId);
  if (error) { console.error('atualizarCreditoCliente:', error); return false; }
  return true;
}

export async function registrarRecebimento(
  pedidoId: string,
  valor: number,
  data?: string
) {
  const pedido = await getPedidoById(pedidoId);
  if (!pedido) return null;

  const aberto    = Number(pedido.valor_total) - Number(pedido.valor_recebido);
  const aplicado  = Math.min(valor, aberto);
  const excedente = Math.max(0, valor - aberto);

  const novoRecebido     = Number(pedido.valor_recebido) + aplicado;
  const pedidoAtualizado = await updatePedido(pedidoId, { valor_recebido: novoRecebido });
  if (!pedidoAtualizado) return null;

  const vencimento = data ?? new Date().toISOString().split('T')[0];
  const clienteId  = pedido.clientes?.id ?? pedido.cliente_id ?? null;

  await supabase.from('lancamentos').insert({
    tipo: 'Entrada',
    descricao: `Recebimento pedido ${pedidoId}`,
    valor: aplicado,
    status: 'Pago',
    vencimento,
    pedido_id: pedidoId,
    cliente_id: clienteId,
  } as never);

  if (excedente > 0.005 && clienteId) {
    const creditoAtual = await getCreditoCliente(clienteId);
    await atualizarCreditoCliente(clienteId, creditoAtual + excedente);

    await supabase.from('lancamentos').insert({
      tipo: 'Entrada',
      descricao: `Crédito gerado · excedente pedido ${pedidoId}`,
      valor: excedente,
      status: 'Pago',
      vencimento,
      pedido_id: pedidoId,
      cliente_id: clienteId,
    } as never);
  }

  return { pedido: pedidoAtualizado, excedente };
}

export async function utilizarCreditoEmPedido(
  pedidoId: string,
  valorCredito: number,
  data?: string
): Promise<{ pedido: Pedido; creditoRestante: number } | null> {
  const pedido = await getPedidoById(pedidoId);
  if (!pedido) return null;

  const clienteId = pedido.clientes?.id ?? pedido.cliente_id ?? null;
  if (!clienteId) return null;

  const creditoDisponivel = await getCreditoCliente(clienteId);
  if (creditoDisponivel <= 0) return null;

  const aberto        = Number(pedido.valor_total) - Number(pedido.valor_recebido);
  const valorAplicado = Math.min(valorCredito, creditoDisponivel, aberto);
  if (valorAplicado <= 0.005) return null;

  const novoRecebido     = Number(pedido.valor_recebido) + valorAplicado;
  const pedidoAtualizado = await updatePedido(pedidoId, { valor_recebido: novoRecebido });
  if (!pedidoAtualizado) return null;

  const creditoRestante = creditoDisponivel - valorAplicado;
  await atualizarCreditoCliente(clienteId, creditoRestante);

  const vencimento = data ?? new Date().toISOString().split('T')[0];
  await supabase.from('lancamentos').insert({
    tipo: 'Entrada',
    descricao: `Crédito utilizado · pedido ${pedidoId}`,
    valor: valorAplicado,
    status: 'Pago',
    vencimento,
    pedido_id: pedidoId,
    cliente_id: clienteId,
  } as never);

  return { pedido: pedidoAtualizado, creditoRestante };
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