"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidoById, avancarStatusPedido, recalcularRecebido, updatePedido, getCreditoCliente, atualizarCreditoCliente, utilizarCreditoEmPedido } from "@/services/pedidos.service";
import { getLancamentosPorPedido, deletarLancamento, createLancamento, updateLancamento } from "@/services/financeiro.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { Pedido, Lancamento } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";
import { supabase } from "@/lib/supabase/client";

const CHIP: Record<string, string> = {
  "Aguardando otimização":   "chip cy",
  "Em Produção – Corte":     "chip cp",
  "Em Produção – Lapidação": "chip co",
  "Separação":               "chip cb",
  "Finalizado":              "chip cg",
  "Entregue":                "chip cg",
  "Cancelado":               "chip cr",
};

const FLUXO = [
  "Aguardando otimização",
  "Em Produção – Corte",
  "Em Produção – Lapidação",
  "Separação",
  "Finalizado",
  "Entregue",
];

const CHAPAS_DIMS = [
  { w: 3300, h: 2250 }, { w: 2250, h: 3300 },
  { w: 3660, h: 2140 }, { w: 2140, h: 3660 },
  { w: 2150, h: 3660 }, { w: 3660, h: 2150 },
];

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

// Estado de pagamento por parcela no painel financeiro
interface PagamentoParcela {
  lancId: number;
  valorOriginal: number;
  valorDigitado: number; // 0 = usa valorOriginal
  marcando: boolean;
}

export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";
  const { toast } = useToast();

  const [pedido, setPedido]             = useState<Pedido | null>(null);
  const [lancamentos, setLancamentos]   = useState<Lancamento[]>([]);
  const [otimizacoes, setOtimizacoes]   = useState<HistoricoOtimizador[]>([]);
  const [clientes, setClientes]         = useState<{ id: number; nome: string }[]>([]);
  const [creditoCliente, setCreditoCliente] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [salvando, setSalvando]         = useState(false);

  const [editando, setEditando]         = useState(false);
  const [editForm, setEditForm]         = useState({
    cliente_id: 0, dt_pedido: "", dt_retirada: "",
    forma_pgto: "", conta: "", parcelas: 1, obs: "",
  });
  const [editParcelas, setEditParcelas] = useState<ParcelaEdit[]>([]);
  const [editItens, setEditItens]       = useState<ItemEdit[]>([]);

  // Estado de pagamento por parcela
  const [pagamentos, setPagamentos]     = useState<Record<number, PagamentoParcela>>({});

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
    const [data, lancs, otims, clis] = await Promise.all([
      getPedidoById(id),
      getLancamentosPorPedido(id),
      getOtimizacoesPorPedido(id),
      supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome").then(r => r.data ?? []),
    ]);
    setPedido(data);
    setLancamentos(lancs);
    setOtimizacoes(otims);
    setClientes(clis as { id: number; nome: string }[]);
    if (data?.cliente_id) {
      const cred = await getCreditoCliente(data.cliente_id);
      setCreditoCliente(cred);
    }
    // Inicializa estado de pagamento para parcelas A Receber
    const initPag: Record<number, PagamentoParcela> = {};
    for (const l of lancs) {
      if (l.status === "A Receber") {
        initPag[l.id] = { lancId: l.id, valorOriginal: Number(l.valor), valorDigitado: 0, marcando: false };
      }
    }
    setPagamentos(initPag);
    setLoading(false);
  }

  function abrirEdicao() {
    if (!pedido) return;
    setEditForm({
      cliente_id:  pedido.cliente_id,
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
      const valorParcela = parseFloat((pedido.valor_total / n).toFixed(2));
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
      valor: pedido ? parseFloat((pedido.valor_total / n).toFixed(2)) : 0,
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
  const m2TotalEditado    = editItens.reduce((a, i) => a + calcM2Item(i), 0);

  async function salvarEdicao() {
    if (!pedido) return;
    setSalvando(true);

    const result = await updatePedido(pedido.id, {
      cliente_id:   editForm.cliente_id,
      dt_pedido:    editForm.dt_pedido,
      dt_retirada:  editForm.dt_retirada || null,
      forma_pgto:   editForm.forma_pgto,
      conta:        editForm.conta,
      parcelas:     editForm.parcelas,
      obs:          editForm.obs,
      datas_pgto:   editParcelas.map(p => p.data).filter(d => d),
      valores_pgto: editParcelas.map(p => p.valor),
      valor_total:  parseFloat(valorTotalEditado.toFixed(2)),
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
      });
    }
    await recalcularRecebido(pedido.id);

    toast("Pedido atualizado");
    setSalvando(false);
    setEditando(false);
    await load();
  }

  // Marcar parcela como paga (checkbox)
async function handleMarcarPago(lancId: number) {
  if (!pedido) return;
  const pag = pagamentos[lancId];
  if (!pag) return;

  setPagamentos(prev => ({ ...prev, [lancId]: { ...prev[lancId], marcando: true } }));

  const valorPagar = pag.valorDigitado > 0 ? pag.valorDigitado : pag.valorOriginal;

  // Marca o lançamento existente como Pago com o valor correto
  await updateLancamento(lancId, {
    status: "Pago",
    valor: valorPagar,
    vencimento: hoje(),
  });

  // Recalcula valor_recebido do pedido somando só os Pagos
  await recalcularRecebido(pedido.id);

  const excedente = Math.max(0, valorPagar - pag.valorOriginal);
  if (excedente > 0.005 && pedido.cliente_id) {
    const creditoAtual = await getCreditoCliente(pedido.cliente_id);
    await atualizarCreditoCliente(pedido.cliente_id, creditoAtual + excedente);
  }

  toast(`✓ ${formatBRL(valorPagar)} registrado`);
  await load();
}

  async function handleDeletarLancamento(lancId: number) {
    if (!pedido) return;
    if (!confirm("Remover este lançamento?")) return;
    setSalvando(true);
    const ok = await deletarLancamento(lancId);
    if (!ok) { toast("Erro ao remover lançamento", "err"); setSalvando(false); return; }
    await recalcularRecebido(pedido.id);
    toast("Lançamento removido");
    await load();
    setSalvando(false);
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

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando pedido...</div></div></AppLayout>;
  if (!pedido) return <AppLayout><div className="con"><div style={{ color:"var(--err)", padding:"32px" }}>Pedido não encontrado.</div></div></AppLayout>;

  const aberto       = Number(pedido.valor_total) - Number(pedido.valor_recebido);
  const quitado      = aberto <= 0;
  const pctRec       = pedido.valor_total > 0 ? Math.min(100, (Number(pedido.valor_recebido) / Number(pedido.valor_total)) * 100) : 0;
  const statusIdx    = FLUXO.indexOf(pedido.status);
  const podeAvancar  = !["Entregue","Cancelado"].includes(pedido.status);
  const temItens     = (pedido.itens_pedido?.length ?? 0) > 0;
  const podeRomaneio = ["Finalizado","Entregue"].includes(pedido.status);
  const temOtimizacao = otimizacoes.length > 0;
  const ultimaOtim   = otimizacoes[0] ?? null;
  const todosVidroCliente = temItens && (pedido.itens_pedido ?? []).every(i => (i as any).vidro_cliente === true);
  const todosChapa        = temItens && (pedido.itens_pedido ?? []).every(i => isChapaInteira(i.largura, i.altura));
  const bloqueadoSemOtim  = pedido.status === "Aguardando otimização" && !temOtimizacao && !todosVidroCliente && !todosChapa;

  const parcelasAReceber = lancamentos.filter(l => l.status === "A Receber").sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""));
  const lancamentosPagos = lancamentos.filter(l => l.status === "Pago");

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
          <button className="btn bg sm" onClick={() => router.push(`/pedidos/${id}/editar`)}>✏ Editar</button>
          {temItens && !todosVidroCliente && !todosChapa && (
            <a href={"/otimizador?pedido=" + pedido.id} className="btn bg sm">◈ Otimizar Corte</a>
          )}
          {(temOtimizacao || todosChapa) && (
            <a href={"/pedidos/" + pedido.id + "/etiquetas"} className="btn bg sm" style={{ textDecoration:"none" }}>🏷 Etiquetas</a>
          )}
          <button
            className="btn sm"
            onClick={() => podeRomaneio && handlePrintRomaneio()}
            style={{ background: podeRomaneio ? "rgba(16,185,129,.15)" : "transparent", border: "1px solid " + (podeRomaneio ? "var(--ok)" : "var(--b2)"), color: podeRomaneio ? "var(--ok)" : "var(--t3)", fontWeight:700, cursor: podeRomaneio ? "pointer" : "default", opacity: podeRomaneio ? 1 : 0.35, transition:"all 0.2s" }}
          >R</button>
          {podeAvancar && (
            <button className="btn bp sm" onClick={handleAvancar} disabled={salvando || bloqueadoSemOtim} style={bloqueadoSemOtim ? { opacity:0.45, cursor:"not-allowed" } : {}}>
              {salvando ? "Salvando..." : bloqueadoSemOtim ? "⚠ Otimização pendente" : "Avançar Status →"}
            </button>
          )}
        </div>

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
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:"100%" }}>
              {FLUXO.map((step, i) => {
                const done    = i < statusIdx;
                const current = i === statusIdx;
                const last    = i === FLUXO.length - 1;
                return (
                  <div key={step} style={{ display:"flex", alignItems:"center", flex: last ? "0 0 auto" : "1 1 0", minWidth:0 }}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"6px", width:"80px", flexShrink:0 }}>
                      <div style={{ width:"26px", height:"26px", borderRadius:"50%", background: done ? "var(--ok)" : current ? "var(--acc)" : "var(--surf3)", border: current ? "2px solid var(--acc)" : "2px solid transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontWeight:700, color: done || current ? "#000" : "var(--t3)", flexShrink:0 }}>
                        {done ? "✓" : i + 1}
                      </div>
                      <div style={{ fontSize:"9px", textAlign:"center", lineHeight:1.3, color: current ? "var(--acc)" : done ? "var(--ok)" : "var(--t3)", fontWeight: current ? 700 : 500, fontFamily:"'DM Mono', monospace", wordBreak:"break-word" }}>
                        {step}
                      </div>
                    </div>
                    {!last && <div style={{ flex:"1 1 auto", height:"2px", marginBottom:"18px", background: done ? "var(--ok)" : "var(--surf3)", minWidth:"12px" }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid info + financeiro */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" }}>
            <div className="card" style={{ padding:"20px 24px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>INFORMAÇÕES DO PEDIDO</div>
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                <Row label="Cliente"            value={pedido.clientes?.nome ?? "—"} />
                <Row label="Cidade"             value={pedido.clientes?.cidade ?? "—"} />
                <Row label="Telefone"           value={pedido.clientes?.tel ?? "—"} />
                <Row label="Data do pedido"     value={formatDate(pedido.dt_pedido)} />
                <Row label="Retirada prevista"  value={formatDate(pedido.dt_retirada)} />
                <Row label={(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml total" : "m² total"} value={Number(pedido.m2_total).toFixed(2) + " " + ((pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml" : "m²")} />
                <Row label="Forma de pagamento" value={pedido.forma_pgto || "—"} />
                {pedido.parcelas > 1 && <Row label="Parcelas" value={pedido.parcelas + "×"} />}
                {pedido.obs && <Row label="Observações" value={pedido.obs} />}
              </div>
            </div>

            <div className="card" style={{ padding:"20px 24px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>FINANCEIRO</div>

              {/* Resumo */}
              <div style={{ display:"flex", flexDirection:"column", gap:"8px", marginBottom:"16px" }}>
                <Row label="Valor total" value={formatBRL(pedido.valor_total)} accent />
                <Row label="Recebido"    value={formatBRL(pedido.valor_recebido)} color={pedido.valor_recebido > 0 ? "var(--ok)" : "var(--t2)"} />
                <Row label="Em aberto"   value={formatBRL(Math.max(0, aberto))} color={quitado ? "var(--ok)" : "var(--err)"} />
              </div>

              {/* Barra de progresso */}
              <div style={{ marginBottom:"16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginBottom:"6px" }}>
                  <span>Recebimento</span><span>{pctRec.toFixed(0)}%</span>
                </div>
                <div style={{ height:"6px", borderRadius:"3px", background:"var(--surf3)", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"3px", width:`${pctRec}%`, background: quitado ? "var(--ok)" : "var(--acc)", transition:"width .3s" }} />
                </div>
              </div>

              {/* Parcelas a receber com checkbox */}
              {parcelasAReceber.length > 0 && (
                <div style={{ marginBottom:"16px" }}>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"8px" }}>PARCELAS A RECEBER</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                    {parcelasAReceber.map((l, idx) => {
                      const pag = pagamentos[l.id];
                      const marcando = pag?.marcando ?? false;
                      const valorDigitado = pag?.valorDigitado ?? 0;
                      const vencido = l.vencimento && l.vencimento < hoje();
                      return (
                        <div key={l.id} style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:`1px solid ${vencido ? "rgba(244,63,94,.3)" : "var(--b2)"}` }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              disabled={marcando}
                              onChange={() => handleMarcarPago(l.id)}
                              style={{ width:"16px", height:"16px", accentColor:"var(--ok)", cursor:"pointer", flexShrink:0 }}
                              title="Marcar como pago"
                            />
                            {/* Descrição */}
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {l.descricao}
                              </div>
                              <div style={{ fontSize:"10px", color: vencido ? "var(--err)" : "var(--t3)", fontFamily:"'DM Mono',monospace", marginTop:"2px" }}>
                                {vencido ? "⚠ Vencido · " : ""}{formatDate(l.vencimento)}
                              </div>
                            </div>
                            {/* Valor original */}
                            <div style={{ fontSize:"13px", fontWeight:700, color:"var(--t1)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                              {formatBRL(l.valor)}
                            </div>
                            {/* Lixeira */}
                            <button
                              title="Remover parcela"
                              onClick={() => handleDeletarLancamento(l.id)}
                              style={{ background:"transparent", border:"1px solid var(--b2)", borderRadius:"5px", color:"var(--t3)", fontSize:"11px", cursor:"pointer", padding:"3px 7px", transition:"all 0.15s", lineHeight:1, flexShrink:0 }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="rgba(244,63,94,.15)"; b.style.borderColor="var(--err)"; b.style.color="var(--err)"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="transparent"; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                            >🗑</button>
                          </div>
                          {/* Campo valor diferente — aparece abaixo */}
                          <div style={{ marginTop:"8px", display:"flex", alignItems:"center", gap:"8px" }}>
                            <span style={{ fontSize:"10px", color:"var(--t3)", whiteSpace:"nowrap" }}>Valor diferente:</span>
                            <CurrencyInput
                              value={valorDigitado}
                              onChange={v => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], valorDigitado: v } }))}
                              placeholder={`deixe 0 para usar ${formatBRL(l.valor)}`}
                              style={{ margin:0, fontSize:"11px", padding:"5px 8px", flex:1 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Histórico de pagamentos já feitos */}
              {lancamentosPagos.length > 0 && (
                <div style={{ marginBottom:"16px" }}>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"8px" }}>HISTÓRICO PAGO</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"5px" }}>
                    {lancamentosPagos.map(l => (
                      <div key={l.id} style={{ display:"flex", alignItems:"center", gap:"8px", background:"var(--surf2)", borderRadius:"6px", padding:"8px 10px" }}>
                        <span style={{ fontSize:"11px", color:"var(--ok)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>✓ Pago</span>
                        <span style={{ fontSize:"13px", color:"var(--ok)", fontFamily:"'DM Mono', monospace", fontWeight:600, flex:1 }}>{formatBRL(l.valor)}</span>
                        <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono', monospace" }}>{formatDate(l.vencimento)}</span>
                        <button
                          title="Remover"
                          onClick={() => handleDeletarLancamento(l.id)}
                          style={{ background:"transparent", border:"1px solid var(--b2)", borderRadius:"5px", color:"var(--t3)", fontSize:"11px", cursor:"pointer", padding:"3px 7px", transition:"all 0.15s", lineHeight:1 }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="rgba(244,63,94,.15)"; b.style.borderColor="var(--err)"; b.style.color="var(--err)"; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="transparent"; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                        >🗑</button>
                      </div>
                    ))}
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
            </div>
          </div>

          {/* Itens */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ITENS DO PEDIDO ({pedido.itens_pedido?.length ?? 0})</div>
              {temItens && !todosVidroCliente && !todosChapa && (
                <a href={"/otimizador?pedido=" + pedido.id} className="btn bg xs">◈ Otimizar Corte</a>
              )}
            </div>
            {!temItens ? (
              <div style={{ color:"var(--t3)", padding:"24px 0", textAlign:"center" }}>Nenhum item registrado neste pedido.</div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr><th>#</th><th>Produto</th><th>Dimensão</th><th>Medida</th><th>Qtd</th><th>Preço/un.</th><th>V.Cliente</th><th>Subtotal</th></tr>
                  </thead>
                  <tbody>
                    {pedido.itens_pedido!.map((item, i) => {
                      const isML = (item as any).produtos?.unidade === "ml" || (item as any).vidro_cliente === true;
                      const medida = Number(item.m2).toFixed(3);
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
            )}
          </div>
        </div>

        {/* ── MODAL EDIÇÃO ── */}
        {editando && (
          <div className="mov open" >
            <div className="mod" style={{ width:"780px", maxHeight:"90vh", overflowY:"auto" }}>
              <div className="mhd">
                <div className="mtit">Editar Pedido · {pedido.id}</div>
                <button className="mcl" onClick={() => setEditando(false)}>✕</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                <div className="fg">
                  <label className="fl">Cliente</label>
                  <select style={fc} value={editForm.cliente_id} onChange={e => setEditForm(f => ({ ...f, cliente_id: Number(e.target.value) }))}>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="fr">
                  <div className="fg"><label className="fl">Data do Pedido</label><DateInput value={editForm.dt_pedido} onChange={v => setEditForm(f => ({ ...f, dt_pedido: v }))} /></div>
                  <div className="fg"><label className="fl">Previsão Retirada</label><DateInput value={editForm.dt_retirada} onChange={v => setEditForm(f => ({ ...f, dt_retirada: v }))} /></div>
                </div>
                <div className="fr">
                  <div className="fg">
                    <label className="fl">Forma de Pagamento</label>
                    <select style={fc} value={editForm.forma_pgto} onChange={e => setEditForm(f => ({ ...f, forma_pgto: e.target.value }))}>
                      <option value="">Selecione...</option>
                      {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Conta</label>
                    <select style={fc} value={editForm.conta} onChange={e => setEditForm(f => ({ ...f, conta: e.target.value }))}>
                      <option value="">Selecione...</option>
                      {["ZRS","Itaú","Bradesco","Nubank","Caixa Econômica","Santander"].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Parcelas</label>
                  <select style={fc} value={editForm.parcelas} onChange={e => handleEditParcelas(Number(e.target.value))}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                  </select>
                </div>
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
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 62px 62px 44px 90px 62px 42px 78px", gap:"6px", marginBottom:"6px", paddingBottom:"6px", borderBottom:"1px solid var(--b1)" }}>
                    {["Produto","Larg.","Alt.","Qtd","R$/m²","Lapid.","V.Cli","Subtotal"].map(h => (
                      <div key={h} style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", fontFamily:"'DM Mono',monospace" }}>{h}</div>
                    ))}
                  </div>
                  {editItens.map((item, idx) => {
                    const m2  = calcM2Item(item);
                    const sub = calcSubtotalItem(item);
                    return (
                      <div key={item.id} style={{ marginBottom:"10px" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"2fr 62px 62px 44px 90px 62px 42px 78px", gap:"6px", alignItems:"center" }}>
                          <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", padding:"7px 10px", background:"var(--surf1)", borderRadius:"6px", border:"1px solid var(--b1)" }}>
                            {item.produto_nome}
                          </div>
                          <input style={fcSm} type="number" value={item.largura || ""} onChange={e => updEditItem(idx, "largura", parseInt(e.target.value) || 0)} placeholder="0" />
                          <input style={fcSm} type="number" value={item.altura || ""} onChange={e => updEditItem(idx, "altura", parseInt(e.target.value) || 0)} placeholder="0" />
                          <input style={fcSm} type="number" value={item.quantidade} onChange={e => updEditItem(idx, "quantidade", parseInt(e.target.value) || 1)} min={1} />
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
                    <span style={{ fontSize:"15px", fontWeight:800, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(valorTotalEditado)}</span>
                  </div>
                </div>

                <div className="fg">
                  <label className="fl">Observações</label>
                  <textarea style={{ ...fc, minHeight:"80px", resize:"vertical", fontFamily:"'Inter',sans-serif" }}
                    value={editForm.obs} onChange={e => setEditForm(f => ({ ...f, obs: e.target.value }))}
                    placeholder="Observações do pedido..." />
                </div>
                <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", paddingTop:"4px" }}>
                  <button className="btn bg" onClick={() => setEditando(false)}>Cancelar</button>
                  <button className="btn bp" onClick={salvarEdicao} disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>
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
              <div style={{ display:"inline-block", marginTop:"8px", padding:"3px 14px", borderRadius:"99px", fontSize:"10px", fontWeight:700, letterSpacing:"1px", background:"#d4edda", color:"#155724", border:"1px solid #c3e6cb" }}>
                {pedido.status.toUpperCase()}
              </div>
              <div style={{ fontSize:"9px", color:"#c00", marginTop:"6px", fontStyle:"italic" }}>⚠ Não tem validade fiscal</div>
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
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#333" }}>{(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml total" : "m² total"}</span>
                  <strong>{Number(pedido.m2_total).toFixed(2)} {(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml" : "m²"}</strong>
                </div>
              </div>
            </div>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"16px", fontSize:"11px" }}>
            <thead>
              <tr style={{ background:"#2d5fa6" }}>
                {["#","Produto","Dimensão (mm)","Medida","Qtd","Preço/un.","Subtotal"].map((h, i) => (
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
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontFamily:"monospace", fontSize:"10px", fontWeight:700, color:"#000" }}>{Number(item.m2).toFixed(3)} {isML ? "ml" : "m²"}</td>
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
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Valor total</span><strong style={{ fontFamily:"monospace" }}>{formatBRL(pedido.valor_total)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Recebido</span><strong style={{ fontFamily:"monospace", color:"#155724" }}>{formatBRL(pedido.valor_recebido)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid #d0daf0", paddingTop:"6px" }}>
                  <span style={{ color: aberto > 0 ? "#c00" : "#155724", fontWeight:700 }}>{aberto > 0 ? "Em aberto" : "✓ Quitado"}</span>
                  <strong style={{ fontFamily:"monospace", color: aberto > 0 ? "#c00" : "#155724" }}>{aberto > 0 ? formatBRL(aberto) : formatBRL(0)}</strong>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"flex-end" }}>
              <div style={{ minWidth:"220px", background:"#f0f4ff", borderRadius:"8px", padding:"12px", border:"1px solid #d0daf0" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:"10px", borderTop:"2px solid #2d5fa6" }}>
                  <span style={{ fontWeight:700, fontSize:"13px", color:"#2d5fa6" }}>VALOR TOTAL</span>
                  <span style={{ fontFamily:"monospace", fontWeight:900, fontSize:"18px", color:"#2d5fa6" }}>{formatBRL(pedido.valor_total)}</span>
                </div>
              </div>
            </div>
          </div>
          {pedido.obs && (
            <div style={{ padding:"10px 14px", background:"#fffbea", borderRadius:"8px", marginBottom:"16px", fontSize:"10px", borderLeft:"3px solid #f59e0b" }}>
              <strong style={{ color:"#92400e" }}>Observações:</strong> <span style={{ color:"#333", fontWeight:700 }}>{pedido.obs}</span>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"32px", marginBottom:"16px", marginTop:"32px" }}>
            {["Vendedor / Urban Glass","Recebido por / Comprador","Motorista / Entregador"].map(label => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ borderTop:"1px solid #999", paddingTop:"8px", fontSize:"10px", color:"#333", fontWeight:700 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:"2px solid #2d5fa6", paddingTop:"8px", display:"flex", justifyContent:"space-between", fontSize:"8px", color:"#333", fontWeight:700 }}>
            <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
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