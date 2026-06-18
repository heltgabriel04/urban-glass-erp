"use client";

import type { CSSProperties } from "react";

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
}

export default function SearchInput({
  value, onChange, placeholder, icon = true, className, wrapperStyle, inputStyle,
}: Props) {
  return (
    <div className={icon ? "tb-search" : undefined} style={{ position: "relative", ...wrapperStyle }}>
      {icon && <span className="tb-search-ic">⌕</span>}
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, paddingRight: value ? "26px" : inputStyle?.paddingRight }}
      />
      {value && (
        <button
          type="button"
          title="Limpar busca"
          onClick={() => onChange("")}
          style={{ position:"absolute", right:"6px", top:"50%", transform:"translateY(-50%)", width:"16px", height:"16px", display:"flex", alignItems:"center", justifyContent:"center", border:"none", background:"transparent", color:"var(--t3)", cursor:"pointer", fontSize:"13px", lineHeight:1, padding:0 }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--t1)"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--t3)"}
        >×</button>
      )}
    </div>
  );
}
