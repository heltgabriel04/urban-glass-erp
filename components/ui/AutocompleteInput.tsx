"use client";

import { useEffect, useRef, useState } from "react";

interface Option {
  id: number;
  label: string;
  sub?: string;
}

interface Props {
  options: Option[];
  value: number | null;
  onChange: (id: number, label: string) => void;
  placeholder?: string;
  disabled?: boolean;
  tabIndex?: number;
}

export default function AutocompleteInput({ options, value, onChange, placeholder = "Buscar...", disabled, tabIndex }: Props) {
  const [query, setQuery]             = useState("");
  const [aberto, setAberto]           = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (value === null) { setQuery(""); return; }
    const opt = options.find(o => o.id === value);
    if (opt) setQuery(opt.label);
  }, [value, options]);

  const filtrados = query.length === 0
    ? options.slice(0, 8)
    : options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sub ?? "").toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8);

  function selecionar(opt: Option) {
    onChange(opt.id, opt.label);
    setQuery(opt.label);
    setAberto(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!aberto) { if (e.key === "ArrowDown" || e.key === "Enter") setAberto(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtrados.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); if (filtrados[highlighted]) selecionar(filtrados[highlighted]); }
    if (e.key === "Escape")    { setAberto(false); }
  }

  function handleBlur() {
    setTimeout(() => setAberto(false), 150);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        className="fc"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        tabIndex={tabIndex}
        onChange={e => { setQuery(e.target.value); setAberto(true); setHighlighted(0); }}
        onFocus={() => setAberto(true)}
        onBlur={handleBlur}
        onKeyDown={handleKey}
        autoComplete="off"
      />
      {aberto && filtrados.length > 0 && (
        <ul
          ref={listRef}
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
            background: "var(--surf2)", border: "1px solid var(--acc)",
            borderRadius: "8px", marginTop: "4px", padding: "4px",
            listStyle: "none", maxHeight: "220px", overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          {filtrados.map((opt, i) => (
            <li
              key={opt.id}
              onMouseDown={() => selecionar(opt)}
              style={{
                padding: "8px 10px", borderRadius: "6px", cursor: "pointer",
                background: i === highlighted ? "rgba(61,255,160,.12)" : "transparent",
                borderLeft: i === highlighted ? "2px solid var(--acc)" : "2px solid transparent",
                transition: "all 0.1s",
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              <div style={{ fontSize: "13px", color: "var(--t1)", fontWeight: 500 }}>{opt.label}</div>
              {opt.sub && <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px", fontFamily: "'DM Mono', monospace" }}>{opt.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}