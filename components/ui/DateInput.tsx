"use client";

import { useId } from "react";

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

  const toDisplay = (v: string) => {
    if (!v || !v.includes("-")) return v;
    const parts = v.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return v;
  };

  const toISO = (v: string) => {
    const parts = v.split("/");
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
    }
    return v;
  };

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Monta a máscara só a partir dos dígitos digitados, ignorando qualquer
    // "/" que o usuário tenha digitado — evita duplicar barra quando ele
    // seleciona o campo já preenchido e digita a data inteira por cima
    // (ex.: "16/06/2026" virando "16//06/202" truncado nos 10 caracteres).
    const digitos = e.target.value.replace(/\D/g, "").slice(0, 8);
    let v = digitos;
    if (digitos.length > 4) v = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
    else if (digitos.length > 2) v = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;

    if (digitos.length === 8) {
      onChange(toISO(v));
    } else {
      onChange(v);
    }
  }

  return (
    <input
      id={inputId}
      name={inputId}
      className={className}
      style={style}
      type="text"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      tabIndex={tabIndex}
      value={toDisplay(value)}
      onChange={handleChange}
    />
  );
}