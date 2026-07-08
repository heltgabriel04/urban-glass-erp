"use client";

import { useRef, useState, useEffect } from "react";
import { useEscToClose } from "./useEscToClose";

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

interface Props {
  items: ActionMenuItem[];
  title?: string;
}

export default function ActionMenu({ items, title = "Ações" }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEscToClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onClickFora(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 180) });
    }
    setOpen(v => !v);
  }

  const visiveis = items.filter(i => !i.hidden);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onClick={toggle}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "26px", height: "26px", borderRadius: "6px",
          background: open ? "var(--surf2)" : "transparent",
          border: "1px solid var(--b2)", color: "var(--t2)",
          fontSize: "14px", fontWeight: 700, cursor: "pointer", lineHeight: 1,
        }}
      >⋯</button>

      {open && pos && (
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left, width: "180px",
            background: "var(--surf3)", border: "1px solid var(--b2)",
            borderRadius: "8px", boxShadow: "var(--sh2)", padding: "4px",
            zIndex: 300, display: "flex", flexDirection: "column", gap: "1px",
          }}
        >
          {visiveis.length === 0 && (
            <div style={{ padding: "8px 10px", fontSize: "12px", color: "var(--t3)" }}>Nenhuma ação</div>
          )}
          {visiveis.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setOpen(false); item.onClick(); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "7px 10px", fontSize: "12.5px", borderRadius: "5px",
                background: "transparent", border: "none", cursor: "pointer",
                color: item.danger ? "var(--err)" : "var(--t1)",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "var(--surf2)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
