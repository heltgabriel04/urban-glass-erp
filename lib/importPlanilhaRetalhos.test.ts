import { describe, it, expect } from "vitest";
import { parseLinhasRetalhos } from "@/lib/importPlanilhaRetalhos";

describe("parseLinhasRetalhos", () => {
  it("lê material/largura/altura/espessura/box/localização/quantidade pelo cabeçalho, em qualquer ordem", () => {
    const rows = [
      ["BOX", "MATERIAL", "ESPESSURA", "LARGURA", "ALTURA", "LOCALIZAÇÃO", "QUANTIDADE"],
      ["Box 1", "Incolor", 4, 300, 400, "Cavalete 3 - B", 2],
      ["Box 2", "Bronze", 6, 500, 250, "", ""],
    ];
    expect(parseLinhasRetalhos(rows)).toEqual([
      { produto_nome: "Incolor", largura: 300, altura: 400, espessura: 4, box: "Box 1", localizacao: "Cavalete 3 - B", chapa_origem: null, observacao: null, quantidade: 2 },
      { produto_nome: "Bronze", largura: 500, altura: 250, espessura: 6, box: "Box 2", localizacao: null, chapa_origem: null, observacao: null, quantidade: 1 },
    ]);
  });

  it("ignora linhas sem produto ou sem medida válida", () => {
    const rows = [
      ["PRODUTO", "LARGURA", "ALTURA"],
      ["Incolor", 300, 400],
      ["", 300, 400],
      ["Bronze", 0, 400],
    ];
    expect(parseLinhasRetalhos(rows)).toEqual([
      { produto_nome: "Incolor", largura: 300, altura: 400, espessura: null, box: null, localizacao: null, chapa_origem: null, observacao: null, quantidade: 1 },
    ]);
  });

  it("sem cabeçalho de produto/largura/altura, devolve lista vazia", () => {
    const rows = [
      [300, 400],
      [500, 250],
    ];
    expect(parseLinhasRetalhos(rows)).toEqual([]);
  });

  it("planilha vazia devolve lista vazia", () => {
    expect(parseLinhasRetalhos([])).toEqual([]);
  });

  it("lê formato da planilha interna: DIMENSÕES | (blank) | QUANTIDADE | PRODUTO | OBSERVAÇÃO | LOCAL", () => {
    const rows = [
      ["DIMENSÕES", "", "QUANTIDADE", "PRODUTO", "OBSERVAÇÃO", "LOCAL"],
      [1150, 590, 1, "Laminado 3+3 Incolor", "", "BOX 1"],
      [590,  950, 3, "Laminado 4+4 Bronze",  "Diogo", "BOX 2"],
    ];
    expect(parseLinhasRetalhos(rows)).toEqual([
      { produto_nome: "Laminado 3+3 Incolor", largura: 1150, altura: 590, espessura: 6, box: "BOX 1", localizacao: null, chapa_origem: null, observacao: null, quantidade: 1 },
      { produto_nome: "Laminado 4+4 Bronze",  largura: 590,  altura: 950, espessura: 8, box: "BOX 2", localizacao: null, chapa_origem: null, observacao: "Diogo", quantidade: 3 },
    ]);
  });

  it("extrai espessura do nome do produto quando não há coluna explícita", () => {
    const rows = [
      ["PRODUTO", "LARGURA", "ALTURA"],
      ["Refletivo 4+4 Escuro", 800, 1200],
      ["Reflecta 4+4 Incolor", 750, 900],
    ];
    const result = parseLinhasRetalhos(rows);
    expect(result[0].espessura).toBe(8);
    expect(result[1].espessura).toBe(8);
  });
});
