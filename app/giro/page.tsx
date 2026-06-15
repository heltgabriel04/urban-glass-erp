"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getGiroEstoque, type GiroProduto } from "@/services/giro.service";
import { formatM2 } from "@/lib/formatters";

const PERIODOS = [
  { dias: 30,  label: "30 dias" },
  { dias: 90,  label: "90 dias" },
  { dias: 180, label: "180 dias" },
  { dias: 365, label: "12 meses" },
];

export default function GiroPage() {
  const [dias, setDias] = useState(90);
  const [linhas, setLinhas] = useState<GiroProduto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    setLoading(true);
    setLinhas(await getGiroEstoque(dias));
    setLoading(false);
  })(); }, [dias]);

  const semConsumo = linhas.filter(l => l.consumoM2 === 0 && l.m2Saldo > 0).length;
  const baixaCobertura = linhas.filter(l => l.coberturaDias != null && l.coberturaDias < 30).length;

  function corCobertura(d: number | null) {
    if (d == null) return "var(--t3)";
    if (d < 15) return "var(--err)";
    if (d < 30) return "var(--warn)";
    return "var(--ok)";
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Giro &amp; Cobertura</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {PERIODOS.map(p => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              style={{
                padding: "5px 14px", borderRadius: "99px", border: "1px solid",
                fontSize: "12px", cursor: "pointer", fontWeight: dias === p.dias ? 700 : 400,
                background: dias === p.dias ? "var(--surf2)" : "transparent",
                borderColor: dias === p.dias ? "var(--b2)" : "var(--b1)",
                color: dias === p.dias ? "var(--t1)" : "var(--t2)",
              }}
            >{p.label}</button>
          ))}
        </div>
      </div>

      <div className="con">
        <div className="al al-i" style={{ marginBottom: "16px", fontSize: "12px" }}>
          Consumo derivado do histórico de otimizações (chapas cortadas, exceto retalhos) nos últimos {dias} dias.
          <strong> Giro</strong> = consumo ÷ saldo atual; <strong>cobertura</strong> = dias que o saldo atual dura
          ao ritmo do período. Estoque médio aproximado pelo saldo atual.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Produtos", value: String(linhas.length), color: "var(--t1)", sub: "no estoque" },
            { label: "Baixa cobertura", value: String(baixaCobertura), color: baixaCobertura > 0 ? "var(--err)" : "var(--ok)", sub: "< 30 dias" },
            { label: "Sem giro", value: String(semConsumo), color: semConsumo > 0 ? "var(--warn)" : "var(--ok)", sub: "saldo parado no período" },
          ].map(card => (
            <div key={card.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{card.value}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? <div className="loading">Calculando giro...</div> : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Produto</th><th>Saldo (m²)</th><th>Chapas</th>
                  <th>Consumo no período</th><th>Giro</th><th>Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>Nenhum item no estoque</td></tr>
                )}
                {linhas.map(l => (
                  <tr key={l.produto_nome}>
                    <td><strong>{l.produto_nome}</strong></td>
                    <td className="mono">{formatM2(l.m2Saldo)}</td>
                    <td className="mono">{l.chapasSaldo}</td>
                    <td className="mono">{formatM2(l.consumoM2)}</td>
                    <td className="mono">{l.giro != null ? `${l.giro.toFixed(2)}x` : "—"}</td>
                    <td className="mono" style={{ color: corCobertura(l.coberturaDias), fontWeight: 600 }}>
                      {l.coberturaDias != null ? `${l.coberturaDias} dias` : "—"}
                      {l.coberturaDias != null && l.coberturaDias < 15 && <span title="Cobertura crítica" style={{ marginLeft: "4px" }}>⚠</span>}
                    </td>
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
