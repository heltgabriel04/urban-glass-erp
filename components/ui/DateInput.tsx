"use client";

interface DateInputProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  tabIndex?: number;
}

export default function DateInput({ value, onChange, className = "fc", tabIndex }: DateInputProps) {
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
    let v = e.target.value.replace(/[^\d/]/g, "");
    if (v.length === 2 && !v.includes("/")) v += "/";
    if (v.length === 5 && v.split("/").length === 2) v += "/";
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
      tabIndex={tabIndex}
      value={toDisplay(value)}
      onChange={handleChange}
    />
  );
}