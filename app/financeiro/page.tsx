"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFinanceiroClientes, getContasAPagar, criarContaPagar, pagarConta, deletarLancamento, updateLancamento, getLancamentos } from "@/services/financeiro.service";
import { getPedidos, registrarRecebimento } from "@/services/pedidos.service";
import { formatBRL, formatPercent, formatDate, diffDias, labelDiff } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import type { FinanceiroCliente, Pedido, Lancamento } from "@/types";

type Aba = "fluxo" | "receber" | "pagar";
type Periodo = "7d" | "30d" | "90d" | "mes";

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
function nomeMes(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", day: "numeric" });
}
function formatMes(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

const CATEGORIAS = ["Fornecedor","Aluguel","Energia","Água","Internet","Salário","Imposto","Manutenção","Transporte","Material","Outros"];

// ── Mini barra horizontal ─────────────────────────────────────────────────────
function BarH({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: "5px", borderRadius: "3px", background: "var(--surf3)", overflow: "hidden", marginTop: "4px" }}>
      <div style={{ height: "100%", borderRadius: "3px", width: `${pct}%`, background: color, transition: "width .4s" }} />
    </div>
  );
}

export default function FinanceiroPage() {
  const { toast } = useToast();
  const [aba, setAba]                 = useState<Aba>("fluxo");
  const [financeiro, setFinanceiro]   = useState<FinanceiroCliente[]>([]);
  const [pedidos, setPedidos]         = useState<Pedido[]>([]);
  const [contasPagar, setContasPagar] = useState<Lancamento[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading]         = useState(true);
  const [periodo, setPeriodo]         = useState<Periodo>("30d");

  // Modal receber
  const [modalReceber, setModalReceber]   = useState(false);
  const [clienteSel, setClienteSel]       = useState<FinanceiroCliente | null>(null);
  const [pedidoSel, setPedidoSel]         = useState<Pedido | null>(null);
  const [valorRec, setValorRec]           = useState(0);
  const [salvando, setSalvando]           = useState(false);
  const [erro, setErro]                   = useState("");

  // Modal conta a pagar
  const [modalPagar, setModalPagar]       = useState(false);
  const [editandoConta, setEditandoConta] = useState<Lancamento | null>(null);
  const [formPagar, setFormPagar]         = useState({
    descricao: "", fornecedor: "", categoria: "",
    valor: 0, vencimento: "", dt_pagamento: "", status: "Pendente" as "Pendente" | "Pago", obs: "",
  });

  // Modal confirmar pagamento
  const [modalConfirmarPgto, setModalConfirmarPgto] = useState(false);
  const [contaParaPagar, setContaParaPagar]           = useState<Lancamento | null>(null);
  const [dtPagamentoConfirm, setDtPagamentoConfirm]   = useState(hoje());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, peds, pagar, lancs] = await Promise.all([
      getFinanceiroClientes(),
      getPedidos(),
      getContasAPagar(),
      getLancamentos(),
    ]);
    setFinanceiro(fin);
    setPedidos(peds);
    setContasPagar(pagar);
    setLancamentos(lancs);
    setLoading(false);
  }

  // ── Fluxo de caixa ────────────────────────────────────────────────────────

  const { dataInicio, dataFim } = useMemo(() => {
    const hj = hoje();
    if (periodo === "7d")  return { dataInicio: hj, dataFim: addDias(hj, 7) };
    if (periodo === "30d") return { dataInicio: hj, dataFim: addDias(hj, 30) };
    if (periodo === "90d") return { dataInicio: hj, dataFim: addDias(hj, 90) };
    return { dataInicio: inicioMes(), dataFim: fimMes() };
  }, [periodo]);

  const fluxo = useMemo(() => {
    const hj = hoje();

    // Entradas futuras — lançamentos "A Receber" dentro do período
    const entradasFuturas = lancamentos.filter(l =>
      l.tipo === "Entrada" && l.status === "A Receber" &&
      l.vencimento && l.vencimento >= hj && l.vencimento <= dataFim
    );

    // Saídas futuras — contas a pagar pendentes dentro do período
    const saidasFuturas = contasPagar.filter(c =>
      c.status !== "Pago" && c.vencimento && c.vencimento >= hj && c.vencimento <= dataFim
    );

    // Entradas realizadas no período (pagas)
    const entradasRealizadas = lancamentos.filter(l =>
      l.tipo === "Entrada" && l.status === "Pago" &&
      l.vencimento && l.vencimento >= dataInicio && l.vencimento <= dataFim
    );

    // Saídas realizadas no período
    const saidasRealizadas = contasPagar.filter(c =>
      c.status === "Pago" &&
      (c as any).dt_pagamento &&
      (c as any).dt_pagamento >= dataInicio &&
      (c as any).dt_pagamento <= dataFim
    );

    // Vencidas (entradas atrasadas)
    const atrasadas = lancamentos.filter(l =>
      l.tipo === "Entrada" && l.status === "A Receber" && l.vencimento && l.vencimento < hj
    );

    // Contas vencidas a pagar
    const contasAtrasadas = contasPagar.filter(c =>
      c.status !== "Pago" && c.vencimento && c.vencimento < hj
    );

    const totalEntradFut  = entradasFuturas.reduce((a, l) => a + Number(l.valor), 0);
    const totalSaidFut    = saidasFuturas.reduce((a, l) => a + Number(l.valor), 0);
    const totalEntradReal = entradasRealizadas.reduce((a, l) => a + Number(l.valor), 0);
    const totalSaidReal   = saidasRealizadas.reduce((a, l) => a + Number(l.valor), 0);
    const totalAtrasado   = atrasadas.reduce((a, l) => a + Number(l.valor), 0);
    const totalContasAtras = contasAtrasadas.reduce((a, l) => a + Number(l.valor), 0);

    const saldoPrevisto   = totalEntradFut - totalSaidFut;
    const saldoRealizado  = totalEntradReal - totalSaidReal;

    // Fluxo diário — agrupa por dia no período
    const diasMap = new Map<string, { entradas: number; saidas: number }>();
    const cursor = new Date(dataInicio + "T12:00:00");
    const fim    = new Date(dataFim + "T12:00:00");
    while (cursor <= fim) {
      diasMap.set(cursor.toISOString().split("T")[0], { entradas: 0, saidas: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    entradasFuturas.forEach(l => {
      if (l.vencimento && diasMap.has(l.vencimento)) {
        diasMap.get(l.vencimento)!.entradas += Number(l.valor);
      }
    });
    entradasRealizadas.forEach(l => {
      if (l.vencimento && diasMap.has(l.vencimento)) {
        diasMap.get(l.vencimento)!.entradas += Number(l.valor);
      }
    });
    saidasFuturas.forEach(c => {
      if (c.vencimento && diasMap.has(c.vencimento)) {
        diasMap.get(c.vencimento)!.saidas += Number(c.valor);
      }
    });
    saidasRealizadas.forEach(c => {
      const dt = (c as any).dt_pagamento;
      if (dt && diasMap.has(dt)) {
        diasMap.get(dt)!.saidas += Number(c.valor);
      }
    });

    const dias = Array.from(diasMap.entries())
      .map(([data, vals]) => ({ data, ...vals, saldo: vals.entradas - vals.saidas }))
      .filter(d => d.entradas > 0 || d.saidas > 0);

    // Saldo acumulado
    let acum = 0;
    const diasAcum = dias.map(d => { acum += d.saldo; return { ...d, acumulado: acum }; });

    return {
      entradasFuturas, saidasFuturas, entradasRealizadas, saidasRealizadas,
      atrasadas, contasAtrasadas,
      totalEntradFut, totalSaidFut, totalEntradReal, totalSaidReal,
      totalAtrasado, totalContasAtras,
      saldoPrevisto, saldoRealizado,
      dias: diasAcum,
    };
  }, [lancamentos, contasPagar, dataInicio, dataFim, periodo]);

  // Máximo para escala dos gráficos
  const maxDia = useMemo(() => {
    const maxE = Math.max(...fluxo.dias.map(d => d.entradas), 1);
    const maxS = Math.max(...fluxo.dias.map(d => d.saidas), 1);
    return Math.max(maxE, maxS);
  }, [fluxo.dias]);

  // ── Receber ───────────────────────────────────────────────────────────────

  function abrirReceber(f: FinanceiroCliente) {
    setClienteSel(f); setPedidoSel(null); setValorRec(0); setErro(""); setModalReceber(true);
  }

  function selecionarPedido(pedidoId: string) {
    const p = pedidos.find(p => p.id === pedidoId) ?? null;
    setPedidoSel(p); setValorRec(0); setErro("");
  }

  function preencherTotal() {
    if (!pedidoSel) return;
    setValorRec(Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido));
    setErro("");
  }

  async function salvarRecebimento() {
    if (!pedidoSel) { setErro("Selecione um pedido."); return; }
    if (!valorRec || valorRec <= 0) { setErro("Informe um valor válido."); return; }
    setSalvando(true);
    const result = await registrarRecebimento(pedidoSel.id, valorRec);
    setSalvando(false);
    if (!result) { toast("Erro ao registrar recebimento", "err"); return; }
    const { excedente } = result as any;
    if (excedente > 0.005) {
      toast(`✓ Pedido ${pedidoSel.id} quitado! ${formatBRL(excedente)} viraram crédito do cliente.`);
    } else {
      toast(`✓ Recebimento de ${formatBRL(valorRec)} registrado`);
    }
    setModalReceber(false); load();
  }

  // ── Contas a pagar ────────────────────────────────────────────────────────

  function abrirNovaConta() {
    setEditandoConta(null);
    setFormPagar({ descricao: "", fornecedor: "", categoria: "", valor: 0, vencimento: "", dt_pagamento: "", status: "Pendente", obs: "" });
    setModalPagar(true);
  }

  function abrirEditarConta(c: Lancamento) {
    setEditandoConta(c);
    setFormPagar({
      descricao:    c.descricao,
      fornecedor:   (c as any).fornecedor ?? "",
      categoria:    (c as any).categoria ?? "",
      valor:        c.valor,
      vencimento:   c.vencimento ?? "",
      dt_pagamento: (c as any).dt_pagamento ?? "",
      status:       c.status === "Pago" ? "Pago" : "Pendente",
      obs:          (c as any).obs ?? "",
    });
    setModalPagar(true);
  }

  async function salvarConta() {
    if (!formPagar.descricao.trim() || formPagar.valor <= 0 || !formPagar.vencimento) {
      toast("Preencha descrição, valor e vencimento", "warn"); return;
    }
    setSalvando(true);
    if (editandoConta) {
      await updateLancamento(editandoConta.id, {
        descricao: formPagar.descricao, valor: formPagar.valor,
        vencimento: formPagar.vencimento, status: formPagar.status,
        fornecedor: formPagar.fornecedor, categoria: formPagar.categoria,
        dt_pagamento: formPagar.dt_pagamento || null, obs: formPagar.obs,
      } as any);
      toast("Conta atualizada");
    } else {
      await criarContaPagar({
        descricao: formPagar.descricao, fornecedor: formPagar.fornecedor,
        categoria: formPagar.categoria, valor: formPagar.valor,
        vencimento: formPagar.vencimento,
        dt_pagamento: formPagar.dt_pagamento || undefined,
        status: formPagar.status, obs: formPagar.obs,
      });
      toast("Conta criada");
    }
    setSalvando(false); setModalPagar(false); load();
  }

  async function confirmarPagamento() {
    if (!contaParaPagar) return;
    setSalvando(true);
    await pagarConta(contaParaPagar.id, dtPagamentoConfirm);
    toast(`✓ "${contaParaPagar.descricao}" marcada como paga`);
    setSalvando(false); setModalConfirmarPgto(false); setContaParaPagar(null); load();
  }

  async function handleDeletarConta(c: Lancamento) {
    if (!confirm(`Excluir "${c.descricao}"?`)) return;
    await deletarLancamento(c.id);
    toast("Conta removida"); load();
  }

  // ── Cálculos gerais ───────────────────────────────────────────────────────

  const tot = financeiro.reduce((a, f) => ({ fat: a.fat + Number(f.faturado), rec: a.rec + Number(f.recebido) }), { fat: 0, rec: 0 });
  const aReceber     = tot.fat - tot.rec;
  const totalPagar   = contasPagar.filter(c => c.status !== "Pago").reduce((a, c) => a + Number(c.valor), 0);
  const totalPagoMes = contasPagar.filter(c => c.status === "Pago").reduce((a, c) => a + Number(c.valor), 0);
  const vencidas     = contasPagar.filter(c => c.status !== "Pago" && c.vencimento && c.vencimento < hoje());

  const pedidosCliente = clienteSel
    ? pedidos.filter(p => p.cliente_id === clienteSel.cliente_id && Number(p.valor_total) - Number(p.valor_recebido) > 0)
    : [];
  const saldoPedido = pedidoSel ? Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido) : 0;

  const corStatus = (c: Lancamento) => {
    if (c.status === "Pago") return "var(--ok)";
    if (c.vencimento && c.vencimento < hoje()) return "var(--err)";
    const diff = diffDias(c.vencimento);
    if (diff !== null && diff < 7) return "var(--warn)";
    return "var(--t2)";
  };

  const chipStatus = (c: Lancamento) => {
    if (c.status === "Pago") return <span className="chip cg">✓ Pago</span>;
    if (c.vencimento && c.vencimento < hoje()) return <span className="chip cr">Vencido</span>;
    return <span className="chip cy">Pendente</span>;
  };

  const periodoLabel: Record<Periodo, string> = {
    "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", "mes": "Este mês",
  };

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Financeiro</div>
        {aba === "pagar" && (
          <button className="btn bp sm" onClick={abrirNovaConta}>+ Nova Conta</button>
        )}
      </div>

      <div className="con">
        {/* Cards resumo */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Faturado",       value: formatBRL(tot.fat),       color:"var(--acc)",  sub:"Total pedidos" },
            { label:"A Receber",      value: formatBRL(aReceber),      color:"var(--warn)", sub:"Em aberto" },
            { label:"A Pagar",        value: formatBRL(totalPagar),    color:"var(--err)",  sub:`${vencidas.length} vencida(s)` },
            { label:"Saldo Previsto", value: formatBRL(fluxo.saldoPrevisto), color: fluxo.saldoPrevisto >= 0 ? "var(--ok)" : "var(--err)", sub:`Próx. ${periodoLabel[periodo]}` },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display:"flex", gap:"2px", marginBottom:"20px", borderBottom:"1px solid var(--b1)" }}>
          {([
            ["fluxo",   "📊 Fluxo de Caixa"],
            ["receber", "Contas a Receber"],
            ["pagar",   "Contas a Pagar"],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setAba(key)} style={{
              padding:"10px 20px", fontSize:"13px", fontWeight:600, cursor:"pointer",
              background:"transparent", border:"none",
              borderBottom:`2px solid ${aba === key ? "var(--acc)" : "transparent"}`,
              color: aba === key ? "var(--acc)" : "var(--t3)", transition:"all .15s",
            }}>{label}</button>
          ))}
        </div>

        {loading ? <div className="loading">Carregando...</div> : (
          <>

            {/* ══════════════════════════════════════════════════════════════
                ABA FLUXO DE CAIXA
            ══════════════════════════════════════════════════════════════ */}
            {aba === "fluxo" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>

                {/* Filtro de período */}
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <span style={{ fontSize:"12px", color:"var(--t3)", fontWeight:600 }}>Período:</span>
                  {(["7d","30d","90d","mes"] as Periodo[]).map(p => (
                    <button key={p} onClick={() => setPeriodo(p)} style={{
                      padding:"5px 14px", borderRadius:"6px", fontSize:"12px", fontWeight:600,
                      cursor:"pointer", transition:"all .15s",
                      border:`1px solid ${periodo === p ? "var(--acc)" : "var(--b2)"}`,
                      background: periodo === p ? "rgba(61,255,160,.1)" : "transparent",
                      color: periodo === p ? "var(--acc)" : "var(--t3)",
                    }}>{periodoLabel[p]}</button>
                  ))}
                  <span style={{ marginLeft:"8px", fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>
                    {new Date(dataInicio + "T12:00:00").toLocaleDateString("pt-BR")} → {new Date(dataFim + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>

                {/* Alertas */}
                {(fluxo.totalAtrasado > 0 || fluxo.totalContasAtras > 0) && (
                  <div style={{ display:"grid", gridTemplateColumns: fluxo.totalAtrasado > 0 && fluxo.totalContasAtras > 0 ? "1fr 1fr" : "1fr", gap:"12px" }}>
                    {fluxo.totalAtrasado > 0 && (
                      <div style={{ padding:"12px 16px", background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.3)", borderRadius:"10px", display:"flex", alignItems:"center", gap:"12px" }}>
                        <span style={{ fontSize:"20px" }}>⏰</span>
                        <div>
                          <div style={{ fontSize:"12px", fontWeight:700, color:"var(--warn)" }}>Recebimentos atrasados</div>
                          <div style={{ fontSize:"18px", fontWeight:800, color:"var(--warn)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(fluxo.totalAtrasado)}</div>
                          <div style={{ fontSize:"11px", color:"var(--t3)" }}>{fluxo.atrasadas.length} lançamento(s) vencido(s)</div>
                        </div>
                      </div>
                    )}
                    {fluxo.totalContasAtras > 0 && (
                      <div style={{ padding:"12px 16px", background:"rgba(244,63,94,.08)", border:"1px solid rgba(244,63,94,.3)", borderRadius:"10px", display:"flex", alignItems:"center", gap:"12px" }}>
                        <span style={{ fontSize:"20px" }}>⚠</span>
                        <div>
                          <div style={{ fontSize:"12px", fontWeight:700, color:"var(--err)" }}>Contas vencidas a pagar</div>
                          <div style={{ fontSize:"18px", fontWeight:800, color:"var(--err)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(fluxo.totalContasAtras)}</div>
                          <div style={{ fontSize:"11px", color:"var(--t3)" }}>{fluxo.contasAtrasadas.length} conta(s) vencida(s)</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Cards fluxo */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px" }}>
                  {[
                    { label:"Entradas Previstas",  value: fluxo.totalEntradFut,  color:"var(--ok)",   icon:"↑", sub:`${fluxo.entradasFuturas.length} lançamentos` },
                    { label:"Saídas Previstas",    value: fluxo.totalSaidFut,    color:"var(--err)",  icon:"↓", sub:`${fluxo.saidasFuturas.length} contas` },
                    { label:"Saldo Previsto",      value: fluxo.saldoPrevisto,   color: fluxo.saldoPrevisto >= 0 ? "var(--ok)" : "var(--err)", icon:"≈", sub:"Entradas − Saídas" },
                    { label:"Realizado no Período",value: fluxo.saldoRealizado,  color: fluxo.saldoRealizado >= 0 ? "var(--acc)" : "var(--err)", icon:"✓", sub:`${fluxo.entradasRealizadas.length + fluxo.saidasRealizadas.length} movimentos` },
                  ].map(c => (
                    <div key={c.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"14px 16px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px" }}>
                        <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>{c.label}</div>
                        <div style={{ fontSize:"16px", color:c.color }}>{c.icon}</div>
                      </div>
                      <div style={{ fontSize:"20px", fontWeight:800, color:c.color, fontFamily:"'DM Mono',monospace", lineHeight:1.1 }}>{formatBRL(c.value)}</div>
                      <div style={{ fontSize:"10px", color:"var(--t3)", marginTop:"4px" }}>{c.sub}</div>
                      <BarH value={Math.abs(c.value)} max={Math.max(fluxo.totalEntradFut, fluxo.totalSaidFut, 1)} color={c.color} />
                    </div>
                  ))}
                </div>

                {/* Gráfico de barras diário */}
                {fluxo.dias.length > 0 && (
                  <div className="card" style={{ padding:"20px" }}>
                    <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em", marginBottom:"16px", textTransform:"uppercase" }}>
                      Fluxo Diário — {periodoLabel[periodo]}
                    </div>
                    <div style={{ display:"flex", gap:"3px", alignItems:"flex-end", height:"120px", overflowX:"auto", paddingBottom:"4px" }}>
                      {fluxo.dias.map((d, i) => {
                        const hE = maxDia > 0 ? (d.entradas / maxDia) * 100 : 0;
                        const hS = maxDia > 0 ? (d.saidas   / maxDia) * 100 : 0;
                        return (
                          <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"2px", minWidth:"32px", flex:"1 0 32px", position:"relative" }}
                            title={`${new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR")}\nEntradas: ${formatBRL(d.entradas)}\nSaídas: ${formatBRL(d.saidas)}`}>
                            <div style={{ display:"flex", alignItems:"flex-end", gap:"2px", height:"100px" }}>
                              {d.entradas > 0 && (
                                <div style={{ width:"12px", height:`${hE}%`, background:"var(--ok)", borderRadius:"2px 2px 0 0", opacity:0.85, minHeight:"3px" }} />
                              )}
                              {d.saidas > 0 && (
                                <div style={{ width:"12px", height:`${hS}%`, background:"var(--err)", borderRadius:"2px 2px 0 0", opacity:0.75, minHeight:"3px" }} />
                              )}
                            </div>
                            <div style={{ fontSize:"8px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap", transform:"rotate(-45deg)", transformOrigin:"top left", marginTop:"4px", marginLeft:"8px" }}>
                              {nomeMes(d.data)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", gap:"16px", marginTop:"24px", paddingTop:"12px", borderTop:"1px solid var(--b1)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"11px", color:"var(--t2)" }}>
                        <div style={{ width:"12px", height:"12px", background:"var(--ok)", borderRadius:"2px" }} />
                        Entradas
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"11px", color:"var(--t2)" }}>
                        <div style={{ width:"12px", height:"12px", background:"var(--err)", borderRadius:"2px" }} />
                        Saídas
                      </div>
                    </div>
                  </div>
                )}

                {/* Duas colunas: entradas previstas / saídas previstas */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" }}>

                  {/* Entradas previstas */}
                  <div className="card" style={{ padding:"16px" }}>
                    <div style={{ fontSize:"11px", color:"var(--ok)", fontWeight:700, letterSpacing:"0.06em", marginBottom:"12px", textTransform:"uppercase" }}>
                      ↑ Entradas Previstas ({fluxo.entradasFuturas.length})
                    </div>
                    {fluxo.entradasFuturas.length === 0 ? (
                      <div style={{ fontSize:"12px", color:"var(--t3)", textAlign:"center", padding:"16px 0" }}>Nenhuma entrada prevista</div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"280px", overflowY:"auto" }}>
                        {[...fluxo.entradasFuturas].sort((a, b) => (a.vencimento ?? "") > (b.vencimento ?? "") ? 1 : -1).map(l => {
                          const diff = diffDias(l.vencimento);
                          const corData = diff !== null && diff < 3 ? "var(--warn)" : "var(--t3)";
                          return (
                            <div key={l.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 10px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid rgba(61,255,160,.1)" }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.descricao}</div>
                                <div style={{ fontSize:"10px", color:corData, fontFamily:"'DM Mono',monospace", marginTop:"1px" }}>
                                  {formatDate(l.vencimento)} {diff !== null && diff < 3 ? "⚡" : ""}
                                </div>
                              </div>
                              <div style={{ fontSize:"13px", fontWeight:700, color:"var(--ok)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                                {formatBRL(l.valor)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ marginTop:"10px", paddingTop:"8px", borderTop:"1px solid var(--b1)", display:"flex", justifyContent:"space-between", fontSize:"12px" }}>
                      <span style={{ color:"var(--t3)" }}>Total previsto</span>
                      <span style={{ color:"var(--ok)", fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{formatBRL(fluxo.totalEntradFut)}</span>
                    </div>
                  </div>

                  {/* Saídas previstas */}
                  <div className="card" style={{ padding:"16px" }}>
                    <div style={{ fontSize:"11px", color:"var(--err)", fontWeight:700, letterSpacing:"0.06em", marginBottom:"12px", textTransform:"uppercase" }}>
                      ↓ Saídas Previstas ({fluxo.saidasFuturas.length})
                    </div>
                    {fluxo.saidasFuturas.length === 0 ? (
                      <div style={{ fontSize:"12px", color:"var(--t3)", textAlign:"center", padding:"16px 0" }}>Nenhuma saída prevista</div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"280px", overflowY:"auto" }}>
                        {[...fluxo.saidasFuturas].sort((a, b) => (a.vencimento ?? "") > (b.vencimento ?? "") ? 1 : -1).map(c => {
                          const diff = diffDias(c.vencimento);
                          const corData = diff !== null && diff < 3 ? "var(--err)" : "var(--t3)";
                          return (
                            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 10px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid rgba(244,63,94,.1)" }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.descricao}</div>
                                <div style={{ display:"flex", gap:"6px", marginTop:"1px" }}>
                                  <span style={{ fontSize:"10px", color:corData, fontFamily:"'DM Mono',monospace" }}>
                                    {formatDate(c.vencimento)} {diff !== null && diff < 3 ? "🔴" : ""}
                                  </span>
                                  {(c as any).categoria && (
                                    <span style={{ fontSize:"9px", color:"var(--t3)", background:"var(--surf3)", padding:"1px 5px", borderRadius:"4px" }}>{(c as any).categoria}</span>
                                  )}
                                </div>
                              </div>
                              <div style={{ fontSize:"13px", fontWeight:700, color:"var(--err)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                                {formatBRL(c.valor)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ marginTop:"10px", paddingTop:"8px", borderTop:"1px solid var(--b1)", display:"flex", justifyContent:"space-between", fontSize:"12px" }}>
                      <span style={{ color:"var(--t3)" }}>Total previsto</span>
                      <span style={{ color:"var(--err)", fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{formatBRL(fluxo.totalSaidFut)}</span>
                    </div>
                  </div>
                </div>

                {/* Resumo do saldo */}
                <div className="card" style={{ padding:"20px" }}>
                  <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em", marginBottom:"16px", textTransform:"uppercase" }}>
                    Resumo do Período — {periodoLabel[periodo]}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"16px" }}>
                    {[
                      { label:"Total entradas previstas", value: fluxo.totalEntradFut,  color:"var(--ok)" },
                      { label:"Total saídas previstas",   value: fluxo.totalSaidFut,    color:"var(--err)" },
                      { label:"Saldo líquido previsto",   value: fluxo.saldoPrevisto,   color: fluxo.saldoPrevisto >= 0 ? "var(--ok)" : "var(--err)" },
                      { label:"Entradas realizadas",      value: fluxo.totalEntradReal, color:"var(--acc)" },
                      { label:"Saídas realizadas",        value: fluxo.totalSaidReal,   color:"var(--warn)" },
                      { label:"Saldo realizado",          value: fluxo.saldoRealizado,  color: fluxo.saldoRealizado >= 0 ? "var(--acc)" : "var(--err)" },
                    ].map(item => (
                      <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"10px 0", borderBottom:"1px solid var(--b1)" }}>
                        <span style={{ fontSize:"12px", color:"var(--t3)" }}>{item.label}</span>
                        <span style={{ fontSize:"14px", fontWeight:700, color:item.color, fontFamily:"'DM Mono',monospace" }}>{formatBRL(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                ABA RECEBER
            ══════════════════════════════════════════════════════════════ */}
            {aba === "receber" && (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th><th>Pedidos</th><th>Faturado</th><th>Recebido</th>
                      <th>A Receber</th><th>% Rec.</th><th>Status</th><th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)).map(f => {
                      const ab  = Number(f.a_receber);
                      const pct = Number(f.pct_recebido);
                      const st  = ab <= 0
                        ? <span className="chip cg">✓ Quitado</span>
                        : pct > 0 ? <span className="chip cy">Parcial</span>
                        : <span className="chip cr">Aberto</span>;
                      return (
                        <tr key={f.cliente_id}>
                          <td><strong>{f.cliente_nome}</strong></td>
                          <td className="mono">{f.total_pedidos}</td>
                          <td className="mono">{formatBRL(f.faturado)}</td>
                          <td className="mono" style={{ color:"var(--acc)" }}>{formatBRL(f.recebido)}</td>
                          <td className="mono" style={{ color: ab > 0 ? "var(--warn)" : "var(--t2)" }}>{formatBRL(ab)}</td>
                          <td>
                            <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                              <div className="prg" style={{ width:"55px", height:"5px" }}>
                                <div className="prg-f" style={{ width:`${pct}%`, background: pct < 50 ? "var(--err)" : pct < 100 ? "var(--warn)" : "var(--ok)" }} />
                              </div>
                              <span className="mono">{formatPercent(pct)}</span>
                            </div>
                          </td>
                          <td>{st}</td>
                          <td>{ab > 0 && <button className="btn bp xs" onClick={() => abrirReceber(f)}>✓ Receber</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                ABA PAGAR
            ══════════════════════════════════════════════════════════════ */}
            {aba === "pagar" && (
              <>
                {vencidas.length > 0 && (
                  <div style={{ marginBottom:"14px", padding:"12px 16px", background:"rgba(244,63,94,.08)", border:"1px solid var(--err)", borderRadius:"10px", display:"flex", alignItems:"center", gap:"10px" }}>
                    <span style={{ fontSize:"18px" }}>⚠</span>
                    <div>
                      <div style={{ fontSize:"13px", fontWeight:700, color:"var(--err)" }}>{vencidas.length} conta(s) vencida(s)</div>
                      <div style={{ fontSize:"12px", color:"var(--t3)" }}>Total: {formatBRL(vencidas.reduce((a, c) => a + Number(c.valor), 0))}</div>
                    </div>
                  </div>
                )}
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Descrição</th><th>Fornecedor</th><th>Categoria</th>
                        <th>Vencimento</th><th>Valor</th><th>Status</th>
                        <th>Dt. Pagamento</th><th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contasPagar.length === 0 && (
                        <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>Nenhuma conta a pagar cadastrada</td></tr>
                      )}
                      {[...contasPagar].sort((a, b) => (a.vencimento ?? "") > (b.vencimento ?? "") ? 1 : -1).map(c => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.descricao}</strong>
                            {(c as any).obs && <div className="tdim">{(c as any).obs}</div>}
                          </td>
                          <td>{(c as any).fornecedor || <span style={{ color:"var(--t3)" }}>—</span>}</td>
                          <td>{(c as any).categoria ? <span className="chip cgr" style={{ fontSize:"10px" }}>{(c as any).categoria}</span> : <span style={{ color:"var(--t3)" }}>—</span>}</td>
                          <td className="mono" style={{ color: corStatus(c) }}>{formatDate(c.vencimento)}</td>
                          <td className="mono" style={{ color:"var(--err)", fontWeight:600 }}>{formatBRL(c.valor)}</td>
                          <td>{chipStatus(c)}</td>
                          <td className="mono" style={{ color:"var(--t3)" }}>{(c as any).dt_pagamento ? formatDate((c as any).dt_pagamento) : "—"}</td>
                          <td>
                            <div style={{ display:"flex", gap:"4px" }}>
                              {c.status !== "Pago" && (
                                <button className="btn bp xs" onClick={() => { setContaParaPagar(c); setDtPagamentoConfirm(hoje()); setModalConfirmarPgto(true); }}>✓ Pagar</button>
                              )}
                              <button className="btn bg xs" onClick={() => abrirEditarConta(c)}>✏</button>
                              <button className="btn bg xs" style={{ color:"var(--err)", borderColor:"var(--err)" }} onClick={() => handleDeletarConta(c)}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Modal Receber ── */}
      {modalReceber && clienteSel && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalReceber(false)}>
          <div className="mod" style={{ width:"480px" }}>
            <div className="mhd">
              <div className="mtit">Registrar Recebimento</div>
              <button className="mcl" onClick={() => setModalReceber(false)}>✕</button>
            </div>
            <div style={{ marginBottom:"14px" }}>
              <strong>{clienteSel.cliente_nome}</strong>
              <div style={{ fontSize:"12px", color:"var(--t3)", marginTop:"2px" }}>Em aberto: <strong>{formatBRL(clienteSel.a_receber)}</strong></div>
            </div>
            <div className="fg" style={{ marginBottom:"14px" }}>
              <label className="fl">Pedido *</label>
              <select className="fc" value={pedidoSel?.id ?? ""} onChange={e => selecionarPedido(e.target.value)}>
                <option value="">Selecione um pedido...</option>
                {pedidosCliente.map(p => {
                  const saldo = Number(p.valor_total) - Number(p.valor_recebido);
                  return <option key={p.id} value={p.id}>{p.id} — {formatBRL(saldo)} em aberto</option>;
                })}
              </select>
            </div>
            {pedidoSel && (
              <div style={{ background:"var(--surf2)", border:"1px solid var(--b1)", borderRadius:"8px", padding:"12px", marginBottom:"14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Total</span><span className="mono">{formatBRL(pedidoSel.valor_total)}</span></div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Recebido</span><span className="mono" style={{ color:"var(--ok)" }}>{formatBRL(pedidoSel.valor_recebido)}</span></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Saldo</span><span className="mono" style={{ color:"var(--warn)", fontWeight:700 }}>{formatBRL(saldoPedido)}</span></div>
              </div>
            )}
            <div className="fg" style={{ marginBottom:"6px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
                <label className="fl">Valor *</label>
                {pedidoSel && <button className="btn bg xs" onClick={preencherTotal} style={{ fontSize:"10px" }}>Preencher total</button>}
              </div>
              <CurrencyInput value={valorRec} onChange={v => { setValorRec(v); setErro(""); }} placeholder="R$ 0,00" disabled={!pedidoSel} />
              <div style={{ fontSize:"11px", color:"var(--t3)", marginTop:"4px" }}>Pode ser maior que o saldo — excedente vira crédito do cliente</div>
            </div>
            {erro && <div className="al al-e" style={{ marginBottom:"12px" }}>{erro}</div>}
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg" onClick={() => setModalReceber(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarRecebimento} disabled={salvando || valorRec <= 0 || !pedidoSel}>
                {salvando ? "Salvando..." : "✓ Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Nova/Editar Conta a Pagar ── */}
      {modalPagar && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalPagar(false)}>
          <div className="mod" style={{ width:"520px" }}>
            <div className="mhd">
              <div className="mtit">{editandoConta ? "Editar Conta" : "Nova Conta a Pagar"}</div>
              <button className="mcl" onClick={() => setModalPagar(false)}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <div className="fg">
                <label className="fl">Descrição *</label>
                <input className="fc" value={formPagar.descricao} onChange={e => setFormPagar(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Conta de energia, aluguel..." />
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Fornecedor</label>
                  <input className="fc" value={formPagar.fornecedor} onChange={e => setFormPagar(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" />
                </div>
                <div className="fg">
                  <label className="fl">Categoria</label>
                  <select className="fc" value={formPagar.categoria} onChange={e => setFormPagar(f => ({ ...f, categoria: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Valor *</label>
                  <CurrencyInput value={formPagar.valor} onChange={v => setFormPagar(f => ({ ...f, valor: v }))} placeholder="R$ 0,00" />
                </div>
                <div className="fg">
                  <label className="fl">Status</label>
                  <select className="fc" value={formPagar.status} onChange={e => setFormPagar(f => ({ ...f, status: e.target.value as "Pendente" | "Pago" }))}>
                    <option value="Pendente">Pendente</option>
                    <option value="Pago">Pago</option>
                  </select>
                </div>
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Vencimento *</label>
                  <DateInput value={formPagar.vencimento} onChange={v => setFormPagar(f => ({ ...f, vencimento: v }))} />
                </div>
                <div className="fg">
                  <label className="fl">Data de Pagamento</label>
                  <DateInput value={formPagar.dt_pagamento} onChange={v => setFormPagar(f => ({ ...f, dt_pagamento: v }))} />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Observações</label>
                <textarea className="fc" value={formPagar.obs} onChange={e => setFormPagar(f => ({ ...f, obs: e.target.value }))} placeholder="Observações..." rows={2} style={{ resize:"vertical" }} />
              </div>
              <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
                <button className="btn bg" onClick={() => setModalPagar(false)}>Cancelar</button>
                <button className="btn bp" onClick={salvarConta} disabled={salvando}>
                  {salvando ? "Salvando..." : editandoConta ? "Salvar Alterações" : "Criar Conta"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmar Pagamento ── */}
      {modalConfirmarPgto && contaParaPagar && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalConfirmarPgto(false)}>
          <div className="mod" style={{ width:"380px" }}>
            <div className="mhd">
              <div className="mtit">Confirmar Pagamento</div>
              <button className="mcl" onClick={() => setModalConfirmarPgto(false)}>✕</button>
            </div>
            <div style={{ marginBottom:"16px" }}>
              <div style={{ fontSize:"14px", fontWeight:700, color:"var(--t1)", marginBottom:"4px" }}>{contaParaPagar.descricao}</div>
              <div style={{ fontSize:"22px", fontWeight:800, color:"var(--err)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(contaParaPagar.valor)}</div>
            </div>
            <div className="fg" style={{ marginBottom:"16px" }}>
              <label className="fl">Data do Pagamento</label>
              <DateInput value={dtPagamentoConfirm} onChange={setDtPagamentoConfirm} />
            </div>
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg" onClick={() => setModalConfirmarPgto(false)}>Cancelar</button>
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