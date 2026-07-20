"use client";

import { Fragment, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import EmptyState from "@/components/ui/EmptyState";
import { formatBRL, formatDate } from "@/lib/formatters";
import { calcularCustoImportacao, type DadosImportacao, type CustoImportacao } from "@/lib/custoImportacao";
import { getComprasImportadas } from "@/services/compras.service";
import type { Compra, StatusCompra } from "@/types";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const CHIP: Record<StatusCompra, string> = {
  rascunho: "chip cy",
  recebido: "chip cg",
};

interface LinhaImportacao {
  compra: Compra;
  resumo: CustoImportacao;
  custoAplicado: number;
  diverge: boolean;
}

// Recalcula o custo (não é persistido — só os 14 campos brutos da DI
// ficam salvos) e compara com o que de fato está gravado nos itens.
function montarLinha(compra: Compra): LinhaImportacao {
  const dados: DadosImportacao = {
    valor_fob_usd: Number(compra.valor_fob_usd) || 0,
    frete_internacional_usd: Number(compra.frete_internacional_usd) || 0,
    seguro_internacional_usd: Number(compra.seguro_internacional_usd) || 0,
    cambio_usd: Number(compra.cambio_usd) || 0,
    ii: Number(compra.ii) || 0,
    ipi_importacao: Number(compra.ipi_importacao) || 0,
    pis_cofins_importacao: Number(compra.pis_cofins_importacao) || 0,
    icms_importacao: Number(compra.icms_importacao) || 0,
    despesas_aduaneiras: Number(compra.despesas_aduaneiras) || 0,
    ipi_creditavel: Boolean(compra.ipi_creditavel),
    pis_cofins_creditavel: Boolean(compra.pis_cofins_creditavel),
    icms_creditavel: Boolean(compra.icms_creditavel),
  };
  const itens = compra.compras_itens ?? [];
  const m2Total = itens.reduce((a, i) => a + Number(i.m2), 0);
  const resumo = calcularCustoImportacao(dados, m2Total);
  const custoAplicado = m2Total > 0
    ? itens.reduce((a, i) => a + Number(i.custo_unitario_m2) * Number(i.m2), 0) / m2Total
    : 0;
  const diverge = Math.abs(resumo.custoM2 - custoAplicado) > 0.01;
  return { compra, resumo, custoAplicado, diverge };
}

export default function ImportacoesPage() {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandida, setExpandida] = useState<string | null>(null);

  useEffect(() => { load(); }, [ano, mes]);

  async function load() {
    setLoading(true);
    const compras = await getComprasImportadas({ ano, mes });
    setLinhas(compras.map(montarLinha));
    setLoading(false);
  }

  const kpis = linhas.reduce((a, l) => ({
    desembolsado: a.desembolsado + l.resumo.custoDesembolsado,
    naoRecuperavel: a.naoRecuperavel + l.resumo.custoNaoRecuperavel,
    creditos: a.creditos + l.resumo.creditosTributarios,
  }), { desembolsado: 0, naoRecuperavel: 0, creditos: 0 });

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Importações</div>
      </div>
      <ContabilidadeTabs ativo="importacoes" />

      <div className="con">
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <select name="mes" className="fc" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: "140px" }}>
            {MESES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
          </select>
          <input name="ano" className="fc" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: "90px" }} />
        </div>

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : linhas.length === 0 ? (
          <EmptyState
            title="Nenhuma compra importada neste período."
            subtitle="Marque 'Compra importada' ao lançar uma compra em /compras pra ela aparecer aqui."
          />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
              {[
                { label: "Desembolsado Total", value: formatBRL(kpis.desembolsado) },
                { label: "Custo Não-Recuperável Total", value: formatBRL(kpis.naoRecuperavel) },
                { label: "Créditos Tributários Total", value: formatBRL(kpis.creditos) },
              ].map((c) => (
                <div key={c.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px" }}>
                  <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "4px" }}>{c.label}</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{c.value}</div>
                </div>
              ))}
            </div>

            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Data</th><th>Fornecedor</th><th>Nº DI</th><th>Status</th><th>Câmbio</th>
                    <th>Valor Aduaneiro</th><th>Desembolsado</th><th>Não-Recuperável</th><th>Créditos</th>
                    <th>Custo/m² (DI)</th><th>Custo/m² (Aplicado)</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ compra, resumo, custoAplicado, diverge }) => (
                    <Fragment key={compra.id}>
                      <tr>
                        <td className="mono">{formatDate(compra.dt_compra)}</td>
                        <td><strong>{compra.fornecedores?.nome ?? "—"}</strong></td>
                        <td>
                          <span className="mono" style={{ color: "var(--acc2)", cursor: "pointer" }} onClick={() => setExpandida(expandida === compra.id ? null : compra.id)}>
                            {expandida === compra.id ? "▾" : "▸"} {compra.numero_di || "—"}
                          </span>
                        </td>
                        <td><span className={CHIP[compra.status]}>{compra.status === "rascunho" ? "Pendente" : "Recebida"}</span></td>
                        <td className="mono">{Number(compra.cambio_usd ?? 0).toFixed(4)}</td>
                        <td className="mono">{formatBRL(resumo.valorAduaneiroBrl)}</td>
                        <td className="mono">{formatBRL(resumo.custoDesembolsado)}</td>
                        <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(resumo.custoNaoRecuperavel)}</td>
                        <td className="mono" style={{ color: "var(--ok)" }}>{formatBRL(resumo.creditosTributarios)}</td>
                        <td className="mono">{formatBRL(resumo.custoM2)}</td>
                        <td className="mono" style={diverge ? { color: "var(--err)", fontWeight: 700 } : undefined} title={diverge ? "Diverge do custo calculado da DI" : undefined}>
                          {formatBRL(custoAplicado)}{diverge ? " ⚠" : ""}
                        </td>
                      </tr>
                      {expandida === compra.id && (
                        <tr>
                          <td colSpan={11} style={{ background: "var(--surf2)", padding: "12px 20px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "10px" }}>
                              {[
                                { label: "FOB (USD)", value: formatBRL(Number(compra.valor_fob_usd ?? 0)) },
                                { label: "Frete Intl. (USD)", value: formatBRL(Number(compra.frete_internacional_usd ?? 0)) },
                                { label: "Seguro Intl. (USD)", value: formatBRL(Number(compra.seguro_internacional_usd ?? 0)) },
                                { label: "II (R$)", value: formatBRL(Number(compra.ii ?? 0)) },
                                { label: "Despesas Aduaneiras (R$)", value: formatBRL(Number(compra.despesas_aduaneiras ?? 0)) },
                              ].map((c) => (
                                <div key={c.label}>
                                  <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>{c.label}</div>
                                  <div className="mono" style={{ fontSize: "12px" }}>{c.value}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", color: "var(--t2)" }}>
                                IPI ({formatBRL(Number(compra.ipi_importacao ?? 0))}) — <span className={compra.ipi_creditavel ? "chip cg" : "chip cgr"} style={{ fontSize: "10px" }}>{compra.ipi_creditavel ? "✓ Creditável" : "— Não creditável"}</span>
                              </span>
                              <span style={{ fontSize: "11px", color: "var(--t2)" }}>
                                PIS/COFINS ({formatBRL(Number(compra.pis_cofins_importacao ?? 0))}) — <span className={compra.pis_cofins_creditavel ? "chip cg" : "chip cgr"} style={{ fontSize: "10px" }}>{compra.pis_cofins_creditavel ? "✓ Creditável" : "— Não creditável"}</span>
                              </span>
                              <span style={{ fontSize: "11px", color: "var(--t2)" }}>
                                ICMS ({formatBRL(Number(compra.icms_importacao ?? 0))}) — <span className={compra.icms_creditavel ? "chip cg" : "chip cgr"} style={{ fontSize: "10px" }}>{compra.icms_creditavel ? "✓ Creditável" : "— Não creditável"}</span>
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
