"use client";

import { Suspense, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import { getProjecaoCaixa, type ProjecaoHorizonte } from "@/services/dashboardFinanceiro.service";
import {
  getConcentracaoClientes, getConcentracaoFornecedores, getClientesInativos,
  type Concentracao, type ClienteInativo,
} from "@/services/dashboardEstrategico.service";
import NivelTabs from "@/components/financeiro/NivelTabs";
import FiltroGlobalFinanceiro from "@/components/financeiro/FiltroGlobalFinanceiro";
import PersonalizarWidgets from "@/components/financeiro/PersonalizarWidgets";
import { useWidgetsVisiveis } from "@/components/financeiro/useWidgetsVisiveis";
import { useRealtimeDashboard } from "@/components/financeiro/useRealtimeDashboard";

const WIDGETS_ESTRATEGICA = [
  { key: "previsao", label: "Previsão de Caixa Estendida" },
  { key: "concentracao", label: "Concentração de Clientes/Fornecedores" },
  { key: "riscos", label: "Radar de Riscos" },
  { key: "oportunidades", label: "Oportunidades" },
];

const HORIZONTES = [30, 60, 90, 120, 150, 180];

interface RiscoItem { texto: string; nivel: "alto" | "medio"; }

interface Dados {
  projecao: ProjecaoHorizonte[];
  concClientes: Concentracao;
  concFornecedores: Concentracao;
  inativos: ClienteInativo[];
  clientesBloqueados: number;
}

export default function EstrategicaPage() {
  return (
    <Suspense fallback={<AppLayout><div className="loading">Carregando...</div></AppLayout>}>
      <EstrategicaInner />
    </Suspense>
  );
}

function EstrategicaInner() {
  const { visivel, toggle, widgets } = useWidgetsVisiveis("estrategica", WIDGETS_ESTRATEGICA);
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const { ativo: aoVivo } = useRealtimeDashboard(() => load());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [projecao, concClientes, concFornecedores, inativos, { data: bloqueados }] = await Promise.all([
      getProjecaoCaixa(undefined, HORIZONTES),
      getConcentracaoClientes(12),
      getConcentracaoFornecedores(12),
      getClientesInativos(60, 3),
      supabase.from("clientes").select("id").eq("bloqueado_credito", true),
    ]);
    setDados({ projecao, concClientes, concFornecedores, inativos, clientesBloqueados: (bloqueados ?? []).length });
    setLoading(false);
  }

  const primeiraNegativa = dados?.projecao.find(p => p.saldo < 0) ?? null;

  const riscos: RiscoItem[] = dados ? [
    ...(dados.clientesBloqueados > 0 ? [{ texto: `${dados.clientesBloqueados} cliente(s) bloqueado(s) por crédito`, nivel: "alto" as const }] : []),
    ...(primeiraNegativa ? [{ texto: `Saldo projetado fica negativo em ${primeiraNegativa.dias} dias (${formatBRL(primeiraNegativa.saldo)})`, nivel: "alto" as const }] : []),
    ...(dados.concClientes.maiorPct >= 30 ? [{ texto: `Cliente "${dados.concClientes.maiorNome}" responde por ${dados.concClientes.maiorPct.toFixed(0)}% do faturamento (últimos 12 meses)`, nivel: "medio" as const }] : []),
    ...(dados.concFornecedores.maiorPct >= 30 ? [{ texto: `Fornecedor "${dados.concFornecedores.maiorNome}" responde por ${dados.concFornecedores.maiorPct.toFixed(0)}% das despesas (últimos 12 meses)`, nivel: "medio" as const }] : []),
    ...(dados.inativos.length >= 5 ? [{ texto: `${dados.inativos.length} clientes recorrentes sem pedido há 60+ dias`, nivel: "medio" as const }] : []),
  ] : [];

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Dashboard Financeiro
          {aoVivo && <span className="chip cg" title="Atualiza sozinho quando algo muda">● Ao vivo</span>}
        </div>
        <PersonalizarWidgets widgets={widgets} visivel={visivel} toggle={toggle} />
      </div>
      <NivelTabs ativo="estrategica" />
      <FiltroGlobalFinanceiro />

      <div className="con">
        {loading || !dados ? <div className="loading">Carregando...</div> : (
          <>
            {/* Previsão estendida + necessidade de capital */}
            {visivel("previsao") && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ct">Previsão de Caixa Estendida</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>
                Saldo atual + títulos já lançados + recorrências futuras ainda não geradas — auditável, não é estimativa estatística.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${HORIZONTES.length}, 1fr)`, gap: 8, marginBottom: primeiraNegativa ? 16 : 0 }}>
                {dados.projecao.map(p => (
                  <div key={p.dias} style={{ textAlign: "center", padding: "10px 0" }}>
                    <div style={{ fontSize: 9.5, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 5 }}>
                      {p.dias}d
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: p.saldo >= 0 ? "var(--ok)" : "var(--err)" }}>
                      {formatBRL(p.saldo)}
                    </div>
                  </div>
                ))}
              </div>
              {primeiraNegativa && (
                <div className="al al-w" style={{ fontSize: 12.5 }}>
                  ⚠ Necessidade de capital: no ritmo atual, o caixa fica negativo em <strong>{primeiraNegativa.dias} dias</strong> ({formatBRL(primeiraNegativa.saldo)}).
                </div>
              )}
            </div>
            )}

            {/* Concentração */}
            {visivel("concentracao") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <PainelConcentracao titulo="Concentração de Clientes" sub="Faturamento · últimos 12 meses" dados={dados.concClientes} cor="var(--ok)" />
              <PainelConcentracao titulo="Concentração de Fornecedores" sub="Despesas · últimos 12 meses" dados={dados.concFornecedores} cor="var(--err)" />
            </div>
            )}

            {/* Radar de riscos */}
            {visivel("riscos") && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ct">Radar de Riscos</div>
              {riscos.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--ok)", padding: "10px 0" }}>Nenhum risco identificado nos critérios monitorados agora.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {riscos.map((r, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8,
                      background: r.nivel === "alto" ? "rgba(185,58,58,.08)" : "rgba(184,121,31,.08)",
                      border: `1px solid ${r.nivel === "alto" ? "rgba(185,58,58,.25)" : "rgba(184,121,31,.25)"}`,
                    }}>
                      <span className={`chip ${r.nivel === "alto" ? "cr" : "cy"}`}>{r.nivel === "alto" ? "Alto" : "Médio"}</span>
                      <span style={{ fontSize: 12.5, color: "var(--t1)" }}>{r.texto}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Oportunidades */}
            {visivel("oportunidades") && (
            <div className="card">
              <div className="ct">Oportunidades · Clientes Recorrentes Sem Pedido Recente</div>
              {dados.inativos.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--t3)", padding: "10px 0" }}>Nenhum cliente recorrente ficou inativo por 60+ dias.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {dados.inativos.map(c => (
                    <a key={c.id} href={`/clientes/${c.id}`} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "9px 0", borderBottom: "1px solid var(--b1)", textDecoration: "none", color: "inherit",
                    }}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.nome}</div>
                        <div style={{ fontSize: 10.5, color: "var(--t3)" }}>{c.totalPedidos} pedidos no histórico · último em {formatDate(c.ultimoPedidoEm)}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warn)" }}>{c.diasSemPedido} dias sem pedido</span>
                    </a>
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

function PainelConcentracao({ titulo, sub, dados, cor }: { titulo: string; sub: string; dados: Concentracao; cor: string }) {
  return (
    <div className="card">
      <div className="ct"><span>{titulo}</span></div>
      <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: -8, marginBottom: 14 }}>{sub}</div>
      {dados.itens.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--t3)" }}>Sem dados suficientes no período.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: dados.maiorPct >= 30 ? "var(--err)" : cor }}>
                {dados.maiorPct.toFixed(0)}%
              </div>
              <div style={{ fontSize: 10, color: "var(--t3)" }}>maior isolado</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: dados.top5Pct >= 60 ? "var(--warn)" : "var(--t2)" }}>
                {dados.top5Pct.toFixed(0)}%
              </div>
              <div style={{ fontSize: 10, color: "var(--t3)" }}>top 5</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dados.itens.map(it => (
              <div key={it.nome}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                  <span style={{ color: "var(--t2)" }}>{it.nome}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--t3)" }}>{formatBRL(it.valor)} · {it.percentual.toFixed(0)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: "var(--surf2)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, it.percentual)}%`, background: it.nome === "Outros" ? "var(--t3)" : cor, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
