import { describe, it, expect } from "vitest";
import { resolverClassificacaoFiscal, calcularTributosItem, resolverFiscalItem } from "./fiscal";
import type { ConfigFiscalPadrao, ConfigFiscalProduto } from "@/types";

const PADRAO: ConfigFiscalPadrao = {
  id: 1, regime: "normal",
  aliq_icms_dentro: 18, aliq_icms_fora: 12,
  aliq_pis: 1.65, aliq_cofins: 7.6, aliq_ipi: 0,
  cst_icms_padrao: "00",
  cfop_dentro_padrao: "5102", cfop_fora_padrao: "6102",
  ncm_padrao: "70031200",
  updated_at: "",
};

const PRODUTO_VIDRO_TEMPERADO: ConfigFiscalProduto = {
  produto_id: 42,
  ncm: "70071900",
  cfop_dentro: "5101", cfop_fora: "6101",
  cst_icms: "40",
  aliq_icms: 18, aliq_pis: 1.65, aliq_cofins: 7.6, aliq_ipi: 0,
  updated_at: "",
};

describe("resolverClassificacaoFiscal", () => {
  it("usa a config do produto quando existe override, CFOP dentro do estado", () => {
    const map = new Map([[42, PRODUTO_VIDRO_TEMPERADO]]);
    expect(resolverClassificacaoFiscal(42, true, map, PADRAO)).toEqual({
      ncm: "70071900", cfop: "5101", cst: "40",
    });
  });

  it("usa a config do produto quando existe override, CFOP fora do estado", () => {
    const map = new Map([[42, PRODUTO_VIDRO_TEMPERADO]]);
    expect(resolverClassificacaoFiscal(42, false, map, PADRAO)).toEqual({
      ncm: "70071900", cfop: "6101", cst: "40",
    });
  });

  it("cai pro padrão quando o produto não tem override", () => {
    const map = new Map<number, ConfigFiscalProduto>();
    expect(resolverClassificacaoFiscal(99, true, map, PADRAO)).toEqual({
      ncm: "70031200", cfop: "5102", cst: "00",
    });
  });

  it("cai pro padrão quando o item não tem produto vinculado (avulso)", () => {
    const map = new Map([[42, PRODUTO_VIDRO_TEMPERADO]]);
    expect(resolverClassificacaoFiscal(null, true, map, PADRAO)).toEqual({
      ncm: "70031200", cfop: "5102", cst: "00",
    });
  });
});

describe("calcularTributosItem", () => {
  it("calcula ICMS/PIS/COFINS com as alíquotas do padrão, dentro do estado", () => {
    const r = calcularTributosItem(1000, 0, true, PADRAO);
    expect(r.aliq_icms).toBe(18);
    expect(r.valor_icms).toBeCloseTo(180, 2);
    expect(r.aliq_pis).toBe(1.65);
    expect(r.valor_pis).toBeCloseTo(16.5, 2);
    expect(r.aliq_cofins).toBe(7.6);
    expect(r.valor_cofins).toBeCloseTo(76, 2);
    expect(r.valor_ipi).toBe(0);
  });

  it("usa a alíquota de ICMS de fora do estado quando dentroEstado é false", () => {
    const r = calcularTributosItem(1000, 0, false, PADRAO);
    expect(r.aliq_icms).toBe(12);
    expect(r.valor_icms).toBeCloseTo(120, 2);
  });

  it("calcula IPI a partir do percentual manual informado", () => {
    const r = calcularTributosItem(1000, 5, true, PADRAO);
    expect(r.aliq_ipi).toBe(5);
    expect(r.valor_ipi).toBeCloseTo(50, 2);
  });
});

describe("resolverFiscalItem", () => {
  it("combina classificação e tributos num único resultado", () => {
    const map = new Map([[42, PRODUTO_VIDRO_TEMPERADO]]);
    const r = resolverFiscalItem({
      produtoId: 42, valorBruto: 1000, dentroEstado: true,
      configProdutos: map, configPadrao: PADRAO,
    });
    expect(r.ncm).toBe("70071900");
    expect(r.cfop).toBe("5101");
    expect(r.cst).toBe("40");
    expect(r.valor_icms).toBeCloseTo(180, 2);
    expect(r.valor_ipi).toBe(0);
  });

  it("assume ipiPctManual = 0 quando omitido", () => {
    const map = new Map<number, ConfigFiscalProduto>();
    const r = resolverFiscalItem({
      produtoId: null, valorBruto: 500, dentroEstado: true,
      configProdutos: map, configPadrao: PADRAO,
    });
    expect(r.valor_ipi).toBe(0);
  });
});
