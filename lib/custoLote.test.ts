import { describe, it, expect } from "vitest";
import { custoPeps, type LoteParaCustoPeps } from "@/lib/custoLote";

function lote(over: Partial<LoteParaCustoPeps>): LoteParaCustoPeps {
  return { custo_m2: 10, m2_saldo: 100, dt_entrada: "2026-01-01", dt_entrada_estimada: false, ...over };
}

describe("custoPeps", () => {
  it("retorna null quando não há lotes", () => {
    expect(custoPeps([], 50)).toEqual({ custoM2: null, envolveDataEstimada: false });
  });

  it("retorna null quando a quantidade pedida é zero ou negativa", () => {
    expect(custoPeps([lote({})], 0)).toEqual({ custoM2: null, envolveDataEstimada: false });
  });

  it("retorna o custo direto quando 1 lote basta", () => {
    const r = custoPeps([lote({ custo_m2: 20, m2_saldo: 100 })], 30);
    expect(r).toEqual({ custoM2: 20, envolveDataEstimada: false });
  });

  it("consome do mais antigo primeiro, mesmo se o array vier fora de ordem", () => {
    const lotes = [
      lote({ custo_m2: 30, m2_saldo: 100, dt_entrada: "2026-07-20" }), // mais novo, mas vem primeiro no array
      lote({ custo_m2: 10, m2_saldo: 100, dt_entrada: "2026-01-01" }), // mais antigo
    ];
    // pede só 50 — cabe inteiro no lote mais antigo (custo 10), o mais novo nem é tocado
    expect(custoPeps(lotes, 50)).toEqual({ custoM2: 10, envolveDataEstimada: false });
  });

  it("faz blend ponderado quando a quantidade ultrapassa o saldo do lote mais antigo", () => {
    const lotes = [
      lote({ custo_m2: 10, m2_saldo: 100, dt_entrada: "2026-01-01" }),
      lote({ custo_m2: 30, m2_saldo: 300, dt_entrada: "2026-02-01" }),
    ];
    // 100m² a 10 + 50m² a 30 = (1000+1500)/150 = 16,6667
    const r = custoPeps(lotes, 150);
    expect(r.custoM2).toBeCloseTo(16.6667, 3);
    expect(r.envolveDataEstimada).toBe(false);
  });

  it("retorna null quando o lote necessário pra completar a quantidade não tem custo definido", () => {
    const lotes = [
      lote({ custo_m2: 10, m2_saldo: 50, dt_entrada: "2026-01-01" }),
      lote({ custo_m2: null, m2_saldo: 200, dt_entrada: "2026-02-01" }),
    ];
    // pede 100 — 50 vem do 1º lote, os outros 50 precisariam do 2º (custo null)
    expect(custoPeps(lotes, 100)).toEqual({ custoM2: null, envolveDataEstimada: false });
  });

  it("NÃO fica indisponível se um lote mais novo com custo null nunca é tocado", () => {
    const lotes = [
      lote({ custo_m2: 10, m2_saldo: 200, dt_entrada: "2026-01-01" }),
      lote({ custo_m2: null, m2_saldo: 200, dt_entrada: "2026-02-01" }),
    ];
    // pede só 50 — sobra dentro do 1º lote, o null nem entra na fila
    expect(custoPeps(lotes, 50)).toEqual({ custoM2: 10, envolveDataEstimada: false });
  });

  it("propaga envolveDataEstimada quando um lote tocado tem data estimada", () => {
    const lotes = [lote({ custo_m2: 20, m2_saldo: 100, dt_entrada_estimada: true })];
    expect(custoPeps(lotes, 30)).toEqual({ custoM2: 20, envolveDataEstimada: true });
  });

  it("envolveDataEstimada fica true mesmo se só 1 dos lotes tocados no blend for estimado", () => {
    const lotes = [
      lote({ custo_m2: 10, m2_saldo: 50, dt_entrada: "2026-01-01", dt_entrada_estimada: true }),
      lote({ custo_m2: 30, m2_saldo: 300, dt_entrada: "2026-02-01", dt_entrada_estimada: false }),
    ];
    expect(custoPeps(lotes, 100).envolveDataEstimada).toBe(true);
  });

  it("ignora lotes com saldo zero ou negativo", () => {
    const lotes = [
      lote({ custo_m2: 999, m2_saldo: 0, dt_entrada: "2026-01-01" }),
      lote({ custo_m2: 20, m2_saldo: 100, dt_entrada: "2026-02-01" }),
    ];
    expect(custoPeps(lotes, 50)).toEqual({ custoM2: 20, envolveDataEstimada: false });
  });

  it("retorna null quando a soma de saldo disponível é zero", () => {
    expect(custoPeps([lote({ custo_m2: 20, m2_saldo: 0 })], 50)).toEqual({ custoM2: null, envolveDataEstimada: false });
  });
});
