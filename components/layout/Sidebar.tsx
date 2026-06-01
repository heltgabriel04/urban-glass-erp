"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const NAV = [
  {
    grupo: "VISÃO GERAL",
    items: [
      { href: "/dashboard", label: "Dashboard",        icon: "⬡" },
    ],
  },
  {
    grupo: "COMERCIAL",
    items: [
      { href: "/orcamentos", label: "Orçamentos",      icon: "◻" },
      { href: "/pedidos",    label: "Pedidos",          icon: "◈" },
      { href: "/clientes",   label: "Clientes",         icon: "◎" },
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

        /* Logo: só ícone quando colapsado */
        .logo-area { overflow: hidden; white-space: nowrap; }
        .logo-name-full { transition: opacity 0.15s 0.08s; }
        .sb:not(:hover) .logo-name-full { opacity: 0; }

        /* Labels dos itens: ocultos quando colapsado */
        .ni-label {
          opacity: 1;
          transition: opacity 0.12s 0.06s;
          white-space: nowrap;
          overflow: hidden;
        }
        .sb:not(:hover) .ni-label { opacity: 0; }

        /* Grupos: ocultos quando colapsado */
        .ns {
          overflow: hidden;
          white-space: nowrap;
          transition: opacity 0.12s;
        }
        .sb:not(:hover) .ns { opacity: 0; }

        /* Footer */
        .sb-ft { overflow: hidden; white-space: nowrap; }
        .sb-ft-label {
          transition: opacity 0.12s;
          white-space: nowrap;
        }
        .sb:not(:hover) .sb-ft-label { opacity: 0; width: 0; overflow: hidden; }

        /* Ícone sempre centrado quando colapsado, alinhado à esq quando expandido */
        .ni {
          justify-content: flex-start;
        }
        .ni-ic {
          flex-shrink: 0;
          width: 18px;
          text-align: center;
        }

        /* Tooltip no ícone quando colapsado */
        .ni { position: relative; }
        .sb:not(:hover) .ni::after {
          content: attr(data-label);
          position: absolute;
          left: 56px;
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
        .sb:not(:hover) .ni:hover::after {
          opacity: 1;
        }
      `}</style>

      <aside className="sb">
        {/* Logo */}
        <div className="logo-area" style={{ padding:"20px 14px 14px", borderBottom:"1px solid var(--b1)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <div style={{ width:"28px", height:"28px", background:"linear-gradient(135deg, var(--acc), var(--acc2))", borderRadius:"7px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", fontWeight:900, color:"#090b10", flexShrink:0, fontFamily:"'Syne', sans-serif" }}>
              UG
            </div>
            <div className="logo-name-full">
              <div style={{ fontFamily:"'Syne', sans-serif", fontSize:"15px", fontWeight:800, letterSpacing:"-0.5px", color:"var(--acc)" }}>
                UrbanGlass
              </div>
              <div style={{ fontSize:"8px", color:"var(--t3)", letterSpacing:"2px", textTransform:"uppercase", fontFamily:"'DM Mono', monospace", marginTop:"1px" }}>
                ERP Industrial
              </div>
            </div>
          </div>
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
                  data-label={item.label}
                  className={`ni${ativo ? " active" : ""}`}
                  title=""
                >
                  <span className="ni-ic">{item.icon}</span>
                  <span className="ni-label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        {/* Footer */}
        <div className="sb-ft">
          <span className="ver-tag sb-ft-label">v3.0.0 · 2026</span>
          <button
            onClick={handleLogout}
            title="Sair"
            style={{ background:"transparent", border:"1px solid var(--b2)", borderRadius:"6px", color:"var(--t3)", fontSize:"10px", padding:"4px 9px", cursor:"pointer", fontFamily:"'DM Mono', monospace", transition:"0.1s", flexShrink:0 }}
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