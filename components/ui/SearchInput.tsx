"use client";

import { useId, type CSSProperties } from "react";
import { X } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Mostra a lupa "⌕" e usa o visual padrão de busca do cabeçalho de listagem (.tb-search). */
  icon?: boolean;
  /** Classe do <input>, para reaproveitar estilos existentes (ex.: "fc") quando icon=false. */
  className?: string;
  wrapperStyle?: CSSProperties;
  inputStyle?: CSSProperties;
  id?: string;
}

export default function SearchInput({
  value, onChange, placeholder, icon = true, className, wrapperStyle, inputStyle, id,
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={icon ? "tb-search" : undefined} style={{ position: "relative", ...wrapperStyle }}>
      {icon && <span className="tb-search-ic">⌕</span>}
      <input
        id={inputId}
        name={inputId}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, paddingRight: value ? "28px" : inputStyle?.paddingRight }}
      />
      {value && (
        <button
          type="button"
          title="Limpar busca"
          onClick={() => onChange("")}
          className="tb-search-clear"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
