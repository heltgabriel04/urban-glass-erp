"use client";

import { Suspense, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer,
} from "recharts";
import AppLayout from "@/components/layout/AppLayout";
import { formatBRL } from "@/lib/formatters";
import { getFaturamentoMensal } from "@/services/financeiro.service";
import { getDRE, type DRE } from "@/services/dre.service";
import {
  getSaldoCaixaTotal, getAbertoPorTipo, getDespesasPorMes, getProjecaoCaixa,
  type MesValor, type ProjecaoHorizonte,
} from "@/services/dashboardFinanceiro.service";
import { getMeta } from "@/services/metas.service";
import NivelTabs from "@/components/financeiro/NivelTabs";
import FiltroGlobalFinanceiro from "@/components/financeiro/FiltroGlobalFinanceiro";
import { useFiltroFinanceiro } from "@/components/financeiro/useFiltroFinanceiro";
import { PERIODO_LABEL, periodoParaAnoMes } from "@/lib/filtroFinanceiro";
import type { MetaFinanceira } from "@/types";

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const CORES_CATEGORIA = ["var(--acc)", "var(--acc2)", "var(--acc3)", "var(--acc4)"];

const TOOLTIP_STYLE = {
  background: "var(--surf3)", border: "1px solid var(--b2)",
  borderRadius: 8, fontSize: 12, color: "var(--t1)",
};

interface Dados {
  saldoCaixa: number;
  aReceber: number;
  aPagar: number;
  dre: DRE;
  receitaDespesa: { label: string; receita: number; despesa: number }[];
  despesasCategoria: { categoria: string; valor: number; cor: string }[];
  projecao: ProjecaoHorizonte[];
  metaEntrada: MetaFinanceira | null;
  metaSaida: MetaFinanceira | null;
}

export default function DashboardFinanceiroPage() {
  return (
    <Suspense fallback={<AppLayout><div className="loading">Carregando...</div></AppLayout>}>
      <DashboardFinanceiroInner />
    </Suspense>
  );
}

function DashboardFinanceiroInner() {
  const { filtro } = useFiltroFinanceiro();
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [filtro.periodo, filtro.contaId]);

  async function load() {
    setLoading(true);
    const { ano, mes } = periodoParaAnoMes(filtro.periodo);
    const anoAtual = new Date().getFullYear();
    const filtroDash = { contaId: filtro.contaId };

    // O gráfico "últimos 6 meses" é sempre uma janela móvel a partir de
    // hoje — não muda com o período selecionado no filtro global, então
    // busca faturamento sempre do ano atual/anterior, não do `ano` do filtro.
    const [fatAtual, fatAnterior, saldoCaixa, aReceber, aPagar, dre, despesasPorMes, projecao, metaEntrada, metaSaida] = await Promise.all([
      getFaturamentoMensal(anoAtual),
      getFaturamentoMensal(anoAtual - 1),
      getSaldoCaixaTotal(filtro.contaId),
      getAbertoPorTipo("Entrada", filtroDash),
      getAbertoPorTipo("Saída", filtroDash),
      getDRE(ano, mes),
      getDespesasPorMes(6),
      getProjecaoCaixa(filtroDash),
      mes != null ? getMeta(ano, mes, "Entrada") : Promise.resolve(null),
      mes != null ? getMeta(ano, mes, "Saída") : Promise.resolve(null),
    ]);

    const fatMap = new Map<string, number>();
    [...fatAtual, ...fatAnterior].forEach(f => fatMap.set(`${f.ano}-${f.mes}`, Number(f.faturado)));

    const receitaDespesa = despesasPorMes.map((d: MesValor) => ({
      label: `${MESES_ABREV[d.mes - 1]}/${String(d.ano).slice(2)}`,
      receita: fatMap.get(`${d.ano}-${d.mes}`) ?? 0,
      despesa: d.valor,
    }));

    const top4 = dre.despesas.slice(0, 4);
    const outros = dre.despesas.slice(4).reduce((a, d) => a + d.valor, 0);
    const despesasCategoria = [
      ...top4.map((d, i) => ({ categoria: d.categoria, valor: d.valor, cor: CORES_CATEGORIA[i] })),
      ...(outros > 0 ? [{ categoria: "Outros", valor: outros, cor: "var(--t3)" }] : []),
    ];

    setDados({ saldoCaixa, aReceber, aPagar, dre, receitaDespesa, despesasCategoria, projecao, metaEntrada, metaSaida });
    setLoading(false);
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Dashboard Financeiro</div>
      </div>
      <NivelTabs ativo="executiva" />
      <FiltroGlobalFinanceiro />

      <div className="con">
        {loading || !dados ? <div className="loading">Carregando...</div> : (
          <>
            {/* KPIs */}
            <div className="g4" style={{ marginBottom: 16 }}>
              <div className="kpi">
                <div className="kpi-l">Saldo em Caixa</div>
                <div className="kpi-v" style={{ color: dados.saldoCaixa >= 0 ? "var(--ok)" : "var(--err)" }}>
                  {formatBRL(dados.saldoCaixa)}
                </div>
                <div className="kpi-s">{filtro.contaId ? "Conta selecionada" : "Contas bancárias ativas"}</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">A Receber</div>
                <div className="kpi-v" style={{ color: "var(--acc2)" }}>{formatBRL(dados.aReceber)}</div>
                <div className="kpi-s">Títulos em aberto</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">A Pagar</div>
                <div className="kpi-v" style={{ color: "var(--acc3)" }}>{formatBRL(dados.aPagar)}</div>
                <div className="kpi-s">Títulos em aberto</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">Resultado do Período</div>
                <div className="kpi-v" style={{ color: dados.dre.resultado >= 0 ? "var(--ok)" : "var(--err)" }}>
                  {formatBRL(dados.dre.resultado)}
                </div>
                <div className="kpi-s">DRE · {PERIODO_LABEL[filtro.periodo].toLowerCase()}</div>
              </div>
            </div>

            {/* Meta do mês */}
            {(dados.metaEntrada || dados.metaSaida) && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="ct">
                  <span>Meta do Mês</span>
                  <a href="/metas" className="btn bg xs" style={{ textDecoration: "none" }}>Editar metas →</a>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: dados.metaEntrada && dados.metaSaida ? "1fr 1fr" : "1fr", gap: 20 }}>
                  {dados.metaEntrada && (
                    <BarraMeta label="Receita" realizado={dados.dre.receita} meta={Number(dados.metaEntrada.valor_meta)} cor="var(--ok)" />
                  )}
                  {dados.metaSaida && (
                    <BarraMeta label="Despesa" realizado={dados.dre.despesasTotal} meta={Number(dados.metaSaida.valor_meta)} cor="var(--err)" />
                  )}
                </div>
              </div>
            )}

            {/* Gráficos */}
            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 14, marginBottom: 16 }}>
              <div className="card">
                <div className="ct">Receita × Despesa · últimos 6 meses</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dados.receitaDespesa} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--b1)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--t3)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--b1)" }} />
                    <YAxis stroke="var(--t3)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatBRL(v)} width={90} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatBRL(v)} cursor={{ fill: "var(--surf3)", opacity: 0.5 }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "var(--t2)" }} />
                    <Bar dataKey="receita" name="Receita" fill="var(--ok)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesa" name="Despesa" fill="var(--err)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <div className="ct">Despesas por Categoria · {PERIODO_LABEL[filtro.periodo].toLowerCase()}</div>
                {dados.despesasCategoria.length === 0 ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>
                    Nenhuma despesa no período.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dados.despesasCategoria} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--b1)" horizontal={false} />
                      <XAxis type="number" stroke="var(--t3)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--b1)" }} tickFormatter={(v: number) => formatBRL(v)} />
                      <YAxis type="category" dataKey="categoria" stroke="var(--t3)" fontSize={11} tickLine={false} axisLine={false} width={110} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatBRL(v)} cursor={{ fill: "var(--surf3)", opacity: 0.5 }} />
                      <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                        {dados.despesasCategoria.map((d, i) => <Cell key={i} fill={d.cor} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Projeção de caixa */}
            <div className="card">
              <div className="ct">Projeção de Caixa</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>
                Saldo atual + títulos já lançados com vencimento dentro do prazo — não é estimativa estatística, é auditável em Contas a Pagar/Receber.
              </div>
              <div className="g3">
                {dados.projecao.map((p: ProjecaoHorizonte) => (
                  <div key={p.dias} style={{ textAlign: "center", padding: "14px 0" }}>
                    <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 6 }}>
                      Em {p.dias} dias
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: p.saldo >= 0 ? "var(--ok)" : "var(--err)" }}>
                      {formatBRL(p.saldo)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function BarraMeta({ label, realizado, meta, cor }: { label: string; realizado: number; meta: number; cor: string }) {
  const pct = meta > 0 ? Math.min(100, (realizado / meta) * 100) : 0;
  const estourou = realizado > meta;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t2)" }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: "'DM Mono',monospace" }}>
          <strong style={{ color: estourou ? "var(--err)" : cor }}>{formatBRL(realizado)}</strong>
          <span style={{ color: "var(--t3)" }}> / {formatBRL(meta)}</span>
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: "var(--surf2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: estourou ? "var(--err)" : cor, transition: "width .3s" }} />
      </div>
      <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 4 }}>
        {((realizado / meta) * 100 || 0).toFixed(0)}% da meta{estourou ? " — ultrapassou" : ""}
      </div>
    </div>
  );
}
