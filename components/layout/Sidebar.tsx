"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

const NAV = [
  {
    grupo: "VISÃO GERAL",
    items: [
      { href: "/dashboard", label: "Dashboard",            icon: "⬡" },
    ],
  },
  {
    grupo: "COMERCIAL",
    items: [
      { href: "/orcamentos", label: "Orçamentos",          icon: "◻" },
      { href: "/pedidos",    label: "Pedidos",              icon: "◈" },
      { href: "/clientes",   label: "Clientes",             icon: "◎" },
      { href: "/vendedores", label: "Vendedores",           icon: "◉" },
    ],
  },
  {
    grupo: "OPERAÇÃO",
    items: [
      { href: "/otimizador", label: "Otimizador de Corte", icon: "◇" },
      { href: "/producao",   label: "Produção",             icon: "⬡" },
      { href: "/estoque",    label: "Estoque · Chapas",     icon: "▣" },
      { href: "/retalhos",   label: "Retalhos",             icon: "▤" },
      { href: "/qualidade",  label: "Qualidade",            icon: "◉" },
    ],
  },
  {
    grupo: "FINANCEIRO",
    items: [
      { href: "/contas-receber",  label: "Contas a Receber",  icon: "↑" },
      { href: "/contas-pagar",   label: "Contas a Pagar",    icon: "↓" },
      { href: "/fluxo",          label: "Fluxo de Caixa",    icon: "◈" },
      { href: "/movimentacoes",  label: "Movimentações",     icon: "≡" },
      { href: "/investimentos",  label: "Investimentos",     icon: "◆" },
      // Para reexibir apresentação: { href: "/investimentos/apresentacao", label: "Investimentos · Apresentação", icon: "◇" },
      { href: "/notas",          label: "Notas Fiscais",     icon: "◧" },
      { href: "/contabilidade",  label: "Contabilidade",     icon: "◑" },
    ],
  },
  {
    grupo: "CONFIGURAÇÕES",
    items: [
      { href: "/plano-contas", label: "Plano de Contas", icon: "≡" },
    ],
  },
  {
    grupo: "GESTÃO",
    items: [
      { href: "/produtos",   label: "Produtos",             icon: "◫" },
      { href: "/tabelas",    label: "Tabelas de Preço",     icon: "▦" },
      { href: "/relatorios", label: "Relatórios & BI",      icon: "◭" },
      { href: "/giro",       label: "Giro & Cobertura",     icon: "↻" },
      { href: "/logs",       label: "Histórico",            icon: "◷" },
    ],
  },
];

function LogoIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="62" height="62" rx="13" fill="#0f1219" stroke="#2d5fa6" strokeWidth="2" />
      <text x="32" y="40" textAnchor="middle" fontFamily="'Syne', sans-serif" fontSize="20" fontWeight="800" fill="white" letterSpacing="1">UG</text>
    </svg>
  );
}

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(grupo: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(grupo) ? next.delete(grupo) : next.add(grupo);
      return next;
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <>
      <style>{`
        .sb {
          width: 56px;
          min-width: 56px;
          transition: width 0.22s cubic-bezier(0.4,0,0.2,1),
                      min-width 0.22s cubic-bezier(0.4,0,0.2,1),
                      box-shadow 0.22s;
          overflow-x: hidden;
          z-index: 30;
          display: flex;
          flex-direction: column;
        }
        .sb:hover {
          width: 232px;
          min-width: 232px;
          box-shadow: 4px 0 24px rgba(0,0,0,.4);
        }

        /* ── Nav scrollável ── */
        .sb-nav {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
          scrollbar-color: var(--b2) transparent;
        }
        .sb-nav::-webkit-scrollbar { width: 3px; }
        .sb-nav::-webkit-scrollbar-thumb { background: var(--b2); border-radius: 2px; }
        .sb-nav::-webkit-scrollbar-track { background: transparent; }

        /* ── Logo ── */
        .sb-logo-wrap {
          display: flex; align-items: center; gap: 10px;
          padding: 16px 12px; border-bottom: 1px solid var(--b1);
          text-decoration: none; transition: background 0.12s; cursor: pointer;
          flex-shrink: 0;
        }
        .sb-logo-wrap:hover { background: rgba(61,255,160,.04); }
        .sb-logo-text {
          opacity: 0; transition: opacity 0.12s 0.06s;
          white-space: nowrap; overflow: hidden; min-width: 0;
        }
        .sb:hover .sb-logo-text { opacity: 1; }
        .sb-logo-name {
          font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800;
          letter-spacing: -0.5px; color: var(--t1); line-height: 1.1;
        }
        .sb-logo-sub {
          font-size: 8px; color: var(--t3); letter-spacing: 2px;
          text-transform: uppercase; font-family: 'DM Mono', monospace; margin-top: 1px;
        }

        /* ── Grupo header ── */
        .ns {
          display: flex; align-items: center; justify-content: space-between;
          overflow: hidden; white-space: nowrap;
          opacity: 0; transition: opacity 0.12s;
          cursor: pointer; user-select: none;
        }
        .sb:hover .ns { opacity: 1; }
        .ns:hover { color: var(--t1) !important; }
        .ns-chev {
          font-size: 11px; color: var(--t3); flex-shrink: 0;
          transition: transform 0.2s; margin-right: 2px;
          display: inline-block;
        }

        /* ── Items colapsáveis ──
           Em modo ícone (sb não hover): sempre visíveis.
           Em modo expandido (sb hover): respeitam estado collapsed. */
        .sb-items {
          overflow: hidden;
          transition: max-height 0.22s ease;
        }
        .sb:not(:hover) .sb-items { max-height: 999px !important; }
        .sb:hover       .sb-items.grp-open     { max-height: 500px; }
        .sb:hover       .sb-items.grp-collapsed { max-height: 0; }

        /* ── Item de nav ── */
        .ni-label {
          opacity: 0; transition: opacity 0.12s 0.06s;
          white-space: nowrap; overflow: hidden;
        }
        .sb:hover .ni-label { opacity: 1; }
        .ni { position: relative; }
        .ni-ic { flex-shrink: 0; width: 18px; text-align: center; }

        /* Tooltip no modo ícone */
        .sb:not(:hover) .ni[data-label]::after {
          content: attr(data-label);
          position: fixed;
          left: 60px;
          background: var(--surf3); border: 1px solid var(--b2);
          color: var(--t1); font-size: 11px; padding: 4px 10px;
          border-radius: 6px; white-space: nowrap; pointer-events: none;
          opacity: 0; transition: opacity 0.1s; z-index: 200;
          font-family: 'DM Mono', monospace;
        }
        .sb:not(:hover) .ni[data-label]:hover::after { opacity: 1; }

        /* ── Footer ── */
        .sb-ft {
          padding: 12px; border-top: 1px solid var(--b1);
          display: flex; align-items: center; justify-content: space-between;
          overflow: hidden; white-space: nowrap; flex-shrink: 0;
        }
        .sb-ft-ver {
          font-size: 9px; color: var(--t3); font-family: 'DM Mono', monospace;
          opacity: 0; transition: opacity 0.12s; overflow: hidden; white-space: nowrap;
        }
        .sb:hover .sb-ft-ver { opacity: 1; }
      `}</style>

      <aside className="sb">

        {/* Logo */}
        <Link href="/dashboard" className="sb-logo-wrap">
          <div style={{ flexShrink: 0 }}><LogoIcon size={32} /></div>
          <div className="sb-logo-text">
            <div className="sb-logo-name">UrbanGlass</div>
            <div className="sb-logo-sub">ERP Industrial</div>
          </div>
        </Link>

        {/* Nav scrollável */}
        <div className="sb-nav">
          {NAV.map(({ grupo, items }) => {
            const isCollapsed = collapsed.has(grupo);
            const hasActive   = items.some(i => pathname === i.href || pathname.startsWith(i.href + "/"));

            return (
              <div key={grupo}>
                {/* Header do grupo — clicável para colapsar */}
                <div
                  className="ns"
                  onClick={() => toggle(grupo)}
                  title={isCollapsed ? `Expandir ${grupo}` : `Recolher ${grupo}`}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    {hasActive && isCollapsed && (
                      <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--acc)", display: "inline-block", flexShrink: 0 }} />
                    )}
                    {grupo}
                  </span>
                  <span
                    className="ns-chev"
                    style={{ transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}
                  >›</span>
                </div>

                {/* Items */}
                <div className={`sb-items ${isCollapsed ? "grp-collapsed" : "grp-open"}`}>
                  {items.map((item) => {
                    const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        data-label={item.label}
                        className={`ni${ativo ? " active" : ""}`}
                      >
                        <span className="ni-ic">{item.icon}</span>
                        <span className="ni-label">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer fixo */}
        <div className="sb-ft">
          <span className="sb-ft-ver">v3.0.0 · 2026</span>
          <button
            onClick={handleLogout}
            title="Sair"
            style={{
              background: "transparent", border: "1px solid var(--b2)",
              borderRadius: "6px", color: "var(--t3)", fontSize: "10px",
              padding: "4px 9px", cursor: "pointer",
              fontFamily: "'DM Mono', monospace", transition: "0.1s", flexShrink: 0,
            }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.color = "var(--err)"; b.style.borderColor = "var(--err)"; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.color = "var(--t3)"; b.style.borderColor = "var(--b2)"; }}
          >
            ⏻
          </button>
        </div>

      </aside>
    </>
  );
}
