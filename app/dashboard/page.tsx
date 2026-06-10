"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidos } from "@/services/pedidos.service";
import { getFinanceiroClientes, getFaturamentoMensal } from "@/services/financeiro.service";
import { formatBRL, formatPercent } from "@/lib/formatters";
import type { Pedido, FinanceiroCliente, FaturamentoMensal } from "@/types";

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
  const [loading, setLoading]       = useState(true);
  const [mesSel, setMesSel]         = useState<number | null>(null); // null = ano todo

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [peds, fin, fat] = await Promise.all([
      getPedidos(),
      getFinanceiroClientes(),
      getFaturamentoMensal(new Date().getFullYear()),
    ]);
    setPedidos(peds);
    setFinanceiro(fin);
    setFatMensal(fat);
    setLoading(false);
  }

  // ── Barras do gráfico ──────────────────────────────────────
  const barras = useMemo(() => MESES_ABREV.map((mes, i) => {
    const fat = fatMensal.find(f => f.mes === i + 1);
    return { mes, mesNum: i + 1, faturado: fat ? Number(fat.faturado) : 0 };
  }), [fatMensal]);

  const maxBar = Math.max(...barras.map(b => b.faturado), 1);

  // ── Pedidos filtrados pelo mês selecionado ─────────────────
  const anoAtual = new Date().getFullYear();

  const pedidosFiltrados = useMemo(() => {
    if (!mesSel) return pedidos;
    return pedidos.filter(p => {
      const d = new Date(p.dt_pedido);
      return d.getFullYear() === anoAtual && d.getMonth() + 1 === mesSel;
    });
  }, [pedidos, mesSel, anoAtual]);

  // ── KPIs: mês selecionado vs ano todo ─────────────────────
  const fatTotal  = financeiro.reduce((a, f) => a + Number(f.faturado), 0);
  const recTotal  = financeiro.reduce((a, f) => a + Number(f.recebido), 0);
  const aReceber  = fatTotal - recTotal;

  const fatMesSel = mesSel ? (barras.find(b => b.mesNum === mesSel)?.faturado ?? 0) : fatTotal;
  const pedMesSel = pedidosFiltrados.length;
  const ticketMes = pedMesSel > 0 ? fatMesSel / pedMesSel : 0;

  // Comparação com mês anterior
  const fatMesAnt = mesSel && mesSel > 1
    ? (barras.find(b => b.mesNum === mesSel - 1)?.faturado ?? 0)
    : 0;
  const varMes = fatMesAnt > 0 ? ((fatMesSel - fatMesAnt) / fatMesAnt) * 100 : 0;

  // ── Pipeline operacional (sempre ano todo) ─────────────────
  const pipeline = ETAPAS.map(e => ({
    ...e,
    count: pedidos.filter(p => p.status === e.status).length,
  }));
  const totalAtivos = pipeline.slice(0, 4).reduce((a, e) => a + e.count, 0);

  // ── Alertas ────────────────────────────────────────────────
  const inadimplentes  = financeiro.filter(f => Number(f.recebido) === 0 && Number(f.faturado) > 0);
  const parciais       = financeiro.filter(f => Number(f.recebido) > 0 && Number(f.a_receber) > 0);
  const aguardandoOtim = pedidos.filter(p => p.status === "Aguardando otimização");

  // ── Top clientes (filtrado pelo mês) ──────────────────────
  const topCli = useMemo(() => {
    if (!mesSel) {
      return [...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)).slice(0, 6);
    }
    // Agrupa pedidos do mês por cliente
    const map = new Map<string, { nome: string; cidade: string; total: number; recebido: number }>();
    pedidosFiltrados.forEach(p => {
      const nome = p.clientes?.nome ?? "—";
      const cidade = p.clientes?.cidade ?? "";
      const id = String(p.cliente_id ?? nome);
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

  const maxTop = Math.max(...topCli.map(c => Number(c.faturado)), 1);

  const mesLabel = mesSel ? MESES_ABREV[mesSel - 1] + "/" + anoAtual : anoAtual + " completo";

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Dashboard</div>
        <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
          Visualizando: <strong style={{ color: "var(--acc)" }}>{mesLabel}</strong>
          {mesSel && (
            <button
              onClick={() => setMesSel(null)}
              style={{ marginLeft: "8px", fontSize: "10px", color: "var(--t3)", background: "transparent", border: "1px solid var(--b2)", borderRadius: "4px", padding: "2px 7px", cursor: "pointer" }}
            >
              ver ano todo
            </button>
          )}
        </div>
      </div>

      <div className="con">
        {loading ? <div className="loading">Carregando dashboard...</div> : (
          <>
            {/* ── KPIs ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "16px" }}>
              {[
                {
                  label:  mesSel ? `Faturamento ${MESES_ABREV[mesSel-1]}` : "Faturamento Total",
                  value:  formatBRL(fatMesSel),
                  color:  "var(--acc)",
                  sub:    mesSel && fatMesAnt > 0
                    ? (varMes >= 0 ? "↑ " : "↓ ") + Math.abs(varMes).toFixed(1) + "% vs " + MESES_ABREV[mesSel-2]
                    : `↑ Acumulado ${anoAtual}`,
                  subColor: varMes >= 0 ? "var(--ok)" : "var(--err)",
                },
                {
                  label:    "Recebido (ano)",
                  value:    formatBRL(recTotal),
                  color:    "var(--ok)",
                  sub:      formatPercent(fatTotal > 0 ? recTotal / fatTotal * 100 : 0) + " do faturado",
                  subColor: "var(--t3)",
                },
                {
                  label:    "A Receber",
                  value:    formatBRL(aReceber),
                  color:    aReceber > 0 ? "var(--warn)" : "var(--ok)",
                  sub:      inadimplentes.length > 0 ? inadimplentes.length + " cliente(s) sem pagamento" : "✓ Sem inadimplência",
                  subColor: inadimplentes.length > 0 ? "var(--err)" : "var(--ok)",
                },
                {
                  label:    mesSel ? `Pedidos ${MESES_ABREV[mesSel-1]}` : "Pedidos Ativos",
                  value:    mesSel ? String(pedMesSel) : String(totalAtivos),
                  color:    "var(--acc2)",
                  sub:      mesSel ? `Ticket médio ${formatBRL(ticketMes)}` : `de ${pedidos.length} total`,
                  subColor: "var(--t3)",
                },
              ].map(card => (
                <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "18px 20px" }}>
                  <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>{card.label}</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginBottom: "6px" }}>{card.value}</div>
                  <div style={{ fontSize: "11px", color: card.subColor }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* ── GRÁFICO + PIPELINE ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>

              {/* Gráfico clicável */}
              <div className="card">
                <div className="ct">
                  Faturamento Mensal
                  <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                    clique no mês para filtrar
                  </span>
                </div>
                <div style={{ height: "120px", display: "flex", alignItems: "flex-end", gap: "4px" }}>
                  {barras.map((b, i) => {
                    const selecionado = mesSel === b.mesNum;
                    const altura = b.faturado > 0 ? Math.max((b.faturado / maxBar) * 100, 4) : 4;
                    return (
                      <div
                        key={i}
                        onClick={() => setMesSel(selecionado ? null : b.mesNum)}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", gap: "3px" }}
                        title={b.faturado > 0 ? formatBRL(b.faturado) : "Sem dados"}
                      >
                        {/* Valor ao selecionar */}
                        {selecionado && b.faturado > 0 && (
                          <div style={{ fontSize: "8px", color: "var(--acc)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap", marginBottom: "2px" }}>
                            {formatBRL(b.faturado).replace("R$\u00a0", "")}
                          </div>
                        )}
                        <div style={{
                          width: "100%",
                          height: `${altura}px`,
                          borderRadius: "3px 3px 0 0",
                          background: selecionado
                            ? "var(--acc)"
                            : b.faturado > 0
                              ? "var(--surf3)"
                              : "var(--surf2)",
                          border: selecionado ? "none" : "1px solid var(--b2)",
                          borderBottom: "none",
                          transition: "all 0.15s",
                          boxShadow: selecionado ? "0 0 12px rgba(61,255,160,.3)" : "none",
                        }} />
                        <div style={{
                          fontSize: "9px",
                          fontFamily: "'DM Mono', monospace",
                          color: selecionado ? "var(--acc)" : "var(--t3)",
                          fontWeight: selecionado ? 700 : 400,
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
                  Pipeline de Produção
                  <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                    {totalAtivos} em andamento
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {pipeline.map(e => {
                    const maxCount = Math.max(...pipeline.map(p => p.count), 1);
                    const pct = (e.count / maxCount) * 100;
                    return (
                      <a
                        key={e.status}
                        href={`/pedidos`}
                        style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px", padding: "7px 10px", borderRadius: "8px", background: "var(--surf2)", border: "1px solid var(--b1)", transition: "all 0.15s" }}
                        onMouseEnter={e2 => { (e2.currentTarget as HTMLAnchorElement).style.borderColor = e.color; }}
                        onMouseLeave={e2 => { (e2.currentTarget as HTMLAnchorElement).style.borderColor = "var(--b1)"; }}
                      >
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                        <div style={{ fontSize: "12px", color: "var(--t2)", flex: 1, fontFamily: "'DM Mono', monospace" }}>{e.label}</div>
                        <div style={{ width: "60px", height: "4px", borderRadius: "2px", background: "var(--surf3)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: e.color, borderRadius: "2px", transition: "width 0.4s" }} />
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: e.count > 0 ? e.color : "var(--t3)", fontFamily: "'DM Mono', monospace", width: "24px", textAlign: "right" }}>
                          {e.count}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── TOP CLIENTES + ALERTAS ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

              {/* Top clientes */}
              <div className="card">
                <div className="ct">
                  Top Clientes
                  <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{mesLabel}</span>
                </div>
                {topCli.length === 0 && (
                  <div style={{ color: "var(--t3)", fontSize: "12px", padding: "16px 0", textAlign: "center" }}>Nenhum pedido neste período.</div>
                )}
                {topCli.map((f, i) => {
                  const pctTotal = Number(f.faturado) / maxTop * 100;
                  const pctRec   = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                  return (
                    <div key={f.cliente_id} style={{ padding: "10px 0", borderBottom: i < topCli.length - 1 ? "1px solid var(--b1)" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "5px" }}>
                        <div>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--t1)" }}>{f.cliente_nome}</span>
                          {(f as any).cidade && <span style={{ fontSize: "10px", color: "var(--t3)", marginLeft: "6px" }}>{(f as any).cidade}</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                            {(pctTotal).toFixed(0)}%
                          </span>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>
                            {formatBRL(f.faturado)}
                          </span>
                        </div>
                      </div>
                      {/* Barra dupla: total vs recebido */}
                      <div style={{ height: "5px", borderRadius: "3px", background: "var(--surf3)", overflow: "hidden", position: "relative" }}>
                        <div style={{ position: "absolute", height: "100%", width: `${pctTotal}%`, background: "var(--surf4)", borderRadius: "3px" }} />
                        <div style={{ position: "absolute", height: "100%", width: `${pctRec * pctTotal / 100}%`, background: pctRec < 50 ? "var(--err)" : pctRec < 100 ? "var(--warn)" : "var(--ok)", borderRadius: "3px", transition: "width 0.4s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
                        <span style={{ fontSize: "9px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                          recebido {formatBRL(f.recebido)}
                        </span>
                        {Number(f.a_receber) > 0 && (
                          <span style={{ fontSize: "9px", color: "var(--warn)", fontFamily: "'DM Mono', monospace" }}>
                            − {formatBRL(f.a_receber)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Alertas separados */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                {/* Financeiro */}
                <div className="card" style={{ flex: 1 }}>
                  <div className="ct">
                    Alertas Financeiros
                    {inadimplentes.length + parciais.length === 0 && (
                      <span style={{ fontSize: "10px", color: "var(--ok)", fontFamily: "'DM Mono', monospace" }}>✓ ok</span>
                    )}
                  </div>
                  {inadimplentes.length === 0 && parciais.length === 0 && (
                    <div style={{ fontSize: "12px", color: "var(--t3)", padding: "8px 0" }}>Nenhuma pendência financeira.</div>
                  )}
                  {inadimplentes.map(f => (
                    <div key={f.cliente_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: "5px", background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.2)", borderRadius: "7px" }}>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--err)" }}>{f.cliente_nome}</div>
                        <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>sem nenhum pagamento</div>
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--err)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(f.faturado)}</div>
                    </div>
                  ))}
                  {parciais.slice(0, 3).map(f => (
                    <div key={f.cliente_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: "5px", background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", borderRadius: "7px" }}>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--warn)" }}>{f.cliente_nome}</div>
                        <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>pagamento parcial</div>
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--warn)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(f.a_receber)}</div>
                    </div>
                  ))}
                </div>

                {/* Operacional */}
                <div className="card" style={{ flex: 1 }}>
                  <div className="ct">
                    Alertas Operacionais
                    {aguardandoOtim.length === 0 && (
                      <span style={{ fontSize: "10px", color: "var(--ok)", fontFamily: "'DM Mono', monospace" }}>✓ ok</span>
                    )}
                  </div>
                  {aguardandoOtim.length === 0 && (
                    <div style={{ fontSize: "12px", color: "var(--t3)", padding: "8px 0" }}>Nenhum pedido aguardando otimização.</div>
                  )}
                  {aguardandoOtim.map(p => (
                    <a
                      key={p.id}
                      href={`/otimizador?pedido=${p.id}`}
                      style={{ textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: "5px", background: "rgba(0,200,255,.06)", border: "1px solid rgba(0,200,255,.2)", borderRadius: "7px", transition: "all 0.15s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--acc2)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(0,200,255,.2)"; }}
                    >
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--acc2)", fontFamily: "'DM Mono', monospace" }}>{p.id}</div>
                        <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>{p.clientes?.nome ?? "—"}</div>
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--acc2)", fontFamily: "'DM Mono', monospace" }}>otimizar →</div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}