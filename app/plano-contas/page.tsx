"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";

interface Categoria {
  id: number;
  codigo: number;
  descricao: string;
  indicador: "Crédito" | "Débito";
  faixa_dre: string;
  ativo: boolean;
}

interface PlanoConta {
  id: number;
  codigo: number;
  codigo_estruturado: string;
  descricao: string;
  categoria_id: number | null;
  ativo: boolean;
  pc_categorias?: { descricao: string; indicador: string } | null;
}

const FAIXAS_DRE = [
  "Receitas",
  "Deduções sobre vendas",
  "Custos variáveis",
  "Custos fixos",
  "Resultado não operacional",
  "Resultado financeiro",
  "Impostos diretos",
  "Não listar no DRE",
];

const COR_INDICADOR: Record<string, string> = {
  "Crédito": "var(--ok)",
  "Débito": "var(--err)",
};

const emptyCategoria = (): Omit<Categoria, "id" | "ativo"> => ({
  codigo: 0, descricao: "", indicador: "Débito", faixa_dre: "Custos fixos",
});

const emptyPlano = (): Omit<PlanoConta, "id" | "ativo" | "pc_categorias"> => ({
  codigo: 0, codigo_estruturado: "", descricao: "", categoria_id: null,
});

export default function PlanoContasPage() {
  const [aba, setAba] = useState<"categorias" | "plano">("plano");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [planos, setPlanos] = useState<PlanoConta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState<number | "">("");

  // ── Categoria form state ──
  const [catForm, setCatForm] = useState(emptyCategoria());
  const [catEditId, setCatEditId] = useState<number | null>(null);
  const [catAdding, setCatAdding] = useState(false);
  const [catSalvando, setCatSalvando] = useState(false);

  // ── Plano form state ──
  const [planoForm, setPlanoForm] = useState(emptyPlano());
  const [planoEditId, setPlanoEditId] = useState<number | null>(null);
  const [planoAdding, setPlanoAdding] = useState(false);
  const [planoSalvando, setPlanoSalvando] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: cats }, { data: pls }] = await Promise.all([
      supabase.from("pc_categorias").select("*").order("codigo"),
      supabase.from("plano_contas").select("*, pc_categorias(descricao, indicador)").order("codigo"),
    ]);
    setCategorias((cats ?? []) as Categoria[]);
    setPlanos((pls ?? []) as PlanoConta[]);
    setLoading(false);
  }

  // ── Categoria handlers ──
  function startAddCat() {
    setCatEditId(null);
    setCatForm(emptyCategoria());
    setCatAdding(true);
  }
  function startEditCat(c: Categoria) {
    setCatAdding(false);
    setCatEditId(c.id);
    setCatForm({ codigo: c.codigo, descricao: c.descricao, indicador: c.indicador, faixa_dre: c.faixa_dre });
  }
  function cancelCat() { setCatAdding(false); setCatEditId(null); }

  async function saveCat() {
    if (!catForm.descricao.trim() || !catForm.codigo) return;
    setCatSalvando(true);
    if (catEditId) {
      await supabase.from("pc_categorias").update(catForm as never).eq("id", catEditId);
    } else {
      await supabase.from("pc_categorias").insert([{ ...catForm, ativo: true }] as never);
    }
    setCatSalvando(false);
    cancelCat();
    load();
  }

  async function deleteCat(id: number) {
    const temPlanos = planos.some(p => p.categoria_id === id);
    if (temPlanos) { alert("Esta categoria possui planos vinculados. Remova-os primeiro."); return; }
    if (!confirm("Excluir esta categoria?")) return;
    await supabase.from("pc_categorias").delete().eq("id", id);
    load();
  }

  // ── Plano handlers ──
  function startAddPlano() {
    setPlanoEditId(null);
    setPlanoForm(emptyPlano());
    setPlanoAdding(true);
  }
  function startEditPlano(p: PlanoConta) {
    setPlanoAdding(false);
    setPlanoEditId(p.id);
    setPlanoForm({ codigo: p.codigo, codigo_estruturado: p.codigo_estruturado, descricao: p.descricao, categoria_id: p.categoria_id });
  }
  function cancelPlano() { setPlanoAdding(false); setPlanoEditId(null); }

  async function savePlano() {
    if (!planoForm.descricao.trim() || !planoForm.codigo || !planoForm.codigo_estruturado) return;
    setPlanoSalvando(true);
    if (planoEditId) {
      await supabase.from("plano_contas").update(planoForm as never).eq("id", planoEditId);
    } else {
      await supabase.from("plano_contas").insert([{ ...planoForm, ativo: true }] as never);
    }
    setPlanoSalvando(false);
    cancelPlano();
    load();
  }

  async function deletePlano(id: number) {
    if (!confirm("Excluir este plano de contas?")) return;
    await supabase.from("plano_contas").delete().eq("id", id);
    load();
  }

  // ── derived ──
  const planosFiltrados = planos.filter(p => {
    const q = busca.toLowerCase();
    if (q && !p.descricao.toLowerCase().includes(q) && !p.codigo_estruturado.includes(q)) return false;
    if (filtroCat !== "" && p.categoria_id !== filtroCat) return false;
    return true;
  });

  const totalCredito = planos.filter(p => p.pc_categorias?.indicador === "Crédito").length;
  const totalDebito  = planos.filter(p => p.pc_categorias?.indicador === "Débito").length;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Plano de Contas</div>
        <div style={{ display: "flex", gap: "8px" }}>
          {aba === "categorias"
            ? <button className="btn bp sm" onClick={startAddCat}>+ Nova Categoria</button>
            : <button className="btn bp sm" onClick={startAddPlano}>+ Novo Plano</button>
          }
        </div>
      </div>

      <div className="con">

        {/* Abas */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "20px", borderBottom: "1px solid var(--b1)", paddingBottom: "0" }}>
          {(["plano", "categorias"] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} style={{
              padding: "8px 18px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer",
              background: "transparent", borderBottom: aba === a ? "2px solid var(--acc)" : "2px solid transparent",
              color: aba === a ? "var(--acc)" : "var(--t3)", marginBottom: "-1px", transition: "0.15s",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {a === "plano" ? "Planos de Contas" : "Categorias"}
            </button>
          ))}
        </div>

        {loading ? <div className="loading">Carregando...</div> : (

          // ══════════════════════════════════════════════════════
          // ABA: PLANO DE CONTAS
          // ══════════════════════════════════════════════════════
          aba === "plano" ? (
            <div>
              {/* Resumo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
                {[
                  { label: "Total de Contas",  val: planos.length,   cor: "var(--acc)" },
                  { label: "Contas Crédito",   val: totalCredito,    cor: "var(--ok)" },
                  { label: "Contas Débito",    val: totalDebito,     cor: "var(--err)" },
                ].map(s => (
                  <div key={s.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 18px" }}>
                    <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "6px" }}>{s.label}</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: s.cor, fontFamily: "'DM Mono', monospace" }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Filtros */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
                <input className="fc" placeholder="Buscar por descrição ou código..." value={busca}
                  onChange={e => setBusca(e.target.value)}
                  style={{ flex: 1, margin: 0 }} />
                <select className="fc" value={filtroCat} onChange={e => setFiltroCat(e.target.value === "" ? "" : Number(e.target.value))}
                  style={{ minWidth: "220px", margin: 0 }}>
                  <option value="">Todas as categorias</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.descricao}</option>)}
                </select>
                {(busca || filtroCat !== "") && (
                  <button className="btn bg sm" onClick={() => { setBusca(""); setFiltroCat(""); }}>✕ Limpar</button>
                )}
              </div>

              {/* Modal plano add/edit */}
              {(planoAdding || planoEditId !== null) && (
                <div className="mov open" onClick={e => e.target === e.currentTarget && cancelPlano()}>
                  <div className="mod" style={{ width: "540px" }}>
                    <div className="mhd">
                      <div className="mtit">{planoEditId ? "Editar Plano de Contas" : "Novo Plano de Contas"}</div>
                      <button className="mcl" onClick={cancelPlano}>✕</button>
                    </div>
                    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div className="fr">
                        <div className="fg" style={{ maxWidth: "90px" }}>
                          <label className="fl">Código</label>
                          <input type="number" className="fc" value={planoForm.codigo || ""}
                            onChange={e => setPlanoForm(f => ({ ...f, codigo: Number(e.target.value) }))} placeholder="69" />
                        </div>
                        <div className="fg" style={{ maxWidth: "140px" }}>
                          <label className="fl">Cód. Estruturado</label>
                          <input className="fc" style={{ fontFamily: "'DM Mono', monospace" }} value={planoForm.codigo_estruturado}
                            onChange={e => setPlanoForm(f => ({ ...f, codigo_estruturado: e.target.value }))} placeholder="7.13" />
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Descrição</label>
                        <input className="fc" value={planoForm.descricao}
                          onChange={e => setPlanoForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Nome do plano de contas" />
                      </div>
                      <div className="fg">
                        <label className="fl">Categoria</label>
                        <select className="fc" value={planoForm.categoria_id ?? ""}
                          onChange={e => setPlanoForm(f => ({ ...f, categoria_id: e.target.value ? Number(e.target.value) : null }))}>
                          <option value="">Selecione...</option>
                          {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.descricao}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
                      <button className="btn bg" onClick={cancelPlano}>Cancelar</button>
                      <button className="btn bp" onClick={savePlano} disabled={planoSalvando || !planoForm.descricao || !planoForm.codigo || !planoForm.codigo_estruturado}>
                        {planoSalvando ? "Salvando..." : planoEditId ? "Salvar alterações" : "Adicionar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabela */}
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "70px" }}>Código</th>
                      <th style={{ width: "110px" }}>Cód. Estruturado</th>
                      <th>Descrição</th>
                      <th style={{ width: "260px" }}>Categoria</th>
                      <th style={{ width: "80px" }}>Indicador</th>
                      <th style={{ width: "80px" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planosFiltrados.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>Nenhum resultado.</td></tr>
                    )}
                    {planosFiltrados.map(p => (
                      <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.45 }}>
                        <td className="mono" style={{ fontWeight: 700, color: "var(--t2)" }}>{p.codigo}</td>
                        <td className="mono" style={{ fontWeight: 700, color: "var(--acc)", fontSize: "13px" }}>{p.codigo_estruturado}</td>
                        <td style={{ fontWeight: 500 }}>{p.descricao}</td>
                        <td style={{ fontSize: "12px", color: "var(--t2)" }}>{p.pc_categorias?.descricao ?? <span style={{ color: "var(--t3)" }}>—</span>}</td>
                        <td>
                          {p.pc_categorias?.indicador && (
                            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
                              background: p.pc_categorias.indicador === "Crédito" ? "rgba(61,255,160,.12)" : "rgba(255,80,80,.12)",
                              color: COR_INDICADOR[p.pc_categorias.indicador] }}>
                              {p.pc_categorias.indicador}
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button className="btn bg xs" onClick={() => startEditPlano(p)} title="Editar">✎</button>
                            <button className="btn bg xs" onClick={() => deletePlano(p.id)} style={{ color: "var(--err)" }} title="Excluir">✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--t3)" }}>
                {planosFiltrados.length} de {planos.length} registro(s)
              </div>
            </div>

          ) : (

          // ══════════════════════════════════════════════════════
          // ABA: CATEGORIAS
          // ══════════════════════════════════════════════════════
            <div>
              {/* Modal categoria add/edit */}
              {(catAdding || catEditId !== null) && (
                <div className="mov open" onClick={e => e.target === e.currentTarget && cancelCat()}>
                  <div className="mod" style={{ width: "500px" }}>
                    <div className="mhd">
                      <div className="mtit">{catEditId ? "Editar Categoria" : "Nova Categoria"}</div>
                      <button className="mcl" onClick={cancelCat}>✕</button>
                    </div>
                    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div className="fr">
                        <div className="fg" style={{ maxWidth: "90px" }}>
                          <label className="fl">Código</label>
                          <input type="number" className="fc" value={catForm.codigo || ""}
                            onChange={e => setCatForm(f => ({ ...f, codigo: Number(e.target.value) }))} placeholder="19" />
                        </div>
                        <div className="fg">
                          <label className="fl">Indicador</label>
                          <select className="fc" value={catForm.indicador}
                            onChange={e => setCatForm(f => ({ ...f, indicador: e.target.value as "Crédito" | "Débito" }))}>
                            <option value="Crédito">Crédito</option>
                            <option value="Débito">Débito</option>
                          </select>
                        </div>
                      </div>
                      <div className="fg">
                        <label className="fl">Descrição</label>
                        <input className="fc" value={catForm.descricao}
                          onChange={e => setCatForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Nome da categoria" />
                      </div>
                      <div className="fg">
                        <label className="fl">Faixa no DRE</label>
                        <select className="fc" value={catForm.faixa_dre}
                          onChange={e => setCatForm(f => ({ ...f, faixa_dre: e.target.value }))}>
                          {FAIXAS_DRE.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
                      <button className="btn bg" onClick={cancelCat}>Cancelar</button>
                      <button className="btn bp" onClick={saveCat} disabled={catSalvando || !catForm.descricao || !catForm.codigo}>
                        {catSalvando ? "Salvando..." : catEditId ? "Salvar alterações" : "Adicionar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabela */}
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "80px" }}>Código</th>
                      <th>Descrição</th>
                      <th style={{ width: "110px" }}>Indicador</th>
                      <th style={{ width: "220px" }}>Faixa no DRE</th>
                      <th style={{ width: "90px" }}>Planos</th>
                      <th style={{ width: "80px" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>Nenhuma categoria cadastrada.</td></tr>
                    )}
                    {categorias.map(c => {
                      const qtd = planos.filter(p => p.categoria_id === c.id).length;
                      return (
                        <tr key={c.id}>
                          <td className="mono" style={{ fontWeight: 700, color: "var(--acc)" }}>{c.codigo}</td>
                          <td style={{ fontWeight: 600 }}>{c.descricao}</td>
                          <td>
                            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
                              background: c.indicador === "Crédito" ? "rgba(61,255,160,.12)" : "rgba(255,80,80,.12)",
                              color: COR_INDICADOR[c.indicador] }}>
                              {c.indicador}
                            </span>
                          </td>
                          <td style={{ fontSize: "12px", color: "var(--t2)" }}>{c.faixa_dre}</td>
                          <td>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)" }}>{qtd} conta{qtd !== 1 ? "s" : ""}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button className="btn bg xs" onClick={() => startEditCat(c)} title="Editar">✎</button>
                              <button className="btn bg xs" onClick={() => deleteCat(c.id)} style={{ color: "var(--err)" }} title="Excluir">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--t3)" }}>
                {categorias.length} categoria(s)
              </div>
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}
