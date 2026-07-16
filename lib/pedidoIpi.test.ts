import { describe, it, expect } from "vitest";
import { ALIQ_IPI_PEDIDO, calcularValorIpi, valorComIpi } from "./pedidoIpi";

describe("ALIQ_IPI_PEDIDO", () => {
  it("é 6.5", () => {
    expect(ALIQ_IPI_PEDIDO).toBe(6.5);
  });
});

describe("calcularValorIpi", () => {
  it("calcula 6,5% do valor total, com 2 casas decimais", () => {
    expect(calcularValorIpi(1000)).toBe(65);
    expect(calcularValorIpi(123.45)).toBe(8.02); // 123.45 * 0.065 = 8.02425 → 8.02
  });

  it("retorna 0 pra valor total 0", () => {
    expect(calcularValorIpi(0)).toBe(0);
  });
});

describe("valorComIpi", () => {
  it("soma valor_total e valor_ipi", () => {
    expect(valorComIpi({ valor_total: 1000, valor_ipi: 65 })).toBe(1065);
  });

  it("trata valor_ipi ausente ou null como 0", () => {
    expect(valorComIpi({ valor_total: 1000 })).toBe(1000);
    expect(valorComIpi({ valor_total: 1000, valor_ipi: null })).toBe(1000);
  });
});
