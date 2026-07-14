import { describe, it, expect } from "vitest";
import { dataSugerida, competenciaParaData } from "./cartoes.service";

describe("dataSugerida", () => {
  it("empurra o dia cadastrado pro próximo dia útil quando cai em fim de semana", () => {
    // 02/08/2026 é domingo — mesmo caso que o usuário descreveu (dia 2 num mês, dia 3 no outro)
    expect(dataSugerida(2, 2026, 8)).toBe("2026-08-03");
  });

  it("não mexe na data quando o dia cadastrado já cai em dia útil", () => {
    // 02/01/2026 é sexta-feira
    expect(dataSugerida(2, 2026, 1)).toBe("2026-01-02");
  });

  it("clampa o dia cadastrado ao último dia real do mês", () => {
    // fevereiro de 2028 (bissexto) só tem 29 dias; dia 29/02/2028 é terça (dia útil)
    expect(dataSugerida(31, 2028, 2)).toBe("2028-02-29");
  });
});

describe("competenciaParaData", () => {
  it("compra até a data de fechamento sugerida fica na competência do próprio mês", () => {
    // dia_fechamento=2 em agosto/2026 sugere 03/08 (domingo empurrado pra segunda)
    expect(competenciaParaData(2, "2026-08-03")).toEqual({ ano: 2026, mes: 8 });
    expect(competenciaParaData(2, "2026-08-01")).toEqual({ ano: 2026, mes: 8 });
  });

  it("compra depois da data de fechamento sugerida vai pra competência seguinte", () => {
    expect(competenciaParaData(2, "2026-08-04")).toEqual({ ano: 2026, mes: 9 });
  });

  it("vira o ano quando a competência seguinte é janeiro", () => {
    // dia_fechamento=2 em dezembro/2026 (02/12/2026 é quarta, dia útil) — compra depois vai pra jan/2027
    expect(competenciaParaData(2, "2026-12-03")).toEqual({ ano: 2027, mes: 1 });
  });
});
