"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFinanceiroClientes, getFaturamentoMensal } from "@/services/financeiro.service";
import { getPedidos } from "@/services/pedidos.service";
import { formatBRL, formatPercent } from "@/lib/formatters";
import type { FinanceiroCliente, FaturamentoMensal, Pedido } from "@/types";

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const TABS = ["Faturamento","Clientes","Pedidos"];

const STATUS_COR: Record<string, string> = {
  "Aguardando otimização":   "var(--warn)",
  "Em Produção – Corte":     "var(--acc4)",
  "Em Produção – Lapidação": "var(--acc3)",
  "Separação":               "var(--acc2)",
  "Finalizado":              "var(--ok)",
  "Entregue":                "var(--acc)",
  "Cancelado":               "var(--err)",
};

export default function RelatoriosPage() {
  const [tab, setTab]             = useState(0);
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [fatMensal, setFatMensal]   = useState<FaturamentoMensal[]>([]);
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [loading, setLoading]       = useState(true);
  const [mesSel, setMesSel]         = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, fat, peds] = await Promise.all([
      getFinanceiroClientes(),
      getFaturamentoMensal(2026),
      getPedidos(),
    ]);
    setFinanceiro(fin); setFatMensal(fat); setPedidos(peds); setLoading(false);
    setMesSel(new Date().getMonth() + 1);
  }

  // ── Séries mensais ────────────────────────────────────────
  const meses = useMemo(() => MESES_ABREV.map((mes, i) => {
    const fat = fatMensal.find(f => f.mes === i + 1);
    return {
      mes, mesNum: i + 1,
      faturado: fat ? Number(fat.faturado) : 0,
      recebido: fat ? Number(fat.recebido) : 0,
    };
  }), [fatMensal]);

  const maxFat = Math.max(...meses.map(m => m.faturado), 1);

  // ── Totais ────────────────────────────────────────────────
  const fatTotal = financeiro.reduce((a, f) => a + Number(f.faturado), 0);
  const recTotal = financeiro.reduce((a, f) => a + Number(f.recebido), 0);
  const aReceber = fatTotal - recTotal;

  const mesDados  = mesSel ? meses.find(m => m.mesNum === mesSel) : null;
  const fatMesVal = mesDados?.faturado ?? 0;
  const recMesVal = mesDados?.recebido ?? 0;

  // Variação vs mês anterior
  const fatAnt  = mesSel && mesSel > 1 ? (meses.find(m => m.mesNum === mesSel - 1)?.faturado ?? 0) : 0;
  const varMes  = fatAnt > 0 ? ((fatMesVal - fatAnt) / fatAnt) * 100 : 0;

  // ── Pedidos filtrados pelo mês ────────────────────────────
  const pedidosFiltrados = useMemo(() => {
    if (!mesSel) return pedidos;
    return pedidos.filter(p => new Date(p.dt_pedido).getMonth() + 1 === mesSel);
  }, [pedidos, mesSel]);

  // ── Status count ──────────────────────────────────────────
  const statusCount = useMemo(() => {
    const map: Record<string, number> = {};
    pedidos.forEach(p => { map[p.status] = (map[p.status] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [pedidos]);

  const maxStatus = Math.max(...statusCount.map(([, c]) => c), 1);

  // ── Clientes ordenados ───────────────────────────────────
  const clientesOrdenados = useMemo(() =>
    [...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)),
    [financeiro]
  );
  const maxCliFat = clientesOrdenados[0] ? Number(clientesOrdenados[0].faturado) : 1;

  const mesLabel = mesSel ? MESES_ABREV[mesSel - 1] : "Ano todo";

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Relatórios & BI</div>
        <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
          Período: <strong style={{ color: "var(--acc)" }}>{mesSel ? mesLabel + "/2026" : "2026 completo"}</strong>
          {mesSel && (
            <button onClick={() => setMesSel(null)} style={{ marginLeft: "8px", fontSize: "10px", color: "var(--t3)", background: "transparent", border: "1px solid var(--b2)", borderRadius: "4px", padding: "2px 7px", cursor: "pointer" }}>
              ver ano todo
            </button>
          )}
        </div>
      </div>

      <div className="con">
        {/* ── KPIs ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "16px" }}>
          {[
            {
              label:    mesSel ? `Faturamento ${mesLabel}` : "Faturamento Total",
              value:    formatBRL(mesSel ? fatMesVal : fatTotal),
              color:    "var(--acc)",
              sub:      mesSel && fatAnt > 0
                ? (varMes >= 0 ? "↑ +" : "↓ ") + Math.abs(varMes).toFixed(1) + "% vs " + MESES_ABREV[mesSel - 2]
                : "Acumulado 2026",
              subColor: varMes >= 0 ? "var(--ok)" : "var(--err)",
            },
            {
              label:    "Taxa de Recebimento",
              value:    formatPercent(fatTotal > 0 ? recTotal / fatTotal * 100 : 0),
              color:    "var(--ok)",
              sub:      formatBRL(recTotal) + " recebido",
              subColor: "var(--t3)",
            },
            {
              label:    mesSel ? `Pedidos ${mesLabel}` : "Total Pedidos",
              value:    String(pedidosFiltrados.length),
              color:    "var(--acc2)",
              sub:      pedidosFiltrados.filter(p => ["Entregue","Finalizado"].includes(p.status)).length + " finalizados",
              subColor: "var(--t3)",
            },
            {
              label:    "Ticket Médio",
              value:    formatBRL(fatTotal / (pedidos.length || 1)),
              color:    "var(--acc4)",
              sub:      "por pedido · " + pedidos.length + " total",
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

        {loading ? <div className="loading">Carregando relatórios...</div> : (
          <>
            {/* ── TABS ── */}
            <div style={{ display: "flex", gap: "4px", background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "4px", marginBottom: "16px" }}>
              {TABS.map((t, i) => (
                <div
                  key={i}
                  onClick={() => setTab(i)}
                  style={{
                    flex: 1, padding: "8px 14px", borderRadius: "7px", cursor: "pointer",
                    fontSize: "13px", textAlign: "center", fontFamily: "'DM Mono', monospace",
                    fontWeight: tab === i ? 700 : 400,
                    color: tab === i ? "var(--t1)" : "var(--t3)",
                    background: tab === i ? "var(--surf)" : "transparent",
                    boxShadow: tab === i ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>

            {/* ══ TAB 0: FATURAMENTO ══ */}
            {tab === 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

                {/* Gráfico duplo */}
                <div className="card">
                  <div className="ct">
                    Faturamento Mensal 2026
                    <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>clique no mês</span>
                  </div>

                  {/* Legenda do gráfico */}
                  <div style={{ display: "flex", gap: "14px", marginBottom: "10px" }}>
                    {[
                      { color: "var(--acc)",  label: "Faturado" },
                      { color: "var(--ok)",   label: "Recebido" },
                    ].map(l => (
                      <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--t2)" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: l.color }} />
                        {l.label}
                      </div>
                    ))}
                  </div>

                  {/* Barras duplas */}
                  <div style={{ height: "140px", display: "flex", alignItems: "flex-end", gap: "5px" }}>
                    {meses.map((m, i) => {
                      const sel      = mesSel === m.mesNum;
                      const hFat     = m.faturado > 0 ? Math.max((m.faturado / maxFat) * 120, 4) : 4;
                      const hRec     = m.recebido > 0 ? Math.max((m.recebido / maxFat) * 120, 2) : 0;
                      return (
                        <div
                          key={i}
                          onClick={() => setMesSel(sel ? null : m.mesNum)}
                          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", gap: "3px" }}
                          title={m.faturado > 0 ? `Faturado: ${formatBRL(m.faturado)} · Recebido: ${formatBRL(m.recebido)}` : "Sem dados"}
                        >
                          {sel && m.faturado > 0 && (
                            <div style={{ fontSize: "7px", color: "var(--acc)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
                              {formatBRL(m.faturado).replace("R$\u00a0", "")}
                            </div>
                          )}
                          <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: "1px", height: `${hFat}px` }}>
                            {/* Barra faturado */}
                            <div style={{ flex: 1, height: `${hFat}px`, borderRadius: "2px 2px 0 0", background: sel ? "var(--acc)" : m.faturado > 0 ? "rgba(61,255,160,.35)" : "var(--surf2)", transition: "all 0.15s", boxShadow: sel ? "0 0 8px rgba(61,255,160,.4)" : "none" }} />
                            {/* Barra recebido */}
                            <div style={{ flex: 1, height: `${hRec}px`, borderRadius: "2px 2px 0 0", background: sel ? "var(--ok)" : m.recebido > 0 ? "rgba(16,185,129,.5)" : "transparent", transition: "all 0.15s" }} />
                          </div>
                          <div style={{ fontSize: "8px", fontFamily: "'DM Mono', monospace", color: sel ? "var(--acc)" : "var(--t3)", fontWeight: sel ? 700 : 400 }}>
                            {m.mes}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totais */}
                  <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {[
                      { label: "Total Faturado", value: formatBRL(fatTotal), color: "var(--acc)" },
                      { label: "Total Recebido", value: formatBRL(recTotal), color: "var(--ok)" },
                      { label: "A Receber",      value: formatBRL(aReceber), color: "var(--warn)" },
                    ].map(r => (
                      <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--surf2)", borderRadius: "7px" }}>
                        <span style={{ fontSize: "12px", color: "var(--t2)" }}>{r.label}</span>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: r.color, fontFamily: "'DM Mono', monospace" }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tabela detalhada */}
                <div className="card">
                  <div className="ct">
                    Detalhamento Mensal
                    <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{mesSel ? mesLabel + " selecionado" : "todos os meses"}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                    {/* Header */}
                    <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr 60px 80px", gap: "8px", padding: "6px 10px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono', monospace" }}>
                      <div>Mês</div><div>Faturado</div><div>Recebido</div><div>%</div><div>Status</div>
                    </div>
                    {meses.filter(m => m.faturado > 0).map((m, i) => {
                      const pct     = m.faturado > 0 ? m.recebido / m.faturado * 100 : 0;
                      const sel     = mesSel === m.mesNum;
                      const status  = pct >= 100 ? "Quitado" : pct > 0 ? "Parcial" : "Pendente";
                      const sCor    = pct >= 100 ? "var(--ok)" : pct > 0 ? "var(--warn)" : "var(--err)";
                      const sBg     = pct >= 100 ? "rgba(16,185,129,.1)" : pct > 0 ? "rgba(245,158,11,.1)" : "rgba(244,63,94,.1)";
                      return (
                        <div
                          key={i}
                          onClick={() => setMesSel(sel ? null : m.mesNum)}
                          style={{
                            display: "grid", gridTemplateColumns: "50px 1fr 1fr 60px 80px",
                            gap: "8px", padding: "9px 10px", borderRadius: "8px",
                            cursor: "pointer", transition: "all 0.12s",
                            background: sel ? "rgba(61,255,160,.06)" : "var(--surf2)",
                            border: `1px solid ${sel ? "rgba(61,255,160,.3)" : "var(--b1)"}`,
                          }}
                        >
                          <div style={{ fontSize: "12px", fontWeight: sel ? 700 : 500, color: sel ? "var(--acc)" : "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{m.mes}</div>
                          <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t1)" }}>{formatBRL(m.faturado)}</div>
                          <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--ok)" }}>{formatBRL(m.recebido)}</div>
                          <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: sCor }}>{pct.toFixed(0)}%</div>
                          <div style={{ fontSize: "10px", fontWeight: 600, padding: "2px 6px", borderRadius: "4px", background: sBg, color: sCor, textAlign: "center", fontFamily: "'DM Mono', monospace" }}>
                            {status}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB 1: CLIENTES ══ */}
            {tab === 1 && (
              <div className="card">
                <div className="ct">
                  Ranking de Clientes
                  <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{financeiro.length} clientes</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {/* Header */}
                  <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px 120px 120px 120px 70px 60px", gap: "10px", padding: "6px 12px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono', monospace", borderBottom: "1px solid var(--b1)" }}>
                    <div>#</div><div>Cliente</div><div>% Total</div><div>Faturado</div><div>Recebido</div><div>A Receber</div><div>Risco</div><div>Pedidos</div>
                  </div>
                  {clientesOrdenados.map((f, i) => {
                    const risco   = Number(f.faturado) > 0 ? Number(f.a_receber) / Number(f.faturado) : 0;
                    const pctFat  = Number(f.faturado) / maxCliFat * 100;
                    const pctRec  = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                    const riscoLabel = risco === 0 ? "Zero" : risco < 0.5 ? "Médio" : "Alto";
                    const riscoCor   = risco === 0 ? "var(--ok)" : risco < 0.5 ? "var(--warn)" : "var(--err)";
                    const riscoBg    = risco === 0 ? "rgba(16,185,129,.1)" : risco < 0.5 ? "rgba(245,158,11,.1)" : "rgba(244,63,94,.1)";
                    return (
                      <div key={f.cliente_id} style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "10px 12px", background: "var(--surf2)", borderRadius: "9px", border: "1px solid var(--b1)", transition: "border-color 0.15s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--b2)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--b1)"; }}
                      >
                        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px 120px 120px 120px 70px 60px", gap: "10px", alignItems: "center" }}>
                          <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{i + 1}°</div>
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>{f.cliente_nome}</div>
                            {(f as any).cidade && <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>{(f as any).cidade}</div>}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{pctFat.toFixed(1)}%</div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(f.faturado)}</div>
                          <div style={{ fontSize: "12px", color: "var(--ok)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(f.recebido)}</div>
                          <div style={{ fontSize: "12px", color: Number(f.a_receber) > 0 ? "var(--warn)" : "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                            {Number(f.a_receber) > 0 ? formatBRL(f.a_receber) : "—"}
                          </div>
                          <div style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "5px", background: riscoBg, color: riscoCor, textAlign: "center", fontFamily: "'DM Mono', monospace" }}>
                            {riscoLabel}
                          </div>
                          <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t2)", textAlign: "center" }}>{f.total_pedidos}</div>
                        </div>
                        {/* Barra dupla de recebimento */}
                        <div style={{ height: "4px", borderRadius: "2px", background: "var(--surf3)", overflow: "hidden", position: "relative" }}>
                          <div style={{ position: "absolute", height: "100%", width: `${pctFat}%`, background: "var(--surf4)", borderRadius: "2px" }} />
                          <div style={{ position: "absolute", height: "100%", width: `${pctRec * pctFat / 100}%`, background: pctRec < 50 ? "var(--err)" : pctRec < 100 ? "var(--warn)" : "var(--ok)", borderRadius: "2px", transition: "width 0.4s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ TAB 2: PEDIDOS ══ */}
            {tab === 2 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

                {/* Status pipeline visual */}
                <div className="card">
                  <div className="ct">
                    Pedidos por Status
                    <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{pedidos.length} total</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                    {statusCount.map(([status, count]) => {
                      const cor = STATUS_COR[status] ?? "var(--t3)";
                      const pct = (count / maxStatus) * 100;
                      const pctTotal = (count / pedidos.length) * 100;
                      return (
                        <div key={status} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", background: "var(--surf2)", borderRadius: "9px", border: "1px solid var(--b1)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cor, flexShrink: 0 }} />
                              <span style={{ fontSize: "12px", color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{status}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{pctTotal.toFixed(0)}%</span>
                              <span style={{ fontSize: "16px", fontWeight: 800, color: cor, fontFamily: "'DM Mono', monospace", minWidth: "28px", textAlign: "right" }}>{count}</span>
                            </div>
                          </div>
                          <div style={{ height: "4px", borderRadius: "2px", background: "var(--surf3)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: "2px", transition: "width 0.4s", opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Indicadores + m² */}
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div className="card">
                    <div className="ct">Indicadores de Produção</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {[
                        { label: "Total de Pedidos",       value: String(pedidos.length),                                                            color: "var(--t1)" },
                        { label: "Finalizados / Entregues", value: String(pedidos.filter(p => ["Entregue","Finalizado"].includes(p.status)).length),  color: "var(--ok)" },
                        { label: "Em Produção",             value: String(pedidos.filter(p => p.status.includes("Produção")).length),                 color: "var(--acc4)" },
                        { label: "Ag. Otimização",         value: String(pedidos.filter(p => p.status === "Aguardando otimização").length),           color: "var(--warn)" },
                        { label: "m² Total Processado",    value: pedidos.reduce((a, p) => a + Number(p.m2_total), 0).toFixed(2) + " m²",            color: "var(--acc)" },
                        { label: "Valor Médio por Pedido", value: formatBRL(fatTotal / (pedidos.length || 1)),                                        color: "var(--acc4)" },
                      ].map(row => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--surf2)", borderRadius: "7px" }}>
                          <span style={{ fontSize: "12px", color: "var(--t2)" }}>{row.label}</span>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: row.color, fontFamily: "'DM Mono', monospace" }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Evolução de m² por mês */}
                  <div className="card">
                    <div className="ct">m² por Mês</div>
                    {(() => {
                      const m2Mes = MESES_ABREV.map((mes, i) => {
                        const total = pedidos
                          .filter(p => new Date(p.dt_pedido).getMonth() === i)
                          .reduce((a, p) => a + Number(p.m2_total), 0);
                        return { mes, total };
                      });
                      const maxM2 = Math.max(...m2Mes.map(m => m.total), 1);
                      return (
                        <div style={{ height: "80px", display: "flex", alignItems: "flex-end", gap: "4px" }}>
                          {m2Mes.map((m, i) => (
                            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                              <div style={{ width: "100%", height: `${m.total > 0 ? Math.max((m.total / maxM2) * 64, 3) : 3}px`, borderRadius: "2px 2px 0 0", background: m.total > 0 ? "var(--acc2)" : "var(--surf3)", opacity: mesSel === i + 1 ? 1 : 0.5, transition: "all 0.15s" }} />
                              <div style={{ fontSize: "8px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{m.mes}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                      Total: <strong style={{ color: "var(--acc2)" }}>{pedidos.reduce((a, p) => a + Number(p.m2_total), 0).toFixed(2)} m²</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}