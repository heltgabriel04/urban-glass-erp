"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { registrarLog } from "@/services/log.service";

const CATEGORIAS = ["Manutenção", "Equipamentos e Material"] as const;

interface Investimento {
  id: string;
  data: string;
  empresa: string;
  categoria: string | null;
  descricao: string;
  valor: number;
  observacoes: string | null;
  comprovante_url: string | null;
  created_at: string;
}

interface RowState {
  data: string;
  empresa: string;
  categoria: string;
  descricao: string;
  valor: number;
  observacoes: string;
  comprovante_url: string;
}

function hoje() { return new Date().toISOString().split("T")[0]; }
function fmtData(iso: string) { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); }

const EMPTY: RowState = {
  data: hoje(), empresa: "", categoria: "", descricao: "", valor: 0, observacoes: "", comprovante_url: "",
};

export default function InvestimentosPage() {
  const [investimentos, setInvestimentos] = useState<Investimento[]>([]);
  const [loading, setLoading]             = useState(true);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editForm, setEditForm]           = useState<RowState>({ ...EMPTY });
  const [addingNew, setAddingNew]         = useState(false);
  const [newForm, setNewForm]             = useState<RowState>({ ...EMPTY });
  const [salvando, setSalvando]           = useState(false);
  const [busca, setBusca]                 = useState("");
  const [filtroBanco, setFiltroBanco]     = useState("");
  const [filtroAno, setFiltroAno]         = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("investimentos").select("*").order("data", { ascending: false });
    setInvestimentos((data ?? []) as Investimento[]);
    setLoading(false);
  }

  function startEdit(inv: Investimento) {
    if (editingId === inv.id) { setEditingId(null); return; }
    setAddingNew(false);
    setEditingId(inv.id);
    setEditForm({
      data: inv.data, empresa: inv.empresa, categoria: inv.categoria ?? "",
      descricao: inv.descricao, valor: Number(inv.valor),
      observacoes: inv.observacoes ?? "", comprovante_url: inv.comprovante_url ?? "",
    });
  }

  function cancelEdit() { setEditingId(null); }

  async function saveEdit() {
    if (!editingId || !editForm.empresa.trim() || !editForm.descricao.trim() || !editForm.valor) return;
    setSalvando(true);
    const { error } = await supabase.from("investimentos").update({
      data: editForm.data,
      empresa: editForm.empresa.trim(),
      categoria: editForm.categoria || null,
      descricao: editForm.descricao.trim(),
      valor: editForm.valor,
      observacoes: editForm.observacoes.trim() || null,
      comprovante_url: editForm.comprovante_url.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", editingId);
    if (error) { alert("Erro: " + error.message); setSalvando(false); return; }
    registrarLog({ acao: "editou", tabela: "investimentos", registro_id: editingId, descricao: `Editou aporte de ${editForm.empresa}` });
    setSalvando(false);
    setEditingId(null);
    load();
  }

  function startAdd() {
    setEditingId(null);
    setNewForm({ ...EMPTY, data: hoje() });
    setAddingNew(true);
  }

  function cancelAdd() { setAddingNew(false); }

  async function saveAdd() {
    if (!newForm.empresa.trim() || !newForm.descricao.trim() || !newForm.valor) return;
    setSalvando(true);
    const { error } = await supabase.from("investimentos").insert([{
      data: newForm.data,
      empresa: newForm.empresa.trim(),
      categoria: newForm.categoria || null,
      descricao: newForm.descricao.trim(),
      valor: newForm.valor,
      observacoes: newForm.observacoes.trim() || null,
      comprovante_url: newForm.comprovante_url.trim() || null,
      updated_at: new Date().toISOString(),
    }] as never);
    if (error) { alert("Erro: " + error.message); setSalvando(false); return; }
    registrarLog({ acao: "criou", tabela: "investimentos", descricao: `Aporte ${formatBRL(newForm.valor)} · ${newForm.empresa}` });
    setSalvando(false);
    setAddingNew(false);
    load();
  }

  async function excluir(inv: Investimento) {
    if (!confirm(`Excluir aporte de ${formatBRL(Number(inv.valor))} de "${inv.empresa}"?\nEsta ação não pode ser desfeita.`)) return;
    await supabase.from("investimentos").delete().eq("id", inv.id);
    registrarLog({ acao: "excluiu", tabela: "investimentos", registro_id: inv.id, descricao: `Excluiu aporte de ${inv.empresa}` });
    if (editingId === inv.id) setEditingId(null);
    load();
  }

  // ─── derived ──────────────────────────────────────────────────────────────

  const filtered = investimentos.filter(inv => {
    const q = busca.toLowerCase();
    if (q && !inv.empresa.toLowerCase().includes(q) && !inv.descricao.toLowerCase().includes(q)) return false;
    if (filtroBanco && inv.empresa !== filtroBanco) return false;
    if (filtroAno && !inv.data.startsWith(filtroAno)) return false;
    return true;
  });

  const totalGeral    = investimentos.reduce((s, i) => s + Number(i.valor), 0);
  const totalFiltrado = filtered.reduce((s, i) => s + Number(i.valor), 0);
  const maiorAporte   = investimentos.length ? Math.max(...investimentos.map(i => Number(i.valor))) : 0;
  const mediaAporte   = investimentos.length ? totalGeral / investimentos.length : 0;
  const bancos        = [...new Set(investimentos.map(i => i.empresa))].sort();
  const anos          = [...new Set(investimentos.map(i => i.data.substring(0, 4)))].sort().reverse();
  const temFiltro     = !!(busca || filtroBanco || filtroAno);

  function handlePDF() {
    const orig = document.title;
    document.title = `Investimentos - Urban Glass - ${new Date().toLocaleDateString("pt-BR")}`;
    window.print();
    setTimeout(() => { document.title = orig; }, 2000);
  }

  // ─── style tokens ─────────────────────────────────────────────────────────

  const G   = "#f59e0b";
  const GB  = "rgba(245,158,11,.10)";
  const GBR = "rgba(245,158,11,.22)";

  const ci: React.CSSProperties = {
    width: "100%", minWidth: 0, fontSize: "12px", padding: "4px 6px",
    background: "var(--surf1)", border: "1px solid var(--acc)", borderRadius: "4px",
    color: "var(--t1)", fontFamily: "inherit", boxSizing: "border-box",
  };
  const cs: React.CSSProperties = { ...ci, cursor: "pointer" };

  const editActions = (onSave: () => void, onCancel: () => void) => (
    <div style={{ display: "flex", gap: "3px" }}>
      <button className="btn bp xs" onClick={onSave} disabled={salvando}>✓</button>
      <button className="btn bg xs" onClick={onCancel}>✕</button>
    </div>
  );

  // Columns: Data | Descrição | Banco | Valor | Categoria | Observação | Link | Ações
  const editRow = (
    form: RowState,
    set: React.Dispatch<React.SetStateAction<RowState>>,
    onSave: () => void,
    onCancel: () => void,
    isNew: boolean,
    key?: string,
  ) => (
    <tr key={key} style={{ background: isNew ? "rgba(245,158,11,.05)" : "var(--surf2)", outline: `1px solid ${isNew ? GBR : "var(--acc)"}` }}>
      <td style={{ minWidth: "90px" }}>
        <DateInput value={form.data} onChange={v => set(f => ({ ...f, data: v }))} />
      </td>
      <td>
        <input style={ci} value={form.descricao} placeholder="Descrição *"
          autoFocus={isNew}
          onChange={e => set(f => ({ ...f, descricao: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && onSave()} />
      </td>
      <td>
        <input style={ci} value={form.empresa} placeholder="Banco *"
          onChange={e => set(f => ({ ...f, empresa: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && onSave()} />
      </td>
      <td>
        <CurrencyInput value={form.valor} onChange={v => set(f => ({ ...f, valor: v }))} />
      </td>
      <td>
        <select style={cs} value={form.categoria} onChange={e => set(f => ({ ...f, categoria: e.target.value }))}>
          <option value="">—</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td>
        <input style={ci} value={form.observacoes} placeholder="Observação..."
          onChange={e => set(f => ({ ...f, observacoes: e.target.value }))} />
      </td>
      <td>
        <input style={ci} value={form.comprovante_url} placeholder="https://..."
          onChange={e => set(f => ({ ...f, comprovante_url: e.target.value }))} />
      </td>
      <td>{editActions(onSave, onCancel)}</td>
    </tr>
  );

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <style>{`
        .inv-print { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .inv-print {
            display: block !important; visibility: visible !important;
            position: fixed !important; inset: 0 !important;
            background: #fff !important; color: #111 !important;
            padding: 36px 44px !important; z-index: 9999 !important;
          }
          .inv-print * { visibility: visible !important; }
        }
      `}</style>

      {/* Top bar */}
      <div className="tb">
        <div className="tb-title">Investimentos</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={handlePDF} disabled={!investimentos.length}>⬡ Exportar PDF</button>
          <button className="btn bp sm" onClick={startAdd}>+ Novo Aporte</button>
        </div>
      </div>

      <div className="con">

        {/* Stats — same card pattern as every other page */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "22px" }}>
          {[
            { label: "Total Investido",    val: formatBRL(totalGeral),   sub: `${investimentos.length} aporte(s)`, c: G },
            { label: "Maior Aporte",       val: formatBRL(maiorAporte),  sub: "individual",                        c: G },
            { label: "Média por Aporte",   val: formatBRL(mediaAporte),  sub: "por registro",                      c: "var(--acc)" },
            { label: "Bancos / Origens",   val: String(bancos.length),   sub: "registrados",                       c: "var(--acc2)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: s.c, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{s.val}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap", alignItems: "center" }}>
          <input className="fc" placeholder="Buscar banco ou descrição..." value={busca}
            onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: "200px" }} />
          <select className="fc" style={{ minWidth: "160px" }} value={filtroBanco} onChange={e => setFiltroBanco(e.target.value)}>
            <option value="">Todos os bancos</option>
            {bancos.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="fc" style={{ minWidth: "100px" }} value={filtroAno} onChange={e => setFiltroAno(e.target.value)}>
            <option value="">Todos os anos</option>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {temFiltro && (
            <button className="btn bg sm" onClick={() => { setBusca(""); setFiltroBanco(""); setFiltroAno(""); }}>
              ✕ Limpar
            </button>
          )}
        </div>

        {temFiltro && filtered.length > 0 && (
          <div style={{ marginBottom: "14px", padding: "9px 14px", background: GB, border: `1px solid ${GBR}`, borderRadius: "8px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: G }}>
            <span>{filtered.length} resultado(s)</span>
            <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{formatBRL(totalFiltrado)}</span>
          </div>
        )}

        {loading ? (
          <div className="loading">Carregando investimentos...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "90px" }}>Data</th>
                  <th>Descrição</th>
                  <th style={{ width: "140px" }}>Banco</th>
                  <th style={{ width: "120px", textAlign: "right" }}>Valor</th>
                  <th style={{ width: "150px" }}>Categoria</th>
                  <th style={{ width: "160px" }}>Observação</th>
                  <th style={{ width: "70px" }}>Link</th>
                  <th style={{ width: "72px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>

                {addingNew && editRow(newForm, setNewForm, saveAdd, cancelAdd, true, "__new__")}

                {filtered.length === 0 && !addingNew && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      {investimentos.length === 0
                        ? 'Nenhum aporte registrado. Clique em "+ Novo Aporte" para começar.'
                        : "Nenhum resultado para os filtros selecionados."}
                    </td>
                  </tr>
                )}

                {filtered.map(inv => editingId === inv.id
                  ? editRow(editForm, setEditForm, saveEdit, cancelEdit, false, inv.id)
                  : (
                    <tr key={inv.id}
                      onClick={() => startEdit(inv)}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                    >
                      <td className="mono" style={{ fontSize: "12px" }}>{fmtData(inv.data)}</td>
                      <td style={{ fontSize: "13px", fontWeight: 500 }}>{inv.descricao}</td>
                      <td style={{ fontSize: "13px", fontWeight: 600 }}>{inv.empresa}</td>
                      <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: G, fontSize: "14px" }}>
                        {formatBRL(Number(inv.valor))}
                      </td>
                      <td>
                        {inv.categoria
                          ? <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: GB, color: G, border: `1px solid ${GBR}`, whiteSpace: "nowrap" }}>{inv.categoria}</span>
                          : <span style={{ color: "var(--t3)" }}>—</span>}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--t3)" }}>{inv.observacoes || "—"}</td>
                      <td onClick={e => e.stopPropagation()}>
                        {inv.comprovante_url && inv.comprovante_url.startsWith("http") ? (
                          <a href={inv.comprovante_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: "12px", color: "var(--acc2)", textDecoration: "none" }}>
                            📎 Ver
                          </a>
                        ) : inv.comprovante_url ? (
                          <span style={{ fontSize: "11px", color: "var(--t3)" }}>{inv.comprovante_url}</span>
                        ) : (
                          <span style={{ color: "var(--t3)" }}>—</span>
                        )}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button
                          title="Excluir"
                          style={{ width: "28px", height: "28px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .1s" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "var(--err)"; e.currentTarget.style.borderColor = "var(--err)"; e.currentTarget.style.background = "rgba(244,63,94,.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.borderColor = "var(--b2)"; e.currentTarget.style.background = "transparent"; }}
                          onClick={() => excluir(inv)}
                        >🗑</button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>

              {investimentos.length > 0 && (
                <tfoot>
                  <tr style={{ background: "var(--surf1)" }}>
                    <td colSpan={3} style={{ padding: "10px 12px", fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>
                      {temFiltro ? `${filtered.length} de ${investimentos.length} aporte(s)` : `${investimentos.length} aporte(s)`}
                    </td>
                    <td className="mono" style={{ textAlign: "right", color: G, fontWeight: 700, padding: "10px 12px", fontSize: "14px" }}>
                      {formatBRL(temFiltro ? totalFiltrado : totalGeral)}
                    </td>
                    <td colSpan={4} style={{ fontSize: "11px", color: "var(--t3)", padding: "10px 12px" }}>total investido</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* ── PDF / Print ── */}
      <div className="inv-print">
        <div style={{ borderBottom: "3px solid #f59e0b", paddingBottom: "18px", marginBottom: "28px" }}>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#111", letterSpacing: "-0.5px" }}>
            Urban Glass — Relatório de Investimentos
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "6px" }}>
            Gerado em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            {" · "}Total investido: <strong style={{ color: "#d97706", fontFamily: "monospace" }}>{formatBRL(totalGeral)}</strong>
            {" · "}{investimentos.length} aporte(s) · {bancos.length} banco(s)
          </div>
        </div>

        {bancos.length > 0 && (
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", marginBottom: "8px" }}>
              Resumo por Banco / Origem
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f9f9f9" }}>
                  {["Banco", "Aportes", "Total"].map((h, i) => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: i === 2 ? "right" : i === 1 ? "center" : "left", color: "#555", fontWeight: 600, fontSize: "10px", textTransform: "uppercase", borderBottom: "2px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bancos.map(b => {
                  const its = investimentos.filter(i => i.empresa === b);
                  const tot = its.reduce((s, i) => s + Number(i.valor), 0);
                  return (
                    <tr key={b}>
                      <td style={{ padding: "7px 10px", color: "#111", fontWeight: 600, borderBottom: "1px solid #f0f0f0" }}>{b}</td>
                      <td style={{ padding: "7px 10px", color: "#555", textAlign: "center", borderBottom: "1px solid #f0f0f0" }}>{its.length}</td>
                      <td style={{ padding: "7px 10px", color: "#d97706", fontWeight: 700, textAlign: "right", fontFamily: "monospace", borderBottom: "1px solid #f0f0f0" }}>{formatBRL(tot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", marginBottom: "10px" }}>
          Detalhamento
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {["Data", "Descrição", "Banco", "Valor", "Categoria", "Observação", "Link"].map(h => (
                <th key={h} style={{ padding: "6px 8px", textAlign: h === "Valor" ? "right" : "left", color: "#555", fontWeight: 600, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {investimentos.map((inv, idx) => (
              <tr key={inv.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "7px 8px", color: "#444", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap", fontFamily: "monospace" }}>{fmtData(inv.data)}</td>
                <td style={{ padding: "7px 8px", color: "#333", borderBottom: "1px solid #f0f0f0" }}>{inv.descricao}</td>
                <td style={{ padding: "7px 8px", color: "#111", fontWeight: 600, borderBottom: "1px solid #f0f0f0" }}>{inv.empresa}</td>
                <td style={{ padding: "7px 8px", color: "#d97706", fontWeight: 700, textAlign: "right", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap", fontFamily: "monospace" }}>{formatBRL(Number(inv.valor))}</td>
                <td style={{ padding: "7px 8px", color: "#d97706", borderBottom: "1px solid #f0f0f0" }}>{inv.categoria ?? "—"}</td>
                <td style={{ padding: "7px 8px", color: "#666", borderBottom: "1px solid #f0f0f0" }}>{inv.observacoes ?? "—"}</td>
                <td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0f0", color: inv.comprovante_url ? "#2563eb" : "#bbb" }}>{inv.comprovante_url ? "Anexo" : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#fff8e6" }}>
              <td colSpan={3} style={{ padding: "7px 8px", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#888" }}>Total Geral</td>
              <td style={{ padding: "7px 8px", fontWeight: 900, color: "#d97706", textAlign: "right", fontFamily: "monospace" }}>{formatBRL(totalGeral)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </AppLayout>
  );
}
