"use client";

import { useEffect, useId, useRef } from "react";

interface DateInputProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  tabIndex?: number;
  id?: string;
}

// dd/mm/aaaa tratado como 3 blocos independentes (dia, mês, ano), não como
// uma tira de dígitos remontada por posição — evita que apagar/corrigir um
// bloco vaze dígito pro vizinho e evita o "preso na barra" do Backspace/Delete.
type Segmentos = [string, string, string];

function paraSegmentos(display: string): Segmentos {
  const partes = display.split("/");
  return [partes[0] ?? "", partes[1] ?? "", partes[2] ?? ""];
}

// remonta o texto incluindo a barra de um bloco só quando há algo depois dela
function paraTexto([d, m, a]: Segmentos): string {
  let texto = d;
  if (m !== "" || a !== "") texto += `/${m}`;
  if (a !== "") texto += `/${a}`;
  return texto;
}

// posição do cursor (índice no texto exibido) -> {bloco, offset dentro do bloco}
function posParaSegmento(display: string, pos: number): { seg: number; offset: number } {
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
function segmentoParaPos(segs: Segmentos, seg: number, offset: number): number {
  let pos = 0;
  for (let i = 0; i < seg; i++) pos += segs[i].length + 1; // +1 da barra
  return pos + offset;
}

export default function DateInput({ value, onChange, className = "fc", style, tabIndex, id }: DateInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  const toDisplay = (v: string) => {
    if (!v || !v.includes("-")) return v;
    const parts = v.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return v;
  };

  const toISO = (v: string) => {
    const parts = v.split("/");
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
    return v;
  };

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
    // Monta a máscara só a partir dos dígitos digitados, ignorando qualquer
    // "/" que o usuário tenha digitado — evita duplicar barra quando ele
    // seleciona o campo já preenchido e digita a data inteira por cima
    // (ex.: "16/06/2026" virando "16//06/202" truncado nos 10 caracteres).
    const digitos = e.target.value.replace(/\D/g, "").slice(0, 8);
    let v = digitos;
    if (digitos.length > 4) v = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
    else if (digitos.length > 2) v = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    aplicarTexto(v, e.target.selectionStart ?? v.length);
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
