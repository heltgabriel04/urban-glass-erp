import { supabase } from '@/lib/supabase/client';

export type StatusOrcamento = 'Rascunho' | 'Enviado' | 'Aprovado' | 'Rejeitado';

export interface ItemOrcamentoInsert {
  orcamento_id: string;
  produto_id: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  quantidade: number;
  m2: number;
  valor_m2: number;
  desconto: number;
  lapidacao: number;
  subtotal: number;
}

export interface OrcamentoInsert {
  id: string;
  cliente_id: number;
  dt_orcamento: string;
  dt_validade?: string | null;
  dt_entrega?: string | null;
  forma_pgto?: string;
  conta?: string;
  parcelas?: number;
  frete?: string;
  obs?: string;
  m2_total: number;
  valor_total: number;
  desconto?: number;
  status?: StatusOrcamento;
}

export async function getOrcamentos(filtroStatus?: StatusOrcamento) {
  let query = supabase
    .from('orcamentos')
    .select(`*, clientes ( id, nome, cidade, tel )`)
    .order('created_at', { ascending: false });

  if (filtroStatus) query = query.eq('status', filtroStatus);

  const { data, error } = await query;
  if (error) { console.error('getOrcamentos:', error); return []; }
  return data;
}

export async function getOrcamentoById(id: string) {
  const { data, error } = await supabase
    .from('orcamentos')
    .select(`*, clientes ( * ), itens_orcamento ( * )`)
    .eq('id', id)
    .single();

  if (error) { console.error('getOrcamentoById:', error); return null; }
  return data;
}

export async function createOrcamento(orcamento: OrcamentoInsert, itens: Omit<ItemOrcamentoInsert, 'orcamento_id'>[] = []) {
  const { data, error } = await supabase
    .from('orcamentos')
    .insert([orcamento as never])
    .select()
    .single();

  if (error) { console.error('createOrcamento:', error); return null; }

  if (itens.length > 0) {
    const itensComId = itens.map(i => ({ ...i, orcamento_id: (data as any).id }));
    const { error: errItens } = await supabase.from('itens_orcamento').insert(itensComId as never);
    if (errItens) console.error('createOrcamento itens:', errItens);
  }

  return data;
}

export async function updateOrcamento(id: string, updates: Partial<OrcamentoInsert>) {
  const { data, error } = await supabase
    .from('orcamentos')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('updateOrcamento:', error); return null; }
  return data;
}

export async function aprovarOrcamento(orcamentoId: string) {
  const orc = await getOrcamentoById(orcamentoId);
  if (!orc) return null;

  // Se já tem pedido vinculado, só atualiza o status do orçamento
  if (orc.pedido_id) {
    return updateOrcamento(orcamentoId, { status: 'Aprovado' } as any);
  }

  // Gera novo ID baseado no maior número existente
  const { data: todosPedidos } = await supabase
    .from('pedidos')
    .select('id')
    .order('id', { ascending: false });

  let proximoNum = 1;
  if (todosPedidos && todosPedidos.length > 0) {
    const nums = todosPedidos
      .map((p: any) => parseInt(p.id.replace('P-', ''), 10))
      .filter((n: number) => !isNaN(n));
    proximoNum = Math.max(...nums) + 1;
  }
  const pedidoId = `P-${String(proximoNum).padStart(3, '0')}`;

  // Cria pedido
  const { data: pedido, error: errPedido } = await supabase
    .from('pedidos')
    .insert([{
      id: pedidoId,
      cliente_id: orc.cliente_id,
      dt_pedido: new Date().toISOString().split('T')[0],
      dt_retirada: orc.dt_entrega || null,
      m2_total: orc.m2_total,
      valor_total: orc.valor_total,
      valor_recebido: 0,
      status: 'Aguardando otimização',
      forma_pgto: orc.forma_pgto || '',
      conta: orc.conta || '',
      parcelas: orc.parcelas || 1,
      obs: orc.obs || '',
    } as never])
    .select()
    .single();

  if (errPedido) { console.error('aprovarOrcamento pedido:', errPedido); return null; }

  // Cria itens do pedido
  if (orc.itens_orcamento?.length > 0) {
    const itensPedido = orc.itens_orcamento.map((i: any) => ({
      pedido_id: pedidoId,
      produto_id: i.produto_id,
      produto_nome: i.produto_nome,
      largura: i.largura,
      altura: i.altura,
      m2: i.m2,
      valor_m2: i.valor_m2,
      lapidacao: i.lapidacao,
      quantidade: i.quantidade,
      subtotal: i.subtotal,
    }));
    const { error: errItens } = await supabase.from('itens_pedido').insert(itensPedido as never);
    if (errItens) console.error('aprovarOrcamento itens_pedido:', errItens);
  }

  // Atualiza orçamento com status e vínculo ao pedido
  await updateOrcamento(orcamentoId, {
    status: 'Aprovado',
    pedido_id: pedidoId,
  } as any);

  return pedido;
}

// pedidoId opcional: se passado, usa direto sem buscar no banco
export async function rejeitarOrcamento(orcamentoId: string, pedidoIdConhecido?: string | null) {
  let pedidoId = pedidoIdConhecido;

  // Se não foi passado, busca no banco
  if (pedidoId === undefined) {
    const orc = await getOrcamentoById(orcamentoId);
    if (!orc) return null;
    pedidoId = orc.pedido_id;
  }

  // Deleta pedido se existir
  if (pedidoId) {
    const { error: errItens } = await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoId);
    if (errItens) console.error('rejeitarOrcamento itens_pedido:', errItens);
    const { error: errPedido } = await supabase.from('pedidos').delete().eq('id', pedidoId);
    if (errPedido) console.error('rejeitarOrcamento pedido:', errPedido);
  }

  // Atualiza orçamento
  return updateOrcamento(orcamentoId, {
    status: 'Rejeitado',
    pedido_id: null,
  } as any);
}

export async function getProximoIdOrcamento(): Promise<string> {
  const { count } = await supabase
    .from('orcamentos')
    .select('*', { count: 'exact', head: true });
  return `ORC-${String((count || 0) + 1).padStart(3, '0')}`;
}