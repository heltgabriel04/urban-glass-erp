"use client";

import { useEffect, useState } from "react";
import { useTheme } from "./ThemeProvider";

interface Props {
  onMenuClick?: () => void;
}

export default function Topbar({ onMenuClick }: Props) {
  const [hora, setHora] = useState("");
  const { theme, toggle } = useTheme();

  useEffect(() => {
    function tick() {
      setHora(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  const data = new Date().toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="no-print topbar" style={{
      padding: "10px 26px",
      borderBottom: "1px solid var(--b1)",
      background: "var(--surf)",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "8px",
      flexShrink: 0,
    }}>
      <style>{`
        .topbar-hamburger {
          display: none;
          align-items: center; justify-content: center;
          width: 30px; height: 30px;
          border-radius: 6px;
          border: 1px solid var(--b1);
          background: var(--surf2);
          color: var(--t2);
          cursor: pointer;
          font-size: 15px; line-height: 1;
          margin-right: auto;
          flex-shrink: 0;
        }
        @media (max-width: 860px) {
          .topbar-hamburger { display: inline-flex; }
        }
        .topbar-busca {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 12px; border-radius: 6px;
          border: 1px solid var(--b1); background: var(--surf2);
          color: var(--t3); cursor: pointer; font-size: 12px;
          transition: border-color 0.1s, color 0.1s;
          flex-shrink: 0;
        }
        .topbar-busca:hover { border-color: var(--acc); color: var(--acc); }
        .topbar-busca .kbd { font-family: 'DM Mono', monospace; font-size: 10px; opacity: 0.7; }
        @media (max-width: 640px) { .topbar-busca .kbd, .topbar-busca .lbl { display: none; } .topbar-busca { padding: 6px 8px; } }
      `}</style>
      <button
        className="topbar-hamburger"
        onClick={onMenuClick}
        title="Abrir menu"
        aria-label="Abrir menu"
      >
        ☰
      </button>
      <button
        className="topbar-busca"
        onClick={() => window.dispatchEvent(new Event("ug:abrir-busca"))}
        title="Buscar (Ctrl+K)"
      >
        <span>⌕</span>
        <span className="lbl">Buscar pedido, cliente, lançamento...</span>
        <span className="kbd">Ctrl K</span>
      </button>
      <div className="clk">{data} · {hora}</div>
      <button
        onClick={toggle}
        title={theme === "dark" ? "Alternar para tema claro" : "Alternar para tema escuro"}
        style={{
          background: "var(--surf2)",
          border: "1px solid var(--b1)",
          borderRadius: "6px",
          padding: "5px 10px",
          cursor: "pointer",
          color: "var(--t2)",
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          transition: "border-color 0.1s, color 0.1s",
          fontFamily: "inherit",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--acc)"; e.currentTarget.style.color = "var(--acc)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.color = "var(--t2)"; }}
      >
        {theme === "dark" ? "☀" : "☽"}
      </button>
    </div>
  );
}