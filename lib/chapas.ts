export interface DimensaoChapa { w: number; h: number }

/**
 * Retorna true se largura×altura corresponde a alguma das chapas informadas
 * (tolerância 50mm), em qualquer orientação. `chapas` vem de lotes_estoque
 * (lotes ativos e com dimensão confirmada) — este módulo não conhece banco,
 * quem chama resolve a lista antes (ver services/lotes.service.ts).
 */
export function isChapaInteira(largura: number, altura: number, chapas: DimensaoChapa[]): boolean {
  return chapas.some(c =>
    (Math.abs(largura - c.w) < 50 && Math.abs(altura - c.h) < 50) ||
    (Math.abs(largura - c.h) < 50 && Math.abs(altura - c.w) < 50)
  );
}
