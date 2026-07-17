import { describe, it, expect } from "vitest";
import { calcularCustoImportacao, type DadosImportacao } from "./custoImportacao";

const BASE: DadosImportacao = {
  valor_fob_usd: 10000,
  frete_internacional_usd: 800,
  seguro_internacional_usd: 200,
  cambio_usd: 5,
  ii: 6600,
  ipi_importacao: 3000,
  pis_cofins_importacao: 5000,
  icms_importacao: 12000,
  despesas_aduaneiras: 2400,
  ipi_creditavel: false,
  pis_cofins_creditavel: true,
  icms_creditavel: true,
};

describe("calcularCustoImportacao", () => {
  it("calcula valor aduaneiro em BRL: (FOB + frete + seguro) × câmbio", () => {
    const r = calcularCustoImportacao(BASE, 1000);
    expect(r.valorAduaneiroBrl).toBe(55000); // (10000+800+200) × 5
  });

  it("custo desembolsado soma aduaneiro + todos os tributos + despesas", () => {
    const r = calcularCustoImportacao(BASE, 1000);
    expect(r.custoDesembolsado).toBe(84000); // 55000+6600+3000+5000+12000+2400
  });

  it("com defaults do Lucro Real (IPI não creditável), IPI entra no custo e PIS/COFINS+ICMS viram crédito", () => {
    const r = calcularCustoImportacao(BASE, 1000);
    expect(r.custoNaoRecuperavel).toBe(67000); // 55000+6600+2400+3000(IPI)
    expect(r.creditosTributarios).toBe(17000); // 5000+12000
    // invariante: não-recuperável + créditos = desembolsado
    expect(r.custoNaoRecuperavel + r.creditosTributarios).toBe(r.custoDesembolsado);
  });

  it("todos creditáveis: só aduaneiro + II + despesas viram custo", () => {
    const r = calcularCustoImportacao({ ...BASE, ipi_creditavel: true }, 1000);
    expect(r.custoNaoRecuperavel).toBe(64000); // 55000+6600+2400
    expect(r.creditosTributarios).toBe(20000); // 3000+5000+12000
  });

  it("nenhum creditável: custo não-recuperável = desembolsado, créditos = 0", () => {
    const r = calcularCustoImportacao(
      { ...BASE, pis_cofins_creditavel: false, icms_creditavel: false },
      1000,
    );
    expect(r.custoNaoRecuperavel).toBe(84000);
    expect(r.creditosTributarios).toBe(0);
  });

  it("custo/m² = não-recuperável ÷ m² total, com 4 casas", () => {
    const r = calcularCustoImportacao(BASE, 1000);
    expect(r.custoM2).toBe(67); // 67000 / 1000
    const r2 = calcularCustoImportacao(BASE, 933);
    expect(r2.custoM2).toBe(71.8114); // 67000 / 933 = 71.81136... → 71.8114
  });

  it("m² total zero ou negativo: custoM2 = 0 (sem divisão por zero)", () => {
    expect(calcularCustoImportacao(BASE, 0).custoM2).toBe(0);
    expect(calcularCustoImportacao(BASE, -5).custoM2).toBe(0);
  });

  it("arredonda o valor aduaneiro a 2 casas", () => {
    const r = calcularCustoImportacao(
      { ...BASE, valor_fob_usd: 100.333, frete_internacional_usd: 0, seguro_internacional_usd: 0, cambio_usd: 1, ii: 0, ipi_importacao: 0, pis_cofins_importacao: 0, icms_importacao: 0, despesas_aduaneiras: 0 },
      0,
    );
    expect(r.valorAduaneiroBrl).toBe(100.33);
  });

  it("tudo zerado: todos os resultados 0", () => {
    const r = calcularCustoImportacao(
      { ...BASE, valor_fob_usd: 0, frete_internacional_usd: 0, seguro_internacional_usd: 0, cambio_usd: 0, ii: 0, ipi_importacao: 0, pis_cofins_importacao: 0, icms_importacao: 0, despesas_aduaneiras: 0 },
      100,
    );
    expect(r.valorAduaneiroBrl).toBe(0);
    expect(r.custoDesembolsado).toBe(0);
    expect(r.custoNaoRecuperavel).toBe(0);
    expect(r.creditosTributarios).toBe(0);
    expect(r.custoM2).toBe(0);
  });
});
