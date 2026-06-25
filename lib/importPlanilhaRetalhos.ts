export interface RetalhoImportado {
  produto_nome: string;
  largura: number;
  altura: number;
  espessura: number | null;
  box: string | null;
  localizacao: string | null;
  chapa_origem: string | null;
  quantidade: number;
}

/**
 * Extrai retalhos de linhas de planilha pelo cabeçalho (qualquer ordem de colunas).
 * Reconhece: Material/Produto/Vidro, Largura, Altura, Espessura, Box/Caixa,
 * Localização, Chapa Origem, Quantidade. Exige cabeçalho com produto + largura +
 * altura identificáveis — sem isso não há como posicionar as colunas com segurança,
 * então devolve lista vazia (a UI orienta a corrigir a planilha).
 */
export function parseLinhasRetalhos(rows: unknown[][]): RetalhoImportado[] {
  if (rows.length === 0) return [];

  const header = rows[0].map(h => String(h ?? "").trim().toLowerCase());
  const idx = (...keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)));

  const iProduto    = idx("produto", "material", "vidro");
  const iLargura    = idx("larg");
  const iAltura     = idx("alt");
  const iEspessura  = idx("espess");
  const iBox        = idx("box", "caixa");
  const iLocal      = idx("local");
  const iChapa      = idx("chapa");
  const iQtd        = idx("quant", "qtd", "qtde");

  if (iProduto < 0 || iLargura < 0 || iAltura < 0) return [];

  const out: RetalhoImportado[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const produto_nome = String(row[iProduto] ?? "").trim();
    const largura = Math.round(Number(row[iLargura]) || 0);
    const altura  = Math.round(Number(row[iAltura]) || 0);
    if (!produto_nome || largura <= 0 || altura <= 0) continue;

    const espessuraBruta = iEspessura >= 0 ? Number(row[iEspessura]) : NaN;
    const qtdBruta = iQtd >= 0 ? Math.round(Number(row[iQtd]) || 0) : 1;

    out.push({
      produto_nome,
      largura,
      altura,
      espessura:    !isNaN(espessuraBruta) && espessuraBruta > 0 ? espessuraBruta : null,
      box:          iBox   >= 0 ? (String(row[iBox]   ?? "").trim() || null) : null,
      localizacao:  iLocal >= 0 ? (String(row[iLocal] ?? "").trim() || null) : null,
      chapa_origem: iChapa >= 0 ? (String(row[iChapa] ?? "").trim() || null) : null,
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
