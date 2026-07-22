import { supabase } from '@/lib/supabase/client';
import type { Pedido, PedidoInsert, PedidoUpdate, ItemPedido, ItemPedidoInsert, StatusPedido } from '@/types';
import { valorComIpi } from '@/lib/pedidoIpi';
import { registrarLog } from './log.service';
import { isChapaInteira } from '@/lib/chapas';
import { registrarMovimentacao } from './estoqueMovimentacoes.service';
import { registrarMovimentoCliente } from './materialCliente.service';
import { reconciliarProgramacaoComPedido } from './programacao.service';
import { getLotesUtilizaveis } from './lotes.service';

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

export interface PedidosPagina {
  rows: Pedido[];
  total: number;
}

// Dois filtros independentes — status de produção/fluxo (StatusPedido) e
// status financeiro (derivado de valor_recebido vs. valor_total+IPI, não
// existe coluna própria pra isso). Aplicáveis juntos (AND), nunca um
// substituindo o outro — ex.: produção "Entregue" + pagamento "Aberto" é
// uma combinação real e válida que precisa ser filtrável.
export type StatusProducaoFiltro  = "todos" | StatusPedido;
export type StatusPagamentoFiltro = "todos" | "aberto" | "quitado";

/** Monta a condição OR (nº pedido, status ou nome de cliente) para o filtro textual de `pedidos`. */
async function buildFiltroBuscaOr(termo: string): Promise<string> {
  const { data: cli } = await supabase.from('clientes').select('id').ilike('nome', `%${termo}%`);
  const ids = (cli ?? []).map(c => (c as { id: number }).id);
  const safe = termo.replace(/[,()]/g, ' ');
  const ors = [`id.ilike.%${safe}%`, `status.ilike.%${safe}%`];
  if (ids.length) ors.push(`cliente_id.in.(${ids.join(',')})`);
  return ors.join(',');
}

/** Lista paginada com busca e aba financeira/status server-side. */
export async function getPedidosPaginado(
  { limit, offset, busca, statusProducao, statusPagamento }: {
    limit: number; offset: number; busca?: string;
    statusProducao?: StatusProducaoFiltro; statusPagamento?: StatusPagamentoFiltro;
  }
): Promise<PedidosPagina> {
  // Filtro de pagamento exige pré-busca de IDs pois PostgREST não compara colunas entre si
  let financialIds: string[] | null = null;
  if (statusPagamento === 'aberto' || statusPagamento === 'quitado') {
    const { data: all } = await supabase.from('pedidos').select('id, valor_total, valor_ipi, valor_recebido');
    financialIds = ((all ?? []) as Array<{ id: string; valor_total: number; valor_ipi: number; valor_recebido: number }>)
      .filter(r => statusPagamento === 'aberto'
        ? Number(r.valor_recebido) < valorComIpi(r)
        : Number(r.valor_recebido) >= valorComIpi(r))
      .map(r => r.id);
  }

  let query = supabase
    .from('pedidos')
    .select(`*, clientes ( id, nome, cidade, tel )`, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (statusProducao && statusProducao !== 'todos') {
    query = query.eq('status', statusProducao);
  }

  if (financialIds !== null) {
    if (financialIds.length === 0) return { rows: [], total: 0 };
    query = query.in('id', financialIds);
  }

  const termo = busca?.trim();
  if (termo) query = query.or(await buildFiltroBuscaOr(termo));

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) { console.error('getPedidosPaginado:', error); return { rows: [], total: 0 }; }
  return { rows: (data ?? []) as Pedido[], total: count ?? 0 };
}

export interface PedidosTotais {
  count: number;
  valorTotal: number;
  recebido: number;
  emProducao: number;
  aguardandoOtim: number;
}

/** Totais para os cards — payload leve, sem joins. Se `busca` for informado, restringe aos pedidos que casam com a pesquisa (ex.: cliente selecionado). */
export async function getPedidosTotais(busca?: string): Promise<PedidosTotais> {
  let query = supabase.from('pedidos').select('valor_total, valor_ipi, valor_recebido, status');
  const termo = busca?.trim();
  if (termo) query = query.or(await buildFiltroBuscaOr(termo));

  const { data, error } = await query;
  if (error) { console.error('getPedidosTotais:', error); return { count: 0, valorTotal: 0, recebido: 0, emProducao: 0, aguardandoOtim: 0 }; }
  const rows = (data ?? []) as Array<{ valor_total: number; valor_ipi: number; valor_recebido: number; status: string }>;
  return {
    count:          rows.length,
    valorTotal:     rows.reduce((a, r) => a + valorComIpi(r), 0),
    recebido:       rows.reduce((a, r) => a + Number(r.valor_recebido), 0),
    emProducao:     rows.filter(r => r.status.startsWith('Em Produção')).length,
    aguardandoOtim: rows.filter(r => r.status === 'Aguardando otimização').length,
  };
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

export async function getClienteNomePublico(clienteId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_cliente_nome_publico', { p_cliente_id: clienteId });
  if (error) { console.error('getClienteNomePublico:', error); return null; }
  return data as string | null;
}

export async function createPedido(pedido: PedidoInsert, itens: ItemPedidoInsert[] = []) {
  const payload = {
    ...pedido,
    status_history: [{ status: pedido.status, desde: new Date().toISOString() }],
  };

  const { data, error } = await supabase
    .from('pedidos')
    .insert([payload as never])
    .select()
    .single();

  if (error) { console.error('createPedido:', error); throw new Error(error.message); }

  registrarLog({
    acao: "criou", tabela: "pedidos", registro_id: (data as Pedido).id,
    descricao: `Criou pedido ${(data as Pedido).id}`,
    campos_alterados: { cliente_id: pedido.cliente_id, valor_total: pedido.valor_total, status: pedido.status },
  });

  if (itens.length > 0) {
    const itensComId = itens.map(i => ({ ...i, pedido_id: (data as Pedido).id }));
    const { data: itensInseridos, error: errItens } = await supabase
      .from('itens_pedido')
      .insert(itensComId as never)
      .select();
    if (errItens) console.error('createPedido itens:', errItens);

    // Dimensões confirmadas por produto (lotes_estoque) — busca uma vez pra
    // todos os itens do pedido, não por item (evita N+1).
    const lotes = await getLotesUtilizaveis();
    const chapasPorProduto = new Map<number, { w: number; h: number }[]>();
    lotes.forEach(l => {
      if (!l.chapa_largura_mm || !l.chapa_altura_mm) return;
      const arr = chapasPorProduto.get(l.produto_id) ?? [];
      arr.push({ w: l.chapa_largura_mm, h: l.chapa_altura_mm });
      chapasPorProduto.set(l.produto_id, arr);
    });

    for (const item of (itensInseridos ?? []) as ItemPedido[]) {
      if (item.vidro_cliente) {
        const res = await registrarMovimentoCliente({
          pedido_id: (data as Pedido).id, cliente_id: pedido.cliente_id, item_pedido_id: item.id,
          tipo: 'entrada', descricao: item.produto_nome,
          largura: item.largura, altura: item.altura, quantidade: item.quantidade,
          nc_id: null, obs: null,
        });
        if (!res.ok && !res.jaExistia) console.error('createPedido entrada vidro cliente:', res.motivo);
        continue;
      }
      const chapasDoProduto = item.produto_id ? (chapasPorProduto.get(item.produto_id) ?? []) : [];
      if (!isChapaInteira(item.largura, item.altura, chapasDoProduto)) continue;
      const m2 = (item.largura * item.altura / 1e6) * item.quantidade;
      const res = await registrarMovimentacao({
        produtoId: item.produto_id ?? undefined,
        produtoNome: item.produto_nome,
        tipo: 'saida_producao', origemTipo: 'pedido_chapa', origemId: String(item.id),
        chapas: -item.quantidade, m2: -parseFloat(m2.toFixed(4)),
      });
      if (!res.ok && !res.jaExistia) console.error('createPedido baixa chapa inteira:', res.motivo);
    }
  }

  return data as Pedido;
}

// Transições válidas de status:
//  • De qualquer status ativo → 'Cancelado'
//  • Avanço/retrocesso de 1 passo no fluxo principal (inclui recuar de
//    'Entregue' pra 'Finalizado', ex.: marcado como entregue por engano)
//  • Nunca sair de 'Cancelado' — esse sim é terminal de verdade
// Edição completa do pedido em Entregue/Cancelado continua bloqueada por
// uma regra separada (ver pedidos/[id]/page.tsx).
function transicaoValida(de: StatusPedido, para: StatusPedido): boolean {
  if (de === para) return true;
  if (de === 'Cancelado') return false;
  if (para === 'Cancelado') return true;
  const idxDe   = FLUXO.indexOf(de);
  const idxPara = FLUXO.indexOf(para);
  if (idxDe === -1 || idxPara === -1) return false;
  return Math.abs(idxPara - idxDe) === 1;
}

export async function updatePedido(id: string, updates: PedidoUpdate) {
  // C1: arrays de pagamento devem ter o mesmo comprimento
  if (updates.datas_pgto !== undefined || updates.valores_pgto !== undefined) {
    const datas   = updates.datas_pgto   ?? [];
    const valores = updates.valores_pgto ?? [];
    if (datas.length !== valores.length) {
      console.error(`updatePedido: datas_pgto (${datas.length}) ≠ valores_pgto (${valores.length})`);
      return null;
    }
  }

  // C8: máquina de estado — valida transição antes de gravar
  if ('status' in updates && updates.status) {
    const { data: cur } = await supabase
      .from('pedidos')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    const statusAtual = (cur as { status?: StatusPedido } | null)?.status;
    if (statusAtual && !transicaoValida(statusAtual, updates.status as StatusPedido)) {
      console.warn(`updatePedido: transição inválida ${statusAtual} → ${updates.status}`);
      return null;
    }
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('updatePedido:', error); return null; }
  return data as Pedido;
}

// Soma o recebido dos lançamentos de Entrada do pedido. Lançamentos com
// baixa registrada (fluxo novo, ver lancamentos.service.ts) somam as baixas
// ativas — suporta parcial. Lançamentos 'Pago' sem nenhuma baixa (pagamento
// antigo, anterior à tabela baixas_lancamento) contam o valor cheio, senão
// todo histórico pré-baixa parcial zeraria ao recalcular.
export async function recalcularRecebido(pedidoId: string) {
  const { data: lancs, error: errLancs } = await supabase
    .from('lancamentos')
    .select('id, valor, status')
    .eq('pedido_id', pedidoId)
    .eq('tipo', 'Entrada')
    .is('deletado_em', null);

  if (errLancs) { console.error('recalcularRecebido (lancamentos):', errLancs); return null; }

  const lancamentos = (lancs ?? []) as { id: number; valor: number; status: string }[];
  if (lancamentos.length === 0) return updatePedido(pedidoId, { valor_recebido: 0 });

  const { data: baixas, error: errBaixas } = await supabase
    .from('baixas_lancamento')
    .select('lancamento_id, valor, estornado_em')
    .in('lancamento_id', lancamentos.map(l => l.id));

  if (errBaixas) { console.error('recalcularRecebido (baixas):', errBaixas); return null; }

  const baixasPorLancamento = new Map<number, { valor: number; estornado_em: string | null }[]>();
  for (const b of (baixas ?? []) as { lancamento_id: number; valor: number; estornado_em: string | null }[]) {
    const arr = baixasPorLancamento.get(b.lancamento_id) ?? [];
    arr.push(b);
    baixasPorLancamento.set(b.lancamento_id, arr);
  }

  const total = lancamentos.reduce((soma, l) => {
    const suasBaixas = baixasPorLancamento.get(l.id);
    if (suasBaixas && suasBaixas.length > 0) {
      return soma + suasBaixas.filter(b => !b.estornado_em).reduce((a, b) => a + Number(b.valor), 0);
    }
    return soma + (l.status === 'Pago' ? Number(l.valor) : 0);
  }, 0);

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

  const { data: cur } = await supabase.from('pedidos').select('status_history').eq('id', id).single();
  const historico = (cur?.status_history as { status: StatusPedido; desde: string }[] | null) ?? [];
  const novoHistorico = [...historico, { status: novoStatus, desde: new Date().toISOString() }];

  const res = await updatePedido(id, { status: novoStatus, status_history: novoHistorico as any });
  if (res) {
    registrarLog({
      acao: "avançou", tabela: "pedidos", registro_id: id,
      descricao: `Avançou status do pedido ${id}: ${statusAtual} → ${novoStatus}`,
      campos_alterados: { status: { de: statusAtual, para: novoStatus } },
    });
    await reconciliarProgramacaoComPedido(id, novoStatus);
  }

  if (res && statusAtual === 'Aguardando otimização' && novoStatus === 'Em Produção – Corte') {
    const { data: itensVC } = await supabase
      .from('itens_pedido')
      .select('id, produto_nome, largura, altura, quantidade')
      .eq('pedido_id', id)
      .eq('vidro_cliente', true);
    for (const item of (itensVC ?? []) as Array<{ id: number; produto_nome: string; largura: number; altura: number; quantidade: number }>) {
      const r = await registrarMovimentoCliente({
        pedido_id: id, cliente_id: res.cliente_id, item_pedido_id: item.id,
        tipo: 'saida_producao', descricao: item.produto_nome,
        largura: item.largura, altura: item.altura, quantidade: item.quantidade,
        nc_id: null, obs: null,
      });
      if (!r.ok && !r.jaExistia) console.error('avancarStatusPedido saida vidro cliente:', r.motivo);
    }
  }

  // Gera o romaneio em PDF pra rota pública do QR da etiqueta (status já é o gatilho
  // que o QR usa para decidir produção vs romaneio — ver app/api/r/[token]/route.ts)
  if (res && novoStatus === 'Entregue') {
    fetch(`/api/pedidos/${id}/gerar-romaneio`, { method: 'POST' })
      .catch(err => console.warn('gerar-romaneio:', err));
  }

  return res;
}

export async function retrocederStatusPedido(id: string, statusAtual: StatusPedido) {
  const idx = FLUXO.indexOf(statusAtual);
  if (idx <= 0) return null;
  const novoStatus = FLUXO[idx - 1];

  const { data: cur } = await supabase.from('pedidos').select('status_history').eq('id', id).single();
  const historico = (cur?.status_history as { status: StatusPedido; desde: string }[] | null) ?? [];
  const novoHistorico = historico.slice(0, -1);

  const res = await updatePedido(id, { status: novoStatus, status_history: novoHistorico as any });
  if (res) {
    registrarLog({
      acao: "retrocedeu", tabela: "pedidos", registro_id: id,
      descricao: `Retrocedeu status do pedido ${id}: ${statusAtual} → ${novoStatus}`,
      campos_alterados: { status: { de: statusAtual, para: novoStatus } },
    });
    await reconciliarProgramacaoComPedido(id, novoStatus);
  }
  return res;
}

// Cascata inteira roda numa função Postgres só (delete_pedido_cascade,
// sql/seguranca-02-deletar-pedido-atomico.sql) — uma transação atômica em
// vez de 12+ chamadas sequenciais do client. Preserva soft-delete de
// lançamentos já baixados (mesma regra de excluirLancamento).
export async function deletarPedido(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase.rpc('delete_pedido_cascade', { p_pedido_id: pedidoId } as never);
  if (error) {
    console.error('deletarPedido:', error);
    return { ok: false, erro: error.message };
  }

  registrarLog({ acao: "excluiu", tabela: "pedidos", registro_id: pedidoId, descricao: `Excluiu pedido ${pedidoId}` });
  return { ok: true };
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

  const aberto    = valorComIpi(pedido) - Number(pedido.valor_recebido);
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

  const aberto        = valorComIpi(pedido) - Number(pedido.valor_recebido);
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

// ─── Storage: romaneio(s) assinado(s) pelo cliente/motorista ─────────
// Um pedido pode ter mais de um romaneio assinado quando é retirado em
// várias viagens — por isso aceita múltiplos arquivos por upload.
const BUCKET_ROMANEIO_ASSINADO = 'romaneios-assinados';

export async function uploadRomaneioAssinado(pedidoId: string, files: File[]): Promise<{ urls: string[]; erro?: string }> {
  const urls: string[] = [];
  for (const file of files) {
    const ext  = file.name.split('.').pop() ?? 'pdf';
    const path = `${pedidoId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_ROMANEIO_ASSINADO).upload(path, file, { upsert: false });
    if (error) { console.error('uploadRomaneioAssinado:', error); return { urls, erro: error.message }; }
    const { data } = supabase.storage.from(BUCKET_ROMANEIO_ASSINADO).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  if (urls.length > 0) {
    registrarLog({ acao: "anexou", tabela: "pedidos", registro_id: pedidoId, descricao: `Anexou ${urls.length} romaneio(s) assinado(s) em ${pedidoId}` });
  }
  return { urls };
}

export async function deleteRomaneioAssinado(url: string): Promise<boolean> {
  const marker = `/${BUCKET_ROMANEIO_ASSINADO}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return false;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET_ROMANEIO_ASSINADO).remove([path]);
  if (error) { console.error('deleteRomaneioAssinado:', error); return false; }
  return true;
}

// ─── Storage: NF-e ────────────────────────────────────────────────────
const BUCKET_NFE = 'nfe-pedidos';

export async function uploadNfe(pedidoId: string, files: File[]): Promise<{ urls: string[]; erro?: string }> {
  const urls: string[] = [];
  for (const file of files) {
    const ext  = file.name.split('.').pop() ?? 'pdf';
    const path = `${pedidoId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_NFE).upload(path, file, { upsert: false });
    if (error) { console.error('uploadNfe:', error); return { urls, erro: error.message }; }
    const { data } = supabase.storage.from(BUCKET_NFE).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  if (urls.length > 0) {
    registrarLog({ acao: "anexou", tabela: "pedidos", registro_id: pedidoId, descricao: `Anexou ${urls.length} NF-e em ${pedidoId}` });
  }
  return { urls };
}

export async function deleteNfe(url: string): Promise<boolean> {
  const marker = `/${BUCKET_NFE}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return false;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET_NFE).remove([path]);
  if (error) { console.error('deleteNfe:', error); return false; }
  return true;
}

// ─── Storage: Boleto ──────────────────────────────────────────────────
const BUCKET_BOLETO = 'boletos-pedidos';

export async function uploadBoleto(pedidoId: string, files: File[]): Promise<{ urls: string[]; erro?: string }> {
  const urls: string[] = [];
  for (const file of files) {
    const ext  = file.name.split('.').pop() ?? 'pdf';
    const path = `${pedidoId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_BOLETO).upload(path, file, { upsert: false });
    if (error) { console.error('uploadBoleto:', error); return { urls, erro: error.message }; }
    const { data } = supabase.storage.from(BUCKET_BOLETO).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  if (urls.length > 0) {
    registrarLog({ acao: "anexou", tabela: "pedidos", registro_id: pedidoId, descricao: `Anexou ${urls.length} boleto(s) em ${pedidoId}` });
  }
  return { urls };
}

export async function deleteBoleto(url: string): Promise<boolean> {
  const marker = `/${BUCKET_BOLETO}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return false;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET_BOLETO).remove([path]);
  if (error) { console.error('deleteBoleto:', error); return false; }
  return true;
}

// ─── Storage: Comprovante de pagamento ─────────────────────────────────
const BUCKET_COMPROVANTE_PAGAMENTO = 'comprovantes-pagamento-pedidos';

export async function uploadComprovantePagamento(pedidoId: string, files: File[]): Promise<{ urls: string[]; erro?: string }> {
  const urls: string[] = [];
  for (const file of files) {
    const ext  = file.name.split('.').pop() ?? 'pdf';
    const path = `${pedidoId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_COMPROVANTE_PAGAMENTO).upload(path, file, { upsert: false });
    if (error) { console.error('uploadComprovantePagamento:', error); return { urls, erro: error.message }; }
    const { data } = supabase.storage.from(BUCKET_COMPROVANTE_PAGAMENTO).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  if (urls.length > 0) {
    registrarLog({ acao: "anexou", tabela: "pedidos", registro_id: pedidoId, descricao: `Anexou ${urls.length} comprovante(s) de pagamento em ${pedidoId}` });
  }
  return { urls };
}

export async function deleteComprovantePagamento(url: string): Promise<boolean> {
  const marker = `/${BUCKET_COMPROVANTE_PAGAMENTO}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return false;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET_COMPROVANTE_PAGAMENTO).remove([path]);
  if (error) { console.error('deleteComprovantePagamento:', error); return false; }
  return true;
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