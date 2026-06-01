"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

const SUGESTOES = [
  { label: "Pedidos",      path: "/pedidos",    placeholder: "Buscar pedido ou cliente..." },
  { label: "Clientes",     path: "/clientes",   placeholder: "Buscar cliente..." },
  { label: "Orçamentos",   path: "/orcamentos", placeholder: "Buscar orçamento ou cliente..." },
  { label: "Produtos",     path: "/produtos",   placeholder: "Buscar produto ou código..." },
  { label: "Retalhos",     path: "/retalhos",   placeholder: "Buscar retalho..." },
];

function getContexto(pathname: string) {
  for (const s of SUGESTOES) {
    if (pathname.startsWith(s.path)) return s;
  }
  return SUGESTOES[0]; // padrão: pedidos
}

export default function Topbar() {
  const router   = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);

  const [hora, setHora]     = useState("");
  const [busca, setBusca]   = useState("");
  const [aberto, setAberto] = useState(false);

  const ctx = getContexto(pathname);

  useEffect(() => {
    function tick() {
      setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  // Limpa busca ao mudar de página
  useEffect(() => { setBusca(""); }, [pathname]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.closest(".tb-search-wrap")?.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && busca.trim()) {
      // Redireciona para a página do contexto com parâmetro de busca
      router.push(`${ctx.path}?busca=${encodeURIComponent(busca.trim())}`);
      setAberto(false);
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setBusca("");
      setAberto(false);
      inputRef.current?.blur();
    }
  }

  function irPara(path: string) {
    if (busca.trim()) {
      router.push(`${path}?busca=${encodeURIComponent(busca.trim())}`);
    } else {
      router.push(path);
    }
    setAberto(false);
    setBusca("");
  }

  const data = new Date().toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short",
  });

  return (
    <div style={{ padding:"10px 26px", borderBottom:"1px solid var(--b1)", background:"var(--surf)", display:"flex", alignItems:"center", gap:"12px", justifyContent:"flex-end", flexShrink:0 }}>

      {/* Busca global */}
      <div className="tb-search-wrap" style={{ position:"relative", width:"280px" }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:"9px", top:"50%", transform:"translateY(-50%)", color:"var(--t3)", fontSize:"13px", pointerEvents:"none" }}>⌕</span>
          <input
            ref={inputRef}
            value={busca}
            onChange={e => { setBusca(e.target.value); setAberto(true); }}
            onFocus={() => setAberto(true)}
            onKeyDown={handleKeyDown}
            placeholder={ctx.placeholder}
            style={{ width:"100%", padding:"7px 10px 7px 28px", background:"var(--surf2)", border:"1px solid var(--b1)", borderRadius:"8px", color:"var(--t1)", fontSize:"12px", outline:"none", fontFamily:"'DM Mono', monospace", transition:"border-color 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--b2)"; }}
            onMouseLeave={e => { if (document.activeElement !== e.currentTarget) (e.currentTarget as HTMLInputElement).style.borderColor = "var(--b1)"; }}
            onFocusCapture={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--acc)"; }}
            onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--b1)"; setTimeout(() => setAberto(false), 150); }}
          />
          {busca && (
            <button
              onClick={() => { setBusca(""); inputRef.current?.focus(); }}
              style={{ position:"absolute", right:"8px", top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"var(--t3)", cursor:"pointer", fontSize:"12px", padding:"0", lineHeight:1 }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Dropdown de destinos */}
        {aberto && (
          <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, right:0, background:"var(--surf)", border:"1px solid var(--b2)", borderRadius:"10px", boxShadow:"0 8px 32px rgba(0,0,0,.5)", zIndex:200, overflow:"hidden" }}>
            {/* Dica */}
            <div style={{ padding:"8px 12px 6px", fontSize:"9px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", textTransform:"uppercase", letterSpacing:"1px", borderBottom:"1px solid var(--b1)" }}>
              {busca.trim() ? `Buscar "${busca}" em:` : "Ir para:"}
            </div>

            {SUGESTOES.map(s => {
              const ativo = pathname.startsWith(s.path);
              return (
                <div
                  key={s.path}
                  onClick={() => irPara(s.path)}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 14px", cursor:"pointer", background: ativo ? "rgba(61,255,160,.05)" : "transparent", borderLeft: ativo ? "2px solid var(--acc)" : "2px solid transparent", transition:"all 0.1s" }}
                  onMouseEnter={e => { if (!ativo) (e.currentTarget as HTMLDivElement).style.background = "var(--surf2)"; }}
                  onMouseLeave={e => { if (!ativo) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <span style={{ fontSize:"12px", color: ativo ? "var(--acc)" : "var(--t2)", fontWeight: ativo ? 700 : 400, fontFamily:"'DM Mono', monospace" }}>
                    {s.label}
                  </span>
                  {busca.trim() && (
                    <span style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono', monospace" }}>
                      Enter ↵
                    </span>
                  )}
                  {ativo && !busca.trim() && (
                    <span style={{ fontSize:"9px", color:"var(--acc)", fontFamily:"'DM Mono', monospace" }}>atual</span>
                  )}
                </div>
              );
            })}

            {busca.trim() && (
              <div style={{ padding:"8px 14px", borderTop:"1px solid var(--b1)", fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono', monospace" }}>
                Enter para buscar em <strong style={{ color:"var(--t2)" }}>{ctx.label}</strong> · Esc para cancelar
              </div>
            )}
          </div>
        )}
      </div>

      {/* Relógio */}
      <div className="clk">{data} · {hora}</div>
    </div>
  );
}