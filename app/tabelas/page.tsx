"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { Produto, TabelaPreco } from "@/types";

interface PrecoEdit {
  valor: number;
  margem: number;
}

export default function TabelasPage() {
  const [produtos, setProdutos]       = useState<Produto[]>([]);
  const [tabelas, setTabelas]         = useState<TabelaPreco[]>([]);
  const [edits, setEdits]             = useState<Record<number, PrecoEdit>>({});
  const [loading, setLoading]         = useState(true);
  const [salvando, setSalvando]       = useState(false);
  const [filtro, setFiltro]           = useState("");
  const [filtroTipo, setFiltroTipo]   = useState("Todos");
  const [margemPendente, setMargemPendente] = useState(false); // coluna margem não existe ainda no DB

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: prods }, { data: tabs }] = await Promise.all([
      supabase.from("produtos").select("*").order("tipo").order("nome"),
      supabase.from("tabelas_preco").select("*").order("id"),
    ]);
    const lista = (prods as Produto[] || []);
    setProdutos(lista);
    setTabelas(tabs as TabelaPreco[] || []);
    setEdits({});
    // detecta se coluna margem já existe (primeiro produto sem ela → undefined)
    if (lista.length > 0 && (lista[0] as any).margem === undefined) {
      setMargemPendente(true);
    }
    setLoading(false);
  }

  function getCurrent(id: number): PrecoEdit {
    if (edits[id]) return edits[id];
    const p = produtos.find(x => x.id === id)!;
    return { valor: p.valor, margem: p.margem ?? 0 };
  }

  function setValor(id: number, valor: number) {
    setEdits(e => ({ ...e, [id]: { ...getCurrent(id), valor } }));
  }

  function setMargem(id: number, margem: number) {
    setEdits(e => ({ ...e, [id]: { ...getCurrent(id), margem } }));
  }

  const modificados = produtos
    .filter(p => {
      if (!edits[p.id]) return false;
      const e = edits[p.id];
      return e.valor !== p.valor || e.margem !== (p.margem ?? 0);
    })
    .map(p => p.id);

  async function salvar() {
    if (modificados.length === 0) return;
    setSalvando(true);

    // 1. Salva sempre o valor (coluna garantida)
    await Promise.all(
      modificados.map(id =>
        supabase.from("produtos").update({ valor: edits[id].valor } as never).eq("id", id)
      )
    );

    // 2. Tenta salvar margem; se a coluna não existir ainda, apenas sinaliza
    const { error: erroMargem } = await supabase
      .from("produtos")
      .update({ margem: edits[modificados[0]].margem } as never)
      .eq("id", modificados[0]);

    if (erroMargem) {
      setMargemPendente(true);
    } else {
      setMargemPendente(false);
      // coluna existe — salva margem de todos os modificados
      await Promise.all(
        modificados.slice(1).map(id =>
          supabase.from("produtos").update({ margem: edits[id].margem } as never).eq("id", id)
        )
      );
    }

    setSalvando(false);
    load();
  }

  const tipos = ["Todos", ...Array.from(new Set(produtos.map(p => p.tipo).filter(Boolean)))];

  const prodFiltrados = produtos.filter(p => {
    const matchFiltro = !filtro ||
      p.nome.toLowerCase().includes(filtro.toLowerCase()) ||
      p.cod.toLowerCase().includes(filtro.toLowerCase());
    const matchTipo = filtroTipo === "Todos" || p.tipo === filtroTipo;
    return matchFiltro && matchTipo;
  });

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Tabela de Preços</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {modificados.length > 0 && (
            <span style={{ fontSize: "12px", color: "var(--warn)", fontFamily: "'DM Mono',monospace" }}>
              {modificados.length} produto(s) alterado(s)
            </span>
          )}
          <button
            className="btn bp sm"
            onClick={salvar}
            disabled={salvando || modificados.length === 0}
          >
            {salvando ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>

      <div className="con">
        <div className="al al-i" style={{ marginBottom: "14px", fontSize: "12px" }}>
          Defina o preço e a margem de negociação de cada produto. A margem é o % máximo de desconto ou acréscimo permitido ao criar orçamentos e pedidos.
        </div>

        {margemPendente && (
          <div className="al al-w" style={{ marginBottom: "14px", fontSize: "12px" }}>
            <strong>⚠ Coluna de margem ainda não existe no banco.</strong> Os preços são salvos normalmente, mas as margens só funcionarão após executar no <strong>Supabase SQL Editor</strong>:
            <code style={{ display: "block", marginTop: "6px", padding: "8px 12px", background: "rgba(0,0,0,.3)", borderRadius: "6px", fontFamily: "'DM Mono',monospace", fontSize: "12px", userSelect: "all" }}>
              ALTER TABLE produtos ADD COLUMN IF NOT EXISTS margem numeric(5,2) DEFAULT 0;
            </code>
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
          <div className="tb-search" style={{ flex: 1, minWidth: "200px" }}>
            <span className="tb-search-ic">⌕</span>
            <input
              placeholder="Buscar produto ou código..."
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {tipos.map(t => (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid var(--b2)",
                  background: filtroTipo === t ? "var(--acc)" : "transparent",
                  color: filtroTipo === t ? "#000" : "var(--t3)",
                  transition: "all 0.15s",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : (
          <div className="card">
            <div className="ct">
              Preços por Produto
              <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", fontWeight: 400 }}>
                {prodFiltrados.length} produto(s)
              </span>
            </div>

            <div className="tw" style={{ border: "none", borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "80px" }}>Código</th>
                    <th>Produto</th>
                    <th style={{ width: "100px" }}>Tipo</th>
                    <th style={{ width: "80px" }}>Espessura</th>
                    <th style={{ width: "140px" }}>Preço (R$/m²)</th>
                    <th style={{ width: "160px" }}>Margem negociação</th>
                    <th style={{ width: "70px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {prodFiltrados.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>Nenhum produto encontrado</td></tr>
                  )}
                  {prodFiltrados.map(p => {
                    const edit = getCurrent(p.id);
                    const alterado = modificados.includes(p.id);
                    const min = edit.margem > 0 ? edit.valor * (1 - edit.margem / 100) : null;
                    const max = edit.margem > 0 ? edit.valor * (1 + edit.margem / 100) : null;

                    return (
                      <tr
                        key={p.id}
                        style={{
                          opacity: p.ativo ? 1 : 0.5,
                          background: alterado ? "rgba(16,185,129,.04)" : undefined,
                        }}
                      >
                        <td>
                          <span className="mono" style={{ fontSize: "11px", color: "var(--acc)" }}>{p.cod}</span>
                        </td>
                        <td>
                          <strong>{p.nome}</strong>
                          {p.cor && <span style={{ fontSize: "11px", color: "var(--t3)", marginLeft: "6px" }}>{p.cor}</span>}
                          {alterado && <span style={{ marginLeft: "6px", fontSize: "10px", color: "var(--ok)", fontFamily: "'DM Mono',monospace" }}>● editado</span>}
                        </td>
                        <td>
                          <span className="chip">{p.tipo || "—"}</span>
                        </td>
                        <td className="mono" style={{ fontSize: "12px" }}>{p.espessura || "—"}</td>
                        <td>
                          <CurrencyInput
                            value={edit.valor}
                            onChange={v => setValor(p.id, v)}
                          />
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              className="fc"
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={edit.margem || ""}
                              onChange={e => setMargem(p.id, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              style={{ width: "60px", margin: 0 }}
                            />
                            <span style={{ fontSize: "12px", color: "var(--t3)" }}>%</span>
                            {min !== null && (
                              <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
                                {formatBRL(min)} – {formatBRL(max!)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`chip ${p.ativo ? "cg" : "cr"}`}>
                            {p.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Seção de mínimos por tabela */}
        {tabelas.length > 0 && (
          <div className="card" style={{ marginTop: "16px" }}>
            <div className="ct">Pedido Mínimo por Tabela</div>
            <div className="tw" style={{ border: "none", borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Tabela</th>
                    <th>Tipo</th>
                    <th>Mínimo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tabelas.map(t => (
                    <tr key={t.id}>
                      <td><strong>{t.nome}</strong></td>
                      <td><span className="chip">{t.tipo}</span></td>
                      <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(t.min)}</td>
                      <td><span className={`chip ${t.ativo ? "cg" : "cr"}`}>{t.ativo ? "Ativa" : "Inativa"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
