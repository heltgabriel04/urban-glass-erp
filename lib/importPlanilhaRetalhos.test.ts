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
      { produto_nome: "Incolor", largura: 300, altura: 400, espessura: 4, box: "Box 1", localizacao: "Cavalete 3 - B", chapa_origem: null, quantidade: 2 },
      { produto_nome: "Bronze", largura: 500, altura: 250, espessura: 6, box: "Box 2", localizacao: null, chapa_origem: null, quantidade: 1 },
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
      { produto_nome: "Incolor", largura: 300, altura: 400, espessura: null, box: null, localizacao: null, chapa_origem: null, quantidade: 1 },
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
});
