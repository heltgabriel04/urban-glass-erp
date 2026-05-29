"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFinanceiroClientes, getFaturamentoMensal } from "@/services/financeiro.service";
import { getPedidos } from "@/services/pedidos.service";
import { formatBRL, formatPercent } from "@/lib/formatters";
import type { FinanceiroCliente, FaturamentoMensal, Pedido } from "@/types";

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const TABS = ["Faturamento", "Clientes", "Pedidos"];

export default function RelatoriosPage() {
  const [tab, setTab] = useState(0);
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [fatMensal, setFatMensal] = useState<FaturamentoMensal[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, fat, peds] = await Promise.all([getFinanceiroClientes(), getFaturamentoMensal(2026), getPedidos()]);
    setFinanceiro(fin); setFatMensal(fat); setPedidos(peds); setLoading(false);
  }

  const fatTotal = financeiro.reduce((a, f) => a + Number(f.faturado), 0);
  const recTotal = financeiro.reduce((a, f) => a + Number(f.recebido), 0);
  const meses = MESES_ABREV.map((mes, i) => {
    const fat = fatMensal.find(f => f.mes === i + 1);
    return { mes, faturado: fat ? Number(fat.faturado) : 0, recebido: fat ? Number(fat.recebido) : 0 };
  });
  const maxFat = Math.max(...meses.map(m => m.faturado), 1);
  const statusCount: Record<string, number> = {};
  pedidos.forEach(p => { statusCount[p.status] = (statusCount[p.status] || 0) + 1; });

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Relatórios & BI</div>
      </div>

      <div className="con">
        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Faturamento Total",    value: formatBRL(fatTotal), color:"var(--acc)",  sub:"Acumulado 2026" },
            { label:"Taxa de Recebimento",  value: formatPercent(fatTotal > 0 ? recTotal / fatTotal * 100 : 0), color:"var(--ok)", sub:"do faturado recebido" },
            { label:"Total Pedidos",        value: String(pedidos.length), color:"var(--acc2)", sub: pedidos.filter(p => ["Entregue","Finalizado"].includes(p.status)).length + " finalizados" },
            { label:"Ticket Médio",         value: formatBRL(fatTotal / (pedidos.length || 1)), color:"var(--acc4)", sub:"por pedido" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando relatórios...</div>
        ) : (
          <>
            <div className="tabs mb14">
              {TABS.map((t, i) => <div key={i} className={`tab${tab === i ? " on" : ""}`} onClick={() => setTab(i)}>{t}</div>)}
            </div>

            {tab === 0 && (
              <div className="g2">
                <div className="card">
                  <div className="ct">Faturamento Mensal 2026</div>
                  <div style={{ height:"120px", display:"flex", alignItems:"flex-end", gap:"6px", marginBottom:"8px" }}>
                    {meses.map((m, i) => (
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
                        <div style={{ width:"100%", height:`${m.faturado > 0 ? Math.max((m.faturado / maxFat) * 100, 4) : 4}px`, borderRadius:"3px 3px 0 0", background: m.faturado > 0 ? "var(--acc)" : "var(--surf3)" }} />
                        <div style={{ fontSize:"9px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", marginTop:"3px" }}>{m.mes}</div>
                      </div>
                    ))}
                  </div>
                  <div className="sr"><div className="sl">Total Faturado</div><div className="sv" style={{ color:"var(--acc)" }}>{formatBRL(fatTotal)}</div></div>
                  <div className="sr"><div className="sl">Total Recebido</div><div className="sv" style={{ color:"var(--ok)" }}>{formatBRL(recTotal)}</div></div>
                  <div className="sr"><div className="sl">A Receber</div><div className="sv" style={{ color:"var(--warn)" }}>{formatBRL(fatTotal - recTotal)}</div></div>
                </div>
                <div className="card">
                  <div className="ct">Detalhamento Mensal</div>
                  <div className="tw" style={{ border:"none", borderRadius:0 }}>
                    <table>
                      <thead><tr><th>Mês</th><th>Faturado</th><th>Recebido</th><th>%</th></tr></thead>
                      <tbody>
                        {meses.filter(m => m.faturado > 0).map((m, i) => (
                          <tr key={i}>
                            <td><strong>{m.mes}</strong></td>
                            <td className="mono">{formatBRL(m.faturado)}</td>
                            <td className="mono" style={{ color:"var(--ok)" }}>{formatBRL(m.recebido)}</td>
                            <td className="mono">{formatPercent(m.faturado > 0 ? m.recebido / m.faturado * 100 : 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {tab === 1 && (
              <div className="card">
                <div className="ct">Ranking de Clientes</div>
                <div className="tw" style={{ border:"none", borderRadius:0 }}>
                  <table>
                    <thead><tr><th>Pos.</th><th>Cliente</th><th>Cidade</th><th>Faturado</th><th>Recebido</th><th>A Receber</th><th>Risco</th><th>Pedidos</th></tr></thead>
                    <tbody>
                      {[...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)).map((f, i) => {
                        const risco = Number(f.faturado) > 0 ? Number(f.a_receber) / Number(f.faturado) : 0;
                        return (
                          <tr key={f.cliente_id}>
                            <td className="mono" style={{ color:"var(--t3)" }}>{i+1}°</td>
                            <td><strong>{f.cliente_nome}</strong></td>
                            <td style={{ fontSize:"11px" }}>{f.cidade || "—"}</td>
                            <td className="mono">{formatBRL(f.faturado)}</td>
                            <td className="mono" style={{ color:"var(--acc)" }}>{formatBRL(f.recebido)}</td>
                            <td className="mono" style={{ color:"var(--warn)" }}>{formatBRL(f.a_receber)}</td>
                            <td>{risco === 0 ? <span className="chip cg">Zero</span> : risco < 0.5 ? <span className="chip cy">Médio</span> : <span className="chip cr">Alto</span>}</td>
                            <td className="mono">{f.total_pedidos}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 2 && (
              <div className="g2">
                <div className="card">
                  <div className="ct">Pedidos por Status</div>
                  {Object.entries(statusCount).map(([status, count]) => (
                    <div key={status} className="sr">
                      <div className="sl">{status}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                        <div className="prg" style={{ width:"80px", height:"5px" }}>
                          <div className="prg-f" style={{ width:`${pedidos.length > 0 ? count / pedidos.length * 100 : 0}%`, background:"var(--acc)" }} />
                        </div>
                        <div className="sv">{count}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div className="ct">Indicadores de Pedidos</div>
                  <div className="sr"><div className="sl">Total de Pedidos</div><div className="sv">{pedidos.length}</div></div>
                  <div className="sr"><div className="sl">Entregues / Finalizados</div><div className="sv" style={{ color:"var(--ok)" }}>{pedidos.filter(p => ["Entregue","Finalizado"].includes(p.status)).length}</div></div>
                  <div className="sr"><div className="sl">Em Produção</div><div className="sv" style={{ color:"var(--acc4)" }}>{pedidos.filter(p => p.status.includes("Produção")).length}</div></div>
                  <div className="sr"><div className="sl">Aguardando Otimização</div><div className="sv" style={{ color:"var(--warn)" }}>{pedidos.filter(p => p.status === "Aguardando otimização").length}</div></div>
                  <div className="sr"><div className="sl">m² Total Processado</div><div className="sv" style={{ color:"var(--acc)" }}>{pedidos.reduce((a, p) => a + Number(p.m2_total), 0).toFixed(2)} m²</div></div>
                  <div className="sr"><div className="sl">Valor Médio por Pedido</div><div className="sv">{formatBRL(fatTotal / (pedidos.length || 1))}</div></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}