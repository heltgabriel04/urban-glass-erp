"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { Produto, TabelaPreco, TabelaPrecoItem } from "@/types";

interface PrecoEdit {
  valor: number;
  margem: number;
}

export default function TabelasPage() {
  const [produtos, setProdutos]         = useState<Produto[]>([]);
  const [tabelas, setTabelas]           = useState<TabelaPreco[]>([]);
  const [tabelaItens, setTabelaItens]   = useState<TabelaPrecoItem[]>([]);
  const [tabelaAtiva, setTabelaAtiva]   = useState<TabelaPreco | null>(null);
  const [edits, setEdits]               = useState<Record<number, PrecoEdit>>({});
  const [loading, setLoading]           = useState(true);
  const [salvando, setSalvando]         = useState(false);
  const [filtro, setFiltro]             = useState("");
  const [filtroTipo, setFiltroTipo]     = useState("Todos");
  const [precisaMigracao, setPrecisaMigracao] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: prods }, { data: tabs }, { data: itens, error: erroItens }] = await Promise.all([
      supabase.from("produtos").select("*").order("tipo").order("nome"),
      supabase.from("tabelas_preco").select("*").order("id"),
      supabase.from("tabela_preco_itens").select("*"),
    ]);
    const listaProds   = (prods  as Produto[]         || []);
    const listaTabelas = (tabs   as TabelaPreco[]      || []);
    const listaItens   = (itens  as TabelaPrecoItem[]  || []);
    setProdutos(listaProds);
    setTabelas(listaTabelas);
    setTabelaItens(listaItens);
    setPrecisaMigracao(!!erroItens);
    setTabelaAtiva(prev => prev ? (listaTabelas.find(t => t.id === prev.id) ?? listaTabelas[0] ?? null) : (listaTabelas[0] ?? null));
    setEdits({});
    setLoading(false);
  }

  // Valor/margem salvo para produto na tabela ativa (sem edits locais)
  function getSaved(produtoId: number): PrecoEdit {
    if (!tabelaAtiva) return { valor: 0, margem: 0 };
    const item = tabelaItens.find(i => i.tabela_id === tabelaAtiva.id && i.produto_id === produtoId);
    if (item) return { valor: item.valor, margem: item.margem };
    const prod = produtos.find(p => p.id === produtoId);
    return { valor: prod?.valor ?? 0, margem: prod?.margem ?? 0 };
  }

  function getCurrent(produtoId: number): PrecoEdit {
    return edits[produtoId] ?? getSaved(produtoId);
  }

  function setValor(id: number, valor: number) {
    setEdits(e => ({ ...e, [id]: { ...getCurrent(id), valor } }));
  }

  function setMargem(id: number, margem: number) {
    setEdits(e => ({ ...e, [id]: { ...getCurrent(id), margem } }));
  }

  const modificados = Object.keys(edits).map(Number).filter(prodId => {
    const saved = getSaved(prodId);
    const edit  = edits[prodId];
    return edit.valor !== saved.valor || edit.margem !== saved.margem;
  });

  function mudarTabela(tab: TabelaPreco) {
    if (modificados.length > 0 && !confirm("Há alterações não salvas. Deseja descartá-las?")) return;
    setTabelaAtiva(tab);
    setEdits({});
  }

  async function salvar() {
    if (!tabelaAtiva || modificados.length === 0) return;
    setSalvando(true);

    const results = await Promise.all(
      modificados.map(prodId =>
        supabase.from("tabela_preco_itens").upsert(
          { tabela_id: tabelaAtiva.id, produto_id: prodId, valor: edits[prodId].valor, margem: edits[prodId].margem },
          { onConflict: "tabela_id,produto_id" } as never
        )
      )
    );

    const temErro = results.some((r: any) => r.error);
    if (temErro) setPrecisaMigracao(true);

    setSalvando(false);
    load();
  }

  const tipos = ["Todos", ...Array.from(new Set(produtos.map(p => p.tipo).filter(Boolean)))];

  const prodFiltrados = produtos.filter(p => {
    const ok1 = !filtro || p.nome.toLowerCase().includes(filtro.toLowerCase()) || p.cod.toLowerCase().includes(filtro.toLowerCase());
    const ok2  = filtroTipo === "Todos" || p.tipo === filtroTipo;
    return ok1 && ok2 && p.ativo;
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
          <button className="btn bp sm" onClick={salvar} disabled={salvando || modificados.length === 0 || precisaMigracao}>
            {salvando ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>

      <div className="con">
        {precisaMigracao && (
          <div className="al al-w" style={{ marginBottom: "14px", fontSize: "12px" }}>
            <strong>⚠ Execute este SQL no Supabase SQL Editor para ativar preços por tabela:</strong>
            <code style={{ display: "block", marginTop: "8px", padding: "10px 14px", background: "rgba(0,0,0,.3)", borderRadius: "6px", fontFamily: "'DM Mono',monospace", fontSize: "12px", userSelect: "all", lineHeight: 1.7 }}>
              {`CREATE TABLE IF NOT EXISTS tabela_preco_itens (\n  id serial PRIMARY KEY,\n  tabela_id integer NOT NULL REFERENCES tabelas_preco(id) ON DELETE CASCADE,\n  produto_id integer NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,\n  valor numeric(10,2) NOT NULL DEFAULT 0,\n  margem numeric(5,2) NOT NULL DEFAULT 0,\n  UNIQUE(tabela_id, produto_id)\n);\n\nALTER TABLE produtos ADD COLUMN IF NOT EXISTS margem numeric(5,2) DEFAULT 0;`}
            </code>
          </div>
        )}

        {/* Tabs por tabela */}
        {tabelas.length > 0 && (
          <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
            {tabelas.map(tab => (
              <button
                key={tab.id}
                onClick={() => mudarTabela(tab)}
                style={{
                  padding: "8px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                  cursor: "pointer", border: "1px solid var(--b2)", transition: "all 0.15s",
                  background: tabelaAtiva?.id === tab.id ? "var(--acc)" : "var(--surf1)",
                  color:      tabelaAtiva?.id === tab.id ? "#000" : "var(--t2)",
                }}
              >
                {tab.nome}
                {!tab.ativo && <span style={{ marginLeft: "6px", fontSize: "10px", opacity: 0.6 }}>(inativa)</span>}
              </button>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
          <div className="tb-search" style={{ flex: 1, minWidth: "200px" }}>
            <span className="tb-search-ic">⌕</span>
            <input placeholder="Buscar produto ou código..." value={filtro} onChange={e => setFiltro(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {tipos.map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)} style={{
                padding: "5px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                cursor: "pointer", border: "1px solid var(--b2)", transition: "all 0.15s",
                background: filtroTipo === t ? "var(--acc)" : "transparent",
                color:      filtroTipo === t ? "#000" : "var(--t3)",
              }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : !tabelaAtiva ? (
          <div className="al al-w">Nenhuma tabela cadastrada.</div>
        ) : (
          <div className="card">
            <div className="ct">
              {tabelaAtiva.nome}
              <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", fontWeight: 400 }}>
                {prodFiltrados.length} produto(s) · preços específicos desta tabela
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
                    <th style={{ width: "150px" }}>Preço (R$/m²)</th>
                    <th style={{ width: "190px" }}>Margem negociação</th>
                  </tr>
                </thead>
                <tbody>
                  {prodFiltrados.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>Nenhum produto encontrado</td></tr>
                  )}
                  {prodFiltrados.map(p => {
                    const edit     = getCurrent(p.id);
                    const temCustom = tabelaItens.some(i => i.tabela_id === tabelaAtiva.id && i.produto_id === p.id);
                    const alterado  = modificados.includes(p.id);
                    const min = edit.margem > 0 ? edit.valor * (1 - edit.margem / 100) : null;
                    const max = edit.margem > 0 ? edit.valor * (1 + edit.margem / 100) : null;

                    return (
                      <tr key={p.id} style={{ background: alterado ? "rgba(16,185,129,.04)" : undefined }}>
                        <td><span className="mono" style={{ fontSize: "11px", color: "var(--acc)" }}>{p.cod}</span></td>
                        <td>
                          <strong>{p.nome}</strong>
                          {p.cor && <span style={{ fontSize: "11px", color: "var(--t3)", marginLeft: "6px" }}>{p.cor}</span>}
                          {!temCustom && !alterado && (
                            <span style={{ marginLeft: "8px", fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>padrão</span>
                          )}
                          {alterado && <span style={{ marginLeft: "8px", fontSize: "10px", color: "var(--ok)", fontFamily: "'DM Mono',monospace" }}>● editado</span>}
                        </td>
                        <td><span className="chip">{p.tipo || "—"}</span></td>
                        <td className="mono" style={{ fontSize: "12px" }}>{p.espessura || "—"}</td>
                        <td>
                          <CurrencyInput value={edit.valor} onChange={v => setValor(p.id, v)} />
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              className="fc"
                              type="number" min="0" max="100" step="0.5"
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tabelas.length > 0 && (
          <div className="card" style={{ marginTop: "16px" }}>
            <div className="ct">Pedido Mínimo por Tabela</div>
            <div className="tw" style={{ border: "none", borderRadius: 0 }}>
              <table>
                <thead><tr><th>Tabela</th><th>Tipo</th><th>Mínimo</th><th>Status</th></tr></thead>
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
