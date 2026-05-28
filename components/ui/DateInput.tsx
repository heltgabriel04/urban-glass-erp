"use client";

interface DateInputProps {
  value: string; // yyyy-mm-dd
  onChange: (v: string) => void;
  className?: string;
}

export default function DateInput({ value, onChange, className = "fc" }: DateInputProps) {
  // Converte yyyy-mm-dd → dd/mm/yyyy para exibir
  const toDisplay = (v: string) => {
    if (!v || !v.includes("-")) return v;
    const parts = v.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return v;
  };

  // Converte dd/mm/yyyy → yyyy-mm-dd para salvar
  const toISO = (v: string) => {
    const parts = v.split("/");
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
    }
    return v;
  };

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.replace(/[^\d/]/g, "");
    // Auto-insere /
    if (v.length === 2 && !v.includes("/")) v += "/";
    if (v.length === 5 && v.split("/").length === 2) v += "/";
    // Se completo, converte para ISO
    const parts = v.split("/");
    if (parts.length === 3 && parts[2].length === 4) {
      onChange(toISO(v));
    } else {
      onChange(v);
    }
  }

  return (
    <input
      className={className}
      type="text"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      value={toDisplay(value)}
      onChange={handleChange}
    />
  );
}