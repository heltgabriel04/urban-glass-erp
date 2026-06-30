export interface ItemPdfImportado {
  produto_nome: string;
  largura: number;
  altura: number;
  quantidade: number;
  valor_m2: number;
}

const SKIP_RE =
  /^#\s+PRODUTO|PRODUTO\s*\/\s*VIDRO|Subtotal|^TOTAL|^urbanglass|Urban Glass|CNPJ|Inscr\.|Endere|Cidade|Contato|LOCAL|COMPRADOR|CONDI|OBSERVA|Boleto|Retirada|Cliente|Valores|Proposta|Data:|Validade:|Vendedor|Prazo|ORC-|\d{2}\/\d{2}\/\d{4}|https?:\/\//i;

/**
 * Extrai itens de um PDF de pedido/orçamento gerado por este sistema.
 *
 * Formato dos dados no PDF:
 *   "{idx} {produto_nome}"        ← nome do produto na mesma linha que o índice
 *   "{spec}\t{qty}\t{W} × {H} mm\t{m2} R$ {price/m2}\tR$ {total}"
 */
export function parsePdfOrcamentoText(text: string): ItemPdfImportado[] {
  const items: ItemPdfImportado[] = [];

  // Matches: qty width × height mm m2 R$ price/m2 R$ total
  const dataRe =
    /(\d+)\s+(\d+)\s*[×x]\s*(\d+)\s*mm\s+([\d,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/g;

  let m: RegExpExecArray | null;
  while ((m = dataRe.exec(text)) !== null) {
    const qty = parseInt(m[1], 10);
    const largura = parseInt(m[2], 10);
    const altura = parseInt(m[3], 10);
    // m[4]=m², m[5]=R$/m², m[6]=total
    const valorM2 = parseFloat(m[5].replace(/\./g, "").replace(",", "."));

    if (largura <= 0 || altura <= 0 || qty <= 0) continue;

    // Product name: last non-empty, non-skip line before the data line
    // Format: "{idx} CHAPA 4+4 Incolor"
    const before = text.slice(Math.max(0, m.index - 300), m.index);
    const beforeLines = before.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 2);

    let produtoNome = "";
    for (let j = beforeLines.length - 1; j >= 0; j--) {
      const l = beforeLines[j];
      if (SKIP_RE.test(l)) continue;
      if (/[·•]/.test(l)) continue; // skip spec lines like "4+4 · 8mm · Incolor"
      if (/\d+\s*[×x]\s*\d+/.test(l)) continue; // skip other data lines
      // Remove leading index number if present: "1 CHAPA 4+4 Incolor" → "CHAPA 4+4 Incolor"
      produtoNome = l.replace(/^\d+\s+/, "").trim();
      break;
    }

    items.push({ produto_nome: produtoNome, largura, altura, quantidade: qty, valor_m2: valorM2 });
  }

  return items;
}
