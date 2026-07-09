// Filtro global do dashboard financeiro (Etapa 5) — período e conta
// bancária compartilhados entre os 4 níveis (Executiva, Operacional,
// Analítica, Estratégica). Vive na URL pra ser voltável e
// compartilhável, não em estado local de componente.

export type PeriodoFiltro = "mes" | "ano" | "ano-anterior";

export interface FiltroFinanceiroGlobal {
  periodo: PeriodoFiltro;
  contaId: number | null;
}

export const PERIODO_LABEL: Record<PeriodoFiltro, string> = {
  mes: "Mês atual",
  ano: "Ano atual",
  "ano-anterior": "Ano anterior",
};

// Só mapeia os períodos que getDRE já sabe calcular nativamente (ano,
// mes | null) — nenhum período aqui exige mudar a assinatura do serviço.
export function periodoParaAnoMes(periodo: PeriodoFiltro): { ano: number; mes: number | null } {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  if (periodo === "mes") return { ano: anoAtual, mes: hoje.getMonth() + 1 };
  if (periodo === "ano-anterior") return { ano: anoAtual - 1, mes: null };
  return { ano: anoAtual, mes: null };
}
