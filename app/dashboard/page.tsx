"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidos } from "@/services/pedidos.service";
import { getFinanceiroClientes, getFaturamentoMensal } from "@/services/financeiro.service";
import { getResumoQualidade } from "@/services/qualidade.service";
import { getCompras } from "@/services/compras.service";
import { getEstoque } from "@/services/estoque.service";
import { getPedidosSemProgramacao } from "@/services/programacao.service";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatPercent } from "@/lib/formatters";
import type { Pedido, FinanceiroCliente, FaturamentoMensal, EstoqueItem, Compra } from "@/types";

interface ContaPagarMin { valor: number; vencimento: string | null; }

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const ETAPAS = [
  { status: "Aguardando otimização",   label: "Ag. Otimização", color: "var(--warn)" },
  { status: "Em Produção – Corte",     label: "Corte",          color: "var(--acc4)" },
  { status: "Qualidade (Corte)",       label: "Qual. Corte",    color: "#22c55e"     },
  { status: "Em Produção – Lapidação", label: "Lapidação",      color: "var(--acc3)" },
  { status: "Qualidade (Lapidação)",   label: "Qual. Lapid.",   color: "#06b6d4"     },
  { status: "Separação",               label: "Separação",      color: "var(--acc2)" },
  { status: "Finalizado",              label: "Finalizado",     color: "var(--ok)"   },
  { status: "Entregue",                label: "Entregue",       color: "var(--acc)"  },
];

export default function DashboardPage() {
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [fatMensal, setFatMensal]   = useState<FaturamentoMensal[]>([]);
  const [estoque, setEstoque]       = useState<EstoqueItem[]>([]);
  const [ncsAbertas, setNcsAbertas] = useState(0);
  const [ncsCriticas, setNcsCriticas] = useState(0);
  const [comprasPend, setComprasPend] = useState(0);
  const [contasPagarAbertas, setContasPagarAbertas] = useState<ContaPagarMin[]>([]);
  const [compras, setCompras]       = useState<Compra[]>([]);
  const [semProgramacao, setSemProgramacao] = useState<Pedido[]>([]);
  const [loading, setLoading]       = useState(true);
  const [mesSel, setMesSel]         = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [peds, fin, fat, est, qualidade, comprasRes, { data: cp }, semProg] = await Promise.all([
      getPedidos(),
      getFinanceiroClientes(),
      getFaturamentoMensal(new Date().getFullYear()),
      getEstoque(),
      getResumoQualidade(),
      getCompras(),
      supabase.from("lancamentos").select("valor, vencimento").eq("tipo", "Saída").neq("status", "Pago").is("deletado_em", null),
      getPedidosSemProgramacao(),
    ]);
    setPedidos(peds);
    setFinanceiro(fin);
    setFatMensal(fat);
    setEstoque(est as unknown as EstoqueItem[]);
    setNcsAbertas(qualidade.ncsAbertas);
    setNcsCriticas(qualidade.ncsCriticas);
    setComprasPend(comprasRes.filter(c => c.status !== 'recebido').length);
    setContasPagarAbertas((cp ?? []) as ContaPagarMin[]);
    setCompras(comprasRes);
    setSemProgramacao(semProg);
    setLoading(false);
  }

  const barras = useMemo(() => MESES_ABREV.map((mes, i) => {
    const fat = fatMensal.find(f => f.mes === i + 1);
    return { mes, mesNum: i + 1, faturado: fat ? Number(fat.faturado) : 0 };
  }), [fatMensal]);

  const maxBar = Math.max(...barras.map(b => b.faturado), 1);

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const pedidosFiltrados = useMemo(() => {
    if (!mesSel) return pedidos;
    return pedidos.filter(p => {
      const d = new Date(p.dt_pedido);
      return d.getFullYear() === anoAtual && d.getMonth() + 1 === mesSel;
    });
  }, [pedidos, mesSel, anoAtual]);

  const fatTotal  = financeiro.reduce((a, f) => a + Number(f.faturado), 0);
  const recTotal  = financeiro.reduce((a, f) => a + Number(f.recebido), 0);
  const aReceber  = fatTotal - recTotal;

  const fatMesSel = mesSel ? (barras.find(b => b.mesNum === mesSel)?.faturado ?? 0) : fatTotal;
  const pedMesSel = pedidosFiltrados.length;
  const ticketMes = pedMesSel > 0 ? fatMesSel / pedMesSel : 0;

  const fatMesAnt = mesSel && mesSel > 1
    ? (barras.find(b => b.mesNum === mesSel - 1)?.faturado ?? 0)
    : 0;
  const varMes = fatMesAnt > 0 ? ((fatMesSel - fatMesAnt) / fatMesAnt) * 100 : 0;

  const pipeline = ETAPAS.map(e => ({
    ...e,
    count: pedidos.filter(p => p.status === e.status).length,
  }));
  const totalAtivos = pipeline.slice(0, 4).reduce((a, e) => a + e.count, 0);

  const inadimplentes  = financeiro.filter(f => Number(f.recebido) === 0 && Number(f.faturado) > 0);
  const parciais       = financeiro.filter(f => Number(f.recebido) > 0 && Number(f.a_receber) > 0);
  const aguardandoOtim = pedidos.filter(p => p.status === "Aguardando otimização");

  const itensRuptura = estoque.filter(e => {
    const min = Number(e.estoque_minimo_chapas ?? 0);
    return min > 0 && Number(e.chapas_saldo) <= min;
  });

  const hoje3d = new Date(); hoje3d.setDate(hoje3d.getDate() + 3);
  const retiradas3d = pedidos.filter(p => {
    if (!p.dt_retirada) return false;
    const d = new Date(p.dt_retirada);
    const agora = new Date();
    return d >= agora && d <= hoje3d && p.status !== "Entregue" && p.status !== "Cancelado";
  });

  const hojeStr = new Date().toISOString().split("T")[0];
  const contasPagarVencidas  = contasPagarAbertas.filter(c => c.vencimento && c.vencimento < hojeStr);
  const contasPagarVenceHoje = contasPagarAbertas.filter(c => c.vencimento === hojeStr);

  const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const comprasParadas = compras.filter(c => c.status === "rascunho" && new Date(c.dt_compra) < seteDiasAtras);

  const semProgramacaoReal = semProgramacao.filter(p => p.status !== "Aguardando otimização");

  const alertTotal = inadimplentes.length + parciais.length + aguardandoOtim.length
    + itensRuptura.length + ncsAbertas + comprasPend + retiradas3d.length
    + contasPagarVencidas.length + contasPagarVenceHoje.length
    + comprasParadas.length + semProgramacaoReal.length;

  const topCli = useMemo(() => {
    if (!mesSel) {
      return [...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)).slice(0, 6);
    }
    const map = new Map<string, { nome: string; cidade: string; total: number; recebido: number }>();
    pedidosFiltrados.forEach(p => {
      const nome   = p.clientes?.nome ?? "—";
      const cidade = p.clientes?.cidade ?? "";
      const id     = String(p.cliente_id ?? nome);
      if (!map.has(id)) map.set(id, { nome, cidade, total: 0, recebido: 0 });
      const entry = map.get(id)!;
      entry.total    += Number(p.valor_total);
      entry.recebido += Number(p.valor_recebido);
    });
    return [...map.entries()]
      .map(([id, v]) => ({ cliente_id: id, cliente_nome: v.nome, cidade: v.cidade, faturado: v.total, recebido: v.recebido, a_receber: v.total - v.recebido }))
      .sort((a, b) => b.faturado - a.faturado)
      .slice(0, 6);
  }, [financeiro, pedidosFiltrados, mesSel]);

  const maxTop   = Math.max(...topCli.map(c => Number(c.faturado)), 1);
  const mesLabel = mesSel ? MESES_ABREV[mesSel - 1] + "/" + anoAtual : anoAtual + " completo";

  return (
    <AppLayout>
      {/* ── TOPBAR ── */}
      <div className="tb">
        <div>
          <div className="tb-title">Dashboard</div>
          <div style={{ fontSize: 11, color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>
            {mesLabel}
            {mesSel && (
              <button
                onClick={() => setMesSel(null)}
                style={{ marginLeft: 8, fontSize: 10, color: "var(--t3)", background: "transparent", border: "1px solid var(--b2)", borderRadius: 4, padding: "1px 7px", cursor: "pointer" }}
              >
                x ver ano todo
              </button>
            )}
          </div>
        </div>
        <button className="btn bg sm" onClick={load} style={{ marginLeft: "auto" }}>
          Atualizar
        </button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando dashboard...</div>
        ) : (
          <>
            {/* ── KPIs ── */}
            <div className="g4 mb14">

              <div className="kpi">
                <div className="kpi-l">{mesSel ? `Faturamento ${MESES_ABREV[mesSel - 1]}` : `Faturamento ${anoAtual}`}</div>
                <div className="kpi-v" style={{ color: "var(--acc)" }}>{formatBRL(fatMesSel)}</div>
                <div className={`kpi-s ${mesSel && varMes < 0 ? "dn" : "up"}`}>
                  {mesSel && fatMesAnt > 0
                    ? `${varMes >= 0 ? "+" : ""}${varMes.toFixed(1)}% vs ${MESES_ABREV[mesSel - 2]}`
                    : "Acumulado no ano"}
                </div>
                <div className="kpi-bar" style={{ background: "var(--acc)", width: "65%" }} />
              </div>

              <div className="kpi">
                <div className="kpi-l">Recebido</div>
                <div className="kpi-v" style={{ color: "var(--ok)" }}>{formatBRL(recTotal)}</div>
                <div className="kpi-s">
                  {formatPercent(fatTotal > 0 ? recTotal / fatTotal * 100 : 0)} do faturado
                </div>
                <div className="kpi-bar" style={{ background: "var(--ok)", width: `${fatTotal > 0 ? Math.min(100, recTotal / fatTotal * 100) : 0}%` }} />
              </div>

              <div className="kpi">
                <div className="kpi-l">A Receber</div>
                <div className="kpi-v" style={{ color: aReceber > 0 ? "var(--warn)" : "var(--ok)" }}>{formatBRL(aReceber)}</div>
                <div className={`kpi-s ${inadimplentes.length > 0 ? "dn" : ""}`}>
                  {inadimplentes.length > 0
                    ? `${inadimplentes.length} inadimplente${inadimplentes.length > 1 ? "s" : ""}`
                    : "Sem inadimplencia"}
                </div>
                <div className="kpi-bar" style={{ background: aReceber > 0 ? "var(--warn)" : "var(--ok)", width: `${fatTotal > 0 ? Math.min(100, aReceber / fatTotal * 100) : 0}%` }} />
              </div>

              <div className="kpi">
                <div className="kpi-l">{mesSel ? `Pedidos ${MESES_ABREV[mesSel - 1]}` : "Pedidos Ativos"}</div>
                <div className="kpi-v" style={{ color: "var(--acc2)" }}>{mesSel ? pedMesSel : totalAtivos}</div>
                <div className="kpi-s">
                  {mesSel
                    ? `Ticket medio ${formatBRL(ticketMes)}`
                    : `de ${pedidos.length} no total`}
                </div>
                <div className="kpi-bar" style={{ background: "var(--acc2)", width: "40%" }} />
              </div>

            </div>

            {/* ── FAIXA DE ALERTAS (visivel imediatamente, acima do grafico) ── */}
            {alertTotal > 0 && (
              <div style={{
                background: "var(--surf)",
                border: "1px solid var(--b1)",
                borderRadius: "var(--r2)",
                padding: "11px 18px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 14,
                flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1.2px", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                  Requer ação
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                  {itensRuptura.length > 0 && (
                    <a href="/estoque" style={{ textDecoration: "none" }}>
                      <span className="chip cr" style={{ cursor: "pointer" }}>
                        {itensRuptura.length} produto{itensRuptura.length > 1 ? "s" : ""} em ruptura
                      </span>
                    </a>
                  )}
                  {ncsCriticas > 0 && (
                    <a href="/qualidade" style={{ textDecoration: "none" }}>
                      <span className="chip cr" style={{ cursor: "pointer" }}>
                        {ncsCriticas} NC{ncsCriticas > 1 ? "s" : ""} crítica{ncsCriticas > 1 ? "s" : ""}
                      </span>
                    </a>
                  )}
                  {retiradas3d.length > 0 && (
                    <a href="/producao" style={{ textDecoration: "none" }}>
                      <span className="chip cy" style={{ cursor: "pointer" }}>
                        {retiradas3d.length} retirada{retiradas3d.length > 1 ? "s" : ""} em 3 dias
                      </span>
                    </a>
                  )}
                  {inadimplentes.length > 0 && (
                    <a href="/contas-receber" style={{ textDecoration: "none" }}>
                      <span className="chip cy" style={{ cursor: "pointer" }}>
                        {inadimplentes.length} inadimplente{inadimplentes.length > 1 ? "s" : ""} &middot; {formatBRL(inadimplentes.reduce((a, f) => a + Number(f.faturado), 0))}
                      </span>
                    </a>
                  )}
                  {parciais.length > 0 && (
                    <a href="/contas-receber" style={{ textDecoration: "none" }}>
                      <span className="chip cy" style={{ cursor: "pointer" }}>
                        {parciais.length} {parciais.length > 1 ? "parciais" : "parcial"} &middot; {formatBRL(parciais.reduce((a, f) => a + Number(f.a_receber), 0))}
                      </span>
                    </a>
                  )}
                  {contasPagarVencidas.length > 0 && (
                    <a href="/contas-pagar?tab=vencido" style={{ textDecoration: "none" }}>
                      <span className="chip cr" style={{ cursor: "pointer" }}>
                        {contasPagarVencidas.length} conta{contasPagarVencidas.length > 1 ? "s" : ""} a pagar vencida{contasPagarVencidas.length > 1 ? "s" : ""} &middot; {formatBRL(contasPagarVencidas.reduce((a, c) => a + Number(c.valor), 0))}
                      </span>
                    </a>
                  )}
                  {contasPagarVenceHoje.length > 0 && (
                    <a href="/contas-pagar?tab=aberto" style={{ textDecoration: "none" }}>
                      <span className="chip cy" style={{ cursor: "pointer" }}>
                        {contasPagarVenceHoje.length} conta{contasPagarVenceHoje.length > 1 ? "s" : ""} a pagar vence{contasPagarVenceHoje.length > 1 ? "m" : ""} hoje &middot; {formatBRL(contasPagarVenceHoje.reduce((a, c) => a + Number(c.valor), 0))}
                      </span>
                    </a>
                  )}
                  {ncsAbertas > 0 && ncsCriticas === 0 && (
                    <a href="/qualidade" style={{ textDecoration: "none" }}>
                      <span className="chip cy" style={{ cursor: "pointer" }}>
                        {ncsAbertas} NC{ncsAbertas > 1 ? "s" : ""} em aberto
                      </span>
                    </a>
                  )}
                  {comprasPend > 0 && (
                    <a href="/compras" style={{ textDecoration: "none" }}>
                      <span className="chip cb" style={{ cursor: "pointer" }}>
                        {comprasPend} compra{comprasPend > 1 ? "s" : ""} pendente{comprasPend > 1 ? "s" : ""} de recebimento
                      </span>
                    </a>
                  )}
                  {aguardandoOtim.length > 0 && (
                    <a href="/otimizador" style={{ textDecoration: "none" }}>
                      <span className="chip cb" style={{ cursor: "pointer" }}>
                        {aguardandoOtim.length} pedido{aguardandoOtim.length > 1 ? "s" : ""} aguardando otimização
                      </span>
                    </a>
                  )}
                  {comprasParadas.length > 0 && (
                    <a href="/compras" style={{ textDecoration: "none" }}>
                      <span className="chip cy" style={{ cursor: "pointer" }}>
                        {comprasParadas.length} compra{comprasParadas.length > 1 ? "s" : ""} parada{comprasParadas.length > 1 ? "s" : ""} há mais de 7 dias
                      </span>
                    </a>
                  )}
                  {semProgramacaoReal.length > 0 && (
                    <a href="/programacao" style={{ textDecoration: "none" }}>
                      <span className="chip cb" style={{ cursor: "pointer" }}>
                        {semProgramacaoReal.length} pedido{semProgramacaoReal.length > 1 ? "s" : ""} sem programação
                      </span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* ── GRAFICO (60%) + PIPELINE (40%) ── */}
            <div className="g32" style={{ marginBottom: 14 }}>

              {/* Faturamento mensal */}
              <div className="card">
                <div className="ct">
                  Faturamento Mensal &middot; {anoAtual}
                  <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                    clique no mês para filtrar
                  </span>
                </div>
                <div style={{ height: 148, display: "flex", alignItems: "stretch", gap: 5 }}>
                  {barras.map((b, i) => {
                    const sel   = mesSel === b.mesNum;
                    const atual = b.mesNum === mesAtual;
                    const pctH  = b.faturado > 0 ? Math.max((b.faturado / maxBar) * 100, 5) : 3;
                    return (
                      <div
                        key={i}
                        onClick={() => setMesSel(sel ? null : b.mesNum)}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
                        title={b.faturado > 0 ? formatBRL(b.faturado) : "Sem dados"}
                      >
                        {sel && b.faturado > 0 && (
                          <div style={{ fontSize: 8, color: "var(--acc)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
                            {formatBRL(b.faturado).replace(/R\$\s?/, "")}
                          </div>
                        )}
                        <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end" }}>
                          <div style={{
                            width: "100%",
                            height: `${pctH}%`,
                            borderRadius: "4px 4px 0 0",
                            transition: "all 0.15s",
                            background: sel
                              ? "var(--acc)"
                              : atual
                                ? "rgba(61,255,160,.22)"
                                : b.faturado > 0 ? "var(--surf3)" : "var(--surf2)",
                            border: sel ? "none" : `1px solid ${atual ? "rgba(61,255,160,.35)" : "var(--b2)"}`,
                            borderBottom: "none",
                            boxShadow: sel ? "0 0 14px rgba(61,255,160,.2)" : "none",
                          }} />
                        </div>
                        <div style={{
                          fontSize: 9,
                          fontFamily: "'DM Mono', monospace",
                          color: sel ? "var(--acc)" : atual ? "rgba(61,255,160,.65)" : "var(--t3)",
                          fontWeight: sel || atual ? 700 : 400,
                        }}>
                          {b.mes}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pipeline operacional */}
              <div className="card">
                <div className="ct">
                  Pipeline de Producao
                  <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                    {totalAtivos} ativos
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {pipeline.map(e => {
                    const maxPipe = Math.max(...pipeline.map(p => p.count), 1);
                    const pct = (e.count / maxPipe) * 100;
                    return (
                      <a
                        key={e.status}
                        href="/pedidos"
                        style={{
                          textDecoration: "none",
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "7px 10px", borderRadius: 8,
                          background: e.count > 0 ? "var(--surf2)" : "transparent",
                          border: `1px solid ${e.count > 0 ? "var(--b1)" : "transparent"}`,
                          transition: "border-color 0.12s",
                        }}
                        onMouseEnter={ev => { if (e.count > 0) (ev.currentTarget as HTMLAnchorElement).style.borderColor = e.color; }}
                        onMouseLeave={ev => { if (e.count > 0) (ev.currentTarget as HTMLAnchorElement).style.borderColor = "var(--b1)"; }}
                      >
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: e.count > 0 ? e.color : "var(--b2)", flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 11.5, color: e.count > 0 ? "var(--t2)" : "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{e.label}</div>
                        <div style={{ width: 52, height: 3, borderRadius: 99, background: "var(--surf3)", overflow: "hidden" }}>
                          {e.count > 0 && (
                            <div style={{ height: "100%", width: `${pct}%`, background: e.color, borderRadius: 99, transition: "width .4s" }} />
                          )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: e.count > 0 ? e.color : "var(--t3)", fontFamily: "'DM Mono', monospace", width: 22, textAlign: "right" }}>
                          {e.count}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── TOP CLIENTES full width, 2 colunas internas ── */}
            <div className="card">
              <div className="ct">
                Top Clientes
                <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{mesLabel}</span>
              </div>
              {topCli.length === 0 ? (
                <div style={{ color: "var(--t3)", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
                  Nenhum pedido neste período.
                </div>
              ) : (
                <div className="g2" style={{ gap: "0 40px" }}>
                  {topCli.map((f, i) => {
                    const pctTotal = Number(f.faturado) / maxTop * 100;
                    const pctRec   = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                    const colLen   = Math.ceil(topCli.length / 2);
                    const isLast   = i % colLen === colLen - 1 || i === topCli.length - 1;
                    return (
                      <div key={f.cliente_id} style={{ padding: "11px 0", borderBottom: isLast ? "none" : "1px solid var(--b1)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                          <div style={{ minWidth: 0, overflow: "hidden" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{f.cliente_nome}</span>
                            {(f as any).cidade && (
                              <span style={{ fontSize: 10, color: "var(--t3)", marginLeft: 6 }}>{(f as any).cidade}</span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 8 }}>
                            <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                              {pctTotal.toFixed(0)}%
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>
                              {formatBRL(f.faturado)}
                            </span>
                          </div>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: "var(--surf3)", overflow: "hidden", position: "relative", marginBottom: 4 }}>
                          <div style={{ position: "absolute", height: "100%", width: `${pctTotal}%`, background: "var(--surf4)", borderRadius: 99 }} />
                          <div style={{
                            position: "absolute", height: "100%",
                            width: `${pctRec * pctTotal / 100}%`,
                            background: pctRec < 50 ? "var(--err)" : pctRec < 100 ? "var(--warn)" : "var(--ok)",
                            borderRadius: 99, transition: "width 0.4s",
                          }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9.5, color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                            {formatBRL(f.recebido)} recebido
                          </span>
                          {Number(f.a_receber) > 0 && (
                            <span style={{ fontSize: 9.5, color: "var(--warn)", fontFamily: "'DM Mono', monospace" }}>
                              {formatBRL(f.a_receber)} pendente
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
