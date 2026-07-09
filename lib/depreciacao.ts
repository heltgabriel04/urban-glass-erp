import type { AtivoImobilizado } from "@/types";

export interface DepreciacaoCalculada {
  depreciacaoMensal: number;
  mesesDecorridos: number;
  depreciacaoAcumulada: number;
  valorContabilAtual: number;
  totalmenteDepreciado: boolean;
}

type CamposDepreciaveis = Pick<AtivoImobilizado, "valor_aquisicao" | "valor_residual" | "vida_util_meses" | "data_aquisicao">;

/**
 * Depreciação linear simples: (valor de aquisição − valor residual) /
 * vida útil em meses, acumulada = meses decorridos × depreciação mensal,
 * capada no valor depreciável total. Puramente calculada — nunca
 * armazenada, porque depende da data de hoje.
 */
export function calcularDepreciacao(ativo: CamposDepreciaveis, dataReferencia = new Date()): DepreciacaoCalculada {
  const valorDepreciavel = Math.max(0, Number(ativo.valor_aquisicao) - Number(ativo.valor_residual));
  const vidaUtil = Math.max(1, Number(ativo.vida_util_meses));
  const depreciacaoMensal = parseFloat((valorDepreciavel / vidaUtil).toFixed(2));

  const dataAquisicao = new Date(ativo.data_aquisicao);
  const mesesBrutos =
    (dataReferencia.getFullYear() - dataAquisicao.getFullYear()) * 12 +
    (dataReferencia.getMonth() - dataAquisicao.getMonth());
  const mesesDecorridos = Math.min(vidaUtil, Math.max(0, mesesBrutos));

  const depreciacaoAcumulada = Math.min(valorDepreciavel, parseFloat((depreciacaoMensal * mesesDecorridos).toFixed(2)));
  const valorContabilAtual = parseFloat((Number(ativo.valor_aquisicao) - depreciacaoAcumulada).toFixed(2));

  return {
    depreciacaoMensal,
    mesesDecorridos,
    depreciacaoAcumulada,
    valorContabilAtual,
    totalmenteDepreciado: mesesDecorridos >= vidaUtil,
  };
}
