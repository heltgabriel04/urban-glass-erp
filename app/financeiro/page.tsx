"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  getFinanceiroClientes, getContasAPagar, criarContaPagar, pagarConta,
  deletarLancamento, updateLancamento, getLancamentos, createLancamento,
} from "@/services/financeiro.service";
import { getPedidos, registrarRecebimento } from "@/services/pedidos.service";
import { formatBRL, formatDate, diffDias } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import type { FinanceiroCliente, Pedido, Lancamento } from "@/types";

type Aba     = "fluxo" | "receber" | "pagar";
type Periodo = "7d" | "30d" | "mes";
type AddingIn = "fluxo-entrada" | "fluxo-saida" | "pagar" | null;

const CATEGORIAS = ["Fornecedor","Aluguel","Energia","Água","Internet","Salário","Imposto","Manutenção","Transporte","Material","Outros"];

function hoje() { return new Date().toISOString().split("T")[0]; }
function addDias(date: string, dias: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().split("T")[0];
}
function inicioMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function fimMes(): string {
  const d = new Date();
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return fim.toISOString().split("T")[0];
}

const EMPTY_EDIT = {
  descricao: "", valor: 0, vencimento: "", categoria: "",
  fornecedor: "", obs: "", status: "", dt_pagamento: "",
};
const EMPTY_NEW = {
  descricao: "", valor: 0, vencimento: hoje(),
  categoria: "", fornecedor: "", obs: "",
};

export default function FinanceiroPage() {
  const { toast } = useToast();
  const [aba, setAba]                 = useState<Aba>("fluxo");
  const [financeiro, setFinanceiro]   = useState<FinanceiroCliente[]>([]);
  const [pedidos, setPedidos]         = useState<Pedido[]>([]);
  const [contasPagar, setContasPagar] = useState<Lancamento[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading]         = useState(true);
  const [periodo, setPeriodo]         = useState<Periodo>("mes");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm]   = useState({ ...EMPTY_EDIT });

  const [addingIn, setAddingIn] = useState<AddingIn>(null);
  const [newForm, setNewForm]   = useState({ ...EMPTY_NEW });
  const [salvandoAdd, setSalvandoAdd] = useState(false);

  const [modalReceber, setModalReceber]   = useState(false);
  const [clienteSel, setClienteSel]       = useState<FinanceiroCliente | null>(null);
  const [pedidoSel, setPedidoSel]         = useState<Pedido | null>(null);
  const [valorRec, setValorRec]           = useState(0);
  const [salvando, setSalvando]           = useState(false);
  const [erroRec, setErroRec]             = useState("");

  const [modalPgto, setModalPgto]                   = useState(false);
  const [contaParaPagar, setContaParaPagar]           = useState<Lancamento | null>(null);
  const [dtPgto, setDtPgto]                           = useState(hoje());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, peds, pagar, lancs] = await Promise.all([
      getFinanceiroClientes(), getPedidos(), getContasAPagar(), getLancamentos(),
    ]);
    setFinanceiro(fin);
    setPedidos(peds);
    setContasPagar(pagar);
    setLancamentos(lancs);
    setLoading(false);
  }

  const { dataInicio, dataFim } = useMemo(() => {
    const hj = hoje();
    if (periodo === "7d")  return { dataInicio: hj, dataFim: addDias(hj, 7) };
    if (periodo === "30d") return { dataInicio: hj, dataFim: addDias(hj, 30) };
    return { dataInicio: inicioMes(), dataFim: fimMes() };
  }, [periodo]);

  const todosMovimentos = useMemo(() => {
    const seen = new Set<number>();
    const all: Lancamento[] = [];
    for (const l of lancamentos) { seen.add(l.id); all.push(l); }
    for (const c of contasPagar)  { if (!seen.has(c.id)) all.push(c); }
    return all
      .filter(m => m.vencimento && m.vencimento >= dataInicio && m.vencimento <= dataFim)
      .sort((a, b) => (a.vencimento ?? "") > (b.vencimento ?? "") ? 1 : -1);
  }, [lancamentos, contasPagar, dataInicio, dataFim]);

  const sidebar = useMemo(() => {
    const hj = hoje();
    const entradas  = todosMovimentos.filter(m => m.tipo === "Entrada");
    const saidas    = todosMovimentos.filter(m => m.tipo === "Saída");
    const atrasRec  = lancamentos.filter(l => l.tipo === "Entrada" && l.status !== "Pago" && l.vencimento && l.vencimento < hj);
    const atrasSpay = contasPagar.filter(c => c.status !== "Pago" && c.vencimento && c.vencimento < hj);
    const pendEnt   = entradas.filter(m => m.status !== "Pago").reduce((a, m) => a + Number(m.valor), 0);
    const pendSaid  = saidas.filter(m => m.status !== "Pago").reduce((a, m) => a + Number(m.valor), 0);
    return {
      totalEntradas:  entradas.reduce((a, m) => a + Number(m.valor), 0),
      totalSaidas:    saidas.reduce((a, m)   => a + Number(m.valor), 0),
      saldoPrevisto:  pendEnt - pendSaid,
      atrasRec,
      atrasSpay,
      totalAtrasRec:  atrasRec.reduce((a, l)  => a + Number(l.valor), 0),
      totalAtrasSpay: atrasSpay.reduce((a, c) => a + Number(c.valor), 0),
    };
  }, [todosMovimentos, lancamentos, contasPagar]);

  const recebiveisIndividuais = useMemo(() =>
    lancamentos
      .filter(l => l.tipo === "Entrada")
      .sort((a, b) => {
        if (a.status !== "Pago" && b.status === "Pago") return -1;
        if (a.status === "Pago" && b.status !== "Pago") return 1;
        return (a.vencimento ?? "") > (b.vencimento ?? "") ? 1 : -1;
      }),
    [lancamentos]
  );

  const pgarOrdenado = useMemo(() =>
    [...contasPagar].sort((a, b) => {
      if (a.status !== "Pago" && b.status === "Pago") return -1;
      if (a.status === "Pago" && b.status !== "Pago") return 1;
      return (a.vencimento ?? "") > (b.vencimento ?? "") ? 1 : -1;
    }),
    [contasPagar]
  );

  const tot      = financeiro.reduce((a, f) => ({ fat: a.fat + Number(f.faturado), rec: a.rec + Number(f.recebido) }), { fat: 0, rec: 0 });
  const aReceber = tot.fat - tot.rec;
  const totalPagar = contasPagar.filter(c => c.status !== "Pago").reduce((a, c) => a + Number(c.valor), 0);
  const vencidas   = contasPagar.filter(c => c.status !== "Pago" && c.vencimento && c.vencimento < hoje());

  const hj = hoje();

  function startEdit(row: Lancamento) {
    if (editingId === row.id) { setEditingId(null); return; }
    setAddingIn(null);
    setEditingId(row.id);
    setEditForm({
      descricao:    row.descricao,
      valor:        row.valor,
      vencimento:   row.vencimento ?? "",
      categoria:    (row as any).categoria ?? "",
      fornecedor:   (row as any).fornecedor ?? "",
      obs:          (row as any).obs ?? "",
      status:       row.status,
      dt_pagamento: (row as any).dt_pagamento ?? "",
    });
  }

  function cancelEdit() { setEditingId(null); }

  async function saveEdit() {
    if (!editingId) return;
    await updateLancamento(editingId, {
      descricao:    editForm.descricao,
      valor:        editForm.valor,
      vencimento:   editForm.vencimento || null,
      status:       editForm.status as any,
      categoria:    editForm.categoria  || null,
      fornecedor:   editForm.fornecedor || null,
      obs:          editForm.obs        || null,
      dt_pagamento: editForm.dt_pagamento || null,
    } as any);
    toast("✓ Salvo");
    setEditingId(null);
    load();
  }

  function startAdd(where: AddingIn) {
    setAddingIn(where);
    setEditingId(null);
    setNewForm({ ...EMPTY_NEW, vencimento: hoje() });
  }

  function cancelAdd() { setAddingIn(null); }

  async function saveAdd() {
    if (!newForm.descricao.trim() || newForm.valor <= 0 || !newForm.vencimento) {
      toast("Preencha descrição, valor e data", "warn"); return;
    }
    setSalvandoAdd(true);
    if (addingIn === "fluxo-entrada") {
      await createLancamento({
        tipo: "Entrada", descricao: newForm.descricao, valor: newForm.valor,
        status: "A Receber", vencimento: newForm.vencimento,
        pedido_id: null, cliente_id: null,
        ...(newForm.categoria ? { categoria: newForm.categoria } : {}),
      } as any);
    } else {
      await criarContaPagar({
        descricao:  newForm.descricao,
        fornecedor: newForm.fornecedor,
        categoria:  newForm.categoria,
        valor:      newForm.valor,
        vencimento: newForm.vencimento,
        obs:        newForm.obs,
        status:     "Pendente",
      });
    }
    toast("✓ Lançamento criado");
    setSalvandoAdd(false);
    setAddingIn(null);
    load();
  }

  async function handleDelete(row: Lancamento) {
    if (!confirm(`Excluir "${row.descricao}"?`)) return;
    await deletarLancamento(row.id);
    toast("Removido");
    if (editingId === row.id) setEditingId(null);
    load();
  }

  function abrirReceber(f?: FinanceiroCliente, preselPedidoId?: string) {
    setClienteSel(f ?? null);
    setPedidoSel(preselPedidoId ? pedidos.find(p => p.id === preselPedidoId) ?? null : null);
    setValorRec(0); setErroRec(""); setModalReceber(true);
  }

  async function salvarRecebimento() {
    if (!pedidoSel) { setErroRec("Selecione um pedido."); return; }
    if (!valorRec || valorRec <= 0) { setErroRec("Informe um valor válido."); return; }
    setSalvando(true);
    const result = await registrarRecebimento(pedidoSel.id, valorRec);
    setSalvando(false);
    if (!result) { toast("Erro ao registrar recebimento", "err"); return; }
    const { excedente } = result as any;
    if (excedente > 0.005) {
      toast(`✓ Pedido ${pedidoSel.id} quitado! ${formatBRL(excedente)} viraram crédito.`);
    } else {
      toast(`✓ ${formatBRL(valorRec)} recebido`);
    }
    setModalReceber(false); load();
  }

  function abrirPgto(c: Lancamento) {
    setContaParaPagar(c); setDtPgto(hj); setModalPgto(true);
  }

  async function confirmarPagamento() {
    if (!contaParaPagar) return;
    setSalvando(true);
    await pagarConta(contaParaPagar.id, dtPgto);
    toast(`✓ "${contaParaPagar.descricao}" paga`);
    setSalvando(false); setModalPgto(false); setContaParaPagar(null); load();
  }

  function chipStatus(row: Lancamento) {
    if (row.status === "Pago") return <span className="chip cg">Pago</span>;
    if (row.vencimento && row.vencimento < hj) return <span className="chip cr">Vencido</span>;
    if (row.status === "A Receber") return <span className="chip cy">A Receber</span>;
    return <span className="chip cy">Pendente</span>;
  }

  const periodoLabel: Record<Periodo, string> = { "7d":"7 dias", "30d":"30 dias", "mes":"Este mês" };

  const cellInput: React.CSSProperties = {
    width: "100%", minWidth: 0, fontSize: "12px", padding: "4px 6px",
    background: "var(--surf1)", border: "1px solid var(--acc)", borderRadius: "4px",
    color: "var(--t1)", fontFamily: "inherit", boxSizing: "border-box",
  };
  const cellSelect: React.CSSProperties = { ...cellInput, cursor: "pointer" };

  const editActions = (
    <div style={{ display: "flex", gap: "3px" }}>
      <button className="btn bp xs" onClick={saveEdit}>✓</button>
      <button className="btn bg xs" onClick={cancelEdit}>✕</button>
    </div>
  );

  const pendentesReceber = recebiveisIndividuais.filter(l => l.status !== "Pago");
  const totalReceber     = pendentesReceber.reduce((a, l) => a + Number(l.valor), 0);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Gestão de Contas</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {aba === "fluxo" && <>
            <button
              style={{ border: "1px solid var(--ok)", color: "var(--ok)", background: "transparent", fontSize: "12px", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              onClick={() => startAdd("fluxo-entrada")}
            >↑ + Entrada</button>
            <button
              style={{ border: "1px solid var(--err)", color: "var(--err)", background: "transparent", fontSize: "12px", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              onClick={() => startAdd("fluxo-saida")}
            >↓ + Saída</button>
          </>}
          {aba === "receber" && (
            <button className="btn bp sm" onClick={() => abrirReceber()}>✓ Registrar Recebimento</button>
          )}
          {aba === "pagar" && (
            <button className="btn bp sm" onClick={() => startAdd("pagar")}>+ Nova Conta</button>
          )}
        </div>
      </div>

      <div className="con">

        {/* ── Cards resumo ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Faturado",       value: tot.fat,              color: "var(--acc)",  sub: "Total pedidos" },
            { label: "A Receber",      value: aReceber,             color: "var(--warn)", sub: "Em aberto" },
            { label: "A Pagar",        value: totalPagar,           color: "var(--err)",  sub: `${vencidas.length} vencida(s)` },
            { label: "Saldo Previsto", value: sidebar.saldoPrevisto, color: sidebar.saldoPrevisto >= 0 ? "var(--ok)" : "var(--err)", sub: `Próx. ${periodoLabel[periodo]}` },
          ].map(c => (
            <div key={c.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: c.color, fontFamily: "'DM Mono',monospace", lineHeight: 1.2 }}>{formatBRL(c.value)}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Abas ── */}
        <div style={{ display: "flex", gap: "2px", marginBottom: "20px", borderBottom: "1px solid var(--b1)" }}>
          {([["fluxo","Fluxo de Caixa"],["receber","Contas a Receber"],["pagar","Contas a Pagar"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setAba(key)} style={{
              padding: "10px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${aba === key ? "var(--acc)" : "transparent"}`,
              color: aba === key ? "var(--acc)" : "var(--t3)", transition: "all .15s",
            }}>{label}</button>
          ))}
        </div>

        {loading ? <div className="loading">Carregando...</div> : (<>

          {/* ══════════════════════════════════════════════════════
              FLUXO DE CAIXA
          ══════════════════════════════════════════════════════ */}
          {aba === "fluxo" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 250px", gap: "16px", alignItems: "start" }}>

              {/* Tabela de movimentos */}
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "95px" }}>Data</th>
                      <th style={{ width: "44px", textAlign: "center" }}>Tipo</th>
                      <th>Descrição</th>
                      <th style={{ width: "110px" }}>Categoria</th>
                      <th style={{ width: "115px", textAlign: "right" }}>Valor</th>
                      <th style={{ width: "90px" }}>Status</th>
                      <th style={{ width: "72px" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>

                    {/* Nova linha */}
                    {(addingIn === "fluxo-entrada" || addingIn === "fluxo-saida") && (
                      <tr style={{ background: addingIn === "fluxo-entrada" ? "rgba(61,255,160,.06)" : "rgba(244,63,94,.04)", outline: "1px solid var(--acc)" }}>
                        <td><DateInput value={newForm.vencimento} onChange={v => setNewForm(f => ({ ...f, vencimento: v }))} /></td>
                        <td style={{ textAlign: "center", fontWeight: 800, fontSize: "15px", color: addingIn === "fluxo-entrada" ? "var(--ok)" : "var(--err)" }}>
                          {addingIn === "fluxo-entrada" ? "↑" : "↓"}
                        </td>
                        <td>
                          <input
                            style={cellInput}
                            value={newForm.descricao}
                            onChange={e => setNewForm(f => ({ ...f, descricao: e.target.value }))}
                            placeholder="Descrição..."
                            autoFocus
                            onKeyDown={e => e.key === "Enter" && saveAdd()}
                          />
                        </td>
                        <td>
                          <select style={cellSelect} value={newForm.categoria} onChange={e => setNewForm(f => ({ ...f, categoria: e.target.value }))}>
                            <option value="">—</option>
                            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td><CurrencyInput value={newForm.valor} onChange={v => setNewForm(f => ({ ...f, valor: v }))} /></td>
                        <td></td>
                        <td>
                          <div style={{ display: "flex", gap: "3px" }}>
                            <button className="btn bp xs" onClick={saveAdd} disabled={salvandoAdd}>✓</button>
                            <button className="btn bg xs" onClick={cancelAdd}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {todosMovimentos.length === 0 && !addingIn && (
                      <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                        Nenhum lançamento no período. Use os botões "+ Entrada" ou "+ Saída" para adicionar.
                      </td></tr>
                    )}

                    {todosMovimentos.map(m => editingId === m.id ? (
                      <tr key={m.id} style={{ background: "var(--surf2)", outline: "1px solid var(--acc)" }}>
                        <td><DateInput value={editForm.vencimento} onChange={v => setEditForm(f => ({ ...f, vencimento: v }))} /></td>
                        <td style={{ textAlign: "center", fontWeight: 800, fontSize: "15px", color: m.tipo === "Entrada" ? "var(--ok)" : "var(--err)" }}>
                          {m.tipo === "Entrada" ? "↑" : "↓"}
                        </td>
                        <td><input style={cellInput} value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} onKeyDown={e => e.key === "Enter" && saveEdit()} /></td>
                        <td>
                          <select style={cellSelect} value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))}>
                            <option value="">—</option>
                            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td><CurrencyInput value={editForm.valor} onChange={v => setEditForm(f => ({ ...f, valor: v }))} /></td>
                        <td>
                          <select style={{ ...cellSelect, fontSize: "10px" }} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                            <option value="A Receber">A Receber</option>
                            <option value="Pago">Pago</option>
                            <option value="Pendente">Pendente</option>
                          </select>
                        </td>
                        <td>{editActions}</td>
                      </tr>
                    ) : (
                      <tr key={m.id} onClick={() => startEdit(m)} style={{ cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                      >
                        <td className="mono" style={{ fontSize: "12px" }}>{formatDate(m.vencimento)}</td>
                        <td style={{ textAlign: "center", fontWeight: 800, fontSize: "15px", color: m.tipo === "Entrada" ? "var(--ok)" : "var(--err)" }}>
                          {m.tipo === "Entrada" ? "↑" : "↓"}
                        </td>
                        <td>
                          <div style={{ fontSize: "13px", fontWeight: 500 }}>{m.descricao}</div>
                          {m.clientes?.nome && <div className="tdim">{m.clientes.nome}</div>}
                        </td>
                        <td>
                          {(m as any).categoria
                            ? <span className="chip cgr" style={{ fontSize: "10px" }}>{(m as any).categoria}</span>
                            : <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>
                        <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: m.tipo === "Entrada" ? "var(--ok)" : "var(--err)" }}>
                          {formatBRL(m.valor)}
                        </td>
                        <td>{chipStatus(m)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: "3px" }}>
                            {m.tipo === "Saída" && m.status !== "Pago" && (
                              <button className="btn bp xs" title="Confirmar pagamento" onClick={() => abrirPgto(m)}>✓</button>
                            )}
                            <button
                              className="btn bg xs"
                              style={{ color: "var(--err)", borderColor: "rgba(244,63,94,.3)" }}
                              onClick={() => handleDelete(m)}
                            >🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sidebar */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                {/* Período */}
                <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>Período</div>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {(["7d","30d","mes"] as Periodo[]).map(p => (
                      <button key={p} onClick={() => setPeriodo(p)} style={{
                        padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 600,
                        cursor: "pointer", border: `1px solid ${periodo === p ? "var(--acc)" : "var(--b2)"}`,
                        background: periodo === p ? "rgba(61,255,160,.12)" : "transparent",
                        color: periodo === p ? "var(--acc)" : "var(--t3)", transition: "all .1s",
                      }}>{periodoLabel[p]}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", marginTop: "8px" }}>
                    {new Date(dataInicio + "T12:00:00").toLocaleDateString("pt-BR")} → {new Date(dataFim + "T12:00:00").toLocaleDateString("pt-BR")}
                  </div>
                </div>

                {/* Saldo */}
                <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>Saldo Previsto</div>
                  <div style={{ fontSize: "26px", fontWeight: 800, color: sidebar.saldoPrevisto >= 0 ? "var(--ok)" : "var(--err)", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
                    {sidebar.saldoPrevisto >= 0 ? "+" : ""}{formatBRL(sidebar.saldoPrevisto)}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "4px" }}>Entradas − Saídas pendentes</div>
                  <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--b1)", display: "flex", flexDirection: "column", gap: "7px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: "var(--t3)", display: "flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ width: "8px", height: "8px", background: "var(--ok)", borderRadius: "50%", display: "inline-block" }} />Entradas
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ok)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(sidebar.totalEntradas)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: "var(--t3)", display: "flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ width: "8px", height: "8px", background: "var(--err)", borderRadius: "50%", display: "inline-block" }} />Saídas
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--err)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(sidebar.totalSaidas)}</span>
                    </div>
                  </div>
                </div>

                {sidebar.atrasRec.length > 0 && (
                  <div style={{ padding: "12px 14px", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)", borderRadius: "10px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--warn)", marginBottom: "4px" }}>⏰ Recebimentos atrasados</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--warn)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(sidebar.totalAtrasRec)}</div>
                    <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>{sidebar.atrasRec.length} lançamento(s)</div>
                  </div>
                )}
                {sidebar.atrasSpay.length > 0 && (
                  <div style={{ padding: "12px 14px", background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.3)", borderRadius: "10px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--err)", marginBottom: "4px" }}>⚠ Contas vencidas</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--err)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(sidebar.totalAtrasSpay)}</div>
                    <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>{sidebar.atrasSpay.length} conta(s)</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              CONTAS A RECEBER
          ══════════════════════════════════════════════════════ */}
          {aba === "receber" && (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "100px" }}>Vencimento</th>
                    <th>Descrição</th>
                    <th style={{ width: "100px" }}>Pedido</th>
                    <th style={{ width: "150px" }}>Cliente</th>
                    <th style={{ width: "120px", textAlign: "right" }}>Valor</th>
                    <th style={{ width: "100px" }}>Status</th>
                    <th style={{ width: "120px" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {recebiveisIndividuais.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>Nenhum recebível cadastrado</td></tr>
                  )}
                  {recebiveisIndividuais.map(l => editingId === l.id ? (
                    <tr key={l.id} style={{ background: "var(--surf2)", outline: "1px solid var(--acc)" }}>
                      <td><DateInput value={editForm.vencimento} onChange={v => setEditForm(f => ({ ...f, vencimento: v }))} /></td>
                      <td><input style={cellInput} value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} onKeyDown={e => e.key === "Enter" && saveEdit()} /></td>
                      <td><span style={{ fontSize: "11px", color: "var(--t3)" }}>{(l as any).pedido_id ?? "—"}</span></td>
                      <td><span style={{ fontSize: "11px", color: "var(--t3)" }}>{l.clientes?.nome ?? "—"}</span></td>
                      <td><CurrencyInput value={editForm.valor} onChange={v => setEditForm(f => ({ ...f, valor: v }))} /></td>
                      <td>
                        <select style={{ ...cellSelect, fontSize: "11px" }} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                          <option value="A Receber">A Receber</option>
                          <option value="Pago">Pago</option>
                        </select>
                      </td>
                      <td>{editActions}</td>
                    </tr>
                  ) : (
                    <tr key={l.id} onClick={() => startEdit(l)} style={{ cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                    >
                      <td className="mono" style={{ fontSize: "12px", color: l.vencimento && l.vencimento < hj && l.status !== "Pago" ? "var(--err)" : "var(--t2)" }}>
                        {formatDate(l.vencimento)}
                      </td>
                      <td style={{ fontSize: "13px", fontWeight: 500 }}>{l.descricao}</td>
                      <td>
                        {(l as any).pedido_id
                          ? <a href={`/pedidos/${(l as any).pedido_id}`} onClick={e => e.stopPropagation()} className="mono" style={{ color: "var(--acc2)", fontSize: "12px" }}>{(l as any).pedido_id}</a>
                          : <span style={{ color: "var(--t3)" }}>—</span>}
                      </td>
                      <td style={{ fontSize: "12px" }}>{l.clientes?.nome ?? <span style={{ color: "var(--t3)" }}>—</span>}</td>
                      <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: "var(--ok)" }}>{formatBRL(l.valor)}</td>
                      <td>{chipStatus(l)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "3px" }}>
                          {l.status !== "Pago" && (
                            <button className="btn bp xs" onClick={() => abrirReceber(undefined, (l as any).pedido_id)}>✓ Receber</button>
                          )}
                          <button
                            className="btn bg xs"
                            style={{ color: "var(--err)", borderColor: "rgba(244,63,94,.3)" }}
                            onClick={() => handleDelete(l)}
                          >🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--surf1)" }}>
                    <td colSpan={4} style={{ padding: "10px 12px", fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>
                      {recebiveisIndividuais.length} lançamentos · {pendentesReceber.length} em aberto
                    </td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--ok)", fontWeight: 700, padding: "10px 12px" }}>
                      {formatBRL(totalReceber)}
                    </td>
                    <td colSpan={2} style={{ fontSize: "11px", color: "var(--t3)", padding: "10px 12px" }}>a receber</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              CONTAS A PAGAR
          ══════════════════════════════════════════════════════ */}
          {aba === "pagar" && (<>
            {vencidas.length > 0 && (
              <div style={{ marginBottom: "14px", padding: "12px 16px", background: "rgba(244,63,94,.08)", border: "1px solid var(--err)", borderRadius: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "18px" }}>⚠</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--err)" }}>{vencidas.length} conta(s) vencida(s)</div>
                  <div style={{ fontSize: "12px", color: "var(--t3)" }}>Total: {formatBRL(vencidas.reduce((a, c) => a + Number(c.valor), 0))}</div>
                </div>
              </div>
            )}
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "100px" }}>Vencimento</th>
                    <th>Descrição</th>
                    <th style={{ width: "130px" }}>Fornecedor</th>
                    <th style={{ width: "110px" }}>Categoria</th>
                    <th style={{ width: "115px", textAlign: "right" }}>Valor</th>
                    <th style={{ width: "90px" }}>Status</th>
                    <th style={{ width: "100px" }}>Dt. Pgto</th>
                    <th style={{ width: "100px" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>

                  {/* Nova linha */}
                  {addingIn === "pagar" && (
                    <tr style={{ background: "rgba(244,63,94,.04)", outline: "1px solid rgba(244,63,94,.4)" }}>
                      <td><DateInput value={newForm.vencimento} onChange={v => setNewForm(f => ({ ...f, vencimento: v }))} /></td>
                      <td>
                        <input style={cellInput} value={newForm.descricao} onChange={e => setNewForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição..." autoFocus onKeyDown={e => e.key === "Enter" && saveAdd()} />
                        <input style={{ ...cellInput, marginTop: "2px", fontSize: "11px" }} value={newForm.obs} onChange={e => setNewForm(f => ({ ...f, obs: e.target.value }))} placeholder="Obs..." />
                      </td>
                      <td><input style={cellInput} value={newForm.fornecedor} onChange={e => setNewForm(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Fornecedor" /></td>
                      <td>
                        <select style={cellSelect} value={newForm.categoria} onChange={e => setNewForm(f => ({ ...f, categoria: e.target.value }))}>
                          <option value="">—</option>
                          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td><CurrencyInput value={newForm.valor} onChange={v => setNewForm(f => ({ ...f, valor: v }))} /></td>
                      <td></td>
                      <td></td>
                      <td>
                        <div style={{ display: "flex", gap: "3px" }}>
                          <button className="btn bp xs" onClick={saveAdd} disabled={salvandoAdd}>✓</button>
                          <button className="btn bg xs" onClick={cancelAdd}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {pgarOrdenado.length === 0 && !addingIn && (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhuma conta a pagar. Clique em "+ Nova Conta" para adicionar.
                    </td></tr>
                  )}

                  {pgarOrdenado.map(c => editingId === c.id ? (
                    <tr key={c.id} style={{ background: "var(--surf2)", outline: "1px solid var(--acc)" }}>
                      <td><DateInput value={editForm.vencimento} onChange={v => setEditForm(f => ({ ...f, vencimento: v }))} /></td>
                      <td>
                        <input style={cellInput} value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} onKeyDown={e => e.key === "Enter" && saveEdit()} />
                        <input style={{ ...cellInput, marginTop: "2px", fontSize: "11px" }} value={editForm.obs} onChange={e => setEditForm(f => ({ ...f, obs: e.target.value }))} placeholder="Obs..." />
                      </td>
                      <td><input style={cellInput} value={editForm.fornecedor} onChange={e => setEditForm(f => ({ ...f, fornecedor: e.target.value }))} /></td>
                      <td>
                        <select style={cellSelect} value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))}>
                          <option value="">—</option>
                          {CATEGORIAS.map(cat => <option key={cat}>{cat}</option>)}
                        </select>
                      </td>
                      <td><CurrencyInput value={editForm.valor} onChange={v => setEditForm(f => ({ ...f, valor: v }))} /></td>
                      <td>
                        <select style={{ ...cellSelect, fontSize: "11px" }} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                          <option value="Pendente">Pendente</option>
                          <option value="Pago">Pago</option>
                        </select>
                      </td>
                      <td><DateInput value={editForm.dt_pagamento} onChange={v => setEditForm(f => ({ ...f, dt_pagamento: v }))} /></td>
                      <td>{editActions}</td>
                    </tr>
                  ) : (
                    <tr key={c.id} onClick={() => startEdit(c)} style={{ cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                    >
                      <td className="mono" style={{ fontSize: "12px", color: c.vencimento && c.vencimento < hj && c.status !== "Pago" ? "var(--err)" : "var(--t2)" }}>
                        {formatDate(c.vencimento)}
                      </td>
                      <td>
                        <div style={{ fontSize: "13px", fontWeight: 500 }}>{c.descricao}</div>
                        {(c as any).obs && <div className="tdim">{(c as any).obs}</div>}
                      </td>
                      <td style={{ fontSize: "12px" }}>{(c as any).fornecedor || <span style={{ color: "var(--t3)" }}>—</span>}</td>
                      <td>
                        {(c as any).categoria
                          ? <span className="chip cgr" style={{ fontSize: "10px" }}>{(c as any).categoria}</span>
                          : <span style={{ color: "var(--t3)" }}>—</span>}
                      </td>
                      <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: "var(--err)" }}>{formatBRL(c.valor)}</td>
                      <td>{chipStatus(c)}</td>
                      <td className="mono" style={{ fontSize: "12px", color: "var(--t3)" }}>
                        {(c as any).dt_pagamento ? formatDate((c as any).dt_pagamento) : "—"}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "3px" }}>
                          {c.status !== "Pago" && (
                            <button className="btn bp xs" onClick={() => abrirPgto(c)}>✓ Pagar</button>
                          )}
                          <button
                            className="btn bg xs"
                            style={{ color: "var(--err)", borderColor: "rgba(244,63,94,.3)" }}
                            onClick={() => handleDelete(c)}
                          >🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--surf1)" }}>
                    <td colSpan={4} style={{ padding: "10px 12px", fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>
                      {pgarOrdenado.length} contas · {vencidas.length} vencida(s)
                    </td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--err)", fontWeight: 700, padding: "10px 12px" }}>
                      {formatBRL(totalPagar)}
                    </td>
                    <td colSpan={3} style={{ fontSize: "11px", color: "var(--t3)", padding: "10px 12px" }}>pendente</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>)}

        </>)}
      </div>

      {/* ── Modal Registrar Recebimento ── */}
      {modalReceber && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalReceber(false)}>
          <div className="mod" style={{ width: "480px" }}>
            <div className="mhd">
              <div className="mtit">Registrar Recebimento</div>
              <button className="mcl" onClick={() => setModalReceber(false)}>✕</button>
            </div>
            {clienteSel && (
              <div style={{ marginBottom: "14px" }}>
                <strong>{clienteSel.cliente_nome}</strong>
                <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>Em aberto: <strong>{formatBRL(clienteSel.a_receber)}</strong></div>
              </div>
            )}
            <div className="fg" style={{ marginBottom: "14px" }}>
              <label className="fl">Pedido *</label>
              <select className="fc" value={pedidoSel?.id ?? ""} onChange={e => {
                const p = pedidos.find(x => x.id === e.target.value) ?? null;
                setPedidoSel(p); setValorRec(0); setErroRec("");
              }}>
                <option value="">Selecione um pedido...</option>
                {(clienteSel
                  ? pedidos.filter(p => p.cliente_id === clienteSel.cliente_id && Number(p.valor_total) - Number(p.valor_recebido) > 0)
                  : pedidos.filter(p => Number(p.valor_total) - Number(p.valor_recebido) > 0)
                ).map(p => {
                  const saldo = Number(p.valor_total) - Number(p.valor_recebido);
                  return <option key={p.id} value={p.id}>{p.id} — {p.clientes?.nome ?? "?"} — {formatBRL(saldo)} em aberto</option>;
                })}
              </select>
            </div>
            {pedidoSel && (
              <div style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "12px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "5px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", color: "var(--t3)" }}>Total</span><span className="mono">{formatBRL(pedidoSel.valor_total)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", color: "var(--t3)" }}>Recebido</span><span className="mono" style={{ color: "var(--ok)" }}>{formatBRL(pedidoSel.valor_recebido)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", color: "var(--t3)" }}>Saldo</span><span className="mono" style={{ color: "var(--warn)", fontWeight: 700 }}>{formatBRL(Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido))}</span></div>
              </div>
            )}
            <div className="fg" style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label className="fl">Valor *</label>
                {pedidoSel && (
                  <button className="btn bg xs" style={{ fontSize: "10px" }} onClick={() => setValorRec(Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido))}>
                    Preencher total
                  </button>
                )}
              </div>
              <CurrencyInput value={valorRec} onChange={v => { setValorRec(v); setErroRec(""); }} placeholder="R$ 0,00" disabled={!pedidoSel} />
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>Excedente vira crédito do cliente</div>
            </div>
            {erroRec && <div className="al al-e" style={{ marginBottom: "12px" }}>{erroRec}</div>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setModalReceber(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarRecebimento} disabled={salvando || valorRec <= 0 || !pedidoSel}>
                {salvando ? "Salvando..." : "✓ Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmar Pagamento ── */}
      {modalPgto && contaParaPagar && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalPgto(false)}>
          <div className="mod" style={{ width: "380px" }}>
            <div className="mhd">
              <div className="mtit">Confirmar Pagamento</div>
              <button className="mcl" onClick={() => setModalPgto(false)}>✕</button>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--t1)", marginBottom: "4px" }}>{contaParaPagar.descricao}</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--err)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(contaParaPagar.valor)}</div>
            </div>
            <div className="fg" style={{ marginBottom: "16px" }}>
              <label className="fl">Data do Pagamento</label>
              <DateInput value={dtPgto} onChange={setDtPgto} />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setModalPgto(false)}>Cancelar</button>
              <button className="btn bp" onClick={confirmarPagamento} disabled={salvando}>
                {salvando ? "Salvando..." : "✓ Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
