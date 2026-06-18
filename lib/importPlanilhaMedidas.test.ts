import { describe, it, expect } from "vitest";
import { parseLinhasMedidas } from "@/lib/importPlanilhaMedidas";

describe("parseLinhasMedidas", () => {
  it("lê largura/altura/quantidade pelo cabeçalho, em qualquer ordem de colunas", () => {
    const rows = [
      ["ALTURA", "LARGURA", "QUANTIDADE"],
      [2250, 3300, 2],
      [934, 1099, ""],
    ];
    expect(parseLinhasMedidas(rows)).toEqual([
      { largura: 3300, altura: 2250, quantidade: 2 },
      { largura: 1099, altura: 934, quantidade: 1 },
    ]);
  });

  it("ignora linhas vazias ou sem medida válida", () => {
    const rows = [
      ["LARGURA", "ALTURA", "QUANTIDADE"],
      [1099, 1177, 2],
      ["", "", ""],
      [0, 500, 1],
    ];
    expect(parseLinhasMedidas(rows)).toEqual([{ largura: 1099, altura: 1177, quantidade: 2 }]);
  });

  it("sem cabeçalho reconhecível, assume largura/altura nas duas primeiras colunas", () => {
    const rows = [
      [1100, 2000],
      [900, 1500],
    ];
    expect(parseLinhasMedidas(rows)).toEqual([
      { largura: 1100, altura: 2000, quantidade: 1 },
      { largura: 900, altura: 1500, quantidade: 1 },
    ]);
  });

  it("planilha vazia devolve lista vazia", () => {
    expect(parseLinhasMedidas([])).toEqual([]);
  });
});
