import { describe, it, expect } from "vitest";
import { formatM2, formatPercent, gerarId, labelDiff, formatDuracao, formatBRL, pctConcluido } from "@/lib/formatters";

describe("formatM2 / formatPercent", () => {
  it("formata m² (toFixed usa ponto)", () => {
    expect(formatM2(12.3456)).toBe("12.35 m²");
  });
  it("formata percentual", () => {
    expect(formatPercent(87.456)).toBe("87.46%");
  });
});

describe("formatBRL", () => {
  it("começa com R$ e contém os dígitos", () => {
    const s = formatBRL(1234.56);
    expect(s.startsWith("R$ ")).toBe(true);
    expect(s).toMatch(/1.?234/); // separador de milhar pode variar por ICU
  });
  it("trata null como zero", () => {
    expect(formatBRL(null)).toMatch(/0,00$/);
  });
});

describe("gerarId", () => {
  it("gera o próximo id com zero-padding", () => {
    expect(gerarId("P", 0)).toBe("P-001");
    expect(gerarId("ORC", 41)).toBe("ORC-042");
    expect(gerarId("P", 99)).toBe("P-100");
  });
});

describe("labelDiff", () => {
  it("vencido, hoje e futuro", () => {
    expect(labelDiff(-3)).toBe("Vencido há 3d");
    expect(labelDiff(0)).toBe("Hoje");
    expect(labelDiff(5)).toBe("5d");
  });
});

describe("formatDuracao", () => {
  it("formata durações", () => {
    expect(formatDuracao(0)).toBe("<1min");
    expect(formatDuracao(45 * 60000)).toBe("45min");
    expect(formatDuracao(3 * 3600000)).toBe("3h");
    expect(formatDuracao((24 + 4) * 3600000)).toBe("1d 4h");
  });
});

describe("pctConcluido", () => {
  it("calcula percentual arredondado", () => {
    expect(pctConcluido(5, 10)).toBe(50);
    expect(pctConcluido(1, 3)).toBe(33);
  });
  it("total zero ou negativo retorna 0 (evita NaN/Infinity)", () => {
    expect(pctConcluido(5, 0)).toBe(0);
    expect(pctConcluido(0, 0)).toBe(0);
    expect(pctConcluido(5, -1)).toBe(0);
  });
  it("nunca passa de 100, mesmo com dado inconsistente", () => {
    expect(pctConcluido(15, 10)).toBe(100);
  });
});
