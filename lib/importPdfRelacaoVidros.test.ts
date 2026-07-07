import { describe, it, expect } from "vitest";
import { agruparEmLinhas, interpretarLinha, type TextItem } from "@/lib/importPdfRelacaoVidros";

// Coordenadas capturadas de verdade do PDF real "1000 - L8 - Relação de
// Vidros_Abrita.pdf" (via pdfjs getTextContent), pra não depender de um
// binário de PDF no repositório pros testes.

const CABECALHO: TextItem[] = [
  { str: "ITEM", x: 31, y: 735 },
  { str: "TIPO", x: 82, y: 735 },
  { str: "QUANT", x: 233, y: 735 },
  { str: "TIPO DE VIDRO", x: 270, y: 735 },
  { str: "OBS.", x: 456, y: 735 },
  { str: "M²", x: 549, y: 735 },
];

const LINHA_1: TextItem[] = [
  { str: "1", x: 39, y: 720 },
  { str: "FD-MX01", x: 67, y: 719 },
  { str: "978", x: 145, y: 719 },
  { str: "1451", x: 191, y: 719 },
  { str: "4", x: 245, y: 719 },
  { str: "Laminado Refletivo, 8mm", x: 270, y: 719 },
  { str: "5,68", x: 547, y: 719 },
];

const LINHA_2: TextItem[] = [
  { str: "2", x: 39, y: 704 },
  { str: "FD-MX01_1", x: 61, y: 702 },
  { str: "978", x: 145, y: 702 },
  { str: "1451", x: 191, y: 702 },
  { str: "2", x: 252, y: 702 },
  { str: "Laminado Refletivo, 8mm", x: 270, y: 703 },
  { str: "2,84", x: 547, y: 703 },
];

const RODAPE: TextItem[] = [
  { str: "BRASIL TEMPER ESQUADRIAS DE ALUMÍNIO", x: 31, y: 40 },
  { str: "108", x: 500, y: 40 },
  { str: "123,92", x: 547, y: 40 },
];

const TITULO_OBRA: TextItem[] = [
  { str: "REV.00", x: 31, y: 780 },
  { str: "RELAÇÃO DE VIDROS", x: 200, y: 780 },
  { str: "PARA", x: 380, y: 780 },
  { str: "CORTE", x: 420, y: 780 },
  { str: "ESQUADRIAS", x: 470, y: 780 },
  { str: "OBRA:", x: 31, y: 765 },
  { str: "1000", x: 80, y: 765 },
  { str: "-", x: 110, y: 765 },
  { str: "ABRITA", x: 120, y: 765 },
  { str: "LIB.08", x: 180, y: 765 },
];

describe("agruparEmLinhas", () => {
  it("agrupa itens da mesma altura (y próximo) numa linha, ordenados por x", () => {
    const linhas = agruparEmLinhas([...LINHA_1].reverse()); // embaralhado, deve reordenar por x
    expect(linhas).toHaveLength(1);
    expect(linhas[0].map(c => c.str)).toEqual(["1", "FD-MX01", "978", "1451", "4", "Laminado Refletivo, 8mm", "5,68"]);
  });

  it("separa linhas com y diferente, mesmo que próximas (linha 1 e 2 do PDF real)", () => {
    const linhas = agruparEmLinhas([...LINHA_1, ...LINHA_2]);
    expect(linhas).toHaveLength(2);
  });

  it("ignora células vazias/só espaço", () => {
    const comVazios = [...LINHA_1, { str: "", x: 300, y: 719 }, { str: "   ", x: 310, y: 719 }];
    const linhas = agruparEmLinhas(comVazios);
    expect(linhas[0]).toHaveLength(LINHA_1.length);
  });
});

describe("interpretarLinha", () => {
  it("interpreta uma linha de peça válida", () => {
    const linha = agruparEmLinhas(LINHA_1)[0];
    expect(interpretarLinha(linha)).toEqual({ largura: 978, altura: 1451, quantidade: 4, codigo: "FD-MX01" });
  });

  it("interpreta código com sufixo (peça repetida com código derivado)", () => {
    const linha = agruparEmLinhas(LINHA_2)[0];
    expect(interpretarLinha(linha)).toEqual({ largura: 978, altura: 1451, quantidade: 2, codigo: "FD-MX01_1" });
  });

  it("ignora a linha de cabeçalho da tabela", () => {
    const linha = agruparEmLinhas(CABECALHO)[0];
    expect(interpretarLinha(linha)).toBeNull();
  });

  it("ignora a linha de rodapé/totais", () => {
    const linha = agruparEmLinhas(RODAPE)[0];
    expect(interpretarLinha(linha)).toBeNull();
  });

  it("ignora o bloco de título/obra no topo da página 2", () => {
    agruparEmLinhas(TITULO_OBRA).forEach(linha => expect(interpretarLinha(linha)).toBeNull());
  });

  it("continua funcionando quando a coluna OBS vem preenchida (célula extra)", () => {
    const comObs: TextItem[] = [
      ...LINHA_1.slice(0, 6),
      { str: "revisar prazo", x: 456, y: 719 },
      { str: "5,68", x: 547, y: 719 },
    ];
    const linha = agruparEmLinhas(comObs)[0];
    expect(interpretarLinha(linha)).toEqual({ largura: 978, altura: 1451, quantidade: 4, codigo: "FD-MX01" });
  });

  it("rejeita linha curta demais pra ser uma peça", () => {
    expect(interpretarLinha([{ str: "1", x: 0, y: 0 }, { str: "FD-MX01", x: 10, y: 0 }])).toBeNull();
  });

  it("rejeita quando a largura/altura estão fora de faixa plausível", () => {
    const linha: TextItem[] = [
      { str: "1", x: 39, y: 719 }, { str: "FD-X", x: 67, y: 719 },
      { str: "9999", x: 145, y: 719 }, { str: "9999", x: 191, y: 719 },
      { str: "1", x: 245, y: 719 }, { str: "Vidro", x: 270, y: 719 }, { str: "1,00", x: 547, y: 719 },
    ];
    expect(interpretarLinha(linha)).toBeNull();
  });
});
