"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFinanceiroClientes, getFaturamentoMensal, getLancamentos } from "@/services/financeiro.service";
import { getPedidos } from "@/services/pedidos.service";
import { getEstoque } from "@/services/estoque.service";
import { getOrcamentos } from "@/services/orcamentos.service";
import { getAllHistoricoOtimizador } from "@/services/otimizador.service";
import { getResumoQualidade, getIndicadoresMensais } from "@/services/qualidade.service";
import { formatBRL, formatPercent, formatDuracao } from "@/lib/formatters";
import { calcStatsEtapas, ETAPAS_FLUXO, calcLeadTime } from "@/lib/producao-stats";
import { supabase } from "@/lib/supabase/client";
import type { FinanceiroCliente, FaturamentoMensal, Pedido, Lancamento, IndicadorQualidadeMensal } from "@/types";

const MESES_ABREV    = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_COMPLETOS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TABS = ["Faturamento","Clientes","Pedidos","Produção","Eficiência","Fluxo de Caixa","Estoque","Orçamentos","Fechamento","Qualidade"];

const STATUS_COR: Record<string, string> = {
  "Aguardando otimização":   "var(--warn)",
  "Em Produção – Corte":     "var(--acc4)",
  "Qualidade (Corte)":       "#22c55e",
  "Em Produção – Lapidação": "var(--acc3)",
  "Qualidade (Lapidação)":   "#06b6d4",
  "Separação":               "var(--acc2)",
  "Finalizado":              "var(--ok)",
  "Entregue":                "var(--acc)",
  "Cancelado":               "var(--err)",
};

type TipoRelatorio = "gerencial" | "inadimplencia" | "faturamento" | "completo" | null;

// ── helpers de estilo PDF ────────────────────────────────────────────────────
const AZUL  = "#1a3d6b";
const AZUL2 = "#2d5fa6";
const S = {
  page:    { padding: "0", fontFamily: "'Arial', sans-serif", color: "#111", background: "white", width: "210mm", boxSizing: "border-box" as const },
  body:    { padding: "20px 28px 28px" },
  sec:     { fontSize: "8px", fontWeight: 800, color: AZUL2, textTransform: "uppercase" as const, letterSpacing: "2px", marginBottom: "8px", paddingBottom: "5px", borderBottom: `2px solid ${AZUL2}`, marginTop: "20px", display: "flex", alignItems: "center", gap: "6px" },
  th:      { padding: "8px 10px", fontWeight: 800, fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.5px", color: "white", background: AZUL },
  thAlt:   { padding: "8px 10px", fontWeight: 800, fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.5px", color: "white", background: "#c0392b" },
  thWarn:  { padding: "8px 10px", fontWeight: 800, fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.5px", color: "white", background: "#856404" },
  td:      { padding: "7px 10px", fontSize: "10px", fontWeight: 500, color: "#222", borderBottom: "1px solid #eef0f5" },
  tdB:     { padding: "7px 10px", fontSize: "10px", fontWeight: 700, color: "#222", borderBottom: "1px solid #eef0f5" },
  tdR:     { padding: "7px 10px", fontSize: "10px", fontWeight: 600, color: "#333", fontFamily: "monospace", borderBottom: "1px solid #eef0f5", textAlign: "right" as const },
  tdTotal: { padding: "8px 10px", fontSize: "10px", fontWeight: 800, background: "#eef3ff", borderTop: "2px solid #c8d8f0" },
  kpi:     { background: "#f4f7ff", borderRadius: "10px", padding: "14px 16px", border: `1px solid #dce6f5`, flex: 1 },
  kpiL:    { fontSize: "8px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "1.2px", marginBottom: "6px" },
  kpiV:    { fontSize: "20px", fontWeight: 900, color: AZUL, fontFamily: "monospace", lineHeight: 1 } as React.CSSProperties,
  kpiS:    { fontSize: "9px", color: "#6b7280", marginTop: "5px" },
  insight: { background: "#f0f6ff", borderLeft: `4px solid ${AZUL2}`, padding: "8px 12px", marginBottom: "6px", fontSize: "10px", color: "#1e3a5f", lineHeight: 1.5 },
  badge:   { display: "inline-block", fontSize: "8px", fontWeight: 800, padding: "2px 7px", borderRadius: "4px" },
  footer:  { background: AZUL, padding: "10px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" },
};

function PdfHeader({ titulo, subtitulo, emissao, cor = AZUL }: { titulo: string; subtitulo: string; emissao: string; cor?: string }) {
  return (
    <div style={{ marginBottom: "0" }}>
      {/* Banda superior */}
      <div style={{ background: cor, padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "white", fontSize: "20px", fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1 }}>urbanglass</div>
          <div style={{ color: "rgba(255,255,255,.6)", fontSize: "8px", textTransform: "uppercase", letterSpacing: "2px", marginTop: "3px" }}>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: "8px", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "3px" }}>{subtitulo}</div>
          <div style={{ color: "white", fontSize: "16px", fontWeight: 900, letterSpacing: "-0.3px" }}>{titulo}</div>
          <div style={{ color: "rgba(255,255,255,.7)", fontSize: "9px", marginTop: "3px" }}>Emitido em {emissao}</div>
        </div>
      </div>
      {/* Linha de identificação */}
      <div style={{ background: "#f0f4fb", padding: "6px 28px", borderBottom: "1px solid #dce6f5", display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#6b7280" }}>
        <span>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</span>
        <span style={{ color: "#c0392b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>Documento Confidencial · Uso Interno</span>
      </div>
    </div>
  );
}

function PdfFooter({ emissao, pagina = "1" }: { emissao: string; pagina?: string }) {
  return (
    <div style={S.footer}>
      <div style={{ color: "rgba(255,255,255,.7)", fontSize: "8px" }}>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05</div>
      <div style={{ color: "rgba(255,255,255,.5)", fontSize: "8px" }}>Emitido em {emissao} · Pág. {pagina}</div>
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
  const [qualResumo, setQualResumo]       = useState<{ ncsAbertas: number; ncsCriticas: number; m2PerdidoMes: number; valorPerdidoMes: number; retrabalhosAbertos: number } | null>(null);
  const [qualIndicadores, setQualIndicadores] = useState<IndicadorQualidadeMensal[]>([]);

  const hoje     = new Date().toISOString().split("T")[0];
  const dtEmissao = new Date().toLocaleDateString("pt-BR");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, fat, peds, lancs, otimHist, estq, orcs, invRes, qualRes, qualInd] = await Promise.all([
      getFinanceiroClientes(),
      getFaturamentoMensal(2026),
      getPedidos(),
      getLancamentos(),
      getAllHistoricoOtimizador(),
      getEstoque(),
      getOrcamentos(),
      supabase.from("investimentos").select("*").order("data", { ascending: true }),
      getResumoQualidade(),
      getIndicadoresMensais(),
    ]);
    setFinanceiro(fin); setFatMensal(fat); setPedidos(peds);
    setLancamentos(lancs as Lancamento[]);
    setOtimHistorico(otimHist as any);
    setEstoque(estq);
    setOrcamentos(orcs as any[]);
    setInvestimentos((invRes.data ?? []) as any[]);
    setQualResumo(qualRes);
    setQualIndicadores(qualInd);
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

  // ── Tempo por etapa de produção ──────────────────────────────────────────
  const statsEtapas = useMemo(() => calcStatsEtapas(pedidos), [pedidos]);

  const leadTimeMedio = useMemo(() => {
    const lts = pedidos
      .map(p => calcLeadTime(p))
      .filter((v): v is number => v !== null);
    if (!lts.length) return null;
    return lts.reduce((a, b) => a + b, 0) / lts.length;
  }, [pedidos]);

  const maxEtapaMs = useMemo(
    () => Math.max(...ETAPAS_FLUXO.map(e => statsEtapas[e]?.media ?? 0), 1),
    [statsEtapas]
  );

  // ── Pipeline atual: pedidos ativos ordenados por tempo na etapa atual ──────
  const pedidosAtivos = useMemo(() => pedidos
    .filter(p => !['Entregue', 'Cancelado'].includes(p.status))
    .map(p => {
      const history = (p.status_history ?? []) as { status: string; desde: string }[];
      const last = history[history.length - 1];
      const msThere = last ? Date.now() - new Date(last.desde).getTime() : 0;
      return { ...p, msThere };
    })
    .sort((a, b) => b.msThere - a.msThere),
  [pedidos]);

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
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>PDF:</span>
            {([
              { tipo: "gerencial" as TipoRelatorio,     label: "Gerencial",   cor: "#2d5fa6" },
              { tipo: "inadimplencia" as TipoRelatorio, label: "Inadimpl.",   cor: "#c0392b" },
              { tipo: "faturamento" as TipoRelatorio,   label: "Faturamento", cor: "#16a085" },
              { tipo: "completo" as TipoRelatorio,      label: "Completo",    cor: "#6b21a8" },
            ] as const).map(r => (
              <button key={r.tipo} onClick={() => imprimirRelatorio(r.tipo)}
                style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", padding: "4px 10px", borderRadius: "5px", cursor: "pointer", fontWeight: 600, background: r.cor + "18", border: `1px solid ${r.cor}44`, color: r.cor }}>
                ⎙ {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="con no-print">

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
              <div style={{ display: "flex", gap: "3px", background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "4px", marginBottom: "16px" }}>
                {TABS.map((t, i) => (
                  <div key={i} onClick={() => setTabIdx(i)} style={{ flex: 1, padding: "7px 6px", borderRadius: "7px", cursor: "pointer", fontSize: "11px", textAlign: "center", fontFamily: "'DM Mono', monospace", fontWeight: tabIdx === i ? 700 : 400, color: tabIdx === i ? "var(--t1)" : "var(--t3)", background: tabIdx === i ? "var(--surf)" : "transparent", boxShadow: tabIdx === i ? "0 1px 4px rgba(0,0,0,.3)" : "none", transition: "all 0.15s", whiteSpace: "nowrap" }}>
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
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
                    {[
                      { label: "Clientes Ativos",     value: String(financeiro.length),     color: "var(--acc2)", sub: "com faturamento no período" },
                      { label: "Clientes em Débito",  value: String(devedores.length),      color: devedores.length > 0 ? "var(--warn)" : "var(--ok)", sub: formatBRL(totalDevedores) + " em aberto" },
                      { label: "Concentração Top 3",  value: (() => {
                        const top3 = clientesOrdenados.slice(0,3).reduce((a,f) => a + Number(f.faturado), 0);
                        return fatTotal > 0 ? (top3 / fatTotal * 100).toFixed(1) + "%" : "—";
                      })(), color: "var(--acc4)", sub: "do faturamento total" },
                    ].map(card => (
                      <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "16px 18px" }}>
                        <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, marginBottom: "6px" }}>{card.label}</div>
                        <div style={{ fontSize: "22px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", marginBottom: "4px" }}>{card.value}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="card">
                    <div className="ct">Ranking por Faturamento <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{financeiro.length} clientes</span></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {clientesOrdenados.map((f, i) => {
                        const pctFat = fatTotal > 0 ? Number(f.faturado) / fatTotal * 100 : 0;
                        const pctRec = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                        const emAberto = Number(f.a_receber) > 0;
                        const riscoCor = emAberto ? (pctRec < 50 ? "var(--err)" : "var(--warn)") : "var(--ok)";
                        return (
                          <div key={f.cliente_id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 130px 80px 80px 60px", gap: "10px", alignItems: "center", padding: "10px 12px", background: i % 2 === 0 ? "var(--surf2)" : "transparent", borderRadius: "8px" }}>
                            <div style={{ fontSize: "12px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{i + 1}°</div>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>{f.cliente_nome}</div>
                              <div style={{ height: "3px", borderRadius: "2px", background: "var(--surf3)", marginTop: "4px", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pctRec}%`, background: riscoCor, borderRadius: "2px", transition: "width .4s" }} />
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(f.faturado)}</div>
                              <div style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{pctFat.toFixed(1)}% do total</div>
                            </div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--ok)", textAlign: "right" }}>{pctRec.toFixed(0)}% rec.</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: emAberto ? "var(--warn)" : "var(--t3)", textAlign: "right", fontWeight: emAberto ? 700 : 400 }}>
                              {emAberto ? formatBRL(f.a_receber) : "—"}
                            </div>
                            <div style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: "var(--t2)", textAlign: "center" }}>{f.total_pedidos} ped.</div>
                          </div>
                        );
                      })}
                    </div>
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
              {/* ══ TAB 4: EFICIÊNCIA ══ */}
              {tabIdx === 4 && (
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

              {/* ══ TAB 3: PRODUÇÃO ══ */}
              {tabIdx === 3 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                  {/* KPIs */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
                    {[
                      {
                        label: "Lead Time Médio",
                        value: leadTimeMedio ? formatDuracao(leadTimeMedio) : "—",
                        color: "var(--acc)",
                        sub: leadTimeMedio ? "do início ao Finalizado" : "Sem pedidos finalizados ainda",
                      },
                      {
                        label: "Etapa mais lenta",
                        value: (() => {
                          const e = ETAPAS_FLUXO.find(et => statsEtapas[et]?.media === maxEtapaMs);
                          return e ? e.replace('Em Produção – ', '') : "—";
                        })(),
                        color: "var(--err)",
                        sub: maxEtapaMs > 1 ? `média ${formatDuracao(maxEtapaMs)}` : "Sem dados históricos",
                      },
                      {
                        label: "Ativos no pipeline",
                        value: String(pedidosAtivos.length),
                        color: "var(--acc2)",
                        sub: `${pedidosAtivos.filter(p => p.msThere > 86400000 * 3).length} há mais de 3 dias na etapa`,
                      },
                      {
                        label: "Com histórico",
                        value: String(pedidos.filter(p => (p.status_history?.length ?? 0) >= 2).length),
                        color: "var(--acc4)",
                        sub: `de ${pedidos.length} pedidos totais`,
                      },
                    ].map(card => (
                      <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "16px 18px" }}>
                        <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, marginBottom: "6px" }}>{card.label}</div>
                        <div style={{ fontSize: "22px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginBottom: "4px" }}>{card.value}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

                    {/* Pipeline atual: pedidos ativos + tempo na etapa */}
                    <div className="card">
                      <div className="ct">
                        Pipeline Atual
                        <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>tempo na etapa atual · ordenado pelo mais atrasado</span>
                      </div>
                      {pedidosAtivos.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px", color: "var(--t3)", fontSize: "12px" }}>Nenhum pedido ativo no momento.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 80px", gap: "8px", padding: "5px 10px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", fontFamily: "'DM Mono', monospace", borderBottom: "1px solid var(--b1)" }}>
                            <div>Pedido</div><div>Etapa atual</div><div style={{ textAlign: "right" }}>Tempo na etapa</div><div style={{ textAlign: "right" }}>m²</div>
                          </div>
                          {pedidosAtivos.slice(0, 15).map((p, i) => {
                            const cor = STATUS_COR[p.status] ?? "var(--t3)";
                            const alerta = p.msThere > 86400000 * 3;
                            return (
                              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 80px", gap: "8px", padding: "8px 10px", borderRadius: "6px", background: i % 2 === 0 ? "var(--surf2)" : "transparent", alignItems: "center" }}>
                                <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--acc)", fontWeight: 700 }}>{p.id}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: cor, flexShrink: 0 }} />
                                  <span style={{ fontSize: "11px", color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.status}</span>
                                </div>
                                <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: alerta ? "var(--err)" : "var(--t2)", fontWeight: alerta ? 700 : 400, textAlign: "right" }}>
                                  {p.msThere > 0 ? formatDuracao(p.msThere) : "—"}
                                </div>
                                <div style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: "var(--t3)", textAlign: "right" }}>{Number(p.m2_total).toFixed(1)}</div>
                              </div>
                            );
                          })}
                          {pedidosAtivos.length > 15 && (
                            <div style={{ textAlign: "center", padding: "8px", fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                              + {pedidosAtivos.length - 15} mais
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tempo médio histórico por etapa */}
                    <div className="card">
                      <div className="ct">
                        Tempo Médio por Etapa
                        <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>histórico de pedidos finalizados</span>
                      </div>
                      {ETAPAS_FLUXO.filter(e => statsEtapas[e]).length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px", color: "var(--t3)", fontSize: "12px" }}>
                          Dados aparecem conforme pedidos são finalizados com histórico de status.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {ETAPAS_FLUXO.filter(e => statsEtapas[e]).map(etapa => {
                            const s = statsEtapas[etapa];
                            const pct = maxEtapaMs > 0 ? (s.media / maxEtapaMs) * 100 : 0;
                            const pctMed = maxEtapaMs > 0 ? (s.mediana / maxEtapaMs) * 100 : 0;
                            const isSlowest = s.media === maxEtapaMs;
                            return (
                              <div key={etapa}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                  <span style={{ fontSize: "11px", color: isSlowest ? "var(--err)" : "var(--t1)", fontWeight: isSlowest ? 700 : 400 }}>{etapa}</span>
                                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                    <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>med. {formatDuracao(s.mediana)}</span>
                                    <span style={{ fontSize: "12px", fontWeight: 700, color: isSlowest ? "var(--err)" : "var(--acc)", fontFamily: "'DM Mono', monospace" }}>{formatDuracao(s.media)}</span>
                                    <span style={{ fontSize: "9px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{s.count}×</span>
                                  </div>
                                </div>
                                <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surf2)", overflow: "hidden" }}>
                                  <div style={{ position: "absolute", height: "100%", width: `${pct}%`, background: isSlowest ? "rgba(244,63,94,.35)" : "rgba(61,255,160,.3)", borderRadius: "3px" }} />
                                  <div style={{ position: "absolute", height: "100%", width: `${pctMed}%`, background: isSlowest ? "rgba(244,63,94,.8)" : "rgba(61,255,160,.75)", borderRadius: "3px" }} />
                                </div>
                              </div>
                            );
                          })}
                          <div style={{ display: "flex", gap: "14px", marginTop: "4px" }}>
                            {[{ color: "rgba(61,255,160,.75)", label: "Mediana" }, { color: "rgba(61,255,160,.3)", label: "Média" }].map(l => (
                              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--t3)" }}>
                                <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: l.color }} />{l.label}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tabela de detalhamento */}
                  {ETAPAS_FLUXO.filter(e => statsEtapas[e]).length > 0 && (
                    <div className="card">
                      <div className="ct">Estatísticas Detalhadas por Etapa</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 100px 50px", gap: "8px", padding: "6px 12px", fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", fontFamily: "'DM Mono', monospace", borderBottom: "1px solid var(--b1)" }}>
                        <div>Etapa</div><div style={{ textAlign: "right" }}>Média</div><div style={{ textAlign: "right" }}>Mediana</div><div style={{ textAlign: "right" }}>Mínimo</div><div style={{ textAlign: "right" }}>Máximo</div><div style={{ textAlign: "right" }}>N</div>
                      </div>
                      {ETAPAS_FLUXO.filter(e => statsEtapas[e]).map((etapa, i) => {
                        const s = statsEtapas[etapa];
                        const isSlowest = s.media === maxEtapaMs;
                        return (
                          <div key={etapa} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 100px 50px", gap: "8px", padding: "8px 12px", borderRadius: "6px", background: i % 2 === 0 ? "var(--surf2)" : "transparent" }}>
                            <div style={{ fontSize: "12px", color: isSlowest ? "var(--err)" : "var(--t1)", fontWeight: isSlowest ? 700 : 400 }}>{etapa}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: isSlowest ? "var(--err)" : "var(--acc)", fontWeight: 700, textAlign: "right" }}>{formatDuracao(s.media)}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t2)", textAlign: "right" }}>{formatDuracao(s.mediana)}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--ok)", textAlign: "right" }}>{formatDuracao(s.min)}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--err)", textAlign: "right" }}>{formatDuracao(s.max)}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "var(--t3)", textAlign: "right" }}>{s.count}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══ TAB 5: FLUXO DE CAIXA ══ */}
              {tabIdx === 5 && (
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

              {/* ══ TAB 6: ESTOQUE ══ */}
              {tabIdx === 6 && (
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

              {/* ══ TAB 8: FECHAMENTO ══ */}
              {tabIdx === 8 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                  {/* Seletor de mês */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>Mês de fechamento:</span>
                    <select name="mes_fecho_sel" className="fc" style={{ minWidth: "200px" }} value={mesFechoSel} onChange={e => setMesFechoSel(e.target.value)}>
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

              {/* ══ TAB 7: ORÇAMENTOS ══ */}
              {tabIdx === 7 && (
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

              {/* ══ TAB 9: QUALIDADE ══ */}
              {tabIdx === 9 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* KPIs */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px" }}>
                    {[
                      { label: "NCs em Aberto",       value: String(qualResumo?.ncsAbertas ?? 0),                              color: (qualResumo?.ncsAbertas ?? 0) > 0 ? "var(--warn)" : "var(--ok)", sub: "aguardando resolução" },
                      { label: "NCs Críticas",         value: String(qualResumo?.ncsCriticas ?? 0),                             color: (qualResumo?.ncsCriticas ?? 0) > 0 ? "var(--err)" : "var(--ok)",  sub: "prioridade máxima" },
                      { label: "m² Perdido (mês)",     value: (qualResumo?.m2PerdidoMes ?? 0).toFixed(2) + " m²",              color: (qualResumo?.m2PerdidoMes ?? 0) > 0 ? "var(--warn)" : "var(--t3)", sub: "quebras no mês atual" },
                      { label: "Perda Financeira (mês)", value: formatBRL(qualResumo?.valorPerdidoMes ?? 0),                    color: (qualResumo?.valorPerdidoMes ?? 0) > 0 ? "var(--err)" : "var(--t3)", sub: "custo de quebras" },
                      { label: "Retrabalhos Ativos",   value: String(qualResumo?.retrabalhosAbertos ?? 0),                      color: (qualResumo?.retrabalhosAbertos ?? 0) > 0 ? "var(--warn)" : "var(--ok)", sub: "em execução" },
                    ].map(card => (
                      <div key={card.label} style={{ background: "var(--surf)", border: "1px solid var(--b1)", borderRadius: "12px", padding: "18px 20px" }}>
                        <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>{card.label}</div>
                        <div style={{ fontSize: "22px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginBottom: "6px" }}>{card.value}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Histórico mensal */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div className="card">
                      <div className="ct">NCs por Mês</div>
                      {qualIndicadores.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "30px", color: "var(--t3)", fontSize: "12px" }}>Nenhum dado disponível.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {qualIndicadores.map((ind, i) => {
                            const maxNcs = Math.max(...qualIndicadores.map(x => Number(x.total_ncs ?? 0)), 1);
                            const pct = (Number(ind.total_ncs ?? 0) / maxNcs) * 100;
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span style={{ fontSize: "11px", color: "var(--t3)", minWidth: "40px", fontFamily: "'DM Mono', monospace" }}>{ind.mes?.slice(5) ?? ""}</span>
                                <div style={{ flex: 1, height: "14px", borderRadius: "4px", background: "var(--surf2)", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: "rgba(239,68,68,.6)", borderRadius: "4px", transition: "width .3s" }} />
                                </div>
                                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace", minWidth: "24px", textAlign: "right" }}>{ind.total_ncs ?? 0}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="card">
                      <div className="ct">Perda Financeira por Mês</div>
                      {qualIndicadores.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "30px", color: "var(--t3)", fontSize: "12px" }}>Nenhum dado disponível.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {qualIndicadores.map((ind, i) => {
                            const maxVal = Math.max(...qualIndicadores.map(x => Number(x.valor_perda_total ?? 0)), 1);
                            const pct = (Number(ind.valor_perda_total ?? 0) / maxVal) * 100;
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span style={{ fontSize: "11px", color: "var(--t3)", minWidth: "40px", fontFamily: "'DM Mono', monospace" }}>{ind.mes?.slice(5) ?? ""}</span>
                                <div style={{ flex: 1, height: "14px", borderRadius: "4px", background: "var(--surf2)", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: "rgba(249,115,22,.6)", borderRadius: "4px", transition: "width .3s" }} />
                                </div>
                                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace", minWidth: "80px", textAlign: "right" }}>{formatBRL(Number(ind.valor_perda_total ?? 0))}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tabela detalhada */}
                  <div className="card">
                    <div className="ct">Histórico Mensal de Qualidade</div>
                    {qualIndicadores.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--t3)", fontSize: "12px" }}>Nenhum dado disponível. Execute a migração SQL e registre NCs para ver os indicadores.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr>
                            {["Mês","Total NCs","Resolvidas","Críticas","m² Perdido","Custo Retrab.","Retrabalhos","Perda Total"].map((h, i) => (
                              <th key={i} style={{ padding: "8px 10px", borderBottom: "1px solid var(--b1)", textAlign: i === 0 ? "left" : "right", color: "var(--t3)", fontWeight: 600, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {qualIndicadores.map((ind, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--surf2)" }}>
                              <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{ind.mes}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{ind.total_ncs ?? 0}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--ok)" }}>{ind.resolvidas ?? 0}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: Number(ind.criticas ?? 0) > 0 ? "var(--err)" : "var(--t3)" }}>{ind.criticas ?? 0}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{Number(ind.m2_perdido ?? 0).toFixed(2)}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{formatBRL(Number(ind.custo_retrabalho ?? 0))}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{ind.total_retrabalhos ?? 0}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: Number(ind.valor_perda_total ?? 0) > 0 ? "var(--err)" : "var(--t3)", fontWeight: 600 }}>{formatBRL(Number(ind.valor_perda_total ?? 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div style={{ padding: "12px 16px", background: "var(--surf2)", borderRadius: "10px", border: "1px solid var(--b1)", fontSize: "12px", color: "var(--t3)" }}>
                    Para detalhes completos, acesse o módulo <strong style={{ color: "var(--acc)" }}>Qualidade</strong> na barra lateral: cadastro de NCs, controle de quebras e retrabalhos.
                  </div>
                </div>
              )}

            </>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            PDF: RELATÓRIO GERENCIAL
        ════════════════════════════════════════════════════════════════════ */}
        {(reporteAtivo === "gerencial" || reporteAtivo === "completo") && (
          <div className="print-area" style={{ ...S.page, ...(reporteAtivo === "completo" ? { pageBreakAfter: "always" as const, breakAfter: "page" as const } : {}) }}>
            <PdfHeader titulo="Relatório Gerencial" subtitulo="Sumário Executivo 2026" emissao={dtEmissao} />
            <div style={S.body}>

              {/* Destaques para o Diretor */}
              {(() => {
                const taxaRec   = fatTotal > 0 ? recTotal / fatTotal * 100 : 0;
                const pedAtivos = pedidos.filter(p => !["Entregue", "Cancelado"].includes(p.status));
                const valAtivos = pedAtivos.reduce((a, p) => a + Number(p.valor_total), 0);
                const inadRate  = financeiro.length > 0 ? (devedores.length / financeiro.length * 100) : 0;
                const mesesAti  = meses.filter(m => m.faturado > 0);
                const fatMed    = mesesAti.length > 0 ? mesesAti.reduce((a, m) => a + m.faturado, 0) / mesesAti.length : 0;
                const insights = [
                  fatTotal > 0 ? `Faturamento acumulado de ${formatBRL(fatTotal)} em ${mesesComDados.length} ${mesesComDados.length !== 1 ? "meses ativos" : "mês ativo"} (média ${formatBRL(fatMed)}/mês). Melhor mês: ${melhorMes.mesCompleto} — ${formatBRL(melhorMes.faturado)}.` : null,
                  fatTotal > 0 ? `Taxa de recebimento: ${taxaRec.toFixed(1)}% — ${taxaRec >= 90 ? "situação saudável (acima de 90%)." : taxaRec >= 70 ? "atenção: abaixo da meta de 90%. Reforçar cobrança." : "alerta crítico: recebimento comprometido."} Saldo a receber: ${formatBRL(aReceber)}.` : null,
                  devedores.length > 0 ? `${devedores.length} cliente${devedores.length > 1 ? "s" : ""} com valores em aberto (${inadRate.toFixed(0)}% da base ativa). Exposição total: ${formatBRL(totalDevedores)}.${inadimplentes.length > 0 ? ` ${inadimplentes.length} sem nenhum pagamento — prioridade de cobrança.` : ""}` : "Carteira saudável — nenhum cliente com valores em aberto no período.",
                  pedidos.length > 0 ? `Pipeline: ${pedAtivos.length} pedido${pedAtivos.length !== 1 ? "s" : ""} em produção${valAtivos > 0 ? ` (${formatBRL(valAtivos)} em valor)` : ""}. Ticket médio: ${formatBRL(ticketMedio)}. Volume processado: ${m2Total.toFixed(1)} m².` : null,
                ].filter(Boolean);
                return insights.length > 0 ? (
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ ...S.sec, marginTop: "0" }}>Destaques para o Diretor</div>
                    {insights.map((t, i) => (
                      <div key={i} style={S.insight}><strong style={{ color: AZUL2, marginRight: "5px" }}>◆</strong>{t}</div>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* KPIs */}
              <div style={S.sec}>Indicadores do Período</div>
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                {[
                  { label: "Faturamento Total",  value: formatBRL(fatTotal),             sub: `${mesesComDados.length} meses com receita`,            alert: false },
                  { label: "Total Recebido",      value: formatBRL(recTotal),             sub: `${fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) : 0}% do faturado`, alert: false },
                  { label: "A Receber",           value: formatBRL(aReceber),             sub: `${devedores.length} cliente(s) em aberto`,             alert: aReceber > 0 },
                  { label: "Pedidos Realizados",  value: String(pedidos.length),          sub: `Ticket médio ${formatBRL(ticketMedio)}`,               alert: false },
                  { label: "m² Processado",       value: m2Total.toFixed(1) + " m²",     sub: `${pedidos.filter(p => p.status === "Entregue").length} pedidos entregues`, alert: false },
                ].map(k => (
                  <div key={k.label} style={{ ...S.kpi, ...(k.alert ? { background: "#fff5f0", border: "1px solid #f5c6cb" } : {}) }}>
                    <div style={S.kpiL}>{k.label}</div>
                    <div style={{ ...S.kpiV, color: k.alert ? "#c0392b" : AZUL }}>{k.value}</div>
                    <div style={S.kpiS}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Faturamento Mensal */}
              <div style={S.sec}>Evolução de Faturamento Mensal</div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                <thead>
                  <tr>
                    {["Mês","Faturado","Recebido","A Receber","% Recebido","Variação","Status"].map((h, i) => (
                      <th key={i} style={{ ...S.th, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m, i) => {
                    const pct       = m.faturado > 0 ? (m.recebido / m.faturado * 100) : 0;
                    const ant       = i > 0 ? meses[i - 1].faturado : 0;
                    const varM      = ant > 0 ? ((m.faturado - ant) / ant * 100) : null;
                    const status    = m.faturado === 0 ? "—" : pct >= 100 ? "Quitado" : pct > 0 ? "Parcial" : "Pendente";
                    const sCor      = pct >= 100 ? "#155724" : pct > 0 ? "#856404" : m.faturado === 0 ? "#888" : "#721c24";
                    const sBg       = pct >= 100 ? "#d4edda" : pct > 0 ? "#fff3cd" : m.faturado === 0 ? "#f0f0f0" : "#f8d7da";
                    const isBest    = m.mesCompleto === melhorMes.mesCompleto && m.faturado > 0;
                    return (
                      <tr key={i} style={{ background: isBest ? "#eef6ff" : i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                        <td style={{ ...S.tdB }}>{m.mesCompleto}{isBest ? "  ★" : ""}</td>
                        <td style={{ ...S.tdR, color: m.faturado > 0 ? AZUL2 : "#bbb" }}>{m.faturado > 0 ? formatBRL(m.faturado) : "—"}</td>
                        <td style={{ ...S.tdR, color: m.recebido > 0 ? "#155724" : "#bbb" }}>{m.recebido > 0 ? formatBRL(m.recebido) : "—"}</td>
                        <td style={{ ...S.tdR, color: (m.faturado - m.recebido) > 0 ? "#856404" : "#bbb" }}>{m.faturado > m.recebido ? formatBRL(m.faturado - m.recebido) : "—"}</td>
                        <td style={{ ...S.tdR }}>{m.faturado > 0 ? pct.toFixed(1) + "%" : "—"}</td>
                        <td style={{ ...S.tdR, color: varM === null ? "#bbb" : varM >= 0 ? "#155724" : "#721c24" }}>
                          {varM !== null && m.faturado > 0 ? (varM >= 0 ? "↑ +" : "↓ ") + Math.abs(varM).toFixed(1) + "%" : "—"}
                        </td>
                        <td style={{ ...S.td, textAlign: "center" }}>
                          <span style={{ ...S.badge, background: sBg, color: sCor }}>{status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ ...S.tdTotal, color: AZUL, fontWeight: 800 }}>TOTAL ACUMULADO 2026</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: AZUL, fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(fatTotal)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: "#155724", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(recTotal)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: "#856404", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(aReceber)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—"}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right" }}>—</td>
                    <td style={S.tdTotal} />
                  </tr>
                </tbody>
              </table>

              {/* Top Clientes */}
              {(() => {
                const top3Fat = clientesOrdenados.slice(0, 3).reduce((a, f) => a + Number(f.faturado), 0);
                const conc    = fatTotal > 0 ? top3Fat / fatTotal * 100 : 0;
                return (
                  <>
                    <div style={S.sec}>Ranking de Clientes por Faturamento</div>
                    {conc > 60 && (
                      <div style={{ ...S.insight, background: "#fff8e1", borderLeftColor: "#856404", marginBottom: "10px" }}>
                        <strong style={{ color: "#856404" }}>⚠ Alerta de Concentração:</strong> Os 3 maiores clientes representam {conc.toFixed(1)}% do faturamento — risco de dependência elevado.
                      </div>
                    )}
                  </>
                );
              })()}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                <thead>
                  <tr>
                    {["#","Cliente","Cidade","Faturado","% Receita","Recebido","A Receber","% Rec.","Risco"].map((h, i) => (
                      <th key={i} style={{ ...S.th, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientesOrdenados.slice(0, 12).map((f, i) => {
                    const pctFat = fatTotal > 0 ? Number(f.faturado) / fatTotal * 100 : 0;
                    const pctRec = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                    const risco  = Number(f.faturado) > 0 ? Number(f.a_receber) / Number(f.faturado) : 0;
                    const rLabel = risco === 0 ? "Quitado" : risco < 0.5 ? "Parcial" : "Alto";
                    const rCor   = risco === 0 ? "#155724" : risco < 0.5 ? "#856404" : "#721c24";
                    const rBg    = risco === 0 ? "#d4edda" : risco < 0.5 ? "#fff3cd" : "#f8d7da";
                    return (
                      <tr key={f.cliente_id} style={{ background: i < 3 ? "#f4f8ff" : i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                        <td style={{ ...S.td, color: i < 3 ? AZUL2 : "#888", textAlign: "center", fontWeight: i < 3 ? 800 : 400 }}>{i + 1}°</td>
                        <td style={{ ...S.tdB, color: i < 3 ? AZUL : "#222" }}>{f.cliente_nome}</td>
                        <td style={{ ...S.td, color: "#555" }}>{(f as any).cidade || "—"}</td>
                        <td style={{ ...S.tdR, color: AZUL2 }}>{formatBRL(f.faturado)}</td>
                        <td style={{ ...S.tdR, color: i < 3 ? AZUL2 : "#555", fontWeight: i < 3 ? 700 : 400 }}>{pctFat.toFixed(1)}%</td>
                        <td style={{ ...S.tdR, color: "#155724" }}>{formatBRL(f.recebido)}</td>
                        <td style={{ ...S.tdR, color: Number(f.a_receber) > 0 ? "#856404" : "#aaa" }}>{Number(f.a_receber) > 0 ? formatBRL(f.a_receber) : "—"}</td>
                        <td style={{ ...S.tdR }}>{pctRec.toFixed(1)}%</td>
                        <td style={{ ...S.td, textAlign: "center" }}>
                          <span style={{ ...S.badge, background: rBg, color: rCor }}>{rLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pipeline */}
              {(() => {
                const ativos  = pedidos.filter(p => !["Entregue", "Cancelado"].includes(p.status));
                const valAtiv = ativos.reduce((a, p) => a + Number(p.valor_total), 0);
                return (
                  <>
                    <div style={S.sec}>Pipeline de Produção · Status Atual</div>
                    {valAtiv > 0 && (
                      <div style={{ ...S.insight, marginBottom: "10px" }}>
                        <strong style={{ color: AZUL2 }}>◆</strong> {ativos.length} pedido{ativos.length !== 1 ? "s" : ""} em andamento — valor total em processamento: <strong>{formatBRL(valAtiv)}</strong>
                      </div>
                    )}
                  </>
                );
              })()}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Status","Quantidade","% Total","Valor Total","Ticket Médio"].map((h, i) => (
                      <th key={i} style={{ ...S.th, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statusCount.map(([status, count], i) => {
                    const grupo  = pedidos.filter(p => p.status === status);
                    const vTotal = grupo.reduce((a, p) => a + Number(p.valor_total), 0);
                    const vMed   = count > 0 ? vTotal / count : 0;
                    const isAtiv = !["Entregue", "Cancelado"].includes(status);
                    return (
                      <tr key={status} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                        <td style={{ ...S.tdB, color: status === "Entregue" ? "#155724" : status === "Cancelado" ? "#888" : AZUL2 }}>
                          {isAtiv && <span style={{ fontSize: "8px" }}>● </span>}{status}
                        </td>
                        <td style={S.tdR}>{count}</td>
                        <td style={S.tdR}>{(count / pedidos.length * 100).toFixed(1)}%</td>
                        <td style={{ ...S.tdR, color: AZUL2 }}>{formatBRL(vTotal)}</td>
                        <td style={{ ...S.tdR, color: "#555" }}>{formatBRL(vMed)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

            </div>
            <PdfFooter emissao={dtEmissao} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            PDF: RELATÓRIO DE INADIMPLÊNCIA
        ════════════════════════════════════════════════════════════════════ */}
        {(reporteAtivo === "inadimplencia" || reporteAtivo === "completo") && (
          <div className="print-area" style={{ ...S.page, ...(reporteAtivo === "completo" ? { pageBreakAfter: "always" as const, breakAfter: "page" as const } : {}) }}>
            <PdfHeader titulo="Relatório de Inadimplência" subtitulo="Análise de Crédito e Risco" emissao={dtEmissao} cor="#7b1818" />
            <div style={S.body}>

              {/* Diagnóstico Executivo */}
              {(() => {
                const taxaInad = financeiro.length > 0 ? (devedores.length / financeiro.length * 100) : 0;
                const taxaExp  = fatTotal > 0 ? (totalDevedores / fatTotal * 100) : 0;
                const piorDev  = devedores.length > 0 ? devedores[0] : null;
                const insights = [
                  devedores.length > 0
                    ? `${devedores.length} cliente${devedores.length > 1 ? "s" : ""} com saldo devedor (${taxaInad.toFixed(0)}% da base ativa). Exposição total: ${formatBRL(totalDevedores)}${taxaExp > 0 ? ` — ${taxaExp.toFixed(1)}% do faturamento` : ""}.`
                    : "Carteira saudável — nenhum cliente com saldo devedor no período.",
                  inadimplentes.length > 0
                    ? `${inadimplentes.length} cliente${inadimplentes.length > 1 ? "s" : ""} sem nenhum pagamento (inadimplência total): ${formatBRL(inadimplentes.reduce((a, f) => a + Number(f.a_receber), 0))} em risco máximo. Ação imediata recomendada.`
                    : null,
                  parcelasVencidas.length > 0
                    ? `${parcelasVencidas.length} parcela${parcelasVencidas.length > 1 ? "s" : ""} vencidas e não pagas, totalizando ${formatBRL(totalVencido)}${fatTotal > 0 ? ` (${(totalVencido/fatTotal*100).toFixed(1)}% do faturamento)` : ""}.`
                    : "Nenhuma parcela vencida identificada.",
                  piorDev ? `Maior devedor: ${piorDev.cliente_nome} — ${formatBRL(piorDev.a_receber)} em aberto.` : null,
                ].filter(Boolean);
                return (
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ ...S.sec, marginTop: "0", borderBottomColor: "#c0392b", color: "#c0392b" }}>Diagnóstico de Crédito</div>
                    {insights.map((t, i) => (
                      <div key={i} style={{ ...S.insight, background: "#fff5f5", borderLeftColor: "#c0392b" }}>
                        <strong style={{ color: "#c0392b", marginRight: "5px" }}>◆</strong>{t}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* KPIs */}
              <div style={{ ...S.sec, borderBottomColor: "#c0392b", color: "#c0392b" }}>Resumo da Situação de Crédito</div>
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                {[
                  { label: "Total em Aberto",       value: formatBRL(totalDevedores),                                                              sub: `${devedores.length} clientes`,    alert: totalDevedores > 0 },
                  { label: "Sem Nenhum Pagamento",   value: String(inadimplentes.length),                                                          sub: formatBRL(inadimplentes.reduce((a,f)=>a+Number(f.a_receber),0)),  alert: inadimplentes.length > 0 },
                  { label: "Pagamento Parcial",      value: String(devedores.filter(f => Number(f.recebido) > 0).length),                          sub: "abaixo de 100%",                  alert: false },
                  { label: "Parcelas Vencidas",      value: String(parcelasVencidas.length),                                                       sub: formatBRL(totalVencido) + " atrasado", alert: parcelasVencidas.length > 0 },
                  { label: "Taxa de Recebimento",    value: fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—",                         sub: `de ${formatBRL(fatTotal)} fat.`, alert: fatTotal > 0 && recTotal/fatTotal < 0.8 },
                ].map(k => (
                  <div key={k.label} style={{ ...S.kpi, ...(k.alert ? { background: "#fff5f5", border: "1px solid #f5c6cb" } : {}) }}>
                    <div style={S.kpiL}>{k.label}</div>
                    <div style={{ ...S.kpiV, color: k.alert ? "#c0392b" : "#155724" }}>{k.value}</div>
                    <div style={S.kpiS}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Aging Analysis */}
              {parcelasVencidas.length > 0 && (() => {
                const calcDias = (venc: string | null) =>
                  venc ? Math.floor((new Date(hoje).getTime() - new Date(venc + "T12:00:00").getTime()) / 86400000) : 0;
                const faixas = [
                  { label: "1 – 30 dias",   cor: "#856404", bg: "#fff3cd", ok: (d: number) => d >= 1  && d <= 30,  niv: "Leve"    },
                  { label: "31 – 60 dias",  cor: "#c0392b", bg: "#fddede", ok: (d: number) => d >= 31 && d <= 60,  niv: "Atenção" },
                  { label: "61 – 90 dias",  cor: "#721c24", bg: "#f8d7da", ok: (d: number) => d >= 61 && d <= 90,  niv: "Grave"   },
                  { label: "Acima de 90d", cor: "#4a0404", bg: "#f5c6cb", ok: (d: number) => d > 90,               niv: "Crítico" },
                ];
                const aging = faixas.map(f => {
                  const itens = parcelasVencidas.filter(l => f.ok(calcDias(l.vencimento)));
                  return { ...f, count: itens.length, valor: itens.reduce((a, l) => a + Number(l.valor), 0) };
                });
                return (
                  <>
                    <div style={{ ...S.sec, borderBottomColor: "#c0392b", color: "#c0392b" }}>Análise de Aging — Parcelas Vencidas por Faixa de Atraso</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                      <thead>
                        <tr>
                          {["Faixa de Atraso","Nº Parcelas","Valor Total","% do Vencido","Nível de Risco"].map((h, i) => (
                            <th key={i} style={{ ...S.thAlt, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {aging.map((a, i) => (
                          <tr key={i} style={{ background: a.count > 0 ? a.bg + "55" : "#fff" }}>
                            <td style={{ ...S.tdB, color: a.cor }}>{a.label}</td>
                            <td style={{ ...S.tdR, color: a.count > 0 ? a.cor : "#aaa" }}>{a.count > 0 ? a.count : "—"}</td>
                            <td style={{ ...S.tdR, color: a.count > 0 ? a.cor : "#aaa", fontWeight: a.count > 0 ? 700 : 400 }}>{a.count > 0 ? formatBRL(a.valor) : "—"}</td>
                            <td style={{ ...S.tdR, color: a.count > 0 ? a.cor : "#aaa" }}>{a.count > 0 && totalVencido > 0 ? (a.valor / totalVencido * 100).toFixed(1) + "%" : "—"}</td>
                            <td style={{ ...S.td, textAlign: "center" }}>
                              {a.count > 0 && <span style={{ ...S.badge, background: a.bg, color: a.cor }}>{a.niv}</span>}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ ...S.tdTotal, color: "#c0392b", fontWeight: 800 }}>TOTAL VENCIDO</td>
                          <td style={{ ...S.tdTotal, textAlign: "right", color: "#c0392b", fontWeight: 800, fontFamily: "monospace" }}>{parcelasVencidas.length}</td>
                          <td style={{ ...S.tdTotal, textAlign: "right", color: "#c0392b", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(totalVencido)}</td>
                          <td style={{ ...S.tdTotal, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>100%</td>
                          <td style={S.tdTotal} />
                        </tr>
                      </tbody>
                    </table>
                  </>
                );
              })()}

              {/* Alto Risco */}
              {inadimplentes.length > 0 && (
                <>
                  <div style={{ ...S.sec, borderBottomColor: "#c0392b", color: "#c0392b" }}>⚠ Alto Risco — Clientes Sem Nenhum Pagamento</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                    <thead>
                      <tr>{["#","Cliente","Cidade","Faturado","Em Aberto","% do Devedor","Pedidos"].map((h,i) => <th key={i} style={{ ...S.thAlt, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {inadimplentes.map((f, i) => {
                        const pctDev = totalDevedores > 0 ? Number(f.a_receber) / totalDevedores * 100 : 0;
                        return (
                          <tr key={f.cliente_id} style={{ background: i % 2 === 0 ? "#fff5f5" : "#fff" }}>
                            <td style={{ ...S.td, color: "#888", textAlign: "center" }}>{i + 1}</td>
                            <td style={{ ...S.tdB, color: "#c0392b" }}>{f.cliente_nome}</td>
                            <td style={{ ...S.td, color: "#555" }}>{(f as any).cidade || "—"}</td>
                            <td style={{ ...S.tdR, color: AZUL2 }}>{formatBRL(f.faturado)}</td>
                            <td style={{ ...S.tdR, color: "#c0392b", fontWeight: 800 }}>{formatBRL(f.a_receber)}</td>
                            <td style={{ ...S.tdR, color: "#c0392b" }}>{pctDev.toFixed(1)}%</td>
                            <td style={{ ...S.tdR }}>{f.total_pedidos}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td colSpan={3} style={{ ...S.tdTotal, color: "#721c24", fontWeight: 800 }}>SUBTOTAL INADIMPLENTES</td>
                        <td style={{ ...S.tdTotal, textAlign: "right", color: AZUL2, fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(inadimplentes.reduce((a,f)=>a+Number(f.faturado),0))}</td>
                        <td style={{ ...S.tdTotal, textAlign: "right", color: "#c0392b", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(inadimplentes.reduce((a,f)=>a+Number(f.a_receber),0))}</td>
                        <td colSpan={2} style={S.tdTotal} />
                      </tr>
                    </tbody>
                  </table>
                </>
              )}

              {/* Médio Risco */}
              {devedores.filter(f => Number(f.recebido) > 0).length > 0 && (
                <>
                  <div style={{ ...S.sec, borderBottomColor: "#856404", color: "#856404" }}>Médio Risco — Clientes com Pagamento Parcial</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                    <thead>
                      <tr>{["#","Cliente","Cidade","Faturado","Recebido","Em Aberto","% Recebido"].map((h,i) => <th key={i} style={{ ...S.thWarn, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {devedores.filter(f => Number(f.recebido) > 0).map((f, i) => {
                        const pctRec = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                        return (
                          <tr key={f.cliente_id} style={{ background: i % 2 === 0 ? "#fffdf0" : "#fff" }}>
                            <td style={{ ...S.td, color: "#888", textAlign: "center" }}>{i + 1}</td>
                            <td style={{ ...S.tdB }}>{f.cliente_nome}</td>
                            <td style={{ ...S.td, color: "#555" }}>{(f as any).cidade || "—"}</td>
                            <td style={{ ...S.tdR, color: AZUL2 }}>{formatBRL(f.faturado)}</td>
                            <td style={{ ...S.tdR, color: "#155724" }}>{formatBRL(f.recebido)}</td>
                            <td style={{ ...S.tdR, color: "#856404", fontWeight: 700 }}>{formatBRL(f.a_receber)}</td>
                            <td style={{ ...S.tdR, color: "#856404" }}>{pctRec.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Parcelas Vencidas */}
              {parcelasVencidas.length > 0 && (
                <>
                  <div style={{ ...S.sec, borderBottomColor: "#721c24", color: "#721c24" }}>Detalhamento de Parcelas Vencidas</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                    <thead>
                      <tr>{["Vencimento","Dias Atraso","Cliente","Pedido","Descrição","Valor"].map((h,i) => <th key={i} style={{ ...S.th, background: "#721c24", textAlign: i >= 5 ? "right" : "left" }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {parcelasVencidas.map((l, i) => {
                        const dias = l.vencimento ? Math.floor((new Date(hoje).getTime() - new Date(l.vencimento + "T12:00:00").getTime()) / 86400000) : 0;
                        const cor  = dias > 90 ? "#4a0404" : dias > 60 ? "#721c24" : dias > 30 ? "#c0392b" : "#856404";
                        return (
                          <tr key={l.id} style={{ background: i % 2 === 0 ? "#fff5f5" : "#fff" }}>
                            <td style={{ ...S.td, fontFamily: "monospace", color: "#c0392b", fontWeight: 700 }}>
                              {l.vencimento ? new Date(l.vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td style={{ ...S.tdR, color: cor, fontWeight: 700 }}>{dias}d</td>
                            <td style={{ ...S.tdB }}>{(l as any).clientes?.nome ?? "—"}</td>
                            <td style={{ ...S.td, fontFamily: "monospace", color: AZUL2 }}>{l.pedido_id ?? "—"}</td>
                            <td style={{ ...S.td, color: "#444" }}>{l.descricao}</td>
                            <td style={{ ...S.tdR, color: "#c0392b", fontWeight: 800 }}>{formatBRL(l.valor)}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td colSpan={5} style={{ ...S.tdTotal, color: "#721c24", fontWeight: 800 }}>TOTAL VENCIDO</td>
                        <td style={{ ...S.tdTotal, textAlign: "right", color: "#c0392b", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(totalVencido)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}

              {/* Painel Resumo */}
              <div style={{ display: "flex", gap: "12px" }}>
                {[
                  { label: "Total em Aberto",      value: formatBRL(totalDevedores),                                                                cor: totalDevedores > 0 ? "#c0392b" : AZUL },
                  { label: "Total Vencido",         value: formatBRL(totalVencido),                                                                  cor: totalVencido > 0 ? "#721c24" : AZUL },
                  { label: "Taxa de Recebimento",   value: fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—",                           cor: fatTotal > 0 && recTotal/fatTotal >= 0.9 ? "#155724" : "#c0392b" },
                  { label: "Clientes em Risco",     value: devedores.length + " / " + financeiro.length,                                            cor: devedores.length > 0 ? "#856404" : AZUL },
                ].map(k => (
                  <div key={k.label} style={{ flex: 1, padding: "14px 16px", background: "#f8f9fa", border: `2px solid ${k.cor}44`, borderRadius: "8px" }}>
                    <div style={{ fontSize: "8px", fontWeight: 700, color: "#666", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>{k.label}</div>
                    <div style={{ fontSize: "20px", fontWeight: 900, color: k.cor, fontFamily: "monospace" }}>{k.value}</div>
                  </div>
                ))}
              </div>

            </div>
            <PdfFooter emissao={dtEmissao} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            PDF: RELATÓRIO DE FATURAMENTO ANALÍTICO
        ════════════════════════════════════════════════════════════════════ */}
        {(reporteAtivo === "faturamento" || reporteAtivo === "completo") && (
          <div className="print-area" style={S.page}>
            <PdfHeader titulo="Relatório de Faturamento" subtitulo="Análise Analítica 2026" emissao={dtEmissao} />
            <div style={S.body}>

              {/* Análise de Desempenho */}
              {(() => {
                const taxaRec  = fatTotal > 0 ? recTotal / fatTotal * 100 : 0;
                const top1Pct  = fatTotal > 0 && clientesOrdenados.length > 0 ? Number(clientesOrdenados[0].faturado) / fatTotal * 100 : 0;
                const top3Fat  = clientesOrdenados.slice(0, 3).reduce((a, f) => a + Number(f.faturado), 0);
                const top3Pct  = fatTotal > 0 ? top3Fat / fatTotal * 100 : 0;
                const mesesAti = meses.filter(m => m.faturado > 0);
                const fatMed   = mesesAti.length > 0 ? mesesAti.reduce((a, m) => a + m.faturado, 0) / mesesAti.length : 0;
                const crescMes = mesesAti.length >= 2 ? (() => {
                  const u = mesesAti[mesesAti.length - 1].faturado;
                  const p = mesesAti[mesesAti.length - 2].faturado;
                  return p > 0 ? ((u - p) / p * 100) : null;
                })() : null;
                const insights = [
                  fatTotal > 0 ? `Faturamento acumulado de ${formatBRL(fatTotal)} em ${mesesComDados.length} ${mesesComDados.length !== 1 ? "meses ativos" : "mês ativo"} (média ${formatBRL(fatMed)}/mês).${crescMes !== null ? ` Tendência do último mês: ${crescMes >= 0 ? "↑ +" : "↓ "}${Math.abs(crescMes).toFixed(1)}%.` : ""}` : null,
                  fatTotal > 0 ? `Taxa de recebimento: ${taxaRec.toFixed(1)}%. Melhor mês: ${melhorMes.mesCompleto} (${formatBRL(melhorMes.faturado)}). Saldo a receber: ${formatBRL(aReceber)}.` : null,
                  top3Pct > 0 ? `Concentração de receita — top 3 clientes: ${top3Pct.toFixed(1)}% do faturamento.${top3Pct > 70 ? " Dependência elevada — revisar estratégia comercial." : top3Pct > 50 ? " Nível moderado; buscar diversificação de carteira." : " Carteira bem distribuída."}` : null,
                  top1Pct > 30 ? `Maior cliente individual (${clientesOrdenados[0]?.cliente_nome}): ${top1Pct.toFixed(1)}% da receita total — monitorar risco de concentração.` : null,
                ].filter(Boolean);
                return insights.length > 0 ? (
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ ...S.sec, marginTop: "0" }}>Análise de Desempenho Comercial</div>
                    {insights.map((t, i) => (
                      <div key={i} style={S.insight}><strong style={{ color: AZUL2, marginRight: "5px" }}>◆</strong>{t}</div>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* KPIs */}
              <div style={S.sec}>Indicadores do Exercício 2026</div>
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                {[
                  { label: "Faturamento Total",  value: formatBRL(fatTotal),                                  sub: `${mesesComDados.length} meses ativos` },
                  { label: "Total Recebido",      value: formatBRL(recTotal),                                  sub: (fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) : 0) + "% do faturado" },
                  { label: "A Receber",           value: formatBRL(aReceber),                                  sub: `${devedores.length} clientes` },
                  { label: "Ticket Médio",        value: formatBRL(ticketMedio),                               sub: `${pedidos.length} pedidos` },
                  { label: "Melhor Mês",          value: melhorMes.mes,                                        sub: formatBRL(melhorMes.faturado) },
                ].map(k => (
                  <div key={k.label} style={S.kpi}>
                    <div style={S.kpiL}>{k.label}</div>
                    <div style={S.kpiV}>{k.value}</div>
                    <div style={S.kpiS}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Faturamento Mensal Analítico */}
              <div style={S.sec}>Faturamento Mensal Analítico</div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                <thead>
                  <tr>
                    {["Mês","Faturado","Recebido","A Receber","% Recebido","Var. Mês","% Acum."].map((h, i) => (
                      <th key={i} style={{ ...S.th, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let acumFat = 0;
                    return meses.map((m, i) => {
                      acumFat += m.faturado;
                      const pctRec  = m.faturado > 0 ? (m.recebido / m.faturado * 100) : 0;
                      const ant     = i > 0 ? meses[i-1].faturado : 0;
                      const varM    = ant > 0 ? ((m.faturado - ant) / ant * 100) : null;
                      const pctAcum = fatTotal > 0 ? (acumFat / fatTotal * 100) : 0;
                      const isEmpty = m.faturado === 0;
                      const isBest  = m.mesCompleto === melhorMes.mesCompleto && !isEmpty;
                      return (
                        <tr key={i} style={{ background: isBest ? "#eef6ff" : isEmpty ? "#fafafa" : i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                          <td style={{ ...S.tdB, color: isEmpty ? "#bbb" : "#222" }}>{m.mesCompleto}{isBest ? "  ★" : ""}</td>
                          <td style={{ ...S.tdR, color: isEmpty ? "#bbb" : AZUL2 }}>{isEmpty ? "—" : formatBRL(m.faturado)}</td>
                          <td style={{ ...S.tdR, color: isEmpty ? "#bbb" : "#155724" }}>{isEmpty ? "—" : formatBRL(m.recebido)}</td>
                          <td style={{ ...S.tdR, color: (m.faturado - m.recebido) > 0 ? "#856404" : "#bbb" }}>{(m.faturado - m.recebido) > 0 ? formatBRL(m.faturado - m.recebido) : "—"}</td>
                          <td style={{ ...S.tdR, color: isEmpty ? "#bbb" : pctRec >= 100 ? "#155724" : pctRec > 50 ? "#856404" : "#c0392b" }}>{isEmpty ? "—" : pctRec.toFixed(1) + "%"}</td>
                          <td style={{ ...S.tdR, color: varM === null || isEmpty ? "#bbb" : varM >= 0 ? "#155724" : "#c0392b" }}>
                            {!isEmpty && varM !== null ? (varM >= 0 ? "↑ +" : "↓ ") + Math.abs(varM).toFixed(1) + "%" : "—"}
                          </td>
                          <td style={{ ...S.tdR, color: isEmpty ? "#bbb" : "#555" }}>{isEmpty ? "—" : pctAcum.toFixed(1) + "%"}</td>
                        </tr>
                      );
                    });
                  })()}
                  <tr>
                    <td style={{ ...S.tdTotal, color: AZUL, fontWeight: 800 }}>TOTAL 2026</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: AZUL, fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(fatTotal)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: "#155724", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(recTotal)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: "#856404", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(aReceber)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—"}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right" }}>—</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>100%</td>
                  </tr>
                </tbody>
              </table>

              {/* Concentração de Receita */}
              {clientesOrdenados.length >= 3 && (() => {
                const top1  = clientesOrdenados.slice(0, 1).reduce((a, f) => a + Number(f.faturado), 0);
                const top3  = clientesOrdenados.slice(0, 3).reduce((a, f) => a + Number(f.faturado), 0);
                const top5  = clientesOrdenados.slice(0, 5).reduce((a, f) => a + Number(f.faturado), 0);
                const p1    = fatTotal > 0 ? top1 / fatTotal * 100 : 0;
                const p3    = fatTotal > 0 ? top3 / fatTotal * 100 : 0;
                const p5    = fatTotal > 0 ? top5 / fatTotal * 100 : 0;
                const pRest = Math.max(100 - p5, 0);
                return (
                  <>
                    <div style={S.sec}>Análise de Concentração de Receita</div>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                      {[
                        { label: "1º Cliente",       value: p1.toFixed(1) + "%",    sub: formatBRL(top1),               cor: p1 > 30 ? "#c0392b" : AZUL2 },
                        { label: "Top 3 Clientes",   value: p3.toFixed(1) + "%",    sub: formatBRL(top3),               cor: p3 > 60 ? "#c0392b" : p3 > 40 ? "#856404" : AZUL2 },
                        { label: "Top 5 Clientes",   value: p5.toFixed(1) + "%",    sub: formatBRL(top5),               cor: p5 > 80 ? "#c0392b" : p5 > 60 ? "#856404" : AZUL2 },
                        { label: "Demais Clientes",  value: pRest.toFixed(1) + "%", sub: formatBRL(Math.max(fatTotal - top5, 0)), cor: "#155724" },
                      ].map(k => (
                        <div key={k.label} style={{ ...S.kpi, flex: 1 }}>
                          <div style={S.kpiL}>{k.label}</div>
                          <div style={{ ...S.kpiV, color: k.cor }}>{k.value}</div>
                          <div style={S.kpiS}>{k.sub}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}

              {/* Faturamento por Cliente */}
              <div style={S.sec}>Faturamento por Cliente — Ranking Completo</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                      <tr key={f.cliente_id} style={{ background: i < 3 ? "#f4f8ff" : i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                        <td style={{ ...S.td, color: i < 3 ? AZUL2 : "#888", textAlign: "center", fontWeight: i < 3 ? 800 : 400 }}>{i + 1}</td>
                        <td style={{ ...S.tdB, color: i < 3 ? AZUL : "#222" }}>{f.cliente_nome}</td>
                        <td style={{ ...S.td, color: "#555" }}>{(f as any).cidade || "—"}</td>
                        <td style={{ ...S.tdR, color: AZUL2, fontWeight: 700 }}>{formatBRL(f.faturado)}</td>
                        <td style={{ ...S.tdR, color: i < 3 ? AZUL2 : "#555", fontWeight: i < 3 ? 700 : 400 }}>{pctFat.toFixed(1)}%</td>
                        <td style={{ ...S.tdR, color: "#155724" }}>{formatBRL(f.recebido)}</td>
                        <td style={{ ...S.tdR, color: Number(f.a_receber) > 0 ? "#856404" : "#aaa" }}>{Number(f.a_receber) > 0 ? formatBRL(f.a_receber) : "—"}</td>
                        <td style={{ ...S.tdR, color: pctRec >= 100 ? "#155724" : pctRec > 50 ? "#856404" : "#c0392b" }}>{pctRec.toFixed(1)}%</td>
                        <td style={{ ...S.tdR }}>{f.total_pedidos}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={3} style={{ ...S.tdTotal, color: AZUL, fontWeight: 800 }}>TOTAL</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: AZUL, fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(fatTotal)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>100%</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: "#155724", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(recTotal)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", color: "#856404", fontWeight: 800, fontFamily: "monospace" }}>{formatBRL(aReceber)}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{fatTotal > 0 ? (recTotal/fatTotal*100).toFixed(1) + "%" : "—"}</td>
                    <td style={{ ...S.tdTotal, textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{pedidos.length}</td>
                  </tr>
                </tbody>
              </table>

            </div>
            <PdfFooter emissao={dtEmissao} />
          </div>
        )}
      </AppLayout>
    </>
  );
}
