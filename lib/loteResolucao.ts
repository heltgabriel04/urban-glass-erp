import type { LoteEstoque } from "@/types";

export interface DimensaoChapa { w: number; h: number }
export interface PecaComProduto { prod: string; produtoId?: number | null }

export interface ResolucaoLotes {
  /** nome do produto → dimensão da chapa a usar no empacotamento */
  dimensaoPorProduto: Map<string, DimensaoChapa>;
  /** nome do produto → id do lote efetivamente escolhido/usado */
  loteUsadoPorProduto: Map<string, number>;
  /** nome do produto → quantidade de peças que ficaram de fora (sem lote utilizável) */
  pecasExcluidas: Map<string, number>;
}

/**
 * Resolve qual lote (e portanto qual dimensão de chapa) usar pra cada
 * produto presente no lote de peças. Regra (2026-07-21): produto sem
 * nenhum lote ativo+dimensao_confirmada+saldo>0 fica de fora do plano —
 * sem fallback, sem dimensão default. Produto com 1 lote utilizável usa
 * ele automaticamente; com 2+, precisa de escolha explícita do operador
 * (loteEscolhido) — sem escolha, também fica de fora até escolher.
 */
export function resolverDimensaoPorProduto(
  pecas: PecaComProduto[],
  lotesPorProduto: Map<number, LoteEstoque[]>,
  loteEscolhido: Map<number, number>,
): ResolucaoLotes {
  const dimensaoPorProduto = new Map<string, DimensaoChapa>();
  const loteUsadoPorProduto = new Map<string, number>();
  const pecasExcluidas = new Map<string, number>();

  const produtoIdPorNome = new Map<string, number | null | undefined>();
  pecas.forEach(p => { if (!produtoIdPorNome.has(p.prod)) produtoIdPorNome.set(p.prod, p.produtoId); });

  produtoIdPorNome.forEach((produtoId, nome) => {
    if (!produtoId) return;
    const lotes = lotesPorProduto.get(produtoId) ?? [];
    const lote = lotes.length === 1 ? lotes[0] : lotes.find(l => l.id === loteEscolhido.get(produtoId));
    if (lote?.chapa_largura_mm && lote?.chapa_altura_mm) {
      dimensaoPorProduto.set(nome, { w: lote.chapa_largura_mm, h: lote.chapa_altura_mm });
      loteUsadoPorProduto.set(nome, lote.id);
    }
  });

  pecas.forEach(p => {
    if (!dimensaoPorProduto.has(p.prod)) {
      pecasExcluidas.set(p.prod, (pecasExcluidas.get(p.prod) ?? 0) + 1);
    }
  });

  return { dimensaoPorProduto, loteUsadoPorProduto, pecasExcluidas };
}
