export const ALIQ_IPI_PEDIDO = 6.5;

export function calcularValorIpi(valorTotal: number): number {
  return parseFloat((valorTotal * ALIQ_IPI_PEDIDO / 100).toFixed(2));
}

export function valorComIpi(pedido: { valor_total: number; valor_ipi?: number | null }): number {
  return Number(pedido.valor_total) + Number(pedido.valor_ipi ?? 0);
}
