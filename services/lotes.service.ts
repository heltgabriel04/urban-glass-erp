import { supabase } from '@/lib/supabase/client';
import { custoPeps, type LoteParaCustoPeps, type ResultadoCustoPeps } from '@/lib/custoLote';
import type { LoteEstoque } from '@/types';

// Único critério de "utilizável pelo otimizador/produção": ativo, com
// dimensão confirmada (nunca inventada) e saldo físico > 0. Lote com
// dimensao_confirmada=false nunca aparece aqui — é excluído por completo,
// não travado com erro nem coberto por um default (decisão do usuário,
// 2026-07-21: dado incerto não pode virar plano de corte).
export async function getLotesUtilizaveis(produtoId?: number): Promise<LoteEstoque[]> {
  let query = supabase
    .from('lotes_estoque')
    .select('*')
    .eq('ativo', true)
    .eq('dimensao_confirmada', true)
    .gt('chapas_saldo', 0)
    .order('dt_entrada', { ascending: true }); // mais antigo primeiro (base pra PEPS futuro)

  if (produtoId !== undefined) query = query.eq('produto_id', produtoId);

  const { data, error } = await query;
  if (error) { console.error('getLotesUtilizaveis:', error); return []; }
  return data as LoteEstoque[];
}

export interface ResumoDimensaoPendente {
  totalChapas: number;
  totalM2: number;
  produtos: { produtoId: number; nome: string; chapas: number; m2: number }[];
}

// Alimenta o indicador "X chapas com dimensão pendente" no Otimizador e no
// Estoque — saldo físico real que existe no banco mas que o sistema não
// consegue usar em plano de corte nenhum até alguém confirmar a dimensão.
export async function getResumoDimensaoPendente(): Promise<ResumoDimensaoPendente> {
  const { data, error } = await supabase
    .from('lotes_estoque')
    .select('produto_id, chapas_saldo, m2_saldo, produtos(nome)')
    .eq('ativo', true)
    .eq('dimensao_confirmada', false)
    .gt('chapas_saldo', 0);
  if (error) { console.error('getResumoDimensaoPendente:', error); return { totalChapas: 0, totalM2: 0, produtos: [] }; }

  const porProduto = new Map<number, { produtoId: number; nome: string; chapas: number; m2: number }>();
  (data as unknown as { produto_id: number; chapas_saldo: number; m2_saldo: number; produtos: { nome: string } | null }[]).forEach(r => {
    const atual = porProduto.get(r.produto_id) ?? { produtoId: r.produto_id, nome: r.produtos?.nome ?? '—', chapas: 0, m2: 0 };
    atual.chapas += r.chapas_saldo;
    atual.m2 += Number(r.m2_saldo);
    porProduto.set(r.produto_id, atual);
  });

  const produtos = Array.from(porProduto.values()).sort((a, b) => b.chapas - a.chapas);
  return {
    totalChapas: produtos.reduce((s, p) => s + p.chapas, 0),
    totalM2: produtos.reduce((s, p) => s + p.m2, 0),
    produtos,
  };
}

// ─── SALDO AGREGADO POR PRODUTO ──────────────────────────────
//
// Soma chapas_saldo/m2_saldo de todos os lotes ATIVOS de cada produto —
// substitui a leitura direta de `estoque` (1 linha por produto, sem
// conceito de lote) em telas que só precisam do total, não de dimensão
// nem custo por lote. Inclui lotes com dimensao_confirmada=false (saldo
// físico real existe mesmo sem dimensão confirmada — só não é utilizável
// pelo otimizador, ver getLotesUtilizaveis).

export interface SaldoProduto {
  produtoId: number;
  nome: string;
  chapasSaldo: number;
  m2Saldo: number;
}

export async function getSaldoPorProduto(): Promise<SaldoProduto[]> {
  const { data, error } = await supabase
    .from('lotes_estoque')
    .select('produto_id, chapas_saldo, m2_saldo, produtos(nome)')
    .eq('ativo', true);
  if (error) { console.error('getSaldoPorProduto:', error); return []; }

  const porProduto = new Map<number, SaldoProduto>();
  (data as unknown as { produto_id: number; chapas_saldo: number; m2_saldo: number; produtos: { nome: string } | null }[]).forEach(l => {
    const atual = porProduto.get(l.produto_id) ?? { produtoId: l.produto_id, nome: l.produtos?.nome ?? '—', chapasSaldo: 0, m2Saldo: 0 };
    atual.chapasSaldo += l.chapas_saldo;
    atual.m2Saldo += Number(l.m2_saldo);
    porProduto.set(l.produto_id, atual);
  });
  return Array.from(porProduto.values());
}

// ─── CUSTO PEPS (definitivo, ver lib/custoLote.ts) ───────────
//
// Única porta de entrada pra custo/m² de um produto — qualquer service que
// precisar desse número chama uma destas, nunca lê lotes_estoque.custo_m2
// direto e faz a conta na mão.

// Busca única dos lotes ativos com saldo de 1 ou mais produtos, já ordenados
// por dt_entrada asc (base do PEPS). Sem `produtoIds`, traz todos — usado
// quando o chamador precisa do custo de vários produtos de uma vez (ex.:
// margem.service.ts) e prefere resolver o PEPS de cada item em memória a
// fazer 1 query por item.
export async function getLotesParaCustoPorProduto(produtoIds?: number[]): Promise<Map<number, LoteParaCustoPeps[]>> {
  let query = supabase
    .from('lotes_estoque')
    .select('produto_id, custo_m2, m2_saldo, dt_entrada, dt_entrada_estimada')
    .eq('ativo', true)
    .gt('m2_saldo', 0)
    .order('dt_entrada', { ascending: true });
  if (produtoIds && produtoIds.length > 0) query = query.in('produto_id', produtoIds);

  const { data, error } = await query;
  if (error) { console.error('getLotesParaCustoPorProduto:', error); return new Map(); }

  const porProduto = new Map<number, LoteParaCustoPeps[]>();
  (data as unknown as { produto_id: number; custo_m2: number | null; m2_saldo: number; dt_entrada: string; dt_entrada_estimada: boolean }[]).forEach(l => {
    const arr = porProduto.get(l.produto_id) ?? [];
    arr.push({ custo_m2: l.custo_m2, m2_saldo: Number(l.m2_saldo), dt_entrada: l.dt_entrada, dt_entrada_estimada: l.dt_entrada_estimada });
    porProduto.set(l.produto_id, arr);
  });
  return porProduto;
}

// Custo PEPS de consumir `m2Consumido` m² de 1 produto — busca os lotes e
// delega pra custoPeps(). Prefira getLotesParaCustoPorProduto() + custoPeps()
// direto quando precisar do custo de vários itens do mesmo produto (evita
// refazer a mesma query).
export async function calcularCustoPepsProduto(produtoId: number, m2Consumido: number): Promise<ResultadoCustoPeps> {
  const lotesPorProduto = await getLotesParaCustoPorProduto([produtoId]);
  return custoPeps(lotesPorProduto.get(produtoId) ?? [], m2Consumido);
}

// ─── LISTA DE CAIXAS (Estoque > Caixas) ──────────────────────
//
// Diferente de getLotesUtilizaveis (que só traz ativo+dimensão
// confirmada+saldo>0, pro Otimizador/venda direta), esta traz TODAS as
// linhas — inclusive esgotadas e com dimensão pendente — pra tela de
// gestão de caixas poder mostrar/filtrar por qualquer status.
export async function getTodasCaixas(): Promise<LoteEstoque[]> {
  const { data, error } = await supabase
    .from('lotes_estoque')
    .select('*, produtos(nome)')
    .order('produto_id', { ascending: true })
    .order('dt_entrada', { ascending: true });
  if (error) { console.error('getTodasCaixas:', error); return []; }
  return data as LoteEstoque[];
}
