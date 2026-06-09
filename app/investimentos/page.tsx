"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { registrarLog } from "@/services/log.service";

const BANCOS_DEFAULT    = ["Itaú Maxibuild", "ZRS"];
const CATS_DEFAULT      = ["Manutenção", "Equipamentos e Material"];

interface OpcaoLista { id: number; tipo: string; valor: string; }

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
  const [opcoesDB, setOpcoesDB]           = useState<OpcaoLista[]>([]);
  const [semTabela, setSemTabela]         = useState(false);
  const [modalListas, setModalListas]     = useState(false);
  const [novoBanco, setNovoBanco]         = useState("");
  const [novaCat, setNovaCat]             = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data }, { data: opts, error: erroOpts }] = await Promise.all([
      supabase.from("investimentos").select("*").order("data", { ascending: false }),
      supabase.from("inv_opcoes").select("*").order("valor"),
    ]);
    setInvestimentos((data ?? []) as Investimento[]);
    if (erroOpts) { setSemTabela(true); }
    else          { setSemTabela(false); setOpcoesDB((opts ?? []) as OpcaoLista[]); }
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

  async function addOpcao(tipo: "banco" | "categoria", valor: string) {
    if (!valor.trim()) return;
    await supabase.from("inv_opcoes").insert([{ tipo, valor: valor.trim() }] as never);
    if (tipo === "banco") setNovoBanco(""); else setNovaCat("");
    load();
  }

  async function removeOpcao(id: number) {
    await supabase.from("inv_opcoes").delete().eq("id", id);
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

  const listaBancos = opcoesDB.filter(o => o.tipo === "banco").map(o => o.valor).length
    ? opcoesDB.filter(o => o.tipo === "banco").map(o => o.valor)
    : BANCOS_DEFAULT;
  const listaCats   = opcoesDB.filter(o => o.tipo === "categoria").map(o => o.valor).length
    ? opcoesDB.filter(o => o.tipo === "categoria").map(o => o.valor)
    : CATS_DEFAULT;

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
      <td style={{ minWidth: "130px" }}>
        <DateInput value={form.data} onChange={v => set(f => ({ ...f, data: v }))} />
      </td>
      <td>
        <input style={ci} value={form.descricao} placeholder="Descrição *"
          autoFocus={isNew}
          onChange={e => set(f => ({ ...f, descricao: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && onSave()} />
      </td>
      <td>
        <select className="fc" style={{ margin: 0, width: "100%" }} value={form.empresa} onChange={e => set(f => ({ ...f, empresa: e.target.value }))}>
          <option value="">Selecione...</option>
          {listaBancos.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </td>
      <td style={{ minWidth: "150px" }}>
        <CurrencyInput value={form.valor} onChange={v => set(f => ({ ...f, valor: v }))} />
      </td>
      <td>
        <select className="fc" style={{ margin: 0, width: "100%" }} value={form.categoria} onChange={e => set(f => ({ ...f, categoria: e.target.value }))}>
          <option value="">—</option>
          {listaCats.map(c => <option key={c} value={c}>{c}</option>)}
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
          .no-print, .sb { display: none !important; }
          body { background: white !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .inv-print { display: block !important; }
          @page { margin: 12mm 14mm; size: A4 portrait; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      `}</style>

      {/* Top bar */}
      <div className="tb no-print">
        <div className="tb-title">Investimentos</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={handlePDF} disabled={!investimentos.length}>⬡ Exportar PDF</button>
          <button className="btn bg sm" onClick={() => setModalListas(true)}>⚙ Listas</button>
          <button className="btn bp sm" onClick={startAdd}>+ Novo Aporte</button>
        </div>
      </div>

      <div className="con no-print">

        {semTabela && (
          <div className="al al-w" style={{ marginBottom: "16px", fontSize: "12px" }}>
            <strong>⚠ Execute este SQL no Supabase para habilitar listas personalizadas:</strong>
            <code style={{ display: "block", marginTop: "8px", padding: "10px 14px", background: "rgba(0,0,0,.3)", borderRadius: "6px", fontFamily: "'DM Mono',monospace", fontSize: "11px", userSelect: "all", lineHeight: 1.8, whiteSpace: "pre" }}>{`CREATE TABLE IF NOT EXISTS inv_opcoes (\n  id serial PRIMARY KEY,\n  tipo text NOT NULL,\n  valor text NOT NULL,\n  UNIQUE(tipo, valor)\n);\n\nINSERT INTO inv_opcoes (tipo, valor) VALUES\n  ('banco', 'Itaú Maxibuild'),\n  ('banco', 'ZRS'),\n  ('categoria', 'Manutenção'),\n  ('categoria', 'Equipamentos e Material')\nON CONFLICT DO NOTHING;`}</code>
          </div>
        )}

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
                  <th style={{ width: "200px" }}>Descrição</th>
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

      {/* ── Modal Gerenciar Listas ── */}
      {modalListas && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={() => setModalListas(false)}>
          <div style={{ background: "var(--surf1)", border: "1px solid var(--b2)", borderRadius: "12px", padding: "28px 32px", width: "520px", maxWidth: "94vw" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <span style={{ fontSize: "15px", fontWeight: 700 }}>Gerenciar Listas</span>
              <button className="btn bg sm" onClick={() => setModalListas(false)}>✕ Fechar</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>

              {/* Bancos */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Bancos / Origens</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
                  {(opcoesDB.filter(o => o.tipo === "banco").length ? opcoesDB.filter(o => o.tipo === "banco") : BANCOS_DEFAULT.map((v, i) => ({ id: -i - 1, tipo: "banco", valor: v }))).map(o => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--surf2)", borderRadius: "6px", border: "1px solid var(--b1)" }}>
                      <span style={{ fontSize: "13px" }}>{o.valor}</span>
                      {o.id > 0 && (
                        <button
                          style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: "12px", padding: "0 2px" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "var(--err)")}
                          onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
                          onClick={() => removeOpcao(o.id)}
                        >✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input className="fc" value={novoBanco} onChange={e => setNovoBanco(e.target.value)}
                    placeholder="Novo banco..." style={{ margin: 0, flex: 1 }}
                    onKeyDown={e => e.key === "Enter" && addOpcao("banco", novoBanco)} />
                  <button className="btn bp sm" onClick={() => addOpcao("banco", novoBanco)} disabled={!novoBanco.trim()}>+</button>
                </div>
              </div>

              {/* Categorias */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Categorias</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
                  {(opcoesDB.filter(o => o.tipo === "categoria").length ? opcoesDB.filter(o => o.tipo === "categoria") : CATS_DEFAULT.map((v, i) => ({ id: -i - 1, tipo: "categoria", valor: v }))).map(o => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--surf2)", borderRadius: "6px", border: "1px solid var(--b1)" }}>
                      <span style={{ fontSize: "13px" }}>{o.valor}</span>
                      {o.id > 0 && (
                        <button
                          style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: "12px", padding: "0 2px" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "var(--err)")}
                          onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
                          onClick={() => removeOpcao(o.id)}
                        >✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input className="fc" value={novaCat} onChange={e => setNovaCat(e.target.value)}
                    placeholder="Nova categoria..." style={{ margin: 0, flex: 1 }}
                    onKeyDown={e => e.key === "Enter" && addOpcao("categoria", novaCat)} />
                  <button className="btn bp sm" onClick={() => addOpcao("categoria", novaCat)} disabled={!novaCat.trim()}>+</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── PDF / Print area ── */}
      <div className="inv-print" style={{ fontFamily: "Arial, sans-serif", color: "#111", background: "white", padding: "0" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px", paddingBottom: "16px", borderBottom: "3px solid #2d5fa6" }}>
          <div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" }}>urbanglass</div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: "2px" }}>Urban Glass Comércio Ltda</div>
            <div style={{ fontSize: "9px", color: "#555", marginTop: "1px" }}>CNPJ: 65.668.970/0001-05</div>
            <div style={{ fontSize: "9px", color: "#555" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "4px" }}>Relatório de</div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-0.5px", lineHeight: 1 }}>Investimentos</div>
            <div style={{ fontSize: "10px", color: "#555", marginTop: "6px" }}>
              Gerado em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "22px" }}>
          {[
            { label: "Total Investido",  value: formatBRL(totalGeral),              color: "#2d5fa6" },
            { label: "Nº de Aportes",    value: String(investimentos.length),        color: "#2d5fa6" },
            { label: "Média por Aporte", value: formatBRL(mediaAporte),             color: "#444" },
            { label: "Bancos / Origens", value: String(bancos.length),              color: "#444" },
          ].map(k => (
            <div key={k.label} style={{ background: "#f0f4ff", borderRadius: "8px", padding: "12px 14px", borderLeft: "3px solid #2d5fa6" }}>
              <div style={{ fontSize: "8px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "5px" }}>{k.label}</div>
              <div style={{ fontSize: "16px", fontWeight: 900, color: k.color, fontFamily: "monospace", lineHeight: 1 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Per-bank summary */}
        {bancos.length > 0 && (
          <div style={{ marginBottom: "22px", pageBreakInside: "avoid" }}>
            <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#2d5fa6", marginBottom: "8px", borderBottom: "1px solid #d0daf0", paddingBottom: "4px" }}>
              Resumo por Banco / Origem
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#2d5fa6" }}>
                  <th style={{ padding: "7px 10px", textAlign: "left",   color: "white", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Banco / Origem</th>
                  <th style={{ padding: "7px 10px", textAlign: "center", color: "white", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Aportes</th>
                  <th style={{ padding: "7px 10px", textAlign: "right",  color: "white", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Investido</th>
                  <th style={{ padding: "7px 10px", textAlign: "right",  color: "white", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px" }}>% do Total</th>
                </tr>
              </thead>
              <tbody>
                {bancos.map((b, idx) => {
                  const its = investimentos.filter(i => i.empresa === b);
                  const tot = its.reduce((s, i) => s + Number(i.valor), 0);
                  const pct = totalGeral > 0 ? (tot / totalGeral * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={b} style={{ background: idx % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700, borderBottom: "1px solid #e8edf8" }}>{b}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", color: "#555", borderBottom: "1px solid #e8edf8" }}>{its.length}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#2d5fa6", fontFamily: "monospace", borderBottom: "1px solid #e8edf8" }}>{formatBRL(tot)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#666", borderBottom: "1px solid #e8edf8" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f0f4ff" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 800, fontSize: "10px" }}>Total</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700 }}>{investimentos.length}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 900, color: "#2d5fa6", fontFamily: "monospace", fontSize: "12px" }}>{formatBRL(totalGeral)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Detail table */}
        <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#2d5fa6", marginBottom: "8px", borderBottom: "1px solid #d0daf0", paddingBottom: "4px" }}>
          Detalhamento de Aportes
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr style={{ background: "#2d5fa6" }}>
              {[
                { h: "Data",       align: "left"  },
                { h: "Descrição",  align: "left"  },
                { h: "Banco",      align: "left"  },
                { h: "Valor",      align: "right" },
                { h: "Categoria",  align: "left"  },
                { h: "Observação", align: "left"  },
              ].map(({ h, align }) => (
                <th key={h} style={{ padding: "7px 8px", textAlign: align as "left" | "right", color: "white", fontWeight: 700, fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {investimentos.map((inv, idx) => (
              <tr key={inv.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                <td style={{ padding: "7px 8px", color: "#444", borderBottom: "1px solid #e8edf8", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "10px" }}>{fmtData(inv.data)}</td>
                <td style={{ padding: "7px 8px", color: "#222", fontWeight: 600, borderBottom: "1px solid #e8edf8" }}>{inv.descricao}</td>
                <td style={{ padding: "7px 8px", color: "#333", borderBottom: "1px solid #e8edf8" }}>{inv.empresa}</td>
                <td style={{ padding: "7px 8px", color: "#2d5fa6", fontWeight: 700, textAlign: "right", borderBottom: "1px solid #e8edf8", whiteSpace: "nowrap", fontFamily: "monospace" }}>{formatBRL(Number(inv.valor))}</td>
                <td style={{ padding: "7px 8px", color: "#d97706", borderBottom: "1px solid #e8edf8" }}>{inv.categoria ?? "—"}</td>
                <td style={{ padding: "7px 8px", color: "#666", borderBottom: "1px solid #e8edf8" }}>{inv.observacoes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#f0f4ff", borderTop: "2px solid #2d5fa6" }}>
              <td colSpan={3} style={{ padding: "9px 8px", fontWeight: 800, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#2d5fa6" }}>
                Total Geral Investido
              </td>
              <td style={{ padding: "9px 8px", fontWeight: 900, color: "#2d5fa6", textAlign: "right", fontFamily: "monospace", fontSize: "13px" }}>
                {formatBRL(totalGeral)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>

        {/* Footer */}
        <div style={{ marginTop: "24px", paddingTop: "8px", borderTop: "2px solid #2d5fa6", display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#666", fontWeight: 600 }}>
          <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
          <div style={{ color: "#888", fontStyle: "italic" }}>Documento interno · não substitui NFe</div>
        </div>
      </div>
    </AppLayout>
  );
}
