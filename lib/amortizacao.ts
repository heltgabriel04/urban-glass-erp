export interface ParcelaCalculada {
  numero_parcela: number;
  vencimento: string;
  valor_parcela: number;
  valor_juros: number;
  valor_amortizacao: number;
  saldo_devedor_apos: number;
}

function addMeses(dataISO: string, meses: number): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const d = new Date(ano, mes - 1 + meses, dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Sistema Price (parcela fixa) — o mais comum em empréstimo bancário no
 * Brasil. Gerado uma vez na criação do empréstimo, não recalculado depois
 * (amortização antecipada/renegociação fica pra edição manual das
 * parcelas restantes).
 */
export function calcularTabelaPrice(
  valorContratado: number,
  taxaJurosPctAm: number,
  numeroParcelas: number,
  dataPrimeiraParcela: string
): ParcelaCalculada[] {
  const i = taxaJurosPctAm / 100;
  const n = numeroParcelas;

  const valorParcela = i > 0
    ? parseFloat((valorContratado * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)).toFixed(2))
    : parseFloat((valorContratado / n).toFixed(2));

  const parcelas: ParcelaCalculada[] = [];
  let saldoDevedor = valorContratado;

  for (let numero = 1; numero <= n; numero++) {
    const juros = parseFloat((saldoDevedor * i).toFixed(2));
    let amortizacao = parseFloat((valorParcela - juros).toFixed(2));
    let parcela = valorParcela;

    // Última parcela: ajusta centavos de arredondamento pra saldo fechar em zero.
    if (numero === n) {
      amortizacao = saldoDevedor;
      parcela = parseFloat((amortizacao + juros).toFixed(2));
    }

    saldoDevedor = parseFloat((saldoDevedor - amortizacao).toFixed(2));

    parcelas.push({
      numero_parcela: numero,
      vencimento: addMeses(dataPrimeiraParcela, numero - 1),
      valor_parcela: parcela,
      valor_juros: juros,
      valor_amortizacao: amortizacao,
      saldo_devedor_apos: Math.max(0, saldoDevedor),
    });
  }

  return parcelas;
}

/** Consórcio: N parcelas iguais, mensais, sem juros — valor já vem definido pelo usuário. */
export function gerarParcelasFixas(
  valorParcela: number,
  numeroParcelas: number,
  dataPrimeiraParcela: string
): { numero_parcela: number; vencimento: string; valor: number }[] {
  const parcelas = [];
  for (let numero = 1; numero <= numeroParcelas; numero++) {
    parcelas.push({
      numero_parcela: numero,
      vencimento: addMeses(dataPrimeiraParcela, numero - 1),
      valor: valorParcela,
    });
  }
  return parcelas;
}
