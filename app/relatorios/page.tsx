"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFinanceiroClientes, getFaturamentoMensal, getLancamentos } from "@/services/financeiro.service";
import { getPedidos } from "@/services/pedidos.service";
import { getEstoque } from "@/services/estoque.service";
import { getOrcamentos } from "@/services/orcamentos.service";
import { getAllHistoricoOtimizador } from "@/services/otimizador.service";
import { formatBRL, formatPercent } from "@/lib/formatters";
import { supabase } from "@/lib/supabase/client";
import type { FinanceiroCliente, FaturamentoMensal, Pedido, Lancamento } from "@/types";

const MESES_ABREV    = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_COMPLETOS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TABS = ["Faturamento","Clientes","Pedidos","Eficiência","Fluxo de Caixa","Estoque","Orçamentos","Fechamento"];

const STATUS_COR: Record<string, string> = {
  "Aguardando otimização":   "var(--warn)",
  "Em Produção – Corte":     "var(--acc4)",
  "Em Produção – Lapidação": "var(--acc3)",
  "Separação":               "var(--acc2)",
  "Finalizado":              "var(--ok)",
  "Entregue":                "var(--acc)",
  "Cancelado":               "var(--err)",
};

type TipoRelatorio = "gerencial" | "inadimplencia" | "faturamento" | null;

// ── helpers de estilo PDF ────────────────────────────────────────────────────
const S = {
  page:   { padding: "22px 28px", fontFamily: "Arial, sans-serif", color: "#111", background: "white", width: "210mm", boxSizing: "border-box" as const },
  hdr:    { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "14px", borderBottom: "3px solid #2d5fa6", marginBottom: "18px" },
  logo:   { fontSize: "24px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" } as React.CSSProperties,
  sub1:   { fontSize: "9px", color: "#555", textTransform: "uppercase" as const, letterSpacing: "1.5px", marginTop: "2px" },
  sec:    { fontSize: "9px", fontWeight: 800, color: "#2d5fa6", textTransform: "uppercase" as const, letterSpacing: "1.5px", marginBottom: "8px", paddingBottom: "4px", borderBottom: "1px solid #d0daf0", marginTop: "18px" },
  th:     { padding: "7px 8px", fontWeight: 800, fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.5px", color: "white", background: "#2d5fa6" },
  td:     { padding: "6px 8px", fontSize: "10px", fontWeight: 600, color: "#222", borderBottom: "1px solid #eef0f5" },
  tdR:    { padding: "6px 8px", fontSize: "10px", fontWeight: 700, color: "#222", fontFamily: "monospace", borderBottom: "1px solid #eef0f5", textAlign: "right" as const },
  kpi:    { background: "#f0f4ff", borderRadius: "8px", padding: "12px 14px", border: "1px solid #d0daf0", flex: 1 },
  kpiL:   { fontSize: "8px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "4px" },
  kpiV:   { fontSize: "18px", fontWeight: 900, color: "#2d5fa6", fontFamily: "monospace", lineHeight: 1.1 } as React.CSSProperties,
  kpiS:   { fontSize: "9px", color: "#6b7280", marginTop: "2px" },
  footer: { borderTop: "2px solid #2d5fa6", paddingTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#888", marginTop: "20px" },
};

function PdfHeader({ titulo, subtitulo, emissao }: { titulo: string; subtitulo: string; emissao: string }) {
  return (
    <div style={S.hdr}>
      <div>
        <div style={S.logo}>urbanglass</div>
        <div style={S.sub1}>Urban Glass Comércio Ltda</div>
        <div style={{ ...S.sub1, marginTop: "1px" }}>CNPJ: 65.668.970/0001-05</div>
        <div style={{ ...S.sub1, marginTop: "1px" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – JF/MG</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "4px" }}>{subtitulo}</div>
        <div style={{ fontSize: "18px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-0.5px" }}>{titulo}</div>
        <div style={{ fontSize: "10px", color: "#555", marginTop: "6px" }}>Emissão: <strong>{emissao}</strong></div>
        <div style={{ fontSize: "9px", color: "#888", marginTop: "2px" }}>Exercício 2026 · Uso Interno</div>
      </div>
    </div>
  );
}

function PdfFooter({ emissao }: { emissao: string }) {
  return (
    <div style={S.footer}>
      <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Fontesville – Juiz de Fora/MG</div>
      <div style={{ color: "#c00", fontStyle: "italic" }}>Documento confidencial · Emitido em {emissao}</div>
    </div>
  );
}

import React from "react";

export default function RelatoriosPage() {
  const [tabIdx, setTabIdx]         = useState(0);
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [fatMensal, setFatMensal]   = useState<FaturamentoMensal[]>([]);
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading]       = useState(true);
  const [mesSel, setMesSel]         = useState<number | null>(null);
  const [reporteAtivo, setReporteAtivo] = useState<TipoRelatorio>(null);
  const [otimHistorico, setOtimHistorico] = useState<Array<{ dt_otim: string; aproveitamento: number; perda: number; chapas_usadas: number; retalhos_gerados: number; total_pecas: number }>>([]);
  const [estoque, setEstoque]             = useState<any[]>([]);
  const [orcamentos, setOrcamentos]       = useState<any[]>([]);
  const [investimentos, setInvestimentos] = useState<any[]>([]);
  const [mesFechoSel, setMesFechoSel]     = useState<string>("");

  const hoje     = new Date().toISOString().split("T")[0];
  const dtEmissao = new Date().toLocaleDateString("pt-BR");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, fat, peds, lancs, otimHist, estq, orcs, invRes] = await Promise.all([
      getFinanceiroClientes(),
      getFaturamentoMensal(2026),
      getPedidos(),
      getLancamentos(),
      getAllHistoricoOtimizador(),
      getEstoque(),
      getOrcamentos(),
      supabase.from("investimentos").select("*").order("data", { ascending: true }),
    ]);
    setFinanceiro(fin); setFatMensal(fat); setPedidos(peds);
    setLancamentos(lancs as Lancamento[]);
    setOtimHistorico(otimHist as any);
    setEstoque(estq);
    setOrcamentos(orcs as any[]);
    setInvestimentos((invRes.data ?? []) as any[]);
    setLoading(false);
    const mesAtual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    setMesSel(new Date().getMonth() + 1);
    setMesFechoSel(mesAtual);
  }

  function imprimirRelatorio(tipo: TipoRelatorio) {
    setReporteAtivo(tipo);
    setTimeout(() => window.print(), 400);
  }

  // ── Séries mensais ────────────────────────────────────────────────────────
  const meses = useMemo(() => MESES_ABREV.map((mes, i) => {
    const fat = fatMensal.find(f => f.mes === i + 1);
    return { mes, mesCompleto: MESES_COMPLETOS[i], mesNum: i + 1, faturado: fat ? Number(fat.faturado) : 0, recebido: fat ? Number(fat.recebido) : 0 };
  }), [fatMensal]);

  const maxFat = Math.max(...meses.map(m => m.faturado), 1);

  // ── Totais
  const fatTotal = financeiro.reduce((a, f) => a + Number(f.faturado), 0);
  const recTotal = financeiro.reduce((a, f) => a + Number(f.recebido), 0);
  const aReceber = fatTotal - recTotal;

  const mesDados  = mesSel ? meses.find(m => m.mesNum === mesSel) : null;
  const fatMesVal = mesDados?.faturado ?? 0;
  const fatAnt    = mesSel && mesSel > 1 ? (meses.find(m => m.mesNum === mesSel - 1)?.faturado ?? 0) : 0;
  const varMes    = fatAnt > 0 ? ((fatMesVal - fatAnt) / fatAnt) * 100 : 0;

  const pedidosFiltrados = useMemo(() => {
    if (!mesSel) return pedidos;
    return pedidos.filter(p => new Date(p.dt_pedido).getMonth() + 1 === mesSel);
  }, [pedidos, mesSel]);

  const statusCount = useMemo(() => {
    const map: Record<string, number> = {};
    pedidos.forEach(p => { map[p.status] = (map[p.status] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [pedidos]);

  const clientesOrdenados = useMemo(() => [...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)), [financeiro]);
  const maxCliFat         = clientesOrdenados[0] ? Number(clientesOrdenados[0].faturado) : 1;

  // ── Devedores e vencidos ─────────────────────────────────────────────────
  const devedores     = useMemo(() => clientesOrdenados.filter(f => Number(f.a_receber) > 0), [clientesOrdenados]);
  const totalDevedores = devedores.reduce((a, f) => a + Number(f.a_receber), 0);
  const inadimplentes  = devedores.filter(f => Number(f.recebido) === 0);

  const parcelasVencidas = useMemo(() =>
    (lancamentos as Lancamento[]).filter(l => l.status === "A Receber" && l.vencimento && l.vencimento < hoje)
      .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? "")),
    [lancamentos, hoje]
  );
  const totalVencido = parcelasVencidas.reduce((a, l) => a + Number(l.valor), 0);

  const mesLabel = mesSel ? MESES_ABREV[mesSel - 1] : "Ano todo";

  // ── Melhor mês ───────────────────────────────────────────────────────────
  const melhorMes = meses.reduce((best, m) => m.faturado > best.faturado ? m : best, meses[0]);
  const ticketMedio = pedidos.length > 0 ? fatTotal / pedidos.length : 0;
  const m2Total     = pedidos.reduce((a, p) => a + Number(p.m2_total), 0);

  // ── Eficiência do otimizador ─────────────────────────────────────────────
  const eficienciaMensal = useMemo(() => {
    const map = new Map<string, { aprovs: number[]; perdas: number[]; retalhos: number; count: number }>();
    otimHistorico.forEach(h => {
      const key = (h.dt_otim ?? '').substring(0, 7);
      if (!key) return;
      const prev = map.get(key) ?? { aprovs: [], perdas: [], retalhos: 0, count: 0 };
      prev.aprovs.push(Number(h.aproveitamento));
      prev.perdas.push(Number(h.perda));
      prev.retalhos += Number(h.retalhos_gerados);
      prev.count++;
      map.set(key, prev);
    });
    return Array.from(map.entries()).map(([key, v]) => {
      const [y, m] = key.split('-').map(Number);
      const lbl = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return {
        key,
        label: lbl.charAt(0).toUpperCase() + lbl.slice(1),
        aprovMedia: v.aprovs.reduce((a, b) => a + b, 0) / v.aprovs.length,
        perdaMedia:  v.perdas.reduce((a, b) => a + b, 0) / v.perdas.length,
        retalhos: v.retalhos,
        count: v.count,
      };
    }).sort((a, b) => a.key.localeCompare(b.key));
  }, [otimHistorico]);

  const aprovGeral  = eficienciaMensal.length ? eficienciaMensal.reduce((a, m) => a + m.aprovMedia, 0) / eficienciaMensal.length : 0;
  const perdaGeral  = eficienciaMensal.length ? eficienciaMensal.reduce((a, m) => a + m.perdaMedia, 0) / eficienciaMensal.length : 0;
  const totalOtims  = otimHistorico.length;
  const totalRetalh = otimHistorico.reduce((a, h) => a + Number(h.retalhos_gerados), 0);

  // ── Fluxo de caixa – próximas 8 semanas ─────────────────────────────────
  const fluxoSemanas = useMemo(() => {
    const base = new Date(hoje + 'T12:00:00');
    return Array.from({ length: 8 }, (_, i) => {
      const ini = new Date(base.getTime() + i * 7 * 86400000);
      const fim = new Date(base.getTime() + (i + 1) * 7 * 86400000);
      const label = ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      let entradas = 0, saidas = 0;
      (lancamentos as Lancamento[]).forEach(l => {
        if (!l.vencimento) return;
        const venc = new Date(l.vencimento + 'T12:00:00');
        if (venc < ini || venc >= fim) return;
        if (l.tipo === 'Entrada' && l.status === 'A Receber') entradas += Number(l.valor);
        if (l.tipo === 'Saída'   && (l.status === 'Pendente' || (l.status as string) === 'Vencido')) saidas += Number(l.valor);
      });
      return { ini, fim, label, entradas, saidas, saldo: entradas - saidas };
    });
  }, [lancamentos, hoje]);

  const totalEntradas60d = fluxoSemanas.reduce((a, s) => a + s.entradas, 0);
  const totalSaidas60d   = fluxoSemanas.reduce((a, s) => a + s.saidas, 0);
  const saldoLiquido60d  = totalEntradas60d - totalSaidas60d;
  const maxFluxo         = Math.max(...fluxoSemanas.map(s => Math.max(s.entradas, s.saidas)), 1);

  // ── Estoque ───────────────────────────────────────────────────────────────
  const estoqueOrdenado = useMemo(() =>
    [...estoque].sort((a: any, b: any) => {
      const pctA = Number(a.m2_entrada) > 0 ? Number(a.m2_saldo) / Number(a.m2_entrada) : 1;
      const pctB = Number(b.m2_entrada) > 0 ? Number(b.m2_saldo) / Number(b.m2_entrada) : 1;
      return pctA - pctB;
    }), [estoque]);
  const valorTotalEstoque = estoque.reduce((a: number, e: any) => a + Number(e.m2_saldo) * Number(e.custo_m2), 0);
  const m2TotalEstoque    = estoque.reduce((a: number, e: any) => a + Number(e.m2_saldo), 0);

  // ── Fechamento mensal ─────────────────────────────────────────────────────
  const invPorMes = useMemo(() => {
    const map = new Map<string, { total: number; items: any[] }>();
    investimentos.forEach(inv => {
      const mes = (inv.data ?? "").substring(0, 7);
      if (!mes) return;
      const prev = map.get(mes) ?? { total: 0, items: [] };
      prev.total += Number(inv.valor);
      prev.items.push(inv);
      map.set(mes, prev);
    });
    return map;
  }, [investimentos]);

  const mesesFecho = useMemo(() => {
    const mesesInv = [...invPorMes.keys()];
    const mesesFat = meses.filter(m => m.faturado > 0).map(m => `2026-${String(m.mesNum).padStart(2, "0")}`);
    return [...new Set([...mesesInv, ...mesesFat])].sort();
  }, [invPorMes, meses]);

  const invMesSel   = mesFechoSel ? (invPorMes.get(mesFechoSel) ?? { total: 0, items: [] }) : { total: 0, items: [] };
  const mesNumFecho = mesFechoSel ? Number(mesFechoSel.split("-")[1]) : 0;
  const fatMesFecho = mesNumFecho > 0 ? (meses.find(m => m.mesNum === mesNumFecho)?.faturado ?? 0) : 0;
  const resultadoMes = fatMesFecho - invMesSel.total;

  const mesFechoAnt = mesFechoSel ? (() => {
    const idx = mesesFecho.indexOf(mesFechoSel);
    return idx > 0 ? mesesFecho[idx - 1] : null;
  })() : null;
  const invMesAnt   = mesFechoAnt ? (invPorMes.get(mesFechoAnt) ?? { total: 0, items: [] }) : { total: 0, items: [] };
  const mesNumAnt   = mesFechoAnt ? Number(mesFechoAnt.split("-")[1]) : 0;
  const fatMesAnt2  = mesNumAnt > 0 ? (meses.find(m => m.mesNum === mesNumAnt)?.faturado ?? 0) : 0;

  const invPorCat = useMemo(() => {
    const items = invMesSel.items ?? [];
    const map = new Map<string, number>();
    items.forEach(inv => {
      const cat = inv.categoria ?? "Sem categoria";
      map.set(cat, (map.get(cat) ?? 0) + Number(inv.valor));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [invMesSel]);

  const invPorCatAno = useMemo(() => {
    const map = new Map<string, number>();
    investimentos.forEach(inv => {
      const cat = inv.categoria ?? "Sem categoria";
      map.set(cat, (map.get(cat) ?? 0) + Number(inv.valor));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [investimentos]);

  const totalInvestidoAno = investimentos.reduce((a, i) => a + Number(i.valor), 0);

  const fechamentoMeses = useMemo(() => mesesFecho.map(mes => {
    const inv  = invPorMes.get(mes) ?? { total: 0, items: [] };
    const mNum = Number(mes.split("-")[1]);
    const fat  = meses.find(m => m.mesNum === mNum)?.faturado ?? 0;
    const label = new Date(Number(mes.split("-")[0]), mNum - 1, 1)
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { mes, label: label.charAt(0).toUpperCase() + label.slice(1), fat, inv: inv.total, resultado: fat - inv.total };
  }), [mesesFecho, invPorMes, meses]);

  // ── Orçamentos ────────────────────────────────────────────────────────────
  const orcsAprovados  = orcamentos.filter((o: any) => o.status === 'Aprovado');
  const orcsRejeitados = orcamentos.filter((o: any) => o.status === 'Rejeitado');
  const orcsPendentes  = orcamentos.filter((o: any) => ['Rascunho', 'Enviado'].includes(o.status));
  const taxaConversao  = (orcsAprovados.length + orcsRejeitados.length) > 0
    ? orcsAprovados.length / (orcsAprovados.length + orcsRejeitados.length) * 100 : 0;
  const valorPendente  = orcsPendentes.reduce((a: number, o: any) => a + Number(o.valor_total), 0);
  const valorAprovado  = orcsAprovados.reduce((a: number, o: any) => a + Number(o.valor_total), 0);
  const orcsRecentes   = useMemo(() =>
    [...orcamentos].sort((a: any, b: any) => (b.dt_orcamento ?? '').localeCompare(a.dt_orcamento ?? '')).slice(0, 10),
    [orcamentos]);

  // ── Meses com dados para relatório de faturamento ────────────────────────
  const mesesComDados = meses.filter(m => m.faturado > 0);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb { display: none !important; }
          body { background: white !important; color: black !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .print-area { display: block !important; }
          .con { padding: 0 !important; }
          @page { margin: 0; size: A4; }
        }
        .print-area { display: none; }
        @media print { .print-area { display: block; } }
      `}</style>

      <AppLayout>
        {/* ══ TOPBAR ══════════════════════════════════════════════════════════ */}
        <div className="tb no-print">
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

        <div className="con no-print">

          {/* ── Emitir PDF ─────────────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: "16px" }}>
            <div className="ct">
              Emitir Relatório PDF
              <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>para imprimir ou salvar</span>
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {[
                {
                  tipo: "gerencial" as TipoRelatorio,
                  icone: "📊",
                  label: "Relatório Gerencial",
                  desc: "Sumário executivo completo: KPIs, faturamento mensal, top clientes e pipeline de produção.",
                  cor: "#2d5fa6",
                },
                {
                  tipo: "inadimplencia" as TipoRelatorio,
                  icone: "⚠",
                  label: "Inadimplência",
                  desc: "Devedores por risco, parcelas vencidas e análise de concentração de crédito.",
                  cor: "#c0392b",
                },
                {
                  tipo: "faturamento" as TipoRelatorio,
                  icone: "📈",
                  label: "Faturamento Analítico",
                  desc: "Evolução mensal, variação vs mês anterior e ranking completo por cliente.",
                  cor: "#16a085",
                },
              ].map(r => (
                <div key={r.tipo!} style={{ flex: 1, minWidth: "220px", background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "18px" }}>{r.icone}</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--t1)" }}>{r.label}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--t3)", lineHeight: 1.5 }}>{r.desc}</div>
                  <button
                    className="btn sm"
                    onClick={() => imprimirRelatorio(r.tipo)}
                    style={{ alignSelf: "flex-start", marginTop: "4px", background: r.cor + "22", border: `1px solid ${r.cor}55`, color: r.cor, fontWeight: 700 }}
                  >
                    ⎙ Gerar PDF
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── KPIs ─────────────────────────────────────────────────────── */}
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
                value:    formatBRL(ticketMedio),
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
              {/* ── TABS ────────────────────────────────────────────────────── */}
              <div style={{ display: "flex", gap: "4px", background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "4px", marginBottom: "16px" }}>
                {TABS.map((t, i) => (
                  <div key={i} onClick={() => setTabIdx(i)} style={{ flex: 1, padding: "8px 14px", borderRadius: "7px", cursor: "pointer", fontSize: "13px", textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: tabIdx === i ? 700 : 400, color: tabIdx === i ? "var(--t1)" : "var(--t3)", background: tabIdx === i ? "var(--surf)" : "transparent", boxShadow: tabIdx === i ? "0 1px 4px rgba(0,0,0,.3)" : "none", transition: "all 0.15s" }}>
                    {t}
                  </div>
                ))}
              </div>

              {/* ══ TAB 0: FATURAMENTO ══ */}
              {tabIdx === 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div className="card">
                    <div className="ct">Faturamento Mensal 2026 <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>clique no mês</span></div>
                    <div style={{ display: "flex", gap: "14px", marginBottom: "10px" }}>
                      {[{ color: "var(--acc)", label: "Faturado" }, { color: "var(--ok)", label: "Recebido" }].map(l => (
                        <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--t2)" }}>
                          <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: l.color }} />{l.label}
                        </div>
                      ))}
                    </div>
                    <div style={{ height: "140px", display: "flex", alignItems: "flex-end", gap: "5px" }}>
                      {meses.map((m, i) => {
                        const sel  = mesSel === m.mesNum;
                        const hFat = m.faturado > 0 ? Math.max((m.faturado / maxFat) * 120, 4) : 4;
                        const hRec = m.recebido > 0 ? Math.max((m.recebido / maxFat) * 120, 2) : 0;
                        return (
                          <div key={i} onClick={() => setMesSel(sel ? null : m.mesNum)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", gap: "3px" }} title={m.faturado > 0 ? `Faturado: ${formatBRL(m.faturado)} · Recebido: ${formatBRL(m.recebido)}` : "Sem dados"}>
                            {sel && m.faturado > 0 && <div style={{ fontSize: "7px", color: "var(--acc)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>{formatBRL(m.faturado).replace("R$ ", "")}</div>}
                            <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: "1px", height: `${hFat}px` }}>
                              <div style={{ flex: 1, height: `${hFat}px`, borderRadius: "2px 2px 0 0", background: sel ? "var(--acc)" : m.faturado > 0 ? "rgba(61,255,160,.35)" : "var(--surf2)", transition: "all 0.15s", boxShadow: sel ? "0 0 8px rgba(61,255,160,.4)" : "none" }} />
                              <div style={{ flex: 1, height: `${hRec}px`, borderRadius: "2px 2px 0 0", background: sel ? "var(--ok)" : m.recebido > 0 ? "rgba(16,185,129,.5)" : "transparent", transition: "all 0.15s" }} />
                            </div>
                            <div style={{ fontSize: "8px", fontFamily: "'DM Mono', monospace", color: sel ? "var(--acc)" : "var(--t3)", fontWeight: sel ? 700 : 400 }}>{m.mes}</div>
                          </div>
                        );
                      })}
                    </div>
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

                  <div className="card">
                    <div className="ct">Detalhamento Mensal <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{mesSel ? mesLabel + " selecionado" : "todos"}</span></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr 60px 80px", gap: "8px", padding: "6px 10px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono', monospace" }}>
                        <div>Mês</div><div>Faturado</div><div>Recebido</div><div>%</div><div>Status</div>
                      </div>
                      {meses.filter(m => m.faturado > 0).map((m, i) => {
                        const pct    = m.faturado > 0 ? m.recebido / m.faturado * 100 : 0;
                        const sel    = mesSel === m.mesNum;
                        const status = pct >= 100 ? "Quitado" : pct > 0 ? "Parcial" : "Pendente";
                        const sCor   = pct >= 100 ? "var(--ok)" : pct > 0 ? "var(--warn)" : "var(--err)";
                        const sBg    = pct >= 100 ? "rgba(16,185,129,.1)" : pct > 0 ? "rgba(245,158,11,.1)" : "rgba(244,63,94,.1)";
                        return (
                          <div key={i} onClick={() => setMesSel(sel ? null : m.mesNum)} style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr 60px 80px", gap: "8px", padding: "9px 10px", borderRadius: "8px", cursor: "pointer", transition: "all 0.12s", background: sel ? "rgba(61,255,160,.06)" : "var(--surf2)", border: `1px solid ${sel ? "rgba(61,255,160,.3)" : "var(--b1)"}` }}>
                            <div style={{ fontSize: "12px", fontWeight: sel ? 700 : 500, color: sel ? "var(--acc)" : "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{m.mes}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t1)" }}>{formatBRL(m.faturado)}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--ok)" }}>{formatBRL(m.recebido)}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: sCor }}>{pct.toFixed(0)}%</div>
                            <div style={{ fontSize: "10px", fontWeight: 600, padding: "2px 6px", borderRadius: "4px", background: sBg, color: sCor, textAlign: "center", fontFamily: "'DM Mono', monospace" }}>{status}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ══ TAB 1: CLIENTES ══ */}
              {tabIdx === 1 && (
                <div className="card">
                  <div className="ct">Ranking de Clientes <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{financeiro.length} clientes</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px 120px 120px 120px 70px 60px", gap: "10px", padding: "6px 12px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono', monospace", borderBottom: "1px solid var(--b1)" }}>
                      <div>#</div><div>Cliente</div><div>% Total</div><div>Faturado</div><div>Recebido</div><div>A Receber</div><div>Risco</div><div>Pedidos</div>
                    </div>
                    {clientesOrdenados.map((f, i) => {
                      const risco      = Number(f.faturado) > 0 ? Number(f.a_receber) / Number(f.faturado) : 0;
                      const pctFat     = Number(f.faturado) / maxCliFat * 100;
                      const pctRec     = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                      const riscoLabel = risco === 0 ? "Zero" : risco < 0.5 ? "Médio" : "Alto";
                      const riscoCor   = risco === 0 ? "var(--ok)" : risco < 0.5 ? "var(--warn)" : "var(--err)";
                      const riscoBg    = risco === 0 ? "rgba(16,185,129,.1)" : risco < 0.5 ? "rgba(245,158,11,.1)" : "rgba(244,63,94,.1)";
                      return (
                        <div key={f.cliente_id} style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "10px 12px", background: "var(--surf2)", borderRadius: "9px", border: "1px solid var(--b1)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px 120px 120px 120px 70px 60px", gap: "10px", alignItems: "center" }}>
                            <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{i + 1}°</div>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>{f.cliente_nome}</div>
                              {(f as any).cidade && <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>{(f as any).cidade}</div>}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{pctFat.toFixed(1)}%</div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(f.faturado)}</div>
                            <div style={{ fontSize: "12px", color: "var(--ok)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(f.recebido)}</div>
                            <div style={{ fontSize: "12px", color: Number(f.a_receber) > 0 ? "var(--warn)" : "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{Number(f.a_receber) > 0 ? formatBRL(f.a_receber) : "—"}</div>
                            <div style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "5px", background: riscoBg, color: riscoCor, textAlign: "center", fontFamily: "'DM Mono', monospace" }}>{riscoLabel}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t2)", textAlign: "center" }}>{f.total_pedidos}</div>
                          </div>
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
              {tabIdx === 2 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div className="card">
                    <div className="ct">Pedidos por Status <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{pedidos.length} total</span></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                      {statusCount.map(([status, count]) => {
                        const cor = STATUS_COR[status] ?? "var(--t3)";
                        const pct = (count / Math.max(...statusCount.map(([,c]) => c), 1)) * 100;
                        return (
                          <div key={status} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", background: "var(--surf2)", borderRadius: "9px", border: "1px solid var(--b1)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cor, flexShrink: 0 }} />
                                <span style={{ fontSize: "12px", color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{status}</span>
                              </div>
                              <span style={{ fontSize: "16px", fontWeight: 800, color: cor, fontFamily: "'DM Mono', monospace" }}>{count}</span>
                            </div>
                            <div style={{ height: "4px", borderRadius: "2px", background: "var(--surf3)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: "2px", opacity: 0.7 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div className="card">
                      <div className="ct">Indicadores de Produção</div>
                      {[
                        { label: "Total de Pedidos",        value: String(pedidos.length),                                                            color: "var(--t1)"  },
                        { label: "Finalizados / Entregues", value: String(pedidos.filter(p => ["Entregue","Finalizado"].includes(p.status)).length),  color: "var(--ok)"  },
                        { label: "Em Produção",             value: String(pedidos.filter(p => p.status.includes("Produção")).length),                 color: "var(--acc4)"},
                        { label: "Ag. Otimização",          value: String(pedidos.filter(p => p.status === "Aguardando otimização").length),           color: "var(--warn)"},
                        { label: "m² Total Processado",     value: m2Total.toFixed(2) + " m²",                                                        color: "var(--acc)" },
                        { label: "Valor Médio por Pedido",  value: formatBRL(ticketMedio),                                                             color: "var(--acc4)"},
                      ].map(row => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--surf2)", borderRadius: "7px", marginBottom: "5px" }}>
                          <span style={{ fontSize: "12px", color: "var(--t2)" }}>{row.label}</span>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: row.color, fontFamily: "'DM Mono', monospace" }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {/* ══ TAB 3: EFICIÊNCIA ══ */}
              {tabIdx === 3 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
                    {[
                      { label: "Aproveitamento Médio", value: aprovGeral.toFixed(1) + "%",  color: "var(--ok)",   sub: `${eficienciaMensal.length} mes(es) com dados` },
                      { label: "Perda Média",          value: perdaGeral.toFixed(1) + "%",   color: "var(--err)",  sub: "média de desperdício" },
                      { label: "Otimizações Salvas",   value: String(totalOtims),             color: "var(--acc2)", sub: "total de execuções" },
                      { label: "Retalhos Gerados",     value: String(totalRetalh),            color: "var(--warn)", sub: "total aproveitável" },
                    ].map(card => (
                      <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "18px 20px" }}>
                        <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>{card.label}</div>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginBottom: "6px" }}>{card.value}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>
                  {eficienciaMensal.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "12px", color: "var(--t3)", fontSize: "13px" }}>
                      Nenhum dado de otimização. Salve pelo menos uma otimização no Otimizador.
                    </div>
                  ) : (
                    <div className="card">
                      <div className="ct">Aproveitamento por Mês</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                        <div>
                          <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                            {[{ color: "rgba(61,255,160,.6)", label: "Aproveitamento" }, { color: "rgba(244,63,94,.5)", label: "Perda" }].map(l => (
                              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--t2)" }}>
                                <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: l.color }} />{l.label}
                              </div>
                            ))}
                          </div>
                          <div style={{ height: "140px", display: "flex", alignItems: "flex-end", gap: "8px" }}>
                            {eficienciaMensal.map((m, i) => {
                              const hAprov = Math.max((m.aprovMedia / 100) * 130, 4);
                              const hPerda = Math.max((m.perdaMedia / 100) * 130, 2);
                              return (
                                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                                  <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: "2px" }}>
                                    <div style={{ flex: 1, height: `${hAprov}px`, borderRadius: "2px 2px 0 0", background: "rgba(61,255,160,.5)" }} />
                                    <div style={{ flex: 1, height: `${hPerda}px`, borderRadius: "2px 2px 0 0", background: "rgba(244,63,94,.45)" }} />
                                  </div>
                                  <div style={{ fontSize: "8px", fontFamily: "'DM Mono', monospace", color: "var(--t3)" }}>{m.key.substring(5)}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 60px 70px", gap: "6px", padding: "6px 8px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Mono', monospace", borderBottom: "1px solid var(--b1)" }}>
                            <div>Mês</div><div style={{ textAlign: "right" }}>Aproveit.</div><div style={{ textAlign: "right" }}>Perda</div><div style={{ textAlign: "right" }}>Otim.</div><div style={{ textAlign: "right" }}>Retalhos</div>
                          </div>
                          {eficienciaMensal.map((m, i) => (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 60px 70px", gap: "6px", padding: "8px 8px", background: i % 2 === 0 ? "var(--surf2)" : "transparent", borderRadius: "5px" }}>
                              <div style={{ fontSize: "12px", color: "var(--t1)", fontWeight: 600 }}>{m.label}</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--ok)", fontWeight: 700, textAlign: "right" }}>{m.aprovMedia.toFixed(1)}%</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--err)", textAlign: "right" }}>{m.perdaMedia.toFixed(1)}%</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t2)", textAlign: "right" }}>{m.count}</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--warn)", textAlign: "right" }}>{m.retalhos}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ══ TAB 4: FLUXO DE CAIXA ══ */}
              {tabIdx === 4 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
                    {[
                      { label: "Entradas Previstas (56d)",  value: formatBRL(totalEntradas60d), color: "var(--ok)",  sub: "A Receber próximas 8 semanas" },
                      { label: "Saídas Previstas (56d)",    value: formatBRL(totalSaidas60d),   color: "var(--err)", sub: "Contas a pagar próximas 8 semanas" },
                      { label: "Saldo Líquido Projetado",   value: formatBRL(saldoLiquido60d),  color: saldoLiquido60d >= 0 ? "var(--acc)" : "var(--err)", sub: saldoLiquido60d >= 0 ? "Posição favorável" : "Atenção: posição negativa" },
                    ].map(card => (
                      <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "18px 20px" }}>
                        <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>{card.label}</div>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginBottom: "6px" }}>{card.value}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="card">
                    <div className="ct">Entradas vs Saídas por Semana <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>próximas 8 semanas</span></div>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                      {[{ color: "rgba(16,185,129,.5)", label: "Entradas previstas" }, { color: "rgba(244,63,94,.45)", label: "Saídas previstas" }].map(l => (
                        <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--t2)" }}>
                          <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: l.color }} />{l.label}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "140px", marginBottom: "16px" }}>
                      {fluxoSemanas.map((s, i) => {
                        const hEnt = s.entradas > 0 ? Math.max((s.entradas / maxFluxo) * 120, 4) : 4;
                        const hSai = s.saidas > 0 ? Math.max((s.saidas / maxFluxo) * 120, 2) : 0;
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                            <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: "2px" }}>
                              <div style={{ flex: 1, height: `${hEnt}px`, borderRadius: "2px 2px 0 0", background: s.entradas > 0 ? "rgba(16,185,129,.5)" : "var(--surf2)" }} />
                              <div style={{ flex: 1, height: `${hSai}px`, borderRadius: "2px 2px 0 0", background: s.saidas > 0 ? "rgba(244,63,94,.45)" : "transparent" }} />
                            </div>
                            <div style={{ fontSize: "8px", fontFamily: "'DM Mono', monospace", color: "var(--t3)", whiteSpace: "nowrap" }}>{s.label}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 1fr", gap: "8px", padding: "6px 10px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Mono', monospace", borderBottom: "1px solid var(--b1)" }}>
                        <div>Semana</div><div style={{ textAlign: "right" }}>Entradas</div><div style={{ textAlign: "right" }}>Saídas</div><div style={{ textAlign: "right" }}>Saldo Semana</div>
                      </div>
                      {fluxoSemanas.map((s, i) => {
                        const endLabel = new Date(s.fim.getTime() - 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        return (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 1fr", gap: "8px", padding: "8px 10px", borderRadius: "6px", background: i % 2 === 0 ? "var(--surf2)" : "transparent" }}>
                            <div style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: "var(--t2)" }}>{s.label} – {endLabel}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: s.entradas > 0 ? "var(--ok)" : "var(--t3)", fontWeight: 600, textAlign: "right" }}>{s.entradas > 0 ? formatBRL(s.entradas) : "—"}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: s.saidas > 0 ? "var(--err)" : "var(--t3)", textAlign: "right" }}>{s.saidas > 0 ? formatBRL(s.saidas) : "—"}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: (s.entradas > 0 || s.saidas > 0) ? (s.saldo >= 0 ? "var(--ok)" : "var(--err)") : "var(--t3)", fontWeight: 700, textAlign: "right" }}>
                              {(s.entradas > 0 || s.saidas > 0) ? (s.saldo >= 0 ? "+" : "") + formatBRL(s.saldo) : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ══ TAB 5: ESTOQUE ══ */}
              {tabIdx === 5 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
                    {[
                      { label: "Valor em Estoque",   value: formatBRL(valorTotalEstoque),  color: "var(--acc)",  sub: `${estoque.length} produto(s) cadastrado(s)` },
                      { label: "m² em Estoque",      value: m2TotalEstoque.toFixed(2) + " m²", color: "var(--acc2)", sub: "saldo total disponível" },
                      { label: "Chapas em Estoque",  value: String(estoque.reduce((a: number, e: any) => a + Number(e.chapas_saldo), 0)), color: "var(--acc4)", sub: "chapas inteiras restantes" },
                    ].map(card => (
                      <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "18px 20px" }}>
                        <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>{card.label}</div>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginBottom: "6px" }}>{card.value}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>
                  {estoque.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "12px", color: "var(--t3)", fontSize: "13px" }}>
                      Nenhum produto em estoque.
                    </div>
                  ) : (
                    <div className="card">
                      <div className="ct">Saúde do Estoque por Produto <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>ordenado por criticidade</span></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 110px 110px 90px 70px", gap: "8px", padding: "6px 12px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Mono', monospace", borderBottom: "1px solid var(--b1)" }}>
                        <div>Produto</div><div style={{ textAlign: "right" }}>Chapas</div><div style={{ textAlign: "right" }}>m² Saldo</div><div style={{ textAlign: "right" }}>m² Consumido</div><div style={{ textAlign: "right" }}>Valor</div><div style={{ textAlign: "right" }}>% Restante</div><div style={{ textAlign: "center" }}>Status</div>
                      </div>
                      {estoqueOrdenado.map((e: any, i: number) => {
                        const pctRest = Number(e.m2_entrada) > 0 ? Number(e.m2_saldo) / Number(e.m2_entrada) * 100 : 0;
                        const valor   = Number(e.m2_saldo) * Number(e.custo_m2);
                        const status  = pctRest <= 20 ? "Crítico" : pctRest <= 50 ? "Atenção" : "Ok";
                        const sCor    = pctRest <= 20 ? "var(--err)" : pctRest <= 50 ? "var(--warn)" : "var(--ok)";
                        const sBg     = pctRest <= 20 ? "rgba(244,63,94,.1)" : pctRest <= 50 ? "rgba(245,158,11,.1)" : "rgba(16,185,129,.1)";
                        return (
                          <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "10px 12px", background: i % 2 === 0 ? "var(--surf2)" : "transparent", borderRadius: "7px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 110px 110px 90px 70px", gap: "8px", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>{e.produtos?.nome ?? e.cod ?? "—"}</div>
                                <div style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{e.cod}</div>
                              </div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t2)", textAlign: "right" }}>{Number(e.chapas_saldo)}</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t1)", fontWeight: 600, textAlign: "right" }}>{Number(e.m2_saldo).toFixed(2)}</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t3)", textAlign: "right" }}>{Number(e.m2_consumido).toFixed(2)}</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--acc)", fontWeight: 700, textAlign: "right" }}>{formatBRL(valor)}</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: sCor, fontWeight: 700, textAlign: "right" }}>{pctRest.toFixed(1)}%</div>
                              <div style={{ textAlign: "center" }}>
                                <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "5px", background: sBg, color: sCor, fontFamily: "'DM Mono', monospace" }}>{status}</span>
                              </div>
                            </div>
                            <div style={{ height: "4px", borderRadius: "2px", background: "var(--surf3)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(pctRest, 100)}%`, background: sCor, borderRadius: "2px", opacity: 0.7, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══ TAB 7: FECHAMENTO ══ */}
              {tabIdx === 7 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                  {/* Seletor de mês */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>Mês de fechamento:</span>
                    <select className="fc" style={{ minWidth: "200px" }} value={mesFechoSel} onChange={e => setMesFechoSel(e.target.value)}>
                      {mesesFecho.length === 0 && <option value="">Sem dados</option>}
                      {mesesFecho.map(m => {
                        const [y, mo] = m.split("-").map(Number);
                        const label = new Date(y, mo - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                        return <option key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>;
                      })}
                    </select>
                    {mesFechoAnt && (
                      <span style={{ fontSize: "11px", color: "var(--t3)" }}>
                        vs {new Date(Number(mesFechoAnt.split("-")[0]), Number(mesFechoAnt.split("-")[1]) - 1, 1)
                          .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                      </span>
                    )}
                  </div>

                  {/* KPIs do mês */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
                    {[
                      { label: "Faturamento do Mês", value: formatBRL(fatMesFecho), color: "var(--ok)", sub: fatMesAnt2 > 0 ? `${fatMesFecho >= fatMesAnt2 ? "↑ +" : "↓ "}${Math.abs((fatMesFecho - fatMesAnt2) / fatMesAnt2 * 100).toFixed(1)}% vs mês ant.` : "—" },
                      { label: "Investimentos do Mês", value: formatBRL(invMesSel.total), color: "#f59e0b", sub: `${invMesSel.items.length} lançamento(s)` },
                      { label: "Resultado do Mês", value: formatBRL(resultadoMes), color: resultadoMes >= 0 ? "var(--ok)" : "var(--err)", sub: resultadoMes >= 0 ? "Superávit" : "Déficit" },
                      { label: "Investido no Ano", value: formatBRL(totalInvestidoAno), color: "var(--acc2)", sub: `${investimentos.length} lançamentos` },
                    ].map(card => (
                      <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "18px 20px" }}>
                        <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>{card.label}</div>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginBottom: "6px" }}>{card.value}</div>
                        <div style={{ fontSize: "11px", color: card.color === "var(--err)" ? "var(--err)" : "var(--t3)" }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Faturamento vs Investimentos por mês */}
                  <div className="card">
                    <div className="ct">Faturamento × Investimentos por Mês</div>
                    <div style={{ display: "flex", gap: "14px", marginBottom: "10px" }}>
                      {[{ color: "rgba(61,255,160,.5)", label: "Faturamento" }, { color: "rgba(245,158,11,.6)", label: "Investimentos" }].map(l => (
                        <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--t2)" }}>
                          <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: l.color }} />{l.label}
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const maxVal = Math.max(...fechamentoMeses.map(m => Math.max(m.fat, m.inv)), 1);
                      return (
                        <div style={{ height: "130px", display: "flex", alignItems: "flex-end", gap: "6px", marginBottom: "14px" }}>
                          {fechamentoMeses.map((m, i) => {
                            const sel  = m.mes === mesFechoSel;
                            const hFat = m.fat > 0 ? Math.max((m.fat / maxVal) * 110, 4) : 4;
                            const hInv = m.inv > 0 ? Math.max((m.inv / maxVal) * 110, 2) : 0;
                            return (
                              <div key={i} onClick={() => setMesFechoSel(m.mes)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", cursor: "pointer" }}>
                                <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: "1px" }}>
                                  <div style={{ flex: 1, height: `${hFat}px`, borderRadius: "2px 2px 0 0", background: sel ? "var(--ok)" : "rgba(61,255,160,.35)", transition: "all .15s", boxShadow: sel ? "0 0 8px rgba(61,255,160,.3)" : "none" }} />
                                  <div style={{ flex: 1, height: `${hInv}px`, borderRadius: "2px 2px 0 0", background: sel ? "#f59e0b" : "rgba(245,158,11,.45)", transition: "all .15s" }} />
                                </div>
                                <div style={{ fontSize: "7px", fontFamily: "'DM Mono', monospace", color: sel ? "var(--acc)" : "var(--t3)", fontWeight: sel ? 700 : 400 }}>
                                  {m.mes.substring(5)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {/* Table summary */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 80px", gap: "6px", padding: "5px 8px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid var(--b1)", fontFamily: "'DM Mono', monospace" }}>
                      <div>Mês</div><div style={{ textAlign: "right" }}>Faturamento</div><div style={{ textAlign: "right" }}>Investimentos</div><div style={{ textAlign: "right" }}>Resultado</div><div style={{ textAlign: "right" }}>Lanç.</div>
                    </div>
                    {fechamentoMeses.map((m, i) => {
                      const sel = m.mes === mesFechoSel;
                      return (
                        <div key={i} onClick={() => setMesFechoSel(m.mes)} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 80px", gap: "6px", padding: "8px 8px", borderRadius: "6px", cursor: "pointer", background: sel ? "rgba(245,158,11,.06)" : i % 2 === 0 ? "var(--surf2)" : "transparent", border: sel ? "1px solid rgba(245,158,11,.25)" : "1px solid transparent", transition: "all .1s" }}>
                          <div style={{ fontSize: "12px", color: "var(--t1)", fontWeight: sel ? 700 : 500 }}>{m.label}</div>
                          <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--ok)", fontWeight: 600, textAlign: "right" }}>{m.fat > 0 ? formatBRL(m.fat) : "—"}</div>
                          <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "#f59e0b", textAlign: "right" }}>{m.inv > 0 ? formatBRL(m.inv) : "—"}</div>
                          <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: m.resultado >= 0 ? "var(--ok)" : "var(--err)", fontWeight: 700, textAlign: "right" }}>
                            {(m.fat > 0 || m.inv > 0) ? (m.resultado >= 0 ? "+" : "") + formatBRL(m.resultado) : "—"}
                          </div>
                          <div style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: "var(--t3)", textAlign: "right" }}>
                            {(invPorMes.get(m.mes)?.items.length ?? 0) || "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Investimentos do mês por categoria + top lançamentos */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

                    {/* Por categoria */}
                    <div className="card">
                      <div className="ct">Investimentos por Categoria <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{mesFechoSel ? new Date(Number(mesFechoSel.split("-")[0]), Number(mesFechoSel.split("-")[1]) - 1, 1).toLocaleDateString("pt-BR", { month: "long" }) : ""}</span></div>
                      {invPorCat.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "30px", color: "var(--t3)", fontSize: "12px" }}>Nenhum investimento neste mês.</div>
                      ) : (() => {
                        const maxCat = invPorCat[0]?.[1] ?? 1;
                        return invPorCat.map(([cat, val], i) => {
                          const pct = (val / maxCat) * 100;
                          const pctTotal = invMesSel.total > 0 ? (val / invMesSel.total * 100) : 0;
                          return (
                            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "12px", color: "var(--t1)", fontWeight: 500 }}>{cat}</span>
                                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                  <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{pctTotal.toFixed(1)}%</span>
                                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Mono', monospace" }}>{formatBRL(val)}</span>
                                </div>
                              </div>
                              <div style={{ height: "5px", borderRadius: "3px", background: "var(--surf2)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: "rgba(245,158,11,.65)", borderRadius: "3px", transition: "width .4s" }} />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Top lançamentos do mês */}
                    <div className="card">
                      <div className="ct">Maiores Lançamentos <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>top 10 do mês</span></div>
                      {invMesSel.items.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "30px", color: "var(--t3)", fontSize: "12px" }}>Nenhum lançamento neste mês.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 90px", gap: "6px", padding: "5px 8px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid var(--b1)", fontFamily: "'DM Mono', monospace" }}>
                            <div>Descrição</div><div>Categoria</div><div style={{ textAlign: "right" }}>Valor</div>
                          </div>
                          {[...invMesSel.items].sort((a, b) => Number(b.valor) - Number(a.valor)).slice(0, 10).map((inv: any, i: number) => (
                            <div key={inv.id ?? i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 90px", gap: "6px", padding: "8px 8px", borderRadius: "5px", background: i % 2 === 0 ? "var(--surf2)" : "transparent", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: "12px", color: "var(--t1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.descricao}</div>
                                <div style={{ fontSize: "10px", color: "var(--t3)" }}>{inv.empresa}</div>
                              </div>
                              <div style={{ fontSize: "10px", color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.categoria ?? "—"}</div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{formatBRL(Number(inv.valor))}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estoque snapshot + categorias no ano */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

                    {/* Estoque atual */}
                    <div className="card">
                      <div className="ct">Estoque Atual</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "12px" }}>
                        {[
                          { label: "Valor em Estoque", value: formatBRL(valorTotalEstoque), color: "var(--acc)" },
                          { label: "m² Disponível",    value: m2TotalEstoque.toFixed(1) + " m²", color: "var(--acc2)" },
                          { label: "Chapas Inteiras",  value: String(estoque.reduce((a: number, e: any) => a + Number(e.chapas_saldo), 0)), color: "var(--acc4)" },
                        ].map(k => (
                          <div key={k.label} style={{ padding: "10px 12px", background: "var(--surf2)", borderRadius: "8px", border: "1px solid var(--b1)" }}>
                            <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "4px" }}>{k.label}</div>
                            <div style={{ fontSize: "16px", fontWeight: 700, color: k.color, fontFamily: "'DM Mono', monospace" }}>{k.value}</div>
                          </div>
                        ))}
                      </div>
                      {estoque.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "20px", color: "var(--t3)", fontSize: "12px" }}>Nenhum produto em estoque.</div>
                      ) : estoqueOrdenado.map((e: any, i: number) => {
                        const pctRest = Number(e.m2_entrada) > 0 ? Number(e.m2_saldo) / Number(e.m2_entrada) * 100 : 0;
                        const sCor    = pctRest <= 20 ? "var(--err)" : pctRest <= 50 ? "var(--warn)" : "var(--ok)";
                        return (
                          <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--t1)" }}>{e.produtos?.nome ?? e.cod}</span>
                              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{Number(e.chapas_saldo)} chapas · {Number(e.m2_saldo).toFixed(1)} m²</span>
                                <span style={{ fontSize: "11px", fontWeight: 700, color: sCor, fontFamily: "'DM Mono', monospace" }}>{pctRest.toFixed(0)}%</span>
                              </div>
                            </div>
                            <div style={{ height: "4px", borderRadius: "2px", background: "var(--surf2)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(pctRest, 100)}%`, background: sCor, borderRadius: "2px", opacity: 0.7 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Categorias no ano */}
                    <div className="card">
                      <div className="ct">Investimentos por Categoria <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>acumulado 2026</span></div>
                      {invPorCatAno.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "30px", color: "var(--t3)", fontSize: "12px" }}>Nenhum investimento registrado.</div>
                      ) : (() => {
                        const maxCat = invPorCatAno[0]?.[1] ?? 1;
                        return invPorCatAno.map(([cat, val], i) => {
                          const pct = (val / maxCat) * 100;
                          const pctTotal = totalInvestidoAno > 0 ? (val / totalInvestidoAno * 100) : 0;
                          return (
                            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "12px", color: "var(--t1)", fontWeight: 500 }}>{cat}</span>
                                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                  <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{pctTotal.toFixed(1)}%</span>
                                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#f59e0b", fontFamily: "'DM Mono', monospace" }}>{formatBRL(val)}</span>
                                </div>
                              </div>
                              <div style={{ height: "5px", borderRadius: "3px", background: "var(--surf2)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: "rgba(245,158,11,.5)", borderRadius: "3px", transition: "width .4s" }} />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                  </div>
                </div>
              )}

              {/* ══ TAB 6: ORÇAMENTOS ══ */}
              {tabIdx === 6 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
                    {[
                      { label: "Total de Orçamentos", value: String(orcamentos.length), color: "var(--acc2)", sub: "criados no sistema" },
                      { label: "Taxa de Conversão",   value: taxaConversao.toFixed(1) + "%", color: taxaConversao >= 50 ? "var(--ok)" : taxaConversao >= 30 ? "var(--warn)" : "var(--err)", sub: `${orcsAprovados.length} de ${orcsAprovados.length + orcsRejeitados.length} decididos` },
                      { label: "Em Negociação",       value: formatBRL(valorPendente),  color: "var(--warn)", sub: `${orcsPendentes.length} orçamento(s) em aberto` },
                      { label: "Volume Convertido",   value: formatBRL(valorAprovado),  color: "var(--ok)",  sub: `${orcsAprovados.length} aprovado(s)` },
                    ].map(card => (
                      <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "18px 20px" }}>
                        <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>{card.label}</div>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginBottom: "6px" }}>{card.value}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div className="card">
                      <div className="ct">Distribuição por Status</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {[
                          { label: "Aprovados",  count: orcsAprovados.length,  value: valorAprovado,  cor: "var(--ok)",   bg: "rgba(16,185,129,.1)" },
                          { label: "Pendentes",  count: orcsPendentes.length,  value: valorPendente,  cor: "var(--warn)", bg: "rgba(245,158,11,.1)" },
                          { label: "Rejeitados", count: orcsRejeitados.length, value: orcsRejeitados.reduce((a: number, o: any) => a + Number(o.valor_total), 0), cor: "var(--err)", bg: "rgba(244,63,94,.1)" },
                        ].map(row => {
                          const pct = orcamentos.length > 0 ? row.count / orcamentos.length * 100 : 0;
                          return (
                            <div key={row.label} style={{ padding: "10px 12px", background: "var(--surf2)", borderRadius: "9px", border: "1px solid var(--b1)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>{row.label}</span>
                                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                  <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(row.value)}</span>
                                  <span style={{ fontSize: "18px", fontWeight: 800, color: row.cor, fontFamily: "'DM Mono', monospace" }}>{row.count}</span>
                                </div>
                              </div>
                              <div style={{ height: "4px", borderRadius: "2px", background: "var(--surf3)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: row.cor, borderRadius: "2px", opacity: 0.7 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="card">
                      <div className="ct">Orçamentos Recentes <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>últimos 10</span></div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 90px", gap: "8px", padding: "5px 8px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Mono', monospace", borderBottom: "1px solid var(--b1)" }}>
                          <div>#</div><div>Cliente</div><div style={{ textAlign: "right" }}>Valor</div><div style={{ textAlign: "center" }}>Status</div>
                        </div>
                        {orcsRecentes.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "30px", color: "var(--t3)", fontSize: "12px" }}>Nenhum orçamento encontrado.</div>
                        ) : orcsRecentes.map((o: any, i: number) => {
                          const sCor = o.status === 'Aprovado' ? "var(--ok)" : o.status === 'Rejeitado' ? "var(--err)" : "var(--warn)";
                          const sBg  = o.status === 'Aprovado' ? "rgba(16,185,129,.1)" : o.status === 'Rejeitado' ? "rgba(244,63,94,.1)" : "rgba(245,158,11,.1)";
                          return (
                            <div key={o.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 90px", gap: "8px", padding: "8px 8px", borderRadius: "6px", background: i % 2 === 0 ? "var(--surf2)" : "transparent", alignItems: "center" }}>
                              <div style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: "var(--acc)", fontWeight: 700 }}>{o.id}</div>
                              <div style={{ fontSize: "12px", color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.clientes?.nome ?? "—"}</div>
                              <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t1)", fontWeight: 700, textAlign: "right" }}>{formatBRL(o.valor_total)}</div>
                              <div style={{ textAlign: "center" }}>
                                <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: sBg, color: sCor, fontFamily: "'DM Mono', monospace" }}>{o.status}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            PDF: RELATÓRIO GERENCIAL
        ════════════════════════════════════════════════════════════════════ */}
        {reporteAtivo === "gerencial" && (
          <div className="print-area" style={S.page}>
            <PdfHeader titulo="Relatório Gerencial" subtitulo="Sumário Executivo" emissao={dtEmissao} />

            {/* KPIs executivos */}
            <div style={S.sec}>Sumário Executivo · 2026</div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
              {[
                { label: "Faturamento Total",     value: formatBRL(fatTotal),       sub: `${mesesComDados.length} meses com receita` },
                { label: "Total Recebido",         value: formatBRL(recTotal),       sub: `${fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) : 0}% do faturado` },
                { label: "A Receber",              value: formatBRL(aReceber),       sub: `${devedores.length} cliente(s) em aberto` },
                { label: "Pedidos Realizados",     value: String(pedidos.length),    sub: `Ticket médio ${formatBRL(ticketMedio)}` },
                { label: "m² Processado",          value: m2Total.toFixed(2) + " m²", sub: `${pedidos.filter(p => p.status === "Entregue").length} pedidos entregues` },
              ].map(k => (
                <div key={k.label} style={S.kpi}>
                  <div style={S.kpiL}>{k.label}</div>
                  <div style={S.kpiV}>{k.value}</div>
                  <div style={S.kpiS}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Faturamento mensal */}
            <div style={S.sec}>Evolução de Faturamento Mensal</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
              <thead>
                <tr>
                  {["Mês","Faturado","Recebido","A Receber","% Recebido","Variação","Status"].map((h, i) => (
                    <th key={i} style={{ ...S.th, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meses.map((m, i) => {
                  const pct    = m.faturado > 0 ? (m.recebido / m.faturado * 100) : 0;
                  const ant    = i > 0 ? meses[i - 1].faturado : 0;
                  const varM   = ant > 0 ? ((m.faturado - ant) / ant * 100) : null;
                  const status = m.faturado === 0 ? "—" : pct >= 100 ? "Quitado" : pct > 0 ? "Parcial" : "Pendente";
                  const statusCor = pct >= 100 ? "#155724" : pct > 0 ? "#856404" : m.faturado === 0 ? "#888" : "#721c24";
                  const statusBg  = pct >= 100 ? "#d4edda" : pct > 0 ? "#fff3cd" : m.faturado === 0 ? "#f0f0f0" : "#f8d7da";
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ ...S.td, fontWeight: 700 }}>{m.mesCompleto}</td>
                      <td style={{ ...S.tdR, color: m.faturado > 0 ? "#2d5fa6" : "#bbb" }}>{m.faturado > 0 ? formatBRL(m.faturado) : "—"}</td>
                      <td style={{ ...S.tdR, color: m.recebido > 0 ? "#155724" : "#bbb" }}>{m.recebido > 0 ? formatBRL(m.recebido) : "—"}</td>
                      <td style={{ ...S.tdR, color: (m.faturado - m.recebido) > 0 ? "#856404" : "#bbb" }}>{m.faturado > m.recebido ? formatBRL(m.faturado - m.recebido) : "—"}</td>
                      <td style={{ ...S.tdR }}>{m.faturado > 0 ? pct.toFixed(1) + "%" : "—"}</td>
                      <td style={{ ...S.tdR, color: varM === null ? "#bbb" : varM >= 0 ? "#155724" : "#721c24" }}>
                        {varM !== null && m.faturado > 0 ? (varM >= 0 ? "↑ +" : "↓ ") + Math.abs(varM).toFixed(1) + "%" : "—"}
                      </td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        <span style={{ fontSize: "8px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: statusBg, color: statusCor }}>{status}</span>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#eef3ff" }}>
                  <td style={{ ...S.td, fontWeight: 800, color: "#2d5fa6" }}>TOTAL</td>
                  <td style={{ ...S.tdR, color: "#2d5fa6", fontWeight: 800 }}>{formatBRL(fatTotal)}</td>
                  <td style={{ ...S.tdR, color: "#155724", fontWeight: 800 }}>{formatBRL(recTotal)}</td>
                  <td style={{ ...S.tdR, color: "#856404", fontWeight: 800 }}>{formatBRL(aReceber)}</td>
                  <td style={{ ...S.tdR, fontWeight: 800 }}>{fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—"}</td>
                  <td style={S.tdR}>—</td>
                  <td style={S.td} />
                </tr>
              </tbody>
            </table>

            {/* Top clientes */}
            <div style={S.sec}>Ranking de Clientes por Faturamento</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
              <thead>
                <tr>
                  {["#","Cliente","Cidade","Faturado","Recebido","A Receber","% Rec.","Pedidos","Risco"].map((h, i) => (
                    <th key={i} style={{ ...S.th, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesOrdenados.slice(0, 15).map((f, i) => {
                  const pctRec  = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                  const risco   = Number(f.faturado) > 0 ? Number(f.a_receber) / Number(f.faturado) : 0;
                  const rLabel  = risco === 0 ? "Zero" : risco < 0.5 ? "Médio" : "Alto";
                  const rCor    = risco === 0 ? "#155724" : risco < 0.5 ? "#856404" : "#721c24";
                  const rBg     = risco === 0 ? "#d4edda" : risco < 0.5 ? "#fff3cd" : "#f8d7da";
                  return (
                    <tr key={f.cliente_id} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ ...S.td, color: "#888", textAlign: "center" }}>{i + 1}°</td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{f.cliente_nome}</td>
                      <td style={{ ...S.td, color: "#555" }}>{(f as any).cidade || "—"}</td>
                      <td style={{ ...S.tdR, color: "#2d5fa6" }}>{formatBRL(f.faturado)}</td>
                      <td style={{ ...S.tdR, color: "#155724" }}>{formatBRL(f.recebido)}</td>
                      <td style={{ ...S.tdR, color: Number(f.a_receber) > 0 ? "#856404" : "#aaa" }}>{Number(f.a_receber) > 0 ? formatBRL(f.a_receber) : "—"}</td>
                      <td style={{ ...S.tdR }}>{pctRec.toFixed(1)}%</td>
                      <td style={{ ...S.tdR }}>{f.total_pedidos}</td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        <span style={{ fontSize: "8px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: rBg, color: rCor }}>{rLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pipeline */}
            <div style={S.sec}>Pipeline de Produção</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
              <thead>
                <tr>
                  {["Status","Qtd. Pedidos","% do Total","Valor Total"].map((h, i) => (
                    <th key={i} style={{ ...S.th, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statusCount.map(([status, count], i) => {
                  const valTotal = pedidos.filter(p => p.status === status).reduce((a, p) => a + Number(p.valor_total), 0);
                  return (
                    <tr key={status} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ ...S.td, fontWeight: 700 }}>{status}</td>
                      <td style={{ ...S.tdR }}>{count}</td>
                      <td style={{ ...S.tdR }}>{(count / pedidos.length * 100).toFixed(1)}%</td>
                      <td style={{ ...S.tdR, color: "#2d5fa6" }}>{formatBRL(valTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Análise */}
            <div style={S.sec}>Análise e Destaques</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "10px", marginBottom: "14px" }}>
              {[
                { label: "Melhor Mês",              value: melhorMes.mesCompleto + " — " + formatBRL(melhorMes.faturado) },
                { label: "Taxa Média de Recebimento", value: fatTotal > 0 ? (recTotal / fatTotal * 100).toFixed(1) + "%" : "—" },
                { label: "Clientes com Débito",      value: devedores.length + " de " + financeiro.length + " (" + (financeiro.length > 0 ? (devedores.length/financeiro.length*100).toFixed(0) : 0) + "%)" },
                { label: "Total m² Processado",      value: m2Total.toFixed(2) + " m²" },
                { label: "Pedidos Ativos em Prod.",  value: String(pedidos.filter(p => !["Entregue","Cancelado"].includes(p.status)).length) },
                { label: "Valor Médio por Pedido",   value: formatBRL(ticketMedio) },
              ].map(item => (
                <div key={item.label} style={{ padding: "8px 12px", background: "#f0f4ff", borderRadius: "6px", borderLeft: "3px solid #2d5fa6", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#555", fontWeight: 600 }}>{item.label}</span>
                  <strong style={{ color: "#2d5fa6", fontFamily: "monospace" }}>{item.value}</strong>
                </div>
              ))}
            </div>

            <PdfFooter emissao={dtEmissao} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            PDF: RELATÓRIO DE INADIMPLÊNCIA
        ════════════════════════════════════════════════════════════════════ */}
        {reporteAtivo === "inadimplencia" && (
          <div className="print-area" style={S.page}>
            <PdfHeader titulo="Relatório de Inadimplência" subtitulo="Análise de Crédito e Devedores" emissao={dtEmissao} />

            {/* Resumo executivo */}
            <div style={S.sec}>Resumo da Situação de Crédito</div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
              {[
                { label: "Total em Aberto",          value: formatBRL(totalDevedores),            sub: `${devedores.length} clientes`, bg: "#fff0f0", border: "#f5c6cb" },
                { label: "Clientes Sem Pagamento",   value: String(inadimplentes.length),          sub: formatBRL(inadimplentes.reduce((a,f)=>a+Number(f.a_receber),0)), bg: "#fff0f0", border: "#f5c6cb" },
                { label: "Clientes Parcialmente Ok", value: String(devedores.length - inadimplentes.length), sub: "pagamento incompleto", bg: "#fff8e1", border: "#ffeeba" },
                { label: "Parcelas Vencidas",        value: String(parcelasVencidas.length),       sub: formatBRL(totalVencido) + " atrasado", bg: "#fff0f0", border: "#f5c6cb" },
                { label: "Total Faturado (base)",    value: formatBRL(fatTotal),                   sub: formatBRL(recTotal) + " recebido", bg: "#f0f4ff", border: "#d0daf0" },
              ].map(k => (
                <div key={k.label} style={{ ...S.kpi, background: k.bg, borderColor: k.border }}>
                  <div style={S.kpiL}>{k.label}</div>
                  <div style={{ ...S.kpiV, color: k.bg === "#f0f4ff" ? "#2d5fa6" : "#c0392b" }}>{k.value}</div>
                  <div style={S.kpiS}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Clientes inadimplentes totais */}
            {inadimplentes.length > 0 && (
              <>
                <div style={S.sec}>⚠ Alto Risco — Sem Nenhum Pagamento</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
                  <thead>
                    <tr>{["#","Cliente","Cidade","Faturado","Recebido","Em Aberto","% Rec.","Pedidos"].map((h,i) => <th key={i} style={{ ...S.th, background: "#c0392b", textAlign: i >= 3 ? "right" : "left" }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {inadimplentes.map((f, i) => (
                      <tr key={f.cliente_id} style={{ background: i % 2 === 0 ? "#fff5f5" : "#fff" }}>
                        <td style={{ ...S.td, color: "#888", textAlign: "center" }}>{i + 1}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: "#c0392b" }}>{f.cliente_nome}</td>
                        <td style={{ ...S.td, color: "#555" }}>{(f as any).cidade || "—"}</td>
                        <td style={{ ...S.tdR, color: "#2d5fa6" }}>{formatBRL(f.faturado)}</td>
                        <td style={{ ...S.tdR, color: "#aaa" }}>—</td>
                        <td style={{ ...S.tdR, color: "#c0392b", fontWeight: 800 }}>{formatBRL(f.a_receber)}</td>
                        <td style={{ ...S.tdR, color: "#c0392b" }}>0%</td>
                        <td style={{ ...S.tdR }}>{f.total_pedidos}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "#f8d7da" }}>
                      <td colSpan={3} style={{ ...S.td, fontWeight: 800, color: "#721c24" }}>SUBTOTAL INADIMPLENTES</td>
                      <td style={{ ...S.tdR, color: "#2d5fa6", fontWeight: 800 }}>{formatBRL(inadimplentes.reduce((a,f)=>a+Number(f.faturado),0))}</td>
                      <td style={S.tdR}>—</td>
                      <td style={{ ...S.tdR, color: "#c0392b", fontWeight: 800 }}>{formatBRL(inadimplentes.reduce((a,f)=>a+Number(f.a_receber),0))}</td>
                      <td colSpan={2} style={S.tdR} />
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* Clientes com pagamento parcial */}
            {devedores.filter(f => Number(f.recebido) > 0).length > 0 && (
              <>
                <div style={S.sec}>Médio Risco — Pagamento Parcial</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
                  <thead>
                    <tr>{["#","Cliente","Cidade","Faturado","Recebido","Em Aberto","% Rec.","Pedidos"].map((h,i) => <th key={i} style={{ ...S.th, background: "#856404", textAlign: i >= 3 ? "right" : "left" }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {devedores.filter(f => Number(f.recebido) > 0).map((f, i) => {
                      const pctRec = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                      return (
                        <tr key={f.cliente_id} style={{ background: i % 2 === 0 ? "#fffdf0" : "#fff" }}>
                          <td style={{ ...S.td, color: "#888", textAlign: "center" }}>{i + 1}</td>
                          <td style={{ ...S.td, fontWeight: 700 }}>{f.cliente_nome}</td>
                          <td style={{ ...S.td, color: "#555" }}>{(f as any).cidade || "—"}</td>
                          <td style={{ ...S.tdR, color: "#2d5fa6" }}>{formatBRL(f.faturado)}</td>
                          <td style={{ ...S.tdR, color: "#155724" }}>{formatBRL(f.recebido)}</td>
                          <td style={{ ...S.tdR, color: "#856404", fontWeight: 700 }}>{formatBRL(f.a_receber)}</td>
                          <td style={{ ...S.tdR, color: "#856404" }}>{pctRec.toFixed(1)}%</td>
                          <td style={{ ...S.tdR }}>{f.total_pedidos}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* Parcelas vencidas */}
            {parcelasVencidas.length > 0 && (
              <>
                <div style={S.sec}>Parcelas Vencidas e Não Pagas</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
                  <thead>
                    <tr>{["Vencimento","Dias Atraso","Cliente","Pedido","Descrição","Valor"].map((h,i) => <th key={i} style={{ ...S.th, background: "#721c24", textAlign: i >= 5 ? "right" : "left" }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parcelasVencidas.map((l, i) => {
                      const dias = l.vencimento ? Math.floor((new Date(hoje).getTime() - new Date(l.vencimento + "T12:00:00").getTime()) / 86400000) : 0;
                      return (
                        <tr key={l.id} style={{ background: i % 2 === 0 ? "#fff5f5" : "#fff" }}>
                          <td style={{ ...S.td, fontFamily: "monospace", color: "#c0392b", fontWeight: 700 }}>
                            {l.vencimento ? new Date(l.vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td style={{ ...S.tdR, color: dias > 30 ? "#c0392b" : "#856404" }}>{dias}d</td>
                          <td style={{ ...S.td, fontWeight: 600 }}>{(l as any).clientes?.nome ?? "—"}</td>
                          <td style={{ ...S.td, fontFamily: "monospace", color: "#2d5fa6" }}>{l.pedido_id ?? "—"}</td>
                          <td style={{ ...S.td, color: "#444" }}>{l.descricao}</td>
                          <td style={{ ...S.tdR, color: "#c0392b", fontWeight: 800 }}>{formatBRL(l.valor)}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "#f8d7da" }}>
                      <td colSpan={5} style={{ ...S.td, fontWeight: 800, color: "#721c24" }}>TOTAL VENCIDO</td>
                      <td style={{ ...S.tdR, color: "#c0392b", fontWeight: 800 }}>{formatBRL(totalVencido)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* Totais finais */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
              {[
                { label: "Total em Aberto",      value: formatBRL(totalDevedores),  cor: "#c0392b" },
                { label: "Total Vencido",         value: formatBRL(totalVencido),    cor: "#721c24" },
                { label: "% Recebimento Geral",   value: fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—", cor: "#2d5fa6" },
              ].map(k => (
                <div key={k.label} style={{ flex: 1, padding: "12px 14px", background: "#f8f9fa", border: `2px solid ${k.cor}44`, borderRadius: "8px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1px" }}>{k.label}</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: k.cor, fontFamily: "monospace", marginTop: "4px" }}>{k.value}</div>
                </div>
              ))}
            </div>

            <PdfFooter emissao={dtEmissao} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            PDF: RELATÓRIO DE FATURAMENTO ANALÍTICO
        ════════════════════════════════════════════════════════════════════ */}
        {reporteAtivo === "faturamento" && (
          <div className="print-area" style={S.page}>
            <PdfHeader titulo="Relatório de Faturamento" subtitulo="Análise Analítica 2026" emissao={dtEmissao} />

            {/* Sumário */}
            <div style={S.sec}>Resumo do Exercício 2026</div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
              {[
                { label: "Faturamento Total",        value: formatBRL(fatTotal),      sub: `${mesesComDados.length} meses` },
                { label: "Total Recebido",            value: formatBRL(recTotal),      sub: (fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) : 0) + "% do fat." },
                { label: "A Receber",                 value: formatBRL(aReceber),      sub: `${devedores.length} clientes` },
                { label: "Ticket Médio",              value: formatBRL(ticketMedio),   sub: `${pedidos.length} pedidos` },
                { label: "Melhor Mês",                value: melhorMes.mes,            sub: formatBRL(melhorMes.faturado) },
              ].map(k => (
                <div key={k.label} style={S.kpi}>
                  <div style={S.kpiL}>{k.label}</div>
                  <div style={S.kpiV}>{k.value}</div>
                  <div style={S.kpiS}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Faturamento mensal detalhado */}
            <div style={S.sec}>Faturamento Mensal Analítico</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
              <thead>
                <tr>
                  {["Mês","Faturado","Recebido","A Receber","% Recebido","Var. Mês","% Acum. Faturado"].map((h, i) => (
                    <th key={i} style={{ ...S.th, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let acumFat = 0;
                  return meses.map((m, i) => {
                    acumFat += m.faturado;
                    const pctRec = m.faturado > 0 ? (m.recebido / m.faturado * 100) : 0;
                    const ant    = i > 0 ? meses[i-1].faturado : 0;
                    const varM   = ant > 0 ? ((m.faturado - ant) / ant * 100) : null;
                    const pctAcum = fatTotal > 0 ? (acumFat / fatTotal * 100) : 0;
                    const isEmpty = m.faturado === 0;
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff", opacity: isEmpty ? 0.5 : 1 }}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{m.mesCompleto}</td>
                        <td style={{ ...S.tdR, color: isEmpty ? "#bbb" : "#2d5fa6" }}>{isEmpty ? "—" : formatBRL(m.faturado)}</td>
                        <td style={{ ...S.tdR, color: isEmpty ? "#bbb" : "#155724" }}>{isEmpty ? "—" : formatBRL(m.recebido)}</td>
                        <td style={{ ...S.tdR, color: (m.faturado-m.recebido) > 0 ? "#856404" : "#bbb" }}>{(m.faturado - m.recebido) > 0 ? formatBRL(m.faturado - m.recebido) : "—"}</td>
                        <td style={{ ...S.tdR, color: isEmpty ? "#bbb" : pctRec >= 100 ? "#155724" : pctRec > 50 ? "#856404" : "#c0392b" }}>{isEmpty ? "—" : pctRec.toFixed(1) + "%"}</td>
                        <td style={{ ...S.tdR, color: varM === null || isEmpty ? "#bbb" : varM >= 0 ? "#155724" : "#c0392b" }}>
                          {!isEmpty && varM !== null ? (varM >= 0 ? "↑ +" : "↓ ") + Math.abs(varM).toFixed(1) + "%" : "—"}
                        </td>
                        <td style={{ ...S.tdR, color: "#555" }}>{isEmpty ? "—" : pctAcum.toFixed(1) + "%"}</td>
                      </tr>
                    );
                  });
                })()}
                <tr style={{ background: "#eef3ff" }}>
                  <td style={{ ...S.td, fontWeight: 800, color: "#2d5fa6" }}>TOTAL 2026</td>
                  <td style={{ ...S.tdR, color: "#2d5fa6", fontWeight: 800 }}>{formatBRL(fatTotal)}</td>
                  <td style={{ ...S.tdR, color: "#155724", fontWeight: 800 }}>{formatBRL(recTotal)}</td>
                  <td style={{ ...S.tdR, color: "#856404", fontWeight: 800 }}>{formatBRL(aReceber)}</td>
                  <td style={{ ...S.tdR, fontWeight: 800 }}>{fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—"}</td>
                  <td style={S.tdR}>—</td>
                  <td style={{ ...S.tdR, fontWeight: 800 }}>100%</td>
                </tr>
              </tbody>
            </table>

            {/* Clientes por faturamento */}
            <div style={S.sec}>Faturamento por Cliente</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
              <thead>
                <tr>
                  {["#","Cliente","Cidade","Faturado","% Total","Recebido","A Receber","% Rec.","Pedidos"].map((h, i) => (
                    <th key={i} style={{ ...S.th, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesOrdenados.map((f, i) => {
                  const pctFat = fatTotal > 0 ? Number(f.faturado) / fatTotal * 100 : 0;
                  const pctRec = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                  return (
                    <tr key={f.cliente_id} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ ...S.td, color: "#888", textAlign: "center" }}>{i + 1}</td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{f.cliente_nome}</td>
                      <td style={{ ...S.td, color: "#555" }}>{(f as any).cidade || "—"}</td>
                      <td style={{ ...S.tdR, color: "#2d5fa6", fontWeight: 700 }}>{formatBRL(f.faturado)}</td>
                      <td style={{ ...S.tdR, color: "#555" }}>{pctFat.toFixed(1)}%</td>
                      <td style={{ ...S.tdR, color: "#155724" }}>{formatBRL(f.recebido)}</td>
                      <td style={{ ...S.tdR, color: Number(f.a_receber) > 0 ? "#856404" : "#aaa" }}>{Number(f.a_receber) > 0 ? formatBRL(f.a_receber) : "—"}</td>
                      <td style={{ ...S.tdR, color: pctRec >= 100 ? "#155724" : pctRec > 50 ? "#856404" : "#c0392b" }}>{pctRec.toFixed(1)}%</td>
                      <td style={{ ...S.tdR }}>{f.total_pedidos}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#eef3ff" }}>
                  <td colSpan={3} style={{ ...S.td, fontWeight: 800, color: "#2d5fa6" }}>TOTAL</td>
                  <td style={{ ...S.tdR, color: "#2d5fa6", fontWeight: 800 }}>{formatBRL(fatTotal)}</td>
                  <td style={{ ...S.tdR, fontWeight: 800 }}>100%</td>
                  <td style={{ ...S.tdR, color: "#155724", fontWeight: 800 }}>{formatBRL(recTotal)}</td>
                  <td style={{ ...S.tdR, color: "#856404", fontWeight: 800 }}>{formatBRL(aReceber)}</td>
                  <td style={{ ...S.tdR, fontWeight: 800 }}>{fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—"}</td>
                  <td style={{ ...S.tdR, fontWeight: 800 }}>{pedidos.length}</td>
                </tr>
              </tbody>
            </table>

            <PdfFooter emissao={dtEmissao} />
          </div>
        )}
      </AppLayout>
    </>
  );
}
