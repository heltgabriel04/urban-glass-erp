export interface MedidaImportada {
  largura: number;
  altura: number;
  quantidade: number;
}

/**
 * Extrai largura/altura/quantidade de linhas de planilha. Detecta as colunas pelo
 * cabeçalho (Largura/Altura/Quantidade, em qualquer ordem e caixa); se não achar
 * cabeçalho, assume largura na 1ª coluna e altura na 2ª. Quantidade em branco vira 1
 * e linhas sem largura/altura válidas são ignoradas (cobre as linhas vazias do final
 * da planilha exportada do Excel).
 */
export function parseLinhasMedidas(rows: unknown[][]): MedidaImportada[] {
  if (rows.length === 0) return [];

  const header = rows[0].map(h => String(h ?? "").trim().toLowerCase());
  const idxLargura = header.findIndex(h => h.includes("larg"));
  const idxAltura  = header.findIndex(h => h.includes("alt"));
  const idxQtd     = header.findIndex(h => h.includes("quant") || h === "qtd" || h === "qtde");
  const temCabecalho = idxLargura >= 0 || idxAltura >= 0;

  const li = idxLargura >= 0 ? idxLargura : 0;
  const ai = idxAltura  >= 0 ? idxAltura  : 1;
  const qi = idxQtd;

  const out: MedidaImportada[] = [];
  for (let r = temCabecalho ? 1 : 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const largura = Math.round(Number(row[li]) || 0);
    const altura  = Math.round(Number(row[ai]) || 0);
    if (largura <= 0 || altura <= 0) continue;
    const qtdBruta = qi >= 0 ? Math.round(Number(row[qi]) || 0) : 1;
    out.push({ largura, altura, quantidade: qtdBruta > 0 ? qtdBruta : 1 });
  }
  return out;
}

/**
 * Lê um arquivo .xlsx/.xls/.csv selecionado pelo usuário e devolve as medidas da primeira aba.
 * Carrega a lib `xlsx` sob demanda (import dinâmico) para não inflar o bundle das telas de
 * pedido/orçamento com uma dependência só usada quando o usuário realmente importa uma planilha.
 */
export async function lerPlanilhaMedidas(file: File): Promise<MedidaImportada[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return parseLinhasMedidas(rows);
}
