import { supabase } from '@/lib/supabase/client';
import type { BaixaLancamento } from '@/types';
import { registrarLog } from './log.service';
import { recalcularRecebido } from './pedidos.service';

// ── Leitura de baixas ───────────────────────────────────────────────────────

export async function getBaixas(lancamentoId: number): Promise<BaixaLancamento[]> {
  const { data, error } = await supabase
    .from('baixas_lancamento')
    .select('*, contas_bancarias(id, nome)')
    .eq('lancamento_id', lancamentoId)
    .order('data', { ascending: false });
  if (error) { console.error('getBaixas:', error); return []; }
  return data as BaixaLancamento[];
}

// Busca em lote — pra telas de listagem não fazerem 1 query por linha.
export async function getBaixasPorLancamentos(lancamentoIds: number[]): Promise<Map<number, BaixaLancamento[]>> {
  const map = new Map<number, BaixaLancamento[]>();
  if (lancamentoIds.length === 0) return map;
  const { data, error } = await supabase
    .from('baixas_lancamento')
    .select('*, contas_bancarias(id, nome)')
    .in('lancamento_id', lancamentoIds);
  if (error) { console.error('getBaixasPorLancamentos:', error); return map; }
  for (const b of (data ?? []) as BaixaLancamento[]) {
    const arr = map.get(b.lancamento_id) ?? [];
    arr.push(b);
    map.set(b.lancamento_id, arr);
  }
  return map;
}

// Valor pago / saldo de um lançamento a partir das baixas já carregadas.
// Lançamento 'Pago' sem nenhuma baixa é pagamento anterior à existência
// desta tabela — conta o valor cheio, não zero.
export function calcularSaldo(
  lancamento: { valor: number; status: string },
  baixas: BaixaLancamento[] | undefined
): { valorPago: number; saldo: number } {
  const lista = baixas ?? [];
  if (lista.length === 0) {
    const valorPago = lancamento.status === 'Pago' ? Number(lancamento.valor) : 0;
    return { valorPago, saldo: Number(lancamento.valor) - valorPago };
  }
  const valorPago = lista.filter(b => !b.estornado_em).reduce((a, b) => a + Number(b.valor), 0);
  return { valorPago, saldo: Number(lancamento.valor) - valorPago };
}

// ── Baixa (pagamento / recebimento, total ou parcial) ───────────────────────

export interface RegistrarBaixaParams {
  lancamentoId: number;
  valor: number;
  data: string;
  contaId?: number | null;
  formaPgto?: string | null;
  obs?: string | null;
}

export async function registrarBaixa(params: RegistrarBaixaParams): Promise<BaixaLancamento | null> {
  if (!(params.valor > 0)) { console.error('registrarBaixa: valor precisa ser maior que zero'); return null; }

  const { data: lancRow, error: errLanc } = await supabase
    .from('lancamentos')
    .select('id, valor, tipo, pedido_id')
    .eq('id', params.lancamentoId)
    .maybeSingle();
  if (errLanc || !lancRow) { console.error('registrarBaixa: lançamento não encontrado', errLanc); return null; }
  const lanc = lancRow as { id: number; valor: number; tipo: string; pedido_id: string | null };

  const { data: baixa, error: errInsert } = await supabase
    .from('baixas_lancamento')
    .insert([{
      lancamento_id: params.lancamentoId,
      valor: params.valor,
      data: params.data,
      conta_id: params.contaId ?? null,
      forma_pgto: params.formaPgto ?? null,
      obs: params.obs ?? null,
    } as never])
    .select('*, contas_bancarias(id, nome)')
    .single();
  if (errInsert) { console.error('registrarBaixa (insert):', errInsert); return null; }

  const baixasAtivas = await getBaixas(params.lancamentoId);
  const valorPago = baixasAtivas.filter(b => !b.estornado_em).reduce((a, b) => a + Number(b.valor), 0);
  const statusAberto = lanc.tipo === 'Entrada' ? 'A Receber' : 'Pendente';
  const statusFinal = valorPago >= Number(lanc.valor) ? 'Pago' : statusAberto;

  await supabase
    .from('lancamentos')
    .update({ status: statusFinal, dt_pagamento: params.data } as never)
    .eq('id', params.lancamentoId);

  if (lanc.tipo === 'Entrada' && lanc.pedido_id) {
    await recalcularRecebido(lanc.pedido_id);
  }

  registrarLog({
    acao: 'baixou', tabela: 'lancamentos', registro_id: String(params.lancamentoId),
    descricao: `Registrou baixa de R$ ${params.valor.toFixed(2)} no lançamento #${params.lancamentoId}` +
      (statusFinal === 'Pago' ? ' — quitado' : ` — parcial, saldo R$ ${(Number(lanc.valor) - valorPago).toFixed(2)}`),
    campos_alterados: { valor: params.valor, data: params.data, status: statusFinal },
  });

  return baixa as BaixaLancamento;
}

// ── Estorno ──────────────────────────────────────────────────────────────

export interface EstornarBaixaParams {
  baixaId: number;
  motivo: string;
}

export async function estornarBaixa(params: EstornarBaixaParams): Promise<boolean> {
  const motivo = params.motivo?.trim();
  if (!motivo) { console.error('estornarBaixa: motivo é obrigatório'); return false; }

  const { data: baixaRow, error: errBaixa } = await supabase
    .from('baixas_lancamento')
    .select('id, lancamento_id, valor, estornado_em')
    .eq('id', params.baixaId)
    .maybeSingle();
  if (errBaixa || !baixaRow) { console.error('estornarBaixa: baixa não encontrada', errBaixa); return false; }
  const baixa = baixaRow as { id: number; lancamento_id: number; valor: number; estornado_em: string | null };
  if (baixa.estornado_em) { console.warn('estornarBaixa: baixa já estornada'); return false; }

  const { error: errUpdateBaixa } = await supabase
    .from('baixas_lancamento')
    .update({ estornado_em: new Date().toISOString(), estornado_motivo: motivo } as never)
    .eq('id', params.baixaId);
  if (errUpdateBaixa) { console.error('estornarBaixa (update):', errUpdateBaixa); return false; }

  const { data: lancRow } = await supabase
    .from('lancamentos')
    .select('id, valor, tipo, pedido_id')
    .eq('id', baixa.lancamento_id)
    .maybeSingle();
  const lanc = lancRow as { id: number; valor: number; tipo: string; pedido_id: string | null } | null;

  if (lanc) {
    const restantes = (await getBaixas(baixa.lancamento_id)).filter(b => !b.estornado_em);
    const valorPago = restantes.reduce((a, b) => a + Number(b.valor), 0);
    const statusAberto = lanc.tipo === 'Entrada' ? 'A Receber' : 'Pendente';
    const ultimaData = restantes.length > 0
      ? restantes.reduce((max, b) => (b.data > max ? b.data : max), restantes[0].data)
      : null;

    await supabase
      .from('lancamentos')
      .update({
        status: valorPago >= Number(lanc.valor) ? 'Pago' : statusAberto,
        dt_pagamento: ultimaData,
      } as never)
      .eq('id', lanc.id);

    if (lanc.tipo === 'Entrada' && lanc.pedido_id) {
      await recalcularRecebido(lanc.pedido_id);
    }
  }

  registrarLog({
    acao: 'estornou', tabela: 'baixas_lancamento', registro_id: String(params.baixaId),
    descricao: `Estornou baixa #${params.baixaId} (R$ ${Number(baixa.valor).toFixed(2)}) do lançamento #${baixa.lancamento_id} — motivo: ${motivo}`,
    campos_alterados: { motivo, valor_estornado: baixa.valor },
  });

  return true;
}
