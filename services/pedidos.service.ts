import { supabase } from '@/lib/supabase/client';
import type { Pedido, PedidoInsert, PedidoUpdate, ItemPedidoInsert, StatusPedido } from '@/types';
import { registrarLog } from './log.service';
import { reverterBaixaEstoque } from './estoque.service';
import { getOtimizacoesPorPedido } from './otimizador.service';

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
    .select(`*, clientes ( * ), itens_pedido ( *, produtos ( id, unidade ) )`)
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

  registrarLog({
    acao: "criou", tabela: "pedidos", registro_id: (data as Pedido).id,
    descricao: `Criou pedido ${(data as Pedido).id}`,
    campos_alterados: { cliente_id: pedido.cliente_id, valor_total: pedido.valor_total, status: pedido.status },
  });

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
  'Qualidade (Corte)',
  'Em Produção – Lapidação',
  'Qualidade (Lapidação)',
  'Separação',
  'Finalizado',
  'Entregue',
];

export async function avancarStatusPedido(id: string, statusAtual: StatusPedido) {
  const idx = FLUXO.indexOf(statusAtual);
  if (idx === -1 || idx === FLUXO.length - 1) return null;
  const novoStatus = FLUXO[idx + 1];
  const res = await updatePedido(id, { status: novoStatus });
  if (res) registrarLog({
    acao: "avançou", tabela: "pedidos", registro_id: id,
    descricao: `Avançou status do pedido ${id}: ${statusAtual} → ${novoStatus}`,
    campos_alterados: { status: { de: statusAtual, para: novoStatus } },
  });
  return res;
}

export async function retrocederStatusPedido(id: string, statusAtual: StatusPedido) {
  const idx = FLUXO.indexOf(statusAtual);
  if (idx <= 0) return null;
  const novoStatus = FLUXO[idx - 1];
  const res = await updatePedido(id, { status: novoStatus });
  if (res) registrarLog({
    acao: "retrocedeu", tabela: "pedidos", registro_id: id,
    descricao: `Retrocedeu status do pedido ${id}: ${statusAtual} → ${novoStatus}`,
    campos_alterados: { status: { de: statusAtual, para: novoStatus } },
  });
  return res;
}

export async function deletarPedido(pedidoId: string): Promise<boolean> {
  // Revert stock for sheets consumed by this order's optimization
  const otimizacoes = await getOtimizacoesPorPedido(pedidoId);
  if (otimizacoes.length > 0) {
    const chapasJson: Array<{ W: number; H: number; prod: string; placed: any[]; retalhoId?: string | null }> =
      otimizacoes[0].chapas_json ?? [];
    const consumoPorProd = new Map<string, { chapas: number; m2: number }>();
    for (const chapa of chapasJson) {
      // Skip retalho sheets — those never touched stock
      if (chapa.retalhoId) continue;
      // Only count sheets that actually had pieces from this pedido
      if (!chapa.placed || chapa.placed.length === 0) continue;
      const prev = consumoPorProd.get(chapa.prod) ?? { chapas: 0, m2: 0 };
      consumoPorProd.set(chapa.prod, {
        chapas: prev.chapas + 1,
        m2: prev.m2 + (chapa.W * chapa.H) / 1e6,
      });
    }
    for (const [prodNome, consumo] of consumoPorProd.entries()) {
      await reverterBaixaEstoque(prodNome, consumo.chapas, parseFloat(consumo.m2.toFixed(4)));
    }
  }

  // Delete retalhos generated by this order
  await supabase.from('retalhos').delete().eq('pedido_origem', pedidoId);

  await supabase.from('historico_otimizador').delete().eq('pedido_id', pedidoId);
  await supabase.from('otimizacoes').delete().eq('pedido_id', pedidoId);
  await supabase.from('lancamentos').delete().eq('pedido_id', pedidoId);
  await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoId);
  await supabase.from('orcamentos').update({ pedido_id: null } as never).eq('pedido_id', pedidoId);
  const { error } = await supabase.from('pedidos').delete().eq('id', pedidoId);
  if (error) { console.error('deletarPedido:', error); return false; }
  registrarLog({ acao: "excluiu", tabela: "pedidos", registro_id: pedidoId, descricao: `Excluiu pedido ${pedidoId}` });
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

  const vencimento = data ?? new Date().toISOString().split('T')[0];
  const clienteId  = pedido.clientes?.id ?? pedido.cliente_id ?? null;

  // Reutiliza o primeiro lançamento "A Receber" existente em vez de criar duplicata
  const { data: primeiro } = await supabase
    .from('lancamentos')
    .select('id')
    .eq('pedido_id', pedidoId)
    .eq('status', 'A Receber')
    .order('vencimento', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (primeiro) {
    await supabase.from('lancamentos')
      .update({ status: 'Pago', valor: aplicado, vencimento } as never)
      .eq('id', (primeiro as any).id);
  } else {
    await supabase.from('lancamentos').insert({
      tipo: 'Entrada',
      descricao: `Recebimento pedido ${pedidoId}`,
      valor: aplicado,
      status: 'Pago',
      vencimento,
      pedido_id: pedidoId,
      cliente_id: clienteId,
    } as never);
  }

  // Recalcula a partir dos lançamentos para manter consistência com handleMarcarPago
  const pedidoAtualizado = await recalcularRecebido(pedidoId);
  if (!pedidoAtualizado) return null;

  if (excedente > 0.005 && clienteId) {
    const creditoAtual = await getCreditoCliente(clienteId);
    await atualizarCreditoCliente(clienteId, creditoAtual + excedente);

    await supabase.from('lancamentos').insert({
      tipo: 'Entrada',
      descricao: `Crédito · excedente pedido ${pedidoId}`,
      valor: excedente,
      status: 'Pago',
      vencimento,
      pedido_id: pedidoId,
      cliente_id: clienteId,
    } as never);
  }

  registrarLog({
    acao: "recebeu", tabela: "pedidos", registro_id: pedidoId,
    descricao: `Registrou recebimento de R$ ${aplicado.toFixed(2)} no pedido ${pedidoId}`,
    campos_alterados: { valor: aplicado, ...(excedente > 0.005 ? { excedente_para_credito: excedente } : {}) },
  });
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

  const pedidoAtualizado = await recalcularRecebido(pedidoId);
  if (!pedidoAtualizado) return null;

  registrarLog({
    acao: "editou", tabela: "pedidos", registro_id: pedidoId,
    descricao: `Utilizou R$ ${valorAplicado.toFixed(2)} de crédito no pedido ${pedidoId}`,
    campos_alterados: { credito_utilizado: valorAplicado, credito_restante: creditoRestante },
  });
  return { pedido: pedidoAtualizado, creditoRestante };
}

export async function getProximoIdPedido(): Promise<string> {
  const { data } = await supabase
    .from('pedidos')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  let proximoNum = 1;
  if (data && data.length > 0) {
    const n = parseInt((data[0] as any).id.replace('P-', ''), 10);
    if (!isNaN(n)) proximoNum = n + 1;
  }
  return `P-${String(proximoNum).padStart(3, '0')}`;
}