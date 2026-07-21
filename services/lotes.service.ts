import { supabase } from '@/lib/supabase/client';
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
