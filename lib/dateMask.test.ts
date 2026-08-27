import { describe, expect, it } from "vitest";
import { aplicarEdicao, paraSegmentos, paraTexto, posParaSegmento, segmentoParaPos, toDisplay, toISO } from "./dateMask";

// Simula um input controlado dd/mm/aaaa aplicando as mesmas funções puras
// que components/ui/DateInput.tsx usa em handleChange/handleKeyDown — sem
// precisar de DOM (o vitest do projeto não tem suporte a componente .tsx).
class Sim {
  display: string;
  caret = 0;

  constructor(display = "") {
    this.display = display;
  }

  /** native = o que o DOM teria após o navegador aplicar a edição, antes do handleChange rodar. */
  change(native: string) {
    const antes = this.display;
    const depois = native;

    let p = 0;
    const maxP = Math.min(antes.length, depois.length);
    while (p < maxP && antes[p] === depois[p]) p++;
    let s = 0;
    const maxS = Math.min(antes.length - p, depois.length - p);
    while (s < maxS && antes[antes.length - 1 - s] === depois[depois.length - 1 - s]) s++;

    const fimRemovido = antes.length - s;
    const inserido = depois.slice(p, depois.length - s).replace(/\D/g, "");

    const segsOriginais = paraSegmentos(antes);
    const { seg: pSeg, offset: pOff } = posParaSegmento(antes, p);
    const { seg: endSeg, offset: endOff } = posParaSegmento(antes, fimRemovido);

    const { segs, caretSeg, caretOffset } = aplicarEdicao(segsOriginais, pSeg, pOff, endSeg, endOff, inserido);
    this.display = paraTexto(segs);
    this.caret = segmentoParaPos(segs, caretSeg, caretOffset);
    return this;
  }

  /** digita um caractere no cursor atual (sem seleção) */
  type(ch: string, pos = this.caret) {
    return this.change(this.display.slice(0, pos) + ch + this.display.slice(pos));
  }

  /** seleciona [start,end) e digita `str` por cima */
  typeOverSelection(str: string, start: number, end: number) {
    return this.change(this.display.slice(0, start) + str + this.display.slice(end));
  }

  /** seleciona [start,end) e apaga (Backspace/Delete com seleção — handleKeyDown não intercepta) */
  deleteSelection(start: number, end: number) {
    return this.change(this.display.slice(0, start) + this.display.slice(end));
  }

  paste(str: string, selStart = this.caret, selEnd = selStart) {
    return this.change(this.display.slice(0, selStart) + str + this.display.slice(selEnd));
  }

  /** Backspace com cursor colapsado em `pos`, replicando handleKeyDown do componente. */
  backspace(pos: number) {
    const segs = paraSegmentos(this.display);
    let { seg, offset } = posParaSegmento(this.display, pos);
    if (offset === 0) {
      if (seg === 0) return this;
      seg -= 1;
      offset = segs[seg].length;
    }
    if (offset === 0) return this;
    segs[seg] = segs[seg].slice(0, offset - 1) + segs[seg].slice(offset);
    offset -= 1;
    const temLacuna = (segs[0] === "" && (segs[1] !== "" || segs[2] !== "")) || (segs[1] === "" && segs[2] !== "");
    if (temLacuna) return this;
    this.display = paraTexto(segs);
    this.caret = segmentoParaPos(segs, seg, offset);
    return this;
  }
}

describe("DateInput — máscara dd/mm/aaaa", () => {
  it("digita uma data completa do zero", () => {
    const s = new Sim("");
    for (const ch of "27082026") s.type(ch);
    expect(s.display).toBe("27/08/2026");
  });

  it("duplo-clique no mês + Delete preserva dia e ano, depois aceita o novo mês", () => {
    const s = new Sim("27/08/2026");
    s.deleteSelection(3, 5); // seleciona "08"
    expect(s.display.split("/")[0]).toBe("27");
    expect(s.display.split("/")[2]).toBe("2026");
    s.type("1", s.caret);
    s.type("2", s.caret);
    expect(s.display).toBe("27/12/2026");
  });

  it("duplo-clique no dia + Delete + digitar não vaza pro mês/ano", () => {
    const s = new Sim("27/08/2026");
    s.deleteSelection(0, 2); // seleciona "27"
    s.type("0", s.caret);
    s.type("5", s.caret);
    expect(s.display).toBe("05/08/2026");
  });

  it("digitar direto por cima de um bloco selecionado (sem apagar antes)", () => {
    const s = new Sim("27/08/2026");
    s.typeOverSelection("12", 3, 5);
    expect(s.display).toBe("27/12/2026");
  });

  it("selecionar tudo e digitar uma data nova por cima", () => {
    const s = new Sim("27/08/2026");
    s.typeOverSelection("1", 0, 10);
    for (const ch of "6062027") s.type(ch);
    expect(s.display).toBe("16/06/2027");
  });

  it("cola uma data completa num campo vazio, com ou sem barras", () => {
    expect(new Sim("").paste("27082026").display).toBe("27/08/2026");
    expect(new Sim("").paste("27/08/2026").display).toBe("27/08/2026");
  });

  it("backspace na ponta apaga o último dígito do ano", () => {
    const s = new Sim("27/08/2026");
    s.backspace(10);
    expect(s.display).toBe("27/08/202");
  });

  it("backspace logo após a barra do dia apaga o dígito do dia (não fica preso)", () => {
    const s = new Sim("27/08/2026");
    s.backspace(3);
    expect(s.display).toBe("2/08/2026");
  });

  it("corrigir um dígito do dia isoladamente não mexe no mês/ano", () => {
    const s = new Sim("27/08/2026");
    s.backspace(2);
    expect(s.display).toBe("2/08/2026");
    s.type("5", s.caret);
    expect(s.display).toBe("25/08/2026");
  });
});

describe("toDisplay / toISO", () => {
  it("converte ISO completo pra exibição e volta", () => {
    expect(toDisplay("2026-08-27")).toBe("27/08/2026");
    expect(toISO("27/08/2026")).toBe("2026-08-27");
  });

  it("preenche dia/mês com zero à esquerda ao converter pra ISO", () => {
    expect(toISO("5/8/2026")).toBe("2026-08-05");
  });

  it("texto parcial (sem os 3 blocos) não é convertido", () => {
    expect(toISO("27/08")).toBe("27/08");
    expect(toDisplay("27/08/2026")).toBe("27/08/2026"); // sem "-", já é display
  });
});
