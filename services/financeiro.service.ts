import { supabase } from '@/lib/supabase/client';
import type { FinanceiroCliente, FaturamentoMensal, Lancamento, LancamentoInsert } from '@/types';
import { registrarLog } from './log.service';

export async function getFinanceiroClientes() {
  const { data, error } = await supabase
    .from('financeiro_clientes')
    .select('*')
    .order('faturado', { ascending: false });
  if (error) { console.error('getFinanceiroClientes:', error); return []; }
  return data as FinanceiroCliente[];
}

export async function getFaturamentoMensal(ano?: number) {
  let query = supabase.from('faturamento_mensal').select('*').order('mes');
  if (ano) query = query.eq('ano', ano);
  const { data, error } = await query;
  if (error) { console.error('getFaturamentoMensal:', error); return []; }
  return data as FaturamentoMensal[];
}

export async function getLancamentos() {
  const { data, error } = await supabase
    .from('lancamentos')
    .select(`*, clientes ( id, nome )`)
    .order('vencimento', { ascending: true });
  if (error) { console.error('getLancamentos:', error); return []; }
  return data as Lancamento[];
}

export async function getLancamentosPorPedido(pedidoId: string) {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getLancamentosPorPedido:', error); return []; }
  return data as Lancamento[];
}

export async function getLancamentosPorTipo(tipo: 'Entrada' | 'Saída') {
  const { data, error } = await supabase
    .from('lancamentos')
    .select(`*, clientes ( id, nome )`)
    .eq('tipo', tipo)
    .order('vencimento', { ascending: true });
  if (error) { console.error('getLancamentosPorTipo:', error); return []; }
  return data as Lancamento[];
}

export async function deletarLancamento(id: number) {
  const { error } = await supabase.from('lancamentos').delete().eq('id', id);
  if (error) { console.error('deletarLancamento:', error); return false; }
  return true;
}

export async function createLancamento(lancamento: LancamentoInsert) {
  const { data, error } = await supabase
    .from('lancamentos')
    .insert([lancamento as never])
    .select()
    .single();
  if (error) { console.error('createLancamento:', error); return null; }
  return data as Lancamento;
}

export async function updateLancamento(id: number, updates: Partial<LancamentoInsert>) {
  const { data, error } = await supabase
    .from('lancamentos')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateLancamento:', error); return null; }
  return data as Lancamento;
}

// ── Contas a pagar ────────────────────────────────────────────────────────────

export async function getContasAPagar() {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('*')
    .eq('tipo', 'Saída')
    .order('vencimento', { ascending: true });
  if (error) { console.error('getContasAPagar:', error); return []; }
  return data as Lancamento[];
}

export async function criarContaPagar(conta: {
  descricao: string;
  fornecedor?: string;
  categoria?: string;
  valor: number;
  vencimento: string;
  dt_pagamento?: string;
  status: 'Pendente' | 'Pago' | 'Vencido';
  obs?: string;
}) {
  // keep insert untyped to avoid strict mismatch with StatusLancamento
  const insert = {
    tipo: 'Saída',
    descricao: conta.descricao,
    valor: conta.valor,
    status: conta.status,
    vencimento: conta.vencimento,
    pedido_id: null,
    cliente_id: null,
  };
  const { data, error } = await supabase
    .from('lancamentos')
    .insert([{
      ...insert,
      fornecedor:    conta.fornecedor ?? '',
      categoria:     conta.categoria ?? '',
      dt_pagamento:  conta.dt_pagamento ?? null,
      obs:           conta.obs ?? '',
    } as never])
    .select()
    .single();
  if (error) { console.error('criarContaPagar:', error); return null; }
  registrarLog({
    acao: "criou", tabela: "lancamentos",
    descricao: `Criou conta a pagar: ${conta.descricao} · R$ ${conta.valor.toFixed(2)}`,
    campos_alterados: { descricao: conta.descricao, valor: conta.valor, vencimento: conta.vencimento },
  });
  return data as Lancamento;
}

export async function pagarConta(id: number, dtPagamento: string) {
  const { data, error } = await supabase
    .from('lancamentos')
    .update({ status: 'Pago', dt_pagamento: dtPagamento } as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('pagarConta:', error); return null; }
  registrarLog({
    acao: "pagou", tabela: "lancamentos", registro_id: String(id),
    descricao: `Marcou lançamento #${id} como pago`,
    campos_alterados: { status: { de: "Pendente", para: "Pago" }, dt_pagamento: dtPagamento },
  });
  return data as Lancamento;
}

// ── Lançamentos parcelados ────────────────────────────────────────────────────

export async function criarLancamentosParcelados({
  pedidoId,
  clienteId,
  parcelas,
}: {
  pedidoId: string;
  clienteId: number;
  parcelas: { data: string; valor: number }[];
}) {
  await supabase.from('lancamentos').delete().eq('pedido_id', pedidoId).eq('status', 'A Receber');
  const total = parcelas.length;
  const inserts: LancamentoInsert[] = parcelas
    .filter(p => p.data && p.valor > 0)
    .map((p, i) => ({
      tipo: 'Entrada' as const,
      descricao: total === 1
        ? `Recebimento · ${pedidoId}`
        : `Parcela ${i + 1}/${total} · ${pedidoId}`,
      valor: p.valor,
      status: 'A Receber' as const,
      vencimento: p.data,
      pedido_id: pedidoId,
      cliente_id: clienteId,
    }));
  if (inserts.length === 0) return true;
  const { error } = await supabase.from('lancamentos').insert(inserts as never[]);
  if (error) { console.error('criarLancamentosParcelados:', error); return false; }
  registrarLog({
    acao: "criou", tabela: "lancamentos", registro_id: pedidoId,
    descricao: `Criou ${inserts.length} parcela(s) para pedido ${pedidoId}`,
    campos_alterados: { parcelas: inserts.length, total: inserts.reduce((a, p) => a + p.valor, 0) },
  });
  return true;
}