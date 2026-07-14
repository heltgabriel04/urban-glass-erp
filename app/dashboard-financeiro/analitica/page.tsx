"use client";

import { Suspense, useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import AppLayout from "@/components/layout/AppLayout";
import { formatBRL } from "@/lib/formatters";
import { getFaturamentoMensal } from "@/services/financeiro.service";
import { getDRE, type DRE } from "@/services/dre.service";
import { getDespesasPorMes, type MesValor } from "@/services/dashboardFinanceiro.service";
import { getMetas } from "@/services/metas.service";
import NivelTabs from "@/components/financeiro/NivelTabs";
import FiltroGlobalFinanceiro from "@/components/financeiro/FiltroGlobalFinanceiro";
import PersonalizarWidgets from "@/components/financeiro/PersonalizarWidgets";
import { useWidgetsVisiveis } from "@/components/financeiro/useWidgetsVisiveis";
import { useRealtimeDashboard } from "@/components/financeiro/useRealtimeDashboard";

const WIDGETS_ANALITICA = [
  { key: "comparativo", label: "Comparativo por Período" },
  { key: "evolucao", label: "Evolução de Receitas × Despesas" },
  { key: "sazonalidade", label: "Sazonalidade" },
];

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_LONGO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const TOOLTIP_STYLE = {
  background: "var(--surf3)", border: "1px solid var(--b2)",
  borderRadius: 8, fontSize: 12, color: "var(--t1)",
};

interface PontoEvolucao { label: string; receita: number; despesa: number; mediaMovelReceita: number | null; metaReceita: number | null; }

interface Dados {
  dreMesAtual: DRE;
  dreMesAnterior: DRE;
  dreAnoAnterior: DRE;
  labelMesAtual: string;
  labelMesAnterior: string;
  labelAnoAnterior: string;
  evolucao: PontoEvolucao[];
  sazonalidade: { anos: number[]; linhas: { mes: string; valores: (number | null)[] }[]; max: number };
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function delta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export default function AnaliticaPage() {
  return (
    <Suspense fallback={<AppLayout><div className="loading">Carregando...</div></AppLayout>}>
      <AnaliticaInner />
    </Suspense>
  );
}

function AnaliticaInner() {
  const { visivel, toggle, widgets } = useWidgetsVisiveis("analitica", WIDGETS_ANALITICA);
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const { ativo: aoVivo } = useRealtimeDashboard(() => load());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    const mesAnteriorDate = new Date(anoAtual, mesAtual - 2, 1);

    const [
      dreMesAtual, dreMesAnterior, dreAnoAnterior,
      fatAno0, fatAno1, fatAno2,
      despesasPorMes,
      metasAno0, metasAno1,
    ] = await Promise.all([
      getDRE(anoAtual, mesAtual),
      getDRE(mesAnteriorDate.getFullYear(), mesAnteriorDate.getMonth() + 1),
      getDRE(anoAtual - 1, mesAtual),
      getFaturamentoMensal(anoAtual),
      getFaturamentoMensal(anoAtual - 1),
      getFaturamentoMensal(anoAtual - 2),
      getDespesasPorMes(12),
      getMetas(anoAtual),
      getMetas(anoAtual - 1),
    ]);

    const fatMap = new Map<string, number>();
    [...fatAno0, ...fatAno1, ...fatAno2].forEach(f => fatMap.set(`${f.ano}-${f.mes}`, Number(f.faturado)));

    const metaMap = new Map<string, number>();
    [...metasAno0, ...metasAno1].filter(m => m.tipo === "Entrada").forEach(m => metaMap.set(`${m.ano}-${m.mes}`, Number(m.valor_meta)));

    const receitas: number[] = despesasPorMes.map((d: MesValor) => fatMap.get(`${d.ano}-${d.mes}`) ?? 0);
    const evolucao: PontoEvolucao[] = despesasPorMes.map((d: MesValor, i: number) => ({
      label: `${MESES_ABREV[d.mes - 1]}/${String(d.ano).slice(2)}`,
      receita: receitas[i],
      despesa: d.valor,
      mediaMovelReceita: i >= 2 ? (receitas[i] + receitas[i - 1] + receitas[i - 2]) / 3 : null,
      metaReceita: metaMap.get(`${d.ano}-${d.mes}`) ?? null,
    }));

    const anos = [anoAtual - 2, anoAtual - 1, anoAtual];
    const linhas = MESES_ABREV.map((label, i) => ({
      label, mes: i + 1,
      valores: anos.map(ano => {
        const v = fatMap.get(`${ano}-${i + 1}`);
        return v === undefined ? null : v;
      }),
    }));
    const max = Math.max(1, ...linhas.flatMap(l => l.valores.filter((v): v is number => v != null)));

    setDados({
      dreMesAtual, dreMesAnterior, dreAnoAnterior,
      labelMesAtual: `${MESES_LONGO[mesAtual - 1]}/${anoAtual}`,
      labelMesAnterior: `${MESES_LONGO[mesAnteriorDate.getMonth()]}/${mesAnteriorDate.getFullYear()}`,
      labelAnoAnterior: `${MESES_LONGO[mesAtual - 1]}/${anoAtual - 1}`,
      evolucao,
      sazonalidade: { anos, linhas: linhas.map(l => ({ mes: l.label, valores: l.valores })), max },
    });
    setLoading(false);
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Dashboard Financeiro
          {aoVivo && <span className="chip cg" title="Atualiza sozinho quando algo muda">● Ao vivo</span>}
        </div>
        <PersonalizarWidgets widgets={widgets} visivel={visivel} toggle={toggle} />
      </div>
      <NivelTabs ativo="analitica" />
      <FiltroGlobalFinanceiro mostrarPeriodo={false} mostrarConta={false} />

      <div className="con">
        {loading || !dados ? <div className="loading">Carregando...</div> : (
          <>
            {/* Comparativo por período */}
            {visivel("comparativo") && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ct">Comparativo por Período · Regime de Competência</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thComp}></th>
                      <th style={thComp}>{dados.labelMesAnterior}</th>
                      <th style={thComp}>{dados.labelMesAtual}</th>
                      <th style={thComp}>Δ vs mês anterior</th>
                      <th style={thComp}>{dados.labelAnoAnterior}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <LinhaComparativo label="Receita" atual={dados.dreMesAtual.receita} anterior={dados.dreMesAnterior.receita} anoPassado={dados.dreAnoAnterior.receita} />
                    <LinhaComparativo label="Despesas" atual={dados.dreMesAtual.despesasTotal} anterior={dados.dreMesAnterior.despesasTotal} anoPassado={dados.dreAnoAnterior.despesasTotal} inverso />
                    <LinhaComparativo label="Resultado" atual={dados.dreMesAtual.resultado} anterior={dados.dreMesAnterior.resultado} anoPassado={dados.dreAnoAnterior.resultado} />
                    <LinhaComparativo label="Margem Líquida" atual={dados.dreMesAtual.margemLiquidaPct} anterior={dados.dreMesAnterior.margemLiquidaPct} anoPassado={dados.dreAnoAnterior.margemLiquidaPct} percentual />
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* Evolução */}
            {visivel("evolucao") && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ct">Evolução de Receitas × Despesas · últimos 12 meses</div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dados.evolucao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b1)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--t3)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--b1)" }} />
                  <YAxis stroke="var(--t3)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatBRL(v)} width={90} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatBRL(v)} cursor={{ stroke: "var(--b2)" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--t2)" }} />
                  <Line type="monotone" dataKey="receita" name="Receita" stroke="var(--ok)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="despesa" name="Despesa" stroke="var(--err)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="mediaMovelReceita" name="Receita · média móvel 3m" stroke="var(--acc2)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="metaReceita" name="Meta de Receita" stroke="var(--t3)" strokeWidth={1.5} strokeDasharray="2 2" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}

            {/* Sazonalidade */}
            {visivel("sazonalidade") && (
            <div className="card">
              <div className="ct">Sazonalidade · Faturamento por Mês</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>
                Compara o mesmo mês em anos diferentes — quanto mais forte a cor, maior o faturamento.
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thComp}>Mês</th>
                      {dados.sazonalidade.anos.map(a => <th key={a} style={{ ...thComp, textAlign: "center" }}>{a}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.sazonalidade.linhas.map(l => (
                      <tr key={l.mes}>
                        <td style={{ padding: "6px 10px", fontSize: 11.5, color: "var(--t2)" }}>{l.mes}</td>
                        {l.valores.map((v, i) => {
                          const opacidade = v == null ? 0 : Math.max(0.08, v / dados.sazonalidade.max);
                          return (
                            <td key={i} style={{ padding: "6px 8px", textAlign: "center" }}>
                              <div style={{
                                borderRadius: 5, padding: "6px 4px", fontSize: 11, fontFamily: "'DM Mono',monospace",
                                background: v == null ? "transparent" : `rgba(0,200,255,${opacidade})`,
                                color: v == null ? "var(--t3)" : opacidade > 0.5 ? "#04121a" : "var(--t1)",
                                fontWeight: v == null ? 400 : 700,
                              }}>
                                {v == null ? "—" : formatBRL(v, 0)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function LinhaComparativo({ label, atual, anterior, anoPassado, percentual, inverso }: {
  label: string; atual: number; anterior: number; anoPassado: number; percentual?: boolean; inverso?: boolean;
}) {
  const d = delta(atual, anterior);
  const melhorou = d != null && (inverso ? d < 0 : d > 0);
  const fmt = (v: number) => percentual ? `${v.toFixed(1)}%` : formatBRL(v);
  return (
    <tr style={{ borderBottom: "1px solid var(--b1)" }}>
      <td style={{ padding: "9px 10px", fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>{label}</td>
      <td style={{ padding: "9px 10px", fontSize: 12.5, fontFamily: "'DM Mono',monospace", color: "var(--t3)" }}>{fmt(anterior)}</td>
      <td style={{ padding: "9px 10px", fontSize: 13, fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{fmt(atual)}</td>
      <td style={{ padding: "9px 10px", fontSize: 12, fontFamily: "'DM Mono',monospace", fontWeight: 700, color: d == null ? "var(--t3)" : melhorou ? "var(--ok)" : "var(--err)" }}>
        {d == null ? "—" : pct(d)}
      </td>
      <td style={{ padding: "9px 10px", fontSize: 12.5, fontFamily: "'DM Mono',monospace", color: "var(--t3)" }}>{fmt(anoPassado)}</td>
    </tr>
  );
}

const thComp: React.CSSProperties = {
  padding: "7px 10px", fontSize: 9, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t3)",
  borderBottom: "1px solid var(--b1)", textAlign: "left", background: "var(--surf2)",
};
