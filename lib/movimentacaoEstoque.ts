// Matemática de uma movimentação de estoque (saldo + custo médio ponderado),
// extraída pra ser compartilhada entre os dois destinos possíveis de
// services/estoqueMovimentacoes.service.ts: o agregado por produto em
// `estoque` (comportamento original) e um lote específico em `lotes_estoque`
// (2026-07-21, baixa de produção via Otimizador). Mesma fórmula, dois alvos —
// extrair evita a mesma divergência que já aconteceu 3x com "isChapaInteira".

export interface SaldoAtual {
  chapasSaldo: number;
  m2Saldo: number;
  /** null só é possível pra lote (lotes_estoque.custo_m2 pode ser
   *  indefinido) — o agregado `estoque` sempre manda 0, nunca null, pra
   *  preservar o comportamento original byte a byte. */
  custoM2: number | null;
}

export interface DadosMovimentacao {
  tipo: string;
  /** Positivo = entrada, negativo = saída. */
  chapas: number;
  /** Positivo = entrada, negativo = saída. */
  m2: number;
  custoUnitarioM2?: number | null;
}

export interface ResultadoCalculoMovimentacao {
  novoSaldoChapas: number;
  novoSaldoM2: number;
  /** Custo a gravar na linha de estoque_movimentacoes desta baixa específica. */
  custoEfetivo: number | null;
  /** Novo custo médio ponderado do saldo (agregado ou lote, conforme o chamador). */
  novoCustoM2: number | null;
}

export type CalculoMovimentacaoResultado =
  | { ok: true; resultado: ResultadoCalculoMovimentacao }
  | { ok: false; motivo: string };

/**
 * Calcula o novo saldo/custo após uma movimentação, sem tocar em banco.
 * Bloqueia saída que levaria saldo (chapas ou m²) a negativo. Custo médio
 * só recalcula em entrada com custo informado; 'ajuste' substitui direto
 * (correção manual, não é compra real, não faz sentido diluir na média).
 * `custoM2` do saldo atual pode vir `null` (lote sem custo ainda definido)
 * — nesse caso o resultado também fica `null` até uma entrada com custo
 * definir um valor (nunca inventa 0).
 */
export function calcularMovimentacao(
  atual: SaldoAtual,
  mov: DadosMovimentacao,
): CalculoMovimentacaoResultado {
  if (mov.chapas < 0 && atual.chapasSaldo + mov.chapas < 0) {
    return { ok: false, motivo: `Saldo insuficiente: ${atual.chapasSaldo} chapas disponíveis, tentativa de saída de ${Math.abs(mov.chapas)}` };
  }
  if (mov.m2 < 0 && atual.m2Saldo + mov.m2 < -0.001) {
    return { ok: false, motivo: `Saldo insuficiente: ${atual.m2Saldo} m² disponíveis, tentativa de saída de ${Math.abs(mov.m2).toFixed(4)} m²` };
  }

  const novoSaldoChapas = atual.chapasSaldo + mov.chapas;
  const novoSaldoM2 = parseFloat((atual.m2Saldo + mov.m2).toFixed(4));

  // Custo histórico desta movimentação: em saída, se não informado, é o
  // custo médio vigente agora (vira o registro do CMV daquela baixa) — pode
  // sair null se o saldo atual não tinha custo definido.
  const custoEfetivo = mov.custoUnitarioM2 ?? (mov.m2 < 0 ? atual.custoM2 : null);

  let novoCustoM2 = atual.custoM2;
  if (mov.tipo === 'ajuste' && mov.custoUnitarioM2 != null) {
    novoCustoM2 = mov.custoUnitarioM2;
  } else if (mov.m2 > 0 && mov.custoUnitarioM2 != null) {
    novoCustoM2 = (atual.custoM2 != null && atual.m2Saldo + mov.m2 > 0)
      ? parseFloat((((atual.m2Saldo * atual.custoM2) + (mov.m2 * mov.custoUnitarioM2)) / (atual.m2Saldo + mov.m2)).toFixed(4))
      : mov.custoUnitarioM2; // sem custo anterior pra diluir (era null, ou saldo zerado) — o informado passa a valer direto
  }

  return { ok: true, resultado: { novoSaldoChapas, novoSaldoM2, custoEfetivo, novoCustoM2 } };
}
