import { isChapaInteira } from "@/lib/chapas";
import type { LoteEstoque } from "@/types";

/** Deriva o status da caixa a partir do saldo — nunca é uma coluna própria. */
export function statusCaixa(chapasSaldo: number, chapasEntrada: number): "fechada" | "aberta" | "esgotada" {
  if (chapasSaldo <= 0) return "esgotada";
  if (chapasSaldo === chapasEntrada) return "fechada";
  return "aberta";
}

/** Caixas do produto+medida informados, entre as já confirmadas/ativas (lotes recebidos de getLotesUtilizaveis). */
export function filtrarCaixasCandidatas(
  lotes: LoteEstoque[],
  produtoId: number | null,
  largura: number,
  altura: number,
): LoteEstoque[] {
  if (!produtoId || largura <= 0 || altura <= 0) return [];
  return lotes.filter(l =>
    l.produto_id === produtoId &&
    l.chapa_largura_mm != null && l.chapa_altura_mm != null &&
    isChapaInteira(largura, altura, [{ w: l.chapa_largura_mm, h: l.chapa_altura_mm }])
  );
}

export type ResolucaoCaixa =
  | { ok: true; caixaId: number }
  | { ok: false; motivo: "nenhuma_candidata" }
  | { ok: false; motivo: "multiplas_candidatas"; candidatas: LoteEstoque[] }
  | { ok: false; motivo: "saldo_insuficiente"; caixaId: number; saldo: number; necessario: number };

/**
 * Decide de qual caixa debitar. 1 candidata resolve sozinha; 2+ exigem
 * `caixaEscolhidaId` (decisão do usuário, nunca automática); saldo menor
 * que o necessário bloqueia (decisão do usuário: sem cascata automática
 * entre caixas — quem chama deve orientar a dividir a operação).
 */
export function resolverCaixaParaVenda(
  candidatas: LoteEstoque[],
  caixaEscolhidaId: number | undefined,
  quantidadeNecessaria: number,
): ResolucaoCaixa {
  if (candidatas.length === 0) return { ok: false, motivo: "nenhuma_candidata" };

  let caixa: LoteEstoque | undefined;
  if (candidatas.length === 1) {
    caixa = candidatas[0];
  } else {
    caixa = caixaEscolhidaId !== undefined ? candidatas.find(c => c.id === caixaEscolhidaId) : undefined;
    if (!caixa) return { ok: false, motivo: "multiplas_candidatas", candidatas };
  }

  if (caixa.chapas_saldo < quantidadeNecessaria) {
    return { ok: false, motivo: "saldo_insuficiente", caixaId: caixa.id, saldo: caixa.chapas_saldo, necessario: quantidadeNecessaria };
  }
  return { ok: true, caixaId: caixa.id };
}
