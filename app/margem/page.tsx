"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getMargemPorPedido, type MargemPedido } from "@/services/margem.service";
import { formatBRL, formatPercent, formatDate } from "@/lib/formatters";
import SearchInput from "@/components/ui/SearchInput";

export default function MargemPage() {
  const [linhas, setLinhas] = useState<MargemPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => { (async () => {
    setLinhas(await getMargemPorPedido());
    setLoading(false);
  })(); }, []);

  // Pedidos com custoIndisponivel (algum lote com custo_m2 ainda não
  // definido) ficam de fora dos totais de CMV/margem — somar como 0
  // inflaria a margem exibida. Contados separadamente, nunca escondidos.
  const disponiveis  = linhas.filter(l => !l.custoIndisponivel);
  const pendentes    = linhas.filter(l => l.custoIndisponivel);
  const receitaTotal = disponiveis.reduce((a, l) => a + l.receita, 0);
  const custoTotal   = disponiveis.reduce((a, l) => a + (l.custo ?? 0), 0);
  const margemTotal  = receitaTotal - custoTotal;
  const margemPctTot = receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : 0;
  const receitaPendente = pendentes.reduce((a, l) => a + l.receita, 0);
  const comDataEstimada = disponiveis.filter(l => l.envolveDataEstimada);
  const receitaDataEstimada = comDataEstimada.reduce((a, l) => a + l.receita, 0);

  const filtradas = linhas.filter(l =>
    !busca ||
    l.pedido_id.toLowerCase().includes(busca.toLowerCase()) ||
    l.cliente_nome.toLowerCase().includes(busca.toLowerCase())
  );

  function corMargem(pct: number | null) {
    if (pct == null) return "var(--t3)";
    if (pct >= 35) return "var(--ok)";
    if (pct >= 15) return "var(--warn)";
    return "var(--err)";
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Margem &amp; CMV</div>
        <SearchInput placeholder="Buscar pedido ou cliente..." value={busca} onChange={setBusca} />
      </div>

      <div className="con">
        <div className="al al-i" style={{ marginBottom: "16px", fontSize: "12px" }}>
          Margem bruta aproximada: usa <strong>PEPS</strong> (consumo dos lotes de cada produto por ordem de entrada, mais
          antigo primeiro — método definitivo confirmado pelo contador) e <strong>não</strong> inclui lapidação. Itens de
          vidro do cliente entram com custo zero. Pedidos sem custo cadastrado aparecem marcados.
        </div>

        {pendentes.length > 0 && (
          <div className="al al-w" style={{ marginBottom: "16px", fontSize: "12px" }}>
            ⚠ {pendentes.length} pedido(s) — {formatBRL(receitaPendente)} em receita — com custo <strong>indisponível</strong>:
            a fila PEPS precisou de um lote do produto que ainda não tem custo_m2 definido (ex.: importação recente pendente
            de decisão do contador). Excluídos dos totais de CMV/margem acima até isso ser resolvido.
          </div>
        )}

        {comDataEstimada.length > 0 && (
          <div className="al al-i" style={{ marginBottom: "16px", fontSize: "12px" }}>
            ℹ {comDataEstimada.length} pedido(s) — {formatBRL(receitaDataEstimada)} em receita — com custo PEPS calculado
            usando pelo menos um lote com <strong>data de entrada estimada</strong> (migrado do saldo antigo, sem data real
            de nota fiscal): a ordem exata de consumo entre lotes de data estimada não é garantida, só é 100% confiável
            quando envolve lotes com data real.
          </div>
        )}

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
                    {l.custoIndisponivel ? (
                      <>
                        <td className="mono" style={{ color: "var(--t3)" }} colSpan={3}>
                          <span title="Pelo menos um lote deste produto ainda não tem custo_m2 definido — pendente do contador">⏳ Custo pendente</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="mono" style={{ color: "var(--warn)" }}>
                          {formatBRL(l.custo ?? 0)}
                          {l.semCusto && <span title="Sem custo/m² cadastrado" style={{ marginLeft: "4px", color: "var(--err)" }}>⚠</span>}
                        </td>
                        <td className="mono" style={{ color: corMargem(l.margemPct) }}>{formatBRL(l.margem ?? 0)}</td>
                        <td className="mono" style={{ color: corMargem(l.margemPct), fontWeight: 600 }}>{formatPercent(l.margemPct ?? 0, 1)}</td>
                      </>
                    )}
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
