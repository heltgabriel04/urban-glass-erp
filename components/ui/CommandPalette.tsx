"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buscaGlobal, type BuscaGlobalResultado } from "@/services/buscaGlobal.service";
import { getRecentes } from "@/lib/recentes";
import { useEscToClose } from "./useEscToClose";

const VAZIO: BuscaGlobalResultado = { rotas: [], pedidos: [], clientes: [], lancamentos: [] };

interface ItemLista {
  label: string;
  sublabel?: string;
  href: string;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultado, setResultado] = useState<BuscaGlobalResultado>(VAZIO);
  const [loading, setLoading] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEscToClose(open, () => setOpen(false));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResultado(VAZIO);
    setAtivo(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await buscaGlobal(query);
      setResultado(r);
      setLoading(false);
      setAtivo(0);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  if (!open) return null;

  const vazio = query.trim() === "";
  const recentes: ItemLista[] = vazio
    ? getRecentes().map(r => ({ label: r.label, sublabel: r.sublabel, href: r.href }))
    : [];

  const grupos: { titulo: string; itens: ItemLista[] }[] = vazio
    ? [
        { titulo: "Recentes", itens: recentes },
        { titulo: "Ir para", itens: resultado.rotas },
      ]
    : [
        { titulo: "Ações & telas", itens: resultado.rotas },
        { titulo: "Pedidos", itens: resultado.pedidos },
        { titulo: "Clientes", itens: resultado.clientes },
        { titulo: "Lançamentos", itens: resultado.lancamentos },
      ];
  const achatado = grupos.flatMap(g => g.itens);

  function irPara(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo(a => Math.min(a + 1, achatado.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const item = achatado[ativo]; if (item) irPara(item.href); }
  }

  return (
    <div className="mov open" onClick={e => e.target === e.currentTarget && setOpen(false)} style={{ alignItems: "flex-start", paddingTop: "10vh" }}>
      <div className="mod" style={{ width: "560px", maxWidth: "92vw", maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--b1)" }}>
          <input
            ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Buscar pedido, cliente, lançamento ou tela..."
            className="fc" style={{ margin: 0, width: "100%", fontSize: "14px" }}
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "8px" }}>
          {loading && <div style={{ padding: "12px", fontSize: "12px", color: "var(--t3)" }}>Buscando...</div>}
          {!loading && achatado.length === 0 && (
            <div style={{ padding: "12px", fontSize: "12px", color: "var(--t3)" }}>
              {vazio ? "Nenhum item recente ainda." : "Nada encontrado."}
            </div>
          )}
          {grupos.map(g => g.itens.length === 0 ? null : (
            <div key={g.titulo} style={{ marginBottom: "6px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 10px" }}>
                {g.titulo}
              </div>
              {g.itens.map(item => {
                const idx = achatado.indexOf(item);
                return (
                  <button
                    key={`${g.titulo}-${item.href}-${item.label}`}
                    onClick={() => irPara(item.href)}
                    onMouseEnter={() => setAtivo(idx)}
                    style={{
                      display: "flex", flexDirection: "column", width: "100%", textAlign: "left",
                      padding: "8px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
                      background: idx === ativo ? "var(--surf2)" : "transparent", color: "var(--t1)",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{item.label}</span>
                    {item.sublabel && <span style={{ fontSize: "11px", color: "var(--t3)" }}>{item.sublabel}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--b1)", fontSize: "10px", color: "var(--t3)", display: "flex", gap: "12px" }}>
          <span>↑↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span>
        </div>
      </div>
    </div>
  );
}
