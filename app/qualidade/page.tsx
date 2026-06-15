"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import {
  getIndicadoresMensais,
  getResumoQualidade,
  getNaoConformidades,
  getQuebras,
  getRetrabalhos,
} from "@/services/qualidade.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import type {
  NaoConformidade, Quebra, Retrabalho,
  GravidadeNC, StatusNaoConformidade,
  IndicadorQualidadeMensal,
} from "@/types";

const GRAVIDADE_COR: Record<GravidadeNC, string> = {
  Baixa:   "var(--ok)",
  Média:   "var(--warn)",
  Alta:    "#f97316",
  Crítica: "var(--err)",
};

const STATUS_COR: Record<StatusNaoConformidade, string> = {
  "Aberta":               "var(--warn)",
  "Em Análise":           "var(--acc2)",
  "Aguardando Correção":  "#f97316",
  "Resolvida":            "var(--ok)",
  "Cancelada":            "var(--t3)",
};

export default function QualidadeDashboardPage() {
  const [loading, setLoading]                             = useState(true);
  const [resumo, setResumo]                               = useState({ ncsAbertas: 0, ncsCriticas: 0, m2PerdidoMes: 0, valorPerdidoMes: 0, retrabalhosAbertos: 0 });
  const [mensais, setMensais]                             = useState<IndicadorQualidadeMensal[]>([]);
  const [ncsRecentes, setNcsRecentes]                     = useState<NaoConformidade[]>([]);
  const [quebrasRecentes, setQuebrasRecentes]             = useState<Quebra[]>([]);
  const [retrabalhosAbertos, setRetrabalhosAbertos]       = useState<Retrabalho[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [res, mens, ncs, qbrs, rtrbs] = await Promise.all([
      getResumoQualidade(),
      getIndicadoresMensais(),
      getNaoConformidades(),
      getQuebras(),
      getRetrabalhos({ status: "Pendente" }),
    ]);
    setResumo(res);
    setMensais(mens);
    setNcsRecentes(ncs.slice(0, 8));
    setQuebrasRecentes(qbrs.slice(0, 8));
    setRetrabalhosAbertos(rtrbs.slice(0, 6));
    setLoading(false);
  }

  // Distribuição por tipo de NC
  const porTipo = useMemo(() => {
    const map = new Map<string, number>();
    ncsRecentes.forEach(nc => map.set(nc.tipo, (map.get(nc.tipo) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [ncsRecentes]);

  // Gráfico mensal
  const maxNCs    = Math.max(...mensais.map(m => m.total_ncs), 1);
  const maxPerda  = Math.max(...mensais.map(m => Number(m.valor_perda_total ?? 0)), 1);

  const qualidadeGeral = useMemo(() => {
    if (!mensais.length) return null;
    const ultimo = mensais[mensais.length - 1];
    if (!ultimo.total_ncs) return 100;
    return ((ultimo.resolvidas / ultimo.total_ncs) * 100);
  }, [mensais]);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Dashboard de Qualidade</div>
        <div style={{ display:"flex", gap:"6px" }}>
          <Link href="/qualidade/nao-conformidades" className="btn bg sm" style={{ textDecoration:"none" }}>Não Conformidades</Link>
          <Link href="/qualidade/quebras"           className="btn bg sm" style={{ textDecoration:"none" }}>Quebras</Link>
          <Link href="/qualidade/retrabalhos"       className="btn bg sm" style={{ textDecoration:"none" }}>Retrabalhos</Link>
        </div>
      </div>

      {loading ? <div className="loading con">Carregando…</div> : (
        <div className="con" style={{ display:"flex", flexDirection:"column", gap:"16px" }}>

          {/* ── KPIs Principais ─────────────────────────────────────── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"12px" }}>
            {[
              { label:"NCs em Aberto",       value: String(resumo.ncsAbertas),           color: resumo.ncsAbertas > 0 ? "var(--warn)" : "var(--ok)",  sub:"registros ativos" },
              { label:"NCs Críticas Ativas",  value: String(resumo.ncsCriticas),          color: resumo.ncsCriticas > 0 ? "var(--err)" : "var(--ok)",  sub:"requerem ação imediata" },
              { label:"m² Perdido no Mês",    value: resumo.m2PerdidoMes.toFixed(3)+" m²", color:"var(--warn)", sub:"por quebras de vidro" },
              { label:"Custo de Perdas/Mês",  value: formatBRL(resumo.valorPerdidoMes),   color:"var(--err)",  sub:"valor financeiro estimado" },
              { label:"Retrabalhos Ativos",   value: String(resumo.retrabalhosAbertos),   color: resumo.retrabalhosAbertos > 0 ? "#f97316" : "var(--ok)", sub:"pendente + em execução" },
            ].map(c => (
              <div key={c.label} style={{ background:"var(--surf)", border:"1px solid var(--b1)", borderRadius:"12px", padding:"18px 20px" }}>
                <div style={{ fontSize:"10px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".08em", fontWeight:600, marginBottom:"8px" }}>{c.label}</div>
                <div style={{ fontSize:"22px", fontWeight:700, color:c.color, fontFamily:"'DM Mono',monospace", lineHeight:1.1, marginBottom:"4px" }}>{c.value}</div>
                <div style={{ fontSize:"10px", color:"var(--t3)" }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Alertas NCs Críticas ────────────────────────────────── */}
          {resumo.ncsCriticas > 0 && (
            <div style={{ background:"rgba(244,63,94,.08)", border:"1px solid rgba(244,63,94,.35)", borderRadius:"10px", padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <span style={{ fontSize:"16px" }}>⚠</span>
                <span style={{ fontSize:"13px", color:"var(--err)", fontWeight:600 }}>
                  {resumo.ncsCriticas} não conformidade(s) CRÍTICA(S) em aberto. Requerem ação imediata.
                </span>
              </div>
              <Link href="/qualidade/nao-conformidades" style={{ fontSize:"11px", padding:"5px 12px", borderRadius:"6px", border:"1px solid rgba(244,63,94,.5)", color:"var(--err)", textDecoration:"none", fontWeight:700 }}>
                Ver Críticas →
              </Link>
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>

            {/* ── Gráfico Mensal NC ────────────────────────────────── */}
            <div className="card">
              <div className="ct">NCs por Mês</div>
              {mensais.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px", color:"var(--t3)", fontSize:"12px" }}>Sem dados históricos ainda.</div>
              ) : (
                <>
                  <div style={{ display:"flex", gap:"10px", marginBottom:"10px" }}>
                    {[{ color:"rgba(61,255,160,.5)", label:"NCs" },{ color:"rgba(244,63,94,.45)", label:"Críticas" }].map(l => (
                      <div key={l.label} style={{ display:"flex", alignItems:"center", gap:"5px", fontSize:"10px", color:"var(--t2)" }}>
                        <div style={{ width:"10px", height:"10px", borderRadius:"2px", background:l.color }} />{l.label}
                      </div>
                    ))}
                  </div>
                  <div style={{ height:"130px", display:"flex", alignItems:"flex-end", gap:"8px" }}>
                    {mensais.map((m, i) => {
                      const h  = Math.max((m.total_ncs / maxNCs) * 115, m.total_ncs > 0 ? 4 : 0);
                      const hc = Math.max((m.criticas  / maxNCs) * 115, m.criticas  > 0 ? 2 : 0);
                      const label = new Date(m.mes + "T12:00:00").toLocaleDateString("pt-BR", { month:"short" });
                      return (
                        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"3px" }}>
                          <div style={{ width:"100%", display:"flex", alignItems:"flex-end", gap:"2px", height:`${h || 4}px` }}>
                            <div style={{ flex:1, height:`${h}px`, borderRadius:"2px 2px 0 0", background:"rgba(61,255,160,.45)" }} />
                            <div style={{ flex:1, height:`${hc}px`, borderRadius:"2px 2px 0 0", background:"rgba(244,63,94,.5)" }} />
                          </div>
                          <div style={{ fontSize:"8px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* ── Valor de Perdas por Mês ──────────────────────────── */}
            <div className="card">
              <div className="ct">Custo de Perdas por Mês (R$)</div>
              {mensais.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px", color:"var(--t3)", fontSize:"12px" }}>Sem dados históricos ainda.</div>
              ) : (
                <div style={{ height:"130px", display:"flex", alignItems:"flex-end", gap:"8px", marginTop:"30px" }}>
                  {mensais.map((m, i) => {
                    const val = Number(m.valor_perda_total ?? 0);
                    const h   = Math.max((val / maxPerda) * 115, val > 0 ? 4 : 0);
                    const label = new Date(m.mes + "T12:00:00").toLocaleDateString("pt-BR", { month:"short" });
                    return (
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"3px" }} title={formatBRL(val)}>
                        <div style={{ width:"100%", height:`${h}px`, borderRadius:"2px 2px 0 0", background:"rgba(244,63,94,.45)" }} />
                        <div style={{ fontSize:"8px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"14px" }}>

            {/* ── NCs Recentes ─────────────────────────────────────── */}
            <div className="card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                <span className="ct" style={{ margin:0 }}>NCs Recentes</span>
                <Link href="/qualidade/nao-conformidades" style={{ fontSize:"10px", color:"var(--acc)", textDecoration:"none" }}>ver todas →</Link>
              </div>
              {ncsRecentes.length === 0 ? (
                <div style={{ textAlign:"center", padding:"20px", color:"var(--t3)", fontSize:"12px" }}>Nenhuma NC registrada.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                  {ncsRecentes.map(nc => (
                    <div key={nc.id} style={{ padding:"8px 10px", background:"var(--surf2)", borderRadius:"7px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:"11px", fontWeight:700, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{nc.codigo}</div>
                        <div style={{ fontSize:"10px", color:"var(--t2)", marginTop:"1px" }}>{nc.tipo}</div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"2px" }}>
                        <span style={{ fontSize:"8px", fontWeight:700, padding:"1px 5px", borderRadius:"3px", background: GRAVIDADE_COR[nc.gravidade]+"22", color: GRAVIDADE_COR[nc.gravidade] }}>{nc.gravidade}</span>
                        <span style={{ fontSize:"8px", fontWeight:600, padding:"1px 5px", borderRadius:"3px", background: STATUS_COR[nc.status]+"22", color: STATUS_COR[nc.status] }}>{nc.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Top Tipos de NC ──────────────────────────────────── */}
            <div className="card">
              <div className="ct">Principais Causas de NCs</div>
              {porTipo.length === 0 ? (
                <div style={{ textAlign:"center", padding:"20px", color:"var(--t3)", fontSize:"12px" }}>Sem dados.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  {porTipo.map(([tipo, count]) => {
                    const pct = (count / Math.max(...porTipo.map(t => t[1]))) * 100;
                    return (
                      <div key={tipo}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"3px" }}>
                          <span style={{ fontSize:"11px", color:"var(--t1)" }}>{tipo}</span>
                          <span style={{ fontSize:"11px", fontWeight:700, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{count}</span>
                        </div>
                        <div style={{ height:"5px", borderRadius:"3px", background:"var(--surf2)", overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:"rgba(61,255,160,.5)", borderRadius:"3px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Retrabalhos Pendentes ────────────────────────────── */}
            <div className="card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                <span className="ct" style={{ margin:0 }}>Retrabalhos Pendentes</span>
                <Link href="/qualidade/retrabalhos" style={{ fontSize:"10px", color:"var(--acc)", textDecoration:"none" }}>ver todos →</Link>
              </div>
              {retrabalhosAbertos.length === 0 ? (
                <div style={{ textAlign:"center", padding:"20px", color:"var(--ok)", fontSize:"12px" }}>Nenhum retrabalho pendente.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                  {retrabalhosAbertos.map(r => (
                    <div key={r.id} style={{ padding:"8px 10px", background:"var(--surf2)", borderRadius:"7px" }}>
                      <div style={{ fontSize:"11px", fontWeight:600, color:"var(--t1)" }}>{r.motivo}</div>
                      <div style={{ fontSize:"10px", color:"var(--t3)", marginTop:"2px" }}>
                        {r.etapa_origem.replace("Em Produção – ","")} → {r.etapa_correcao.replace("Em Produção – ","")}
                        {r.pedido_id && <span style={{ marginLeft:"6px", color:"var(--acc2)", fontFamily:"'DM Mono',monospace" }}>{r.pedido_id}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Histórico Mensal Completo ────────────────────────────── */}
          {mensais.length > 0 && (
            <div className="card">
              <div className="ct">Histórico Mensal de Qualidade</div>
              <div style={{ display:"grid", gridTemplateColumns:"130px 80px 80px 80px 100px 80px 120px", gap:"8px", padding:"7px 12px", fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".07em", fontFamily:"'DM Mono',monospace", borderBottom:"1px solid var(--b1)" }}>
                <div>Mês</div><div style={{ textAlign:"right" }}>Total NCs</div><div style={{ textAlign:"right" }}>Resolvidas</div><div style={{ textAlign:"right" }}>Críticas</div><div style={{ textAlign:"right" }}>m² Perdido</div><div style={{ textAlign:"right" }}>Retrabalhos</div><div style={{ textAlign:"right" }}>Custo Perdas</div>
              </div>
              {[...mensais].reverse().map((m, i) => {
                const taxaRes = m.total_ncs > 0 ? (m.resolvidas / m.total_ncs * 100) : 100;
                return (
                  <div key={m.mes} style={{ display:"grid", gridTemplateColumns:"130px 80px 80px 80px 100px 80px 120px", gap:"8px", padding:"9px 12px", background: i % 2 === 0 ? "transparent" : "var(--surf2)", borderRadius:"5px" }}>
                    <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:600 }}>
                      {new Date(m.mes + "T12:00:00").toLocaleDateString("pt-BR", { month:"long", year:"numeric" }).replace(/^\w/, c => c.toUpperCase())}
                    </div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color:"var(--t1)", textAlign:"right" }}>{m.total_ncs}</div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color: taxaRes >= 80 ? "var(--ok)" : "var(--warn)", fontWeight:600, textAlign:"right" }}>{m.resolvidas}</div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color: m.criticas > 0 ? "var(--err)" : "var(--t3)", fontWeight: m.criticas > 0 ? 700 : 400, textAlign:"right" }}>{m.criticas}</div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color:"var(--warn)", textAlign:"right" }}>{Number(m.m2_perdido ?? 0).toFixed(3)} m²</div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color:"var(--t2)", textAlign:"right" }}>{m.total_retrabalhos}</div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color:"var(--err)", textAlign:"right" }}>{formatBRL(Number(m.valor_perda_total ?? 0))}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
