import { describe, it, expect } from "vitest";
import { mediaPonderadaCusto } from "@/lib/custoLote";

describe("mediaPonderadaCusto", () => {
  it("retorna null quando não há lotes", () => {
    expect(mediaPonderadaCusto([])).toBeNull();
  });

  it("retorna o custo direto quando há só 1 lote", () => {
    expect(mediaPonderadaCusto([{ custo_m2: 20, m2_saldo: 100 }])).toBe(20);
  });

  it("pondera pelo saldo entre 2+ lotes", () => {
    // 100m² a 10 + 300m² a 30 = (1000+9000)/400 = 25
    const r = mediaPonderadaCusto([
      { custo_m2: 10, m2_saldo: 100 },
      { custo_m2: 30, m2_saldo: 300 },
    ]);
    expect(r).toBe(25);
  });

  it("retorna null quando QUALQUER lote do conjunto tem custo_m2 null — não trata como 0", () => {
    const r = mediaPonderadaCusto([
      { custo_m2: 20, m2_saldo: 100 },
      { custo_m2: null, m2_saldo: 50 },
    ]);
    expect(r).toBeNull();
  });

  it("retorna null quando soma de saldo é zero (evita divisão por zero)", () => {
    expect(mediaPonderadaCusto([{ custo_m2: 20, m2_saldo: 0 }])).toBeNull();
  });

  it("um único lote com custo_m2 null já basta pra indisponibilizar o produto inteiro", () => {
    expect(mediaPonderadaCusto([{ custo_m2: null, m2_saldo: 798.9048 }])).toBeNull();
  });
});
