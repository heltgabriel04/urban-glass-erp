export interface LinhaExtratoImportada {
  data: string;   // YYYY-MM-DD
  valor: number;  // sempre positivo — sinal vira `tipo`
  tipo: "Entrada" | "Saída";
  descricao: string;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}

function parseData(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // dd/mm/aaaa ou dd-mm-aaaa
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  // aaaa-mm-dd (já ISO, ou vindo de célula de data do Excel serializada como texto)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

function parseValor(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  let s = String(raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/[^\d,.\-]/g, ""); // remove "R$", espaços etc.
  // formato BR "1.234,56" -> "1234.56"; formato já com ponto decimal fica como está
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrai data/valor/descrição de linhas de extrato bancário exportado como
 * CSV. Detecta colunas pelo cabeçalho (Data/Date, Valor/Value/Amount,
 * Descrição/Histórico/Description), tolerante a acento/caixa/ordem — mesmo
 * princípio de `lib/importPlanilhaMedidas.ts`. Valor negativo (ou com sinal
 * de saída) vira `tipo: 'Saída'`; positivo vira `'Entrada'`.
 */
export function parseLinhasExtrato(rows: unknown[][]): LinhaExtratoImportada[] {
  if (rows.length === 0) return [];

  const header = rows[0].map(h => normalizar(String(h ?? "").trim().toLowerCase()));
  const idxData = header.findIndex(h => h.includes("data") || h.includes("date"));
  const idxValor = header.findIndex(h => h.includes("valor") || h.includes("amount") || h.includes("value"));
  const idxDesc = header.findIndex(h => h.includes("descri") || h.includes("histor") || h.includes("memo"));
  const temCabecalho = idxData >= 0 || idxValor >= 0;

  const di = idxData >= 0 ? idxData : 0;
  const vi = idxValor >= 0 ? idxValor : 1;
  const ci = idxDesc >= 0 ? idxDesc : 2;

  const out: LinhaExtratoImportada[] = [];
  for (let r = temCabecalho ? 1 : 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const data = parseData(row[di]);
    const valorBruto = parseValor(row[vi]);
    if (!data || valorBruto === null || valorBruto === 0) continue;
    out.push({
      data,
      valor: Math.abs(valorBruto),
      tipo: valorBruto < 0 ? "Saída" : "Entrada",
      descricao: ci >= 0 ? String(row[ci] ?? "").trim() : "",
    });
  }
  return out;
}

// Roda no servidor — mesmo padrão de lib/importPlanilhaMedidas.ts, só que
// lendo de um Buffer (rota de API) em vez de um File do navegador.
export async function parseExtratoCsvBuffer(buffer: Buffer): Promise<LinhaExtratoImportada[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return parseLinhasExtrato(rows);
}
