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
  tabIndex?: number;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2,
  });
}

export default function CurrencyInput({
  value, onChange,
  placeholder = "R$ 0,00",
  title, style, className = "fc", disabled, tabIndex,
  onFocus: onFocusProp, onBlur: onBlurProp,
}: CurrencyInputProps) {
  const [cents, setCents] = useState(Math.round((value ?? 0) * 100));
  const focused = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) {
      setCents(Math.round((value ?? 0) * 100));
    }
  }, [value]);

  function pinEnd() {
    const el = ref.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = true;
    setTimeout(pinEnd, 0);
    onFocusProp?.(e);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = false;
    onBlurProp?.(e);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Deixa atalhos de teclado (ctrl+c, ctrl+v, etc.) passarem
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const next = Math.min(cents * 10 + Number(e.key), 999_999_999);
      setCents(next);
      onChange(next / 100);
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const next = Math.floor(cents / 10);
      setCents(next);
      onChange(next / 100);
      return;
    }

    // Permite teclas de navegação e funcionais
    if (!["Tab","Enter","Escape","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(e.key)) {
      e.preventDefault();
    }
  }

  // Fallback para colar (paste) e teclado virtual mobile
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    const next = digits ? Math.min(parseInt(digits, 10), 999_999_999) : 0;
    setCents(next);
    onChange(next / 100);
  }

  return (
    <input
      ref={ref}
      className={className}
      type="text"
      inputMode="numeric"
      value={cents > 0 ? fmt(cents) : ""}
      placeholder={placeholder}
      title={title}
      style={style}
      disabled={disabled}
      tabIndex={tabIndex}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onClick={pinEnd}
    />
  );
}
