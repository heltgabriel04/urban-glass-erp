"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import SearchInput from "@/components/ui/SearchInput";
import { registrarLog } from "@/services/log.service";
import { useToast } from "@/components/ui/toast";
import { getContasBancarias } from "@/services/contasBancarias.service";
import { getCentrosCusto } from "@/services/centrosCusto.service";
import { registrarBaixa, estornarBaixa, getBaixasPorLancamentos, calcularSaldo } from "@/services/lancamentos.service";
import { useEscToClose } from "@/components/ui/useEscToClose";
import ActionMenu from "@/components/ui/ActionMenu";
import type { ContaBancaria, CentroCusto, BaixaLancamento } from "@/types";

interface PlanoItem { id: number; codigo_estruturado: string; descricao: string; }

interface Conta {
  id: number;
  descricao: string;
  valor: number;
  status: string;
  vencimento: string | null;
  documento: string | null;
  dt_emissao: string | null;
  dt_pagamento: string | null;
  fornecedor: string | null;
  obs: string | null;
  plano_contas_id: number | null;
  plano_contas: PlanoItem | null;
  conta_id: number | null;
  centro_custo_id: number | null;
  created_at: string;
}

type TabFiltro = "todos" | "aberto" | "pago" | "vencido";

const EMPTY_FORM = {
  descricao: "", valor: 0, documento: "", fornecedor: "",
  vencimento: "", dt_emissao: "", obs: "", plano_contas_id: "" as string | number,
  conta_id: "" as string | number, centro_custo_id: "" as string | number,
};

function hoje() { return new Date().toISOString().split("T")[0]; }
function fmtData(s: string | null) {
  if (!s) return "—";
  const d = s.includes("T") ? new Date(s) : new Date(s + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

// Bucket usado por filtro/aba — só olha o campo status guardado (fonte da
// verdade após uma baixa), não mais dt_pagamento (que agora também é
// preenchido em baixa parcial).
function getStatusEfetivo(c: Conta): "Pago" | "Vencido" | "Em aberto" {
  if (c.status === "Pago") return "Pago";
  if (c.vencimento && c.vencimento < hoje()) return "Vencido";
  return "Em aberto";
}

// Rótulo exibido no chip: Parcial tem prioridade visual sobre o bucket,
// mesmo que o título já esteja vencido (ele continua parcialmente pago).
function getStatusExibicao(c: Conta, valorPago: number): "Pago" | "Parcial" | "Vencido" | "Em aberto" {
  const base = getStatusEfetivo(c);
  if (base !== "Pago" && valorPago > 0) return "Parcial";
  return base;
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  "Pago":      { background: "rgba(61,255,160,.12)", color: "var(--ok)",   border: "1px solid rgba(61,255,160,.3)" },
  "Parcial":   { background: "rgba(245,158,11,.12)", color: "var(--warn)", border: "1px solid rgba(245,158,11,.35)" },
  "Vencido":   { background: "rgba(255,80,80,.12)",  color: "var(--err)",  border: "1px solid rgba(255,80,80,.3)" },
  "Em aberto": { background: "rgba(45,95,166,.15)",  color: "#60a5fa",     border: "1px solid rgba(45,95,166,.35)" },
};

export default function ContasPagarPage() {
  return (
    <Suspense fallback={<AppLayout><div className="loading">Carregando...</div></AppLayout>}>
      <ContasPagarPageInner />
    </Suspense>
  );
}

function ContasPagarPageInner() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contas, setContas]       = useState<Conta[]>([]);
  const [planos, setPlanos]       = useState<PlanoItem[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [centrosCusto, setCentrosCusto]       = useState<CentroCusto[]>([]);
  const [baixasMap, setBaixasMap] = useState<Map<number, BaixaLancamento[]>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<TabFiltro>((searchParams.get("tab") as TabFiltro) || "aberto");
  const [busca, setBusca]         = useState(searchParams.get("q") ?? "");
  const [filtroVencIni, setFiltroVencIni] = useState("");
  const [filtroVencFim, setFiltroVencFim] = useState("");
  const [filtroEmisIni, setFiltroEmisIni] = useState("");
  const [filtroEmissFim, setFiltroEmissFim] = useState("");
  const [filtroPgtoIni, setFiltroPgtoIni] = useState("");
  const [filtroPgtoFim, setFiltroPgtoFim] = useState("");
  const [modal, setModal]         = useState<"add" | "edit" | "pagar" | "baixas" | "lote-pagar" | null>(null);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [editId, setEditId]       = useState<number | null>(null);
  const [pagarId, setPagarId]     = useState<number | null>(null);
  const [dtPgto, setDtPgto]       = useState(hoje());
  const [valorBaixa, setValorBaixa] = useState(0);
  const [contaBaixaId, setContaBaixaId] = useState<string | number>("");
  const [formaPgtoBaixa, setFormaPgtoBaixa] = useState("");
  const [obsBaixa, setObsBaixa]   = useState("");
  const [baixasVerId, setBaixasVerId] = useState<number | null>(null);
  const [estornandoBaixaId, setEstornandoBaixaId] = useState<number | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState("");
  const [salvando, setSalvando]   = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [dtLote, setDtLote]       = useState(hoje());

  useEffect(() => { load(); }, []);

  // Navegação inteligente: aba e busca sobrevivem a refresh/voltar do navegador.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (busca.trim()) params.set("q", busca.trim());
      if (tab !== "aberto") params.set("tab", tab);
      const qs = params.toString();
      router.replace(qs ? `/contas-pagar?${qs}` : "/contas-pagar", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, busca]);

  useEffect(() => { setSelecionados(new Set()); }, [tab, busca]);

  useEscToClose(modal === "add" || modal === "edit", closeModal);
  useEscToClose(modal === "pagar", closeModal);
  useEscToClose(modal === "baixas", closeModal);
  useEscToClose(modal === "lote-pagar", closeModal);

  async function load() {
    setLoading(true);
    const [{ data: cs }, { data: pls }, cbs, ccs] = await Promise.all([
      supabase
        .from("lancamentos")
        .select("id, descricao, valor, status, vencimento, documento, dt_emissao, dt_pagamento, fornecedor, obs, plano_contas_id, conta_id, centro_custo_id, created_at, plano_contas(id, codigo_estruturado, descricao)")
        .eq("tipo", "Saída")
        .order("vencimento", { ascending: true }),
      supabase.from("plano_contas").select("id, codigo_estruturado, descricao").order("codigo"),
      getContasBancarias(true),
      getCentrosCusto(true),
    ]);
    const contasCarregadas = (cs ?? []) as unknown as Conta[];
    setContas(contasCarregadas);
    setPlanos((pls ?? []) as PlanoItem[]);
    setContasBancarias(cbs);
    setCentrosCusto(ccs);
    setBaixasMap(await getBaixasPorLancamentos(contasCarregadas.map(c => c.id)));
    setLoading(false);
  }

  const filtradas = useMemo(() => {
    return contas.filter(c => {
      const st = getStatusEfetivo(c);
      if (tab === "aberto"  && st !== "Em aberto") return false;
      if (tab === "pago"    && st !== "Pago")       return false;
      if (tab === "vencido" && st !== "Vencido")    return false;
      const q = busca.toLowerCase();
      if (q && !c.descricao.toLowerCase().includes(q) && !(c.fornecedor ?? "").toLowerCase().includes(q) && !(c.documento ?? "").toLowerCase().includes(q)) return false;
      if (filtroVencIni && (c.vencimento ?? "") < filtroVencIni) return false;
      if (filtroVencFim && (c.vencimento ?? "") > filtroVencFim) return false;
      if (filtroEmisIni && (c.dt_emissao ?? "") < filtroEmisIni) return false;
      if (filtroEmissFim && (c.dt_emissao ?? "") > filtroEmissFim) return false;
      if (filtroPgtoIni && (c.dt_pagamento ?? "") < filtroPgtoIni) return false;
      if (filtroPgtoFim && (c.dt_pagamento ?? "") > filtroPgtoFim) return false;
      return true;
    });
  }, [contas, tab, busca, filtroVencIni, filtroVencFim, filtroEmisIni, filtroEmissFim, filtroPgtoIni, filtroPgtoFim]);

  const totalTitulos = filtradas.reduce((s, c) => s + Number(c.valor), 0);
  const totalPago    = filtradas.reduce((s, c) => s + calcularSaldo(c, baixasMap.get(c.id)).valorPago, 0);
  const totalAberto  = totalTitulos - totalPago;

  const contasVencidas = contas.filter(c => getStatusEfetivo(c) === "Vencido").length;
  const todosSelecionados = filtradas.length > 0 && filtradas.every(c => selecionados.has(c.id));

  function toggleSelecionado(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelecionarTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set(filtradas.map(c => c.id)));
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM, dt_emissao: hoje(), vencimento: hoje() });
    setEditId(null);
    setModal("add");
  }
  function openEdit(c: Conta) {
    setForm({
      descricao: c.descricao, valor: Number(c.valor),
      documento: c.documento ?? "", fornecedor: c.fornecedor ?? "",
      vencimento: c.vencimento ?? "", dt_emissao: c.dt_emissao ?? "",
      obs: c.obs ?? "", plano_contas_id: c.plano_contas_id ?? "",
      conta_id: c.conta_id ?? "", centro_custo_id: c.centro_custo_id ?? "",
    });
    setEditId(c.id);
    setModal("edit");
  }
  function openPagar(c: Conta) {
    const { saldo } = calcularSaldo(c, baixasMap.get(c.id));
    setPagarId(c.id);
    setDtPgto(hoje());
    setValorBaixa(saldo > 0 ? saldo : Number(c.valor));
    setContaBaixaId("");
    setFormaPgtoBaixa("");
    setObsBaixa("");
    setModal("pagar");
  }
  function openBaixas(c: Conta) {
    setBaixasVerId(c.id);
    setEstornandoBaixaId(null);
    setMotivoEstorno("");
    setModal("baixas");
  }
  function openLotePagar() {
    setDtLote(hoje());
    setModal("lote-pagar");
  }
  function closeModal() {
    setModal(null); setEditId(null); setPagarId(null);
    setBaixasVerId(null); setEstornandoBaixaId(null); setMotivoEstorno("");
  }

  async function salvarConta() {
    if (!form.descricao.trim() || form.valor <= 0) return;
    setSalvando(true);
    // Não inclui `status` aqui: editar uma conta não deve reabrir uma que já
    // está paga. Status só muda via registrarBaixa/estornarBaixa.
    const payload = {
      tipo: "Saída",
      descricao: form.descricao.trim(),
      valor: form.valor,
      vencimento: form.vencimento || null,
      dt_emissao: form.dt_emissao || null,
      documento: form.documento.trim() || null,
      fornecedor: form.fornecedor.trim() || null,
      obs: form.obs.trim() || null,
      plano_contas_id: form.plano_contas_id ? Number(form.plano_contas_id) : null,
      conta_id: form.conta_id ? Number(form.conta_id) : null,
      centro_custo_id: form.centro_custo_id ? Number(form.centro_custo_id) : null,
    };
    if (editId) {
      registrarLog({
        acao: "editou", tabela: "lancamentos", registro_id: String(editId),
        descricao: `Editou conta a pagar: ${payload.descricao}`,
        campos_alterados: { valor: payload.valor, vencimento: payload.vencimento },
      });
      await supabase.from("lancamentos").update(payload as never).eq("id", editId);
    } else {
      await supabase.from("lancamentos").insert([{ ...payload, status: "Pendente", pedido_id: null, cliente_id: null }] as never);
    }
    setSalvando(false);
    closeModal();
    load();
  }

  async function confirmarPagamento() {
    if (!pagarId || !dtPgto || valorBaixa <= 0) return;
    setSalvando(true);
    const res = await registrarBaixa({
      lancamentoId: pagarId,
      valor: valorBaixa,
      data: dtPgto,
      contaId: contaBaixaId ? Number(contaBaixaId) : null,
      formaPgto: formaPgtoBaixa.trim() || null,
      obs: obsBaixa.trim() || null,
    });
    setSalvando(false);
    if (res) {
      toast("Baixa registrada");
      closeModal();
      load();
    } else {
      toast("Erro ao registrar baixa", "err");
    }
  }

  async function confirmarPagamentoLote() {
    if (!dtLote) return;
    setSalvando(true);
    const alvos = contas.filter(c => selecionados.has(c.id) && calcularSaldo(c, baixasMap.get(c.id)).saldo > 0);
    let ok = 0;
    for (const c of alvos) {
      const { saldo } = calcularSaldo(c, baixasMap.get(c.id));
      const res = await registrarBaixa({ lancamentoId: c.id, valor: saldo, data: dtLote });
      if (res) ok++;
    }
    setSalvando(false);
    toast(
      ok === alvos.length ? `${ok} baixa(s) registrada(s)` : `${ok} de ${alvos.length} baixas registradas`,
      ok === alvos.length ? undefined : "err"
    );
    setSelecionados(new Set());
    closeModal();
    load();
  }

  async function excluirLote() {
    const n = selecionados.size;
    if (!confirm(`Excluir ${n} conta(s) selecionada(s)?`)) return;
    setSalvando(true);
    for (const id of selecionados) {
      const conta = contas.find(c => c.id === id);
      registrarLog({
        acao: "excluiu", tabela: "lancamentos", registro_id: String(id),
        descricao: `Excluiu conta a pagar (lote): ${conta?.descricao ?? id}`,
        campos_alterados: { valor: conta?.valor, status: conta?.status },
      });
      await supabase.from("lancamentos").delete().eq("id", id);
    }
    setSalvando(false);
    setSelecionados(new Set());
    toast(`${n} conta(s) excluída(s)`);
    load();
  }

  async function confirmarEstorno(baixaId: number) {
    if (!motivoEstorno.trim()) { toast("Informe o motivo do estorno", "err"); return; }
    setSalvando(true);
    const ok = await estornarBaixa({ baixaId, motivo: motivoEstorno.trim() });
    setSalvando(false);
    if (ok) {
      toast("Baixa estornada");
      setEstornandoBaixaId(null);
      setMotivoEstorno("");
      load();
    } else {
      toast("Erro ao estornar baixa", "err");
    }
  }

  async function excluir(id: number) {
    if (!confirm("Excluir esta conta a pagar?")) return;
    const conta = contas.find(c => c.id === id);
    registrarLog({
      acao: "excluiu", tabela: "lancamentos", registro_id: String(id),
      descricao: `Excluiu conta a pagar: ${conta?.descricao ?? id}`,
      campos_alterados: { valor: conta?.valor, status: conta?.status },
    });
    await supabase.from("lancamentos").delete().eq("id", id);
    load();
  }

  const TABS: { key: TabFiltro; label: string }[] = [
    { key: "todos",   label: "Todos" },
    { key: "aberto",  label: "Em aberto" },
    { key: "pago",    label: "Pago" },
    { key: "vencido", label: `Vencido${contasVencidas > 0 ? ` (${contasVencidas})` : ""}` },
  ];

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Contas a Pagar</div>
        <button className="btn bp sm" onClick={openAdd}>+ Adicionar</button>
      </div>

      <div className="con">

        {/* Resumo rápido */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total de Títulos", val: contas.length,                                        sub: "lançamentos",    cor: "var(--t1)" },
            { label: "Em Aberto",        val: formatBRL(contas.filter(c => getStatusEfetivo(c) === "Em aberto").reduce((s,c) => s+Number(c.valor),0)), sub: `${contas.filter(c => getStatusEfetivo(c) === "Em aberto").length} contas`, cor: "#60a5fa" },
            { label: "Vencido",          val: formatBRL(contas.filter(c => getStatusEfetivo(c) === "Vencido").reduce((s,c) => s+Number(c.valor),0)),   sub: `${contasVencidas} conta(s)`, cor: "var(--err)" },
            { label: "Pago (total)",     val: formatBRL(contas.reduce((s,c) => s + calcularSaldo(c, baixasMap.get(c.id)).valorPago, 0)),       sub: `${contas.filter(c => getStatusEfetivo(c) === "Pago").length} contas`, cor: "var(--ok)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px" }}>
              <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "6px" }}>{s.label}</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: s.cor, fontFamily: "'DM Mono', monospace" }}>{s.val}</div>
              <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "3px" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid var(--b1)", marginBottom: "16px" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "8px 16px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer",
              background: "transparent", borderBottom: tab === t.key ? "2px solid var(--acc)" : "2px solid transparent",
              color: tab === t.key ? "var(--acc)" : "var(--t3)", marginBottom: "-1px",
              letterSpacing: "0.04em",
            }}>{t.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setMostrarFiltros(v => !v)} style={{
            fontSize: "11px", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--b2)",
            background: mostrarFiltros ? "var(--surf2)" : "transparent", color: "var(--t3)", cursor: "pointer", alignSelf: "center",
          }}>⚙ Filtros por data</button>
        </div>

        {/* Filtros de data (colapsável) */}
        {mostrarFiltros && (
          <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px", marginBottom: "14px", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
            {[
              { label: "Emissão de",    val: filtroEmisIni,  set: setFiltroEmisIni },
              { label: "Emissão até",   val: filtroEmissFim, set: setFiltroEmissFim },
              { label: "Vencimento de", val: filtroVencIni,  set: setFiltroVencIni },
              { label: "Vencimento até",val: filtroVencFim,  set: setFiltroVencFim },
              { label: "Pagamento de",  val: filtroPgtoIni,  set: setFiltroPgtoIni },
              { label: "Pagamento até", val: filtroPgtoFim,  set: setFiltroPgtoFim },
            ].map(f => (
              <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.label}</div>
                <input type="date" className="fc" style={{ margin: 0 }} value={f.val} onChange={e => f.set(e.target.value)} />
              </div>
            ))}
            <button className="btn bg sm" onClick={() => { setFiltroEmisIni(""); setFiltroEmissFim(""); setFiltroVencIni(""); setFiltroVencFim(""); setFiltroPgtoIni(""); setFiltroPgtoFim(""); }}>✕ Limpar</button>
          </div>
        )}

        {/* Busca */}
        <div style={{ marginBottom: "12px" }}>
          <SearchInput icon={false} className="fc" placeholder="Buscar por descrição, fornecedor ou documento..."
            value={busca} onChange={setBusca} inputStyle={{ margin: 0, width: "100%" }} />
        </div>

        {/* Barra de ações em lote */}
        {selecionados.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", marginBottom: "10px", background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--t1)" }}>{selecionados.size} selecionado(s)</span>
            <button className="btn bp xs" onClick={openLotePagar}>Marcar como pago(s)</button>
            <button className="btn bg xs" onClick={excluirLote} style={{ color: "var(--err)" }}>Excluir selecionados</button>
            <div style={{ flex: 1 }} />
            <button className="btn bg xs" onClick={() => setSelecionados(new Set())}>Limpar seleção</button>
          </div>
        )}

        {/* Tabela */}
        {loading ? <div className="loading">Carregando...</div> : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "30px" }}>
                      <input type="checkbox" checked={todosSelecionados} onChange={toggleSelecionarTodos} />
                    </th>
                    <th style={{ width: "130px" }}>Documento</th>
                    <th style={{ width: "90px" }}>Emissão</th>
                    <th style={{ width: "200px" }}>Plano de Contas</th>
                    <th>Fornecedor / Descrição</th>
                    <th style={{ width: "90px" }}>Vencimento</th>
                    <th style={{ width: "110px", textAlign: "right" }}>Valor</th>
                    <th style={{ width: "110px", textAlign: "right" }}>Valor Pago</th>
                    <th style={{ width: "90px" }}>Pagamento</th>
                    <th style={{ width: "90px" }}>Status</th>
                    <th style={{ width: "50px" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.length === 0 && (
                    <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--t3)", padding: "40px" }}>
                      Nenhuma conta encontrada.
                    </td></tr>
                  )}
                  {filtradas.map(c => {
                    const st = getStatusEfetivo(c);
                    const { valorPago, saldo } = calcularSaldo(c, baixasMap.get(c.id));
                    const stExibida = getStatusExibicao(c, valorPago);
                    return (
                      <tr key={c.id}>
                        <td>
                          <input type="checkbox" checked={selecionados.has(c.id)} onChange={() => toggleSelecionado(c.id)} />
                        </td>
                        <td className="mono" style={{ fontSize: "11px", color: "var(--t2)" }}>
                          {c.documento || <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>
                        <td style={{ fontSize: "12px" }}>{fmtData(c.dt_emissao)}</td>
                        <td style={{ fontSize: "11px" }}>
                          {c.plano_contas
                            ? <span><span style={{ color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontSize: "10px" }}>{c.plano_contas.codigo_estruturado}</span> {c.plano_contas.descricao}</span>
                            : <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{c.descricao}</div>
                          {c.fornecedor && <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>{c.fornecedor}</div>}
                        </td>
                        <td style={{ fontSize: "12px", color: st === "Vencido" ? "var(--err)" : "var(--t1)", fontWeight: st === "Vencido" ? 700 : 400 }}>
                          {fmtData(c.vencimento)}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>
                          {formatBRL(Number(c.valor))}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", color: valorPago > 0 ? "var(--ok)" : "var(--t3)" }}>
                          {formatBRL(valorPago)}
                        </td>
                        <td style={{ fontSize: "12px" }}>{fmtData(c.dt_pagamento)}</td>
                        <td>
                          <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "99px", whiteSpace: "nowrap", ...STATUS_STYLE[stExibida] }}>
                            {stExibida}
                          </span>
                        </td>
                        <td>
                          <ActionMenu items={[
                            { label: "Registrar baixa", onClick: () => openPagar(c), hidden: saldo <= 0 },
                            { label: "Ver baixas / estornar", onClick: () => openBaixas(c), hidden: valorPago <= 0 },
                            { label: "Editar", onClick: () => openEdit(c) },
                            { label: "Excluir", onClick: () => excluir(c.id), danger: true },
                          ]} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Rodapé com totais */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0", marginTop: "12px", border: "1px solid var(--b1)", borderRadius: "10px", overflow: "hidden" }}>
              {[
                { label: "Total de Títulos", val: totalTitulos, cor: "var(--t1)",  bg: "var(--surf1)" },
                { label: "Total Pago",       val: totalPago,   cor: "var(--ok)",   bg: "var(--surf1)" },
                { label: "Total em Aberto",  val: totalAberto,  cor: "white",      bg: "rgba(45,95,166,.25)" },
              ].map((t, i) => (
                <div key={t.label} style={{
                  padding: "16px 20px", background: t.bg,
                  borderLeft: i > 0 ? "1px solid var(--b1)" : "none",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "6px" }}>{t.label}</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: t.cor, fontFamily: "'DM Mono', monospace" }}>{formatBRL(t.val)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--t3)" }}>
              {filtradas.length} de {contas.length} registro(s)
            </div>
          </>
        )}
      </div>

      {/* ── MODAL ADD/EDIT ── */}
      {(modal === "add" || modal === "edit") && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "560px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div className="mhd">
              <div className="mtit">{modal === "add" ? "Nova Conta a Pagar" : "Editar Conta a Pagar"}</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto", flex: 1 }}>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Documento</label>
                  <input className="fc" placeholder="NF 001, Boleto..." value={form.documento}
                    onChange={e => setForm(f => ({ ...f, documento: e.target.value }))} />
                </div>
                <div className="fg">
                  <label className="fl">Fornecedor / Pessoa</label>
                  <input className="fc" placeholder="Nome do fornecedor" value={form.fornecedor}
                    onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} />
                </div>
              </div>

              <div className="fg">
                <label className="fl">Descrição *</label>
                <input className="fc" placeholder="Descrição da conta" value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Plano de Contas</label>
                  <select className="fc" value={form.plano_contas_id}
                    onChange={e => setForm(f => ({ ...f, plano_contas_id: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {planos.map(p => <option key={p.id} value={p.id}>{p.codigo_estruturado} · {p.descricao}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Centro de Custo</label>
                  <select className="fc" value={form.centro_custo_id}
                    onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {centrosCusto.map(cc => <option key={cc.id} value={cc.id}>{cc.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="fg">
                <label className="fl">Conta Bancária (previsão de pagamento)</label>
                <select className="fc" value={form.conta_id}
                  onChange={e => setForm(f => ({ ...f, conta_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {contasBancarias.map(cb => <option key={cb.id} value={cb.id}>{cb.nome}</option>)}
                </select>
              </div>

              <div className="fr3">
                <div className="fg">
                  <label className="fl">Valor *</label>
                  <CurrencyInput value={form.valor} onChange={v => setForm(f => ({ ...f, valor: v }))} />
                </div>
                <div className="fg">
                  <label className="fl">Emissão</label>
                  <DateInput value={form.dt_emissao} onChange={v => setForm(f => ({ ...f, dt_emissao: v }))} />
                </div>
                <div className="fg">
                  <label className="fl">Vencimento</label>
                  <DateInput value={form.vencimento} onChange={v => setForm(f => ({ ...f, vencimento: v }))} />
                </div>
              </div>

              <div className="fg">
                <label className="fl">Observação</label>
                <input className="fc" placeholder="Observações..." value={form.obs}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
              <button className="btn bg" onClick={closeModal}>Cancelar</button>
              <button className="btn bp" onClick={salvarConta} disabled={salvando || !form.descricao.trim() || form.valor <= 0}>
                {salvando ? "Salvando..." : modal === "add" ? "Adicionar" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL BAIXA (pagamento total ou parcial) ── */}
      {modal === "pagar" && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "420px" }}>
            <div className="mhd">
              <div className="mtit">Registrar Baixa</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                {contas.find(c => c.id === pagarId)?.descricao}
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Valor da Baixa</label>
                  <CurrencyInput value={valorBaixa} onChange={setValorBaixa} />
                </div>
                <div className="fg">
                  <label className="fl">Data</label>
                  <DateInput value={dtPgto} onChange={setDtPgto} />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Conta Bancária</label>
                <select className="fc" value={contaBaixaId} onChange={e => setContaBaixaId(e.target.value)}>
                  <option value="">Não informado</option>
                  {contasBancarias.map(cb => <option key={cb.id} value={cb.id}>{cb.nome}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Forma de Pagamento</label>
                <input className="fc" placeholder="PIX, boleto, transferência..." value={formaPgtoBaixa} onChange={e => setFormaPgtoBaixa(e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl">Observação</label>
                <input className="fc" value={obsBaixa} onChange={e => setObsBaixa(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={closeModal}>Cancelar</button>
              <button className="btn bp" onClick={confirmarPagamento} disabled={salvando || !dtPgto || valorBaixa <= 0}>
                {salvando ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL BAIXA EM LOTE ── */}
      {modal === "lote-pagar" && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "360px" }}>
            <div className="mhd">
              <div className="mtit">Marcar {selecionados.size} conta(s) como pagas</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="fg">
                <label className="fl">Data do Pagamento</label>
                <DateInput value={dtLote} onChange={setDtLote} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                Cada título é baixado pelo saldo em aberto integral (sem parcial).
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={closeModal}>Cancelar</button>
              <button className="btn bp" onClick={confirmarPagamentoLote} disabled={salvando || !dtLote}>
                {salvando ? "Processando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL HISTÓRICO DE BAIXAS / ESTORNO ── */}
      {modal === "baixas" && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "480px", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div className="mhd">
              <div className="mtit">Baixas · {contas.find(c => c.id === baixasVerId)?.descricao}</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
              {(baixasMap.get(baixasVerId ?? -1) ?? []).length === 0 && (
                <div style={{ fontSize: "12px", color: "var(--t3)" }}>Nenhuma baixa registrada.</div>
              )}
              {(baixasMap.get(baixasVerId ?? -1) ?? []).map(b => (
                <div key={b.id} style={{ border: "1px solid var(--b1)", borderRadius: "8px", padding: "10px 12px", opacity: b.estornado_em ? 0.55 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{formatBRL(Number(b.valor))}</div>
                      <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                        {fmtData(b.data)}{b.contas_bancarias?.nome ? ` · ${b.contas_bancarias.nome}` : ""}{b.forma_pgto ? ` · ${b.forma_pgto}` : ""}
                      </div>
                    </div>
                    {b.estornado_em ? (
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "99px", ...STATUS_STYLE["Vencido"] }}>Estornada</span>
                    ) : (
                      estornandoBaixaId !== b.id && (
                        <button className="btn bg xs" onClick={() => { setEstornandoBaixaId(b.id); setMotivoEstorno(""); }} style={{ color: "var(--err)" }}>
                          Estornar
                        </button>
                      )
                    )}
                  </div>
                  {b.estornado_em && b.estornado_motivo && (
                    <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>Motivo: {b.estornado_motivo}</div>
                  )}
                  {estornandoBaixaId === b.id && (
                    <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <textarea className="fc" rows={2} placeholder="Motivo do estorno *" value={motivoEstorno}
                        onChange={e => setMotivoEstorno(e.target.value)} style={{ margin: 0, resize: "vertical" }} />
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button className="btn bg xs" onClick={() => setEstornandoBaixaId(null)}>Cancelar</button>
                        <button className="btn bw xs" onClick={() => confirmarEstorno(b.id)} disabled={salvando || !motivoEstorno.trim()}>
                          {salvando ? "Estornando..." : "Confirmar estorno"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={closeModal}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
