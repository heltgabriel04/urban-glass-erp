"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getMargemPorPedido, type MargemPedido } from "@/services/margem.service";
import { formatBRL, formatPercent, formatDate } from "@/lib/formatters";

export default function MargemPage() {
  const [linhas, setLinhas] = useState<MargemPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => { (async () => {
    setLinhas(await getMargemPorPedido());
    setLoading(false);
  })(); }, []);

  const receitaTotal = linhas.reduce((a, l) => a + l.receita, 0);
  const custoTotal   = linhas.reduce((a, l) => a + l.custo, 0);
  const margemTotal  = receitaTotal - custoTotal;
  const margemPctTot = receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : 0;

  const filtradas = linhas.filter(l =>
    !busca ||
    l.pedido_id.toLowerCase().includes(busca.toLowerCase()) ||
    l.cliente_nome.toLowerCase().includes(busca.toLowerCase())
  );

  function corMargem(pct: number) {
    if (pct >= 35) return "var(--ok)";
    if (pct >= 15) return "var(--warn)";
    return "var(--err)";
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Margem &amp; CMV</div>
        <div className="tb-search">
          <span className="tb-search-ic">⌕</span>
          <input placeholder="Buscar pedido ou cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </div>

      <div className="con">
        <div className="al al-i" style={{ marginBottom: "16px", fontSize: "12px" }}>
          Margem bruta aproximada: usa o <strong>custo/m² atual</strong> do estoque e <strong>não</strong> inclui
          lapidação. Itens de vidro do cliente entram com custo zero. Pedidos sem custo cadastrado aparecem marcados.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Receita",   value: formatBRL(receitaTotal), color: "var(--acc)",  sub: "soma dos pedidos" },
            { label: "CMV",       value: formatBRL(custoTotal),   color: "var(--warn)", sub: "custo das chapas" },
            { label: "Margem",    value: formatBRL(margemTotal),  color: "var(--ok)",   sub: "receita − custo" },
            { label: "Margem %",  value: formatPercent(margemPctTot, 1), color: corMargem(margemPctTot), sub: "margem ÷ receita" },
          ].map(card => (
            <div key={card.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{card.value}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? <div className="loading">Calculando margens...</div> : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th><th>Cliente</th><th>Data</th>
                  <th>Receita</th><th>CMV</th><th>Margem</th><th>Margem %</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>Nenhum pedido encontrado</td></tr>
                )}
                {filtradas.map(l => (
                  <tr key={l.pedido_id}>
                    <td><span className="mono" style={{ color: "var(--acc)" }}>{l.pedido_id}</span></td>
                    <td>{l.cliente_nome}</td>
                    <td className="mono">{formatDate(l.dt_pedido)}</td>
                    <td className="mono">{formatBRL(l.receita)}</td>
                    <td className="mono" style={{ color: "var(--warn)" }}>
                      {formatBRL(l.custo)}
                      {l.semCusto && <span title="Sem custo/m² cadastrado no estoque" style={{ marginLeft: "4px", color: "var(--err)" }}>⚠</span>}
                    </td>
                    <td className="mono" style={{ color: corMargem(l.margemPct) }}>{formatBRL(l.margem)}</td>
                    <td className="mono" style={{ color: corMargem(l.margemPct), fontWeight: 600 }}>{formatPercent(l.margemPct, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
