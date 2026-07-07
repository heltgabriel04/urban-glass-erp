import type { MedidaImportada } from "./importPlanilhaMedidas";

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Agrupa itens de texto do PDF em linhas de tabela. PDFs não têm "células" de
 * verdade — cada trecho de texto vem com posição (x,y) solta, então uma linha
 * da tabela é reconstruída juntando os textos cuja posição Y é próxima (mesma
 * altura na página) e ordenando por X (esquerda pra direita).
 */
export function agruparEmLinhas(items: TextItem[]): TextItem[][] {
  const validos = items.filter(it => it.str.trim() !== "");
  const porY = [...validos].sort((a, b) => b.y - a.y); // topo da página primeiro

  const linhas: TextItem[][] = [];
  const TOLERANCIA_Y = 4; // pt — trechos na mesma linha visual variam poucos pontos de y
  for (const item of porY) {
    const linha = linhas.find(l => Math.abs(l[0].y - item.y) <= TOLERANCIA_Y);
    if (linha) linha.push(item);
    else linhas.push([item]);
  }
  return linhas.map(l => [...l].sort((a, b) => a.x - b.x));
}

/**
 * Interpreta uma linha (lista de células de texto, esquerda pra direita) como
 * uma peça da "Relação de Vidros": ITEM · CÓDIGO · LARGURA · ALTURA · QUANT ·
 * TIPO DE VIDRO · (OBS opcional) · M². Identifica as células pelo TIPO de
 * conteúdo (não pela posição fixa), porque a coluna OBS às vezes vem vazia
 * (não gera célula nenhuma) e às vezes vem preenchida — então o número de
 * células varia entre linhas.
 * Retorna null se a linha não bate com esse formato (cabeçalho, rodapé, título
 * da obra etc. — linhas que não são peça nenhuma).
 */
export function interpretarLinha(linha: TextItem[]): MedidaImportada | null {
  const cells = linha.map(c => c.str.trim());
  if (cells.length < 6) return null;

  const item = parseInt(cells[0], 10);
  if (!Number.isFinite(item) || item <= 0 || String(item) !== cells[0]) return null;

  const codigo = cells[1];
  if (!codigo || /^[\d.,]+$/.test(codigo)) return null; // precisa ser um código, não outro número

  const largura = parseInt(cells[2], 10);
  const altura = parseInt(cells[3], 10);
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura <= 0 || altura <= 0) return null;
  if (largura > 6000 || altura > 6000) return null; // fora da faixa plausível de chapa de vidro

  const quantidade = parseInt(cells[4], 10);

  return {
    largura, altura,
    quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1,
    codigo,
  };
}

/**
 * Lê um PDF no formato "Relação de Vidros" (peça por linha: item, código,
 * largura, altura, quantidade, tipo de vidro, obs opcional, m²) e devolve as
 * medidas — mesmo formato de saída da importação por planilha
 * (`MedidaImportada`), então alimenta o mesmo fluxo de "Novo Pedido".
 * Roda no servidor (rota `/api/pedidos/importar-medidas-pdf`) porque o pdfjs
 * exige um worker que é mais simples de rodar em Node do que empacotado no
 * bundle do navegador.
 */
export async function parseRelacaoVidrosPdf(buffer: Buffer): Promise<MedidaImportada[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data }).promise;

  const medidas: MedidaImportada[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items: TextItem[] = tc.items.map((it: any) => ({
      str: String(it.str ?? ""),
      x: it.transform[4],
      y: it.transform[5],
    }));
    for (const linha of agruparEmLinhas(items)) {
      const m = interpretarLinha(linha);
      if (m) medidas.push(m);
    }
  }
  return medidas;
}
