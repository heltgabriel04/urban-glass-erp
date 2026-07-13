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
  "Baixa":   "var(--ok)",
  "Média":   "var(--warn)",
  "Alta":    "#f97316",
  "Crítica": "var(--err)",
};

const GRAVIDADE_CHIP: Record<GravidadeNC, string> = {
  "Baixa":   "cg",
  "Média":   "cy",
  "Alta":    "co",
  "Crítica": "cr",
};

const STATUS_COR: Record<StatusNaoConformidade, string> = {
  "Aberta":               "var(--warn)",
  "Em Análise":           "var(--acc2)",
  "Aguardando Correção":  "#f97316",
  "Resolvida":            "var(--ok)",
  "Cancelada":            "var(--t3)",
};

const STATUS_CHIP: Record<StatusNaoConformidade, string> = {
  "Aberta":               "cy",
  "Em Análise":           "cb",
  "Aguardando Correção":  "co",
  "Resolvida":            "cg",
  "Cancelada":            "cgr",
};

export default function QualidadeDashboardPage() {
  const [loading, setLoading]                       = useState(true);
  const [resumo, setResumo]                         = useState({ ncsAbertas: 0, ncsCriticas: 0, ncsAntigas: 0, m2PerdidoMes: 0, valorPerdidoMes: 0, retrabalhosAbertos: 0, retrabalhosAntigos: 0 });
  const [mensais, setMensais]                       = useState<IndicadorQualidadeMensal[]>([]);
  const [ncsRecentes, setNcsRecentes]               = useState<NaoConformidade[]>([]);
  const [retrabalhosAbertos, setRetrabalhosAbertos] = useState<Retrabalho[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [res, mens, ncs, rtrbs] = await Promise.all([
      getResumoQualidade(),
      getIndicadoresMensais(),
      getNaoConformidades(),
      getRetrabalhos({ status: "Pendente" }),
    ]);
    setResumo(res);
    setMensais(mens);
    setNcsRecentes(ncs.slice(0, 10));
    setRetrabalhosAbertos(rtrbs.slice(0, 8));
    setLoading(false);
  }

  // NCs abertas (nao resolvidas/canceladas)
  const ncsAbertas = useMemo(() =>
    ncsRecentes.filter(nc => nc.status !== "Resolvida" && nc.status !== "Cancelada"),
    [ncsRecentes]
  );

  // Distribuicao por tipo
  const porTipo = useMemo(() => {
    const map = new Map<string, number>();
    ncsRecentes.forEach(nc => map.set(nc.tipo, (map.get(nc.tipo) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [ncsRecentes]);

  // Grafico mensal — ultimos 8 meses
  const mensaisVis  = useMemo(() => mensais.slice(-8), [mensais]);
  const maxNCs      = Math.max(...mensaisVis.map(m => m.total_ncs), 1);
  const maxPerda    = Math.max(...mensaisVis.map(m => Number(m.valor_perda_total ?? 0)), 1);

  // Tendencia vs mes anterior
  const tendencia = useMemo(() => {
    if (mensaisVis.length < 2) return null;
    const ult  = mensaisVis[mensaisVis.length - 1];
    const ant  = mensaisVis[mensaisVis.length - 2];
    if (!ant.total_ncs) return null;
    return ((ult.total_ncs - ant.total_ncs) / ant.total_ncs) * 100;
  }, [mensaisVis]);

  return (
    <AppLayout>
      {/* ── TOPBAR ── */}
      <div className="tb">
        <div>
          <div className="tb-title">Qualidade</div>
          <div style={{ fontSize: 11, color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>
            {resumo.ncsAbertas > 0
              ? `${resumo.ncsAbertas} registros ativos`
              : "sem pendências abertas"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <Link href="/qualidade/nao-conformidades" className="btn bg sm" style={{ textDecoration: "none" }}>Não Conformidades</Link>
          <Link href="/qualidade/quebras"           className="btn bg sm" style={{ textDecoration: "none" }}>Quebras</Link>
          <Link href="/qualidade/retrabalhos"       className="btn bg sm" style={{ textDecoration: "none" }}>Retrabalhos</Link>
        </div>
      </div>

      {loading ? <div className="loading con">Carregando...</div> : (
        <div className="con" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── KPIs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>

            <div className="kpi">
              <div className="kpi-l">NCs em Aberto</div>
              <div className="kpi-v" style={{ color: resumo.ncsAbertas > 0 ? "var(--warn)" : "var(--ok)" }}>
                {resumo.ncsAbertas}
              </div>
              <div className={`kpi-s ${resumo.ncsAbertas > 0 ? "wa" : ""}`}>
                {resumo.ncsAbertas > 0 ? "requerem atenção" : "todos resolvidos"}
              </div>
              <div className="kpi-bar" style={{ background: resumo.ncsAbertas > 0 ? "var(--warn)" : "var(--ok)", width: resumo.ncsAbertas > 0 ? "60%" : "5%" }} />
            </div>

            <div className="kpi">
              <div className="kpi-l">NCs Críticas</div>
              <div className="kpi-v" style={{ color: resumo.ncsCriticas > 0 ? "var(--err)" : "var(--ok)" }}>
                {resumo.ncsCriticas}
              </div>
              <div className={`kpi-s ${resumo.ncsCriticas > 0 ? "dn" : ""}`}>
                {resumo.ncsCriticas > 0 ? "ação imediata" : "nenhuma crítica"}
              </div>
              <div className="kpi-bar" style={{ background: resumo.ncsCriticas > 0 ? "var(--err)" : "var(--ok)", width: resumo.ncsCriticas > 0 ? "80%" : "5%" }} />
            </div>

            <div className="kpi">
              <div className="kpi-l">m² Perdido / Mes</div>
              <div className="kpi-v" style={{ color: resumo.m2PerdidoMes > 0 ? "var(--warn)" : "var(--ok)" }}>
                {resumo.m2PerdidoMes.toFixed(2)} m²
              </div>
              <div className="kpi-s">quebras de vidro</div>
              <div className="kpi-bar" style={{ background: "var(--warn)", width: resumo.m2PerdidoMes > 0 ? "50%" : "0%" }} />
            </div>

            <div className="kpi">
              <div className="kpi-l">Custo de Perdas / Mes</div>
              <div className="kpi-v" style={{ color: resumo.valorPerdidoMes > 0 ? "var(--err)" : "var(--ok)" }}>
                {formatBRL(resumo.valorPerdidoMes)}
              </div>
              <div className="kpi-s">valor financeiro</div>
              <div className="kpi-bar" style={{ background: "var(--err)", width: resumo.valorPerdidoMes > 0 ? "55%" : "0%" }} />
            </div>

            <div className="kpi">
              <div className="kpi-l">Retrabalhos Ativos</div>
              <div className="kpi-v" style={{ color: resumo.retrabalhosAbertos > 0 ? "#f97316" : "var(--ok)" }}>
                {resumo.retrabalhosAbertos}
              </div>
              <div className={`kpi-s ${resumo.retrabalhosAbertos > 0 ? "wa" : ""}`}>
                {resumo.retrabalhosAbertos > 0 ? "pendente + em execucao" : "nenhum pendente"}
              </div>
              <div className="kpi-bar" style={{ background: "#f97316", width: resumo.retrabalhosAbertos > 0 ? "45%" : "0%" }} />
            </div>

          </div>

          {/* ── BANNER CRITICO ── */}
          {resumo.ncsCriticas > 0 && (
            <div className="item-card err" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--err)", flexShrink: 0, boxShadow: "0 0 8px var(--err)" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--err)" }}>
                    {resumo.ncsCriticas} não conformidade{resumo.ncsCriticas > 1 ? "s" : ""} crítica{resumo.ncsCriticas > 1 ? "s" : ""} em aberto
                  </div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>
                    requerem ação imediata para não comprometer a entrega
                  </div>
                </div>
              </div>
              <Link
                href="/qualidade/nao-conformidades"
                style={{ fontSize: 11, padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(244,63,94,.5)", color: "var(--err)", textDecoration: "none", fontWeight: 700, flexShrink: 0 }}
              >
                Ver criticas
              </Link>
            </div>
          )}

          {/* ── BANNER NC/RETRABALHO ANTIGO ── */}
          {(resumo.ncsAntigas > 0 || resumo.retrabalhosAntigos > 0) && (
            <div className="item-card warn" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--warn)" }}>
                    {resumo.ncsAntigas > 0 && `${resumo.ncsAntigas} NC${resumo.ncsAntigas > 1 ? "s" : ""} aberta${resumo.ncsAntigas > 1 ? "s" : ""} há mais de 15 dias`}
                    {resumo.ncsAntigas > 0 && resumo.retrabalhosAntigos > 0 && " · "}
                    {resumo.retrabalhosAntigos > 0 && `${resumo.retrabalhosAntigos} retrabalho${resumo.retrabalhosAntigos > 1 ? "s" : ""} parado${resumo.retrabalhosAntigos > 1 ? "s" : ""} há mais de 15 dias`}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>
                    parado há muito tempo — vale revisar
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── NCs ABERTAS (principal) + GRAFICO ── */}
          <div className="g32">

            {/* Lista de NCs abertas */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="sec-hd">
                <span className="sec-hd-title">NCs em Aberto</span>
                <Link href="/qualidade/nao-conformidades" style={{ fontSize: 10, color: "var(--acc)", textDecoration: "none" }}>
                  ver todas
                </Link>
              </div>
              {ncsAbertas.length === 0 ? (
                <div style={{ padding: "32px 22px", textAlign: "center", color: "var(--ok)", fontSize: 12 }}>
                  Nenhuma NC em aberto.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {ncsAbertas.map((nc, i) => (
                    <div
                      key={nc.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "11px 22px",
                        borderBottom: i < ncsAbertas.length - 1 ? "1px solid var(--b1)" : "none",
                        borderLeft: `3px solid ${GRAVIDADE_COR[nc.gravidade as GravidadeNC] ?? "var(--b2)"}`,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>
                            {nc.codigo}
                          </span>
                          {nc.pedido_id && (
                            <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                              pedido {nc.pedido_id}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--t2)" }}>{nc.tipo}</div>
                        {nc.descricao && (
                          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {nc.descricao}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <span className={`chip ${GRAVIDADE_CHIP[nc.gravidade as GravidadeNC] ?? "cgr"}`} style={{ fontSize: 9, padding: "1px 7px" }}>
                          {nc.gravidade}
                        </span>
                        <span className={`chip ${STATUS_CHIP[nc.status as StatusNaoConformidade] ?? "cgr"}`} style={{ fontSize: 9, padding: "1px 7px" }}>
                          {nc.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Charts stacked */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* NCs por mes */}
              <div className="card" style={{ flex: 1 }}>
                <div className="ct">
                  NCs por Mes
                  {tendencia !== null && (
                    <span style={{
                      fontSize: 10, fontFamily: "'DM Mono', monospace",
                      color: tendencia > 0 ? "var(--err)" : "var(--ok)",
                    }}>
                      {tendencia > 0 ? "+" : ""}{tendencia.toFixed(0)}% vs mes ant.
                    </span>
                  )}
                </div>
                <div style={{ height: 100, display: "flex", alignItems: "flex-end", gap: 5 }}>
                  {mensaisVis.map((m, i) => {
                    const h  = Math.max((m.total_ncs / maxNCs) * 85, m.total_ncs > 0 ? 4 : 2);
                    const hc = Math.max((m.criticas  / maxNCs) * 85, m.criticas > 0 ? 2 : 0);
                    const label = new Date(m.mes + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" });
                    const isLast = i === mensaisVis.length - 1;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: 1, height: `${h}px` }}>
                          <div style={{ flex: 1, height: `${h}px`, borderRadius: "2px 2px 0 0", background: isLast ? "rgba(61,255,160,.55)" : "rgba(61,255,160,.3)" }} />
                          {hc > 0 && <div style={{ flex: 1, height: `${hc}px`, borderRadius: "2px 2px 0 0", background: "rgba(244,63,94,.55)" }} />}
                        </div>
                        <div style={{ fontSize: 8, color: isLast ? "var(--acc)" : "var(--t3)", fontFamily: "'DM Mono', monospace", fontWeight: isLast ? 700 : 400 }}>
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custo de perdas por mes */}
              <div className="card" style={{ flex: 1 }}>
                <div className="ct">Custo de Perdas / Mes</div>
                <div style={{ height: 100, display: "flex", alignItems: "flex-end", gap: 5 }}>
                  {mensaisVis.map((m, i) => {
                    const val  = Number(m.valor_perda_total ?? 0);
                    const h    = Math.max((val / maxPerda) * 85, val > 0 ? 4 : 2);
                    const label = new Date(m.mes + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" });
                    const isLast = i === mensaisVis.length - 1;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }} title={formatBRL(val)}>
                        <div style={{ width: "100%", height: `${h}px`, borderRadius: "2px 2px 0 0", background: isLast ? "rgba(244,63,94,.6)" : "rgba(244,63,94,.3)" }} />
                        <div style={{ fontSize: 8, color: isLast ? "rgba(244,63,94,.8)" : "var(--t3)", fontFamily: "'DM Mono', monospace", fontWeight: isLast ? 700 : 400 }}>
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* ── CAUSAS + RETRABALHOS ── */}
          <div className="g32">

            {/* Principais causas — barras horizontais */}
            <div className="card">
              <div className="ct">Principais Causas de NC</div>
              {porTipo.length === 0 ? (
                <div style={{ padding: "20px 0", color: "var(--t3)", fontSize: 12, textAlign: "center" }}>Sem dados.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {porTipo.map(([tipo, count], i) => {
                    const max = porTipo[0][1];
                    const pct = (count / max) * 100;
                    return (
                      <div key={tipo}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: "var(--t1)" }}>{tipo}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>
                            {count}
                          </span>
                        </div>
                        <div style={{ height: 5, borderRadius: 99, background: "var(--surf3)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${pct}%`,
                            borderRadius: 99,
                            background: i === 0
                              ? "var(--err)"
                              : i === 1
                                ? "#f97316"
                                : "rgba(61,255,160,.45)",
                            transition: "width 0.4s",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Retrabalhos pendentes */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="sec-hd">
                <span className="sec-hd-title">Retrabalhos Pendentes</span>
                <Link href="/qualidade/retrabalhos" style={{ fontSize: 10, color: "var(--acc)", textDecoration: "none" }}>
                  ver todos
                </Link>
              </div>
              {retrabalhosAbertos.length === 0 ? (
                <div style={{ padding: "24px 22px", textAlign: "center", color: "var(--ok)", fontSize: 12 }}>
                  Nenhum retrabalho pendente.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {retrabalhosAbertos.map((r, i) => (
                    <div
                      key={r.id}
                      style={{
                        padding: "10px 22px",
                        borderBottom: i < retrabalhosAbertos.length - 1 ? "1px solid var(--b1)" : "none",
                        borderLeft: "3px solid #f97316",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", marginBottom: 3 }}>{r.motivo}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "var(--t3)" }}>
                          {r.etapa_origem.replace("Em Producao ", "").replace(" – ", "")}
                          {" → "}
                          {r.etapa_correcao.replace("Em Producao ", "").replace(" – ", "")}
                        </span>
                        {r.pedido_id && (
                          <span style={{ fontSize: 10, color: "var(--acc2)", fontFamily: "'DM Mono', monospace" }}>
                            {r.pedido_id}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </AppLayout>
  );
}
