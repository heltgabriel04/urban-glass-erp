"use client";

import { useEffect, useRef, useState } from "react";
import { useEscToClose } from "@/components/ui/useEscToClose";
import type { WidgetDef } from "./useWidgetsVisiveis";

interface Props {
  widgets: WidgetDef[];
  visivel: (key: string) => boolean;
  toggle: (key: string) => void;
}

// Botão "⚙ Personalizar" — abre um painel com um checkbox por widget do
// nível atual. Fica salvo por usuário (dashboard_widget_config), não
// mexe em nada de mais ninguém.
export default function PersonalizarWidgets({ widgets, visivel, toggle }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  useEscToClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onClickFora(e: MouseEvent) {
      const t = e.target as Node;
      if (painelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [open]);

  function abrir(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 240) });
    }
    setOpen(v => !v);
  }

  return (
    <>
      <button ref={btnRef} type="button" className="btn bg xs" onClick={abrir}>⚙ Personalizar</button>

      {open && pos && (
        <div ref={painelRef} style={{
          position: "fixed", top: pos.top, left: pos.left, width: "240px",
          background: "var(--surf3)", border: "1px solid var(--b2)",
          borderRadius: "8px", boxShadow: "var(--sh2)", padding: "10px",
          zIndex: 300,
        }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Widgets visíveis nesta aba
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {widgets.map(w => (
              <label key={w.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--t1)", cursor: "pointer" }}>
                <input type="checkbox" checked={visivel(w.key)} onChange={() => toggle(w.key)} />
                {w.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
