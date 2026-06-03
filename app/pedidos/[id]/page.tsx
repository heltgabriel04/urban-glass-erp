"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidoById, avancarStatusPedido, registrarRecebimento, recalcularRecebido, updatePedido } from "@/services/pedidos.service";
import { getLancamentosPorPedido, deletarLancamento, createLancamento } from "@/services/financeiro.service";
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

function hoje() { return new Date().toISOString().split("T")[0]; }

function formatarValorDigitado(raw: string): string {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  const num = parseInt(nums, 10) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parsearValor(formatted: string): number {
  return parseFloat(formatted.replace(/\./g, "").replace(",", ".")) || 0;
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
  lancamento_id?: number; // id do lançamento existente no banco
}

export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";
  const { toast } = useToast();

  const [pedido, setPedido]           = useState<Pedido | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [otimizacoes, setOtimizacoes] = useState<HistoricoOtimizador[]>([]);
  const [clientes, setClientes]       = useState<{ id: number; nome: string }[]>([]);
  const [loading, setLoading]         = useState(true);
  const [recebendo, setRecebendo]     = useState(false);
  const [valorRec, setValorRec]       = useState("");
  const [dataRec, setDataRec]         = useState(hoje());
  const [salvando, setSalvando]       = useState(false);

  // ── Modal de edição ──────────────────────────────────────
  const [editando, setEditando]       = useState(false);
  const [editForm, setEditForm]       = useState({
    cliente_id: 0,
    dt_pedido: "",
    dt_retirada: "",
    forma_pgto: "",
    conta: "",
    parcelas: 1,
    obs: "",
  });
  const [editParcelas, setEditParcelas] = useState<ParcelaEdit[]>([]);

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (autoPrint && !loading && pedido) {
      const timer = setTimeout(() => { window.print(); }, 800);
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
    // Monta parcelas a partir dos lançamentos "A Receber" existentes
    const aReceber = lancamentos.filter(l => l.status === "A Receber").sort((a, b) =>
      (a.vencimento ?? "").localeCompare(b.vencimento ?? "")
    );
    if (aReceber.length > 0) {
      setEditParcelas(aReceber.map(l => ({
        data: l.vencimento ?? "",
        valor: l.valor,
        lancamento_id: l.id,
      })));
    } else {
      // Se não tem lançamentos, distribui igualmente
      const n = pedido.parcelas ?? 1;
      const valorParcela = parseFloat((pedido.valor_total / n).toFixed(2));
      const datas = pedido.datas_pgto ?? [];
      setEditParcelas(Array.from({ length: n }, (_, i) => ({
        data: datas[i] ?? "",
        valor: valorParcela,
      })));
    }
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
      ...p,
      data: !data ? "" : (i === 0 ? data : addMeses(data, i)),
    })));
  }

  async function salvarEdicao() {
    if (!pedido) return;
    setSalvando(true);

    // Atualiza pedido
    const result = await updatePedido(pedido.id, {
      cliente_id:  editForm.cliente_id,
      dt_pedido:   editForm.dt_pedido,
      dt_retirada: editForm.dt_retirada || null,
      forma_pgto:  editForm.forma_pgto,
      conta:       editForm.conta,
      parcelas:    editForm.parcelas,
      obs:         editForm.obs,
      datas_pgto:  editParcelas.map(p => p.data).filter(d => d),
      valores_pgto: editParcelas.map(p => p.valor),
    });

    if (!result) { toast("Erro ao salvar pedido", "err"); setSalvando(false); return; }

    // Atualiza lançamentos A Receber: remove os antigos e recria
    const aReceber = lancamentos.filter(l => l.status === "A Receber");
    for (const l of aReceber) {
      await deletarLancamento(l.id);
    }
    for (let i = 0; i < editParcelas.length; i++) {
      const p = editParcelas[i];
      if (!p.data || p.valor <= 0) continue;
      await createLancamento({
        tipo: "Entrada",
        descricao: editForm.parcelas === 1
          ? `Recebimento · ${pedido.id}`
          : `Parcela ${i + 1}/${editForm.parcelas} · ${pedido.id}`,
        valor: p.valor,
        status: "A Receber",
        vencimento: p.data,
        pedido_id: pedido.id,
        cliente_id: editForm.cliente_id,
      });
    }

    toast("Pedido atualizado");
    setSalvando(false);
    setEditando(false);
    await load();
  }

  function handleValorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    setValorRec(formatarValorDigitado(raw));
  }

  async function handleAvancar() {
    if (!pedido) return;
    if (pedido.status === "Aguardando otimização" && otimizacoes.length === 0 && !todosVidroCliente) {
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

  async function handleReceber() {
    if (!pedido) return;
    const valor = parsearValor(valorRec);
    if (!valor || valor <= 0) { toast("Informe um valor válido", "warn"); return; }
    const aberto = Number(pedido.valor_total) - Number(pedido.valor_recebido);
    if (valor > aberto + 0.01) { toast(`Valor máximo: ${formatBRL(aberto)}`, "warn"); return; }
    setSalvando(true);
    const result = await registrarRecebimento(pedido.id, valor, dataRec);
    setSalvando(false);
    if (!result) { toast("Erro ao registrar recebimento", "err"); return; }
    toast(valor >= aberto - 0.01 ? `✓ Pedido ${pedido.id} quitado!` : `${formatBRL(valor)} registrado`);
    setValorRec(""); setDataRec(hoje()); setRecebendo(false);
    await load();
  }

  async function handleDeletarLancamento(lancId: number) {
    if (!pedido) return;
    if (!confirm("Remover este recebimento?")) return;
    setSalvando(true);
    const ok = await deletarLancamento(lancId);
    if (!ok) { toast("Erro ao remover lançamento", "err"); setSalvando(false); return; }
    await recalcularRecebido(pedido.id);
    toast("Recebimento removido");
    await load();
    setSalvando(false);
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
  const bloqueadoSemOtim  = pedido.status === "Aguardando otimização" && !temOtimizacao && !todosVidroCliente;

  const fc: React.CSSProperties = {
    background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "6px",
    padding: "9px 12px", color: "var(--t1)", fontSize: "13px",
    outline: "none", width: "100%", boxSizing: "border-box",
  };

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

          {/* Botão Editar */}
          <button className="btn bg sm" onClick={abrirEdicao}>✏ Editar</button>

          {temItens && !todosVidroCliente && (
            <a href={"/otimizador?pedido=" + pedido.id} className="btn bg sm">◈ Otimizar Corte</a>
          )}

          {temOtimizacao && (
            <a href={"/pedidos/" + pedido.id + "/etiquetas"} className="btn bg sm" style={{ textDecoration:"none" }}>
              🏷 Etiquetas
            </a>
          )}

          <button
            className="btn sm"
            onClick={() => podeRomaneio && window.print()}
            title={podeRomaneio ? "Imprimir Romaneio de Saída" : "Disponível a partir de Finalizado"}
            style={{
              background: podeRomaneio ? "rgba(16,185,129,.15)" : "transparent",
              border: "1px solid " + (podeRomaneio ? "var(--ok)" : "var(--b2)"),
              color: podeRomaneio ? "var(--ok)" : "var(--t3)",
              fontWeight:700, cursor: podeRomaneio ? "pointer" : "default",
              opacity: podeRomaneio ? 1 : 0.35, transition:"all 0.2s",
            }}
          >R</button>

          {podeAvancar && (
            <button
              className="btn bp sm"
              onClick={handleAvancar}
              disabled={salvando}
              style={bloqueadoSemOtim ? { opacity:0.45, cursor:"not-allowed" } : {}}
            >
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
                <Row label="m² total"           value={Number(pedido.m2_total).toFixed(2) + " m²"} />
                <Row label="Forma de pagamento" value={pedido.forma_pgto || "—"} />
                {pedido.parcelas > 1 && <Row label="Parcelas" value={pedido.parcelas + "×"} />}
                {pedido.obs && <Row label="Observações" value={pedido.obs} />}
              </div>
            </div>

            <div className="card" style={{ padding:"20px 24px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>FINANCEIRO</div>
              <div style={{ display:"flex", flexDirection:"column", gap:"10px", marginBottom:"16px" }}>
                <Row label="Valor total" value={formatBRL(pedido.valor_total)} accent />
                <Row label="Recebido"    value={formatBRL(pedido.valor_recebido)} color={pedido.valor_recebido > 0 ? "var(--ok)" : "var(--t2)"} />
                <Row label="Em aberto"   value={formatBRL(Math.max(0, aberto))} color={quitado ? "var(--ok)" : "var(--err)"} />
              </div>
              <div style={{ marginBottom:"16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginBottom:"6px" }}>
                  <span>Recebimento</span><span>{pctRec.toFixed(0)}%</span>
                </div>
                <div style={{ height:"6px", borderRadius:"3px", background:"var(--surf3)", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"3px", width:`${pctRec}%`, background: quitado ? "var(--ok)" : "var(--acc)", transition:"width .3s" }} />
                </div>
              </div>
              {lancamentos.length > 0 && (
                <div style={{ marginBottom:"16px" }}>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"8px" }}>HISTÓRICO</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"5px" }}>
                    {lancamentos.map(l => (
                      <div key={l.id} style={{ display:"flex", alignItems:"center", gap:"8px", background:"var(--surf2)", borderRadius:"6px", padding:"8px 10px" }}>
                        <span style={{ fontSize:"11px", color: l.status === "Pago" ? "var(--ok)" : "var(--t3)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                          {l.status === "Pago" ? "✓ Pago" : "⏳ A receber"}
                        </span>
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
              {!quitado && (
                <div>
                  {!recebendo ? (
                    <button className="btn bp sm" style={{ width:"100%" }} onClick={() => { setRecebendo(true); setValorRec(""); setDataRec(hoje()); }}>
                      + Registrar Recebimento
                    </button>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                      <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                        <div style={{ flex:2, display:"flex", alignItems:"center", background:"var(--surf2)", border:"1px solid var(--acc)", borderRadius:"6px", padding:"0 10px", gap:"6px" }}>
                          <span style={{ fontSize:"13px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", flexShrink:0 }}>R$</span>
                          <input type="text" inputMode="numeric" placeholder="0,00" value={valorRec} onChange={handleValorChange}
                            style={{ flex:1, background:"transparent", border:"none", outline:"none", color:"var(--t1)", fontSize:"15px", fontFamily:"'DM Mono', monospace", padding:"10px 0" }} autoFocus />
                        </div>
                        <input type="date" value={dataRec} onChange={e => setDataRec(e.target.value)}
                          style={{ flex:1, background:"var(--surf2)", border:"1px solid var(--b2)", borderRadius:"6px", padding:"10px 8px", color:"var(--t1)", fontSize:"12px", fontFamily:"'DM Mono', monospace", outline:"none" }} />
                        <button className="btn bp sm" onClick={handleReceber} disabled={salvando}>{salvando ? "..." : "Salvar"}</button>
                        <button className="btn bg sm" onClick={() => { setRecebendo(false); setValorRec(""); }}>✕</button>
                      </div>
                      <div style={{ fontSize:"11px", color:"var(--t3)", textAlign:"right" }}>Máximo: {formatBRL(aberto)}</div>
                    </div>
                  )}
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
              {temItens && !todosVidroCliente && (
                <a href={"/otimizador?pedido=" + pedido.id} className="btn bg xs">◈ Otimizar Corte</a>
              )}
            </div>
            {!temItens ? (
              <div style={{ color:"var(--t3)", padding:"24px 0", textAlign:"center" }}>Nenhum item registrado neste pedido.</div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr><th>#</th><th>Produto</th><th>Dimensão</th><th>m²</th><th>Qtd</th><th>R$/m²</th><th>Lapidação</th><th>V.Cliente</th><th>Subtotal</th></tr>
                  </thead>
                  <tbody>
                    {pedido.itens_pedido!.map((item, i) => (
                      <tr key={item.id}>
                        <td className="mono" style={{ color:"var(--t3)" }}>{i + 1}</td>
                        <td><strong>{item.produto_nome}</strong></td>
                        <td className="mono">{item.largura} × {item.altura} mm</td>
                        <td className="mono">{Number(item.m2).toFixed(3)}</td>
                        <td className="mono">{item.quantidade}</td>
                        <td className="mono">{formatBRL(item.valor_m2)}</td>
                        <td className="mono">{item.lapidacao > 0 ? formatBRL(item.lapidacao) : <span style={{ color:"var(--t3)" }}>—</span>}</td>
                        <td style={{ textAlign:"center" }}>
                          {(item as any).vidro_cliente ? <span style={{ color:"var(--warn)" }}>📦</span> : <span style={{ color:"var(--t3)" }}>—</span>}
                        </td>
                        <td className="mono" style={{ color:"var(--acc)", fontWeight:600 }}>{formatBRL(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── MODAL EDIÇÃO ── */}
        {editando && (
          <div className="mov open" onClick={e => e.target === e.currentTarget && setEditando(false)}>
            <div className="mod" style={{ width:"620px", maxHeight:"90vh", overflowY:"auto" }}>
              <div className="mhd">
                <div className="mtit">Editar Pedido · {pedido.id}</div>
                <button className="mcl" onClick={() => setEditando(false)}>✕</button>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>

                {/* Cliente */}
                <div className="fg">
                  <label className="fl">Cliente</label>
                  <select style={fc} value={editForm.cliente_id} onChange={e => setEditForm(f => ({ ...f, cliente_id: Number(e.target.value) }))}>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>

                {/* Datas */}
                <div className="fr">
                  <div className="fg"><label className="fl">Data do Pedido</label><DateInput value={editForm.dt_pedido} onChange={v => setEditForm(f => ({ ...f, dt_pedido: v }))} /></div>
                  <div className="fg"><label className="fl">Previsão Retirada</label><DateInput value={editForm.dt_retirada} onChange={v => setEditForm(f => ({ ...f, dt_retirada: v }))} /></div>
                </div>

                {/* Pagamento */}
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

                {/* Parcelas */}
                <div className="fg">
                  <label className="fl">Parcelas</label>
                  <select style={fc} value={editForm.parcelas} onChange={e => handleEditParcelas(Number(e.target.value))}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                  </select>
                </div>

                {/* Datas e valores das parcelas */}
                <div style={{ padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"10px", textTransform:"uppercase" }}>
                    {editForm.parcelas === 1 ? "Pagamento" : `Parcelas (${editForm.parcelas}x)`}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns: editForm.parcelas > 1 ? "50px 1fr 130px" : "1fr 130px", gap:"8px", marginBottom:"6px", paddingBottom:"6px", borderBottom:"1px solid var(--b1)" }}>
                    {editForm.parcelas > 1 && <span />}
                    <span style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px" }}>Data</span>
                    <span style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", textAlign:"right" }}>Valor (R$)</span>
                  </div>
                  {editParcelas.map((p, idx) => (
                    <div key={idx} style={{ display:"grid", gridTemplateColumns: editForm.parcelas > 1 ? "50px 1fr 130px" : "1fr 130px", gap:"8px", alignItems:"center", marginBottom:"6px" }}>
                      {editForm.parcelas > 1 && (
                        <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{idx + 1}ª</span>
                      )}
                      <DateInput
                        value={p.data}
                        onChange={v => {
                          if (idx === 0) handlePrimeiraDtEdit(v);
                          else setEditParcelas(prev => prev.map((x, i) => i === idx ? { ...x, data: v } : x));
                        }}
                      />
                      <CurrencyInput
                        value={p.valor}
                        onChange={v => setEditParcelas(prev => prev.map((x, i) => i === idx ? { ...x, valor: v } : x))}
                        placeholder="R$ 0,00"
                        style={{ margin: 0 }}
                      />
                    </div>
                  ))}
                  <div style={{ fontSize:"10px", color:"var(--t3)", marginTop:"4px", fontFamily:"'DM Mono',monospace" }}>
                    Total das parcelas: <strong style={{ color: "var(--acc)" }}>{formatBRL(editParcelas.reduce((a, p) => a + p.valor, 0))}</strong>
                    {" · "}Valor do pedido: <strong>{formatBRL(pedido.valor_total)}</strong>
                  </div>
                </div>

                {/* Observações */}
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
              <div style={{ fontSize:"9px", color:"#888", textTransform:"uppercase", letterSpacing:"1.5px", marginTop:"2px" }}>Urban Glass Comércio Ltda</div>
              <div style={{ fontSize:"9px", color:"#888", marginTop:"2px" }}>CNPJ: 65.668.970/0001-05</div>
              <div style={{ fontSize:"9px", color:"#888" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
              <div style={{ fontSize:"9px", color:"#888" }}>(32) 99986-0317</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"11px", color:"#888", textTransform:"uppercase", letterSpacing:"2px", marginBottom:"4px" }}>Romaneio de Saída</div>
              <div style={{ fontSize:"28px", fontWeight:900, color:"#2d5fa6", letterSpacing:"-1px" }}>{pedido.id}</div>
              <div style={{ fontSize:"11px", color:"#555", marginTop:"6px" }}>Emissão: <strong>{new Date().toLocaleDateString("pt-BR")}</strong></div>
              <div style={{ fontSize:"11px", color:"#555" }}>Pedido: <strong>{formatDate(pedido.dt_pedido)}</strong></div>
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
              {(pedido.clientes as any)?.cnpj && <div style={{ fontSize:"10px", color:"#555", marginTop:"3px" }}>CNPJ: {(pedido.clientes as any).cnpj}</div>}
              {pedido.clientes?.cidade && <div style={{ fontSize:"10px", color:"#555" }}>{pedido.clientes.cidade}</div>}
              {pedido.clientes?.tel && <div style={{ fontSize:"10px", color:"#555" }}>Tel: {pedido.clientes.tel}</div>}
            </div>
            <div style={{ padding:"12px", background:"#f0f4ff", borderRadius:"8px", borderLeft:"4px solid #3d8c5c" }}>
              <div style={{ fontSize:"9px", fontWeight:700, color:"#3d8c5c", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"8px" }}>Condições Comerciais</div>
              <div style={{ fontSize:"11px", color:"#333", display:"flex", flexDirection:"column", gap:"4px" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#777" }}>Pagamento</span><strong>{pedido.forma_pgto || "—"}</strong></div>
                {pedido.parcelas > 1 && <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#777" }}>Parcelas</span><strong>{pedido.parcelas}×</strong></div>}
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#777" }}>Retirada prevista</span><strong>{formatDate(pedido.dt_retirada)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#777" }}>m² total</span><strong>{Number(pedido.m2_total).toFixed(2)} m²</strong></div>
              </div>
            </div>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"16px", fontSize:"11px" }}>
            <thead>
              <tr style={{ background:"#2d5fa6" }}>
                {["#","Produto","Dimensão (mm)","m²","Qtd","R$/m²","Lapidação","Subtotal"].map((h, i) => (
                  <th key={i} style={{ padding:"8px", color:"white", fontWeight:700, fontSize:"9px", textAlign: i === 0 || i === 4 ? "center" : i >= 5 ? "right" : "left", letterSpacing:"0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(pedido.itens_pedido ?? []).map((item, i) => (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"center", color:"#aaa", fontSize:"10px" }}>{i + 1}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontWeight:600, color:"#1a1a2e" }}>{item.produto_nome}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontFamily:"monospace", fontSize:"10px" }}>{item.largura} × {item.altura}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontFamily:"monospace", fontSize:"10px" }}>{Number(item.m2).toFixed(3)}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"center" }}>{item.quantidade}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"right", fontFamily:"monospace", fontSize:"10px" }}>{formatBRL(item.valor_m2)}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"right", fontFamily:"monospace", fontSize:"10px" }}>{item.lapidacao > 0 ? formatBRL(item.lapidacao) : "—"}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#2d5fa6" }}>{formatBRL(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"18px" }}>
            <div style={{ padding:"12px", background:"#f0f4ff", borderRadius:"8px", borderLeft:"4px solid #2d5fa6" }}>
              <div style={{ fontSize:"9px", fontWeight:700, color:"#2d5fa6", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"8px" }}>Condições de Pagamento</div>
              <div style={{ display:"flex", flexDirection:"column", gap:"6px", fontSize:"11px" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#777" }}>Valor total</span><strong style={{ fontFamily:"monospace" }}>{formatBRL(pedido.valor_total)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#777" }}>Recebido</span><strong style={{ fontFamily:"monospace", color:"#155724" }}>{formatBRL(pedido.valor_recebido)}</strong></div>
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
              <strong style={{ color:"#92400e" }}>Observações:</strong> <span style={{ color:"#555" }}>{pedido.obs}</span>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"32px", marginBottom:"16px", marginTop:"32px" }}>
            {["Vendedor / Urban Glass","Recebido por / Comprador","Motorista / Entregador"].map(label => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ borderTop:"1px solid #999", paddingTop:"8px", fontSize:"10px", color:"#555" }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:"2px solid #2d5fa6", paddingTop:"8px", display:"flex", justifyContent:"space-between", fontSize:"8px", color:"#aaa" }}>
            <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
            <div style={{ color:"#e00", fontStyle:"italic" }}>Este documento não substitui a Nota Fiscal Eletrônica</div>
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