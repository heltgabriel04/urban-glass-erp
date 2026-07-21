// Custo médio ponderado por saldo entre os lotes ativos de um produto —
// método PROVISÓRIO (decisão do usuário, 2026-07-21), não é a apuração
// fiscal definitiva (PEPS vs médio ponderado segue em aberto com o
// contador). Médio ponderado escolhido agora porque PEPS exigiria confiar
// em dt_entrada, e vários lotes migrados têm dt_entrada_estimada=true
// (aproximada a partir de estoque.updated_at, não uma data real) — rodar
// PEPS sobre data estimada fingiria uma precisão que não existe.
//
// Função isolada de propósito: qualquer lugar que precisar de custo/m² de
// um produto chama esta (ou o wrapper async em services/lotes.service.ts),
// nunca reimplementa a média inline — trocar pra PEPS depois vira 1 ponto
// de mudança, não uma caça ao tesouro pelo código.

export interface LoteParaCusto {
  custo_m2: number | null;
  m2_saldo: number;
}

/**
 * `null` = custo indisponível pra esse produto — não confundir com "custo
 * zero". Dispara quando: não há nenhum lote no conjunto (nada a calcular),
 * OU qualquer lote do conjunto tem custo_m2 null (decisão contábil ainda
 * pendente pra aquele lote especificamente — tratar como 0 sub-declararia
 * o custo real do produto inteiro; ignorar o lote silenciosamente
 * sub-declararia a base de saldo).
 */
export function mediaPonderadaCusto(lotes: LoteParaCusto[]): number | null {
  if (lotes.length === 0) return null;
  if (lotes.some(l => l.custo_m2 == null)) return null;

  const somaM2 = lotes.reduce((s, l) => s + l.m2_saldo, 0);
  if (somaM2 <= 0) return null;

  const somaCusto = lotes.reduce((s, l) => s + (l.custo_m2 as number) * l.m2_saldo, 0);
  return parseFloat((somaCusto / somaM2).toFixed(4));
}
