export interface RetalhoImportado {
  produto_nome: string;
  largura: number;
  altura: number;
  espessura: number | null;
  box: string | null;
  localizacao: string | null;
  chapa_origem: string | null;
  observacao: string | null;
  quantidade: number;
}

// Extrai espessura total de nomes como "Laminado 4+4 Bronze" → 8, "Refletivo 6mm" → 6
function espessuraDoNome(nome: string): number | null {
  const laminado = nome.match(/(\d+)\+(\d+)/);
  if (laminado) return parseInt(laminado[1]) + parseInt(laminado[2]);
  const mm = nome.match(/(\d+)\s*mm/i);
  if (mm) return parseInt(mm[1]);
  return null;
}

/**
 * Extrai retalhos de linhas de planilha pelo cabeçalho (qualquer ordem de colunas).
 *
 * Reconhece: Material/Produto/Vidro, Largura/Dimensões, Altura (ou coluna logo após
 * Largura/Dimensões quando sem cabeçalho), Espessura, Box/Caixa/Local, Localização,
 * Chapa Origem, Observação/Obs (ex: nome do cliente dono), Quantidade.
 *
 * Exige pelo menos produto + largura + altura identificáveis — sem isso devolve [].
 */
export function parseLinhasRetalhos(rows: unknown[][]): RetalhoImportado[] {
  if (rows.length === 0) return [];

  const header = rows[0].map(h => String(h ?? "").trim().toLowerCase());
  const idx = (...keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)));

  const iProduto   = idx("produto", "material", "vidro");
  const iLargura   = idx("larg", "dimens");
  const iEspessura = idx("espess");
  // "LOCAL" → box (valores como "BOX 1"); "Localização" → localizacao
  const iBox       = idx("box", "caixa", "local");
  const iLocal     = idx("localiz");
  const iChapa     = idx("chapa");
  const iQtd       = idx("quant", "qtd", "qtde");
  const iObs       = idx("observ", "obs", "cliente");

  // Se não encontrou altura, tenta a coluna imediatamente após largura/dimensões
  // (planilha com "DIMENSÕES | <sem cabeçalho>" é o caso padrão do Excel interno)
  let iAltura = idx("alt");
  if (iAltura < 0 && iLargura >= 0 && header[iLargura + 1] === "") {
    iAltura = iLargura + 1;
  }

  if (iProduto < 0 || iLargura < 0 || iAltura < 0) return [];

  const out: RetalhoImportado[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const produto_nome = String(row[iProduto] ?? "").trim();
    const largura = Math.round(Number(row[iLargura]) || 0);
    const altura  = Math.round(Number(row[iAltura]) || 0);
    if (!produto_nome || largura <= 0 || altura <= 0) continue;

    const espessuraBruta = iEspessura >= 0 ? Number(row[iEspessura]) : NaN;
    const espessura = (!isNaN(espessuraBruta) && espessuraBruta > 0)
      ? espessuraBruta
      : espessuraDoNome(produto_nome);

    const qtdBruta = iQtd >= 0 ? Math.round(Number(row[iQtd]) || 0) : 1;

    out.push({
      produto_nome,
      largura,
      altura,
      espessura,
      box:          iBox   >= 0 ? (String(row[iBox]   ?? "").trim() || null) : null,
      localizacao:  iLocal >= 0 ? (String(row[iLocal] ?? "").trim() || null) : null,
      chapa_origem: iChapa >= 0 ? (String(row[iChapa] ?? "").trim() || null) : null,
      observacao:   iObs   >= 0 ? (String(row[iObs]   ?? "").trim() || null) : null,
      quantidade:   qtdBruta > 0 ? qtdBruta : 1,
    });
  }
  return out;
}

/**
 * Lê um arquivo .xlsx/.xls/.csv selecionado pelo usuário e devolve os retalhos da
 * primeira aba. Carrega a lib `xlsx` sob demanda (import dinâmico) por ser usada só
 * na importação manual.
 */
export async function lerPlanilhaRetalhos(file: File): Promise<RetalhoImportado[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return parseLinhasRetalhos(rows);
}
