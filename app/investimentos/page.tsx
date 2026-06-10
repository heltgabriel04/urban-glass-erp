"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { registrarLog } from "@/services/log.service";
import * as XLSX from "xlsx";

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
function labelMes(yyyyMM: string) {
  const [y, m] = yyyyMM.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

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
  const [filtroInicio, setFiltroInicio]   = useState("");  // YYYY-MM
  const [filtroFim, setFiltroFim]         = useState("");  // YYYY-MM
  const [opcoesDB, setOpcoesDB]           = useState<OpcaoLista[]>([]);
  const [semTabela, setSemTabela]         = useState(false);
  const [erroRLS, setErroRLS]             = useState(false);
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
    if (semTabela) {
      alert("A tabela inv_opcoes ainda não existe no banco de dados.\nExecute o SQL de migração exibido na página principal primeiro.");
      return;
    }
    const { error } = await supabase.from("inv_opcoes").insert([{ tipo, valor: valor.trim() }] as never);
    if (error) {
      if (error.message.includes("row-level security")) setErroRLS(true);
      else alert("Erro ao adicionar: " + error.message);
      return;
    }
    if (tipo === "banco") setNovoBanco(""); else setNovaCat("");
    load();
  }

  async function removeOpcao(id: number) {
    const { error } = await supabase.from("inv_opcoes").delete().eq("id", id);
    if (error) { alert("Erro ao remover: " + error.message); return; }
    load();
  }

  // ─── derived ──────────────────────────────────────────────────────────────

  const filtered = investimentos.filter(inv => {
    const q = busca.toLowerCase();
    if (q && !inv.empresa.toLowerCase().includes(q) && !inv.descricao.toLowerCase().includes(q)) return false;
    if (filtroBanco && inv.empresa !== filtroBanco) return false;
    if (filtroInicio && inv.data < filtroInicio + "-01") return false;
    if (filtroFim) {
      const [y, m] = filtroFim.split("-").map(Number);
      const ultimoDia = new Date(y, m, 0).getDate();
      if (inv.data > `${filtroFim}-${String(ultimoDia).padStart(2, "0")}`) return false;
    }
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
  const temFiltro     = !!(busca || filtroBanco || filtroInicio || filtroFim);

  // PDF-specific derived (uses filtered data)
  const mesesPDF      = [...new Set(filtered.map(i => i.data.substring(0, 7)))].sort(); // ascending = extrato order
  const bancosNoPDF   = [...new Set(filtered.map(i => i.empresa))].sort();
  const mediaPDF      = filtered.length ? totalFiltrado / filtered.length : 0;

  function labelPeriodoPDF() {
    if (filtroInicio && filtroFim) return `${labelMes(filtroInicio)} a ${labelMes(filtroFim)}`;
    if (filtroInicio) return `A partir de ${labelMes(filtroInicio)}`;
    if (filtroFim) return `Até ${labelMes(filtroFim)}`;
    return "Todos os períodos";
  }

  function handlePDF() {
    const orig = document.title;
    const banco = filtroBanco ? ` · ${filtroBanco}` : "";
    document.title = `Extrato de Investimentos - Urban Glass - ${new Date().toLocaleDateString("pt-BR")}${banco}`;
    window.print();
    setTimeout(() => { document.title = orig; }, 2000);
  }

  function handleExcel() {
    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [];

    // Cabeçalho do documento
    rows.push(["Urban Glass Comércio Ltda"]);
    rows.push(["CNPJ: 65.668.970/0001-05"]);
    rows.push(["Extrato de Investimentos"]);
    rows.push([labelPeriodoPDF() + (filtroBanco ? ` · ${filtroBanco}` : "")]);
    rows.push([`Gerado em ${new Date().toLocaleDateString("pt-BR")}`]);
    rows.push([]);

    // Resumo geral
    rows.push(["Total do Período", totalFiltrado]);
    rows.push(["Nº de Aportes", filtered.length]);
    rows.push(["Média por Aporte", mediaPDF]);
    rows.push([]);

    // Resumo por banco (apenas se mais de um)
    if (bancosNoPDF.length > 1) {
      rows.push(["RESUMO POR BANCO"]);
      rows.push(["Banco / Origem", "Aportes", "Total Investido", "% do Total"]);
      bancosNoPDF.forEach(b => {
        const its = filtered.filter(i => i.empresa === b);
        const tot = its.reduce((s, i) => s + Number(i.valor), 0);
        const pct = totalFiltrado > 0 ? `${(tot / totalFiltrado * 100).toFixed(1)}%` : "0.0%";
        rows.push([b, its.length, tot, pct]);
      });
      rows.push(["Total", filtered.length, totalFiltrado, "100%"]);
      rows.push([]);
    }

    // Detalhamento por mês
    rows.push(["DETALHAMENTO POR PERÍODO"]);

    mesesPDF.forEach(mes => {
      const itsMes = filtered
        .filter(i => i.data.startsWith(mes))
        .sort((a, b) => a.data.localeCompare(b.data));
      const totalMes = itsMes.reduce((s, i) => s + Number(i.valor), 0);

      rows.push([]);
      rows.push([labelMes(mes).toUpperCase()]);
      rows.push(["Data", "Descrição", "Banco", "Valor (R$)", "Categoria", "Observação"]);

      itsMes.forEach(inv => {
        rows.push([
          fmtData(inv.data),
          inv.descricao,
          inv.empresa,
          Number(inv.valor),
          inv.categoria ?? "",
          inv.observacoes ?? "",
        ]);
      });

      rows.push(["", "", `Subtotal ${labelMes(mes)}`, totalMes, "", ""]);
    });

    rows.push([]);
    rows.push(["", "", "TOTAL GERAL INVESTIDO", totalFiltrado, "", ""]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 13 }, // Data
      { wch: 36 }, // Descrição
      { wch: 22 }, // Banco
      { wch: 16 }, // Valor
      { wch: 22 }, // Categoria
      { wch: 32 }, // Observação
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Extrato");

    const bancoSlug = filtroBanco ? `_${filtroBanco.replace(/\s+/g, "_")}` : "";
    const periodoSlug = filtroInicio ? `_${filtroInicio}` : "";
    const fimSlug = filtroFim ? `_ate_${filtroFim}` : "";
    const dataHoje = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `Investimentos_UrbanGlass${bancoSlug}${periodoSlug}${fimSlug}_${dataHoje}.xlsx`);
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
          .pdf-mes-block { page-break-inside: avoid; }
        }
        input[type="month"].fc {
          color-scheme: dark;
        }
      `}</style>

      {/* Top bar */}
      <div className="tb no-print">
        <div className="tb-title">Investimentos</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={handlePDF} disabled={!filtered.length}>⬡ PDF</button>
          <button className="btn bg sm" onClick={handleExcel} disabled={!filtered.length}>↓ Excel</button>
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

        {/* Stats */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--t3)", whiteSpace: "nowrap" }}>De</span>
            <input type="month" lang="pt-BR" className="fc" style={{ minWidth: "140px", margin: 0 }}
              value={filtroInicio} onChange={e => setFiltroInicio(e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--t3)", whiteSpace: "nowrap" }}>Até</span>
            <input type="month" lang="pt-BR" className="fc" style={{ minWidth: "140px", margin: 0 }}
              value={filtroFim} onChange={e => setFiltroFim(e.target.value)} />
          </div>
          {temFiltro && (
            <button className="btn bg sm" onClick={() => { setBusca(""); setFiltroBanco(""); setFiltroInicio(""); setFiltroFim(""); }}>
              ✕ Limpar
            </button>
          )}
        </div>

        {temFiltro && filtered.length > 0 && (
          <div style={{ marginBottom: "14px", padding: "9px 14px", background: GB, border: `1px solid ${GBR}`, borderRadius: "8px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: G }}>
            <span>{filtered.length} resultado(s){filtroBanco ? ` · ${filtroBanco}` : ""}{(filtroInicio || filtroFim) ? ` · ${labelPeriodoPDF()}` : ""}</span>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={() => setModalListas(false)}>
          <div style={{ background: "var(--surf1)", border: "2px solid var(--b2)", borderRadius: "12px", padding: "28px 32px", width: "520px", maxWidth: "94vw", boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <span style={{ fontSize: "15px", fontWeight: 700 }}>Gerenciar Listas</span>
              <button className="btn bg sm" onClick={() => setModalListas(false)}>✕ Fechar</button>
            </div>

            {semTabela && (
              <div style={{ background: "rgba(245,158,11,.12)", border: "1px solid var(--warn)", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "var(--warn)" }}>
                ⚠ A tabela <code style={{ fontFamily: "'DM Mono',monospace" }}>inv_opcoes</code> não existe ainda. Execute o SQL de migração mostrado na página para habilitar listas personalizadas.
              </div>
            )}

            {erroRLS && (
              <div style={{ background: "rgba(245,158,11,.12)", border: "1px solid var(--warn)", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "var(--warn)" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>⚠ Row Level Security bloqueando gravação. Execute no Supabase SQL Editor:</div>
                <code style={{ display: "block", padding: "8px 10px", background: "rgba(0,0,0,.3)", borderRadius: "6px", fontFamily: "'DM Mono',monospace", fontSize: "11px", userSelect: "all" }}>
                  ALTER TABLE inv_opcoes DISABLE ROW LEVEL SECURITY;
                </code>
              </div>
            )}

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", paddingBottom: "14px", borderBottom: "3px solid #2d5fa6" }}>
          <div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" }}>urbanglass</div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: "2px" }}>Urban Glass Comércio Ltda</div>
            <div style={{ fontSize: "9px", color: "#555", marginTop: "1px" }}>CNPJ: 65.668.970/0001-05</div>
            <div style={{ fontSize: "9px", color: "#555" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "4px" }}>Extrato de</div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-0.5px", lineHeight: 1 }}>Investimentos</div>
            <div style={{ fontSize: "10px", color: "#555", marginTop: "6px", fontWeight: 600 }}>{labelPeriodoPDF()}</div>
            {filtroBanco && (
              <div style={{ fontSize: "10px", color: "#2d5fa6", marginTop: "3px", fontWeight: 700 }}>{filtroBanco}</div>
            )}
            <div style={{ fontSize: "9px", color: "#888", marginTop: "4px" }}>
              Gerado em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* KPI strip — filtered values */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Total do Período",   value: formatBRL(totalFiltrado),        color: "#2d5fa6" },
            { label: "Nº de Aportes",      value: String(filtered.length),         color: "#2d5fa6" },
            { label: "Média por Aporte",   value: formatBRL(mediaPDF),             color: "#444" },
            { label: "Bancos / Origens",   value: String(bancosNoPDF.length),      color: "#444" },
          ].map(k => (
            <div key={k.label} style={{ background: "#f0f4ff", borderRadius: "8px", padding: "12px 14px", borderLeft: "3px solid #2d5fa6" }}>
              <div style={{ fontSize: "8px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "5px" }}>{k.label}</div>
              <div style={{ fontSize: "16px", fontWeight: 900, color: k.color, fontFamily: "monospace", lineHeight: 1 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Per-bank summary — uses filtered data */}
        {bancosNoPDF.length > 1 && (
          <div style={{ marginBottom: "20px", pageBreakInside: "avoid" }}>
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
                {bancosNoPDF.map((b, idx) => {
                  const its = filtered.filter(i => i.empresa === b);
                  const tot = its.reduce((s, i) => s + Number(i.valor), 0);
                  const pct = totalFiltrado > 0 ? (tot / totalFiltrado * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={b} style={{ background: idx % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ padding: "7px 10px", fontWeight: 700, borderBottom: "1px solid #e8edf8" }}>{b}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: "#555", borderBottom: "1px solid #e8edf8" }}>{its.length}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#2d5fa6", fontFamily: "monospace", borderBottom: "1px solid #e8edf8" }}>{formatBRL(tot)}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", color: "#666", borderBottom: "1px solid #e8edf8" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f0f4ff" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 800, fontSize: "10px" }}>Total</td>
                  <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700 }}>{filtered.length}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 900, color: "#2d5fa6", fontFamily: "monospace", fontSize: "12px" }}>{formatBRL(totalFiltrado)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700 }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Detail table — grouped by month (extrato style) */}
        <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#2d5fa6", marginBottom: "10px", borderBottom: "1px solid #d0daf0", paddingBottom: "4px" }}>
          Detalhamento por Período
        </div>

        {mesesPDF.map(mes => {
          const itsMes = filtered.filter(i => i.data.startsWith(mes)).sort((a, b) => a.data.localeCompare(b.data));
          const totalMes = itsMes.reduce((s, i) => s + Number(i.valor), 0);
          return (
            <div key={mes} className="pdf-mes-block" style={{ marginBottom: "16px" }}>
              {/* Month header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#e8edf8", padding: "6px 10px", borderRadius: "4px 4px 0 0", borderLeft: "3px solid #2d5fa6", marginBottom: "0" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, color: "#2d5fa6", textTransform: "capitalize" }}>
                  {labelMes(mes)}
                </span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#2d5fa6", fontFamily: "monospace" }}>
                  {itsMes.length} aporte(s) · {formatBRL(totalMes)}
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <thead>
                  <tr style={{ background: "#2d5fa6" }}>
                    {[
                      { h: "Data",       align: "left",  w: "70px"  },
                      { h: "Descrição",  align: "left",  w: "auto"  },
                      { h: "Banco",      align: "left",  w: "110px" },
                      { h: "Valor",      align: "right", w: "90px"  },
                      { h: "Categoria",  align: "left",  w: "90px"  },
                      { h: "Observação", align: "left",  w: "100px" },
                    ].map(({ h, align, w }) => (
                      <th key={h} style={{ padding: "5px 8px", textAlign: align as "left" | "right", color: "white", fontWeight: 700, fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.5px", width: w }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itsMes.map((inv, idx) => (
                    <tr key={inv.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ padding: "6px 8px", color: "#444", borderBottom: "1px solid #e8edf8", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "10px" }}>{fmtData(inv.data)}</td>
                      <td style={{ padding: "6px 8px", color: "#222", fontWeight: 600, borderBottom: "1px solid #e8edf8" }}>{inv.descricao}</td>
                      <td style={{ padding: "6px 8px", color: "#333", borderBottom: "1px solid #e8edf8" }}>{inv.empresa}</td>
                      <td style={{ padding: "6px 8px", color: "#2d5fa6", fontWeight: 700, textAlign: "right", borderBottom: "1px solid #e8edf8", whiteSpace: "nowrap", fontFamily: "monospace" }}>{formatBRL(Number(inv.valor))}</td>
                      <td style={{ padding: "6px 8px", color: "#d97706", borderBottom: "1px solid #e8edf8" }}>{inv.categoria ?? "—"}</td>
                      <td style={{ padding: "6px 8px", color: "#666", borderBottom: "1px solid #e8edf8" }}>{inv.observacoes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f0f4ff" }}>
                    <td colSpan={3} style={{ padding: "6px 8px", fontWeight: 700, fontSize: "9px", color: "#2d5fa6", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                      Subtotal {labelMes(mes)}
                    </td>
                    <td style={{ padding: "6px 8px", fontWeight: 900, color: "#2d5fa6", textAlign: "right", fontFamily: "monospace", fontSize: "11px" }}>
                      {formatBRL(totalMes)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}

        {/* Grand total */}
        <div style={{ marginTop: "8px", padding: "10px 14px", background: "#2d5fa6", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, color: "white", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Total Geral Investido · {filtered.length} aporte(s)
          </span>
          <span style={{ fontSize: "15px", fontWeight: 900, color: "white", fontFamily: "monospace" }}>
            {formatBRL(totalFiltrado)}
          </span>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "20px", paddingTop: "8px", borderTop: "2px solid #2d5fa6", display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#666", fontWeight: 600 }}>
          <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
          <div style={{ color: "#888", fontStyle: "italic" }}>Documento interno · não substitui NFe</div>
        </div>
      </div>
    </AppLayout>
  );
}
