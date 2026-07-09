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
import { registrarBaixa, estornarBaixa, getBaixasPorLancamentos, calcularSaldo, excluirLancamento, editarLancamento, verificarDuplicadoCliente, criarAdiantamento, criarReembolso, getAdiantamentosDisponiveis, getHistorico, getUltimoPlanoContas, type LancamentoDuplicado, type AdiantamentoComSaldo, type VersaoLancamento } from "@/services/lancamentos.service";
import { getFormasPagamento } from "@/services/formasPagamento.service";
import { useEscToClose } from "@/components/ui/useEscToClose";
import { useGlobalShortcut } from "@/components/ui/useGlobalShortcut";
import { exportarExcel } from "@/lib/exportExcel";
import { getFiltrosSalvos, salvarFiltro, excluirFiltroSalvo, type FiltroSalvo } from "@/services/filtrosSalvos.service";
import { registrarRecente } from "@/lib/recentes";
import ActionMenu from "@/components/ui/ActionMenu";
import type { ContaBancaria, BaixaLancamento, FormaPagamento } from "@/types";

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
  created_at: string;
}

type TabFiltro = "todos" | "aberto" | "recebido" | "vencido";

const EMPTY_FORM = {
  descricao: "", valor: 0, documento: "", cliente_id: "" as string | number,
  vencimento: "", dt_emissao: "", obs: "", plano_contas_id: "" as string | number,
  conta_id: "" as string | number,
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
  const [modal, setModal]           = useState<"add" | "edit" | "receber" | "baixas" | "lote-receber" | "excluir" | "adiantamento" | "reembolso" | null>(null);
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
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [duplicados, setDuplicados] = useState<LancamentoDuplicado[]>([]);
  const [motivoRenegociacao, setMotivoRenegociacao] = useState("");
  const [mostrarExtrasBaixa, setMostrarExtrasBaixa] = useState(false);
  const [valorJurosBaixa, setValorJurosBaixa] = useState(0);
  const [valorMultaBaixa, setValorMultaBaixa] = useState(0);
  const [valorDescontoBaixa, setValorDescontoBaixa] = useState(0);
  const [excluirId, setExcluirId] = useState<number | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [adiantamentosDisponiveis, setAdiantamentosDisponiveis] = useState<AdiantamentoComSaldo[]>([]);
  const [adiantamentoUsadoId, setAdiantamentoUsadoId] = useState<string | number>("");
  const [formAdiant, setFormAdiant] = useState({ descricao: "", valor: 0, data: hoje(), clienteId: "" as string | number, contaId: "" as string | number, obs: "" });
  const [reembolsarId, setReembolsarId] = useState<number | null>(null);
  const [formReembolso, setFormReembolso] = useState({ valor: 0, data: hoje(), obs: "" });
  const [historico, setHistorico] = useState<VersaoLancamento[]>([]);
  const [filtrosSalvos, setFiltrosSalvos] = useState<FiltroSalvo[]>([]);

  useEffect(() => { load(); loadFiltrosSalvos(); }, []);

  // Atalho vindo de outra tela (ex: Fluxo de Caixa "+ A Receber") — abre o
  // formulário de novo lançamento direto, sem duplicar o formulário lá.
  useEffect(() => {
    if (searchParams.get("novo") === "1") {
      openAdd();
      router.replace("/contas-receber");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFiltrosSalvos() {
    setFiltrosSalvos(await getFiltrosSalvos("contas-receber"));
  }
  function aplicarFiltroSalvo(f: FiltroSalvo) {
    setTab((f.filtros.tab as TabFiltro) || "aberto");
    setBusca(f.filtros.busca ?? "");
  }
  async function handleSalvarFiltro() {
    const nome = window.prompt("Nome para este filtro (aba + busca atuais):");
    if (!nome?.trim()) return;
    const ok = await salvarFiltro("contas-receber", nome.trim(), { tab, busca });
    if (ok) { toast("Filtro salvo"); await loadFiltrosSalvos(); }
    else toast("Erro ao salvar filtro", "err");
  }
  async function handleExcluirFiltroSalvo(id: number) {
    const ok = await excluirFiltroSalvo(id);
    if (ok) setFiltrosSalvos(prev => prev.filter(f => f.id !== id));
  }

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
  useEscToClose(modal === "excluir", closeModal);
  useEscToClose(modal === "adiantamento", closeModal);
  useEscToClose(modal === "reembolso", closeModal);

  useGlobalShortcut("/", () => document.getElementById("busca-contas-receber")?.focus(), modal === null);
  useGlobalShortcut("n", openAdd, modal === null);
  useGlobalShortcut("", salvarRecebivel, modal === "add" || modal === "edit", { ctrlEnter: true });

  async function load() {
    setLoading(true);
    const [{ data: rs }, { data: pls }, { data: cls }, cbs, formasPg] = await Promise.all([
      supabase
        .from("lancamentos")
        .select("id, descricao, valor, status, vencimento, documento, dt_emissao, dt_pagamento, obs, pedido_id, cliente_id, plano_contas_id, conta_id, created_at, plano_contas(id, codigo_estruturado, descricao), clientes(id, nome)")
        .eq("tipo", "Entrada")
        .is("deletado_em", null)
        .order("vencimento", { ascending: true }),
      supabase.from("plano_contas").select("id, codigo_estruturado, descricao").order("codigo"),
      supabase.from("clientes").select("id, nome").order("nome"),
      getContasBancarias(true),
      getFormasPagamento(true),
    ]);
    const recebiveisCarregados = (rs ?? []) as unknown as Recebivel[];
    setRecebiveis(recebiveisCarregados);
    setPlanos((pls ?? []) as PlanoItem[]);
    setClientes((cls ?? []) as ClienteItem[]);
    setContasBancarias(cbs);
    setFormasPagamento(formasPg);
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
    setDuplicados([]);
    setMotivoRenegociacao("");
    setModal("add");
  }
  function openEdit(r: Recebivel) {
    setForm({
      descricao: r.descricao, valor: Number(r.valor),
      documento: r.documento ?? "", cliente_id: r.cliente_id ?? "",
      vencimento: r.vencimento ?? "", dt_emissao: r.dt_emissao ?? "",
      obs: r.obs ?? "", plano_contas_id: r.plano_contas_id ?? "",
      conta_id: r.conta_id ?? "",
    });
    setEditId(r.id);
    setDuplicados([]);
    setMotivoRenegociacao("");
    setModal("edit");
  }
  function openDuplicar(r: Recebivel) {
    setForm({
      descricao: r.descricao, valor: Number(r.valor),
      documento: "", cliente_id: r.cliente_id ?? "",
      vencimento: "", dt_emissao: hoje(),
      obs: r.obs ?? "", plano_contas_id: r.plano_contas_id ?? "",
      conta_id: r.conta_id ?? "",
    });
    setEditId(null);
    setDuplicados([]);
    setMotivoRenegociacao("");
    setModal("add");
  }
  async function openReceber(r: Recebivel) {
    const { saldo } = calcularSaldo(r, baixasMap.get(r.id));
    setReceberId(r.id);
    setDtRec(hoje());
    setValorBaixa(saldo > 0 ? saldo : Number(r.valor));
    setContaBaixaId("");
    setFormaPgtoBaixa("");
    setObsBaixa("");
    setMostrarExtrasBaixa(false);
    setValorJurosBaixa(0);
    setValorMultaBaixa(0);
    setValorDescontoBaixa(0);
    setAdiantamentoUsadoId("");
    setAdiantamentosDisponiveis(
      r.cliente_id ? await getAdiantamentosDisponiveis({ tipo: "Entrada", clienteId: r.cliente_id }) : []
    );
    setModal("receber");
  }
  function openAdiantamento() {
    setFormAdiant({ descricao: "", valor: 0, data: hoje(), clienteId: "", contaId: "", obs: "" });
    setModal("adiantamento");
  }
  function openReembolso(r: Recebivel) {
    setReembolsarId(r.id);
    setFormReembolso({ valor: Number(r.valor), data: hoje(), obs: "" });
    setModal("reembolso");
  }
  async function confirmarAdiantamento() {
    if (!formAdiant.descricao.trim() || formAdiant.valor <= 0) { toast("Informe descrição e valor", "err"); return; }
    setSalvando(true);
    const res = await criarAdiantamento({
      tipo: "Entrada", descricao: formAdiant.descricao.trim(), valor: formAdiant.valor, data: formAdiant.data,
      clienteId: formAdiant.clienteId ? Number(formAdiant.clienteId) : null, contaId: formAdiant.contaId ? Number(formAdiant.contaId) : null,
      obs: formAdiant.obs.trim() || null,
    });
    setSalvando(false);
    if (res) { toast("Adiantamento registrado"); closeModal(); load(); }
    else toast("Erro ao registrar adiantamento", "err");
  }
  async function confirmarReembolso() {
    if (!reembolsarId || formReembolso.valor <= 0) return;
    setSalvando(true);
    const res = await criarReembolso({ lancamentoOrigemId: reembolsarId, valor: formReembolso.valor, data: formReembolso.data, obs: formReembolso.obs.trim() || null });
    setSalvando(false);
    if (res) { toast("Reembolso registrado em Contas a Pagar"); closeModal(); load(); }
    else toast("Erro ao registrar reembolso", "err");
  }
  async function openBaixas(r: Recebivel) {
    setBaixasVerId(r.id);
    setEstornandoBaixaId(null);
    setMotivoEstorno("");
    setHistorico(await getHistorico(r.id));
    setModal("baixas");
  }
  function openLoteReceber() {
    setDtLote(hoje());
    setModal("lote-receber");
  }
  function abrirExcluir(r: Recebivel) {
    const temBaixa = (baixasMap.get(r.id) ?? []).length > 0;
    if (!temBaixa) {
      if (!confirm("Excluir este recebível?")) return;
      excluirLancamento(r.id).then(ok => {
        if (ok) { toast("Recebível excluído"); load(); } else toast("Erro ao excluir", "err");
      });
      return;
    }
    setExcluirId(r.id);
    setMotivoExclusao("");
    setModal("excluir");
  }
  function closeModal() {
    setModal(null); setEditId(null); setReceberId(null);
    setBaixasVerId(null); setEstornandoBaixaId(null); setMotivoEstorno("");
    setExcluirId(null); setMotivoExclusao(""); setDuplicados([]); setMotivoRenegociacao("");
    setReembolsarId(null); setAdiantamentoUsadoId("");
  }

  async function checarDuplicado(clienteId: string | number, documento: string) {
    if (modal !== "add" || !documento.trim() || !clienteId) { setDuplicados([]); return; }
    setDuplicados(await verificarDuplicadoCliente(documento, Number(clienteId)));
  }

  const recebivelEditando = editId ? recebiveis.find(r => r.id === editId) ?? null : null;
  const baixasRecebivelEditando = editId ? (baixasMap.get(editId) ?? []) : [];
  const precisaMotivoRenegociacao = modal === "edit" && baixasRecebivelEditando.length > 0 && (
    form.vencimento !== (recebivelEditando?.vencimento ?? "") || form.valor !== Number(recebivelEditando?.valor ?? 0)
  );

  async function salvarRecebivel() {
    if (!form.descricao.trim() || form.valor <= 0) return;
    if (precisaMotivoRenegociacao && !motivoRenegociacao.trim()) { toast("Informe o motivo da renegociação", "err"); return; }
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
    };
    if (editId) {
      const ok = await editarLancamento({
        id: editId, updates: payload,
        motivoRenegociacao: precisaMotivoRenegociacao ? motivoRenegociacao.trim() : undefined,
      });
      setSalvando(false);
      if (ok) { toast("Recebível atualizado"); closeModal(); load(); }
      else toast("Erro ao salvar — verifique o motivo da renegociação", "err");
      return;
    }
    const { error } = await supabase.from("lancamentos").insert([{ ...payload, status: "A Receber", pedido_id: null }] as never);
    setSalvando(false);
    if (error) { toast("Erro ao criar recebível", "err"); return; }
    toast("Recebível criado");
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
      contaId: adiantamentoUsadoId ? null : (contaBaixaId ? Number(contaBaixaId) : null),
      formaPgto: adiantamentoUsadoId ? "Adiantamento" : (formaPgtoBaixa.trim() || null),
      obs: obsBaixa.trim() || null,
      valorJuros: valorJurosBaixa || undefined,
      valorMulta: valorMultaBaixa || undefined,
      valorDesconto: valorDescontoBaixa || undefined,
      origemAdiantamentoId: adiantamentoUsadoId ? Number(adiantamentoUsadoId) : null,
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

  function handleExportar() {
    const linhas = filtrados.map(r => {
      const { valorPago } = calcularSaldo(r, baixasMap.get(r.id));
      return [
        fmtData(r.dt_emissao ?? r.created_at), r.clientes?.nome ?? "", r.descricao, r.pedido_id ?? r.documento ?? "", r.plano_contas?.descricao ?? "",
        fmtData(r.vencimento), Number(r.valor), valorPago, fmtData(r.dt_pagamento), getStatusExibicao(r, valorPago),
      ];
    });
    exportarExcel("ContasReceber_UrbanGlass",
      ["Emissão", "Cliente", "Descrição", "Pedido/Documento", "Plano de Contas", "Vencimento", "Valor", "Recebido", "Recebimento", "Status"],
      linhas);
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
      await excluirLancamento(id);
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

  async function confirmarExclusao() {
    if (!excluirId || !motivoExclusao.trim()) { toast("Informe o motivo da exclusão", "err"); return; }
    setSalvando(true);
    const ok = await excluirLancamento(excluirId, motivoExclusao.trim());
    setSalvando(false);
    if (ok) { toast("Recebível excluído"); closeModal(); load(); }
    else toast("Erro ao excluir", "err");
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
        <button className="btn bg sm" onClick={handleExportar}>⇩ Exportar</button>
        <button className="btn bg sm" onClick={openAdiantamento}>+ Adiantamento</button>
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

        {/* Filtros salvos */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
          {filtrosSalvos.map(f => (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", gap: "6px", fontSize: "11px",
              padding: "3px 4px 3px 10px", borderRadius: "99px", border: "1px solid var(--b2)", background: "var(--surf1)",
            }}>
              <button onClick={() => aplicarFiltroSalvo(f)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t2)", fontWeight: 600, padding: 0 }}>
                ☆ {f.nome}
              </button>
              <button onClick={() => handleExcluirFiltroSalvo(f.id)} title="Remover filtro" style={{
                background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "13px", lineHeight: 1, padding: "0 4px",
              }}>×</button>
            </div>
          ))}
          <button className="btn bg sm" onClick={handleSalvarFiltro}>☆ Salvar filtro atual</button>
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
          <SearchInput id="busca-contas-receber" icon={false} className="fc" placeholder="Buscar por descrição, cliente, pedido ou documento... (atalho: /)"
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
                    <th style={{ width: "90px" }}>Emissão</th>
                    <th>Cliente / Descrição</th>
                    <th style={{ width: "120px" }}>Pedido / Documento</th>
                    <th style={{ width: "200px" }}>Plano de Contas</th>
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
                        <td style={{ fontSize: "12px" }}>{fmtData(r.dt_emissao ?? r.created_at)}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{r.clientes?.nome ?? <span style={{ color: "var(--t3)" }}>—</span>}</div>
                          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>{r.descricao}</div>
                        </td>
                        <td className="mono" style={{ fontSize: "11px", color: "var(--acc)" }}>
                          {r.pedido_id
                            ? <span style={{ fontWeight: 700 }}>{r.pedido_id}</span>
                            : r.documento
                              ? <span style={{ color: "var(--t2)" }}>{r.documento}</span>
                              : <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>
                        <td style={{ fontSize: "11px" }}>
                          {r.plano_contas
                            ? <span><span style={{ color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontSize: "10px" }}>{r.plano_contas.codigo_estruturado}</span> {r.plano_contas.descricao}</span>
                            : <span style={{ color: "var(--t3)" }}>—</span>}
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
                            { label: "Registrar reembolso", onClick: () => openReembolso(r), hidden: valorRec <= 0 },
                            { label: "Editar", onClick: () => openEdit(r) },
                            { label: "Duplicar", onClick: () => openDuplicar(r) },
                            { label: "Excluir", onClick: () => abrirExcluir(r), danger: true },
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
                  <label className="fl">Cliente</label>
                  <select className="fc" value={form.cliente_id}
                    onChange={async e => {
                      const clienteId = e.target.value;
                      setForm(f => ({ ...f, cliente_id: clienteId }));
                      checarDuplicado(clienteId, form.documento as string);
                      if (modal === "add" && clienteId && !form.plano_contas_id) {
                        const sugestao = await getUltimoPlanoContas({ clienteId: Number(clienteId) });
                        if (sugestao.planoContasId) {
                          setForm(f => ({
                            ...f,
                            plano_contas_id: f.plano_contas_id || sugestao.planoContasId || "",
                          }));
                        }
                      }
                    }}>
                    <option value="">Selecione...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Documento</label>
                  <input className="fc" placeholder="NF, recibo..." value={form.documento as string}
                    onChange={e => setForm(f => ({ ...f, documento: e.target.value }))}
                    onBlur={() => checarDuplicado(form.cliente_id, form.documento as string)} />
                </div>
              </div>

              {duplicados.length > 0 && (
                <div className="al al-w" style={{ fontSize: "12px" }}>
                  ⚠ Já existe {duplicados.length === 1 ? "um lançamento parecido" : `${duplicados.length} lançamentos parecidos`} desse cliente com esse documento: {duplicados.map(d => `${d.descricao} (${formatBRL(Number(d.valor))})`).join(", ")}. Confira antes de salvar — pode ser duplicado.
                </div>
              )}

              <div className="fg">
                <label className="fl">Descrição *</label>
                <input className="fc" placeholder="Descrição do recebível" value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>

              {precisaMotivoRenegociacao && (
                <div className="al al-w" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "12px" }}>⚠ Este título já tem baixa registrada. Alterar vencimento ou valor exige o motivo da renegociação:</div>
                  <textarea className="fc" rows={2} placeholder="Motivo da renegociação *" value={motivoRenegociacao}
                    onChange={e => setMotivoRenegociacao(e.target.value)} style={{ margin: 0, resize: "vertical" }} />
                </div>
              )}

              <div className="fg">
                <label className="fl">Plano de Contas</label>
                <select className="fc" value={form.plano_contas_id}
                  onChange={e => setForm(f => ({ ...f, plano_contas_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {planos.map(p => <option key={p.id} value={p.id}>{p.codigo_estruturado} · {p.descricao}</option>)}
                </select>
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
              <button className="btn bp" onClick={salvarRecebivel} disabled={salvando || !form.descricao.trim() || form.valor <= 0 || (precisaMotivoRenegociacao && !motivoRenegociacao.trim())}>
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
              {adiantamentosDisponiveis.length > 0 && (
                <div className="fg">
                  <label className="fl">Usar saldo de adiantamento</label>
                  <select className="fc" value={adiantamentoUsadoId} onChange={e => setAdiantamentoUsadoId(e.target.value)}>
                    <option value="">Não usar — receber em conta bancária</option>
                    {adiantamentosDisponiveis.map(a => <option key={a.id} value={a.id}>{a.descricao} · saldo {formatBRL(a.saldo)}</option>)}
                  </select>
                </div>
              )}
              <div className="fg" style={{ display: adiantamentoUsadoId ? "none" : undefined }}>
                <label className="fl">Conta Bancária</label>
                <select className="fc" value={contaBaixaId} onChange={e => setContaBaixaId(e.target.value)}>
                  <option value="">Não informado</option>
                  {contasBancarias.map(cb => <option key={cb.id} value={cb.id}>{cb.nome}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Forma de Pagamento</label>
                <select className="fc" value={formaPgtoBaixa} onChange={e => setFormaPgtoBaixa(e.target.value)}>
                  <option value="">Não informado</option>
                  {formasPagamento.map(fp => <option key={fp.id} value={fp.nome}>{fp.nome}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Observação</label>
                <input className="fc" value={obsBaixa} onChange={e => setObsBaixa(e.target.value)} />
              </div>

              {!mostrarExtrasBaixa ? (
                <button type="button" className="btn bg xs" style={{ alignSelf: "flex-start" }} onClick={() => setMostrarExtrasBaixa(true)}>
                  + juros / multa / desconto
                </button>
              ) : (
                <div className="fr3">
                  <div className="fg">
                    <label className="fl">Juros</label>
                    <CurrencyInput value={valorJurosBaixa} onChange={setValorJurosBaixa} />
                  </div>
                  <div className="fg">
                    <label className="fl">Multa</label>
                    <CurrencyInput value={valorMultaBaixa} onChange={setValorMultaBaixa} />
                  </div>
                  <div className="fg">
                    <label className="fl">Desconto</label>
                    <CurrencyInput value={valorDescontoBaixa} onChange={setValorDescontoBaixa} />
                  </div>
                </div>
              )}
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
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button className="btn bg xs" onClick={() => {
                            window.open(`/api/lancamentos/baixas/${b.id}/gerar-comprovante`, "_blank");
                            registrarRecente({ tipo: "documento", id: `baixa-${b.id}`, label: `Comprovante · ${recebiveis.find(r => r.id === baixasVerId)?.descricao ?? ""}`, href: `/api/lancamentos/baixas/${b.id}/gerar-comprovante` });
                          }}>
                            Comprovante
                          </button>
                          <button className="btn bg xs" onClick={() => { setEstornandoBaixaId(b.id); setMotivoEstorno(""); }} style={{ color: "var(--err)" }}>
                            Estornar
                          </button>
                        </div>
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

              {historico.length > 0 && (
                <>
                  <div className="ct" style={{ marginTop: "10px" }}>Histórico de alterações</div>
                  {historico.map(v => (
                    <div key={v.id} style={{ fontSize: "11px", color: "var(--t3)", padding: "6px 0", borderTop: "1px solid var(--b1)" }}>
                      {fmtData(v.alterado_em.split("T")[0])} {v.alterado_em.split("T")[1]?.slice(0,5)} · {v.alterado_por ?? "sistema"} — valor era {formatBRL(Number(v.snapshot.valor))}, vencimento {fmtData(v.snapshot.vencimento as string | null)}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={closeModal}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EXCLUSÃO (título já tem baixa — exige motivo) ── */}
      {modal === "excluir" && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "400px" }}>
            <div className="mhd">
              <div className="mtit">Excluir recebível</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div className="al al-w" style={{ fontSize: "12px" }}>
                ⚠ Este título já tem baixa registrada. A conta não é apagada — fica marcada como excluída, com o histórico preservado.
              </div>
              <div className="fg">
                <label className="fl">Motivo da exclusão *</label>
                <textarea className="fc" rows={3} value={motivoExclusao} onChange={e => setMotivoExclusao(e.target.value)} style={{ margin: 0, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={closeModal}>Cancelar</button>
              <button className="btn bw" onClick={confirmarExclusao} disabled={salvando || !motivoExclusao.trim()}>
                {salvando ? "Excluindo..." : "Confirmar exclusão"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ADIANTAMENTO ── */}
      {modal === "adiantamento" && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "480px" }}>
            <div className="mhd">
              <div className="mtit">Registrar Adiantamento (de cliente)</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="fg">
                <label className="fl">Cliente</label>
                <select className="fc" value={formAdiant.clienteId} onChange={e => setFormAdiant(f => ({ ...f, clienteId: e.target.value }))} style={{ margin: 0 }}>
                  <option value="">Selecione...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Descrição *</label>
                <input className="fc" placeholder="Adiantamento p/ pedido futuro..." value={formAdiant.descricao}
                  onChange={e => setFormAdiant(f => ({ ...f, descricao: e.target.value }))} style={{ margin: 0 }} />
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Valor *</label>
                  <CurrencyInput value={formAdiant.valor} onChange={v => setFormAdiant(f => ({ ...f, valor: v }))} />
                </div>
                <div className="fg">
                  <label className="fl">Data</label>
                  <DateInput value={formAdiant.data} onChange={v => setFormAdiant(f => ({ ...f, data: v }))} />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Conta Bancária (onde entrou)</label>
                <select className="fc" value={formAdiant.contaId} onChange={e => setFormAdiant(f => ({ ...f, contaId: e.target.value }))} style={{ margin: 0 }}>
                  <option value="">Não informado</option>
                  {contasBancarias.map(cb => <option key={cb.id} value={cb.id}>{cb.nome}</option>)}
                </select>
              </div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                Fica disponível pra abater de um recebível futuro desse cliente.
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={closeModal}>Cancelar</button>
              <button className="btn bp" onClick={confirmarAdiantamento} disabled={salvando || !formAdiant.descricao.trim() || formAdiant.valor <= 0}>
                {salvando ? "Salvando..." : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL REEMBOLSO ── */}
      {modal === "reembolso" && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="mod" style={{ width: "420px" }}>
            <div className="mhd">
              <div className="mtit">Registrar Reembolso</div>
              <button className="mcl" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                Referente a: {recebiveis.find(r => r.id === reembolsarId)?.descricao} — vira um lançamento novo em Contas a Pagar, sem reabrir este título.
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Valor do Reembolso *</label>
                  <CurrencyInput value={formReembolso.valor} onChange={v => setFormReembolso(f => ({ ...f, valor: v }))} />
                </div>
                <div className="fg">
                  <label className="fl">Data</label>
                  <DateInput value={formReembolso.data} onChange={v => setFormReembolso(f => ({ ...f, data: v }))} />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Observação</label>
                <input className="fc" value={formReembolso.obs} onChange={e => setFormReembolso(f => ({ ...f, obs: e.target.value }))} style={{ margin: 0 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={closeModal}>Cancelar</button>
              <button className="btn bp" onClick={confirmarReembolso} disabled={salvando || formReembolso.valor <= 0}>
                {salvando ? "Salvando..." : "Registrar reembolso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
