"use client";

import { useEffect, useId, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidoById, avancarStatusPedido, recalcularRecebido, updatePedido, getCreditoCliente, atualizarCreditoCliente, utilizarCreditoEmPedido, uploadRomaneioAssinado, deleteRomaneioAssinado, uploadNfe, deleteNfe, uploadBoleto, deleteBoleto, uploadComprovantePagamento, deleteComprovantePagamento } from "@/services/pedidos.service";
import { getLancamentosPorPedido, deletarLancamento, createLancamento, updateLancamento } from "@/services/financeiro.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import { createNaoConformidade, getNaoConformidadesPorPedido, uploadFotosNC, updateNaoConformidade } from "@/services/qualidade.service";
import { getRetiradasPorPedido, calcularSaldoItens } from "@/services/retiradas.service";
import { getObservacoesPorPedido, createObservacao, deletarObservacao } from "@/services/observacoes.service";
import { formatBRL, formatDate, formatDuracao, medidaReal } from "@/lib/formatters";
import { ALIQ_IPI_PEDIDO, calcularValorIpi, valorComIpi } from "@/lib/pedidoIpi";
import { registrarRecente } from "@/lib/recentes";
import PedidoTabs from "@/components/pedidos/PedidoTabs";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { Pedido, Lancamento, Vendedor, NaoConformidade, NaoConformidadeInsert, TipoNC, GravidadeNC, StatusNaoConformidade, RetiradaPedido, PedidoObservacao } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";
import { supabase } from "@/lib/supabase/client";

const TIPOS_NC: TipoNC[] = [
  "Quebra de vidro","Medida incorreta","Corte errado","Lapidação incorreta",
  "Furo em posição errada","Mancha ou risco","Peça trincada","Material com defeito",
  "Erro de separação","Erro de conferência","Retrabalho necessário",
  "Perda de matéria-prima","Perda operacional","Outro",
];

const GRAVIDADE_COR_NC: Record<GravidadeNC, string> = {
  Baixa:"var(--ok)", Média:"var(--warn)", Alta:"#f97316", Crítica:"var(--err)",
};

const STATUS_COR_NC: Record<StatusNaoConformidade, string> = {
  "Aberta":"var(--warn)","Em Análise":"var(--acc2)","Aguardando Correção":"#f97316","Resolvida":"var(--ok)","Cancelada":"var(--t3)",
};

const CHIP: Record<string, string> = {
  "Aguardando otimização":   "chip cy",
  "Em Produção – Corte":     "chip cp",
  "Qualidade (Corte)":       "chip cg",
  "Em Produção – Lapidação": "chip co",
  "Qualidade (Lapidação)":   "chip cg",
  "Separação":               "chip cb",
  "Finalizado":              "chip cg",
  "Entregue":                "chip cg",
  "Cancelado":               "chip cr",
};

const FLUXO = [
  "Aguardando otimização",
  "Em Produção – Corte",
  "Qualidade (Corte)",
  "Em Produção – Lapidação",
  "Qualidade (Lapidação)",
  "Separação",
  "Finalizado",
  "Entregue",
];

const CHAPAS_DIMS = [
  { w: 3300, h: 2250 }, { w: 2250, h: 3300 },
  { w: 3660, h: 2140 }, { w: 2140, h: 3660 },
  { w: 2150, h: 3660 }, { w: 3660, h: 2150 },
];

const CONTAS = ["ZRS","Banco Inter Urban Glass","Banco Inter Maxi Build","Caixa Econômica"];

function isChapaInteira(largura: number, altura: number): boolean {
  return CHAPAS_DIMS.some(c =>
    Math.abs(largura - c.w) < 50 && Math.abs(altura - c.h) < 50
  );
}

function arredondarParaMultiplo50(v: number): number {
  if (v % 50 === 0) return v;
  return Math.ceil(v / 50) * 50;
}

function hoje() { return new Date().toISOString().split("T")[0]; }

function duracaoEtapa(history: { status: string; desde: string }[], step: string): string | null {
  const idx = history.findIndex(h => h.status === step);
  if (idx === -1) return null;
  const from = new Date(history[idx].desde).getTime();
  const to   = idx < history.length - 1 ? new Date(history[idx + 1].desde).getTime() : Date.now();
  return formatDuracao(to - from);
}

function addMeses(dateStr: string, meses: number): string {
  if (!dateStr || dateStr.length < 10) return "";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + meses);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

interface ParcelaEdit {
  data: string;
  valor: number;
  lancamento_id?: number;
}

interface ItemEdit {
  id: number;
  produto_nome: string;
  largura: number;
  altura: number;
  quantidade: number;
  valor_m2: number;
  lapidacao: number;
  vidro_cliente: boolean;
}

interface PagamentoParcela {
  lancId: number;
  valorOriginal: number;
  valorDigitado: number;
  dataPagamento: string;
  conta: string;
  formaPgto: string;
  marcando: boolean;
}

// Estado de edição inline para lançamentos pagos
interface EdicaoPago {
  valor: number;
  data: string;
  conta: string;
  formaPgto: string;
  salvando: boolean;
}

export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";
  const { toast } = useToast();
  const confirm = useConfirm();
  const vendedorFieldId = useId();

  const [pedido, setPedido]             = useState<Pedido | null>(null);
  const [lancamentos, setLancamentos]   = useState<Lancamento[]>([]);
  const [otimizacoes, setOtimizacoes]   = useState<HistoricoOtimizador[]>([]);
  const [retiradas, setRetiradas]       = useState<RetiradaPedido[]>([]);
  const [observacoes, setObservacoes]   = useState<PedidoObservacao[]>([]);
  const [novaObs, setNovaObs]           = useState("");
  const [salvandoObs, setSalvandoObs]   = useState(false);
  const [clientes, setClientes]         = useState<{ id: number; nome: string }[]>([]);
  const [vendedores, setVendedores]     = useState<Pick<Vendedor, "id" | "nome" | "comissao_pct">[]>([]);
  const [creditoCliente, setCreditoCliente] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [salvando, setSalvando]         = useState(false);
  const [uploadandoRomaneio, setUploadandoRomaneio] = useState(false);
  const [uploadandoNfe,     setUploadandoNfe]     = useState(false);
  const [uploadandoBoleto,  setUploadandoBoleto]  = useState(false);
  const [uploadandoComprovante, setUploadandoComprovante] = useState(false);
  const [abrirRomaneio,     setAbrirRomaneio]     = useState(false);
  const [abrirNfe,          setAbrirNfe]          = useState(false);
  const [abrirBoleto,       setAbrirBoleto]       = useState(false);
  const [abrirComprovante,  setAbrirComprovante]  = useState(false);
  const [abrirObs,          setAbrirObs]          = useState(false);
  const [abrirItens,        setAbrirItens]        = useState(true);
  const [abrirInformacoes,  setAbrirInformacoes]  = useState(false);
  const [abrirFinanceiro,   setAbrirFinanceiro]   = useState(false);
  const [abrirDocumentos,   setAbrirDocumentos]   = useState(false);

  // Qualidade
  const [ncs, setNcs]               = useState<NaoConformidade[]>([]);
  const [modalNC, setModalNC]       = useState(false);
  const [ncForm, setNcForm]         = useState<Partial<NaoConformidadeInsert>>({
    tipo: "Quebra de vidro", gravidade: "Média", status: "Aberta", descricao: "", obs: null,
  });
  const [fotosNC, setFotosNC]       = useState<File[]>([]);

  const [editando, setEditando]         = useState(false);
  const [editForm, setEditForm]         = useState({
    cliente_id: 0, vendedor_id: null as number | null,
    dt_pedido: "", dt_retirada: "",
    forma_pgto: "", conta: "", parcelas: 1, obs: "",
  });
  const [editParcelas, setEditParcelas] = useState<ParcelaEdit[]>([]);
  const [editItens, setEditItens]       = useState<ItemEdit[]>([]);

  // Estado de pagamento por parcela (A Receber)
  const [pagamentos, setPagamentos]     = useState<Record<number, PagamentoParcela>>({});

  // Estado de edição inline dos lançamentos já pagos
  const [editandoPago, setEditandoPago] = useState<Record<number, EdicaoPago>>({});


  useEffect(() => { load(); }, [id]);

  function handlePrintRomaneio() {
    if (!pedido) return;
    const cliente = pedido.clientes?.nome ?? "Cliente";
    const data = pedido.dt_pedido
      ? new Date(pedido.dt_pedido + "T00:00:00").toLocaleDateString("pt-BR").replace(/\//g, "-")
      : "";
    const tituloOriginal = document.title;
    document.title = `${cliente} - ${data}`;
    window.print();
    setTimeout(() => { document.title = tituloOriginal; }, 2000);
  }

  useEffect(() => {
    if (autoPrint && !loading && pedido) {
      const timer = setTimeout(() => { handlePrintRomaneio(); }, 800);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, loading, pedido]);

  async function load() {
    setLoading(true);
    const [data, lancs, otims, clis, vends, ncsData, rets, obsData] = await Promise.all([
      getPedidoById(id),
      getLancamentosPorPedido(id),
      getOtimizacoesPorPedido(id),
      supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome").then(r => r.data ?? []),
      supabase.from("vendedores").select("id, nome, comissao_pct").eq("ativo", true).order("nome").then(r => r.data ?? []),
      getNaoConformidadesPorPedido(id),
      getRetiradasPorPedido(id),
      getObservacoesPorPedido(id),
    ]);
    setPedido(data);
    if (data) {
      registrarRecente({ tipo: "pedido", id: data.id, label: `Pedido ${data.id}`, sublabel: data.clientes?.nome, href: `/pedidos/${data.id}` });
    }
    setLancamentos(lancs);
    setOtimizacoes(otims);
    setClientes(clis as { id: number; nome: string }[]);
    setVendedores(vends as Pick<Vendedor, "id" | "nome" | "comissao_pct">[]);
    setNcs(ncsData);
    setRetiradas(rets);
    setObservacoes(obsData);
    if (data?.cliente_id) {
      const cred = await getCreditoCliente(data.cliente_id);
      setCreditoCliente(cred);
    }
    const initPag: Record<number, PagamentoParcela> = {};
    for (const l of lancs) {
      if (l.status === "A Receber") {
        initPag[l.id] = {
          lancId: l.id,
          valorOriginal: Number(l.valor),
          valorDigitado: 0,
          dataPagamento: hoje(),
          conta: l.conta || data?.conta || "",
          formaPgto: l.forma_pgto || data?.forma_pgto || "",
          marcando: false,
        };
      }
    }
    setPagamentos(initPag);
    setEditandoPago({});
    setLoading(false);
  }

  function abrirEdicao() {
    if (!pedido) return;
    setEditForm({
      cliente_id:  pedido.cliente_id,
      vendedor_id: pedido.vendedor_id ?? null,
      dt_pedido:   pedido.dt_pedido,
      dt_retirada: pedido.dt_retirada ?? "",
      forma_pgto:  pedido.forma_pgto ?? "",
      conta:       pedido.conta ?? "",
      parcelas:    pedido.parcelas ?? 1,
      obs:         pedido.obs ?? "",
    });
    const aReceber = lancamentos.filter(l => l.status === "A Receber").sort((a, b) =>
      (a.vencimento ?? "").localeCompare(b.vencimento ?? "")
    );
    if (aReceber.length > 0) {
      setEditParcelas(aReceber.map(l => ({ data: l.vencimento ?? "", valor: l.valor, lancamento_id: l.id })));
    } else {
      const n = pedido.parcelas ?? 1;
      const valorParcela = parseFloat((valorComIpi(pedido) / n).toFixed(2));
      const datas = pedido.datas_pgto ?? [];
      setEditParcelas(Array.from({ length: n }, (_, i) => ({ data: datas[i] ?? "", valor: valorParcela })));
    }
    setEditItens((pedido.itens_pedido ?? []).map((item: any) => ({
      id: item.id,
      produto_nome: item.produto_nome,
      largura: item.largura,
      altura: item.altura,
      quantidade: item.quantidade,
      valor_m2: Number(item.valor_m2),
      lapidacao: Number(item.lapidacao ?? 0),
      vidro_cliente: Boolean(item.vidro_cliente),
    })));
    setEditando(true);
  }

  function handleEditParcelas(n: number) {
    setEditForm(f => ({ ...f, parcelas: n }));
    const primeiraData = editParcelas[0]?.data ?? "";
    setEditParcelas(Array.from({ length: n }, (_, i) => ({
      data: primeiraData ? (i === 0 ? primeiraData : addMeses(primeiraData, i)) : "",
      valor: pedido ? parseFloat((valorComIpi(pedido) / n).toFixed(2)) : 0,
    })));
  }

  function handlePrimeiraDtEdit(data: string) {
    setEditParcelas(prev => prev.map((p, i) => ({
      ...p, data: !data ? "" : (i === 0 ? data : addMeses(data, i)),
    })));
  }

  function calcM2Item(item: ItemEdit): number {
    const l = arredondarParaMultiplo50(item.largura);
    const a = arredondarParaMultiplo50(item.altura);
    return (l / 1000) * (a / 1000) * item.quantidade;
  }

  function calcSubtotalItem(item: ItemEdit): number {
    const m2 = calcM2Item(item);
    return m2 * item.valor_m2 + item.lapidacao * m2;
  }

  function updEditItem(idx: number, field: keyof ItemEdit, value: number | boolean) {
    setEditItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const valorTotalEditado = editItens.reduce((a, i) => a + calcSubtotalItem(i), 0);
  const valorComIpiEditado = valorTotalEditado + (pedido?.tem_ipi ? calcularValorIpi(valorTotalEditado) : 0);
  const m2TotalEditado    = editItens.reduce((a, i) => a + calcM2Item(i), 0);

  async function salvarEdicao() {
    if (!pedido) return;

    // C3: pedidos finalizados não podem ser editados
    if (pedido.status === "Entregue" || pedido.status === "Cancelado") {
      toast(`Pedido ${pedido.status.toLowerCase()} não pode ser editado`, "err");
      return;
    }

    // C1: garante que datas e valores de pagamento ficam alinhados
    const parcelasValidas = editParcelas.filter(p => p.data && p.valor > 0);
    if (parcelasValidas.length === 0 && editParcelas.length > 0) {
      toast("Informe data e valor em pelo menos uma parcela", "err");
      return;
    }

    setSalvando(true);

    const result = await updatePedido(pedido.id, {
      cliente_id:   editForm.cliente_id,
      vendedor_id:  editForm.vendedor_id,
      dt_pedido:    editForm.dt_pedido,
      dt_retirada:  editForm.dt_retirada || null,
      forma_pgto:   editForm.forma_pgto,
      conta:        editForm.conta,
      parcelas:     editForm.parcelas,
      obs:          editForm.obs,
      datas_pgto:   parcelasValidas.map(p => p.data),
      valores_pgto: parcelasValidas.map(p => p.valor),
      valor_total:  parseFloat(valorTotalEditado.toFixed(2)),
      valor_ipi:    pedido.tem_ipi ? calcularValorIpi(valorTotalEditado) : 0,
      m2_total:     parseFloat(m2TotalEditado.toFixed(4)),
    });

    if (!result) { toast("Erro ao salvar pedido", "err"); setSalvando(false); return; }

    for (const item of editItens) {
      const m2 = calcM2Item(item);
      const subtotal = calcSubtotalItem(item);
      await supabase.from("itens_pedido").update({
        largura: item.largura, altura: item.altura,
        quantidade: item.quantidade, valor_m2: item.valor_m2,
        lapidacao: item.lapidacao,
        vidro_cliente: item.vidro_cliente,
        m2: parseFloat(m2.toFixed(4)),
        subtotal: parseFloat(subtotal.toFixed(2)),
      }).eq("id", item.id);
    }

    const aReceber = lancamentos.filter(l => l.status === "A Receber");
    for (const l of aReceber) {
      const ok = await deletarLancamento(l.id);
      if (!ok) { toast("Erro ao remover lançamento", "err"); setSalvando(false); return; }
    }
    for (let i = 0; i < editParcelas.length; i++) {
      const p = editParcelas[i];
      if (!p.data || p.valor <= 0) continue;
      await createLancamento({
        tipo: "Entrada",
        descricao: editForm.parcelas === 1 ? `Recebimento · ${pedido.id}` : `Parcela ${i + 1}/${editForm.parcelas} · ${pedido.id}`,
        valor: p.valor, status: "A Receber", vencimento: p.data,
        pedido_id: pedido.id, cliente_id: editForm.cliente_id,
        conta: editForm.conta || CONTAS[0],
      });
    }
    await recalcularRecebido(pedido.id);

    const lancComissao = lancamentos.find(
      l => l.tipo === "Saída" && (l as any).vendedor_id != null
    );
    const novoVendedorId = editForm.vendedor_id;
    const vendedor = novoVendedorId ? vendedores.find(v => v.id === novoVendedorId) : null;
    const valorComissao = vendedor
      ? parseFloat((valorTotalEditado * vendedor.comissao_pct / 100).toFixed(2))
      : 0;

    if (lancComissao) {
      if (!novoVendedorId) {
        await supabase.from("lancamentos").delete().eq("id", lancComissao.id);
      } else {
        await supabase.from("lancamentos").update({
          descricao:   `Comissão — ${vendedor!.nome} — Pedido ${pedido.id}`,
          valor:        valorComissao,
          vendedor_id:  novoVendedorId,
        } as never).eq("id", lancComissao.id);
      }
    } else if (novoVendedorId && vendedor && valorComissao > 0) {
      await supabase.from("lancamentos").insert([{
        tipo:        "Saída",
        descricao:   `Comissão — ${vendedor.nome} — Pedido ${pedido.id}`,
        valor:        valorComissao,
        status:       "Pendente",
        vencimento:   null,
        pedido_id:    pedido.id,
        cliente_id:   null,
        vendedor_id:  novoVendedorId,
      } as never]);
    }

    toast("Pedido atualizado");
    setSalvando(false);
    setEditando(false);
    await load();
  }

  async function handleMarcarPago(lancId: number) {
    if (!pedido) return;
    const pag = pagamentos[lancId];
    if (!pag) return;

    setPagamentos(prev => ({ ...prev, [lancId]: { ...prev[lancId], marcando: true } }));

    const valorPagar = pag.valorDigitado > 0 ? pag.valorDigitado : pag.valorOriginal;
    const dataPgto   = pag.dataPagamento || hoje();

    await updateLancamento(lancId, {
      status: "Pago",
      valor: valorPagar,
      vencimento: dataPgto,
      conta: pag.conta || undefined,
      forma_pgto: pag.formaPgto || undefined,
    });

    await recalcularRecebido(pedido.id);

    const restante = parseFloat((pag.valorOriginal - valorPagar).toFixed(2));
    if (restante > 0.005) {
      const lancOriginal = lancamentos.find(l => l.id === lancId);
      await createLancamento({
        tipo: "Entrada",
        descricao: lancOriginal?.descricao ?? `Recebimento · ${pedido.id}`,
        valor: restante,
        status: "A Receber",
        vencimento: dataPgto,
        pedido_id: pedido.id,
        cliente_id: pedido.cliente_id,
      });
      toast(`✓ ${formatBRL(valorPagar)} recebido · Saldo ${formatBRL(restante)} gerado`);
    } else {
      const excedente = Math.max(0, valorPagar - pag.valorOriginal);
      if (excedente > 0.005 && pedido.cliente_id) {
        const creditoAtual = await getCreditoCliente(pedido.cliente_id);
        await atualizarCreditoCliente(pedido.cliente_id, creditoAtual + excedente);
      }
      toast(`✓ ${formatBRL(valorPagar)} registrado`);
    }

    await load();
  }

  async function handleDeletarLancamento(lancId: number) {
    if (!pedido) return;
    const lanc = lancamentos.find(l => l.id === lancId);
    if (!lanc) return;

    // Lançamento já pago: desfaz o recebimento consolidando com eventuais
    // saldos parciais gerados automaticamente (mesma descrição, mesmo pedido)
    if (lanc.status === "Pago") {
      if (!(await confirm("Desfazer este recebimento? O lançamento voltará ao valor original."))) return;
      setSalvando(true);

      // Restos "A Receber" gerados pelo pagamento parcial (mesma descrição)
      const restos = lancamentos.filter(l =>
        l.id !== lancId &&
        l.status === "A Receber" &&
        l.pedido_id === pedido.id &&
        l.descricao === lanc.descricao
      );
      const valorConsolidado = parseFloat((lanc.valor + restos.reduce((a, l) => a + l.valor, 0)).toFixed(2));

      // Remove os restos parciais
      for (const r of restos) await deletarLancamento(r.id);

      // Restaura o lançamento original com o valor total consolidado
      const ok = await updateLancamento(lancId, { status: "A Receber", conta: null, valor: valorConsolidado });
      if (!ok) { toast("Erro ao desfazer recebimento", "err"); setSalvando(false); return; }
      await recalcularRecebido(pedido.id);
      toast("Recebimento desfeito");
      await load();
      setSalvando(false);
      return;
    }

    if (!(await confirm("Remover esta parcela?", { perigo: true }))) return;
    setSalvando(true);
    const ok = await deletarLancamento(lancId);
    if (!ok) { toast("Erro ao remover lançamento", "err"); setSalvando(false); return; }
    await recalcularRecebido(pedido.id);
    toast("Parcela removida");
    await load();
    setSalvando(false);
  }

  // Abre edição inline de um lançamento pago
  function abrirEdicaoPago(l: Lancamento) {
    setEditandoPago(prev => ({
      ...prev,
      [l.id]: {
        valor: l.valor,
        data: l.vencimento ?? "",
        conta: l.conta ?? "",
        formaPgto: l.forma_pgto ?? "",
        salvando: false,
      },
    }));
  }

  // Cancela edição inline de um lançamento pago
  function cancelarEdicaoPago(lancId: number) {
    setEditandoPago(prev => {
      const next = { ...prev };
      delete next[lancId];
      return next;
    });
  }

  // Salva edição inline de um lançamento pago
   async function handleSalvarEdicaoPago(lancId: number) {
    const ed = editandoPago[lancId];
    if (!ed || !pedido) return;
    setEditandoPago(prev => ({ ...prev, [lancId]: { ...prev[lancId], salvando: true } }));

    const atualizado = await updateLancamento(lancId, {
      valor: ed.valor,
      vencimento: ed.data,
      conta: ed.conta || null,
      forma_pgto: ed.formaPgto || null,
    });

    if (!atualizado) {
      toast("Erro ao salvar", "err");
      setEditandoPago(prev => ({ ...prev, [lancId]: { ...prev[lancId], salvando: false } }));
      return;
    }

    await recalcularRecebido(pedido.id);
    toast("✓ Pagamento atualizado");
    cancelarEdicaoPago(lancId);
    await load();
  }

  async function handleAdicionarParcela() {
    if (!pedido) return;
    const totalAReceber = parcelasAReceber.reduce((a, l) => a + l.valor, 0);
    const restante = parseFloat((Math.max(0, valorComIpi(pedido) - pedido.valor_recebido - totalAReceber)).toFixed(2));
    await createLancamento({
      tipo: "Entrada",
      descricao: `Recebimento · ${pedido.id}`,
      valor: restante > 0 ? restante : 0,
      status: "A Receber",
      vencimento: hoje(),
      pedido_id: pedido.id,
      cliente_id: pedido.cliente_id,
    });
    await load();
    toast("Parcela adicionada");
  }

  async function handleSalvarNC() {
    if (!pedido) return;
    if (!ncForm.descricao?.trim()) { toast("Descrição obrigatória", "warn"); return; }
    setSalvando(true);
    const payload: NaoConformidadeInsert = {
      codigo: "",
      pedido_id: pedido.id,
      cliente_id: pedido.cliente_id,
      produto_nome: ncForm.produto_nome ?? null,
      item_pedido_id: null,
      etapa: pedido.status,
      tipo: ncForm.tipo as TipoNC ?? "Outro",
      gravidade: ncForm.gravidade as GravidadeNC ?? "Média",
      status: "Aberta",
      descricao: ncForm.descricao!,
      obs: ncForm.obs ?? null,
      fotos_urls: null,
      registrado_por: null,
      responsavel_analise: ncForm.responsavel_analise ?? null,
      dt_ocorrencia: new Date().toISOString(),
      dt_resolucao: null,
    };
    const result = await createNaoConformidade(payload);
    if (result) {
      if (fotosNC.length > 0) {
        const urls = await uploadFotosNC(result.id, fotosNC);
        if (urls.length > 0) await updateNaoConformidade(result.id, { fotos_urls: urls });
      }
      toast(`${result.codigo} registrada`);
      setModalNC(false);
      setNcForm({ tipo: "Quebra de vidro", gravidade: "Média", status: "Aberta", descricao: "", obs: null });
      setFotosNC([]);
      await load();
    } else {
      toast("Erro ao registrar NC", "err");
    }
    setSalvando(false);
  }

  async function handleAdicionarObservacao() {
    const texto = novaObs.trim();
    if (!texto) return;
    setSalvandoObs(true);
    const nova = await createObservacao(id, texto);
    setSalvandoObs(false);
    if (nova) {
      setObservacoes(prev => [nova, ...prev]);
      setNovaObs("");
    } else {
      toast("Erro ao adicionar observação", "err");
    }
  }

  async function handleExcluirObservacao(obsId: string) {
    if (!(await confirm("Excluir esta observação?", { perigo: true }))) return;
    const ok = await deletarObservacao(obsId, id);
    if (ok) setObservacoes(prev => prev.filter(o => o.id !== obsId));
    else toast("Erro ao excluir observação", "err");
  }

  async function handleAvancar() {
    if (!pedido) return;
    if (pedido.status === "Aguardando otimização" && otimizacoes.length === 0 && !todosVidroCliente && !todosChapa) {
      toast("Realize a otimização de corte antes de avançar para produção.", "warn");
      return;
    }
    setSalvando(true);
    const result = await avancarStatusPedido(pedido.id, pedido.status);
    if (result) toast(`${pedido.id} → ${result.status}`);
    else toast("Erro ao avançar status", "err");
    await load();
    setSalvando(false);
  }

  async function handleUsarCredito() {
    if (!pedido) return;
    setSalvando(true);
    const result = await utilizarCreditoEmPedido(pedido.id, creditoCliente, hoje());
    setSalvando(false);
    if (!result) { toast("Erro ao aplicar crédito", "err"); return; }
    toast(`✓ ${formatBRL(creditoCliente - result.creditoRestante)} de crédito aplicado`);
    await load();
  }

  async function handleUploadRomaneioAssinado(files: File[]) {
    if (!pedido || files.length === 0) return;
    setUploadandoRomaneio(true);
    const { urls, erro } = await uploadRomaneioAssinado(id, files);
    if (urls.length > 0) {
      const existentes = pedido.romaneio_assinado_urls ?? [];
      await updatePedido(id, { romaneio_assinado_urls: [...existentes, ...urls] } as any);
      toast(urls.length > 1 ? `${urls.length} romaneios assinados salvos` : "Romaneio assinado salvo");
      await load();
    } else {
      toast(`Erro ao enviar arquivo${erro ? `: ${erro}` : ""}`, "err");
    }
    setUploadandoRomaneio(false);
  }

  async function handleRemoverRomaneioAssinado(url: string) {
    if (!pedido) return;
    if (!(await confirm("Remover este romaneio assinado?", { perigo: true }))) return;
    await deleteRomaneioAssinado(url);
    const restantes = (pedido.romaneio_assinado_urls ?? []).filter(u => u !== url);
    await updatePedido(id, { romaneio_assinado_urls: restantes.length > 0 ? restantes : null } as any);
    toast("Arquivo removido");
    await load();
  }

  async function handleUploadNfe(files: File[]) {
    if (!pedido || files.length === 0) return;
    setUploadandoNfe(true);
    const { urls, erro } = await uploadNfe(id, files);
    if (urls.length > 0) {
      const existentes = pedido.nfe_urls ?? [];
      await updatePedido(id, { nfe_urls: [...existentes, ...urls] } as any);
      toast(urls.length > 1 ? `${urls.length} NF-e salvas` : "NF-e salva");
      await load();
    } else {
      toast(`Erro ao enviar NF-e${erro ? `: ${erro}` : ""}`, "err");
    }
    setUploadandoNfe(false);
  }

  async function handleRemoverNfe(url: string) {
    if (!pedido) return;
    if (!(await confirm("Remover esta NF-e?", { perigo: true }))) return;
    await deleteNfe(url);
    const restantes = (pedido.nfe_urls ?? []).filter(u => u !== url);
    await updatePedido(id, { nfe_urls: restantes.length > 0 ? restantes : null } as any);
    toast("NF-e removida");
    await load();
  }

  async function handleUploadBoleto(files: File[]) {
    if (!pedido || files.length === 0) return;
    setUploadandoBoleto(true);
    const { urls, erro } = await uploadBoleto(id, files);
    if (urls.length > 0) {
      const existentes = pedido.boleto_urls ?? [];
      await updatePedido(id, { boleto_urls: [...existentes, ...urls] } as any);
      toast(urls.length > 1 ? `${urls.length} boletos salvos` : "Boleto salvo");
      await load();
    } else {
      toast(`Erro ao enviar boleto${erro ? `: ${erro}` : ""}`, "err");
    }
    setUploadandoBoleto(false);
  }

  async function handleRemoverBoleto(url: string) {
    if (!pedido) return;
    if (!(await confirm("Remover este boleto?", { perigo: true }))) return;
    await deleteBoleto(url);
    const restantes = (pedido.boleto_urls ?? []).filter(u => u !== url);
    await updatePedido(id, { boleto_urls: restantes.length > 0 ? restantes : null } as any);
    toast("Boleto removido");
    await load();
  }

  async function handleUploadComprovante(files: File[]) {
    if (!pedido || files.length === 0) return;
    setUploadandoComprovante(true);
    const { urls, erro } = await uploadComprovantePagamento(id, files);
    if (urls.length > 0) {
      const existentes = pedido.comprovante_pagamento_urls ?? [];
      await updatePedido(id, { comprovante_pagamento_urls: [...existentes, ...urls] } as any);
      toast(urls.length > 1 ? `${urls.length} comprovantes salvos` : "Comprovante salvo");
      await load();
    } else {
      toast(`Erro ao enviar comprovante${erro ? `: ${erro}` : ""}`, "err");
    }
    setUploadandoComprovante(false);
  }

  async function handleRemoverComprovante(url: string) {
    if (!pedido) return;
    if (!(await confirm("Remover este comprovante?", { perigo: true }))) return;
    await deleteComprovantePagamento(url);
    const restantes = (pedido.comprovante_pagamento_urls ?? []).filter(u => u !== url);
    await updatePedido(id, { comprovante_pagamento_urls: restantes.length > 0 ? restantes : null } as any);
    toast("Comprovante removido");
    await load();
  }

  async function handleToggleSemNotaFiscal() {
    if (!pedido) return;
    await updatePedido(id, { sem_nota_fiscal: !pedido.sem_nota_fiscal } as any);
    await load();
  }

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando pedido...</div></div></AppLayout>;
  if (!pedido) return <AppLayout><div className="con"><div style={{ color:"var(--err)", padding:"32px" }}>Pedido não encontrado.</div></div></AppLayout>;

  const totalComIpi  = valorComIpi(pedido);
  const aberto       = totalComIpi - Number(pedido.valor_recebido);
  const quitado      = aberto <= 0;
  const pctRec       = totalComIpi > 0 ? Math.min(100, (Number(pedido.valor_recebido) / totalComIpi) * 100) : 0;
  const statusIdx    = FLUXO.indexOf(pedido.status);
  const podeAvancar  = !["Entregue","Cancelado"].includes(pedido.status);
  const temItens     = (pedido.itens_pedido?.length ?? 0) > 0;
  const podeRomaneio   = true;
  const podeChecklist  = statusIdx >= FLUXO.indexOf("Separação");
  const temOtimizacao = otimizacoes.length > 0;
  const ultimaOtim   = otimizacoes[0] ?? null;
  const todosVidroCliente = temItens && (pedido.itens_pedido ?? []).every(i => (i as any).vidro_cliente === true);
  const todosChapa        = temItens && (pedido.itens_pedido ?? []).every(i => isChapaInteira(i.largura, i.altura));

  const saldoRetiradas     = calcularSaldoItens(pedido.itens_pedido ?? [], retiradas);
  const totalPecasPedido   = saldoRetiradas.reduce((a, s) => a + s.quantidade_total, 0);
  const totalPecasRetirado = saldoRetiradas.reduce((a, s) => a + s.quantidade_retirada, 0);

  const bloqueadoSemOtim  = pedido.status === "Aguardando otimização" && !temOtimizacao && !todosVidroCliente && !todosChapa;

  const parcelasAReceber = lancamentos.filter(l => l.status === "A Receber").sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""));
  const lancamentosPagos = lancamentos.filter(l => l.status === "Pago");

  // Boleto só faz sentido anexar quando alguma forma de pagamento do pedido
  // (a principal ou a de alguma parcela — ex.: PIX de entrada + restante no
  // boleto) realmente é boleto. Também mostra se já existe boleto anexado,
  // mesmo que a forma de pagamento tenha mudado depois — nunca esconde um
  // arquivo já salvo.
  const mostrarBoleto =
    (pedido.forma_pgto?.toLowerCase().includes("boleto") ?? false) ||
    lancamentos.some(l => l.forma_pgto?.toLowerCase().includes("boleto")) ||
    (pedido.boleto_urls?.length ?? 0) > 0;

  const fc: React.CSSProperties = {
    background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "6px",
    padding: "9px 12px", color: "var(--t1)", fontSize: "13px",
    outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fcSm: React.CSSProperties = { ...fc, padding: "7px 10px", fontSize: "12px" };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb { display: none !important; }
          body { background: white !important; color: black !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .print-area { display: block !important; }
          .con { padding: 0 !important; }
          @page { margin: 0; size: A4; }
          .print-area * { font-weight: 700 !important; color: #000 !important; }
        }
        .print-area { display: none; }
        @media print { .print-area { display: block; } }
      `}</style>

      <AppLayout>
        <div className="tb no-print">
          <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
          <div className="tb-title" style={{ flex:1 }}>
            Pedido <span style={{ color:"var(--acc)" }}>{pedido.id}</span>
          </div>
          <span className={CHIP[pedido.status] ?? "chip cgr"}>{pedido.status}</span>
          {temItens && !todosVidroCliente && !todosChapa && (
            <a href={"/otimizador?pedido=" + pedido.id} className="btn bg sm">◈ Otimizar Corte</a>
          )}
          <button
            className="btn sm"
            onClick={() => podeRomaneio && handlePrintRomaneio()}
            style={{ background: podeRomaneio ? "rgba(16,185,129,.15)" : "transparent", border: "1px solid " + (podeRomaneio ? "var(--ok)" : "var(--b2)"), color: podeRomaneio ? "var(--ok)" : "var(--t3)", fontWeight:700, cursor: podeRomaneio ? "pointer" : "default", opacity: podeRomaneio ? 1 : 0.35, transition:"all 0.2s" }}
          >R</button>
          <button
            className="btn sm"
            onClick={() => setModalNC(true)}
            title="Registrar Não Conformidade"
            style={{ background: ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "rgba(244,63,94,.12)" : "transparent", border: `1px solid ${ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "rgba(244,63,94,.5)" : "var(--b2)"}`, color: ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "var(--err)" : "var(--t3)", fontWeight:700 }}
          >
            ⚑ NC{ncs.length > 0 ? ` (${ncs.length})` : ""}
          </button>
          {podeAvancar && (
            <button className="btn bp sm" onClick={handleAvancar} disabled={salvando || bloqueadoSemOtim} style={bloqueadoSemOtim ? { opacity:0.45, cursor:"not-allowed" } : {}}>
              {salvando ? "Salvando..." : bloqueadoSemOtim ? "⚠ Otimização pendente" : "Avançar Status →"}
            </button>
          )}
        </div>
        <div className="tb no-print" style={{ borderTop:"none", paddingTop:0, flexWrap:"wrap", rowGap:"10px" }}>
          <div style={{ fontSize:"13px", color:"var(--t2)", fontWeight:600 }}>{pedido.clientes?.nome ?? "—"}</div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:"18px", fontSize:"12px", fontFamily:"'DM Mono', monospace" }}>
            <span style={{ color:"var(--t3)" }}>Total <strong style={{ color:"var(--t1)" }}>{formatBRL(totalComIpi)}</strong></span>
            <span style={{ color:"var(--t3)" }}>Recebido <strong style={{ color: pedido.valor_recebido > 0 ? "var(--ok)" : "var(--t3)" }}>{formatBRL(pedido.valor_recebido)}</strong></span>
            <span style={{ color:"var(--t3)" }}>{quitado ? "Quitado ✓" : "Em aberto"} <strong style={{ color: quitado ? "var(--ok)" : "var(--warn)" }}>{formatBRL(Math.max(0, aberto))}</strong></span>
            {temItens && (
              <span style={{ color:"var(--t3)" }}>Retirada <strong style={{ color: totalPecasRetirado >= totalPecasPedido ? "var(--ok)" : "var(--warn)" }}>{totalPecasRetirado}/{totalPecasPedido} peças</strong></span>
            )}
          </div>
        </div>
        <PedidoTabs id={id} temItens={temItens} />

        <div className="con no-print" style={{ display:"flex", flexDirection:"column", gap:"20px" }}>

          {bloqueadoSemOtim && (
            <div style={{ background:"rgba(245,158,11,.1)", border:"1px solid var(--warn)", borderRadius:"10px", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
              <div>
                <div style={{ fontSize:"13px", fontWeight:700, color:"var(--warn)", marginBottom:"4px" }}>⚠ Otimização de corte pendente</div>
                <div style={{ fontSize:"12px", color:"var(--t3)" }}>Este pedido não pode avançar para produção sem um plano de corte gerado.</div>
              </div>
              <a href={"/otimizador?pedido=" + pedido.id} className="btn bp sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>◈ Otimizar Agora</a>
            </div>
          )}

          {todosVidroCliente && pedido.status === "Aguardando otimização" && (
            <div style={{ background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.3)", borderRadius:"10px", padding:"12px 18px", display:"flex", alignItems:"center", gap:"10px" }}>
              <span style={{ fontSize:"16px" }}>📦</span>
              <div>
                <div style={{ fontSize:"13px", fontWeight:700, color:"var(--warn)" }}>Vidro fornecido pelo cliente</div>
                <div style={{ fontSize:"12px", color:"var(--t3)" }}>Todos os itens são vidro do cliente — otimização não é necessária para avançar.</div>
              </div>
            </div>
          )}

          {todosChapa && pedido.status === "Aguardando otimização" && (
            <div style={{ background:"rgba(0,200,255,.08)", border:"1px solid rgba(0,200,255,.25)", borderRadius:"10px", padding:"12px 18px", display:"flex", alignItems:"center", gap:"10px" }}>
              <span style={{ fontSize:"16px" }}>🪟</span>
              <div>
                <div style={{ fontSize:"13px", fontWeight:700, color:"var(--acc2)" }}>Pedido de chapas inteiras</div>
                <div style={{ fontSize:"12px", color:"var(--t3)" }}>Este pedido contém apenas chapas — otimização de corte não é necessária para avançar.</div>
              </div>
            </div>
          )}

          {temOtimizacao && ultimaOtim && (
            <div style={{ background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.3)", borderRadius:"10px", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
              <div style={{ display:"flex", gap:"24px", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"2px" }}>PLANO DE CORTE</div>
                  <div style={{ fontSize:"13px", color:"var(--ok)", fontWeight:700 }}>✓ Otimização gerada</div>
                </div>
                <div style={{ fontSize:"12px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", display:"flex", gap:"16px" }}>
                  <span>Aproveitamento: <strong style={{ color:"var(--ok)" }}>{ultimaOtim.aproveitamento}%</strong></span>
                  <span>Chapas: <strong style={{ color:"var(--t1)" }}>{ultimaOtim.chapas_usadas}</strong></span>
                  <span>Data: <strong style={{ color:"var(--t1)" }}>{formatDate(ultimaOtim.dt_otim)}</strong></span>
                </div>
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <a href={"/pedidos/" + pedido.id + "/plano"} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>◈ Ver Plano</a>
                <a href={"/pedidos/" + pedido.id + "/etiquetas"} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>🏷 Etiquetas</a>
              </div>
            </div>
          )}

          {/* Progresso */}
          <div className="card" style={{ padding:"20px 24px" }}>
            {(() => {
              const history = (pedido.status_history ?? []) as { status: string; desde: string }[];
              return (
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"center", width:"100%" }}>
                  {FLUXO.map((step, i) => {
                    const done    = i < statusIdx;
                    const current = i === statusIdx;
                    const last    = i === FLUXO.length - 1;
                    const dur     = duracaoEtapa(history, step);
                    return (
                      <div key={step} style={{ display:"flex", alignItems:"flex-start", flex: last ? "0 0 auto" : "1 1 0", minWidth:0 }}>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"5px", width:"84px", flexShrink:0 }}>
                          <div style={{ width:"26px", height:"26px", borderRadius:"50%", background: done ? "var(--ok)" : current ? "var(--acc)" : "var(--surf3)", border: current ? "2px solid var(--acc)" : "2px solid transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontWeight:700, color: done || current ? "#000" : "var(--t3)", flexShrink:0 }}>
                            {done ? "✓" : i + 1}
                          </div>
                          <div style={{ fontSize:"9px", textAlign:"center", lineHeight:1.3, color: current ? "var(--acc)" : done ? "var(--ok)" : "var(--t3)", fontWeight: current ? 700 : 500, fontFamily:"'DM Mono', monospace", wordBreak:"break-word" }}>
                            {step}
                          </div>
                          {dur && (
                            <div style={{ fontSize:"8px", color: current ? "var(--acc)" : "var(--t3)", fontFamily:"'DM Mono', monospace", background: current ? "rgba(99,102,241,.1)" : "var(--surf3)", borderRadius:"4px", padding:"1px 5px", whiteSpace:"nowrap" }}>
                              {current ? "⏱ " : ""}{dur}
                            </div>
                          )}
                        </div>
                        {!last && <div style={{ flex:"1 1 auto", height:"2px", marginTop:"12px", background: done ? "var(--ok)" : "var(--surf3)", minWidth:"8px" }} />}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Informações do Pedido */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <button onClick={() => setAbrirInformacoes(v => !v)} style={{ width:"100%", display:"flex", alignItems:"center", gap:"8px", marginBottom: abrirInformacoes ? "16px" : 0, background:"none", border:"none", cursor:"pointer", padding:0 }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>INFORMAÇÕES DO PEDIDO</div>
              <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirInformacoes ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
            </button>
            {abrirInformacoes && (
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                  <Row label="Cliente"            value={pedido.clientes?.nome ?? "—"} />
                  <Row label="Cidade"             value={pedido.clientes?.cidade ?? "—"} />
                  <Row label="Telefone"           value={pedido.clientes?.tel ?? "—"} />
                  <Row label="Data do pedido"     value={formatDate(pedido.dt_pedido)} />
                  <Row label="Retirada prevista"  value={formatDate(pedido.dt_retirada)} />
                  <Row label="Frete"               value={pedido.frete || "Retirada"} />
                  <Row label={(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml total" : "m² total"} value={Number(pedido.m2_total).toFixed(2) + " " + ((pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml" : "m²")} />
                  {pedido.parcelas > 1 && <Row label="Parcelas" value={pedido.parcelas + "×"} />}
                  {(() => {
                    const lancComissao = lancamentos.find(l => l.tipo === "Saída" && (l as any).vendedor_id != null);
                    const vend = vendedores.find(v => v.id === pedido.vendedor_id);
                    if (!pedido.vendedor_id && !lancComissao) return null;
                    const nome = vend?.nome ?? (lancamentos.find(l => (l as any).vendedor_id != null) as any)?.descricao?.split("—")[1]?.trim() ?? "—";
                    const pct  = vend ? vend.comissao_pct : null;
                    const valCom = lancComissao ? lancComissao.valor : null;
                    return (
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderTop:"1px solid var(--b1)" }}>
                        <span style={{ fontSize:"12px", color:"var(--t3)" }}>Vendedor</span>
                        <span style={{ fontSize:"12px", fontWeight:700, color:"var(--warn)", fontFamily:"'DM Mono',monospace" }}>
                          {nome}{pct != null ? ` · ${pct}%` : ""}{valCom != null ? ` = ${valCom.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}` : ""}
                        </span>
                      </div>
                    );
                  })()}
                  {pedido.obs && <Row label="Observações" value={pedido.obs} />}
              </div>
            )}
          </div>

          {/* Financeiro */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <button onClick={() => setAbrirFinanceiro(v => !v)} style={{ width:"100%", display:"flex", alignItems:"center", gap:"8px", marginBottom: abrirFinanceiro ? "16px" : 0, background:"none", border:"none", cursor:"pointer", padding:0 }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>FINANCEIRO</div>
              <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirFinanceiro ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
            </button>
            {abrirFinanceiro && (
            <>

                {/* Resumo em 3 colunas */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", marginBottom:"14px" }}>
                  <div style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:"1px solid var(--b2)" }}>
                    <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", marginBottom:"4px" }}>Total</div>
                    <div style={{ fontSize:"14px", fontWeight:800, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(totalComIpi)}</div>
                  </div>
                  <div style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:"1px solid var(--b2)" }}>
                    <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", marginBottom:"4px" }}>Recebido</div>
                    <div style={{ fontSize:"14px", fontWeight:800, color: pedido.valor_recebido > 0 ? "var(--ok)" : "var(--t3)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(pedido.valor_recebido)}</div>
                  </div>
                  <div style={{ background: quitado ? "rgba(16,185,129,.08)" : "rgba(244,63,94,.06)", borderRadius:"8px", padding:"10px 12px", border:`1px solid ${quitado ? "rgba(16,185,129,.3)" : "rgba(244,63,94,.2)"}` }}>
                    <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", marginBottom:"4px" }}>{quitado ? "Quitado ✓" : "Em aberto"}</div>
                    <div style={{ fontSize:"14px", fontWeight:800, color: quitado ? "var(--ok)" : "var(--err)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(Math.max(0, aberto))}</div>
                  </div>
                </div>

                {pedido.tem_ipi && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginBottom:"10px" }}>
                    <span>IPI ({ALIQ_IPI_PEDIDO}% sobre {formatBRL(pedido.valor_total)})</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", color:"var(--warn)" }}>{formatBRL(pedido.valor_ipi)}</span>
                  </div>
                )}

                {/* Barra de progresso */}
                <div style={{ marginBottom:"16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"10px", color:"var(--t3)", marginBottom:"5px" }}>
                    <span>Recebimento</span><span style={{ fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{pctRec.toFixed(0)}%</span>
                  </div>
                  <div style={{ height:"5px", borderRadius:"3px", background:"var(--surf3)", overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:"3px", width:`${pctRec}%`, background: quitado ? "var(--ok)" : "var(--acc)", transition:"width .3s" }} />
                  </div>
                </div>

                {/* Parcelas a receber — sempre visível */}
                {!quitado && (
                  <div style={{ marginBottom:"16px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                      <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em" }}>A RECEBER</div>
                      <button
                        onClick={handleAdicionarParcela}
                        style={{ fontSize:"11px", background:"transparent", border:"1px solid var(--b2)", borderRadius:"5px", color:"var(--t3)", cursor:"pointer", padding:"3px 9px", transition:"all 0.15s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor="var(--acc)"; b.style.color="var(--acc)"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                      >+ Parcela</button>
                    </div>

                    {parcelasAReceber.length === 0 ? (
                      <div style={{ padding:"14px 16px", background:"var(--surf2)", borderRadius:"8px", border:"1px dashed var(--b2)", textAlign:"center", fontSize:"12px", color:"var(--t3)" }}>
                        Nenhuma parcela em aberto — clique em <strong>+ Parcela</strong> para registrar.
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                        {parcelasAReceber.map((l) => {
                          const pag = pagamentos[l.id];
                          const marcando = pag?.marcando ?? false;
                          const valorDigitado = pag?.valorDigitado ?? 0;
                          const vencido = l.vencimento && l.vencimento < hoje();
                          const isParcial = valorDigitado > 0 && valorDigitado < l.valor;
                          const restante  = isParcial ? parseFloat((l.valor - valorDigitado).toFixed(2)) : 0;
                          return (
                            <div key={l.id} style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:`1px solid ${vencido ? "rgba(244,63,94,.3)" : "var(--b2)"}` }}>
                              {/* linha topo: checkbox + descrição + valor + lixeira */}
                              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                                <input name={`marcar_pago_${l.id}`}
                                  type="checkbox"
                                  disabled={marcando}
                                  onChange={() => handleMarcarPago(l.id)}
                                  style={{ width:"16px", height:"16px", accentColor:"var(--ok)", cursor:"pointer", flexShrink:0 }}
                                  title="Marcar como pago"
                                />
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                    {l.descricao}
                                  </div>
                                  <div style={{ fontSize:"10px", color: vencido ? "var(--err)" : "var(--t3)", fontFamily:"'DM Mono',monospace", marginTop:"2px" }}>
                                    {vencido ? "⚠ Vencido · " : "Vence: "}{formatDate(l.vencimento)}
                                  </div>
                                </div>
                                <div style={{ fontSize:"13px", fontWeight:700, color:"var(--t1)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                                  {formatBRL(l.valor)}
                                </div>
                                <button
                                  title="Remover parcela"
                                  onClick={() => handleDeletarLancamento(l.id)}
                                  style={{ background:"transparent", border:"1px solid var(--b2)", borderRadius:"5px", color:"var(--t3)", fontSize:"11px", cursor:"pointer", padding:"3px 7px", transition:"all 0.15s", lineHeight:1, flexShrink:0 }}
                                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="rgba(244,63,94,.15)"; b.style.borderColor="var(--err)"; b.style.color="var(--err)"; }}
                                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="transparent"; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                                >🗑</button>
                              </div>

                              {/* campos inline 2×2: data/conta · forma/valor */}
                              <div style={{ marginTop:"10px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                                <div>
                                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:"4px" }}>Data pgto</div>
                                  <DateInput
                                    value={pag?.dataPagamento ?? hoje()}
                                    onChange={v => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], dataPagamento: v } }))}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:"4px" }}>Conta</div>
                                  <select name="pag"
                                    value={pag?.conta ?? ""}
                                    onChange={e => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], conta: e.target.value } }))}
                                    style={{ ...fc, fontSize:"12px", padding:"7px 8px" }}
                                  >
                                    <option value="">— Conta —</option>
                                    {CONTAS.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:"4px" }}>Forma pgto</div>
                                  <select name="pag"
                                    value={pag?.formaPgto ?? ""}
                                    onChange={e => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], formaPgto: e.target.value } }))}
                                    style={{ ...fc, fontSize:"12px", padding:"7px 8px" }}
                                  >
                                    <option value="">— Forma —</option>
                                    {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => <option key={f}>{f}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:"4px" }}>Valor pago</div>
                                  <CurrencyInput
                                    value={valorDigitado}
                                    onChange={v => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], valorDigitado: v } }))}
                                    placeholder={formatBRL(l.valor)}
                                    style={{ margin:0, fontSize:"12px", padding:"7px 8px" }}
                                  />
                                </div>
                              </div>

                              {isParcial && (
                                <div style={{ marginTop:"8px", fontSize:"11px", color:"var(--warn)", fontFamily:"'DM Mono',monospace", background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)", borderRadius:"6px", padding:"6px 10px" }}>
                                  ⚡ Parcial — saldo de {formatBRL(restante)} será gerado automaticamente
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── HISTÓRICO DE PAGAMENTOS JÁ FEITOS ── */}
                {lancamentosPagos.length > 0 && (
                  <div style={{ marginBottom:"16px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                      <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em" }}>HISTÓRICO PAGO</div>
                      <div style={{ fontSize:"10px", color:"var(--t3)" }}>clique para editar</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                      {lancamentosPagos.map(l => {
                        const ed = editandoPago[l.id];
                        const isEditing = !!ed;
                        return (
                          <div
                            key={l.id}
                            style={{
                              background: isEditing ? "var(--surf3)" : "var(--surf2)",
                              borderRadius:"8px",
                              border: `1px solid ${isEditing ? "var(--acc)" : "var(--b2)"}`,
                              overflow:"hidden",
                              transition:"border-color 0.15s, background 0.15s",
                            }}
                          >
                            {/* Linha principal — clicável para editar */}
                            <div
                              onClick={() => { if (!isEditing) abrirEdicaoPago(l); }}
                              style={{
                                display:"flex", alignItems:"center", gap:"8px",
                                padding:"9px 12px",
                                cursor: isEditing ? "default" : "pointer",
                              }}
                              onMouseEnter={e => { if (!isEditing) (e.currentTarget as HTMLDivElement).style.background = "var(--surf3)"; }}
                              onMouseLeave={e => { if (!isEditing) (e.currentTarget as HTMLDivElement).style.background = ""; }}
                            >
                              <span style={{ fontSize:"11px", color:"var(--ok)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>✓ Pago</span>
                              <span style={{ fontSize:"13px", color:"var(--ok)", fontFamily:"'DM Mono',monospace", fontWeight:600, flex:1 }}>
                                {formatBRL(l.valor)}
                              </span>
                              {/* Badges conta + forma */}
                              {l.forma_pgto && (
                                <span style={{
                                  fontSize:"10px", color:"var(--warn)", fontFamily:"'DM Mono',monospace",
                                  background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)",
                                  borderRadius:"4px", padding:"2px 7px", flexShrink:0, fontWeight:600,
                                }}>
                                  {l.forma_pgto}
                                </span>
                              )}
                              {l.conta && (
                                <span style={{
                                  fontSize:"10px", color:"var(--acc2)", fontFamily:"'DM Mono',monospace",
                                  background:"rgba(0,200,255,.08)", border:"1px solid rgba(0,200,255,.2)",
                                  borderRadius:"4px", padding:"2px 7px", flexShrink:0, fontWeight:600,
                                }}>
                                  {l.conta}
                                </span>
                              )}
                              <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                                {formatDate(l.vencimento)}
                              </span>
                              {!isEditing && (
                                <span style={{ fontSize:"10px", color:"var(--t3)", opacity:0.6 }} title="Clique para editar">✏</span>
                              )}
                              <button
                                title="Remover"
                                onClick={e => { e.stopPropagation(); handleDeletarLancamento(l.id); }}
                                style={{ background:"transparent", border:"1px solid var(--b2)", borderRadius:"5px", color:"var(--t3)", fontSize:"11px", cursor:"pointer", padding:"3px 7px", transition:"all 0.15s", lineHeight:1, flexShrink:0 }}
                                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="rgba(244,63,94,.15)"; b.style.borderColor="var(--err)"; b.style.color="var(--err)"; }}
                                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="transparent"; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                              >🗑</button>
                            </div>

                            {/* Painel de edição inline — expande ao clicar */}
                            {isEditing && (
                              <div style={{
                                borderTop:"1px solid var(--b2)",
                                padding:"12px 12px 10px",
                                background:"var(--surf2)",
                                display:"flex", flexDirection:"column", gap:"10px",
                              }}>
                                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                                  <div>
                                    <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:".04em" }}>Valor</div>
                                    <CurrencyInput
                                      value={ed.valor}
                                      onChange={v => setEditandoPago(prev => ({ ...prev, [l.id]: { ...prev[l.id], valor: v } }))}
                                      placeholder="R$ 0,00"
                                      style={{ margin:0, fontSize:"12px", padding:"6px 8px" }}
                                    />
                                  </div>
                                  <div>
                                    <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:".04em" }}>Data</div>
                                    <DateInput
                                      value={ed.data}
                                      onChange={v => setEditandoPago(prev => ({ ...prev, [l.id]: { ...prev[l.id], data: v } }))}
                                    />
                                  </div>
                                  <div>
                                    <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:".04em" }}>Conta</div>
                                    <select name="ed_conta"
                                      value={ed.conta}
                                      onChange={e => setEditandoPago(prev => ({ ...prev, [l.id]: { ...prev[l.id], conta: e.target.value } }))}
                                      style={{ ...fc, fontSize:"12px", padding:"6px 8px" }}
                                    >
                                      <option value="">— Selecione —</option>
                                      {CONTAS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:".04em" }}>Forma</div>
                                    <select name="ed_forma_pgto"
                                      value={ed.formaPgto}
                                      onChange={e => setEditandoPago(prev => ({ ...prev, [l.id]: { ...prev[l.id], formaPgto: e.target.value } }))}
                                      style={{ ...fc, fontSize:"12px", padding:"6px 8px" }}
                                    >
                                      <option value="">— Forma —</option>
                                      {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => <option key={f}>{f}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div style={{ display:"flex", gap:"6px", justifyContent:"flex-end" }}>
                                  <button
                                    className="btn bg sm"
                                    onClick={() => cancelarEdicaoPago(l.id)}
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    className="btn bp sm"
                                    onClick={() => handleSalvarEdicaoPago(l.id)}
                                    disabled={ed.salvando}
                                  >
                                    {ed.salvando ? "Salvando..." : "✓ Salvar"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Crédito */}
                {creditoCliente > 0.005 && !quitado && (
                  <div style={{ marginBottom:"10px", padding:"10px 12px", background:"rgba(0,200,255,.07)", border:"1px solid rgba(0,200,255,.25)", borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"10px" }}>
                    <div>
                      <div style={{ fontSize:"11px", fontWeight:700, color:"var(--acc2)" }}>Crédito disponível do cliente</div>
                      <div style={{ fontSize:"13px", fontWeight:700, color:"var(--t1)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(creditoCliente)}</div>
                    </div>
                    <button className="btn bg sm" onClick={handleUsarCredito} disabled={salvando}>Aplicar crédito</button>
                  </div>
                )}

                {quitado && (
                  <div style={{ padding:"10px", background:"rgba(0,200,100,.08)", borderRadius:"8px", color:"var(--ok)", fontSize:"13px", textAlign:"center" }}>
                    ✓ Pagamento quitado
                  </div>
                )}
            </>
            )}
          </div>

          {/* Itens */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: abrirItens ? "16px" : 0 }}>
              <button onClick={() => setAbrirItens(v => !v)} style={{ display:"flex", alignItems:"center", gap:"10px", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ITENS DO PEDIDO ({pedido.itens_pedido?.length ?? 0})</div>
                <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirItens ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
              </button>
              {temItens && !todosVidroCliente && !todosChapa && (
                <a href={"/otimizador?pedido=" + pedido.id} className="btn bg xs">◈ Otimizar Corte</a>
              )}
            </div>
            {abrirItens && !temItens ? (
              <div style={{ color:"var(--t3)", padding:"24px 0", textAlign:"center" }}>Nenhum item registrado neste pedido.</div>
            ) : abrirItens ? (
              <div className="tw">
                <table>
                  <thead>
                    <tr><th>#</th><th>Produto</th><th>Dimensão</th><th>Medida</th><th>Quantidade</th><th>Preço Unitário</th><th>Vidro Cliente</th><th>Subtotal</th></tr>
                  </thead>
                  <tbody>
                    {pedido.itens_pedido!.map((item, i) => {
                      const isML = (item as any).produtos?.unidade === "ml" || (item as any).vidro_cliente === true;
                      const medida = medidaReal(item, isML).toFixed(3);
                      const unidade = isML ? "ml" : "m²";
                      return (
                      <tr key={item.id}>
                        <td className="mono" style={{ color:"var(--t3)" }}>{i + 1}</td>
                        <td><strong>{item.produto_nome}</strong></td>
                        <td className="mono">{item.largura} × {item.altura} mm</td>
                        <td className="mono">{medida} {unidade}</td>
                        <td className="mono">{item.quantidade}</td>
                        <td className="mono">{formatBRL(item.valor_m2)}</td>
                        <td style={{ textAlign:"center" }}>{(item as any).vidro_cliente ? <span style={{ color:"var(--warn)" }}>📦</span> : <span style={{ color:"var(--t3)" }}>—</span>}</td>
                        <td className="mono" style={{ color:"var(--acc)", fontWeight:600 }}>{formatBRL(item.subtotal)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {/* Documentos: Romaneio / NF-e / Boleto / Comprovante / Observações */}
          <div className="card" style={{ overflow: "hidden" }}>
            <button onClick={() => setAbrirDocumentos(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>DOCUMENTOS</div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirDocumentos ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
            {abrirDocumentos && (
            <>
            {/* Romaneio(s) Assinado(s) */}
            <button onClick={() => setAbrirRomaneio(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", borderTop: "1px solid var(--b1)", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px" }}>📎</span>
                <span style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>ROMANEIO(S) ASSINADO(S)</span>
                {(pedido.romaneio_assinado_urls?.length ?? 0) > 0 && (
                  <span style={{ fontSize: "10px", background: "rgba(16,185,129,.15)", color: "var(--ok)", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>{pedido.romaneio_assinado_urls!.length}</span>
                )}
              </div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirRomaneio ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
            {abrirRomaneio && (
              <div style={{ padding: "0 18px 14px" }}>
                {(pedido.romaneio_assinado_urls?.length ?? 0) > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                    {pedido.romaneio_assinado_urls!.map((url, i) => (
                      <div key={url} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(16,185,129,.08)", borderRadius: "7px", border: "1px solid rgba(16,185,129,.2)" }}>
                        <span style={{ fontSize: "14px" }}>📄</span>
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "var(--ok)", fontWeight: 600, fontSize: "12px", textDecoration: "underline" }}>Romaneio assinado {i + 1}</a>
                        <button className="btn bw sm" onClick={() => handleRemoverRomaneioAssinado(url)} disabled={uploadandoRomaneio}>Remover</button>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "12px", border: "2px dashed var(--b2)", borderRadius: "7px", cursor: uploadandoRomaneio ? "default" : "pointer", background: "var(--surf2)" }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length > 0 && !uploadandoRomaneio) handleUploadRomaneioAssinado(fs); }}>
                  <span style={{ fontSize: "16px" }}>📎</span>
                  <span style={{ fontSize: "11px", color: "var(--t3)", textAlign: "center" }}>{uploadandoRomaneio ? "Enviando..." : "Arraste ou clique para anexar romaneio(s) assinado(s) — dá pra anexar mais de um"}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple name="arquivo_romaneio" style={{ display: "none" }} disabled={uploadandoRomaneio}
                    onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) handleUploadRomaneioAssinado(fs); e.target.value = ""; }} />
                </label>
              </div>
            )}

            {/* NF-e */}
            <button onClick={() => setAbrirNfe(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", borderTop: "1px solid var(--b1)", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px" }}>🧾</span>
                <span style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>NF-e</span>
                {(pedido.nfe_urls?.length ?? 0) > 0 && (
                  <span style={{ fontSize: "10px", background: "rgba(99,102,241,.15)", color: "var(--acc)", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>{pedido.nfe_urls!.length}</span>
                )}
                {pedido.sem_nota_fiscal && (
                  <span style={{ fontSize: "10px", background: "var(--surf2)", color: "var(--t3)", border: "1px solid var(--b2)", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>VENDIDO SEM NF</span>
                )}
              </div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirNfe ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
            {abrirNfe && (
              <div style={{ padding: "0 18px 14px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "11.5px", color: "var(--t2)", cursor: "pointer", marginBottom: "12px" }}>
                  <input type="checkbox" name="sem_nota_fiscal" checked={!!pedido.sem_nota_fiscal} onChange={handleToggleSemNotaFiscal} style={{ width: "13px", height: "13px", accentColor: "var(--acc)", cursor: "pointer" }} />
                  Este pedido foi vendido sem nota fiscal
                </label>
                {(pedido.itens_pedido?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontSize: "9.5px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: "6px" }}>
                      Dados para emissão (1 linha por produto — como sai na nota)
                    </div>
                    <div className="tw">
                      <table>
                        <thead>
                          <tr><th>Produto</th><th>Metragem</th><th>Valor unit.</th><th>Valor total</th></tr>
                        </thead>
                        <tbody>
                          {Object.values(
                            pedido.itens_pedido!.reduce((acc, item) => {
                              const isML = (item as any).produtos?.unidade === "ml" || (item as any).vidro_cliente === true;
                              const key = item.produto_nome + (isML ? ":ml" : ":m2");
                              const g = acc[key] ?? (acc[key] = { nome: item.produto_nome, isML, metragem: 0, subtotal: 0 });
                              g.metragem += Number(item.m2);
                              g.subtotal += Number(item.subtotal);
                              return acc;
                            }, {} as Record<string, { nome: string; isML: boolean; metragem: number; subtotal: number }>)
                          ).map(g => (
                            <tr key={g.nome + g.isML}>
                              <td>{g.nome}</td>
                              <td className="mono">{g.metragem.toFixed(3)} {g.isML ? "ml" : "m²"}</td>
                              <td className="mono">{formatBRL(g.metragem > 0 ? g.subtotal / g.metragem : 0)}</td>
                              <td className="mono" style={{ color: "var(--acc)", fontWeight: 600 }}>{formatBRL(g.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {(pedido.nfe_urls?.length ?? 0) > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                    {pedido.nfe_urls!.map((url, i) => (
                      <div key={url} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(99,102,241,.08)", borderRadius: "7px", border: "1px solid rgba(99,102,241,.2)" }}>
                        <span style={{ fontSize: "14px" }}>🧾</span>
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "var(--acc)", fontWeight: 600, fontSize: "12px", textDecoration: "underline" }}>NF-e {i + 1}</a>
                        <button className="btn bw sm" onClick={() => handleRemoverNfe(url)} disabled={uploadandoNfe}>Remover</button>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "12px", border: "2px dashed var(--b2)", borderRadius: "7px", cursor: uploadandoNfe ? "default" : "pointer", background: "var(--surf2)" }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length > 0 && !uploadandoNfe) handleUploadNfe(fs); }}>
                  <span style={{ fontSize: "16px" }}>🧾</span>
                  <span style={{ fontSize: "11px", color: "var(--t3)" }}>{uploadandoNfe ? "Enviando..." : "Arraste ou clique para anexar NF-e (PDF ou XML)"}</span>
                  <input type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" multiple name="arquivo_nfe" style={{ display: "none" }} disabled={uploadandoNfe}
                    onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) handleUploadNfe(fs); e.target.value = ""; }} />
                </label>
              </div>
            )}

            {/* Boleto — só aparece quando alguma forma de pagamento do pedido
                (principal ou de parcela) é boleto, ou já existe boleto anexado */}
            {mostrarBoleto && (
              <>
                <button onClick={() => setAbrirBoleto(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", borderTop: "1px solid var(--b1)", cursor: "pointer", color: "var(--t1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px" }}>🏦</span>
                    <span style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>BOLETO</span>
                    {(pedido.boleto_urls?.length ?? 0) > 0 && (
                      <span style={{ fontSize: "10px", background: "rgba(245,158,11,.18)", color: "var(--warn)", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>{pedido.boleto_urls!.length}</span>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirBoleto ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
                </button>
                {abrirBoleto && (
                  <div style={{ padding: "0 18px 14px" }}>
                    {(pedido.boleto_urls?.length ?? 0) > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                        {pedido.boleto_urls!.map((url, i) => (
                          <div key={url} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(245,158,11,.08)", borderRadius: "7px", border: "1px solid rgba(245,158,11,.25)" }}>
                            <span style={{ fontSize: "14px" }}>🏦</span>
                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "var(--warn)", fontWeight: 600, fontSize: "12px", textDecoration: "underline" }}>Boleto {i + 1}</a>
                            <button className="btn bw sm" onClick={() => handleRemoverBoleto(url)} disabled={uploadandoBoleto}>Remover</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "12px", border: "2px dashed var(--b2)", borderRadius: "7px", cursor: uploadandoBoleto ? "default" : "pointer", background: "var(--surf2)" }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length > 0 && !uploadandoBoleto) handleUploadBoleto(fs); }}>
                      <span style={{ fontSize: "16px" }}>🏦</span>
                      <span style={{ fontSize: "11px", color: "var(--t3)" }}>{uploadandoBoleto ? "Enviando..." : "Arraste ou clique para anexar boleto (PDF ou imagem)"}</span>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple name="arquivo_boleto" style={{ display: "none" }} disabled={uploadandoBoleto}
                        onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) handleUploadBoleto(fs); e.target.value = ""; }} />
                    </label>
                  </div>
                )}
              </>
            )}

            {/* Comprovante de Pagamento */}
            <button onClick={() => setAbrirComprovante(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", borderTop: "1px solid var(--b1)", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px" }}>💳</span>
                <span style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>COMPROVANTE DE PAGAMENTO</span>
                {(pedido.comprovante_pagamento_urls?.length ?? 0) > 0 && (
                  <span style={{ fontSize: "10px", background: "rgba(34,197,94,.15)", color: "var(--ok)", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>{pedido.comprovante_pagamento_urls!.length}</span>
                )}
              </div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirComprovante ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
            {abrirComprovante && (
              <div style={{ padding: "0 18px 14px" }}>
                {(pedido.comprovante_pagamento_urls?.length ?? 0) > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                    {pedido.comprovante_pagamento_urls!.map((url, i) => (
                      <div key={url} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(34,197,94,.08)", borderRadius: "7px", border: "1px solid rgba(34,197,94,.25)" }}>
                        <span style={{ fontSize: "14px" }}>💳</span>
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "var(--ok)", fontWeight: 600, fontSize: "12px", textDecoration: "underline" }}>Comprovante {i + 1}</a>
                        <button className="btn bw sm" onClick={() => handleRemoverComprovante(url)} disabled={uploadandoComprovante}>Remover</button>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "12px", border: "2px dashed var(--b2)", borderRadius: "7px", cursor: uploadandoComprovante ? "default" : "pointer", background: "var(--surf2)" }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length > 0 && !uploadandoComprovante) handleUploadComprovante(fs); }}>
                  <span style={{ fontSize: "16px" }}>💳</span>
                  <span style={{ fontSize: "11px", color: "var(--t3)" }}>{uploadandoComprovante ? "Enviando..." : "Arraste ou clique para anexar comprovante de pagamento (PDF ou imagem)"}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple name="arquivo_comprovante" style={{ display: "none" }} disabled={uploadandoComprovante}
                    onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) handleUploadComprovante(fs); e.target.value = ""; }} />
                </label>
              </div>
            )}

            {/* Observações */}
            <button onClick={() => setAbrirObs(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", borderTop: "1px solid var(--b1)", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px" }}>📝</span>
                <span style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>OBSERVAÇÕES</span>
                {observacoes.length > 0 && (
                  <span style={{ fontSize: "10px", background: "rgba(122,132,158,.18)", color: "var(--t2)", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>{observacoes.length}</span>
                )}
              </div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirObs ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
            {abrirObs && (
              <div style={{ padding: "0 18px 14px" }}>
                <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                  <textarea name="nova_obs"
                    className="fc"
                    value={novaObs}
                    onChange={e => setNovaObs(e.target.value)}
                    placeholder="Registrar um acontecimento do pedido (ex.: entregador quebrou 4 vidros ontem)..."
                    rows={2}
                    style={{ flex: 1, resize: "vertical", fontSize: "12px" }}
                  />
                  <button
                    className="btn bp sm"
                    onClick={handleAdicionarObservacao}
                    disabled={salvandoObs || !novaObs.trim()}
                    style={{ whiteSpace: "nowrap", alignSelf: "flex-end" }}
                  >
                    + Adicionar
                  </button>
                </div>

                {observacoes.length === 0 ? (
                  <div style={{ padding: "10px 12px", background: "var(--surf2)", borderRadius: "7px", border: "1px dashed var(--b2)", textAlign: "center", fontSize: "11px", color: "var(--t3)" }}>
                    Nenhuma observação registrada ainda.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {observacoes.map(o => (
                      <div key={o.id} style={{ background: "var(--surf2)", borderRadius: "7px", padding: "8px 12px", border: "1px solid var(--b2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div style={{ fontSize: "12px", color: "var(--t1)", whiteSpace: "pre-wrap", flex: 1 }}>{o.texto}</div>
                          <button
                            title="Excluir observação"
                            onClick={() => handleExcluirObservacao(o.id)}
                            style={{ background: "transparent", border: "1px solid var(--b2)", borderRadius: "5px", color: "var(--t3)", fontSize: "10px", cursor: "pointer", padding: "2px 6px", flexShrink: 0, transition: "all 0.15s" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                          >🗑</button>
                        </div>
                        <div style={{ fontSize: "9.5px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", marginTop: "5px" }}>
                          {new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {o.usuario_email ? ` · ${o.usuario_email}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </>
            )}
          </div>
        </div>

        {/* ── MODAL EDIÇÃO ── */}
        <Modal open={editando} onClose={() => setEditando(false)} title={`Editar Pedido · ${pedido.id}`} width="780px" style={{ maxHeight:"90vh", overflowY:"auto" }}>
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                <Campo label="Cliente">
                  <select name="cliente_id" style={fc} value={editForm.cliente_id} onChange={e => setEditForm(f => ({ ...f, cliente_id: Number(e.target.value) }))}>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Campo>
                <div className="fg">
                  <label className="fl" htmlFor={vendedorFieldId}>Vendedor / Comissão</label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select id={vendedorFieldId} style={{ ...fc, flex: 1 }} value={editForm.vendedor_id ?? ""} onChange={e => setEditForm(f => ({ ...f, vendedor_id: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">— Sem vendedor —</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.comissao_pct}%)</option>)}
                    </select>
                    {editForm.vendedor_id && (() => {
                      const vend = vendedores.find(v => v.id === editForm.vendedor_id);
                      const val  = vend ? valorTotalEditado * vend.comissao_pct / 100 : 0;
                      return val > 0 ? (
                        <span style={{ fontSize: "12px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
                          {vend!.comissao_pct}% = {val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div className="fr">
                  <Campo label="Data do Pedido"><DateInput value={editForm.dt_pedido} onChange={v => setEditForm(f => ({ ...f, dt_pedido: v }))} /></Campo>
                  <Campo label="Previsão Retirada"><DateInput value={editForm.dt_retirada} onChange={v => setEditForm(f => ({ ...f, dt_retirada: v }))} /></Campo>
                </div>
                <div className="fr">
                  <Campo label="Forma de Pagamento">
                    <select name="forma_pgto" style={fc} value={editForm.forma_pgto} onChange={e => setEditForm(f => ({ ...f, forma_pgto: e.target.value }))}>
                      <option value="">Selecione...</option>
                      {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Conta">
                    <select name="conta" style={fc} value={editForm.conta} onChange={e => setEditForm(f => ({ ...f, conta: e.target.value }))}>
                      <option value="">Selecione...</option>
                      {CONTAS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Campo>
                </div>
                <Campo label="Parcelas">
                  <select name="parcelas" style={fc} value={editForm.parcelas} onChange={e => handleEditParcelas(Number(e.target.value))}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                  </select>
                </Campo>
                <div style={{ padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"10px", textTransform:"uppercase" }}>
                    {editForm.parcelas === 1 ? "Pagamento" : `Parcelas (${editForm.parcelas}x)`}
                  </div>
                  {editParcelas.map((p, idx) => (
                    <div key={idx} style={{ display:"grid", gridTemplateColumns: editForm.parcelas > 1 ? "50px 1fr 130px" : "1fr 130px", gap:"8px", alignItems:"center", marginBottom:"6px" }}>
                      {editForm.parcelas > 1 && <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{idx + 1}ª</span>}
                      <DateInput value={p.data} onChange={v => { if (idx === 0) handlePrimeiraDtEdit(v); else setEditParcelas(prev => prev.map((x, i) => i === idx ? { ...x, data: v } : x)); }} />
                      <CurrencyInput value={p.valor} onChange={v => setEditParcelas(prev => prev.map((x, i) => i === idx ? { ...x, valor: v } : x))} placeholder="R$ 0,00" style={{ margin: 0 }} />
                    </div>
                  ))}
                  <div style={{ fontSize:"10px", color:"var(--t3)", marginTop:"4px", fontFamily:"'DM Mono',monospace" }}>
                    Total parcelas: <strong style={{ color:"var(--acc)" }}>{formatBRL(editParcelas.reduce((a, p) => a + p.valor, 0))}</strong>
                  </div>
                </div>

                {/* Itens */}
                <div style={{ padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"12px", textTransform:"uppercase" }}>Itens do Pedido</div>
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 78px 75px 82px 90px 80px 70px 96px", gap:"6px", marginBottom:"6px", paddingBottom:"6px", borderBottom:"1px solid var(--b1)" }}>
                    {["Produto","Largura","Altura","Quantidade","R$/m²","Lapidação","Vidro Cliente","Subtotal"].map(h => (
                      <div key={h} style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", fontFamily:"'DM Mono',monospace" }}>{h}</div>
                    ))}
                  </div>
                  {editItens.map((item, idx) => {
                    const m2  = calcM2Item(item);
                    const sub = calcSubtotalItem(item);
                    return (
                      <div key={item.id} style={{ marginBottom:"10px" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"2fr 78px 75px 82px 90px 80px 70px 96px", gap:"6px", alignItems:"center" }}>
                          <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", padding:"7px 10px", background:"var(--surf1)", borderRadius:"6px", border:"1px solid var(--b1)" }}>
                            {item.produto_nome}
                          </div>
                          <input name={`item_largura_${idx}`} style={fcSm} type="number" value={item.largura || ""} onChange={e => updEditItem(idx, "largura", parseInt(e.target.value) || 0)} placeholder="0" />
                          <input name={`item_altura_${idx}`} style={fcSm} type="number" value={item.altura || ""} onChange={e => updEditItem(idx, "altura", parseInt(e.target.value) || 0)} placeholder="0" />
                          <input name={`item_quantidade_${idx}`} style={fcSm} type="number" value={item.quantidade} onChange={e => updEditItem(idx, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                          <CurrencyInput value={item.valor_m2} onChange={v => updEditItem(idx, "valor_m2", v)} placeholder="R$/m²" style={{ margin:0, padding:"7px 10px", fontSize:"12px" }} />
                          <CurrencyInput value={item.lapidacao} onChange={v => updEditItem(idx, "lapidacao", v)} placeholder="0" style={{ margin:0, padding:"7px 10px", fontSize:"12px" }} />
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <button
                              title="Vidro do cliente"
                              onClick={() => updEditItem(idx, "vidro_cliente", !item.vidro_cliente)}
                              style={{ width:"32px", height:"32px", borderRadius:"6px", border:"1px solid", cursor:"pointer", fontSize:"15px", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s",
                                background: item.vidro_cliente ? "rgba(245,158,11,.15)" : "var(--surf1)",
                                borderColor: item.vidro_cliente ? "var(--warn)" : "var(--b1)",
                              }}
                            >
                              📦
                            </button>
                          </div>
                          <div style={{ fontSize:"12px", color:"var(--acc)", fontWeight:700, fontFamily:"'DM Mono',monospace", padding:"7px 0" }}>{formatBRL(sub)}</div>
                        </div>
                        {m2 > 0 && (
                          <div style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", marginTop:"2px", paddingLeft:"2px" }}>
                            {m2.toFixed(4)} m²
                            {item.vidro_cliente && <span style={{ color:"var(--warn)", marginLeft:"8px" }}>📦 Vidro do cliente</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:"1px solid var(--b1)", paddingTop:"10px", marginTop:"4px" }}>
                    <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>Total calculado · {m2TotalEditado.toFixed(4)} m²</span>
                    <span style={{ fontSize:"15px", fontWeight:800, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(valorComIpiEditado)}</span>
                  </div>
                </div>

                <Campo label="Observações">
                  <textarea name="obs" style={{ ...fc, minHeight:"80px", resize:"vertical", fontFamily:"'Inter',sans-serif" }}
                    value={editForm.obs} onChange={e => setEditForm(f => ({ ...f, obs: e.target.value }))}
                    placeholder="Observações do pedido..." />
                </Campo>
                <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", paddingTop:"4px" }}>
                  <button className="btn bg" onClick={() => setEditando(false)}>Cancelar</button>
                  <button className="btn bp" onClick={salvarEdicao} disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>
              </div>
        </Modal>

        {/* ─── MODAL NC ─── */}
        {modalNC && (
          <div className="modal-backdrop" onClick={() => setModalNC(false)}>
            <div className="modal" style={{ maxWidth:"540px", width:"100%" }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ margin:0, fontSize:"15px" }}>Registrar Não Conformidade</h3>
                <button className="btn-ghost" onClick={() => setModalNC(false)} style={{ fontSize:"18px", lineHeight:1 }}>×</button>
              </div>
              <div className="modal-body" style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Tipo *</label>
                    <select name="nc_form_tipo" className="form-input" value={ncForm.tipo ?? "Quebra de vidro"} onChange={e => setNcForm(f => ({ ...f, tipo: e.target.value as TipoNC }))}>
                      {TIPOS_NC.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gravidade *</label>
                    <select name="nc_form_gravidade" className="form-input" value={ncForm.gravidade ?? "Média"} onChange={e => setNcForm(f => ({ ...f, gravidade: e.target.value as GravidadeNC }))}>
                      {(["Baixa","Média","Alta","Crítica"] as GravidadeNC[]).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Etapa (setor)</label>
                    <input name="nc_form_etapa" className="form-input" value={ncForm.etapa ?? pedido?.status ?? ""} onChange={e => setNcForm(f => ({ ...f, etapa: e.target.value }))} placeholder={pedido?.status ?? "Ex: Corte"} />
                  </div>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Produto/peça</label>
                    <input name="nc_form_produto_nome" className="form-input" value={ncForm.produto_nome ?? ""} onChange={e => setNcForm(f => ({ ...f, produto_nome: e.target.value || null }))} placeholder="Nome do produto ou peça afetada" />
                  </div>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Descrição *</label>
                    <textarea name="nc_form_descricao" className="form-input" rows={3} value={ncForm.descricao ?? ""} onChange={e => setNcForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva o problema encontrado..." style={{ resize:"vertical" }} />
                  </div>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Observações</label>
                    <textarea name="nc_form_obs" className="form-input" rows={2} value={ncForm.obs ?? ""} onChange={e => setNcForm(f => ({ ...f, obs: e.target.value || null }))} placeholder="Observações adicionais..." style={{ resize:"vertical" }} />
                  </div>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Responsável pela análise</label>
                    <input name="nc_form_responsavel_analise" className="form-input" value={ncForm.responsavel_analise ?? ""} onChange={e => setNcForm(f => ({ ...f, responsavel_analise: e.target.value || null }))} placeholder="Nome do responsável pela investigação" />
                  </div>
                </div>
                {ncs.length > 0 && (
                  <div style={{ borderTop:"1px solid var(--border)", paddingTop:"12px" }}>
                    <div style={{ fontSize:"12px", color:"var(--t3)", fontWeight:600, marginBottom:"8px" }}>NCs deste pedido ({ncs.length})</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"120px", overflowY:"auto" }}>
                      {ncs.map(nc => (
                        <div key={nc.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"6px 8px", background:"var(--bg2)", borderRadius:"6px" }}>
                          <span style={{ fontSize:"11px", fontWeight:700, color:"var(--acc)", minWidth:"72px" }}>{nc.codigo}</span>
                          <span style={{ flex:1, fontSize:"11px", color:"var(--t2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nc.tipo}</span>
                          <span style={{ fontSize:"11px", fontWeight:600, color: STATUS_COR_NC[nc.status] }}>{nc.status}</span>
                          <span style={{ fontSize:"11px", fontWeight:600, color: GRAVIDADE_COR_NC[nc.gravidade] }}>{nc.gravidade}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Fotos */}
              <div className="form-group" style={{ padding:"0 0 4px" }}>
                <label className="form-label">Fotos (opcional)</label>
                <label style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"6px", padding:"12px", border:"2px dashed var(--border)", borderRadius:"8px", cursor:"pointer", background:"var(--bg2)" }}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border)"; const f = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); setFotosNC(p => [...p, ...f]); }}>
                  <span style={{ fontSize:"16px" }}>📷</span>
                  <span style={{ fontSize:"11px", color:"var(--t3)" }}>Arraste ou clique para selecionar imagens</span>
                  <input name="set_fotos_nc" type="file" accept="image/*" multiple style={{ display:"none" }}
                    onChange={e => { setFotosNC(p => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
                </label>
                {fotosNC.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", marginTop:"8px" }}>
                    {fotosNC.map((f, i) => (
                      <div key={i} style={{ position:"relative", width:"64px", height:"64px" }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"6px", border:"1px solid var(--border)" }} />
                        <button onClick={() => setFotosNC(p => p.filter((_, j) => j !== i))}
                          style={{ position:"absolute", top:"-5px", right:"-5px", background:"#ef4444", border:"none", borderRadius:"50%", width:"16px", height:"16px", color:"#fff", fontSize:"9px", cursor:"pointer", lineHeight:"16px", padding:0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn secondary" onClick={() => { setModalNC(false); setFotosNC([]); }}>Cancelar</button>
                <button className="btn primary" onClick={handleSalvarNC} disabled={salvando}>{salvando ? "Salvando..." : "Registrar NC"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── ROMANEIO PDF ─── */}
        <div className="print-area" style={{ padding:"20px 28px", fontFamily:"Arial, sans-serif", color:"#1a1a2e", background:"white", width:"210mm", minHeight:"auto", boxSizing:"border-box" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"20px", paddingBottom:"16px", borderBottom:"3px solid #2d5fa6" }}>
            <div>
              <div style={{ fontSize:"26px", fontWeight:900, color:"#2d5fa6", letterSpacing:"-1px" }}>urbanglass</div>
              <div style={{ fontSize:"9px", color:"#333", textTransform:"uppercase", letterSpacing:"1.5px", marginTop:"2px" }}>Urban Glass Comércio Ltda</div>
              <div style={{ fontSize:"9px", color:"#333", marginTop:"2px" }}>CNPJ: 65.668.970/0001-05</div>
              <div style={{ fontSize:"9px", color:"#333" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
              <div style={{ fontSize:"9px", color:"#333" }}>(32) 99986-0317</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"11px", color:"#333", textTransform:"uppercase", letterSpacing:"2px", marginBottom:"4px" }}>Romaneio de Saída</div>
              <div style={{ fontSize:"28px", fontWeight:900, color:"#2d5fa6", letterSpacing:"-1px" }}>{pedido.id}</div>
              <div style={{ fontSize:"11px", color:"#333", marginTop:"6px" }}>Emissão: <strong>{new Date().toLocaleDateString("pt-BR")}</strong></div>
              <div style={{ fontSize:"11px", color:"#333" }}>Pedido: <strong>{formatDate(pedido.dt_pedido)}</strong></div>
              <div style={{ display:"inline-block", marginTop:"6px", padding:"3px 10px", borderRadius:"4px", background:"#fdeaea", borderLeft:"3px solid #c00", fontSize:"9px", color:"#c00", fontWeight:700 }}>⚠ Não tem validade fiscal</div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"18px" }}>
            <div style={{ padding:"12px", background:"#f0f4ff", borderRadius:"8px", borderLeft:"4px solid #2d5fa6" }}>
              <div style={{ fontSize:"9px", fontWeight:700, color:"#2d5fa6", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"8px" }}>Comprador</div>
              <div style={{ fontSize:"13px", fontWeight:700, color:"#1a1a2e" }}>{pedido.clientes?.nome ?? "—"}</div>
              {(pedido.clientes as any)?.cnpj && <div style={{ fontSize:"10px", color:"#333", marginTop:"3px" }}>CNPJ: {(pedido.clientes as any).cnpj}</div>}
              {pedido.clientes?.cidade && <div style={{ fontSize:"10px", color:"#333" }}>{pedido.clientes.cidade}</div>}
              {pedido.clientes?.tel && <div style={{ fontSize:"10px", color:"#333" }}>Tel: {pedido.clientes.tel}</div>}
            </div>
            <div style={{ padding:"12px", background:"#f0f4ff", borderRadius:"8px", borderLeft:"4px solid #3d8c5c" }}>
              <div style={{ fontSize:"9px", fontWeight:700, color:"#3d8c5c", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"8px" }}>Condições Comerciais</div>
              <div style={{ fontSize:"11px", color:"#1a1a2e", display:"flex", flexDirection:"column", gap:"4px" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Pagamento</span><strong>{pedido.forma_pgto || "—"}</strong></div>
                {pedido.parcelas > 1 && <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Parcelas</span><strong>{pedido.parcelas}×</strong></div>}
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Retirada prevista</span><strong>{formatDate(pedido.dt_retirada)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Frete</span><strong>{pedido.frete || "Retirada"}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#333" }}>{(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml total" : "m² total"}</span>
                  <strong>
                    {(pedido.itens_pedido ?? []).reduce((s, item: any) => s + medidaReal(item, item.produtos?.unidade === "ml" || item.vidro_cliente === true), 0).toFixed(2)}
                    {" "}{(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml" : "m²"}
                  </strong>
                </div>
              </div>
            </div>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"16px", fontSize:"11px" }}>
            <thead>
              <tr style={{ background:"#2d5fa6" }}>
                {["#","Produto","Dimensão (mm)","Medida","Quantidade","Preço Unitário","Subtotal"].map((h, i) => (
                  <th key={i} style={{ padding:"8px", color:"white", fontWeight:700, fontSize:"9px", textAlign: i === 0 || i === 4 ? "center" : i >= 5 ? "right" : "left", letterSpacing:"0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(pedido.itens_pedido ?? []).map((item, i) => {
                const isML = (item as any).produtos?.unidade === "ml" || (item as any).vidro_cliente === true;
                return (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"center", color:"#000", fontSize:"10px", fontWeight:700 }}>{i + 1}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontWeight:700, color:"#000" }}>{item.produto_nome}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontFamily:"monospace", fontSize:"10px", fontWeight:700, color:"#000" }}>{item.largura} × {item.altura}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontFamily:"monospace", fontSize:"10px", fontWeight:700, color:"#000" }}>{medidaReal(item, isML).toFixed(3)} {isML ? "ml" : "m²"}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"center", fontWeight:700, color:"#000" }}>{item.quantidade}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"right", fontFamily:"monospace", fontSize:"10px", fontWeight:700, color:"#000" }}>{formatBRL(item.valor_m2)}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#2d5fa6" }}>{formatBRL(item.subtotal)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"18px" }}>
            <div style={{ padding:"12px", background:"#f0f4ff", borderRadius:"8px", borderLeft:"4px solid #2d5fa6" }}>
              <div style={{ fontSize:"9px", fontWeight:700, color:"#2d5fa6", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"8px" }}>Condições de Pagamento</div>
              <div style={{ display:"flex", flexDirection:"column", gap:"6px", fontSize:"11px" }}>
                {pedido.tem_ipi && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#333" }}>IPI ({ALIQ_IPI_PEDIDO}% sobre {formatBRL(pedido.valor_total)})</span>
                    <strong style={{ fontFamily:"monospace" }}>{formatBRL(pedido.valor_ipi)}</strong>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Recebido</span><strong style={{ fontFamily:"monospace", color:"#155724" }}>{formatBRL(pedido.valor_recebido)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid #d0daf0", paddingTop:"6px" }}>
                  <span style={{ color: aberto > 0 ? "#c00" : "#155724", fontWeight:700 }}>{aberto > 0 ? "Em aberto" : "✓ Quitado"}</span>
                  <strong style={{ fontFamily:"monospace", color: aberto > 0 ? "#c00" : "#155724" }}>{aberto > 0 ? formatBRL(aberto) : formatBRL(0)}</strong>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"flex-end" }}>
              <div style={{ minWidth:"220px", background:"#f0f4ff", borderRadius:"8px", padding:"12px", border:"1px solid #d0daf0" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"4px", paddingTop:"10px", borderTop:"2px solid #2d5fa6" }}>
                  <span style={{ fontWeight:700, fontSize:"13px", color:"#2d5fa6" }}>VALOR TOTAL</span>
                  <span style={{ fontFamily:"monospace", fontWeight:900, fontSize:"18px", color:"#2d5fa6" }}>{formatBRL(totalComIpi)}</span>
                </div>
              </div>
            </div>
          </div>
          {pedido.obs && (
            <div style={{ padding:"10px 14px", background:"#fffbea", borderRadius:"8px", marginBottom:"16px", fontSize:"10px", borderLeft:"3px solid #f59e0b" }}>
              <strong style={{ color:"#92400e" }}>Observações:</strong> <span style={{ color:"#333", fontWeight:700 }}>{pedido.obs}</span>
            </div>
          )}
          <div style={{ border:"1px dashed #999", borderRadius:"8px", padding:"10px 14px", marginTop:"18px", minHeight:"46px" }}>
            <div style={{ fontSize:"9px", fontWeight:700, color:"#666", textTransform:"uppercase", letterSpacing:"1px" }}>
              Observações / Ressalvas <span style={{ fontWeight:400, textTransform:"none", letterSpacing:"normal" }}>(avarias, divergência de quantidade, etc.)</span>
            </div>
          </div>
          <div style={{ textAlign:"left", fontSize:"10px", color:"#333", fontWeight:700, marginTop:"24px" }}>
            Data de saída: ____ / ____ / ______
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"32px", marginBottom:"16px", marginTop:"50px" }}>
            {["Vendedor / Urban Glass","Recebido por / Comprador","Motorista / Entregador"].map(label => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ borderTop:"1px solid #999", paddingTop:"8px", fontSize:"10px", color:"#333", fontWeight:700 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:"2px solid #2d5fa6", paddingTop:"8px", display:"flex", justifyContent:"space-between", fontSize:"8px", color:"#333", fontWeight:700 }}>
            <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05</div>
            <div style={{ color:"#c00", fontStyle:"italic", fontWeight:700 }}>Este documento não substitui a Nota Fiscal Eletrônica</div>
          </div>
        </div>
      </AppLayout>
    </>
  );
}

function Row({ label, value, accent, color }: { label: string; value: string | number; accent?: boolean; color?: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"12px" }}>
      <span style={{ fontSize:"13px", color:"var(--t3)", flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:"13px", fontWeight: accent ? 700 : 500, color: color ?? (accent ? "var(--acc)" : "var(--t1)"), textAlign:"right" }}>{value}</span>
    </div>
  );
}