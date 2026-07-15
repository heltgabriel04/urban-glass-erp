import type { ConfigFiscalPadrao, ConfigFiscalProduto } from "@/types";

export interface ClassificacaoFiscal {
  ncm: string;
  cfop: string;
  cst: string;
}

export function resolverClassificacaoFiscal(
  produtoId: number | null,
  dentroEstado: boolean,
  configProdutos: Map<number, ConfigFiscalProduto>,
  configPadrao: ConfigFiscalPadrao
): ClassificacaoFiscal {
  const config = produtoId != null ? configProdutos.get(produtoId) : undefined;
  if (config) {
    return {
      ncm: config.ncm,
      cfop: dentroEstado ? config.cfop_dentro : config.cfop_fora,
      cst: config.cst_icms,
    };
  }
  return {
    ncm: configPadrao.ncm_padrao,
    cfop: dentroEstado ? configPadrao.cfop_dentro_padrao : configPadrao.cfop_fora_padrao,
    cst: configPadrao.cst_icms_padrao,
  };
}

export interface TributosItem {
  aliq_icms: number; valor_icms: number;
  aliq_pis: number; valor_pis: number;
  aliq_cofins: number; valor_cofins: number;
  aliq_ipi: number; valor_ipi: number;
}

export function calcularTributosItem(
  valorBruto: number,
  ipiPct: number,
  dentroEstado: boolean,
  configPadrao: ConfigFiscalPadrao
): TributosItem {
  const aliqIcms = dentroEstado ? configPadrao.aliq_icms_dentro : configPadrao.aliq_icms_fora;
  return {
    aliq_icms: aliqIcms,
    valor_icms: valorBruto * (aliqIcms / 100),
    aliq_pis: configPadrao.aliq_pis,
    valor_pis: valorBruto * (configPadrao.aliq_pis / 100),
    aliq_cofins: configPadrao.aliq_cofins,
    valor_cofins: valorBruto * (configPadrao.aliq_cofins / 100),
    aliq_ipi: ipiPct,
    valor_ipi: valorBruto * (ipiPct / 100),
  };
}

export interface ResolucaoFiscalItem extends ClassificacaoFiscal, TributosItem {}

export function resolverFiscalItem(params: {
  produtoId: number | null;
  valorBruto: number;
  dentroEstado: boolean;
  ipiPctManual?: number;
  configProdutos: Map<number, ConfigFiscalProduto>;
  configPadrao: ConfigFiscalPadrao;
}): ResolucaoFiscalItem {
  const classificacao = resolverClassificacaoFiscal(
    params.produtoId, params.dentroEstado, params.configProdutos, params.configPadrao
  );
  const tributos = calcularTributosItem(
    params.valorBruto, params.ipiPctManual ?? 0, params.dentroEstado, params.configPadrao
  );
  return { ...classificacao, ...tributos };
}
