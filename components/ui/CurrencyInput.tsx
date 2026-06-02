"use client";

import { useEffect, useRef, useState } from "react";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
  disabled?: boolean;
}

export default function CurrencyInput({
  value,
  onChange,
  placeholder = "R$ 0,00",
  title,
  style,
  className = "fc",
  disabled,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState("");
  const focused = useRef(false);

  // Quando o valor externo muda (e campo não está focado), formata para exibição
  useEffect(() => {
    if (!focused.current) {
      setDisplay(value > 0 ? formatarExibicao(value) : "");
    }
  }, [value]);

  function formatarExibicao(v: number): string {
    return v.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  }

  function handleFocus() {
    focused.current = true;
    // Ao focar, mostra só o número sem R$ para facilitar edição
    setDisplay(value > 0 ? value.toFixed(2).replace(".", ",") : "");
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDisplay(raw);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Permite: números, vírgula, ponto, backspace, delete, tab, arrows
    const allowed = ["Backspace","Delete","Tab","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End",".","," ];
    if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  }

  function handleBlur() {
    focused.current = false;
    // Converte o que o usuário digitou para número
    const raw = display
      .replace(/R\$\s?/g, "")
      .replace(/\./g, "")   // remove pontos de milhar
      .replace(",", ".");    // vírgula vira ponto decimal
    const num = parseFloat(raw) || 0;
    onChange(num);
    setDisplay(num > 0 ? formatarExibicao(num) : "");
  }

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      title={title}
      style={style}
      disabled={disabled}
      onFocus={handleFocus}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}