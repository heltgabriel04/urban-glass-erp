// Custo real de uma compra importada a partir dos valores da DI.
// Tributos entram digitados em R$ (nunca calculados por alíquota aqui).
// II e despesas aduaneiras nunca são creditáveis; IPI/PIS-COFINS/ICMS
// entram no custo apenas quando a flag correspondente for false.
// Ver docs/superpowers/specs/2026-07-17-custo-importacao-design.md

export interface DadosImportacao {
  valor_fob_usd: number;
  frete_internacional_usd: number;
  seguro_internacional_usd: number;
  cambio_usd: number;
  ii: number;
  ipi_importacao: number;
  pis_cofins_importacao: number;
  icms_importacao: number;
  despesas_aduaneiras: number;
  ipi_creditavel: boolean;
  pis_cofins_creditavel: boolean;
  icms_creditavel: boolean;
}

export interface CustoImportacao {
  valorAduaneiroBrl: number;   // (FOB + frete + seguro) × câmbio
  custoDesembolsado: number;   // aduaneiro + todos os tributos + despesas
  custoNaoRecuperavel: number; // aduaneiro + II + despesas + tributos NÃO creditáveis
  creditosTributarios: number; // soma dos tributos creditáveis
  custoM2: number;             // custoNaoRecuperavel / m2Total (0 se m2Total <= 0)
}

const r2 = (v: number) => parseFloat(v.toFixed(2));
const r4 = (v: number) => parseFloat(v.toFixed(4));

export function calcularCustoImportacao(d: DadosImportacao, m2Total: number): CustoImportacao {
  const valorAduaneiroBrl = r2(
    (d.valor_fob_usd + d.frete_internacional_usd + d.seguro_internacional_usd) * d.cambio_usd
  );
  const custoDesembolsado = r2(
    valorAduaneiroBrl + d.ii + d.ipi_importacao + d.pis_cofins_importacao + d.icms_importacao + d.despesas_aduaneiras
  );
  const custoNaoRecuperavel = r2(
    valorAduaneiroBrl + d.ii + d.despesas_aduaneiras
    + (d.ipi_creditavel ? 0 : d.ipi_importacao)
    + (d.pis_cofins_creditavel ? 0 : d.pis_cofins_importacao)
    + (d.icms_creditavel ? 0 : d.icms_importacao)
  );
  const creditosTributarios = r2(
    (d.ipi_creditavel ? d.ipi_importacao : 0)
    + (d.pis_cofins_creditavel ? d.pis_cofins_importacao : 0)
    + (d.icms_creditavel ? d.icms_importacao : 0)
  );
  const custoM2 = m2Total > 0 ? r4(custoNaoRecuperavel / m2Total) : 0;

  return { valorAduaneiroBrl, custoDesembolsado, custoNaoRecuperavel, creditosTributarios, custoM2 };
}
