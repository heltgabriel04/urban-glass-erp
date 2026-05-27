"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    grupo: "VISÃO GERAL",
    items: [
      { href: "/dashboard", label: "Dashboard",   icon: "⬡" },
    ],
  },
  {
    grupo: "COMERCIAL",
    items: [
      { href: "/pedidos",   label: "Pedidos",      icon: "◈", badge: null },
      { href: "/clientes",  label: "Clientes",     icon: "◎" },
    ],
  },
  {
    grupo: "OPERAÇÃO",
    items: [
      { href: "/otimizador", label: "Otimizador de Corte", icon: "◇" },
      { href: "/producao",   label: "Produção",            icon: "⬡" },
      { href: "/estoque",    label: "Estoque · Chapas",    icon: "▣" },
      { href: "/retalhos",   label: "Retalhos",            icon: "▤" },
    ],
  },
  {
    grupo: "FINANCEIRO",
    items: [
      { href: "/financeiro", label: "Contas a Receber", icon: "◉" },
      { href: "/fluxo",      label: "Fluxo de Caixa",   icon: "◈" },
    ],
  },
  {
    grupo: "GESTÃO",
    items: [
      { href: "/produtos",   label: "Produtos",          icon: "◫" },
      { href: "/tabelas",    label: "Tabelas de Preço",  icon: "▦" },
      { href: "/relatorios", label: "Relatórios & BI",   icon: "◭" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sb">
      {/* Logo */}
      <div className="logo-area">
        <div className="logo-row">
          <div className="logo-ico">UG</div>
          <div>
            <div className="logo-name">
              Urban<span>Glass</span>
            </div>
          </div>
        </div>
        <div className="logo-ver">ERP Industrial v3</div>
      </div>

      {/* Nav */}
      {NAV.map((grupo) => (
        <div key={grupo.grupo}>
          <div className="ns">{grupo.grupo}</div>
          {grupo.items.map((item) => {
            const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`ni${ativo ? " active" : ""}`}
              >
                <span className="ni-ic">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}

      {/* Footer */}
      <div className="sb-ft">
        <span className="ver-tag">v3.0.0 · 2026</span>
        <span style={{ fontSize: "10px", color: "var(--t3)" }}>⬡ online</span>
      </div>
    </aside>
  );
}