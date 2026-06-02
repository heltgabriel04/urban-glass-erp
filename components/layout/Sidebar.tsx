"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    ],
  },
  {
    grupo: "OPERAÇÃO",
    items: [
      { href: "/otimizador", label: "Otimizador de Corte", icon: "◇" },
      { href: "/producao",   label: "Produção",             icon: "⬡" },
      { href: "/estoque",    label: "Estoque · Chapas",     icon: "▣" },
      { href: "/retalhos",   label: "Retalhos",             icon: "▤" },
    ],
  },
  {
    grupo: "FINANCEIRO",
    items: [
      { href: "/financeiro", label: "Contas a Receber",    icon: "◉" },
      { href: "/fluxo",      label: "Fluxo de Caixa",      icon: "◈" },
      { href: "/notas",      label: "Notas Fiscais",        icon: "◧" },
    ],
  },
  {
    grupo: "GESTÃO",
    items: [
      { href: "/produtos",   label: "Produtos",             icon: "◫" },
      { href: "/tabelas",    label: "Tabelas de Preço",     icon: "▦" },
      { href: "/relatorios", label: "Relatórios & BI",      icon: "◭" },
    ],
  },
];

function LogoIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="62" height="62" rx="13" fill="#0f1219" stroke="#2d5fa6" strokeWidth="2" />
      <text
        x="32" y="40"
        textAnchor="middle"
        fontFamily="'Syne', sans-serif"
        fontSize="20"
        fontWeight="800"
        fill="white"
        letterSpacing="1"
      >UG</text>
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

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
          overflow: hidden;
          z-index: 30;
        }
        .sb:hover {
          width: 232px;
          min-width: 232px;
          box-shadow: 4px 0 24px rgba(0,0,0,.4);
        }

        .sb-logo-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 12px;
          border-bottom: 1px solid var(--b1);
          text-decoration: none;
          transition: background 0.12s;
          cursor: pointer;
        }
        .sb-logo-wrap:hover { background: rgba(61,255,160,.04); }

        .sb-logo-text {
          opacity: 0;
          transition: opacity 0.12s 0.06s;
          white-space: nowrap;
          overflow: hidden;
          min-width: 0;
        }
        .sb:hover .sb-logo-text { opacity: 1; }

        .sb-logo-name {
          font-family: 'Syne', sans-serif;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--t1);
          line-height: 1.1;
        }
        .sb-logo-sub {
          font-size: 8px;
          color: var(--t3);
          letter-spacing: 2px;
          text-transform: uppercase;
          font-family: 'DM Mono', monospace;
          margin-top: 1px;
        }

        .ni-label {
          opacity: 0;
          transition: opacity 0.12s 0.06s;
          white-space: nowrap;
          overflow: hidden;
        }
        .sb:hover .ni-label { opacity: 1; }

        .ns {
          overflow: hidden;
          white-space: nowrap;
          transition: opacity 0.12s;
          opacity: 0;
        }
        .sb:hover .ns { opacity: 1; }

        .sb-ft {
          padding: 12px;
          border-top: 1px solid var(--b1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: auto;
          overflow: hidden;
          white-space: nowrap;
        }
        .sb-ft-ver {
          font-size: 9px;
          color: var(--t3);
          font-family: 'DM Mono', monospace;
          opacity: 0;
          transition: opacity 0.12s;
          overflow: hidden;
          white-space: nowrap;
        }
        .sb:hover .sb-ft-ver { opacity: 1; }

        .ni { position: relative; }
        .ni-ic { flex-shrink: 0; width: 18px; text-align: center; }

        .sb:not(:hover) .ni[data-label]::after {
          content: attr(data-label);
          position: absolute;
          left: 52px;
          top: 50%;
          transform: translateY(-50%);
          background: var(--surf3);
          border: 1px solid var(--b2);
          color: var(--t1);
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 6px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.1s;
          z-index: 100;
          font-family: 'DM Mono', monospace;
        }
        .sb:not(:hover) .ni[data-label]:hover::after { opacity: 1; }
      `}</style>

      <aside className="sb">

        <Link href="/dashboard" className="sb-logo-wrap">
          <div style={{ flexShrink: 0 }}>
            <LogoIcon size={32} />
          </div>
          <div className="sb-logo-text">
            <div className="sb-logo-name">UrbanGlass</div>
            <div className="sb-logo-sub">ERP Industrial</div>
          </div>
        </Link>

        {NAV.map((grupo) => (
          <div key={grupo.grupo}>
            <div className="ns">{grupo.grupo}</div>
            {grupo.items.map((item) => {
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
        ))}

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