export interface DadosBoleto {
  valor: number;
  vencimento: string | null; // YYYY-MM-DD, null se fator de vencimento vier zerado
}

// Base do fator de vencimento definida pela FEBRABAN: fator 0 = 07/10/1997.
const DATA_BASE = new Date(1997, 9, 7);

/**
 * Extrai valor e vencimento da linha digitável (47 dígitos) de um boleto
 * bancário — cálculo determinístico sobre os dígitos, sem OCR nem parsing
 * de PDF. O campo 5 da linha digitável (últimos 14 dígitos) já traz o
 * fator de vencimento (4) + valor em centavos (10), sem precisar
 * reconstruir o código de barras completo.
 */
export function parseLinhaDigitavel(linhaBruta: string): DadosBoleto | null {
  const linha = linhaBruta.replace(/\D/g, "");
  if (linha.length !== 47) return null;

  const campo5 = linha.slice(33, 47); // fator vencimento (4) + valor (10)
  const fatorVencimento = parseInt(campo5.slice(0, 4), 10);
  const valorCentavos = parseInt(campo5.slice(4, 14), 10);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) return null;

  let vencimento: string | null = null;
  if (Number.isFinite(fatorVencimento) && fatorVencimento > 0) {
    const data = new Date(DATA_BASE);
    data.setDate(data.getDate() + fatorVencimento);
    vencimento = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  }

  return { valor: valorCentavos / 100, vencimento };
}
