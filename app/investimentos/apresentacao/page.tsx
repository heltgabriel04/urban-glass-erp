"use client";

/**
 * Investimentos · Apresentação (Painel do Investidor)
 * ---------------------------------------------------
 * Visão SOMENTE LEITURA, número-forward, para apresentar a posição
 * financeira a um possível sócio. Não edita nada — puxa exatamente os
 * mesmos dados da aba operacional (/investimentos):
 *   • localStorage: saldos bancários, aporte Gabriel, permuta, lançamentos
 *   • Supabase:     tabela `investimentos` (aportes registrados)
 *
 * As fórmulas dos totais são idênticas às da aba operacional para que os
 * números NUNCA divirjam. Se a regra mudar lá, replicar aqui.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";

// ─── Tipos (espelham a aba operacional) ───────────────────
interface SaldoBanco    { id: string; banco: string; agencia: string; conta: string; saldo: number; }
interface AporteGabriel { id: string; data: string; descricao: string; valor: number; }
interface MovPedido     { id: string; data: string; valor: number; numeroPedido: string; tipo: "PERMUTA" | "FATURAMENTO"; empresa: string; }
interface PedidoPermuta { id: string; material: string; quantidadeTon: number; valor: number; movimentacoes: MovPedido[]; }
interface PermutaV2     { pedidos: PedidoPermuta[]; status: "ativo" | "parcial" | "liquidado"; observacoes: string; saldoManual: number; totalAcordadoManual: number; totalMovimentadoManual: number; }
interface Lancamento    { id: string; data: string; observacao: string; valor: number; }
interface Investimento  { id: string; data: string; empresa: string; categoria: string | null; subcategoria: string | null; descricao: string; valor: number; observacoes: string | null; comprovante_url: string | null; created_at: string; }

const PERMUTA_DEFAULT: PermutaV2 = { pedidos: [], status: "ativo", observacoes: "", saldoManual: 0, totalAcordadoManual: 0, totalMovimentadoManual: 0 };

const BANCOS_POSICAO_COR: Record<string, string> = {
  "Maxi Inter": "#ff7a00", "Urban Inter": "#e8650a", "ZRS Inter": "#f59e0b",
  "Elobank Caixa": "#005ca9", "Cofre (dinheiro)": "#10b981", "Nubank": "#820ad1",
  "Itaú": "#ec7000", "Bradesco": "#cc0000", "Banco do Brasil": "#f6c400",
  "Caixa": "#005ca9", "Santander": "#ec0000", "Inter": "#ff7a00",
  "Sicoob": "#006b3f", "Sicredi": "#007040", "C6 Bank": "#232323",
};

const toBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtData = (iso: string) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";
const labelMes = (yyyyMM: string) => {
  const [y, m] = yyyyMM.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

// cores por fonte
const COR = {
  aportes: "#f59e0b",
  bancos:  "#22d3ee",
  gabriel: "#3b82f6",
  permuta: "#8b5cf6",
  lanc:    "#14b8a6",
};

export default function InvestimentosApresentacao() {
  const [investimentos, setInvestimentos] = useState<Investimento[]>([]);
  const [loading, setLoading]   = useState(true);
  const [bancos, setBancos]     = useState<SaldoBanco[]>([]);
  const [aportes, setAportes]   = useState<AporteGabriel[]>([]);
  const [permuta, setPermuta]   = useState<PermutaV2>(PERMUTA_DEFAULT);
  const [lancamentos, setLanc]  = useState<Lancamento[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: posData }, { data: invData }] = await Promise.all([
        supabase.from("pos_financeira").select("chave, valor"),
        supabase.from("investimentos").select("*").order("data", { ascending: false }),
      ]);
      if (posData) {
        const map = Object.fromEntries(posData.map((r: { chave: string; valor: unknown }) => [r.chave, r.valor]));
        if (map.saldos_bancarios) setBancos(map.saldos_bancarios as SaldoBanco[]);
        if (map.aportes_gabriel) setAportes(map.aportes_gabriel as AporteGabriel[]);
        if (map.permuta) setPermuta(map.permuta as PermutaV2);
        if (map.lancamentos_pos) setLanc(map.lancamentos_pos as Lancamento[]);
      }
      setInvestimentos((invData ?? []) as Investimento[]);
      setLoading(false);
    })();
  }, []);

  // ─── Totais (fórmulas idênticas à aba operacional) ───────
  const totalGeral           = investimentos.reduce((s, i) => s + Number(i.valor), 0);
  const totalBancos          = bancos.reduce((s, b) => s + b.saldo, 0);
  const totalAporteGabriel   = aportes.reduce((s, a) => s + a.valor, 0);
  const totalPermutaItens    = permuta.pedidos.reduce((s, p) => s + p.valor, 0);
  const totalPermutaMovCalc  = permuta.pedidos.reduce((s, p) => s + p.movimentacoes.reduce((ss, m) => ss + m.valor, 0), 0);
  const totalLancamentos     = lancamentos.reduce((s, l) => s + l.valor, 0);
  const saldoPermutaEfetivo  = permuta.saldoManual + totalPermutaItens;
  const acordadoEfetivo      = permuta.totalAcordadoManual > 0 ? permuta.totalAcordadoManual : totalPermutaItens;
  const movimentadoEfetivo   = (permuta.totalMovimentadoManual ?? 0) > 0 ? permuta.totalMovimentadoManual : totalPermutaMovCalc;
  const totalPosicao         = totalGeral + totalBancos + totalAporteGabriel + saldoPermutaEfetivo + totalLancamentos;

  // ─── Resumo de aportes por banco/origem ──────────────────
  const bancosNoBD = [...new Set(investimentos.map(i => i.empresa))].sort();
  const resumoPorBanco = bancosNoBD.map(b => {
    const its = investimentos.filter(i => i.empresa === b);
    const tot = its.reduce((s, i) => s + Number(i.valor), 0);
    return { banco: b, qtd: its.length, total: tot, pct: totalGeral > 0 ? (tot / totalGeral * 100) : 0 };
  }).sort((a, b) => b.total - a.total);

  // ─── Composição da posição total ─────────────────────────
  const composicao = [
    { label: "Aportes Registrados",        valor: totalGeral,          cor: COR.aportes },
    { label: "Saldo em Bancos",            valor: totalBancos,         cor: COR.bancos  },
    { label: "Aporte Gabriel (Exterior)",  valor: totalAporteGabriel,  cor: COR.gabriel },
    { label: "Permuta Mendes & Mendes",    valor: saldoPermutaEfetivo, cor: COR.permuta },
    { label: "Lançamentos / Compras",      valor: totalLancamentos,    cor: COR.lanc    },
  ].filter(c => c.valor !== 0);

  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <AppLayout>
      <style>{`
        @media print {
          .no-print, .sb { display: none !important; }
          body { background: white !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .apres-card { break-inside: avoid; }
        }
      `}</style>

      {/* Top bar */}
      <div className="tb no-print">
        <div className="tb-title">Investimentos · Apresentação</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href="/investimentos" className="btn bg sm" style={{ textDecoration: "none" }}>← Modo edição</Link>
          <button className="btn bg sm" onClick={() => window.print()}>⬡ Imprimir / PDF</button>
        </div>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando posição financeira...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1100px", margin: "0 auto" }}>

            {/* ── HERO ── */}
            <div className="apres-card" style={{ background: "linear-gradient(135deg, var(--surf1), var(--surf2))", border: "1px solid var(--b1)", borderRadius: "16px", padding: "28px 32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
              <div>
                <div style={{ fontSize: "28px", fontWeight: 900, color: "#3b82f6", letterSpacing: "-1px", fontFamily: "'Syne', sans-serif" }}>urbanglass</div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--t2)", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: "4px" }}>Urban Glass Comércio Ltda</div>
                <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "3px" }}>CNPJ 65.668.970/0001-05</div>
                <div style={{ fontSize: "11px", color: "var(--t3)" }}>Av. Vereador Raymundo Hargreaves, 1250 — Fontesville — Juiz de Fora/MG</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "6px" }}>Posição Financeira Total</div>
                <div style={{ fontSize: "40px", fontWeight: 900, color: "var(--t1)", fontFamily: "'DM Mono', monospace", lineHeight: 1, letterSpacing: "-1px" }}>{formatBRL(totalPosicao)}</div>
                <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "8px" }}>Posição consolidada em {hoje}</div>
              </div>
            </div>

            {/* ── PILARES (números-âncora) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              {[
                { label: "Aportes Registrados",       valor: totalGeral,         sub: `${investimentos.length} lançamento(s)`,   cor: COR.aportes },
                { label: "Saldo em Bancos",           valor: totalBancos,        sub: `${bancos.length} conta(s)`,               cor: COR.bancos  },
                { label: "Aporte Gabriel",            valor: totalAporteGabriel, sub: `${aportes.length} aporte(s) · exterior`,  cor: COR.gabriel },
                { label: "Permuta (saldo)",           valor: saldoPermutaEfetivo,sub: "Mendes & Mendes",                          cor: COR.permuta },
                { label: "Lançamentos / Compras",     valor: totalLancamentos,   sub: `${lancamentos.length} registro(s)`,       cor: COR.lanc    },
              ].map(p => (
                <div key={p.label} className="apres-card" style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: `3px solid ${p.cor}`, borderRadius: "12px", padding: "16px 18px" }}>
                  <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "8px" }}>{p.label}</div>
                  <div style={{ fontSize: "21px", fontWeight: 800, color: p.cor, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{formatBRL(p.valor)}</div>
                  <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "8px" }}>{p.sub}</div>
                </div>
              ))}
            </div>

            {/* ── COMPOSIÇÃO DA POSIÇÃO (de onde vêm os números) ── */}
            <div className="apres-card" style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "20px 22px" }}>
              <SectionTitle>Composição da Posição Total</SectionTitle>
              <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "16px" }}>Como se chega ao total — cada fonte e seu peso no patrimônio.</div>

              {/* barra empilhada */}
              <div style={{ display: "flex", height: "16px", borderRadius: "8px", overflow: "hidden", marginBottom: "16px", border: "1px solid var(--b1)" }}>
                {composicao.map(c => {
                  const w = totalPosicao > 0 ? Math.max(0, (c.valor / totalPosicao) * 100) : 0;
                  return <div key={c.label} title={`${c.label}: ${toBRL(c.valor)}`} style={{ width: `${w}%`, background: c.cor }} />;
                })}
              </div>

              {/* legenda / detalhe */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {composicao.map(c => {
                  const pct = totalPosicao > 0 ? (c.valor / totalPosicao) * 100 : 0;
                  return (
                    <div key={c.label} style={{ display: "grid", gridTemplateColumns: "14px 1fr 90px 100px", alignItems: "center", gap: "10px", padding: "8px 4px", borderBottom: "1px solid var(--b1)" }}>
                      <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: c.cor }} />
                      <div style={{ fontSize: "13px", color: "var(--t1)", fontWeight: 600 }}>{c.label}</div>
                      <div style={{ fontSize: "12px", color: "var(--t3)", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{pct.toFixed(1)}%</div>
                      <div style={{ fontSize: "13px", color: c.cor, textAlign: "right", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{toBRL(c.valor)}</div>
                    </div>
                  );
                })}
                <div style={{ display: "grid", gridTemplateColumns: "14px 1fr 90px 100px", alignItems: "center", gap: "10px", padding: "10px 4px 2px" }}>
                  <div />
                  <div style={{ fontSize: "13px", color: "var(--t1)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>Posição Total</div>
                  <div style={{ fontSize: "12px", color: "var(--t3)", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>100%</div>
                  <div style={{ fontSize: "15px", color: "var(--t1)", textAlign: "right", fontWeight: 900, fontFamily: "'DM Mono', monospace" }}>{toBRL(totalPosicao)}</div>
                </div>
              </div>
            </div>

            {/* ── APORTES REGISTRADOS POR BANCO ── */}
            {resumoPorBanco.length > 0 && (
              <div className="apres-card" style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: `3px solid ${COR.aportes}`, borderRadius: "12px", padding: "20px 22px" }}>
                <SectionRow title="Aportes Registrados por Origem" total={toBRL(totalGeral)} cor={COR.aportes} />
                <TableRO
                  cols={[
                    { h: "Banco / Origem", align: "left" },
                    { h: "Aportes", align: "center" },
                    { h: "% do Total", align: "right" },
                    { h: "Total Investido", align: "right" },
                  ]}
                  rows={resumoPorBanco.map(r => [
                    <span key="b" style={{ fontWeight: 700 }}>{r.banco}</span>,
                    <span key="q" style={{ color: "var(--t3)" }}>{r.qtd}</span>,
                    <span key="p" style={{ fontFamily: "'DM Mono', monospace", color: "var(--t3)" }}>{r.pct.toFixed(1)}%</span>,
                    <span key="t" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: COR.aportes }}>{toBRL(r.total)}</span>,
                  ])}
                />
              </div>
            )}

            {/* ── SALDOS BANCÁRIOS ── */}
            {bancos.length > 0 && (
              <div className="apres-card" style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: `3px solid ${COR.bancos}`, borderRadius: "12px", padding: "20px 22px" }}>
                <SectionRow title="Saldos Bancários" total={toBRL(totalBancos)} cor={COR.bancos} />
                <TableRO
                  cols={[{ h: "Banco / Conta", align: "left" }, { h: "Saldo", align: "right" }]}
                  rows={bancos.map(b => [
                    <div key="b" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: BANCOS_POSICAO_COR[b.banco] ?? "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{b.banco}</span>
                    </div>,
                    <span key="s" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: b.saldo < 0 ? "var(--err)" : COR.bancos }}>{toBRL(b.saldo)}</span>,
                  ])}
                />
              </div>
            )}

            {/* ── APORTE GABRIEL ── */}
            {aportes.length > 0 && (
              <div className="apres-card" style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: `3px solid ${COR.gabriel}`, borderRadius: "12px", padding: "20px 22px" }}>
                <SectionRow title="Aporte de Gabriel — Exterior" total={toBRL(totalAporteGabriel)} cor={COR.gabriel} />
                <TableRO
                  cols={[{ h: "Data", align: "left" }, { h: "Descrição", align: "left" }, { h: "Valor", align: "right" }]}
                  rows={aportes.map(a => [
                    <span key="d" style={{ fontFamily: "'DM Mono', monospace", color: "var(--t3)" }}>{fmtData(a.data)}</span>,
                    <span key="ds" style={{ fontWeight: 600 }}>{a.descricao || "—"}</span>,
                    <span key="v" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: COR.gabriel }}>{toBRL(a.valor)}</span>,
                  ])}
                />
              </div>
            )}

            {/* ── PERMUTA ── */}
            {(permuta.pedidos.length > 0 || saldoPermutaEfetivo !== 0 || acordadoEfetivo !== 0) && (
              <div className="apres-card" style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: `3px solid ${COR.permuta}`, borderRadius: "12px", padding: "20px 22px" }}>
                <SectionRow title="Permuta — Mendes & Mendes" total={toBRL(saldoPermutaEfetivo)} cor={COR.permuta} totalLabel="Saldo restante" />

                {/* trio de métricas */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", margin: "4px 0 16px" }}>
                  {[
                    { l: "Total Acordado", v: acordadoEfetivo, c: COR.permuta },
                    { l: "Total Movimentado", v: movimentadoEfetivo, c: "var(--t2)" },
                    { l: "Saldo Restante", v: saldoPermutaEfetivo, c: saldoPermutaEfetivo > 0 ? "var(--warn)" : "var(--ok)" },
                  ].map(m => (
                    <div key={m.l} style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "12px 14px" }}>
                      <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "5px" }}>{m.l}</div>
                      <div style={{ fontSize: "16px", fontWeight: 800, color: m.c, fontFamily: "'DM Mono', monospace" }}>{toBRL(m.v)}</div>
                    </div>
                  ))}
                </div>

                {/* progresso movimentado/acordado */}
                {acordadoEfetivo > 0 && (
                  <div style={{ marginBottom: permuta.pedidos.length > 0 ? "16px" : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--t3)", marginBottom: "5px" }}>
                      <span>Progresso da liquidação</span>
                      <span style={{ fontFamily: "'DM Mono', monospace" }}>{Math.min(100, (Math.abs(movimentadoEfetivo) / acordadoEfetivo) * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ height: "10px", background: "var(--surf2)", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--b1)" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, (Math.abs(movimentadoEfetivo) / acordadoEfetivo) * 100)}%`, background: COR.permuta }} />
                    </div>
                  </div>
                )}

                {permuta.pedidos.length > 0 && (
                  <TableRO
                    cols={[
                      { h: "#", align: "left" }, { h: "Material", align: "left" }, { h: "Qtd (t)", align: "right" },
                      { h: "Valor", align: "right" }, { h: "Movimentado", align: "right" }, { h: "Saldo", align: "right" },
                    ]}
                    rows={permuta.pedidos.map((p, i) => {
                      const mov = p.movimentacoes.reduce((s, m) => s + m.valor, 0);
                      return [
                        <span key="i" style={{ color: "var(--t3)" }}>{i + 1}</span>,
                        <span key="m" style={{ fontWeight: 600 }}>{p.material || "—"}</span>,
                        <span key="q" style={{ fontFamily: "'DM Mono', monospace", color: "var(--t3)" }}>{p.quantidadeTon || "—"}</span>,
                        <span key="v" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: COR.permuta }}>{toBRL(p.valor)}</span>,
                        <span key="mv" style={{ fontFamily: "'DM Mono', monospace", color: "var(--t2)" }}>{toBRL(mov)}</span>,
                        <span key="s" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: (p.valor + mov) > 0 ? "var(--warn)" : "var(--ok)" }}>{toBRL(p.valor + mov)}</span>,
                      ];
                    })}
                  />
                )}
              </div>
            )}

            {/* ── LANÇAMENTOS ── */}
            {lancamentos.length > 0 && (
              <div className="apres-card" style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: `3px solid ${COR.lanc}`, borderRadius: "12px", padding: "20px 22px" }}>
                <SectionRow title="Lançamentos / Compras" total={toBRL(totalLancamentos)} cor={COR.lanc} />
                <TableRO
                  cols={[{ h: "Data da Compra", align: "left" }, { h: "Observação", align: "left" }, { h: "Valor", align: "right" }]}
                  rows={lancamentos.map(l => [
                    <span key="d" style={{ fontFamily: "'DM Mono', monospace", color: "var(--t3)" }}>{fmtData(l.data)}</span>,
                    <span key="o" style={{ fontWeight: 600 }}>{l.observacao || "—"}</span>,
                    <span key="v" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: COR.lanc }}>{toBRL(l.valor)}</span>,
                  ])}
                />
              </div>
            )}

            {/* ── DETALHAMENTO DOS APORTES POR MÊS ── */}
            {investimentos.length > 0 && (() => {
              const meses = [...new Set(investimentos.map(i => i.data.substring(0, 7)))].sort((a, b) => b.localeCompare(a));
              return (
                <div className="apres-card" style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: `3px solid ${COR.aportes}`, borderRadius: "12px", padding: "20px 22px" }}>
                  <SectionRow title="Detalhamento dos Aportes" total={toBRL(totalGeral)} cor={COR.aportes} />
                  {meses.map(mes => {
                    const its = investimentos.filter(i => i.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data));
                    const tot = its.reduce((s, i) => s + Number(i.valor), 0);
                    return (
                      <div key={mes} style={{ marginTop: "14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--surf2)", borderRadius: "6px", borderLeft: `3px solid ${COR.aportes}`, marginBottom: "4px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--t1)", textTransform: "capitalize" }}>{labelMes(mes)}</span>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: COR.aportes, fontFamily: "'DM Mono', monospace" }}>{its.length} aporte(s) · {toBRL(tot)}</span>
                        </div>
                        <TableRO
                          cols={[
                            { h: "Data", align: "left" }, { h: "Descrição", align: "left" }, { h: "Banco", align: "left" },
                            { h: "Categoria", align: "left" }, { h: "Valor", align: "right" },
                          ]}
                          rows={its.map(inv => [
                            <span key="d" style={{ fontFamily: "'DM Mono', monospace", color: "var(--t3)", whiteSpace: "nowrap" }}>{fmtData(inv.data)}</span>,
                            <span key="ds" style={{ fontWeight: 600 }}>{inv.descricao}</span>,
                            <span key="e" style={{ color: "var(--t2)" }}>{inv.empresa}</span>,
                            <span key="c" style={{ color: "var(--t3)", fontSize: "11px" }}>{inv.categoria ?? "—"}{inv.subcategoria ? ` · ${inv.subcategoria}` : ""}</span>,
                            <span key="v" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: COR.aportes }}>{toBRL(Number(inv.valor))}</span>,
                          ])}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Rodapé ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", paddingTop: "8px", borderTop: "2px solid var(--b1)", fontSize: "10px", color: "var(--t3)", marginBottom: "12px" }}>
              <span>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05</span>
              <span style={{ fontStyle: "italic" }}>Documento interno · gerado em {hoje}</span>
            </div>

          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Subcomponentes de apresentação ──────────────────────
function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</div>;
}

function SectionRow({ title, total, cor, totalLabel = "Total" }: { title: string; total: string; cor: string; totalLabel?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "14px" }}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{totalLabel}</div>
        <div style={{ fontSize: "17px", fontWeight: 800, color: cor, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{total}</div>
      </div>
    </div>
  );
}

function TableRO({ cols, rows }: { cols: { h: string; align: "left" | "right" | "center" }[]; rows: ReactNode[][] }) {
  const grid = cols.map((c, i) => i === 0 ? "1fr" : c.align === "left" ? "1.2fr" : "auto").join(" ");
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: "12px", padding: "0 8px 8px", borderBottom: "1px solid var(--b1)" }}>
        {cols.map(c => (
          <div key={c.h} style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, textAlign: c.align }}>{c.h}</div>
        ))}
      </div>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: grid, gap: "12px", alignItems: "center", padding: "9px 8px", borderBottom: "1px solid var(--b1)", background: ri % 2 === 1 ? "var(--surf2)" : "transparent", fontSize: "13px" }}>
          {r.map((cell, ci) => (
            <div key={ci} style={{ textAlign: cols[ci].align, minWidth: 0 }}>{cell}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
