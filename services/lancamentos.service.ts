import { supabase } from '@/lib/supabase/client';
import type { BaixaLancamento, LancamentoRateio } from '@/types';
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
    if (b.lancamento_id == null) continue; // baixa de transferência, não deveria vir nesse filtro
    const arr = map.get(b.lancamento_id) ?? [];
    arr.push(b);
    map.set(b.lancamento_id, arr);
  }
  return map;
}

// Valor pago / saldo de um lançamento a partir das baixas já carregadas.
// Lançamento 'Pago' sem nenhuma baixa é pagamento anterior à existência
// desta tabela — conta o valor cheio, não zero. Juros/multa/desconto não
// abatem o saldo do título (só o principal, campo `valor`, abate) — são
// resultado financeiro à parte, só informativo aqui.
export function calcularSaldo(
  lancamento: { valor: number; status: string },
  baixas: BaixaLancamento[] | undefined
): { valorPago: number; saldo: number; jurosTotal: number; multaTotal: number; descontoTotal: number } {
  const lista = (baixas ?? []).filter(b => !b.estornado_em);
  const jurosTotal    = lista.reduce((a, b) => a + Number(b.valor_juros ?? 0), 0);
  const multaTotal    = lista.reduce((a, b) => a + Number(b.valor_multa ?? 0), 0);
  const descontoTotal = lista.reduce((a, b) => a + Number(b.valor_desconto ?? 0), 0);

  if ((baixas ?? []).length === 0) {
    const valorPago = lancamento.status === 'Pago' ? Number(lancamento.valor) : 0;
    return { valorPago, saldo: Number(lancamento.valor) - valorPago, jurosTotal, multaTotal, descontoTotal };
  }
  const valorPago = lista.reduce((a, b) => a + Number(b.valor), 0);
  return { valorPago, saldo: Number(lancamento.valor) - valorPago, jurosTotal, multaTotal, descontoTotal };
}

// ── Baixa (pagamento / recebimento, total ou parcial) ───────────────────────

export interface RegistrarBaixaParams {
  lancamentoId: number;
  valor: number;
  data: string;
  contaId?: number | null;
  formaPgto?: string | null;
  obs?: string | null;
  valorJuros?: number;
  valorMulta?: number;
  valorDesconto?: number;
  origemAdiantamentoId?: number | null;
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
      valor_juros: params.valorJuros ?? 0,
      valor_multa: params.valorMulta ?? 0,
      valor_desconto: params.valorDesconto ?? 0,
      data: params.data,
      conta_id: params.contaId ?? null,
      forma_pgto: params.formaPgto ?? null,
      origem_adiantamento_id: params.origemAdiantamentoId ?? null,
      obs: params.obs ?? null,
    } as never])
    .select('*, contas_bancarias(id, nome)')
    .single();
  if (errInsert) { console.error('registrarBaixa (insert):', errInsert); return null; }

  // Só o principal (valor) conta pro saldo do título — juros/multa/desconto
  // ficam registrados na baixa, mas não abatem nem inflam a quitação.
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

  const extras = [
    params.valorJuros ? `juros R$ ${params.valorJuros.toFixed(2)}` : null,
    params.valorMulta ? `multa R$ ${params.valorMulta.toFixed(2)}` : null,
    params.valorDesconto ? `desconto R$ ${params.valorDesconto.toFixed(2)}` : null,
  ].filter(Boolean).join(', ');

  registrarLog({
    acao: 'baixou', tabela: 'lancamentos', registro_id: String(params.lancamentoId),
    descricao: `Registrou baixa de R$ ${params.valor.toFixed(2)} no lançamento #${params.lancamentoId}` +
      (statusFinal === 'Pago' ? ' — quitado' : ` — parcial, saldo R$ ${(Number(lanc.valor) - valorPago).toFixed(2)}`) +
      (extras ? ` (${extras})` : ''),
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

// ── Exclusão (soft-delete quando já teve baixa) ─────────────────────────────

// Lançamento que nunca teve baixa (nem estornada) é apagado de verdade —
// não há histórico de pagamento pra perder. Se já teve baixa alguma vez,
// vira soft-delete (some das listagens, mas o registro e o histórico de
// baixas continuam existindo pra auditoria).
export async function excluirLancamento(id: number, motivo?: string): Promise<boolean> {
  const baixas = await getBaixas(id);
  const { data: lancRow } = await supabase.from('lancamentos').select('descricao, valor, status').eq('id', id).maybeSingle();
  const lanc = lancRow as { descricao: string; valor: number; status: string } | null;

  if (baixas.length === 0) {
    const { error } = await supabase.from('lancamentos').delete().eq('id', id);
    if (error) { console.error('excluirLancamento (delete):', error); return false; }
    registrarLog({
      acao: 'excluiu', tabela: 'lancamentos', registro_id: String(id),
      descricao: `Excluiu lançamento: ${lanc?.descricao ?? id}`,
      campos_alterados: { valor: lanc?.valor, status: lanc?.status },
    });
    return true;
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('lancamentos')
    .update({
      deletado_em: new Date().toISOString(),
      deletado_por: user?.email ?? null,
      deletado_motivo: motivo ?? null,
    } as never)
    .eq('id', id);
  if (error) { console.error('excluirLancamento (soft-delete):', error); return false; }

  registrarLog({
    acao: 'excluiu', tabela: 'lancamentos', registro_id: String(id),
    descricao: `Excluiu (soft-delete, já teve baixa) lançamento: ${lanc?.descricao ?? id}` + (motivo ? ` — motivo: ${motivo}` : ''),
    campos_alterados: { motivo: motivo ?? null },
  });
  return true;
}

// ── Edição com auditoria de renegociação ────────────────────────────────────

export interface EditarLancamentoParams {
  id: number;
  updates: Record<string, unknown>;
  motivoRenegociacao?: string;
}

// Se o título já tem baixa e vencimento/valor estão mudando, exige motivo
// e grava o valor anterior explícito no log — não é "editou", é
// "renegociou". Sem baixa, ou sem mudar vencimento/valor, é uma edição
// normal (mesmo comportamento de antes).
export async function editarLancamento(params: EditarLancamentoParams): Promise<boolean> {
  const { data: atualRow } = await supabase
    .from('lancamentos')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  const atual = atualRow as { vencimento: string | null; valor: number; descricao: string } | null;
  if (!atual) { console.error('editarLancamento: lançamento não encontrado'); return false; }

  const baixas = await getBaixas(params.id);
  const mudaVencimento = 'vencimento' in params.updates && params.updates.vencimento !== atual.vencimento;
  const mudaValor = 'valor' in params.updates && Number(params.updates.valor) !== Number(atual.valor);
  const ehRenegociacao = baixas.length > 0 && (mudaVencimento || mudaValor);

  if (ehRenegociacao && !params.motivoRenegociacao?.trim()) {
    console.error('editarLancamento: título já tem baixa — motivo da renegociação é obrigatório');
    return false;
  }

  // Snapshot completo do estado anterior — não é o log de atividade (que só
  // guarda o diff), é o registro inteiro, pra dar pra reconstruir o estado
  // exato do lançamento em qualquer ponto do tempo.
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('lancamentos_historico').insert([{
    lancamento_id: params.id, snapshot: atual, alterado_por: user?.email ?? null,
  }] as never);

  const { error } = await supabase.from('lancamentos').update(params.updates as never).eq('id', params.id);
  if (error) { console.error('editarLancamento (update):', error); return false; }

  if (ehRenegociacao) {
    registrarLog({
      acao: 'renegociou', tabela: 'lancamentos', registro_id: String(params.id),
      descricao: `Renegociou lançamento "${atual.descricao}" — motivo: ${params.motivoRenegociacao!.trim()}`,
      campos_alterados: {
        vencimento: mudaVencimento ? { de: atual.vencimento, para: params.updates.vencimento } : undefined,
        valor: mudaValor ? { de: atual.valor, para: params.updates.valor } : undefined,
        motivo: params.motivoRenegociacao!.trim(),
      },
    });
  } else {
    registrarLog({
      acao: 'editou', tabela: 'lancamentos', registro_id: String(params.id),
      descricao: `Editou lançamento: ${atual.descricao}`,
      campos_alterados: params.updates,
    });
  }
  return true;
}

// ── Duplicidade ──────────────────────────────────────────────────────────

export interface LancamentoDuplicado { id: number; descricao: string; valor: number; vencimento: string | null; }

// Aviso não bloqueante — duplicata legítima existe (ex: mesma NF paga em
// parcelas separadas cadastradas manualmente). Só avisa.
export async function verificarDuplicado(
  documento: string | null | undefined,
  fornecedorId: number | null | undefined,
  tipo: 'Entrada' | 'Saída'
): Promise<LancamentoDuplicado[]> {
  if (!documento?.trim() || !fornecedorId) return [];
  const desde = new Date();
  desde.setDate(desde.getDate() - 90);
  const desdeStr = desde.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, descricao, valor, vencimento')
    .eq('tipo', tipo)
    .eq('documento', documento.trim())
    .eq('fornecedor_id', fornecedorId)
    .gte('created_at', desdeStr)
    .is('deletado_em', null);
  if (error) { console.error('verificarDuplicado:', error); return []; }
  return (data ?? []) as LancamentoDuplicado[];
}

// Mesma checagem, mas por cliente (Contas a Receber já usa cliente_id como
// FK estruturada, diferente do fornecedor que ainda é texto livre).
export async function verificarDuplicadoCliente(
  documento: string | null | undefined,
  clienteId: number | null | undefined
): Promise<LancamentoDuplicado[]> {
  if (!documento?.trim() || !clienteId) return [];
  const desde = new Date();
  desde.setDate(desde.getDate() - 90);
  const desdeStr = desde.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, descricao, valor, vencimento')
    .eq('tipo', 'Entrada')
    .eq('documento', documento.trim())
    .eq('cliente_id', clienteId)
    .gte('created_at', desdeStr)
    .is('deletado_em', null);
  if (error) { console.error('verificarDuplicadoCliente:', error); return []; }
  return (data ?? []) as LancamentoDuplicado[];
}

// ── Rateio entre centros de custo ───────────────────────────────────────────

export async function getRateio(lancamentoId: number): Promise<LancamentoRateio[]> {
  const { data, error } = await supabase
    .from('lancamento_rateio')
    .select('*, centros_custo(id, nome)')
    .eq('lancamento_id', lancamentoId);
  if (error) { console.error('getRateio:', error); return []; }
  return data as LancamentoRateio[];
}

// Substitui o rateio inteiro do lançamento pela nova lista. Soma dos
// percentuais precisa fechar 100% — validado aqui, não no banco (mesma
// convenção do projeto: regra de negócio na camada de app).
export async function salvarRateio(lancamentoId: number, itens: { centroCustoId: number; percentual: number }[]): Promise<boolean> {
  const soma = itens.reduce((a, i) => a + i.percentual, 0);
  if (itens.length > 0 && Math.abs(soma - 100) > 0.01) {
    console.error('salvarRateio: soma dos percentuais precisa ser 100%, veio', soma);
    return false;
  }

  const { error: errDelete } = await supabase.from('lancamento_rateio').delete().eq('lancamento_id', lancamentoId);
  if (errDelete) { console.error('salvarRateio (delete):', errDelete); return false; }

  if (itens.length === 0) return true;

  const { error: errInsert } = await supabase.from('lancamento_rateio').insert(
    itens.map(i => ({ lancamento_id: lancamentoId, centro_custo_id: i.centroCustoId, percentual: i.percentual })) as never[]
  );
  if (errInsert) { console.error('salvarRateio (insert):', errInsert); return false; }

  registrarLog({
    acao: 'rateou', tabela: 'lancamentos', registro_id: String(lancamentoId),
    descricao: `Definiu rateio entre ${itens.length} centro(s) de custo no lançamento #${lancamentoId}`,
    campos_alterados: { rateio: itens },
  });
  return true;
}

// ── Adiantamento ─────────────────────────────────────────────────────────

export interface CriarAdiantamentoParams {
  tipo: 'Entrada' | 'Saída';
  descricao: string;
  valor: number;
  data: string;
  clienteId?: number | null;
  fornecedorId?: number | null;
  contaId?: number | null;
  obs?: string | null;
}

// Adiantamento é um lançamento já nasce "pago" (o dinheiro entrou/saiu na
// hora) mas sem vencimento nem plano de contas — esses só fazem sentido
// quando o adiantamento é aplicado a um título de verdade depois.
export async function criarAdiantamento(params: CriarAdiantamentoParams) {
  const { data, error } = await supabase
    .from('lancamentos')
    .insert([{
      tipo: params.tipo,
      descricao: params.descricao,
      valor: params.valor,
      status: 'Pago',
      dt_pagamento: params.data,
      vencimento: null,
      natureza: 'adiantamento',
      cliente_id: params.clienteId ?? null,
      fornecedor_id: params.fornecedorId ?? null,
      conta_id: params.contaId ?? null,
      pedido_id: null,
      obs: params.obs ?? null,
    } as never])
    .select()
    .single();
  if (error) { console.error('criarAdiantamento:', error); return null; }

  const lanc = data as { id: number };
  // A baixa é o próprio recebimento/pagamento do adiantamento na conta
  // bancária informada — sem isso o adiantamento nunca teria uma baixa
  // registrando de onde veio o dinheiro.
  await supabase.from('baixas_lancamento').insert([{
    lancamento_id: lanc.id,
    valor: params.valor,
    data: params.data,
    conta_id: params.contaId ?? null,
    obs: 'Adiantamento',
  }] as never[]);

  registrarLog({
    acao: 'criou', tabela: 'lancamentos', registro_id: String(lanc.id),
    descricao: `Criou adiantamento (${params.tipo}) de R$ ${params.valor.toFixed(2)}: ${params.descricao}`,
    campos_alterados: { valor: params.valor, natureza: 'adiantamento' },
  });
  return lanc;
}

// Saldo do adiantamento = valor total − soma do que já foi aplicado dele
// (baixas de outros lançamentos com origem_adiantamento_id = este).
export async function getSaldoAdiantamento(adiantamentoId: number): Promise<number> {
  const { data: lancRow } = await supabase.from('lancamentos').select('valor').eq('id', adiantamentoId).maybeSingle();
  if (!lancRow) return 0;
  const valor = Number((lancRow as { valor: number }).valor);

  const { data: aplicacoes } = await supabase
    .from('baixas_lancamento')
    .select('valor')
    .eq('origem_adiantamento_id', adiantamentoId)
    .is('estornado_em', null);
  const aplicado = (aplicacoes ?? []).reduce((a, b) => a + Number((b as { valor: number }).valor), 0);
  return valor - aplicado;
}

export interface AdiantamentoComSaldo { id: number; descricao: string; valor: number; saldo: number; }

// Adiantamentos disponíveis (saldo > 0) de um cliente ou fornecedor —
// pra oferecer como origem de baixa em vez de conta bancária.
export async function getAdiantamentosDisponiveis(params: { tipo: 'Entrada' | 'Saída'; clienteId?: number | null; fornecedorId?: number | null }): Promise<AdiantamentoComSaldo[]> {
  let query = supabase.from('lancamentos').select('id, descricao, valor').eq('natureza', 'adiantamento').eq('tipo', params.tipo).is('deletado_em', null);
  if (params.clienteId) query = query.eq('cliente_id', params.clienteId);
  if (params.fornecedorId) query = query.eq('fornecedor_id', params.fornecedorId);
  const { data } = await query;
  const lista = (data ?? []) as { id: number; descricao: string; valor: number }[];

  const comSaldo: AdiantamentoComSaldo[] = [];
  for (const l of lista) {
    const saldo = await getSaldoAdiantamento(l.id);
    if (saldo > 0.01) comSaldo.push({ id: l.id, descricao: l.descricao, valor: Number(l.valor), saldo });
  }
  return comSaldo;
}

// ── Reembolso ────────────────────────────────────────────────────────────

export interface CriarReembolsoParams {
  lancamentoOrigemId: number;
  valor: number;
  data: string;
  obs?: string | null;
}

// Reembolso é diferente de estorno: o título original já foi baixado e
// fechado de verdade, e continua assim — o reembolso é um lançamento novo
// (dinheiro que volta), só referenciando de onde veio pra rastreabilidade.
export async function criarReembolso(params: CriarReembolsoParams) {
  const { data: origemRow } = await supabase
    .from('lancamentos')
    .select('id, tipo, descricao, cliente_id, fornecedor_id, plano_contas_id, centro_custo_id')
    .eq('id', params.lancamentoOrigemId)
    .maybeSingle();
  if (!origemRow) { console.error('criarReembolso: lançamento de origem não encontrado'); return null; }
  const origem = origemRow as { id: number; tipo: string; descricao: string; cliente_id: number | null; fornecedor_id: number | null; plano_contas_id: number | null; centro_custo_id: number | null };

  // Reembolso de uma Saída (empresa pagou fornecedor a mais) volta como
  // Entrada; reembolso de uma Entrada (cliente foi reembolsado) vira Saída.
  const tipoReembolso = origem.tipo === 'Saída' ? 'Entrada' : 'Saída';

  const { data, error } = await supabase
    .from('lancamentos')
    .insert([{
      tipo: tipoReembolso,
      descricao: `Reembolso — ${origem.descricao}`,
      valor: params.valor,
      status: tipoReembolso === 'Entrada' ? 'A Receber' : 'Pendente',
      vencimento: params.data,
      natureza: 'reembolso',
      lancamento_origem_id: origem.id,
      cliente_id: origem.cliente_id,
      fornecedor_id: origem.fornecedor_id,
      plano_contas_id: origem.plano_contas_id,
      centro_custo_id: origem.centro_custo_id,
      pedido_id: null,
      obs: params.obs ?? null,
    } as never])
    .select()
    .single();
  if (error) { console.error('criarReembolso:', error); return null; }

  registrarLog({
    acao: 'criou', tabela: 'lancamentos', registro_id: String((data as { id: number }).id),
    descricao: `Criou reembolso de R$ ${params.valor.toFixed(2)} referente ao lançamento #${origem.id}`,
    campos_alterados: { valor: params.valor, lancamento_origem_id: origem.id },
  });
  return data as { id: number };
}

// ── Histórico de versão ──────────────────────────────────────────────────

export interface VersaoLancamento {
  id: number;
  lancamento_id: number;
  snapshot: Record<string, unknown>;
  alterado_em: string;
  alterado_por: string | null;
}

export async function getHistorico(lancamentoId: number): Promise<VersaoLancamento[]> {
  const { data, error } = await supabase
    .from('lancamentos_historico')
    .select('*')
    .eq('lancamento_id', lancamentoId)
    .order('alterado_em', { ascending: false });
  if (error) { console.error('getHistorico:', error); return []; }
  return data as VersaoLancamento[];
}

// ── Sugestão por histórico ───────────────────────────────────────────────

// Plano de Contas / Centro de Custo usados da última vez pra esse mesmo
// fornecedor ou cliente — preenchimento inteligente, não é IA, é "o que
// você fez da última vez".
export async function getUltimoPlanoContas(params: { fornecedorId?: number | null; clienteId?: number | null }): Promise<{ planoContasId: number | null; centroCustoId: number | null }> {
  const vazio = { planoContasId: null, centroCustoId: null };
  if (!params.fornecedorId && !params.clienteId) return vazio;

  let query = supabase
    .from('lancamentos')
    .select('plano_contas_id, centro_custo_id')
    .order('created_at', { ascending: false })
    .limit(1);
  query = params.fornecedorId ? query.eq('fornecedor_id', params.fornecedorId) : query.eq('cliente_id', params.clienteId!);

  const { data } = await query.maybeSingle();
  if (!data) return vazio;
  const row = data as { plano_contas_id: number | null; centro_custo_id: number | null };
  return { planoContasId: row.plano_contas_id, centroCustoId: row.centro_custo_id };
}
