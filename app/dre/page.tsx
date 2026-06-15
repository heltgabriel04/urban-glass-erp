"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getDRE, type DRE } from "@/services/dre.service";
import { formatBRL, formatPercent, MESES } from "@/lib/formatters";

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

export default function DREPage() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [mes, setMes] = useState<number | null>(null); // null = ano todo
  const [dre, setDre] = useState<DRE | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    setLoading(true);
    setDre(await getDRE(ano, mes));
    setLoading(false);
  })(); }, [ano, mes]);

  const periodoLabel = mes ? `${MESES[mes - 1]}/${ano}` : `${ano} (ano todo)`;
  const corResultado = (dre?.resultado ?? 0) >= 0 ? "var(--ok)" : "var(--err)";

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">DRE · Resultado</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select className="fc" value={mes ?? ""} onChange={e => setMes(e.target.value ? Number(e.target.value) : null)} style={{ margin: 0, width: "auto" }}>
            <option value="">Ano todo</option>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="fc" value={ano} onChange={e => setAno(Number(e.target.value))} style={{ margin: 0, width: "auto" }}>
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="con">
        <div className="al al-i" style={{ marginBottom: "16px", fontSize: "12px" }}>
          DRE por competência ({periodoLabel}). Receita = faturamento (pedidos por data). CMV usa o custo/m² atual
          do estoque (sem lapidação). Despesas = lançamentos de saída agrupados pela categoria.
        </div>

        {loading || !dre ? <div className="loading">Calculando DRE...</div> : (
          <div style={{ maxWidth: "640px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "12px", overflow: "hidden" }}>
            <Linha label="Receita Bruta" valor={dre.receita} forte />
            <Linha label="(−) CMV" valor={-dre.cmv} cor="var(--warn)" />
            <Linha label="= Lucro Bruto" valor={dre.lucroBruto} forte sub={formatPercent(dre.margemBrutaPct, 1) + " da receita"} divisor />

            <div style={{ padding: "10px 20px 4px", fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
              Despesas Operacionais
            </div>
            {dre.despesas.length === 0 && (
              <div style={{ padding: "4px 20px 10px", fontSize: "12px", color: "var(--t3)" }}>Nenhuma despesa no período.</div>
            )}
            {dre.despesas.map(d => (
              <Linha key={d.categoria} label={d.categoria} valor={-d.valor} indent pequeno />
            ))}
            <Linha label="(−) Total de Despesas" valor={-dre.despesasTotal} cor="var(--warn)" divisor />

            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surf2)", borderTop: "2px solid var(--b2)" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Resultado</div>
                <div style={{ fontSize: "11px", color: "var(--t3)" }}>margem líquida {formatPercent(dre.margemLiquidaPct, 1)}</div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: corResultado, fontFamily: "'DM Mono', monospace" }}>
                {formatBRL(dre.resultado)}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Linha({ label, valor, forte, cor, sub, indent, pequeno, divisor }: {
  label: string; valor: number; forte?: boolean; cor?: string; sub?: string;
  indent?: boolean; pequeno?: boolean; divisor?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: pequeno ? "6px 20px" : "12px 20px",
      paddingLeft: indent ? "36px" : "20px",
      borderTop: divisor ? "1px solid var(--b1)" : undefined,
    }}>
      <div>
        <span style={{ fontSize: pequeno ? "12px" : "13px", fontWeight: forte ? 700 : 400, color: forte ? "var(--t1)" : "var(--t2)" }}>{label}</span>
        {sub && <span style={{ fontSize: "11px", color: "var(--t3)", marginLeft: "8px" }}>· {sub}</span>}
      </div>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: pequeno ? "12px" : "14px", fontWeight: forte ? 700 : 500, color: cor ?? (forte ? "var(--t1)" : "var(--t2)") }}>
        {formatBRL(valor)}
      </span>
    </div>
  );
}
