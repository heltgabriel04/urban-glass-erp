"use client";

import { useEffect, useState } from "react";

export default function Topbar() {
  const [hora, setHora] = useState("");

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
      flexShrink: 0,
    }}>
      <div className="clk">{data} · {hora}</div>
    </div>
  );
}