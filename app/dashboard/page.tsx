"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidos } from "@/services/pedidos.service";
import { getFinanceiroClientes, getFaturamentoMensal } from "@/services/financeiro.service";
import { formatBRL, formatPercent, MESES } from "@/lib/formatters";
import type { Pedido, FinanceiroCliente, FaturamentoMensal } from "@/types";

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const FLUXO_ATIVO = ['Aguardando otimização','Em Produção – Corte','Em Produção – Lapidação','Separação','Saiu para entrega'];

export default function DashboardPage() {
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [fatMensal, setFatMensal]   = useState<FaturamentoMensal[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [peds, fin, fat] = await Promise.all([getPedidos(), getFinanceiroClientes(), getFaturamentoMensal(2026)]);
    setPedidos(peds); setFinanceiro(fin); setFatMensal(fat); setLoading(false);
  }

  const fatTotal    = financeiro.reduce((a, f) => a + Number(f.faturado), 0);
  const recTotal    = financeiro.reduce((a, f) => a + Number(f.recebido), 0);
  const aReceber    = fatTotal - recTotal;
  const pedAtivos   = pedidos.filter(p => FLUXO_ATIVO.includes(p.status)).length;
  const ticketMedio = fatTotal / (pedidos.length || 1);

  const inadimplentes  = financeiro.filter(f => Number(f.recebido) === 0 && Number(f.faturado) > 0);
  const parciais       = financeiro.filter(f => Number(f.recebido) > 0 && Number(f.a_receber) > 0);
  const aguardandoOtim = pedidos.filter(p => p.status === 'Aguardando otimização');

  const barras = MESES_ABREV.map((mes, i) => {
    const fat = fatMensal.find(f => f.mes === i + 1);
    return { mes, faturado: fat ? Number(fat.faturado) : 0 };
  });
  const maxBar = Math.max(...barras.map(b => b.faturado), 1);
  const topCli = [...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)).slice(0, 5);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Dashboard</div>
      </div>

      <div className="con">
        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Faturamento Total", value: formatBRL(fatTotal),  color:"var(--acc)",  sub:"↑ Acumulado 2026" },
            { label:"Recebido",          value: formatBRL(recTotal),  color:"var(--ok)",   sub: formatPercent(fatTotal > 0 ? recTotal / fatTotal * 100 : 0) + " do faturado" },
            { label:"A Receber",         value: formatBRL(aReceber),  color:"var(--warn)", sub:"⚠ Atenção" },
            { label:"Pedidos Ativos",    value: String(pedAtivos),    color:"var(--acc2)", sub:"de " + pedidos.length + " total" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando dashboard...</div>
        ) : (
          <>
            <div className="g2 mb14">
              <div className="card">
                <div className="ct">Faturamento Mensal<span className="ct-a">2026</span></div>
                <div style={{ height:"90px", display:"flex", alignItems:"flex-end", gap:"5px" }}>
                  {barras.map((b, i) => (
                    <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", cursor:"pointer" }}>
                      <div style={{ width:"100%", height:`${b.faturado > 0 ? Math.max((b.faturado / maxBar) * 80, 3) : 3}px`, borderRadius:"3px 3px 0 0", background: b.faturado > 0 ? "var(--acc)" : "var(--surf3)", transition:"0.2s" }} />
                      <div style={{ fontSize:"9px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", marginTop:"3px" }}>{b.mes}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="ct">Alertas</div>
                {inadimplentes.map(f => (
                  <div key={f.cliente_id} className="al al-e">🔴 {f.cliente_nome} — {formatBRL(f.faturado)} sem pagamento</div>
                ))}
                {parciais.slice(0, 2).map(f => (
                  <div key={f.cliente_id} className="al al-w">⚠ {f.cliente_nome} — {formatBRL(f.a_receber)} restante</div>
                ))}
                {aguardandoOtim.map(p => (
                  <div key={p.id} className="al al-i">ⓘ {p.id} aguarda otimização</div>
                ))}
                {inadimplentes.length === 0 && parciais.length === 0 && aguardandoOtim.length === 0 && (
                  <div className="al al-s">✓ Nenhum alerta no momento</div>
                )}
              </div>
            </div>

            <div className="g2">
              <div className="card">
                <div className="ct">Top Clientes</div>
                {topCli.map(f => {
                  const pct = Number(f.faturado) > 0 ? Number(f.recebido) / Number(f.faturado) * 100 : 0;
                  return (
                    <div key={f.cliente_id} className="sr">
                      <div className="sl">{f.cliente_nome}<small>{f.cidade}</small></div>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                        <div className="prg" style={{ width:"55px", height:"5px" }}>
                          <div className="prg-f" style={{ width:`${pct}%`, background: pct < 50 ? "var(--err)" : pct < 100 ? "var(--warn)" : "var(--ok)" }} />
                        </div>
                        <div className="sv">{formatBRL(f.faturado)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="card">
                <div className="ct">Indicadores</div>
                <div className="sr"><div className="sl">Ticket Médio</div><div className="sv">{formatBRL(ticketMedio)}</div></div>
                <div className="sr"><div className="sl">Total Clientes</div><div className="sv" style={{ color:"var(--acc2)" }}>{financeiro.length}</div></div>
                <div className="sr"><div className="sl">Pedidos Entregues</div><div className="sv" style={{ color:"var(--ok)" }}>{pedidos.filter(p => ['Entregue','Finalizado'].includes(p.status)).length}</div></div>
                <div className="sr"><div className="sl">Taxa de Recebimento</div><div className="sv">{formatPercent(fatTotal > 0 ? recTotal / fatTotal * 100 : 0)}</div></div>
                <div className="sr"><div className="sl">Inadimplência</div><div className="sv" style={{ color: inadimplentes.length > 0 ? "var(--err)" : "var(--ok)" }}>{inadimplentes.length} clientes</div></div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}