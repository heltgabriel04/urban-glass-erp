"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { registrarLog } from "@/services/log.service";

// ─── types ───────────────────────────────────────────────────────────────────

interface Investimento {
  id: string;
  data: string;
  empresa: string;
  descricao: string;
  valor: number;
  observacoes: string | null;
  comprovante_url: string | null;
  created_at: string;
}

interface FormState {
  data: string;
  empresa: string;
  descricao: string;
  valor: number;
  observacoes: string;
  comprovante_url: string;
}

interface Grupo {
  key: string;
  label: string;
  items: Investimento[];
  total: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hoje() { return new Date().toISOString().split("T")[0]; }

function fmtData(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

function agruparPorMes(items: Investimento[]): Grupo[] {
  const sorted = [...items].sort((a, b) => b.data.localeCompare(a.data));
  const map = new Map<string, Investimento[]>();
  for (const item of sorted) {
    const key = item.data.substring(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([key, its]) => {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    const lbl = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return {
      key,
      label: lbl.charAt(0).toUpperCase() + lbl.slice(1),
      items: its,
      total: its.reduce((s, i) => s + Number(i.valor), 0),
    };
  });
}

const FORM_VAZIO: FormState = {
  data: hoje(), empresa: "", descricao: "", valor: 0, observacoes: "", comprovante_url: "",
};

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestimentosPage() {
  const [investimentos, setInvestimentos] = useState<Investimento[]>([]);
  const [loading, setLoading]             = useState(true);
  const [panelOpen, setPanelOpen]         = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [form, setForm]                   = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando]           = useState(false);
  const [busca, setBusca]                 = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroAno, setFiltroAno]         = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("investimentos")
      .select("*")
      .order("data", { ascending: false });
    setInvestimentos((data ?? []) as Investimento[]);
    setLoading(false);
  }

  function abrirNovo() {
    setForm({ ...FORM_VAZIO, data: hoje() });
    setEditingId(null);
    setPanelOpen(true);
  }

  function abrirEditar(inv: Investimento) {
    setForm({
      data: inv.data,
      empresa: inv.empresa,
      descricao: inv.descricao,
      valor: Number(inv.valor),
      observacoes: inv.observacoes ?? "",
      comprovante_url: inv.comprovante_url ?? "",
    });
    setEditingId(inv.id);
    setPanelOpen(true);
  }

  function fecharPanel() { setPanelOpen(false); setEditingId(null); }

  async function salvar() {
    if (!form.empresa.trim())  { alert("Informe a empresa investidora."); return; }
    if (!form.descricao.trim()) { alert("Informe a descrição."); return; }
    if (!form.valor || form.valor <= 0) { alert("Informe o valor do aporte."); return; }
    if (!form.data) { alert("Informe a data."); return; }

    setSalvando(true);
    const payload = {
      data:            form.data,
      empresa:         form.empresa.trim(),
      descricao:       form.descricao.trim(),
      valor:           form.valor,
      observacoes:     form.observacoes.trim() || null,
      comprovante_url: form.comprovante_url.trim() || null,
      updated_at:      new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase.from("investimentos").update(payload).eq("id", editingId);
      if (error) { alert("Erro: " + error.message); setSalvando(false); return; }
      registrarLog({ acao: "editou", tabela: "investimentos", registro_id: editingId, descricao: `Editou aporte de ${form.empresa}` });
    } else {
      const { error } = await supabase.from("investimentos").insert([payload] as never);
      if (error) { alert("Erro: " + error.message); setSalvando(false); return; }
      registrarLog({ acao: "criou", tabela: "investimentos", descricao: `Aporte ${formatBRL(form.valor)} · ${form.empresa}` });
    }

    setSalvando(false);
    fecharPanel();
    load();
  }

  async function excluir(inv: Investimento) {
    if (!confirm(`Excluir aporte de ${formatBRL(Number(inv.valor))} de "${inv.empresa}"?\nEsta ação não pode ser desfeita.`)) return;
    await supabase.from("investimentos").delete().eq("id", inv.id);
    registrarLog({ acao: "excluiu", tabela: "investimentos", registro_id: inv.id, descricao: `Excluiu aporte de ${inv.empresa}` });
    load();
  }

  // ─── derived ─────────────────────────────────────────────────────────────

  const filtered = investimentos.filter(inv => {
    const q = busca.toLowerCase();
    if (q && !inv.empresa.toLowerCase().includes(q) && !inv.descricao.toLowerCase().includes(q)) return false;
    if (filtroEmpresa && inv.empresa !== filtroEmpresa) return false;
    if (filtroAno && !inv.data.startsWith(filtroAno)) return false;
    return true;
  });

  const grupos      = agruparPorMes(filtered);
  const todosGrupos = agruparPorMes(investimentos);

  const totalGeral    = investimentos.reduce((s, i) => s + Number(i.valor), 0);
  const totalFiltrado = filtered.reduce((s, i) => s + Number(i.valor), 0);
  const maiorAporte   = investimentos.length ? Math.max(...investimentos.map(i => Number(i.valor))) : 0;
  const mediaAporte   = investimentos.length ? totalGeral / investimentos.length : 0;
  const empresas      = [...new Set(investimentos.map(i => i.empresa))].sort();
  const anos          = [...new Set(investimentos.map(i => i.data.substring(0, 4)))].sort().reverse();
  const temFiltro     = !!(busca || filtroEmpresa || filtroAno);

  function handlePDF() {
    const orig = document.title;
    document.title = `Investimentos - Urban Glass - ${new Date().toLocaleDateString("pt-BR")}`;
    window.print();
    setTimeout(() => { document.title = orig; }, 2000);
  }

  // ─── style tokens ────────────────────────────────────────────────────────

  const G    = "#f59e0b";
  const GB   = "rgba(245,158,11,.10)";
  const GBR  = "rgba(245,158,11,.22)";
  const COLS = "90px 170px 1fr 140px 38px 64px";

  const btnAct: React.CSSProperties = {
    width: "28px", height: "28px", borderRadius: "6px",
    background: "transparent", border: "1px solid var(--b2)",
    color: "var(--t3)", cursor: "pointer", fontSize: "11px",
    transition: "all 0.1s", display: "flex", alignItems: "center", justifyContent: "center",
  };

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <style>{`
        .inv-row:hover { background: rgba(245,158,11,.04) !important; }
        .inv-print { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .inv-print {
            display: block !important; visibility: visible !important;
            position: fixed !important; inset: 0 !important;
            background: #fff !important; color: #111 !important;
            padding: 36px 44px !important; z-index: 9999 !important;
            font-family: 'Inter', sans-serif !important;
          }
          .inv-print * { visibility: visible !important; }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div className="tb">
        <div className="tb-title">Investimentos</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={handlePDF} disabled={!investimentos.length}>
            ⬡ Exportar PDF
          </button>
          <button
            style={{
              padding: "7px 14px", borderRadius: "8px", border: "none",
              background: G, color: "#000", fontWeight: 700, fontSize: "12px",
              cursor: "pointer", fontFamily: "'DM Mono', monospace", transition: "opacity 0.1s",
            }}
            onClick={abrirNovo}
          >
            + Novo Aporte
          </button>
        </div>
      </div>

      <div className="con">
        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "22px" }}>
          {[
            { label: "Total Investido",       val: formatBRL(totalGeral),  sub: `${investimentos.length} aporte(s)`,  c: G },
            { label: "Maior Aporte",           val: formatBRL(maiorAporte), sub: "individual",                         c: G },
            { label: "Média por Aporte",       val: formatBRL(mediaAporte), sub: "por registro",                       c: "var(--acc)" },
            { label: "Empresas Investidoras",  val: String(empresas.length), sub: "registradas",                       c: "var(--acc2)" },
          ].map(s => (
            <div key={s.label} style={{
              background: "var(--surf1)", border: "1px solid var(--b1)",
              borderRadius: "10px", padding: "16px 18px",
            }}>
              <div style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: s.c, fontFamily: "'Syne',sans-serif", lineHeight: 1.2 }}>
                {s.val}
              </div>
              <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "4px", fontFamily: "'DM Mono',monospace" }}>
                {s.sub}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="fc"
            placeholder="Buscar empresa ou descrição..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ flex: 1, minWidth: "200px" }}
          />
          <select className="fc" style={{ minWidth: "180px" }} value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
            <option value="">Todas as empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="fc" style={{ minWidth: "100px" }} value={filtroAno} onChange={e => setFiltroAno(e.target.value)}>
            <option value="">Todos os anos</option>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {temFiltro && (
            <button className="btn bg sm" onClick={() => { setBusca(""); setFiltroEmpresa(""); setFiltroAno(""); }}>
              ✕ Limpar
            </button>
          )}
        </div>

        {/* Filtered subtotal */}
        {temFiltro && filtered.length > 0 && (
          <div style={{
            marginBottom: "14px", padding: "9px 14px",
            background: GB, border: `1px solid ${GBR}`, borderRadius: "8px",
            display: "flex", justifyContent: "space-between",
            fontSize: "12px", color: G, fontFamily: "'DM Mono',monospace",
          }}>
            <span>{filtered.length} resultado(s)</span>
            <span style={{ fontWeight: 700 }}>{formatBRL(totalFiltrado)}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px", color: "var(--t3)", fontSize: "13px" }}>
            Carregando investimentos...
          </div>
        )}

        {/* Empty state */}
        {!loading && investimentos.length === 0 && (
          <div style={{
            textAlign: "center", padding: "80px 40px",
            background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "12px",
          }}>
            <div style={{ fontSize: "36px", opacity: 0.3, marginBottom: "12px" }}>◆</div>
            <div style={{ fontSize: "15px", color: "var(--t2)", fontWeight: 600 }}>Nenhum aporte registrado</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "6px" }}>Clique em "Novo Aporte" para começar</div>
          </div>
        )}

        {/* No results */}
        {!loading && investimentos.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--t3)", fontSize: "13px" }}>
            Nenhum resultado para os filtros selecionados.
          </div>
        )}

        {/* ── Grupos por mês ── */}
        {grupos.map(grupo => (
          <div key={grupo.key} style={{ marginBottom: "22px" }}>
            {/* Month header */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "8px", padding: "0 2px" }}>
              <div style={{
                fontSize: "11px", fontWeight: 700, color: G,
                fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: "0.09em",
                whiteSpace: "nowrap",
              }}>
                {grupo.label}
              </div>
              <div style={{ flex: 1, height: "1px", background: GBR }} />
              <div style={{ fontSize: "13px", fontWeight: 700, color: G, fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
                {formatBRL(grupo.total)}
              </div>
            </div>

            {/* Card */}
            <div style={{
              background: "var(--surf1)", border: `1px solid var(--b1)`,
              borderRadius: "10px", overflow: "hidden",
            }}>
              {/* Table head */}
              <div style={{
                display: "grid", gridTemplateColumns: COLS, gap: "8px",
                padding: "8px 14px", background: "var(--surf2)", borderBottom: "1px solid var(--b1)",
              }}>
                {["Data", "Empresa", "Descrição", "Valor", "", ""].map((h, i) => (
                  <div key={i} style={{
                    fontSize: "9px", color: "var(--t3)", textTransform: "uppercase",
                    letterSpacing: "0.1em", fontFamily: "'DM Mono',monospace", fontWeight: 600,
                  }}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              {grupo.items.map((inv, idx) => (
                <div
                  key={inv.id}
                  className="inv-row"
                  style={{
                    display: "grid", gridTemplateColumns: COLS, gap: "8px",
                    padding: "13px 14px", alignItems: "center",
                    borderBottom: idx < grupo.items.length - 1 ? "1px solid var(--b1)" : "none",
                    transition: "background 0.12s",
                  }}
                >
                  {/* Data */}
                  <div style={{ fontSize: "12px", color: "var(--t2)", fontFamily: "'DM Mono',monospace" }}>
                    {fmtData(inv.data)}
                  </div>

                  {/* Empresa */}
                  <div style={{
                    fontSize: "13px", color: "var(--t1)", fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {inv.empresa}
                  </div>

                  {/* Descrição + obs */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                    <span style={{
                      fontSize: "13px", color: "var(--t1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {inv.descricao}
                    </span>
                    {inv.observacoes && (
                      <span style={{
                        fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {inv.observacoes}
                      </span>
                    )}
                  </div>

                  {/* Valor */}
                  <div style={{
                    fontSize: "15px", fontWeight: 700, color: G,
                    fontFamily: "'DM Mono',monospace", textAlign: "right",
                  }}>
                    {formatBRL(Number(inv.valor))}
                  </div>

                  {/* Comprovante */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {inv.comprovante_url ? (
                      <a
                        href={inv.comprovante_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver comprovante / NFe"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: "28px", height: "28px", borderRadius: "6px",
                          background: GB, border: `1px solid ${GBR}`,
                          color: G, fontSize: "13px", textDecoration: "none",
                        }}
                      >📎</a>
                    ) : (
                      <div style={{ width: "28px" }} />
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                    <button
                      style={btnAct}
                      title="Editar"
                      onClick={() => abrirEditar(inv)}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--acc)"; e.currentTarget.style.borderColor = "var(--acc)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.borderColor = "var(--b2)"; }}
                    >✎</button>
                    <button
                      style={btnAct}
                      title="Excluir"
                      onClick={() => excluir(inv)}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--err)"; e.currentTarget.style.borderColor = "var(--err)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.borderColor = "var(--b2)"; }}
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Overlay ── */}
      {panelOpen && (
        <div
          onClick={fecharPanel}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
            zIndex: 40, backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* ── Side Panel ── */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "400px",
        background: "var(--surf0)", borderLeft: `2px solid ${GBR}`,
        zIndex: 50,
        transform: panelOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.24s cubic-bezier(0.4,0,0.2,1)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Panel header */}
        <div style={{
          padding: "22px 24px 16px",
          borderBottom: "1px solid var(--b1)",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        }}>
          <div>
            <div style={{
              fontSize: "16px", fontWeight: 800, color: "var(--t1)",
              fontFamily: "'Syne',sans-serif", letterSpacing: "-0.3px",
            }}>
              {editingId ? "Editar Aporte" : "Novo Aporte"}
            </div>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", marginTop: "3px" }}>
              {editingId ? "Altere os dados do investimento" : "Registre um novo aporte de capital"}
            </div>
          </div>
          <button
            onClick={fecharPanel}
            style={{
              width: "30px", height: "30px", borderRadius: "8px",
              background: "transparent", border: "1px solid var(--b2)",
              color: "var(--t3)", cursor: "pointer", fontSize: "13px", flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Panel body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <div className="fg">
            <label className="fl">Data do Aporte</label>
            <DateInput className="fc" value={form.data} onChange={v => setForm(f => ({ ...f, data: v }))} />
          </div>

          <div className="fg">
            <label className="fl">Empresa Investidora</label>
            <input
              className="fc"
              placeholder="Nome da empresa ou investidor"
              value={form.empresa}
              onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
            />
          </div>

          <div className="fg">
            <label className="fl">Descrição</label>
            <input
              className="fc"
              placeholder="Ex: Aporte inicial, Capital de giro, Expansão..."
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            />
          </div>

          <div className="fg">
            <label className="fl">Valor do Aporte</label>
            <CurrencyInput
              value={form.valor}
              onChange={v => setForm(f => ({ ...f, valor: v }))}
              placeholder="R$ 0,00"
            />
          </div>

          <div className="fg">
            <label className="fl">Observações</label>
            <textarea
              className="fc"
              placeholder="Condições, prazo de retorno, taxa, notas relevantes..."
              rows={3}
              value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              style={{ resize: "vertical", minHeight: "72px" }}
            />
          </div>

          <div className="fg">
            <label className="fl">Comprovante / NFe (link)</label>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                className="fc"
                placeholder="https://drive.google.com/... ou número da NFe"
                value={form.comprovante_url}
                onChange={e => setForm(f => ({ ...f, comprovante_url: e.target.value }))}
                style={{ flex: 1 }}
              />
              {form.comprovante_url && (
                <a
                  href={form.comprovante_url.startsWith("http") ? form.comprovante_url : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: "40px", height: "40px", borderRadius: "7px",
                    background: GB, border: `1px solid ${GBR}`,
                    color: G, textDecoration: "none", fontSize: "15px", flexShrink: 0,
                  }}
                  title="Abrir link"
                >📎</a>
              )}
            </div>
            <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "4px", fontFamily: "'DM Mono',monospace" }}>
              Cole o link do Google Drive, Dropbox, OneDrive ou número de referência da NFe
            </div>
          </div>
        </div>

        {/* Panel footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid var(--b1)",
          display: "flex", gap: "8px",
        }}>
          <button className="btn bg" style={{ flex: 1 }} onClick={fecharPanel}>
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              flex: 2, padding: "10px 16px", borderRadius: "8px",
              background: salvando ? "rgba(245,158,11,.5)" : G,
              border: "none", color: "#000", fontWeight: 800,
              fontSize: "13px", cursor: salvando ? "not-allowed" : "pointer",
              fontFamily: "'DM Mono',monospace", transition: "background 0.1s",
            }}
          >
            {salvando ? "Salvando..." : (editingId ? "✓ Salvar Alterações" : "✓ Registrar Aporte")}
          </button>
        </div>
      </div>

      {/* ── Print / PDF ── */}
      <div className="inv-print">
        {/* Cabeçalho do relatório */}
        <div style={{ borderBottom: "3px solid #f59e0b", paddingBottom: "18px", marginBottom: "28px" }}>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#111", letterSpacing: "-0.5px" }}>
            Urban Glass — Relatório de Investimentos
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "6px", fontFamily: "monospace" }}>
            Gerado em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            {" · "}
            Total investido: <strong style={{ color: "#d97706" }}>{formatBRL(totalGeral)}</strong>
            {" · "}
            {investimentos.length} aporte(s) · {empresas.length} empresa(s)
          </div>
        </div>

        {/* Sumário de empresas */}
        {empresas.length > 0 && (
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", marginBottom: "8px", fontFamily: "monospace" }}>
              Resumo por Empresa Investidora
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f9f9f9" }}>
                  <th style={{ padding: "7px 10px", textAlign: "left", color: "#555", fontWeight: 600, fontSize: "10px", textTransform: "uppercase", borderBottom: "2px solid #e5e7eb" }}>Empresa</th>
                  <th style={{ padding: "7px 10px", textAlign: "center", color: "#555", fontWeight: 600, fontSize: "10px", textTransform: "uppercase", borderBottom: "2px solid #e5e7eb" }}>Aportes</th>
                  <th style={{ padding: "7px 10px", textAlign: "right", color: "#555", fontWeight: 600, fontSize: "10px", textTransform: "uppercase", borderBottom: "2px solid #e5e7eb" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map(emp => {
                  const itens = investimentos.filter(i => i.empresa === emp);
                  const total = itens.reduce((s, i) => s + Number(i.valor), 0);
                  return (
                    <tr key={emp}>
                      <td style={{ padding: "7px 10px", color: "#111", fontWeight: 600, borderBottom: "1px solid #f0f0f0" }}>{emp}</td>
                      <td style={{ padding: "7px 10px", color: "#555", textAlign: "center", borderBottom: "1px solid #f0f0f0" }}>{itens.length}</td>
                      <td style={{ padding: "7px 10px", color: "#d97706", fontWeight: 700, textAlign: "right", borderBottom: "1px solid #f0f0f0" }}>{formatBRL(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Detalhamento por mês */}
        <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", marginBottom: "16px", fontFamily: "monospace" }}>
          Detalhamento por Mês
        </div>

        {todosGrupos.map(grupo => (
          <div key={grupo.key} style={{ marginBottom: "26px" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 10px", background: "#fff8e6",
              border: "1px solid #f59e0b", borderRadius: "6px", marginBottom: "6px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 700, fontFamily: "monospace", color: "#111" }}>
                {grupo.label}
              </div>
              <div style={{ fontSize: "14px", fontWeight: 800, fontFamily: "monospace", color: "#d97706" }}>
                {formatBRL(grupo.total)}
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "monospace" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {["Data", "Empresa", "Descrição", "Observações", "Comprovante", "Valor"].map(h => (
                    <th key={h} style={{
                      padding: "6px 8px", textAlign: h === "Valor" ? "right" : "left",
                      color: "#555", fontWeight: 600, fontSize: "9px",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      borderBottom: "1px solid #e5e7eb",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupo.items.map((inv, idx) => (
                  <tr key={inv.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "7px 8px", color: "#444", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>
                      {fmtData(inv.data)}
                    </td>
                    <td style={{ padding: "7px 8px", color: "#111", fontWeight: 600, borderBottom: "1px solid #f0f0f0" }}>
                      {inv.empresa}
                    </td>
                    <td style={{ padding: "7px 8px", color: "#333", borderBottom: "1px solid #f0f0f0" }}>
                      {inv.descricao}
                    </td>
                    <td style={{ padding: "7px 8px", color: "#666", borderBottom: "1px solid #f0f0f0" }}>
                      {inv.observacoes ?? "—"}
                    </td>
                    <td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0f0", color: inv.comprovante_url ? "#2563eb" : "#bbb" }}>
                      {inv.comprovante_url ? "Anexo" : "—"}
                    </td>
                    <td style={{ padding: "7px 8px", color: "#d97706", fontWeight: 700, textAlign: "right", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>
                      {formatBRL(Number(inv.valor))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#fff8e6" }}>
                  <td colSpan={5} style={{ padding: "7px 8px", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#888" }}>
                    Subtotal {grupo.label}
                  </td>
                  <td style={{ padding: "7px 8px", fontWeight: 800, color: "#d97706", textAlign: "right" }}>
                    {formatBRL(grupo.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}

        {/* Total geral */}
        <div style={{
          marginTop: "32px", padding: "16px 18px",
          background: "#fff8e6", border: "2px solid #f59e0b", borderRadius: "8px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#111" }}>
            Total Geral Investido
          </div>
          <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "22px", color: "#d97706" }}>
            {formatBRL(totalGeral)}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
