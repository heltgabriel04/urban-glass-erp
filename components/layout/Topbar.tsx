"use client";

import { useEffect, useState } from "react";
import { useTheme } from "./ThemeProvider";

export default function Topbar() {
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
    <div style={{
      padding: "10px 26px",
      borderBottom: "1px solid var(--b1)",
      background: "var(--surf)",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "8px",
      flexShrink: 0,
    }}>
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