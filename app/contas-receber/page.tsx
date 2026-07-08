"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import SearchInput from "@/components/ui/SearchInput";
import { useToast } from "@/components/ui/toast";
import { getContasBancarias } from "@/services/contasBancarias.service";
import { getCentrosCusto } from "@/services/centrosCusto.service";
import { registrarBaixa, estornarBaixa, getBaixasPorLancamentos, calcularSaldo } from "@/services/lancamentos.service";
import { useEscToClose } from "@/components/ui/useEscToClose";
import ActionMenu from "@/components/ui/ActionMenu";
import type { ContaBancaria, CentroCusto, BaixaLancamento } from "@/types";

interface PlanoItem { id: number; codigo_estruturado: string; descricao: string; }
interface ClienteItem { id: number; nome: string; }

interface Recebivel {
  id: number;
  descricao: string;
  valor: number;
  status: string;
  vencimento: string | null;
  documento: string | null;
  dt_emissao: string | null;
  dt_pagamento: string | null;
  obs: string | null;
  pedido_id: string | null;
  cliente_id: number | null;
  plano_contas_id: number | null;
  plano_contas: PlanoItem | null;
  clientes: { id: number; nome: string } | null;
  conta_id: number | null;
  centro_custo_id: number | null;
  created_at: string;
}

type TabFiltro = "todos" | "aberto" | "recebido" | "vencido";

const EMPTY_FORM = {
  descricao: "", valor: 0, documento: "", cliente_id: "" as string | number,
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
function getStatusEfetivo(r: Recebivel): "Recebido" | "Vencido" | "A Receber" {
  if (r.status === "Pago") return "Recebido";
  if (r.vencimento && r.vencimento < hoje()) return "Vencido";
  return "A Receber";
}

// Rótulo exibido no chip: Parcial tem prioridade visual sobre o bucket,
// mesmo que o título já esteja vencido (ele continua parcialmente recebido).
function getStatusExibicao(r: Recebivel, valorRecebido: number): "Recebido" | "Parcial" | "Vencido" | "A Receber" {
  const base = getStatusEfetivo(r);
  if (base !== "Recebido" && valorRecebido > 0) return "Parcial";
  return base;
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  "Recebido":  { background: "rgba(61,255,160,.12)", color: "var(--ok)",   border: "1px solid rgba(61,255,160,.3)" },
  "Parcial":   { background: "rgba(245,158,11,.12)", color: "var(--warn)", border: "1px solid rgba(245,158,11,.35)" },
  "Vencido":   { background: "rgba(255,80,80,.12)",  color: "var(--err)",  border: "1px solid rgba(255,80,80,.3)" },
  "A Receber": { background: "rgba(45,95,166,.15)",  color: "#60a5fa",     border: "1px solid rgba(45,95,166,.35)" },
};

export default function ContasReceberPage() {
  return (
    <Suspense fallback={<AppLayout><div className="loading">Carregando...</div></AppLayout>}>
      <ContasReceberPageInner />
    </Suspense>
  );
}

function ContasReceberPageInner() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [recebiveis, setRecebiveis] = useState<Recebivel[]>([]);
  const [planos, setPlanos]         = useState<PlanoItem[]>([]);
  const [clientes, setClientes]     = useState<ClienteItem[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [centrosCusto, setCentrosCusto]       = useState<CentroCusto[]>([]);
  const [baixasMap, setBaixasMap]   = useState<Map<number, BaixaLancamento[]>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<TabFiltro>((searchParams.get("tab") as TabFiltro) || "aberto");
  const [busca, setBusca]           = useState(searchParams.get("q") ?? "");
  const [filtroVencIni, setFiltroVencIni]   = useState("");
  const [filtroVencFim, setFiltroVencFim]   = useState("");
  const [filtroEmisIni, setFiltroEmisIni]   = useState("");
  const [filtroEmissFim, setFiltroEmissFim] = useState("");
  const [filtroPgtoIni, setFiltroPgtoIni]   = useState("");
  const [filtroPgtoFim, setFiltroPgtoFim]   = useState("");
  const [modal, setModal]           = useState<"add" | "edit" | "receber" | "baixas" | "lote-receber" | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [editId, setEditId]         = useState<number | null>(null);
  const [receberId, setReceberId]   = useState<number | null>(null);
  const [dtRec, setDtRec]           = useState(hoje());
  const [valorBaixa, setValorBaixa] = useState(0);
  const [contaBaixaId, setContaBaixaId] = useState<string | number>("");
  const [formaPgtoBaixa, setFormaPgtoBaixa] = useState("");
  const [obsBaixa, setObsBaixa]     = useState("");
  const [baixasVerId, setBaixasVerId] = useState<number | null>(null);
  const [estornandoBaixaId, setEstornandoBaixaId] = useState<number | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState("");
  const [salvando, setSalvando]     = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [dtLote, setDtLote]         = useState(hoje());

  useEffect(() => { load(); }, []);

  // Navegação inteligente: aba e busca sobrevivem a refresh/voltar do navegador.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (busca.trim()) params.set("q", busca.trim());
      if (tab !== "aberto") params.set("tab", tab);
      const qs = params.toString();
      router.replace(qs ? `/contas-receber?${qs}` : "/contas-receber", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, busca]);

  useEffect(() => { setSelecionados(new Set()); }, [tab, busca]);

  useEscToClose(modal === "add" || modal === "edit", closeModal);
  useEscToClose(modal === "receber", closeModal);
  useEscToClose(modal === "baixas", closeModal);
  useEscToClose(modal === "lote-receber", closeModal);

  async function load() {
    setLoading(true);
    const [{ data: rs }, { data: pls }, { data: cls }, cbs, ccs] = await Promise.all([
      supabase
        .from("lancamentos")
        .select("id, descricao, valor, status, vencimento, documento, dt_emissao, dt_pagamento, obs, pedido_id, cliente_id, plano_contas_id, conta_id, centro_custo_id, created_at, plano_contas(id, codigo_estruturado, descricao), clientes(id, nome)")
        .eq("tipo", "Entrada")
        .order("vencimento", { ascending: true }),
      supabase.from("plano_contas").select("id, codigo_estruturado, descricao").order("codigo"),
      supabase.from("clientes").select("id, nome").order("nome"),
      getContasBancarias(true),
      getCentrosCusto(true),
    ]);
    const recebiveisCarregados = (rs ?? []) as unknown as Recebivel[];
    setRecebiveis(recebiveisCarregados);
    setPlanos((pls ?? []) as PlanoItem[]);
    setClientes((cls ?? []) as ClienteItem[]);
    setContasBancarias(cbs);
    setCentrosCusto(ccs);
    setBaixasMap(await getBaixasPorLancamentos(recebiveisCarregados.map(r => r.id)));
    setLoading(false);
  }

  const filtrados = useMemo(() => {
    return recebiveis.filter(r => {
      const st = getStatusEfetivo(r);
      if (tab === "aberto"   && st !== "A Receber") return false;
      if (tab === "recebido" && st !== "Recebido")  return false;
      if (tab === "vencido"  && st !== "Vencido")   return false;
      const q = busca.toLowerCase();
      if (q && !r.descricao.toLowerCase().includes(q)
            && !(r.clientes?.nome ?? "").toLowerCase().includes(q)
            && !(r.pedido_id ?? "").toLowerCase().includes(q)
            && !(r.documento ?? "").toLowerCase().includes(q)) return false;
      if (filtroVencIni  && (r.vencimento ?? "")   < filtroVencIni)  return false;
      if (filtroVencFim  && (r.vencimento ?? "")   > filtroVencFim)  return false;
      if (filtroEmisIni  && (r.dt_emissao ?? "")   < filtroEmisIni)  return false;
      if (filtroEmissFim && (r.dt_emissao ?? "")   > filtroEmissFim) return false;
      if (filtroPgtoIni  && (r.dt_pagamento ?? "") < filtroPgtoIni)  return false;
      if (filtroPgtoFim  && (r.dt_pagamento ?? "") > filtroPgtoFim)  return false;
      return true;
    });
  }, [recebiveis, tab, busca, filtroVencIni, filtroVencFim, filtroEmisIni, filtroEmissFim, filtroPgtoIni, filtroPgtoFim]);

  const totalTitulos  = filtrados.reduce((s, r) => s + Number(r.valor), 0);
  const totalRecebido = filtrados.reduce((s, r) => s + calcularSaldo(r, baixasMap.get(r.id)).valorPago, 0);
  const totalAberto   = totalTitulos - totalRecebido;
  const qtdVencidos   = recebiveis.filter(r => getStatusEfetivo(r) === "Vencido").length;
  const todosSelecionados = filtrados.length > 0 && filtrados.every(r => selecionados.has(r.id));

  function toggleSelecionado(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelecionarTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set(filtrados.map(r => r.id)));
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM, dt_emissao: hoje(), vencimento: hoje() });
    setEditId(null);
    setModal("add");
  }
  function openEdit(r: Recebivel) {
    setForm({
      descricao: r.descricao, valor: Number(r.valor),
      documento: r.documento ?? "", cliente_id: r.cliente_id ?? "",
      vencimento: r.vencimento ?? "", dt_emissao: r.dt_emissao ?? "",
      obs: r.obs ?? "", plano_contas_id: r.plano_contas_id ?? "",
      conta_id: r.conta_id ?? "", centro_custo_id: r.centro_custo_id ?? "",
    });
    setEditId(r.id);
    setModal("edit");
  }
  function openReceber(r: Recebivel) {
    const { saldo } = calcularSaldo(r, baixasMap.get(r.id));
    setReceberId(r.id);
    setDtRec(hoje());
    setValorBaixa(saldo > 0 ? saldo : Number(r.valor));
    setContaBaixaId("");
    setFormaPgtoBaixa("");
    setObsBaixa("");
    setModal("receber");
  }
  function openBaixas(r: Recebivel) {
    setBaixasVerId(r.id);
    setEstornandoBaixaId(null);
    setMotivoEstorno("");
    setModal("baixas");
  }
  function openLoteReceber() {
    setDtLote(hoje());
    setModal("lote-receber");
  }
  function closeModal() {
    setModal(null); setEditId(null); setReceberId(null);
    setBaixasVerId(null); setEstornandoBaixaId(null); setMotivoEstorno("");
  }

  async function salvarRecebivel() {
    if (!form.descricao.trim() || form.valor <= 0) return;
    setSalvando(true);
    const payload = {
      tipo: "Entrada",
      descricao: form.descricao.trim(),
      valor: form.valor,
      vencimento: form.vencimento || null,
      dt_emissao: form.dt_emissao || null,
      documento: (form.documento as string).trim() || null,
      obs: (form.obs as string).trim() || null,
      cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
      plano_contas_id: form.plano_contas_id ? Number(form.plano_contas_id) : null,
      conta_id: form.conta_id ? Number(form.conta_id) : null,
      centro_custo_id: form.centro_custo_id ? Number(form.centro_custo_id) : null,
    };
    if (editId) {
      await supabase.from("lancamentos").update(payload as never).eq("id", editId);
    } else {
      await supabase.from("lancamentos").insert([{ ...payload, status: "A Receber", pedido_id: null }] as never);
    }
    setSalvando(false);
    closeModal();
    load();
  }

  async function confirmarRecebimento() {
    if (!receberId || !dtRec || valorBaixa <= 0) return;
    setSalvando(true);
    const res = await registrarBaixa({
      lancamentoId: receberId,
      valor: valorBaixa,
      data: dtRec,
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
      toast("Erro ao registrar recebimento", "err");
    }
  }

  async function confirmarRecebimentoLote() {
    if (!dtLote) return;
    setSalvando(true);
    const alvos = recebiveis.filter(r => selecionados.has(r.id) && calcularSaldo(r, baixasMap.get(r.id)).saldo > 0);
    let ok = 0;
    for (const r of alvos) {
      const { saldo } = calcularSaldo(r, baixasMap.get(r.id));
      const res = await registrarBaixa({ lancamentoId: r.id, valor: saldo, data: dtLote });
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
    if (!confirm(`Excluir ${n} recebível(is) selecionado(s)?`)) return;
    setSalvando(true);
    for (const id of selecionados) {
      await supabase.from("lancamentos").delete().eq("id", id);
    }
    setSalvando(false);
    setSelecionados(new Set());
    toast(`${n} recebível(is) excluído(s)`);
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
    if (!confirm("Excluir este recebível?")) return;
    await supabase.from("lancamentos").delete().eq("id", id);
    load();
  }

  const TABS: { key: TabFiltro; label: string }[] = [
    { key: "todos",    label: "Todos" },
    { key: "aberto",   label: "A Receber" },
    { key: "recebido", label: "Recebido" },
    { key: "vencido",  label: `Vencido${qtdVencidos > 0 ? ` (${qtdVencidos})` : ""}` },
  ];

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Contas a Receber</div>
        <button className="btn bp sm" onClick={openAdd}>+ Adicionar</button>
      </div>

      <div className="con">

        {/* Resumo */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total de Títulos", val: recebiveis.length,  sub: "lançamentos", cor: "var(--t1)" },
            { label: "A Receber",        val: formatBRL(recebiveis.filter(r => getStatusEfetivo(r) === "A Receber").reduce((s,r) => s+Number(r.valor),0)), sub: `${recebiveis.filter(r => getStatusEfetivo(r) === "A Receber").length} título(s)`, cor: "#60a5fa" },
            { label: "Vencido",          val: formatBRL(recebiveis.filter(r => getStatusEfetivo(r) === "Vencido").reduce((s,r) => s+Number(r.valor),0)),   sub: `${qtdVencidos} título(s)`, cor: "var(--err)" },
            { label: "Recebido (total)", val: formatBRL(recebiveis.reduce((s,r) => s + calcularSaldo(r, baixasMap.get(r.id)).valorPago, 0)),   sub: `${recebiveis.filter(r => getStatusEfetivo(r) === "Recebido").length} título(s)`, cor: "var(--ok)" },
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
              color: tab === t.key ? "var(--acc)" : "var(--t3)", marginBottom: "-1px", letterSpacing: "0.04em",
            }}>{t.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setMostrarFiltros(v => !v)} style={{
            fontSize: "11px", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--b2)",
            background: mostrarFiltros ? "var(--surf2)" : "transparent", color: "var(--t3)", cursor: "pointer", alignSelf: "center",
          }}>⚙ Filtros por data</button>
        </div>

        {/* Filtros de data */}
        {mostrarFiltros && (
          <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px", marginBottom: "14px", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
            {[
              { label: "Emissão de",      val: filtroEmisIni,  set: setFiltroEmisIni },
              { label: "Emissão até",     val: filtroEmissFim, set: setFiltroEmissFim },
              { label: "Vencimento de",   val: filtroVencIni,  set: setFiltroVencIni },
              { label: "Vencimento até",  val: filtroVencFim,  set: setFiltroVencFim },
              { label: "Recebimento de",  val: filtroPgtoIni,  set: setFiltroPgtoIni },
              { label: "Recebimento até", val: filtroPgtoFim,  set: setFiltroPgtoFim },
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
          <SearchInput icon={false} className="fc" placeholder="Buscar por descrição, cliente, pedido ou documento..."
            value={busca} onChange={setBusca} inputStyle={{ margin: 0, width: "100%" }} />
        </div>

        {/* Barra de ações em lote */}
        {selecionados.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", marginBottom: "10px", background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--t1)" }}>{selecionados.size} selecionado(s)</span>
            <button className="btn bp xs" onClick={openLoteReceber}>Marcar como recebido(s)</button>
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
                    <th style={{ width: "120px" }}>Pedido / Doc.</th>
                    <th style={{ width: "90px" }}>Emissão</th>
                    <th style={{ width: "200px" }}>Plano de Contas</th>
                    <th>Cliente / Descrição</th>
                    <th style={{ width: "90px" }}>Vencimento</th>
                    <th style={{ width: "110px", textAlign: "right" }}>Valor</th>
                    <th style={{ width: "110px", textAlign: "right" }}>Recebido</th>
                    <th style={{ width: "90px" }}>Recebimento</th>
                    <th style={{ width: "90px" }}>Status</th>
                    <th style={{ width: "50px" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 && (
                    <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--t3)", padding: "40px" }}>
                      Nenhum título encontrado.
                    </td></tr>
                  )}
                  {filtrados.map(r => {
                    const st = getStatusEfetivo(r);
                    const { valorPago: valorRec, saldo } = calcularSaldo(r, baixasMap.get(r.id));
                    const stExibida = getStatusExibicao(r, valorRec);
                    return (
                      <tr key={r.id}>
                        <td>
                          <input type="checkbox" checked={selecionados.has(r.id)} onChange={() => toggleSelecionado(r.id)} />
                        </td>
                        <td className="mono" style={{ fontSize: "11px", color: "var(--acc)" }}>
                          {r.pedido_id
                            ? <span style={{ fontWeight: 700 }}>{r.pedido_id}</span>
                            : r.documento
                              ? <span style={{ color: "var(--t2)" }}>{r.documento}</span>
                              : <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>
                        <td style={{ fontSize: "12px" }}>{fmtData(r.dt_emissao ?? r.created_at)}</td>
                        <td style={{ fontSize: "11px" }}>
                          {r.plano_contas
                            ? <span><span style={{ color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontSize: "10px" }}>{r.plano_contas.codigo_estruturado}</span> {r.plano_contas.descricao}</span>
                            : <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{r.descricao}</div>
                          {r.clientes?.nome && <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>{r.clientes.nome}</div>}
                        </td>
                        <td style={{ fontSize: "12px", color: st === "Vencido" ? "var(--err)" : "var(--t1)", fontWeight: st === "Vencido" ? 700 : 400 }}>
                          {fmtData(r.vencimento)}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>
                          {formatBRL(Number(r.valor))}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", color: valorRec > 0 ? "var(--ok)" : "var(--t3)" }}>
                          {formatBRL(valorRec)}
                        </td>
                        <td style={{ fontSize: "12px" }}>{fmtData(r.dt_pagamento)}</td>
                        <td>
                          <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "99px", whiteSpace: "nowrap", ...STATUS_STYLE[stExibida] }}>
                            {stExibida}
                          </span>
                        </td>
                        <td>
                          <ActionMenu items={[
                            { label: "Registrar recebimento", onClick: () => openReceber(r), hidden: saldo <= 0 },
                            { label: "Ver baixas / estornar", onClick: () => openBaixas(r), hidden: valorRec <= 0 },
                            { label: "Editar", onClick: () => openEdit(r) },
                            { label: "Excluir", onClick: () => excluir(r.id), danger: true },
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
                { label: "Total de Títulos", val: totalTitulos,  cor: "var(--t1)", bg: "var(--surf1)" },
                { label: "Total Recebido",   val: totalRecebido, cor: "var(--ok)", bg: "var(--surf1)" },
                { label: "Total em Aberto",  val: totalAberto,   cor: "white",     bg: "rgba(45,95,166,.25)" },
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
              {filtrados.length} de {recebiveis.length} registro(s)
            </div>
          </>
        )}
      </div>

      {/* ── MODAL ADD/EDIT ── */}
      {(modal === "add" || modal === "edit") && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "560px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div className="mhd">
              <div className="mtit">{modal === "add" ? "Novo Recebível" : "Editar Recebível"}</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto", flex: 1 }}>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Documento</label>
                  <input className="fc" placeholder="NF, recibo..." value={form.documento as string}
                    onChange={e => setForm(f => ({ ...f, documento: e.target.value }))} />
                </div>
                <div className="fg">
                  <label className="fl">Cliente</label>
                  <select className="fc" value={form.cliente_id}
                    onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="fg">
                <label className="fl">Descrição *</label>
                <input className="fc" placeholder="Descrição do recebível" value={form.descricao}
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
                <label className="fl">Conta Bancária (previsão de recebimento)</label>
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
                  <DateInput value={form.dt_emissao as string} onChange={v => setForm(f => ({ ...f, dt_emissao: v }))} />
                </div>
                <div className="fg">
                  <label className="fl">Vencimento</label>
                  <DateInput value={form.vencimento as string} onChange={v => setForm(f => ({ ...f, vencimento: v }))} />
                </div>
              </div>

              <div className="fg">
                <label className="fl">Observação</label>
                <input className="fc" placeholder="Observações..." value={form.obs as string}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
              <button className="btn bg" onClick={closeModal}>Cancelar</button>
              <button className="btn bp" onClick={salvarRecebivel} disabled={salvando || !form.descricao.trim() || form.valor <= 0}>
                {salvando ? "Salvando..." : modal === "add" ? "Adicionar" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL BAIXA (recebimento total ou parcial) ── */}
      {modal === "receber" && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "420px" }}>
            <div className="mhd">
              <div className="mtit">Registrar Baixa</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                {recebiveis.find(r => r.id === receberId)?.descricao}
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Valor da Baixa</label>
                  <CurrencyInput value={valorBaixa} onChange={setValorBaixa} />
                </div>
                <div className="fg">
                  <label className="fl">Data</label>
                  <DateInput value={dtRec} onChange={setDtRec} />
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
              <button className="btn bp" onClick={confirmarRecebimento} disabled={salvando || !dtRec || valorBaixa <= 0}>
                {salvando ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL BAIXA EM LOTE ── */}
      {modal === "lote-receber" && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "360px" }}>
            <div className="mhd">
              <div className="mtit">Marcar {selecionados.size} título(s) como recebidos</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="fg">
                <label className="fl">Data do Recebimento</label>
                <DateInput value={dtLote} onChange={setDtLote} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                Cada título é baixado pelo saldo em aberto integral (sem parcial).
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={closeModal}>Cancelar</button>
              <button className="btn bp" onClick={confirmarRecebimentoLote} disabled={salvando || !dtLote}>
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
              <div className="mtit">Baixas · {recebiveis.find(r => r.id === baixasVerId)?.descricao}</div>
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
