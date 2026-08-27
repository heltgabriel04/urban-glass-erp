"use client";

import { useEffect, useId, useRef } from "react";
import { aplicarEdicao, paraSegmentos, paraTexto, posParaSegmento, segmentoParaPos, toDisplay, toISO } from "@/lib/dateMask";

interface DateInputProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  tabIndex?: number;
  id?: string;
}

export default function DateInput({ value, onChange, className = "fc", style, tabIndex, id }: DateInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  const display = toDisplay(value);

  // Depois que o valor mascarado muda, o React troca o value do input de novo
  // e o navegador jogaria o cursor pro final — aqui a gente restaura a posição certa.
  useEffect(() => {
    if (caretRef.current != null && inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [value]);

  function aplicarTexto(texto: string, caretPos: number) {
    caretRef.current = Math.min(caretPos, texto.length);
    const digitos = texto.replace(/\D/g, "").slice(0, 8);
    onChange(digitos.length === 8 ? toISO(texto) : texto);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Descobre exatamente o que mudou comparando com o texto exibido antes
    // (prefixo/sufixo em comum), em vez de jogar tudo fora e remontar a
    // máscara só pela contagem total de dígitos. Isso importa sempre que a
    // edição não é um dígito simples no fim: selecionar um bloco (duplo-
    // clique no mês, por ex.) e digitar/apagar por cima, ou colar uma data,
    // mexe num trecho do meio — remontar do zero por contagem de dígitos
    // deslocava dia/mês/ano uns pros outros e a data salva saía errada.
    const antes = display;
    const depois = e.target.value;

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
    const texto = paraTexto(segs);
    aplicarTexto(texto, segmentoParaPos(segs, caretSeg, caretOffset));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start !== end) return; // seleção de texto: deixa o navegador cuidar (onChange já trata)

    const segs = paraSegmentos(display);
    let { seg, offset } = posParaSegmento(display, start);

    if (e.key === "Backspace") {
      if (offset === 0) {
        if (seg === 0) return; // já no início do dia, nada a apagar
        seg -= 1;
        offset = segs[seg].length; // pula a barra e vai pro fim do bloco anterior
      }
      if (offset === 0) return; // bloco anterior já vazio
      segs[seg] = segs[seg].slice(0, offset - 1) + segs[seg].slice(offset);
      offset -= 1;
    } else {
      if (offset === segs[seg].length) {
        if (seg === 2) return; // já no fim do ano, nada a apagar
        seg += 1;
        offset = 0; // pula a barra e apaga o início do próximo bloco
      }
      segs[seg] = segs[seg].slice(0, offset) + segs[seg].slice(offset + 1);
    }

    // Esvaziar um bloco do meio (dia ou mês) enquanto um bloco depois dele
    // ainda tem conteúdo criaria um "buraco" (ex.: dia e ano preenchidos,
    // mês vazio) que essa máscara simples não sabe representar sem ambiguidade.
    // Nesse caso raro, não intercepta — deixa o comportamento nativo de antes.
    const temLacuna = (segs[0] === "" && (segs[1] !== "" || segs[2] !== "")) || (segs[1] === "" && segs[2] !== "");
    if (temLacuna) return;

    e.preventDefault();
    const novoTexto = paraTexto(segs);
    aplicarTexto(novoTexto, segmentoParaPos(segs, seg, offset));
  }

  return (
    <input
      ref={inputRef}
      id={inputId}
      name={inputId}
      className={className}
      style={style}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      tabIndex={tabIndex}
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}
