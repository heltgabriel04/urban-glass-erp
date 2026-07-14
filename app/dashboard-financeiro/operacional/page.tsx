"use client";

import { Suspense, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import {
  getResumoAberto, getSaldosPorConta, type ResumoAberto, type SaldoConta,
} from "@/services/dashboardFinanceiro.service";
import { getResumoPendentes, type ResumoConciliacaoPendente } from "@/services/conciliacao.service";
import NivelTabs from "@/components/financeiro/NivelTabs";
import FiltroGlobalFinanceiro from "@/components/financeiro/FiltroGlobalFinanceiro";
import PersonalizarWidgets from "@/components/financeiro/PersonalizarWidgets";
import { useWidgetsVisiveis } from "@/components/financeiro/useWidgetsVisiveis";
import { useRealtimeDashboard } from "@/components/financeiro/useRealtimeDashboard";
import { useFiltroFinanceiro } from "@/components/financeiro/useFiltroFinanceiro";

const WIDGETS_OPERACIONAL = [
  { key: "contasPagarReceber", label: "Contas a Pagar / Receber" },
  { key: "saldosConciliacaoFluxo", label: "Saldos por Conta, Conciliação e Fluxo" },
  { key: "movimentacoes", label: "Movimentações Recentes" },
];

interface MovimentoRecente {
  id: number;
  valor: number;
  data: string;
  tipo: "Entrada" | "Saída";
  descricao: string;
  pessoa: string | null;
  pedidoId: string | null;
}

interface Dados {
  aPagar: ResumoAberto;
  aReceber: ResumoAberto;
  saldosConta: SaldoConta[];
  conciliacao: ResumoConciliacaoPendente;
  recentes: MovimentoRecente[];
}

const VAZIO: ResumoAberto = { total: 0, vencido: 0, aVencer7: 0, aVencer30: 0 };

export default function OperacionalPage() {
  return (
    <Suspense fallback={<AppLayout><div className="loading">Carregando...</div></AppLayout>}>
      <OperacionalInner />
    </Suspense>
  );
}

function OperacionalInner() {
  const { filtro } = useFiltroFinanceiro();
  const { visivel, toggle, widgets } = useWidgetsVisiveis("operacional", WIDGETS_OPERACIONAL);
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const { ativo: aoVivo } = useRealtimeDashboard(() => load());

  useEffect(() => { load(); }, [filtro.contaId]);

  async function load() {
    setLoading(true);
    const filtroDash = { contaId: filtro.contaId };
    const [aPagar, aReceber, saldosConta, conciliacao, { data: recentesRaw }] = await Promise.all([
      getResumoAberto("Saída", filtroDash),
      getResumoAberto("Entrada", filtroDash),
      getSaldosPorConta(),
      getResumoPendentes(),
      supabase
        .from("baixas_lancamento")
        .select("id, valor, data, lancamentos(tipo, descricao, pedido_id, fornecedor, documento, clientes(nome))")
        .is("estornado_em", null)
        .not("lancamento_id", "is", null)
        .order("data", { ascending: false })
        .limit(8),
    ]);

    type Row = { id: number; valor: number; data: string; lancamentos: { tipo: "Entrada" | "Saída"; descricao: string; pedido_id: string | null; fornecedor: string | null; documento: string | null; clientes: { nome: string } | null } | null };
    const recentes: MovimentoRecente[] = ((recentesRaw ?? []) as unknown as Row[])
      .filter(r => r.lancamentos)
      .map(r => ({
        id: r.id, valor: Number(r.valor), data: r.data, tipo: r.lancamentos!.tipo,
        descricao: r.lancamentos!.descricao,
        pessoa: r.lancamentos!.clientes?.nome ?? r.lancamentos!.fornecedor ?? null,
        pedidoId: r.lancamentos!.pedido_id,
      }));

    setDados({ aPagar, aReceber, saldosConta, conciliacao, recentes });
    setLoading(false);
  }

  const inadimplenciaPct = dados && dados.aReceber.total > 0
    ? (dados.aReceber.vencido / dados.aReceber.total) * 100
    : 0;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Dashboard Financeiro
          {aoVivo && <span className="chip cg" title="Atualiza sozinho quando algo muda">● Ao vivo</span>}
        </div>
        <PersonalizarWidgets widgets={widgets} visivel={visivel} toggle={toggle} />
      </div>
      <NivelTabs ativo="operacional" />
      <FiltroGlobalFinanceiro />

      <div className="con">
        {loading || !dados ? <div className="loading">Carregando...</div> : (
          <>
            {/* Contas a Pagar / Contas a Receber */}
            {visivel("contasPagarReceber") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div className="card">
                <div className="ct">
                  <span>Contas a Pagar</span>
                  <a href="/contas-pagar" className="btn bg xs" style={{ textDecoration: "none" }}>Abrir →</a>
                </div>
                <ResumoStats resumo={dados.aPagar} corPrincipal="var(--err)" />
              </div>
              <div className="card">
                <div className="ct">
                  <span>
                    Contas a Receber
                    {inadimplenciaPct > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--err)", background: "rgba(185,58,58,.12)", padding: "2px 7px", borderRadius: 99 }}>
                        {inadimplenciaPct.toFixed(0)}% inadimplência
                      </span>
                    )}
                  </span>
                  <a href="/contas-receber" className="btn bg xs" style={{ textDecoration: "none" }}>Abrir →</a>
                </div>
                <ResumoStats resumo={dados.aReceber} corPrincipal="var(--acc2)" />
              </div>
            </div>
            )}

            {/* Saldos por conta / Conciliação / Fluxo */}
            {visivel("saldosConciliacaoFluxo") && (
            <div className="g3" style={{ marginBottom: 16 }}>
              <div className="card">
                <div className="ct">
                  <span>Saldos por Conta</span>
                  <a href="/bancos-caixa" className="btn bg xs" style={{ textDecoration: "none" }}>Abrir →</a>
                </div>
                {dados.saldosConta.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--t3)", padding: "12px 0" }}>Nenhuma conta ativa cadastrada.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {dados.saldosConta.map(c => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.nome}</div>
                          <div style={{ fontSize: 10, color: "var(--t3)" }}>{c.tipo}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: c.saldo >= 0 ? "var(--ok)" : "var(--err)" }}>
                          {formatBRL(c.saldo)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="ct">
                  <span>Conciliações Pendentes</span>
                  <a href="/conciliacao" className="btn bg xs" style={{ textDecoration: "none" }}>Abrir →</a>
                </div>
                <div style={{ textAlign: "center", padding: "18px 0" }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: dados.conciliacao.quantidade > 0 ? "var(--warn)" : "var(--ok)", fontFamily: "'DM Mono',monospace" }}>
                    {dados.conciliacao.quantidade}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>
                    {dados.conciliacao.quantidade === 0 ? "Tudo conciliado" : `linha(s) · ${formatBRL(dados.conciliacao.valor)}`}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="ct"><span>Fluxo de Caixa</span></div>
                <div style={{ fontSize: 12, color: "var(--t3)", padding: "6px 0 14px" }}>
                  Extrato completo, editável, com saldo acumulado dia a dia.
                </div>
                <a href="/fluxo" className="btn bp sm" style={{ textDecoration: "none", display: "inline-block" }}>Abrir Fluxo de Caixa →</a>
              </div>
            </div>
            )}

            {/* Movimentações recentes */}
            {visivel("movimentacoes") && (
            <div className="card">
              <div className="ct">
                <span>Movimentações Recentes</span>
                <a href="/fluxo" className="btn bg xs" style={{ textDecoration: "none" }}>Ver tudo →</a>
              </div>
              {dados.recentes.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--t3)", padding: "12px 0" }}>Nenhuma movimentação registrada ainda.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {dados.recentes.map(m => (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--b1)" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.pessoa ?? m.descricao}</span>
                        <span style={{ fontSize: 10.5, color: "var(--t3)" }}>
                          {formatDate(m.data)} · {m.descricao}{m.pedidoId ? ` · ${m.pedidoId}` : ""}
                        </span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: m.tipo === "Entrada" ? "var(--ok)" : "var(--err)" }}>
                        {m.tipo === "Saída" && "−"}{formatBRL(m.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function ResumoStats({ resumo, corPrincipal }: { resumo: ResumoAberto; corPrincipal: string }) {
  const itens = [
    { label: "Total em Aberto", valor: resumo.total, cor: corPrincipal },
    { label: "Vencido", valor: resumo.vencido, cor: "var(--err)" },
    { label: "A Vencer · 7 dias", valor: resumo.aVencer7, cor: "var(--warn)" },
    { label: "A Vencer · 30 dias", valor: resumo.aVencer30, cor: "var(--t2)" },
  ];
  return (
    <div className="g4">
      {itens.map(it => (
        <div key={it.label} style={{ textAlign: "center", padding: "14px 0" }}>
          <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 6 }}>
            {it.label}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: it.valor > 0 ? it.cor : "var(--t1)" }}>
            {formatBRL(it.valor)}
          </div>
        </div>
      ))}
    </div>
  );
}
