// PEPS (FIFO) — método de custeio DEFINITIVO pra lotes de vidro, confirmado
// pelo contador em 2026-07-22 (substitui a média ponderada provisória usada
// antes). Consome os lotes ativos de um produto em ordem de dt_entrada
// ascendente (mais antigo primeiro) até completar a quantidade pedida;
// se a quantidade ultrapassar o saldo do lote mais antigo, o restante sai
// do próximo, numa média ponderada só entre os lotes efetivamente tocados.
//
// RESSALVA (mantida também no README de sql/MANIFEST.md e na UI de
// margem/CMV): os 5 lotes migrados de `estoque` têm dt_entrada_estimada=true
// (aproximada a partir de estoque.updated_at, não uma data real de entrada).
// PEPS entre ESSES lotes não tem uma ordem confiável — só é totalmente
// confiável quando todos os lotes tocados têm dt_entrada_estimada=false
// (nota fiscal real). `envolveDataEstimada` no retorno sinaliza isso pro
// chamador exibir o aviso.
//
// Função isolada de propósito: qualquer lugar que precisar de custo/m² de
// um produto chama esta (ou o wrapper async em services/lotes.service.ts),
// nunca reimplementa a fila inline.

export interface LoteParaCustoPeps {
  custo_m2: number | null;
  m2_saldo: number;
  dt_entrada: string;
  dt_entrada_estimada: boolean;
}

export interface ResultadoCustoPeps {
  /** `null` = custo indisponível — não confundir com "custo zero". */
  custoM2: number | null;
  /** true = pelo menos 1 lote consumido pra chegar em `m2Consumido` tem data estimada. */
  envolveDataEstimada: boolean;
}

const INDISPONIVEL: ResultadoCustoPeps = { custoM2: null, envolveDataEstimada: false };

/**
 * Custo PEPS de consumir `m2Consumido` m² de um produto, dado o conjunto de
 * lotes ativos com saldo > 0. Só considera indisponível (retorna null) um
 * lote SEM custo_m2 definido que a fila realmente precisou tocar pra
 * completar a quantidade — um lote mais novo, ainda fora da fila, não
 * bloqueia o custeio dos lotes mais antigos que já bastam.
 */
export function custoPeps(lotes: LoteParaCustoPeps[], m2Consumido: number): ResultadoCustoPeps {
  if (lotes.length === 0 || m2Consumido <= 0) return INDISPONIVEL;

  const ordenados = lotes
    .filter(l => l.m2_saldo > 0)
    .sort((a, b) => a.dt_entrada.localeCompare(b.dt_entrada));

  let restante = m2Consumido;
  let somaCusto = 0;
  let somaM2 = 0;
  let envolveDataEstimada = false;

  for (const lote of ordenados) {
    if (restante <= 0) break;
    if (lote.custo_m2 == null) return INDISPONIVEL;

    const consumidoDoLote = Math.min(lote.m2_saldo, restante);
    somaCusto += lote.custo_m2 * consumidoDoLote;
    somaM2 += consumidoDoLote;
    if (lote.dt_entrada_estimada) envolveDataEstimada = true;
    restante -= consumidoDoLote;
  }

  if (somaM2 <= 0) return INDISPONIVEL;
  return { custoM2: parseFloat((somaCusto / somaM2).toFixed(4)), envolveDataEstimada };
}
