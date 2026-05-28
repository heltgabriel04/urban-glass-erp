"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const NAV = [
  {
    grupo: "VISÃO GERAL",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "⬡" },
    ],
  },
  {
    grupo: "COMERCIAL",
    items: [
      { href: "/orcamentos", label: "Orçamentos", icon: "◻" },
      { href: "/pedidos",    label: "Pedidos",    icon: "◈" },
      { href: "/clientes",   label: "Clientes",   icon: "◎" },
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
      { href: "/produtos",   label: "Produtos",         icon: "◫" },
      { href: "/tabelas",    label: "Tabelas de Preço", icon: "▦" },
      { href: "/relatorios", label: "Relatórios & BI",  icon: "◭" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <aside className="sb">
      <div className="logo-area">
        <div className="logo-row">
          <div className="logo-ico">UG</div>
          <div>
            <div className="logo-name">Urban<span>Glass</span></div>
          </div>
        </div>
        <div className="logo-ver">ERP Industrial v3</div>
      </div>

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

      <div className="sb-ft">
        <span className="ver-tag">v3.0.0 · 2026</span>
        <button
          onClick={handleLogout}
          style={{
            background: "transparent",
            border: "1px solid var(--b2)",
            borderRadius: "6px",
            color: "var(--t3)",
            fontSize: "10px",
            padding: "4px 9px",
            cursor: "pointer",
            fontFamily: "'DM Mono', monospace",
            transition: "0.1s",
          }}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.color = "var(--err)";
            (e.target as HTMLButtonElement).style.borderColor = "var(--err)";
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.color = "var(--t3)";
            (e.target as HTMLButtonElement).style.borderColor = "var(--b2)";
          }}
        >
          ⏻ sair
        </button>
      </div>
    </aside>
  );
}