"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { formatBRL } from "@/lib/formatters";
import {
  getResumoNotasSaida, getAlertas, getStatusAreas, getPercentualFechamento,
  type Alerta, type StatusArea,
} from "@/services/contabilidadeDashboard.service";
import { getDocumentosFiscais } from "@/services/contabilidadeDocumentos.service";
import { exportarPacoteMensal } from "@/lib/exportacaoContabilidade";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const DOT: Record<StatusArea["semaforo"], string> = {
  verde: "#34d399", amarelo: "#fbbf24", vermelho: "#fb7185", indisponivel: "var(--t3)",
};

export default function ContabilidadeDashboardPage() {
  const { toast } = useToast();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [areas, setAreas] = useState<StatusArea[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [percentual, setPercentual] = useState(0);
  const [faturado, setFaturado] = useState(0);
  const [totalCompras, setTotalCompras] = useState(0);
  const [totalPerdas, setTotalPerdas] = useState(0);
  const [valorPerdas, setValorPerdas] = useState(0);

  useEffect(() => { load(); }, [ano, mes]);

  async function load() {
    setLoading(true);
    const [statusAreas, listaAlertas, pct, resumoSaida, docsCompra, docsPerda] = await Promise.all([
      getStatusAreas(ano, mes),
      getAlertas(ano, mes),
      getPercentualFechamento(ano, mes),
      getResumoNotasSaida(ano, mes),
      getDocumentosFiscais({ tipo: "compra", competenciaAno: ano, competenciaMes: mes }),
      getDocumentosFiscais({ tipo: "perda", competenciaAno: ano, competenciaMes: mes }),
    ]);
    setAreas(statusAreas);
    setAlertas(listaAlertas);
    setPercentual(pct);
    setFaturado(resumoSaida.totalFaturado);
    setTotalCompras(docsCompra.length);
    setTotalPerdas(docsPerda.length);
    setValorPerdas(docsPerda.reduce((s, d) => s + (Number(d.valor_total) || 0), 0));
    setLoading(false);
  }

  const alertasCriticos = alertas.filter((a) => a.severidade === "critico").reduce((s, a) => s + a.quantidade, 0);

  async function handleExportar() {
    setExportando(true);
    const res = await exportarPacoteMensal(ano, mes);
    setExportando(false);
    toast(res.ok ? "Pacote exportado" : (res.motivo ?? "Erro ao exportar"), res.ok ? "ok" : "err");
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Contabilidade</div>
        <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "6px", padding: "4px 10px" }}>
          Fechamento Mensal
        </div>
      </div>
      <ContabilidadeTabs ativo="dashboard" />

      <div className="con">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Mês de Referência</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <select className="fc" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: "140px" }}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input className="fc" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: "90px" }} />
            </div>
          </div>

          <button className="btn bg sm" onClick={handleExportar} disabled={exportando} style={{ alignSelf: "flex-end" }}>
            {exportando ? "Exportando..." : "Exportar Pacote Mensal"}
          </button>

          <Link href="/contabilidade/checklist" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px",
              padding: "12px 24px", textAlign: "center", cursor: "pointer",
            }}>
              <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Fechamento</div>
              <div style={{ fontSize: "28px", fontWeight: 700, fontFamily: "'DM Mono', monospace", color: percentual === 100 ? "var(--ok)" : "var(--t1)" }}>
                {percentual}%
              </div>
            </div>
          </Link>
        </div>

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : (
          <>
            {/* Cards de resumo */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
              {[
                { label: "Vendas (Faturado)", value: formatBRL(faturado) },
                { label: "Compras Registradas", value: String(totalCompras) },
                { label: "Perdas", value: `${totalPerdas} · ${formatBRL(valorPerdas)}` },
                { label: "Pendências Críticas", value: String(alertasCriticos), color: alertasCriticos > 0 ? "var(--err)" : "var(--ok)" },
              ].map((c) => (
                <div key={c.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px" }}>
                  <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "4px" }}>{c.label}</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: c.color ?? "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Semáforo por área */}
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", marginBottom: "10px" }}>Status por Área</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px", marginBottom: "24px" }}>
              {areas.map((a) => (
                <div key={a.area} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: DOT[a.semaforo], flexShrink: 0 }} />
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--t1)" }}>{a.label}</span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "var(--t3)" }}>{a.detalhe}</div>
                </div>
              ))}
            </div>

            {/* Alertas */}
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", marginBottom: "10px" }}>Alertas</div>
            {alertas.length === 0 ? (
              <div className="card" style={{ padding: "24px", textAlign: "center", color: "var(--t3)", fontSize: "13px" }}>
                Nenhum alerta nesta competência.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {alertas.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: a.severidade === "critico" ? "rgba(244,63,94,.08)" : "rgba(245,158,11,.08)",
                    border: `1px solid ${a.severidade === "critico" ? "rgba(244,63,94,.25)" : "rgba(245,158,11,.25)"}`,
                    borderRadius: "8px", padding: "10px 16px",
                  }}>
                    <span style={{ fontSize: "13px", color: "var(--t1)" }}>{a.mensagem}</span>
                    <span className={a.severidade === "critico" ? "chip cr" : "chip cy"}>{a.quantidade}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
