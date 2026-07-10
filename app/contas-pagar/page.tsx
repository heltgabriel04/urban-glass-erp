"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import { ordenarPorCodigoEstruturado } from "@/lib/planoContas";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import SearchInput from "@/components/ui/SearchInput";
import { useToast } from "@/components/ui/toast";
import { getContasBancarias } from "@/services/contasBancarias.service";
import { registrarBaixa, estornarBaixa, getBaixasPorLancamentos, calcularSaldo, excluirLancamento, editarLancamento, verificarDuplicado, criarAdiantamento, criarReembolso, getAdiantamentosDisponiveis, getHistorico, getUltimoPlanoContas, type LancamentoDuplicado, type AdiantamentoComSaldo, type VersaoLancamento } from "@/services/lancamentos.service";
import { getFornecedores } from "@/services/fornecedores.service";
import { getFormasPagamento } from "@/services/formasPagamento.service";
import { useEscToClose } from "@/components/ui/useEscToClose";
import { useGlobalShortcut } from "@/components/ui/useGlobalShortcut";
import { exportarExcel } from "@/lib/exportExcel";
import { parseLinhaDigitavel } from "@/lib/boleto";
import { getFiltrosSalvos, salvarFiltro, excluirFiltroSalvo, type FiltroSalvo } from "@/services/filtrosSalvos.service";
import { registrarRecente } from "@/lib/recentes";
import ActionMenu from "@/components/ui/ActionMenu";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import type { ContaBancaria, BaixaLancamento, Fornecedor, FormaPagamento } from "@/types";

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
  fornecedor_id: number | null;
  obs: string | null;
  plano_contas_id: number | null;
  plano_contas: PlanoItem | null;
  conta_id: number | null;
  created_at: string;
}

type TabFiltro = "todos" | "aberto" | "pago" | "vencido";

const EMPTY_FORM = {
  descricao: "", valor: 0, documento: "", fornecedor: "", fornecedor_id: null as number | null,
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

// Mesmo padrão de chip usado no resto do sistema (ex.: Fluxo de Caixa) —
// antes esta tela reimplementava as cores do zero com rgba solto, e
// "Vencido" saía vermelho aqui e amarelo em /fluxo pro mesmo conceito.
const STATUS_CHIP: Record<string, string> = {
  "Pago": "cg", "Parcial": "cy", "Vencido": "cr", "Em aberto": "cb",
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
  const [modal, setModal]         = useState<"add" | "edit" | "pagar" | "baixas" | "lote-pagar" | "excluir" | "adiantamento" | "reembolso" | null>(null);
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
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
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
  const [modalAdiantamento, setModalAdiantamento] = useState(false);
  const [formAdiant, setFormAdiant] = useState({ descricao: "", valor: 0, data: hoje(), fornecedorId: null as number | null, fornecedorNome: "", contaId: "" as string | number, obs: "" });
  const [reembolsarId, setReembolsarId] = useState<number | null>(null);
  const [formReembolso, setFormReembolso] = useState({ valor: 0, data: hoje(), obs: "" });
  const [historico, setHistorico] = useState<VersaoLancamento[]>([]);
  const [filtrosSalvos, setFiltrosSalvos] = useState<FiltroSalvo[]>([]);

  useEffect(() => { load(); loadFiltrosSalvos(); }, []);

  // Atalho vindo de outra tela (ex: Fluxo de Caixa "+ A Pagar") — abre o
  // formulário de novo lançamento direto, sem duplicar o formulário lá.
  useEffect(() => {
    if (searchParams.get("novo") === "1") {
      openAdd();
      router.replace("/contas-pagar");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFiltrosSalvos() {
    setFiltrosSalvos(await getFiltrosSalvos("contas-pagar"));
  }
  function aplicarFiltroSalvo(f: FiltroSalvo) {
    setTab((f.filtros.tab as TabFiltro) || "aberto");
    setBusca(f.filtros.busca ?? "");
  }
  async function handleSalvarFiltro() {
    const nome = window.prompt("Nome para este filtro (aba + busca atuais):");
    if (!nome?.trim()) return;
    const ok = await salvarFiltro("contas-pagar", nome.trim(), { tab, busca });
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
  useEscToClose(modal === "excluir", closeModal);
  useEscToClose(modal === "adiantamento", closeModal);
  useEscToClose(modal === "reembolso", closeModal);

  useGlobalShortcut("/", () => document.getElementById("busca-contas-pagar")?.focus(), modal === null);
  useGlobalShortcut("n", openAdd, modal === null);
  useGlobalShortcut("", salvarConta, modal === "add" || modal === "edit", { ctrlEnter: true });

  async function load() {
    setLoading(true);
    const [{ data: cs }, { data: pls }, cbs, forns, formasPg] = await Promise.all([
      supabase
        .from("lancamentos")
        .select("id, descricao, valor, status, vencimento, documento, dt_emissao, dt_pagamento, fornecedor, fornecedor_id, obs, plano_contas_id, conta_id, created_at, plano_contas(id, codigo_estruturado, descricao)")
        .eq("tipo", "Saída")
        .is("deletado_em", null)
        .order("vencimento", { ascending: true }),
      supabase.from("plano_contas").select("id, codigo_estruturado, descricao"),
      getContasBancarias(true),
      getFornecedores(true),
      getFormasPagamento(true),
    ]);
    const contasCarregadas = (cs ?? []) as unknown as Conta[];
    setContas(contasCarregadas);
    setPlanos(ordenarPorCodigoEstruturado((pls ?? []) as PlanoItem[]));
    setContasBancarias(cbs);
    setFornecedores(forns);
    setFormasPagamento(formasPg);
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
    setDuplicados([]);
    setMotivoRenegociacao("");
    setModal("add");
  }
  async function openEdit(c: Conta) {
    setForm({
      descricao: c.descricao, valor: Number(c.valor),
      documento: c.documento ?? "", fornecedor: c.fornecedor ?? "", fornecedor_id: c.fornecedor_id ?? null,
      vencimento: c.vencimento ?? "", dt_emissao: c.dt_emissao ?? "",
      obs: c.obs ?? "", plano_contas_id: c.plano_contas_id ?? "",
      conta_id: c.conta_id ?? "",
    });
    setEditId(c.id);
    setDuplicados([]);
    setMotivoRenegociacao("");
    setModal("edit");
  }
  function openDuplicar(c: Conta) {
    setForm({
      descricao: c.descricao, valor: Number(c.valor),
      documento: "", fornecedor: c.fornecedor ?? "", fornecedor_id: c.fornecedor_id ?? null,
      vencimento: "", dt_emissao: hoje(),
      obs: c.obs ?? "", plano_contas_id: c.plano_contas_id ?? "",
      conta_id: c.conta_id ?? "",
    });
    setEditId(null);
    setDuplicados([]);
    setMotivoRenegociacao("");
    setModal("add");
  }
  async function openPagar(c: Conta) {
    const { saldo } = calcularSaldo(c, baixasMap.get(c.id));
    setPagarId(c.id);
    setDtPgto(hoje());
    setValorBaixa(saldo > 0 ? saldo : Number(c.valor));
    setContaBaixaId("");
    setFormaPgtoBaixa("");
    setObsBaixa("");
    setMostrarExtrasBaixa(false);
    setValorJurosBaixa(0);
    setValorMultaBaixa(0);
    setValorDescontoBaixa(0);
    setAdiantamentoUsadoId("");
    setAdiantamentosDisponiveis(
      c.fornecedor_id ? await getAdiantamentosDisponiveis({ tipo: "Saída", fornecedorId: c.fornecedor_id }) : []
    );
    setModal("pagar");
  }
  function openAdiantamento() {
    setFormAdiant({ descricao: "", valor: 0, data: hoje(), fornecedorId: null, fornecedorNome: "", contaId: "", obs: "" });
    setModal("adiantamento");
  }
  function openReembolso(c: Conta) {
    setReembolsarId(c.id);
    setFormReembolso({ valor: Number(c.valor), data: hoje(), obs: "" });
    setModal("reembolso");
  }
  async function confirmarAdiantamento() {
    if (!formAdiant.descricao.trim() || formAdiant.valor <= 0) { toast("Informe descrição e valor", "err"); return; }
    setSalvando(true);
    const res = await criarAdiantamento({
      tipo: "Saída", descricao: formAdiant.descricao.trim(), valor: formAdiant.valor, data: formAdiant.data,
      fornecedorId: formAdiant.fornecedorId, contaId: formAdiant.contaId ? Number(formAdiant.contaId) : null,
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
    if (res) { toast("Reembolso registrado em Contas a Receber"); closeModal(); load(); }
    else toast("Erro ao registrar reembolso", "err");
  }
  async function openBaixas(c: Conta) {
    setBaixasVerId(c.id);
    setEstornandoBaixaId(null);
    setMotivoEstorno("");
    setHistorico(await getHistorico(c.id));
    setModal("baixas");
  }
  function openLotePagar() {
    setDtLote(hoje());
    setModal("lote-pagar");
  }
  function abrirExcluir(c: Conta) {
    const temBaixa = (baixasMap.get(c.id) ?? []).length > 0;
    if (!temBaixa) {
      if (!confirm("Excluir esta conta a pagar?")) return;
      excluirLancamento(c.id).then(ok => {
        if (ok) { toast("Conta excluída"); load(); } else toast("Erro ao excluir", "err");
      });
      return;
    }
    setExcluirId(c.id);
    setMotivoExclusao("");
    setModal("excluir");
  }
  function closeModal() {
    setModal(null); setEditId(null); setPagarId(null);
    setBaixasVerId(null); setEstornandoBaixaId(null); setMotivoEstorno("");
    setExcluirId(null); setMotivoExclusao(""); setDuplicados([]); setMotivoRenegociacao("");
    setReembolsarId(null); setAdiantamentoUsadoId("");
  }

  async function checarDuplicado(fornecedorId: number | null, documento: string) {
    if (modal !== "add" || !documento.trim() || !fornecedorId) { setDuplicados([]); return; }
    setDuplicados(await verificarDuplicado(documento, fornecedorId, "Saída"));
  }

  const contaEditando = editId ? contas.find(c => c.id === editId) ?? null : null;
  const baixasContaEditando = editId ? (baixasMap.get(editId) ?? []) : [];
  const precisaMotivoRenegociacao = modal === "edit" && baixasContaEditando.length > 0 && (
    form.vencimento !== (contaEditando?.vencimento ?? "") || form.valor !== Number(contaEditando?.valor ?? 0)
  );

  async function salvarConta() {
    if (!form.descricao.trim() || form.valor <= 0) return;
    if (precisaMotivoRenegociacao && !motivoRenegociacao.trim()) { toast("Informe o motivo da renegociação", "err"); return; }
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
      fornecedor_id: form.fornecedor_id,
      obs: form.obs.trim() || null,
      plano_contas_id: form.plano_contas_id ? Number(form.plano_contas_id) : null,
      conta_id: form.conta_id ? Number(form.conta_id) : null,
    };
    if (editId) {
      const ok = await editarLancamento({
        id: editId, updates: payload,
        motivoRenegociacao: precisaMotivoRenegociacao ? motivoRenegociacao.trim() : undefined,
      });
      setSalvando(false);
      if (ok) { toast("Conta atualizada"); closeModal(); load(); }
      else toast("Erro ao salvar — verifique o motivo da renegociação", "err");
      return;
    }
    const { error } = await supabase.from("lancamentos").insert([{ ...payload, status: "Pendente", pedido_id: null, cliente_id: null }] as never).select("id").single();
    setSalvando(false);
    if (error) { toast("Erro ao criar conta", "err"); return; }
    toast("Conta criada");
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
      toast("Erro ao registrar baixa", "err");
    }
  }

  function handleExportar() {
    const linhas = filtradas.map(c => {
      const { valorPago } = calcularSaldo(c, baixasMap.get(c.id));
      return [
        fmtData(c.dt_emissao), c.fornecedor ?? "", c.descricao, c.documento ?? "", c.plano_contas?.descricao ?? "",
        fmtData(c.vencimento), Number(c.valor), valorPago, fmtData(c.dt_pagamento), getStatusExibicao(c, valorPago),
      ];
    });
    exportarExcel("ContasPagar_UrbanGlass",
      ["Emissão", "Fornecedor", "Descrição", "Documento", "Plano de Contas", "Vencimento", "Valor", "Valor Pago", "Pagamento", "Status"],
      linhas);
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
      await excluirLancamento(id);
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

  async function confirmarExclusao() {
    if (!excluirId || !motivoExclusao.trim()) { toast("Informe o motivo da exclusão", "err"); return; }
    setSalvando(true);
    const ok = await excluirLancamento(excluirId, motivoExclusao.trim());
    setSalvando(false);
    if (ok) { toast("Conta excluída"); closeModal(); load(); }
    else toast("Erro ao excluir", "err");
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
        <button className="btn bg sm" onClick={handleExportar}>⇩ Exportar</button>
        <button className="btn bg sm" onClick={openAdiantamento}>+ Adiantamento</button>
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
          <SearchInput id="busca-contas-pagar" icon={false} className="fc" placeholder="Buscar por descrição, fornecedor ou documento... (atalho: /)"
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
                    <th style={{ width: "90px" }}>Emissão</th>
                    <th>Fornecedor / Descrição</th>
                    <th style={{ width: "130px" }}>Documento</th>
                    <th style={{ width: "200px" }}>Plano de Contas</th>
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
                        <td style={{ fontSize: "12px" }}>{fmtData(c.dt_emissao)}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{c.fornecedor ?? <span style={{ color: "var(--t3)" }}>—</span>}</div>
                          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>{c.descricao}</div>
                        </td>
                        <td className="mono" style={{ fontSize: "11px", color: "var(--t2)" }}>
                          {c.documento || <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>
                        <td style={{ fontSize: "11px" }}>
                          {c.plano_contas
                            ? <span><span style={{ color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontSize: "10px" }}>{c.plano_contas.codigo_estruturado}</span> {c.plano_contas.descricao}</span>
                            : <span style={{ color: "var(--t3)" }}>—</span>}
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
                          <span className={`chip ${STATUS_CHIP[stExibida]}`} style={{ whiteSpace: "nowrap" }}>
                            {stExibida}
                          </span>
                        </td>
                        <td>
                          <ActionMenu items={[
                            { label: "Registrar baixa", onClick: () => openPagar(c), hidden: saldo <= 0 },
                            { label: "Ver baixas / estornar", onClick: () => openBaixas(c), hidden: valorPago <= 0 },
                            { label: "Registrar reembolso", onClick: () => openReembolso(c), hidden: valorPago <= 0 },
                            { label: "Editar", onClick: () => openEdit(c) },
                            { label: "Duplicar", onClick: () => openDuplicar(c) },
                            { label: "Excluir", onClick: () => abrirExcluir(c), danger: true },
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
              <button className="mcl" onClick={closeModal} aria-label="Fechar">✕</button>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto", flex: 1 }}>
              {modal === "add" && (
                <div className="fg">
                  <label className="fl">Colar linha digitável do boleto (opcional)</label>
                  <input className="fc" placeholder="00190.00009 01234.567890 12345.678901 1 23456789012345"
                    onChange={e => {
                      const dados = parseLinhaDigitavel(e.target.value);
                      if (dados) {
                        setForm(f => ({ ...f, valor: dados.valor, vencimento: dados.vencimento ?? f.vencimento }));
                        toast(`Valor ${formatBRL(dados.valor)} e vencimento preenchidos a partir do boleto`);
                      }
                    }} />
                </div>
              )}
              <div className="fr">
                <div className="fg">
                  <label className="fl">Fornecedor</label>
                  <AutocompleteInput
                    options={fornecedores.map(f => ({ id: f.id, label: f.nome, sub: f.categoria || undefined }))}
                    value={form.fornecedor_id}
                    valueLabel={form.fornecedor}
                    allowFreeText
                    placeholder="Nome do fornecedor"
                    onChange={async (id, label) => {
                      setForm(f => ({ ...f, fornecedor_id: id, fornecedor: label }));
                      checarDuplicado(id, form.documento);
                      if (modal === "add" && id && !form.plano_contas_id) {
                        const sugestao = await getUltimoPlanoContas({ fornecedorId: id });
                        if (sugestao.planoContasId) {
                          setForm(f => ({
                            ...f,
                            plano_contas_id: f.plano_contas_id || sugestao.planoContasId || "",
                          }));
                        }
                      }
                    }}
                  />
                </div>
                <div className="fg">
                  <label className="fl">Documento</label>
                  <input className="fc" placeholder="NF 001, Boleto..." value={form.documento}
                    onChange={e => setForm(f => ({ ...f, documento: e.target.value }))}
                    onBlur={() => checarDuplicado(form.fornecedor_id, form.documento)} />
                </div>
              </div>

              {duplicados.length > 0 && (
                <div className="al al-w" style={{ fontSize: "12px" }}>
                  ⚠ Já existe {duplicados.length === 1 ? "um lançamento parecido" : `${duplicados.length} lançamentos parecidos`} desse fornecedor com esse documento: {duplicados.map(d => `${d.descricao} (${formatBRL(Number(d.valor))})`).join(", ")}. Confira antes de salvar — pode ser duplicado.
                </div>
              )}

              <div className="fg">
                <label className="fl">Descrição *</label>
                <input className="fc" placeholder="Descrição da conta" value={form.descricao}
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
              <button className="btn bp" onClick={salvarConta} disabled={salvando || !form.descricao.trim() || form.valor <= 0 || (precisaMotivoRenegociacao && !motivoRenegociacao.trim())}>
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
              <button className="mcl" onClick={closeModal} aria-label="Fechar">✕</button>
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
              {adiantamentosDisponiveis.length > 0 && (
                <div className="fg">
                  <label className="fl">Usar saldo de adiantamento</label>
                  <select className="fc" value={adiantamentoUsadoId} onChange={e => setAdiantamentoUsadoId(e.target.value)}>
                    <option value="">Não usar — pagar de conta bancária</option>
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
              <button className="mcl" onClick={closeModal} aria-label="Fechar">✕</button>
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
              <button className="mcl" onClick={closeModal} aria-label="Fechar">✕</button>
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
                      <span className="chip cr">Estornada</span>
                    ) : (
                      estornandoBaixaId !== b.id && (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button className="btn bg xs" onClick={() => {
                            window.open(`/api/lancamentos/baixas/${b.id}/gerar-comprovante`, "_blank");
                            registrarRecente({ tipo: "documento", id: `baixa-${b.id}`, label: `Comprovante · ${contas.find(c => c.id === baixasVerId)?.descricao ?? ""}`, href: `/api/lancamentos/baixas/${b.id}/gerar-comprovante` });
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
              <div className="mtit">Excluir conta a pagar</div>
              <button className="mcl" onClick={closeModal} aria-label="Fechar">✕</button>
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
              <div className="mtit">Registrar Adiantamento (a fornecedor)</div>
              <button className="mcl" onClick={closeModal} aria-label="Fechar">✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="fg">
                <label className="fl">Fornecedor</label>
                <AutocompleteInput
                  options={fornecedores.map(f => ({ id: f.id, label: f.nome }))}
                  value={formAdiant.fornecedorId}
                  valueLabel={formAdiant.fornecedorNome}
                  allowFreeText
                  placeholder="Nome do fornecedor"
                  onChange={(id, label) => setFormAdiant(f => ({ ...f, fornecedorId: id, fornecedorNome: label }))}
                />
              </div>
              <div className="fg">
                <label className="fl">Descrição *</label>
                <input className="fc" placeholder="Adiantamento p/ compra de material..." value={formAdiant.descricao}
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
                <label className="fl">Conta Bancária (de onde saiu)</label>
                <select className="fc" value={formAdiant.contaId} onChange={e => setFormAdiant(f => ({ ...f, contaId: e.target.value }))} style={{ margin: 0 }}>
                  <option value="">Não informado</option>
                  {contasBancarias.map(cb => <option key={cb.id} value={cb.id}>{cb.nome}</option>)}
                </select>
              </div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                Fica disponível pra abater de uma conta a pagar futura desse fornecedor.
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
              <button className="mcl" onClick={closeModal} aria-label="Fechar">✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                Referente a: {contas.find(c => c.id === reembolsarId)?.descricao} — vira um lançamento novo em Contas a Receber, sem reabrir este título.
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
