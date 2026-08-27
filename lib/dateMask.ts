// Lógica pura da máscara dd/mm/aaaa usada por components/ui/DateInput.tsx.
// Separada num módulo .ts (sem JSX) pra poder ser testada com o vitest do
// projeto, que não tem suporte a componente .tsx configurado.

// dd/mm/aaaa tratado como 3 blocos independentes (dia, mês, ano), não como
// uma tira de dígitos remontada por posição — evita que apagar/corrigir um
// bloco vaze dígito pro vizinho e evita o "preso na barra" do Backspace/Delete.
export type Segmentos = [string, string, string];

export function paraSegmentos(display: string): Segmentos {
  const partes = display.split("/");
  return [partes[0] ?? "", partes[1] ?? "", partes[2] ?? ""];
}

// remonta o texto incluindo a barra de um bloco só quando há algo depois dela
export function paraTexto([d, m, a]: Segmentos): string {
  let texto = d;
  if (m !== "" || a !== "") texto += `/${m}`;
  if (a !== "") texto += `/${a}`;
  return texto;
}

// posição do cursor (índice no texto exibido) -> {bloco, offset dentro do bloco}
export function posParaSegmento(display: string, pos: number): { seg: number; offset: number } {
  const partes = display.split("/");
  let acumulado = 0;
  for (let i = 0; i < partes.length; i++) {
    const fim = acumulado + partes[i].length;
    if (pos <= fim) return { seg: i, offset: pos - acumulado };
    acumulado = fim + 1; // +1 pula a barra
  }
  const ultimo = partes.length - 1;
  return { seg: ultimo, offset: partes[ultimo]?.length ?? 0 };
}

// {bloco, offset} -> posição no texto reconstruído
export function segmentoParaPos(segs: Segmentos, seg: number, offset: number): number {
  let pos = 0;
  for (let i = 0; i < seg; i++) pos += segs[i].length + 1; // +1 da barra
  return pos + offset;
}

export const LARGURA_BLOCO: [number, number, number] = [2, 2, 4]; // dia, mês, ano

// Aplica uma edição (substituir o trecho [pSeg:pOff .. endSeg:endOff] pelos
// dígitos de `inserido`) diretamente nos blocos, sem nunca achatar a data
// inteira numa tira de dígitos — é isso que evita o dia/mês/ano se
// embaralharem quando a edição cobre mais de um bloco (ex.: selecionar o mês
// inteiro e digitar/apagar por cima).
export function aplicarEdicao(
  segsOriginais: Segmentos,
  pSeg: number, pOff: number,
  endSeg: number, endOff: number,
  inserido: string,
): { segs: Segmentos; caretSeg: number; caretOffset: number } {
  const segs: Segmentos = [...segsOriginais];
  const prefixo = segsOriginais[pSeg].slice(0, pOff);
  const sufixo = segsOriginais[endSeg].slice(endOff);

  segs[pSeg] = prefixo + inserido + (endSeg === pSeg ? sufixo : "");
  for (let i = pSeg + 1; i < endSeg; i++) segs[i] = ""; // blocos totalmente cobertos pela edição
  if (endSeg > pSeg) segs[endSeg] = sufixo;

  let caretSeg = pSeg;
  let caretOffset = prefixo.length + inserido.length;

  // Transborda pro próximo bloco quando um bloco passa da largura (dia/mês:
  // 2 dígitos, ano: 4) — o mesmo "avançar de bloco" que já acontecia
  // digitando do zero, agora também editando no meio de uma data existente.
  for (let i = pSeg; i < 2; i++) {
    if (segs[i].length <= LARGURA_BLOCO[i]) break;
    const transbordo = segs[i].slice(LARGURA_BLOCO[i]);
    segs[i] = segs[i].slice(0, LARGURA_BLOCO[i]);
    segs[i + 1] = transbordo + segs[i + 1];
    if (caretSeg === i && caretOffset > LARGURA_BLOCO[i]) {
      caretSeg = i + 1;
      caretOffset -= LARGURA_BLOCO[i];
    }
  }
  // Ano nunca passa de 4 dígitos — excedente é descartado (mesmo total
  // máximo de 8 dígitos que a máscara sempre respeitou).
  if (segs[2].length > LARGURA_BLOCO[2]) segs[2] = segs[2].slice(0, LARGURA_BLOCO[2]);

  return { segs, caretSeg, caretOffset };
}

/** "aaaa-mm-dd" (ou texto parcial) -> "dd/mm/aaaa" pra exibição. */
export function toDisplay(v: string): string {
  if (!v || !v.includes("-")) return v;
  const parts = v.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return v;
}

/** "dd/mm/aaaa" completo -> ISO "aaaa-mm-dd"; texto parcial volta sem alteração. */
export function toISO(v: string): string {
  const parts = v.split("/");
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return v;
}
