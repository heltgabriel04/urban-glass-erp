"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatM2 } from "@/lib/formatters";
import { baixarChapasEstoque } from "@/services/estoque.service";
import type { EstoqueItem, Produto } from "@/types";

const MEDIDAS_PADRAO = [
  { label: "2600 × 2000 — 5,20 m²", larg: 2600, alt: 2000 },
  { label: "3000 × 2100 — 6,30 m²", larg: 3000, alt: 2100 },
  { label: "3210 × 2250 — 7,22 m²", larg: 3210, alt: 2250 },
  { label: "3300 × 2140 — 7,06 m²", larg: 3300, alt: 2140 },
  { label: "Personalizado",           larg: 0,    alt: 0    },
];

interface FormState {
  produto_id: string;
  chapas: string;
  larg_chapa: string;
  alt_chapa: string;
  custo_m2: string;
}

const FORM_VAZIO: FormState = { produto_id: "", chapas: "", larg_chapa: "", alt_chapa: "", custo_m2: "" };

export default function EstoquePage() {
  const [estoque, setEstoque]   = useState<EstoqueItem[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm]         = useState<FormState>(FORM_VAZIO);
  const [medidaPadrao, setMedidaPadrao] = useState("");

  // Edição
  const [editItem, setEditItem]         = useState<EstoqueItem | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => { load(); }, []);

  async function handleSincronizarBaixas() {
    if (!confirm(
      "Aplicar baixas de estoque com base no histórico de otimizações?\n\n" +
      "⚠ Execute APENAS UMA VEZ por lote de pedidos ainda não descontados.\n" +
      "Se as baixas já foram aplicadas anteriormente, haverá duplo desconto."
    )) return;

    setSincronizando(true);

    const { data: historico, error } = await supabase
      .from("historico_otimizador")
      .select("id, chapas_json, created_at")
      .order("created_at", { ascending: true });

    if (error || !historico) {
      alert("Erro ao buscar histórico: " + (error?.message ?? "Desconhecido"));
      setSincronizando(false);
      return;
    }

    // Agrupa registros por sessão de otimização: registros salvos em sequência
    // dentro de uma janela de 120 s pertencem à mesma sessão (mesma chamada de handleSalvar).
    // Cada sessão usa o 1º registro como representante para evitar dupla contagem.
    const sessions: { chapas_json: any }[][] = [];
    let cur: typeof historico = [];
    for (const rec of historico) {
      if (cur.length === 0) { cur.push(rec); continue; }
      const last = new Date(cur[cur.length - 1].created_at).getTime();
      const now  = new Date(rec.created_at).getTime();
      if (now - last <= 120_000) { cur.push(rec); }
      else { sessions.push(cur); cur = [rec]; }
    }
    if (cur.length > 0) sessions.push(cur);

    // Soma consumo por produto usando apenas o 1º registro de cada sessão
    const consumoPorProd = new Map<string, { chapas: number; m2: number }>();
    for (const session of sessions) {
      const chapas = session[0].chapas_json as Array<{ prod: string; W: number; H: number }> | null;
      if (!chapas) continue;
      for (const chapa of chapas) {
        if (!chapa?.prod) continue;
        const prev = consumoPorProd.get(chapa.prod) ?? { chapas: 0, m2: 0 };
        consumoPorProd.set(chapa.prod, {
          chapas: prev.chapas + 1,
          m2: parseFloat((prev.m2 + (chapa.W * chapa.H) / 1e6).toFixed(4)),
        });
      }
    }

    if (consumoPorProd.size === 0) {
      alert("Nenhuma chapa encontrada no histórico de otimizações.");
      setSincronizando(false);
      return;
    }

    let ok = 0, fail = 0;
    const naoEncontrados: string[] = [];
    for (const [prodNome, consumo] of consumoPorProd.entries()) {
      const success = await baixarChapasEstoque(prodNome, consumo.chapas, consumo.m2);
      if (success) ok++;
      else { fail++; naoEncontrados.push(prodNome); }
    }

    setSincronizando(false);
    load();

    let msg = `Baixas sincronizadas!\n${ok} produto(s) atualizado(s).`;
    if (fail > 0) msg += `\n\n${fail} produto(s) não encontrado(s) no estoque:\n${naoEncontrados.join("\n")}`;
    alert(msg);
  }

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

  const prodSelecionado = produtos.find(p => String(p.id) === form.produto_id) || null;
  const itemExistente   = !editItem ? estoque.find(e => String(e.produto_id) === form.produto_id) || null : null;

  const chapasNum  = parseInt(form.chapas || "0");
  const largMm     = parseFloat(form.larg_chapa || "0");
  const altMm      = parseFloat(form.alt_chapa  || "0");
  const m2PorChapa = largMm > 0 && altMm > 0 ? parseFloat(((largMm / 1000) * (altMm / 1000)).toFixed(4)) : 0;
  const custoM2    = parseFloat(form.custo_m2 || "0");
  const m2Preview  = chapasNum > 0 && m2PorChapa > 0 ? parseFloat((chapasNum * m2PorChapa).toFixed(4)) : 0;

  function handleMedidaPadrao(label: string) {
    setMedidaPadrao(label);
    const found = MEDIDAS_PADRAO.find(m => m.label === label);
    if (!found || found.larg === 0) return;
    setForm(f => ({ ...f, larg_chapa: String(found.larg), alt_chapa: String(found.alt) }));
  }

  function handleProduto(pid: string) {
    const item = estoque.find(es => String(es.produto_id) === pid);
    setForm(f => ({ ...f, produto_id: pid, chapas: "", custo_m2: item ? String(item.custo_m2) : "" }));
  }

  function resetForm() {
    setForm(FORM_VAZIO);
    setMedidaPadrao("");
    setEditItem(null);
  }

  function abrirNovo() {
    resetForm();
    setShowForm(true);
  }

  function abrirEditar(item: EstoqueItem) {
    // Tenta reconstruir largura/altura a partir do m2_por_chapa — usa campo direto se disponível
    // Deixa o usuário corrigir as dimensões manualmente
    setEditItem(item);
    setForm({
      produto_id: String(item.produto_id),
      chapas:     String(item.chapas_saldo),
      larg_chapa: "",
      alt_chapa:  "",
      custo_m2:   String(item.custo_m2),
    });
    setMedidaPadrao("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluir(item: EstoqueItem) {
    const nome = item.produtos?.nome ?? item.cod;
    if (!confirm(`Excluir "${nome}" do estoque permanentemente? Esta ação não pode ser desfeita.`)) return;
    await supabase.from("estoque").delete().eq("id", item.id);
    load();
  }

  async function handleEntrada() {
    if (!editItem && !form.produto_id) { alert("Selecione o produto."); return; }
    if (chapasNum <= 0)  { alert("Informe a quantidade de chapas."); return; }

    // Na edição, m²/chapa pode vir do campo ou do item existente
    const m2ChapFinal = m2PorChapa > 0 ? m2PorChapa : (editItem ? Number(editItem.m2_por_chapa) : 0);
    if (m2ChapFinal <= 0) { alert("Informe as medidas da chapa."); return; }

    const m2Final = parseFloat((chapasNum * m2ChapFinal).toFixed(4));

    setSalvando(true);

    if (editItem) {
      // Edição: substitui os valores do item pelo que o usuário digitou
      const novoCusto = custoM2 > 0 ? custoM2 : Number(editItem.custo_m2);
      const { error } = await supabase.from("estoque").update({
        chapas_entrada: chapasNum,
        m2_entrada:     m2Final,
        chapas_saldo:   chapasNum,
        m2_saldo:       m2Final,
        m2_por_chapa:   m2ChapFinal,
        custo_m2:       novoCusto,
        updated_at:     new Date().toISOString(),
      }).eq("id", editItem.id);

      if (error) { alert("Erro: " + error.message); setSalvando(false); return; }

    } else if (itemExistente) {
      const novoCusto = custoM2 > 0 ? custoM2 : Number(itemExistente.custo_m2);
      const { error } = await supabase.from("estoque").update({
        chapas_entrada: Number(itemExistente.chapas_entrada) + chapasNum,
        m2_entrada:     parseFloat((Number(itemExistente.m2_entrada) + m2Final).toFixed(4)),
        chapas_saldo:   Number(itemExistente.chapas_saldo) + chapasNum,
        m2_saldo:       parseFloat((Number(itemExistente.m2_saldo) + m2Final).toFixed(4)),
        m2_por_chapa:   m2ChapFinal,
        custo_m2:       novoCusto,
        updated_at:     new Date().toISOString(),
      }).eq("id", itemExistente.id);

      if (error) { alert("Erro: " + error.message); setSalvando(false); return; }

    } else {
      if (!prodSelecionado) { setSalvando(false); return; }
      const { error } = await supabase.from("estoque").insert([{
        produto_id: prodSelecionado.id, cod: prodSelecionado.cod,
        chapas_entrada: chapasNum, m2_entrada: m2Final,
        m2_consumido: 0, m2_saldo: m2Final, chapas_saldo: chapasNum,
        m2_por_chapa: m2ChapFinal, custo_m2: custoM2 || 0,
        updated_at: new Date().toISOString(),
      } as never]);

      if (error) { alert("Erro: " + error.message); setSalvando(false); return; }
    }

    setSalvando(false);
    resetForm();
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

  const inp: React.CSSProperties = {
    background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "6px",
    padding: "9px 12px", color: "var(--t1)", fontSize: "13px",
    fontFamily: "'Inter', sans-serif", outline: "none", width: "100%", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    fontSize: "11px", color: "var(--t3)", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px", display: "block",
  };
  const ro: React.CSSProperties = {
    ...inp, color: "var(--acc)", fontFamily: "'DM Mono', monospace",
    fontWeight: 600, background: "var(--surf3)", border: "1px solid var(--b1)", cursor: "default",
  };

  const btnExcluir: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: "28px", height: "28px", borderRadius: "6px", background: "transparent",
    border: "1px solid var(--b2)", color: "var(--t3)", fontSize: "13px",
    cursor: "pointer", transition: "all 0.15s",
  };

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Estoque · Chapas</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={handleSincronizarBaixas} disabled={sincronizando}>
            {sincronizando ? "Sincronizando..." : "Sincronizar Baixas"}
          </button>
          <button className="btn bp sm" onClick={() => { if (showForm) { setShowForm(false); resetForm(); } else abrirNovo(); }}>
            {showForm ? "✕ Cancelar" : "+ Entrada de Estoque"}
          </button>
        </div>
      </div>

      <div className="con">

        {showForm && (
          <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
            <div style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "16px" }}>
              {editItem ? `EDITANDO: ${editItem.produtos?.nome ?? editItem.cod}` : "ENTRADA DE ESTOQUE"}
            </div>

            {/* Produto + qtd — bloqueado na edição */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={lbl}>Produto *</label>
                {editItem ? (
                  <div style={ro}>{editItem.produtos?.nome ?? editItem.cod}</div>
                ) : (
                  <select style={{ ...inp, cursor: "pointer" }} value={form.produto_id} onChange={e => handleProduto(e.target.value)}>
                    <option value="">Selecione o produto...</option>
                    {produtos.map(p => <option key={p.id} value={String(p.id)}>{p.cod} — {p.nome}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label style={lbl}>{editItem ? "Chapas (novo total) *" : "Quantidade de Chapas *"}</label>
                <input style={inp} type="number" min="1"
                  placeholder={editItem ? `Atual: ${editItem.chapas_saldo}` : "Ex: 10"}
                  value={form.chapas}
                  onChange={e => setForm(f => ({ ...f, chapas: e.target.value }))}
                />
              </div>
            </div>

            {/* Medida padrão */}
            <div style={{ marginBottom: "12px" }}>
              <label style={lbl}>Medida Padrão da Chapa</label>
              <select style={{ ...inp, cursor: "pointer" }} value={medidaPadrao} onChange={e => handleMedidaPadrao(e.target.value)}>
                <option value="">Selecione uma medida padrão ou preencha manualmente abaixo...</option>
                {MEDIDAS_PADRAO.map(m => <option key={m.label} value={m.label}>{m.label}</option>)}
              </select>
            </div>

            {/* Dimensões + calculados + custo */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={lbl}>Largura (mm) *</label>
                <input style={inp} type="number" placeholder="Ex: 3210"
                  value={form.larg_chapa}
                  onChange={e => { setMedidaPadrao("Personalizado"); setForm(f => ({ ...f, larg_chapa: e.target.value })); }}
                />
              </div>
              <div>
                <label style={lbl}>Altura (mm) *</label>
                <input style={inp} type="number" placeholder="Ex: 2250"
                  value={form.alt_chapa}
                  onChange={e => { setMedidaPadrao("Personalizado"); setForm(f => ({ ...f, alt_chapa: e.target.value })); }}
                />
              </div>
              <div>
                <label style={lbl}>m² / Chapa</label>
                <div style={ro}>
                  {m2PorChapa > 0
                    ? `${m2PorChapa.toFixed(4)} m²`
                    : editItem
                      ? `${Number(editItem.m2_por_chapa).toFixed(4)} m² (atual)`
                      : "—"}
                </div>
              </div>
              <div>
                <label style={lbl}>Custo por m² (R$)</label>
                <input style={inp} type="number" step="0.01" placeholder="Ex: 85.00"
                  value={form.custo_m2} onChange={e => setForm(f => ({ ...f, custo_m2: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>m² Total</label>
                <div style={ro}>
                  {m2Preview > 0
                    ? formatM2(m2Preview)
                    : editItem && chapasNum > 0
                      ? formatM2(chapasNum * Number(editItem.m2_por_chapa))
                      : "—"}
                </div>
              </div>
            </div>

            {/* Info edição */}
            {editItem && (
              <div style={{ display: "flex", gap: "20px", padding: "10px 14px", background: "var(--surf2)", borderRadius: "8px", fontSize: "12px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginBottom: "12px" }}>
                <span>Saldo atual: <strong style={{ color: "var(--acc)" }}>{formatM2(editItem.m2_saldo)}</strong></span>
                <span>Chapas atuais: <strong style={{ color: "var(--t1)" }}>{editItem.chapas_saldo} un.</strong></span>
                <span style={{ color: "var(--warn)", fontSize: "11px" }}>⚠ Edição substitui os valores atuais</span>
              </div>
            )}

            {/* Info novo produto */}
            {!editItem && !itemExistente && prodSelecionado && (
              <div className="al al-i" style={{ marginBottom: "12px", fontSize: "12px" }}>
                Produto sem entrada no estoque — será criado automaticamente.
              </div>
            )}

            {/* Info produto com estoque existente */}
            {!editItem && itemExistente && (
              <div style={{ display: "flex", gap: "20px", padding: "10px 14px", background: "var(--surf2)", borderRadius: "8px", fontSize: "12px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginBottom: "12px" }}>
                <span>Saldo atual: <strong style={{ color: "var(--acc)" }}>{formatM2(itemExistente.m2_saldo)}</strong></span>
                <span>Chapas: <strong style={{ color: "var(--t1)" }}>{itemExistente.chapas_saldo} un.</strong></span>
                {m2Preview > 0 && <span>Novo saldo: <strong style={{ color: "var(--ok)" }}>{formatM2(Number(itemExistente.m2_saldo) + m2Preview)}</strong></span>}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg sm" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button>
              <button className="btn bp sm" onClick={handleEntrada} disabled={salvando}>
                {salvando ? "Salvando..." : editItem ? "Salvar Alterações" : "Registrar Entrada"}
              </button>
            </div>
          </div>
        )}

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "m² em Estoque",     value: formatM2(m2Total),      color: "var(--acc)",  sub: "m² disponíveis" },
            { label: "Chapas em Estoque", value: String(chapasTotal),     color: "var(--acc2)", sub: "chapas disponíveis" },
            { label: "Valor do Estoque",  value: formatBRL(valorEstoque), color: "var(--acc5)", sub: "custo de aquisição" },
          ].map(card => (
            <div key={card.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{card.value}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? <div className="loading">Carregando estoque...</div> : (
          <>
            <div className="tw mb14">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th><th>Código</th><th>Chapas Entrada</th>
                    <th>m² Entrada</th><th>m² Consumido</th><th>Chapas Saldo</th>
                    <th>m² Saldo</th><th>Custo/m²</th><th>Valor Total</th><th>Nível</th>
                    <th>Ações</th><th style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {estoque.length === 0 && (
                    <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>Nenhum item no estoque — registre uma entrada acima</td></tr>
                  )}
                  {estoque.map(e => {
                    const pct = Number(e.m2_entrada) > 0 ? (Number(e.m2_saldo) / Number(e.m2_entrada)) * 100 : 0;
                    return (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.produtos?.nome ?? "—"}</strong>
                          {e.produtos?.tipo && <div className="tdim">{e.produtos.tipo} · {e.produtos.espessura} · {e.produtos.cor}</div>}
                        </td>
                        <td className="mono" style={{ color: "var(--acc)" }}>{e.cod}</td>
                        <td className="mono">{e.chapas_entrada}</td>
                        <td className="mono">{formatM2(e.m2_entrada)}</td>
                        <td className="mono" style={{ color: "var(--warn)" }}>{formatM2(e.m2_consumido)}</td>
                        <td className="mono">{e.chapas_saldo}</td>
                        <td className="mono" style={{ color: "var(--acc)" }}>{formatM2(e.m2_saldo)}</td>
                        <td className="mono">{formatBRL(e.custo_m2)}</td>
                        <td className="mono">{formatBRL(Number(e.m2_saldo) * Number(e.custo_m2))}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div className="prg" style={{ width: "50px", height: "5px" }}>
                              <div className="prg-f" style={{ width: `${pct}%`, background: pct >= 60 ? "var(--ok)" : pct >= 30 ? "var(--warn)" : "var(--err)" }} />
                            </div>
                            {nivelChip(pct)}
                          </div>
                        </td>
                        <td>
                          <button className="btn bg xs" onClick={() => abrirEditar(e)}>Editar</button>
                        </td>
                        <td style={{ width: "40px", textAlign: "center" }}>
                          <button
                            title="Excluir item do estoque"
                            onClick={() => excluir(e)}
                            style={btnExcluir}
                            onMouseEnter={e2 => { const b = e2.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                            onMouseLeave={e2 => { const b = e2.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                          >
                            🗑
                          </button>
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
                      <span className="mono" style={{ fontSize: "10px", color: "var(--t3)" }}>{e.cod}</span>
                    </div>
                    <div className="sr"><div className="sl">m² disponível</div><div className="sv" style={{ color: "var(--acc)" }}>{formatM2(e.m2_saldo)}</div></div>
                    <div className="sr"><div className="sl">Chapas</div><div className="sv">{e.chapas_saldo} un.</div></div>
                    <div className="sr"><div className="sl">Consumido</div><div className="sv" style={{ color: "var(--warn)" }}>{formatM2(e.m2_consumido)}</div></div>
                    <div className="sr"><div className="sl">m² / Chapa</div><div className="sv mono">{Number(e.m2_por_chapa).toFixed(2)} m²</div></div>
                    <div style={{ marginTop: "10px" }}>
                      <div className="prg" style={{ height: "6px" }}>
                        <div className="prg-f" style={{ width: `${pct}%`, background: pct >= 60 ? "var(--ok)" : pct >= 30 ? "var(--warn)" : "var(--err)" }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                      <button className="btn bg xs" style={{ flex: 1 }} onClick={() => abrirEditar(e)}>Editar</button>
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