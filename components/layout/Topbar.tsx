"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TITULOS: Record<string, string> = {
  "/dashboard":  "Dashboard",
  "/pedidos":    "Pedidos",
  "/clientes":   "Clientes",
  "/otimizador": "◈ Otimizador de Corte",
  "/producao":   "Produção",
  "/estoque":    "Estoque · Chapas",
  "/retalhos":   "Retalhos",
  "/financeiro": "Contas a Receber",
  "/fluxo":      "Fluxo de Caixa",
  "/produtos":   "Produtos",
  "/tabelas":    "Tabelas de Preço",
  "/relatorios": "Relatórios & BI",
};

export default function Topbar() {
  const pathname = usePathname();
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

  const titulo = TITULOS[pathname] ?? (
  pathname.startsWith("/pedidos/") ? "Pedidos" : "Urban Glass ERP"
);
  const data = new Date().toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="tb">
      <div className="tb-title">{titulo}</div>

      <div className="tb-search">
        <span className="tb-search-ic">⌕</span>
        <input placeholder="Buscar pedido, cliente..." />
      </div>

      <div className="clk">{data} · {hora}</div>
    </div>
  );
}