import { describe, it, expect } from "vitest";
import { agruparPorMes, formatarMesReferencia, montarPrefillNfMes } from "./perdaVidro";
import type { PerdaMensalVidro } from "@/types";

function item(overrides: Partial<PerdaMensalVidro>): PerdaMensalVidro {
  return {
    produto_id: 1,
    produto_nome: "Incolor 4mm",
    mes_referencia: "2026-07-01T00:00:00",
    m2_perda_otimizacao: 0,
    valor_perda_otimizacao: 0,
    m2_perda_incidente: 0,
    valor_perda_incidente: 0,
    m2_perda_total: 0,
    valor_perda_total: 0,
    m2_retalho_salvo: 0,
    ...overrides,
  };
}

describe("formatarMesReferencia", () => {
  it("formata 'YYYY-MM' como 'Mês/Ano'", () => {
    expect(formatarMesReferencia("2026-07")).toBe("Julho/2026");
    expect(formatarMesReferencia("2026-01")).toBe("Janeiro/2026");
  });
});

describe("agruparPorMes", () => {
  it("agrupa itens por mês preservando a ordem de chegada e soma os totais", () => {
    const itens = [
      item({ produto_nome: "Incolor 4mm", mes_referencia: "2026-07-01T00:00:00", m2_perda_total: 12.3, valor_perda_total: 450 }),
      item({ produto_nome: "Verde 6mm", mes_referencia: "2026-07-01T00:00:00", m2_perda_total: 5.2, valor_perda_total: 200 }),
      item({ produto_nome: "Incolor 4mm", mes_referencia: "2026-06-01T00:00:00", m2_perda_total: 3, valor_perda_total: 100 }),
    ];
    const grupos = agruparPorMes(itens);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].chaveMs).toBe("2026-07");
    expect(grupos[0].label).toBe("Julho/2026");
    expect(grupos[0].itens).toHaveLength(2);
    expect(grupos[0].m2Total).toBeCloseTo(17.5);
    expect(grupos[0].valorTotal).toBe(650);
    expect(grupos[1].chaveMs).toBe("2026-06");
  });

  it("retorna lista vazia quando não há itens", () => {
    expect(agruparPorMes([])).toEqual([]);
  });
});

describe("montarPrefillNfMes", () => {
  it("soma quantidade e valor, e discrimina por tipo em observações", () => {
    const itens = [
      item({ produto_nome: "Incolor 4mm", mes_referencia: "2026-07-01T00:00:00", m2_perda_total: 12.3, valor_perda_total: 450 }),
      item({ produto_nome: "Verde 6mm", mes_referencia: "2026-07-01T00:00:00", m2_perda_total: 5.2, valor_perda_total: 200 }),
    ];
    const prefill = montarPrefillNfMes(itens);
    expect(prefill.competencia_ano).toBe(2026);
    expect(prefill.competencia_mes).toBe(7);
    expect(prefill.material).toBe("Incolor 4mm, Verde 6mm");
    expect(prefill.quantidade).toBe(17.5);
    expect(prefill.valor_total).toBe(650);
    expect(prefill.observacoes).toBe(
      "Incolor 4mm: 12.30 m² – R$ 450,00\nVerde 6mm: 5.20 m² – R$ 200,00"
    );
  });
});
