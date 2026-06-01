"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidos, avancarStatusPedido } from "@/services/pedidos.service";
import { formatBRL, formatDate, formatM2 } from "@/lib/formatters";
import type { Pedido, StatusPedido } from "@/types";

const COLUNAS: StatusPedido[] = [
  "Aguardando otimização",
  "Em Produção – Corte",
  "Em Produção – Lapidação",
  "Separação",
  "Finalizado",
];

const COR_COL: Record<string, string> = {
  "Aguardando otimização":   "var(--warn)",
  "Em Produção – Corte":     "var(--acc4)",
  "Em Produção – Lapidação": "var(--acc3)",
  "Separação":               "var(--acc)",
  "Finalizado":              "var(--ok)",
};

export default function ProducaoPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await getPedidos();
    setPedidos(data.filter(p => COLUNAS.includes(p.status as StatusPedido)));
    setLoading(false);
  }

  async function handleAvancar(id: string, status: StatusPedido) {
    await avancarStatusPedido(id, status);
    load();
  }

  const porCol   = (col: StatusPedido) => pedidos.filter(p => p.status === col);
  const totalM2  = pedidos.reduce((a, p) => a + Number(p.m2_total), 0);
  const totalVal = pedidos.reduce((a, p) => a + Number(p.valor_total), 0);
  const finalizados = porCol("Finalizado").length;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Produção</div>
      </div>

      <div className="con">

        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Em Produção",  value: String(pedidos.length),  color:"var(--t1)",   sub:"pedidos ativos" },
            { label:"m² Total",     value: formatM2(totalM2),        color:"var(--acc2)", sub:"em processamento" },
            { label:"Valor Total",  value: formatBRL(totalVal),      color:"var(--acc)",  sub:"em produção" },
            { label:"Finalizados",  value: String(finalizados),      color:"var(--ok)",   sub:"aguardando entrega" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando produção...</div>
        ) : (
          <>
            {/* Kanban */}
            <div className="kb mb14">
              {COLUNAS.map(col => {
                const items = porCol(col);
                const ultimo = col === "Finalizado";
                return (
                  <div key={col} className="kbc" style={{ minWidth:"220px" }}>
                    <div className="kbt" style={{ color: COR_COL[col] }}>
                      {col}
                      <span style={{ background: COR_COL[col], color:"#090b10", borderRadius:"99px", padding:"1px 7px", fontSize:"10px" }}>
                        {items.length}
                      </span>
                    </div>

                    {items.length === 0 && (
                      <div style={{ fontSize:"11px", color:"var(--t3)", padding:"8px 0", textAlign:"center" }}>
                        Nenhum pedido
                      </div>
                    )}

                    {items.map(p => (
                      <div key={p.id} className="kbcard">
                        <div className="kbcid">{p.id}</div>
                        <div className="kbcn">{p.clientes?.nome ?? "—"}</div>
                        <div className="kbcm">
                          <span>{formatM2(p.m2_total)}</span>
                          <span style={{ color:"var(--acc)" }}>{formatBRL(p.valor_total)}</span>
                        </div>
                        {p.dt_retirada && (
                          <div style={{ fontSize:"10px", color:"var(--t3)", marginTop:"4px", fontFamily:"'DM Mono', monospace" }}>
                            Ret: {formatDate(p.dt_retirada)}
                          </div>
                        )}
                        {!ultimo && (
                          <button
                            className="btn bp xs"
                            style={{ marginTop:"8px", width:"100%" }}
                            onClick={() => handleAvancar(p.id, p.status as StatusPedido)}
                          >
                            Avançar →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Tabela resumo */}
            <div className="card">
              <div className="ct">Resumo da Produção</div>
              <div className="tw" style={{ border:"none", borderRadius:0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Pedido</th><th>Cliente</th><th>Status</th>
                      <th>m²</th><th>Valor</th><th>Retirada</th><th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--t3)", padding:"24px" }}>Nenhum pedido em produção</td></tr>
                    )}
                    {pedidos.map(p => (
                      <tr key={p.id}>
                        <td><span className="mono" style={{ color:"var(--acc)" }}>{p.id}</span></td>
                        <td><strong>{p.clientes?.nome ?? "—"}</strong></td>
                        <td>
                          <span className="chip" style={{ background: COR_COL[p.status] + "22", color: COR_COL[p.status], border:`1px solid ${COR_COL[p.status]}44` }}>
                            {p.status}
                          </span>
                        </td>
                        <td className="mono">{formatM2(p.m2_total)}</td>
                        <td className="mono">{formatBRL(p.valor_total)}</td>
                        <td className="mono">{formatDate(p.dt_retirada)}</td>
                        <td>
                          {p.status !== "Finalizado" && (
                            <button className="btn bp xs" onClick={() => handleAvancar(p.id, p.status as StatusPedido)}>
                              Avançar →
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}