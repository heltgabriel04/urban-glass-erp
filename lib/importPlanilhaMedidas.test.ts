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

  it("lê a coluna Código (com acento) e leva pro campo codigo de cada peça", () => {
    const rows = [
      ["LARGURA", "ALTURA", "QUANTIDADE", "CÓDIGO", "R$/M²", "TOTAL"],
      [978, 1451, 4, "FD-MX01", "", ""],
      [978, 1451, 2, "FD-MX01_1", "", ""],
      [1043, 507, 1, "FD-QF01", "", ""],
    ];
    expect(parseLinhasMedidas(rows)).toEqual([
      { largura: 978, altura: 1451, quantidade: 4, codigo: "FD-MX01" },
      { largura: 978, altura: 1451, quantidade: 2, codigo: "FD-MX01_1" },
      { largura: 1043, altura: 507, quantidade: 1, codigo: "FD-QF01" },
    ]);
  });

  it("linha sem código no meio de uma planilha com coluna Código vira codigo undefined", () => {
    const rows = [
      ["LARGURA", "ALTURA", "CÓDIGO"],
      [900, 950, ""],
    ];
    const [item] = parseLinhasMedidas(rows);
    expect(item.codigo).toBeUndefined();
  });
});
