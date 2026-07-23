"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { NAV_ROUTES } from "@/lib/navRoutes";
import Icon from "@/components/ui/Icon";

const IC = {
  dashboard:   ["M2 2h5v5H2z", "M9 2h5v5H9z", "M2 9h5v5H2z", "M9 9h5v5H9z"],
  orcamentos:  ["M9.5 1.5H3.5a.5.5 0 00-.5.5v12a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V5.5L9.5 1.5z", "M9.5 1.5v4h4", "M5.5 7.5h5", "M5.5 10h5", "M5.5 12.5h3"],
  pedidos:     ["M10.5 2H12a.5.5 0 01.5.5v12a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V2.5A.5.5 0 014 2h1.5", "M5.5 2a1 1 0 011-1h3a1 1 0 011 1H5.5z", "M5.5 6.5l1 1 2-2", "M5.5 9.5l1 1 2-2", "M5.5 12.5h3"],
  clientes:    ["M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5z", "M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"],
  vendedores:  ["M5 7a2 2 0 100-4 2 2 0 000 4z", "M1 13.5c0-2.5 1.8-4 4-4", "M11 7a2 2 0 100-4 2 2 0 000 4z", "M15 13.5c0-2.5-1.8-4-4-4", "M8 14a3.5 3.5 0 00-3.5-3.5h3A3.5 3.5 0 0111.5 14"],
  otimizador:  ["M5.5 3.5a2 2 0 100 3 2 2 0 000-3z", "M5.5 9.5a2 2 0 100 3 2 2 0 000-3z", "M7.5 5l7 6", "M7.5 11l7-6"],
  aps:         ["M2 2.5h12a.5.5 0 01.5.5v10a.5.5 0 01-.5.5H2a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5z", "M1.5 5.5h13", "M5 1.5v2", "M11 1.5v2", "M5 8.5h1.5", "M9 8.5h1.5", "M5 11h6"],
  producao:    ["M8 10a2 2 0 100-4 2 2 0 000 4z", "M8 1.5V3", "M8 13v1.5", "M1.5 8H3", "M13 8h1.5", "M3.6 3.6l1.1 1.1", "M11.3 11.3l1.1 1.1", "M3.6 12.4l1.1-1.1", "M11.3 4.7l1.1-1.1"],
  compras:     ["M1.5 1.5h2l1.5 7h7l1.5-4.5H4.5", "M6 13a1 1 0 100-2 1 1 0 000 2z", "M10.5 13a1 1 0 100-2 1 1 0 000 2z"],
  fornecedores:["M1.5 11.5h11v-5l-2-3h-9v8z", "M8 3.5v8", "M4.5 13a1 1 0 100-2 1 1 0 000 2z", "M9.5 13a1 1 0 100-2 1 1 0 000 2z", "M12.5 11.5h2v-3l-2-2"],
  estoque:     ["M8 1.5l5.5 3v7L8 15l-5.5-3.5v-7L8 1.5z", "M8 1.5v13", "M2.5 4.5l5.5 3 5.5-3"],
  retalhos:    ["M2 2h5v5H2z", "M2 9h4.5v4.5H2z", "M9 2h5v5H9z", "M9 10h2M9 12.5h4.5M12 9v4.5"],
  qualidade:   ["M8 1.5L2 4.5v4c0 3 2.5 5.5 6 6 3.5-.5 6-3 6-6v-4L8 1.5z", "M5.5 8l2 2 3-3"],
  receber:     ["M8 13V3", "M4 7l4-4 4 4", "M2.5 13.5h11"],
  pagar:       ["M8 3v10", "M4 9l4 4 4-4", "M2.5 2.5h11"],
  fluxo:       ["M2 8c0-3 2-5 4-5 1.5 0 2.5 1 4 1s2.5-1 4-1", "M2 8c0 3 2 5 4 5 1.5 0 2.5-1 4-1s2.5 1 4 1"],
  investimentos:["M2 12l3.5-4 2.5 2 3-4 3 2", "M10 5h4v4"],
  notas:       ["M10 1.5H3.5a.5.5 0 00-.5.5v12a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V5.5L10 1.5z", "M10 1.5v4h4", "M5.5 8h5", "M5.5 10.5h5", "M5.5 13h2.5"],
  contabilidade:["M3 2h10a.5.5 0 01.5.5v11a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V2.5A.5.5 0 013 2z", "M6 2v12", "M3 6h10", "M3 9h10", "M3 12h10"],
  planoContas: ["M2.5 3.5h4", "M2.5 8h11", "M2.5 12.5h7.5", "M6.5 1v5", "M9.5 6v7"],
  metas:       ["M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z", "M8 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z", "M8 7a1 1 0 100 2 1 1 0 000-2z"],
  bancos:      ["M1.5 6l6.5-4 6.5 4", "M2.5 6.5v6.5", "M13.5 6.5v6.5", "M5.5 6.5v6.5", "M10.5 6.5v6.5", "M1.5 13.5h13"],
  recorrencia: ["M13 4a6 6 0 10.9 7.5", "M13 1.5v3h-3", "M8 4.5v4l2.5 1.5"],
  visaoGeral:  ["M2 9.5h3v4.5H2z", "M6.5 6h3v8H6.5z", "M11 3h3v11h-3z"],
  formaPgto:   ["M1.5 4.5h13v7h-13z", "M1.5 7h13", "M4 10h3"],
  transferencia:["M2 5h9", "M8.5 2.5L11 5l-2.5 2.5", "M14 11H5", "M7.5 8.5L5 11l2.5 2.5"],
  conciliacao: ["M2 8.5l3.5 3.5 8.5-9", "M2 3h6", "M2 6h4"],
  produtos:    ["M2 2h4v4H2z", "M10 2h4v4h-4z", "M2 10h4v4H2z", "M10 10h4v4h-4z"],
  tabelas:     ["M8 2L2 4.5v7L8 14l6-2.5v-7L8 2z", "M8 2v12", "M2 4.5l6 3 6-3", "M5.5 8h1"],
  relatorios:  ["M3 13.5V6", "M7 13.5V4", "M11 13.5V8", "M1.5 13.5h13"],
  giro:        ["M13 3a6 6 0 11-1.5 8", "M13 3l.5 3.5H10"],
  historico:   ["M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z", "M8 5v3.5l2.5 1.5"],
  logout:      ["M11 10.5l3-2.5-3-2.5", "M14 8H6.5", "M6.5 3H3a.5.5 0 00-.5.5v9A.5.5 0 003 13h3.5"],
};

// Grupos/rotas vêm de lib/navRoutes.ts (fonte compartilhada com a Command
// Palette) — aqui só se anexa o ícone de cada item, que é local a este
// componente.
const NAV = (() => {
  const grupos: { grupo: string; items: { href: string; label: string; icon: string | string[] }[] }[] = [];
  const porGrupo = new Map<string, { href: string; label: string; icon: string | string[] }[]>();
  for (const r of NAV_ROUTES) {
    if (!porGrupo.has(r.grupo)) {
      const items: { href: string; label: string; icon: string | string[] }[] = [];
      porGrupo.set(r.grupo, items);
      grupos.push({ grupo: r.grupo, items });
    }
    porGrupo.get(r.grupo)!.push({ href: r.href, label: r.label, icon: IC[r.iconKey as keyof typeof IC] });
  }
  return grupos;
})();

function LogoIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="62" height="62" rx="13" fill="#0f1219" stroke="#2d5fa6" strokeWidth="2" />
      <text x="32" y="40" textAnchor="middle" fontFamily="'Syne', sans-serif" fontSize="20" fontWeight="800" fill="white" letterSpacing="1">UG</text>
    </svg>
  );
}

interface Props {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({ mobileOpen = false, onCloseMobile }: Props) {
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
          width: 52px;
          min-width: 52px;
          transition: width 0.22s cubic-bezier(0.4,0,0.2,1),
                      min-width 0.22s cubic-bezier(0.4,0,0.2,1),
                      box-shadow 0.22s;
          overflow-x: hidden;
          z-index: 30;
          display: flex;
          flex-direction: column;
        }
        .sb:hover {
          width: 228px;
          min-width: 228px;
          box-shadow: 4px 0 24px rgba(0,0,0,.4);
        }

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

        .sb-logo-wrap {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 10px; border-bottom: 1px solid var(--b1);
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

        .ns {
          display: flex; align-items: center; justify-content: space-between;
          overflow: hidden; white-space: nowrap;
          opacity: 0; transition: opacity 0.12s;
          cursor: pointer; user-select: none;
          padding: 12px 14px 4px;
          font-size: 9px; color: var(--t3);
          text-transform: uppercase; letter-spacing: 2px;
          font-family: 'DM Mono', monospace;
        }
        .sb:hover .ns { opacity: 1; }
        .ns:hover { color: var(--t2) !important; }
        .ns-chev {
          font-size: 11px; color: var(--t3); flex-shrink: 0;
          transition: transform 0.2s; display: inline-block;
        }

        .sb-items { overflow: hidden; transition: max-height 0.22s ease; }
        .sb:not(:hover) .sb-items { max-height: 999px !important; }
        .sb:hover       .sb-items.grp-open     { max-height: 600px; }
        .sb:hover       .sb-items.grp-collapsed { max-height: 0; }

        /* Nav item */
        .ni {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 14px; cursor: pointer;
          color: var(--t3);
          border-left: 2px solid transparent;
          transition: color 0.1s, background 0.1s, border-color 0.1s;
          text-decoration: none; user-select: none; position: relative;
          font-size: 12.5px; font-family: 'DM Mono', monospace;
        }
        .ni:hover { color: var(--t1); background: var(--surf2); border-left-color: var(--b3); }
        .ni.active { color: var(--acc); background: rgba(61,255,160,.05); border-left-color: var(--acc); }
        [data-theme="light"] .ni.active { background: rgba(13,150,104,.08); }

        .ni-label {
          opacity: 0; transition: opacity 0.12s 0.06s;
          white-space: nowrap; overflow: hidden;
        }
        .sb:hover .ni-label { opacity: 1; }

        /* Tooltip no modo ícone */
        .sb:not(:hover) .ni[data-tip]::after {
          content: attr(data-tip);
          position: fixed;
          left: 56px;
          background: var(--surf3); border: 1px solid var(--b2);
          color: var(--t1); font-size: 11px; padding: 5px 10px;
          border-radius: 6px; white-space: nowrap; pointer-events: none;
          opacity: 0; transition: opacity 0.1s; z-index: 200;
          font-family: 'DM Mono', monospace;
          box-shadow: var(--sh2);
        }
        .sb:not(:hover) .ni[data-tip]:hover::after { opacity: 1; }

        /* Active dot indicator no modo ícone colapsado */
        .ni-active-dot {
          position: absolute;
          right: 6px; top: 50%; transform: translateY(-50%);
          width: 4px; height: 4px; border-radius: 50%;
          background: var(--acc); flex-shrink: 0;
        }
        .sb:hover .ni-active-dot { display: none; }

        .sb-ft {
          padding: 10px 12px; border-top: 1px solid var(--b1);
          display: flex; align-items: center; justify-content: space-between;
          overflow: hidden; white-space: nowrap; flex-shrink: 0;
        }
        .sb-ft-ver {
          font-size: 9px; color: var(--t3); font-family: 'DM Mono', monospace;
          opacity: 0; transition: opacity 0.12s; overflow: hidden; white-space: nowrap;
        }
        .sb:hover .sb-ft-ver { opacity: 1; }

        /* ─── Modo gaveta (celular / tela estreita) ──────────────
           Abaixo do breakpoint, a sidebar não fica mais fixa no
           fluxo (economiza espaço horizontal) — vira um painel que
           desliza por cima do conteúdo, aberto/fechado via estado
           (hambúrguer no Topbar). Toque não tem ":hover", então o
           modo ícone-só não faz sentido aqui: quando aberta, mostra
           sempre os rótulos completos. */
        .sb-backdrop { display: none; }
        @media (max-width: 860px) {
          .sb {
            position: fixed;
            top: 0; left: 0; height: 100vh;
            width: 250px; min-width: 250px;
            transform: translateX(-100%);
            transition: transform 0.22s ease;
            box-shadow: none;
            z-index: 100;
          }
          .sb.sb-open {
            transform: translateX(0);
            box-shadow: 4px 0 24px rgba(0,0,0,.5);
          }
          .sb .sb-logo-text,
          .sb .ns,
          .sb .ni-label,
          .sb .sb-ft-ver { opacity: 1; }
          .sb .ni-active-dot { display: none; }
          .sb .ni[data-tip]::after { content: none; }

          .sb-backdrop.show {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.5);
            z-index: 90;
          }
        }
      `}</style>

      <div className={`sb-backdrop${mobileOpen ? " show" : ""}`} onClick={onCloseMobile} />

      <aside className={`sb${mobileOpen ? " sb-open" : ""}`}>

        {/* Logo */}
        <Link href="/dashboard" className="sb-logo-wrap" onClick={onCloseMobile}>
          <div style={{ flexShrink: 0 }}><LogoIcon /></div>
          <div className="sb-logo-text">
            <div className="sb-logo-name">UrbanGlass</div>
            <div className="sb-logo-sub">ERP Industrial</div>
          </div>
        </Link>

        {/* Nav */}
        <div className="sb-nav">
          {NAV.map(({ grupo, items }) => {
            const isCollapsed = collapsed.has(grupo);
            const hasActive   = items.some(i => pathname === i.href || pathname.startsWith(i.href + "/"));

            return (
              <div key={grupo}>
                <div
                  className="ns"
                  onClick={() => toggle(grupo)}
                  title={isCollapsed ? `Expandir ${grupo}` : `Recolher ${grupo}`}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {hasActive && isCollapsed && (
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--acc)", display: "inline-block", flexShrink: 0 }} />
                    )}
                    {grupo}
                  </span>
                  <span className="ns-chev" style={{ transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}>›</span>
                </div>

                <div className={`sb-items ${isCollapsed ? "grp-collapsed" : "grp-open"}`}>
                  {items.map((item) => {
                    const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        data-tip={item.label}
                        className={`ni${ativo ? " active" : ""}`}
                        onClick={onCloseMobile}
                      >
                        <Icon d={item.icon} size={15} />
                        <span className="ni-label">{item.label}</span>
                        {ativo && <span className="ni-active-dot" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sb-ft">
          <span className="sb-ft-ver">v3.1 · 2026</span>
          <button
            onClick={handleLogout}
            title="Sair do sistema"
            style={{
              background: "transparent", border: "1px solid var(--b2)",
              borderRadius: "6px", color: "var(--t3)",
              padding: "5px 7px", cursor: "pointer",
              display: "flex", alignItems: "center",
              transition: "0.1s", flexShrink: 0,
            }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.color = "var(--err)"; b.style.borderColor = "var(--err)"; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.color = "var(--t3)"; b.style.borderColor = "var(--b2)"; }}
          >
            <Icon d={IC.logout} size={14} />
          </button>
        </div>

      </aside>
    </>
  );
}
