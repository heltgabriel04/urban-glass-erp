import { supabase } from '@/lib/supabase/client';
import type { PedidoPeca, StatusPedidoPeca, ItemPedido } from '@/types';
import { isPedidoSomenteChapas, atualizarStatusProgramacao, toISOLocal } from './programacao.service';

// ─── CASAMENTO PEÇA ↔ ITEM (função pura, testável) ──────────
//
// O motor do otimizador não carrega item_pedido_id nas peças posicionadas
// (chapas_json.placed só tem largura/altura/produto) — mesma limitação que
// app/pedidos/[id]/etiquetas/page.tsx já contorna pra casar codigo_adicional.
// Aqui usamos a mesma técnica: fila por dimensão (largura×altura, em
// qualquer ordem por causa de rotação), consumida na ordem em que as peças
// aparecem no plano de corte. Peças de itens com a mesma dimensão são
// fisicamente intercambiáveis pra fins de produção, então a atribuição
// gulosa é consistente com a granularidade real de programacao_producao
// (uma linha por item, não por peça individual).
export interface PecaCasada {
  ordem: number;
  chapaNum: number;
  largura: number;
  altura: number;
  itemPedidoId: number | null;
}

export function casarPecasComItens(
  chapas: { placed: { l: number; a: number }[] }[],
  itens: Pick<ItemPedido, 'id' | 'largura' | 'altura' | 'quantidade'>[],
): PecaCasada[] {
  const fila = new Map<string, { id: number; restante: number }[]>();
  itens.forEach(item => {
    const key = [item.largura, item.altura].sort((a, b) => a - b).join('x');
    const lista = fila.get(key) ?? [];
    lista.push({ id: item.id, restante: item.quantidade });
    fila.set(key, lista);
  });

  function buscar(l: number, a: number): number | null {
    const key = [l, a].sort((x, y) => x - y).join('x');
    const lista = fila.get(key);
    if (!lista || lista.length === 0) return null;
    const entry = lista[0];
    entry.restante--;
    if (entry.restante <= 0) lista.shift();
    return entry.id;
  }

  const out: PecaCasada[] = [];
  let ordem = 0;
  chapas.forEach((chapa, ci) => {
    chapa.placed.forEach(peca => {
      out.push({
        ordem: ordem++,
        chapaNum: ci + 1,
        largura: peca.l,
        altura: peca.a,
        itemPedidoId: buscar(peca.l, peca.a),
      });
    });
  });
  return out;
}

// Próxima ação esperada pra uma peça, dado seu status atual. `null` = já
// concluída (separada). Itens sem lapidação pulam direto de 'pendente' pra
// 'lapidada' no momento da confirmação de corte (ver confirmarProximaEtapaPeca),
// então esta função não precisa saber de precisa_lapidacao.
export function proximaAcaoPeca(peca: Pick<PedidoPeca, 'status'>): 'corte' | 'lapidacao' | 'separacao' | null {
  if (peca.status === 'pendente') return 'corte';
  if (peca.status === 'cortada') return 'lapidacao';
  if (peca.status === 'lapidada') return 'separacao';
  return null;
}

// ─── GERAÇÃO DAS PEÇAS (a partir do plano de corte salvo) ───

export async function gerarPecasDoPedido(pedidoId: string): Promise<{ ok: boolean; criado?: number; erro?: string }> {
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, itens_pedido(id, largura, altura, quantidade, lapidacao)')
    .eq('id', pedidoId)
    .maybeSingle();
  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' };

  const itens = (pedido as unknown as { itens_pedido: (Pick<ItemPedido, 'id' | 'largura' | 'altura' | 'quantidade' | 'lapidacao'>)[] }).itens_pedido ?? [];
  if (isPedidoSomenteChapas({ itens_pedido: itens })) {
    return { ok: false, erro: 'Pedido de chapa inteira não usa rastreamento por peça.' };
  }

  const { data: otims } = await supabase
    .from('historico_otimizador')
    .select('chapas_json')
    .eq('pedido_id', pedidoId)
    .order('dt_otim', { ascending: false })
    .limit(1);
  const chapas = otims?.[0]?.chapas_json as { placed: { l: number; a: number }[] }[] | undefined;
  if (!chapas || chapas.length === 0) return { ok: false, erro: 'Nenhum plano de corte encontrado para este pedido.' };

  // Segurança: nunca regenerar por cima de peças já em produção física — só
  // reescreve o plano se todas as peças existentes ainda estiverem 'pendente'
  // (reotimização feita antes de qualquer corte real começar).
  const { count: progredidas } = await supabase
    .from('pedido_pecas')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', pedidoId)
    .neq('status', 'pendente');
  if ((progredidas ?? 0) > 0) {
    return { ok: false, erro: 'Já existem peças em produção para este pedido — plano de peças não foi regenerado.' };
  }

  await supabase.from('pedido_pecas').delete().eq('pedido_id', pedidoId).eq('status', 'pendente');

  const lapidacaoPorItem = new Map<number, boolean>();
  itens.forEach(i => lapidacaoPorItem.set(i.id, i.lapidacao > 0));

  const casadas = casarPecasComItens(chapas, itens);
  if (casadas.length === 0) return { ok: false, erro: 'Plano de corte sem peças.' };

  const rows = casadas.map(p => ({
    pedido_id: pedidoId,
    item_pedido_id: p.itemPedidoId,
    ordem: p.ordem,
    chapa_num: p.chapaNum,
    largura: p.largura,
    altura: p.altura,
    precisa_lapidacao: p.itemPedidoId ? (lapidacaoPorItem.get(p.itemPedidoId) ?? true) : true,
  }));

  const { error } = await supabase.from('pedido_pecas').insert(rows);
  if (error) return { ok: false, erro: error.message };
  return { ok: true, criado: rows.length };
}

// ─── LEITURA (tela de scan) ──────────────────────────────────

export async function getPecaPorToken(token: string): Promise<PedidoPeca | null> {
  const { data } = await supabase
    .from('pedido_pecas')
    .select('*, pedidos(id, clientes(nome)), itens_pedido(produto_nome)')
    .eq('qr_token', token)
    .maybeSingle();
  return data as PedidoPeca | null;
}

export async function getPecasDoPedido(pedidoId: string): Promise<PedidoPeca[]> {
  const { data } = await supabase
    .from('pedido_pecas')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('ordem', { ascending: true });
  return (data ?? []) as PedidoPeca[];
}

// ─── CONFIRMAÇÃO DE ETAPA (o coração do scan) ───────────────
//
// Fecha programacao_producao pelo evento real de peça, não pelo avanço
// administrativo de status do pedido — resolve pela raiz o bug descrito em
// docs/superpowers/specs/2026-07-20-fechamento-lote-producao-design.md
// (sub-projeto #1 só sinalizava o carimbo em lote, não impedia).

async function avancarBlocoPorItem(itemPedidoId: number, etapa: 'Corte' | 'Lapidação', agora: Date, ultimaPeca: boolean): Promise<void> {
  const { data: bloco } = await supabase
    .from('programacao_producao')
    .select('id, status')
    .eq('item_pedido_id', itemPedidoId)
    .eq('etapa', etapa)
    .neq('status', 'Cancelado')
    .maybeSingle();
  if (!bloco) return;
  if (bloco.status === 'Agendado') await atualizarStatusProgramacao(bloco.id, 'Em Execução', agora);
  if (ultimaPeca) await atualizarStatusProgramacao(bloco.id, 'Concluído', agora);
}

async function avancarBlocoSeparacaoPorPedido(pedidoId: string, agora: Date, ultimaPeca: boolean): Promise<void> {
  const { data: bloco } = await supabase
    .from('programacao_producao')
    .select('id, status')
    .eq('pedido_id', pedidoId)
    .eq('etapa', 'Separação')
    .neq('status', 'Cancelado')
    .maybeSingle();
  if (!bloco) return;
  if (bloco.status === 'Agendado') await atualizarStatusProgramacao(bloco.id, 'Em Execução', agora);
  if (ultimaPeca) await atualizarStatusProgramacao(bloco.id, 'Concluído', agora);
}

export async function confirmarProximaEtapaPeca(token: string): Promise<{ ok: boolean; novoStatus?: StatusPedidoPeca; erro?: string }> {
  const { data: peca } = await supabase.from('pedido_pecas').select('*').eq('qr_token', token).maybeSingle();
  if (!peca) return { ok: false, erro: 'Peça não encontrada.' };

  const acao = proximaAcaoPeca(peca as PedidoPeca);
  if (!acao) return { ok: false, erro: 'Peça já concluída.' };

  const agora = new Date();
  const agoraIso = toISOLocal(agora);
  const updates: Partial<PedidoPeca> = {};
  let fechaCorte = false;
  let fechaLapidacao = false;
  let fechaSeparacao = false;

  if (acao === 'corte') {
    updates.dt_corte_real = agoraIso;
    fechaCorte = true;
    if (peca.precisa_lapidacao) {
      updates.status = 'cortada';
    } else {
      updates.status = 'lapidada';
      updates.dt_lapidacao_real = agoraIso;
      fechaLapidacao = true;
    }
  } else if (acao === 'lapidacao') {
    updates.status = 'lapidada';
    updates.dt_lapidacao_real = agoraIso;
    fechaLapidacao = true;
  } else {
    updates.status = 'separada';
    updates.dt_separacao_real = agoraIso;
    fechaSeparacao = true;
  }

  const { error } = await supabase.from('pedido_pecas').update(updates).eq('id', peca.id);
  if (error) return { ok: false, erro: error.message };

  if (peca.item_pedido_id && fechaCorte) {
    const { count } = await supabase.from('pedido_pecas').select('id', { count: 'exact', head: true })
      .eq('item_pedido_id', peca.item_pedido_id).is('dt_corte_real', null);
    await avancarBlocoPorItem(peca.item_pedido_id, 'Corte', agora, (count ?? 0) === 0);
  }
  if (peca.item_pedido_id && fechaLapidacao) {
    const { count } = await supabase.from('pedido_pecas').select('id', { count: 'exact', head: true })
      .eq('item_pedido_id', peca.item_pedido_id).eq('precisa_lapidacao', true).is('dt_lapidacao_real', null);
    await avancarBlocoPorItem(peca.item_pedido_id, 'Lapidação', agora, (count ?? 0) === 0);
  }
  if (fechaSeparacao) {
    const { count } = await supabase.from('pedido_pecas').select('id', { count: 'exact', head: true })
      .eq('pedido_id', peca.pedido_id).is('dt_separacao_real', null);
    await avancarBlocoSeparacaoPorPedido(peca.pedido_id, agora, (count ?? 0) === 0);
  }

  return { ok: true, novoStatus: updates.status };
}
