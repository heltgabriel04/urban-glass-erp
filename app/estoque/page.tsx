"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatM2 } from "@/lib/formatters";
import type { EstoqueItem, Produto } from "@/types";

export default function EstoquePage() {
  const [estoque, setEstoque]     = useState<EstoqueItem[]>([]);
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [salvando, setSalvando]   = useState(false);
  const [form, setForm]           = useState({
    produto_id: "",
    chapas: "",
    m2_por_chapa: "",
    custo_m2: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: est }, { data: prod }] = await Promise.all([
      supabase.from("estoque").select("*, produtos(nome, tipo, espessura, cor, cod)").order("id"),
      supabase.from("produtos").select("*").eq("ativo", true).order("nome"),
    ]);
    setEstoque(est as EstoqueItem[] || []);
    setProdutos(prod as Produto[] || []);
    setLoading(false);
  }

  // Produto selecionado no form
  const prodSelecionado = produtos.find(p => String(p.id) === form.produto_id) || null;

  // Item de estoque existente para o produto selecionado
  const itemExistente = estoque.find(e => String(e.produto_id) === form.produto_id) || null;

  const chapasNum   = parseInt(form.chapas || "0");
  const m2PorChapa  = parseFloat(form.m2_por_chapa || "0");
  const custoM2     = parseFloat(form.custo_m2 || "0");
  const m2Preview   = chapasNum > 0 && m2PorChapa > 0 ? chapasNum * m2PorChapa : 0;

  async function handleEntrada() {
    if (!form.produto_id)               { alert("Selecione o produto."); return; }
    if (chapasNum <= 0)                 { alert("Informe a quantidade de chapas."); return; }
    if (m2PorChapa <= 0)               { alert("Informe o m²/chapa."); return; }

    setSalvando(true);

    if (itemExistente) {
      // Produto já tem linha no estoque — soma os valores
      const novasChapasEntrada = Number(itemExistente.chapas_entrada) + chapasNum;
      const novoM2Entrada      = parseFloat((Number(itemExistente.m2_entrada) + m2Preview).toFixed(4));
      const novasChapasSaldo   = Number(itemExistente.chapas_saldo) + chapasNum;
      const novoM2Saldo        = parseFloat((Number(itemExistente.m2_saldo) + m2Preview).toFixed(4));
      // Atualiza custo/m² como média ponderada se informado
      const novoCusto = custoM2 > 0 ? custoM2 : Number(itemExistente.custo_m2);

      const { error } = await supabase
        .from("estoque")
        .update({
          chapas_entrada: novasChapasEntrada,
          m2_entrada:     novoM2Entrada,
          chapas_saldo:   novasChapasSaldo,
          m2_saldo:       novoM2Saldo,
          m2_por_chapa:   m2PorChapa,
          custo_m2:       novoCusto,
          updated_at:     new Date().toISOString(),
        })
        .eq("id", itemExistente.id);

      if (error) { alert("Erro ao registrar entrada: " + error.message); setSalvando(false); return; }

    } else {
      // Produto sem linha no estoque — cria nova
      if (!prodSelecionado) { setSalvando(false); return; }

      const { error } = await supabase.from("estoque").insert([{
        produto_id:     prodSelecionado.id,
        cod:            prodSelecionado.cod,
        chapas_entrada: chapasNum,
        m2_entrada:     parseFloat(m2Preview.toFixed(4)),
        m2_consumido:   0,
        m2_saldo:       parseFloat(m2Preview.toFixed(4)),
        chapas_saldo:   chapasNum,
        m2_por_chapa:   m2PorChapa,
        custo_m2:       custoM2 || 0,
        updated_at:     new Date().toISOString(),
      } as never]);

      if (error) { alert("Erro ao criar item de estoque: " + error.message); setSalvando(false); return; }
    }

    setSalvando(false);
    setForm({ produto_id: "", chapas: "", m2_por_chapa: "", custo_m2: "" });
    setShowForm(false);
    load();
  }

  const m2Total      = estoque.reduce((a, e) => a + Number(e.m2_saldo), 0);
  const chapasTotal  = estoque.reduce((a, e) => a + Number(e.chapas_saldo), 0);
  const valorEstoque = estoque.reduce((a, e) => a + Number(e.m2_saldo) * Number(e.custo_m2), 0);

  function nivelChip(pct: number) {
    if (pct >= 60) return <span className="chip cg">Alto</span>;
    if (pct >= 30) return <span className="chip cy">Médio</span>;
    return <span className="chip cr">Baixo</span>;
  }

  const inputStyle: React.CSSProperties = {
    background:"var(--surf2)", border:"1px solid var(--b2)", borderRadius:"6px",
    padding:"9px 12px", color:"var(--t1)", fontSize:"13px", fontFamily:"'Inter', sans-serif",
    outline:"none", width:"100%", boxSizing:"border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize:"11px", color:"var(--t3)", fontWeight:600,
    textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"4px", display:"block",
  };

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Estoque · Chapas</div>
        <button className="btn bp sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? "✕ Cancelar" : "+ Entrada de Estoque"}
        </button>
      </div>

      <div className="con">

        {/* FORM */}
        {showForm && (
          <div style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"20px 24px", marginBottom:"20px" }}>
            <div style={{ fontSize:"12px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em", marginBottom:"16px" }}>ENTRADA DE ESTOQUE</div>

            {/* Linha 1: produto + chapas */}
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:"12px", marginBottom:"12px" }}>
              <div>
                <label style={labelStyle}>Produto *</label>
                <select
                  style={{ ...inputStyle, cursor:"pointer" }}
                  value={form.produto_id}
                  onChange={e => {
                    const pid = e.target.value;
                    const item = estoque.find(es => String(es.produto_id) === pid);
                    setForm(f => ({
                      ...f,
                      produto_id: pid,
                      chapas: "",
                      // Preenche m²/chapa e custo se já existe no estoque
                      m2_por_chapa: item ? String(item.m2_por_chapa) : "",
                      custo_m2:     item ? String(item.custo_m2) : "",
                    }));
                  }}
                >
                  <option value="">Selecione o produto...</option>
                  {produtos.map(p => (
                    <option key={p.id} value={String(p.id)}>
                      {p.cod} — {p.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Quantidade de Chapas *</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  placeholder="Ex: 10"
                  value={form.chapas}
                  onChange={e => setForm(f => ({ ...f, chapas: e.target.value }))}
                />
              </div>
            </div>

            {/* Linha 2: m²/chapa + custo + preview */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px", marginBottom:"12px" }}>
              <div>
                <label style={labelStyle}>m² por Chapa *</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  placeholder="Ex: 7.22"
                  value={form.m2_por_chapa}
                  onChange={e => setForm(f => ({ ...f, m2_por_chapa: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Custo por m² (R$)</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  placeholder="Ex: 85.00"
                  value={form.custo_m2}
                  onChange={e => setForm(f => ({ ...f, custo_m2: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>m² a adicionar</label>
                <div style={{ ...inputStyle, color:"var(--acc)", fontFamily:"'DM Mono', monospace", fontWeight:600, background:"var(--surf3)", border:"1px solid var(--b1)" }}>
                  {m2Preview > 0 ? formatM2(m2Preview) : "—"}
                </div>
              </div>
            </div>

            {/* Info do item existente */}
            {itemExistente && (
              <div style={{ display:"flex", gap:"20px", padding:"10px 14px", background:"var(--surf2)", borderRadius:"8px", fontSize:"12px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", marginBottom:"12px" }}>
                <span>Saldo atual: <strong style={{ color:"var(--acc)" }}>{formatM2(itemExistente.m2_saldo)}</strong></span>
                <span>Chapas: <strong style={{ color:"var(--t1)" }}>{itemExistente.chapas_saldo} un.</strong></span>
                {m2Preview > 0 && (
                  <span>Novo saldo: <strong style={{ color:"var(--ok)" }}>{formatM2(Number(itemExistente.m2_saldo) + m2Preview)}</strong></span>
                )}
              </div>
            )}

            {!itemExistente && prodSelecionado && (
              <div className="al al-i" style={{ marginBottom:"12px", fontSize:"12px" }}>
                Produto sem entrada no estoque — será criado automaticamente.
              </div>
            )}

            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg sm" onClick={() => { setShowForm(false); setForm({ produto_id:"", chapas:"", m2_por_chapa:"", custo_m2:"" }); }}>Cancelar</button>
              <button className="btn bp sm" onClick={handleEntrada} disabled={salvando}>
                {salvando ? "Salvando..." : "Registrar Entrada"}
              </button>
            </div>
          </div>
        )}

        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"m² em Estoque",     value: formatM2(m2Total),       color:"var(--acc)",  sub:"m² disponíveis" },
            { label:"Chapas em Estoque", value: String(chapasTotal),      color:"var(--acc2)", sub:"chapas disponíveis" },
            { label:"Valor do Estoque",  value: formatBRL(valorEstoque),  color:"var(--acc5)", sub:"custo de aquisição" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando estoque...</div>
        ) : (
          <>
            <div className="tw mb14">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Código</th>
                    <th>Chapas Entrada</th>
                    <th>m² Entrada</th>
                    <th>m² Consumido</th>
                    <th>Chapas Saldo</th>
                    <th>m² Saldo</th>
                    <th>Custo/m²</th>
                    <th>Valor Total</th>
                    <th>Nível</th>
                  </tr>
                </thead>
                <tbody>
                  {estoque.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>
                        Nenhum item no estoque — registre uma entrada acima
                      </td>
                    </tr>
                  )}
                  {estoque.map(e => {
                    const pct = Number(e.m2_entrada) > 0 ? (Number(e.m2_saldo) / Number(e.m2_entrada)) * 100 : 0;
                    const valorTotal = Number(e.m2_saldo) * Number(e.custo_m2);
                    return (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.produtos?.nome ?? "—"}</strong>
                          {e.produtos?.tipo && (
                            <div className="tdim">{e.produtos.tipo} · {e.produtos.espessura} · {e.produtos.cor}</div>
                          )}
                        </td>
                        <td className="mono" style={{ color:"var(--acc)" }}>{e.cod}</td>
                        <td className="mono">{e.chapas_entrada}</td>
                        <td className="mono">{formatM2(e.m2_entrada)}</td>
                        <td className="mono" style={{ color:"var(--warn)" }}>{formatM2(e.m2_consumido)}</td>
                        <td className="mono">{e.chapas_saldo}</td>
                        <td className="mono" style={{ color:"var(--acc)" }}>{formatM2(e.m2_saldo)}</td>
                        <td className="mono">{formatBRL(e.custo_m2)}</td>
                        <td className="mono">{formatBRL(valorTotal)}</td>
                        <td>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                            <div className="prg" style={{ width:"50px", height:"5px" }}>
                              <div className="prg-f" style={{ width:`${pct}%`, background: pct >= 60 ? "var(--ok)" : pct >= 30 ? "var(--warn)" : "var(--err)" }} />
                            </div>
                            {nivelChip(pct)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="g2">
              {estoque.map(e => {
                const pct = Number(e.m2_entrada) > 0 ? (Number(e.m2_saldo) / Number(e.m2_entrada)) * 100 : 0;
                return (
                  <div key={e.id} className="card">
                    <div className="ct">
                      {e.produtos?.nome ?? e.cod}
                      <span className="mono" style={{ fontSize:"10px", color:"var(--t3)" }}>{e.cod}</span>
                    </div>
                    <div className="sr"><div className="sl">m² disponível</div><div className="sv" style={{ color:"var(--acc)" }}>{formatM2(e.m2_saldo)}</div></div>
                    <div className="sr"><div className="sl">Chapas</div><div className="sv">{e.chapas_saldo} un.</div></div>
                    <div className="sr"><div className="sl">Consumido</div><div className="sv" style={{ color:"var(--warn)" }}>{formatM2(e.m2_consumido)}</div></div>
                    <div className="sr"><div className="sl">Aproveitamento</div><div className="sv">{pct.toFixed(1)}% restante</div></div>
                    <div style={{ marginTop:"10px" }}>
                      <div className="prg" style={{ height:"6px" }}>
                        <div className="prg-f" style={{ width:`${pct}%`, background: pct >= 60 ? "var(--ok)" : pct >= 30 ? "var(--warn)" : "var(--err)" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}