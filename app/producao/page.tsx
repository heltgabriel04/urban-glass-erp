"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidos, avancarStatusPedido, retrocederStatusPedido } from "@/services/pedidos.service";
import { formatBRL, formatDate, formatM2 } from "@/lib/formatters";
import type { Pedido, StatusPedido } from "@/types";
import { useToast } from "@/components/ui/toast";

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
  const { toast } = useToast();
  const router = useRouter();
  const [pedidos, setPedidos]             = useState<Pedido[]>([]);
  const [loading, setLoading]             = useState(true);
  const [comOtimizacao, setComOtimizacao] = useState<Set<string>>(new Set());
  const [vidroCliente, setVidroCliente]   = useState<Set<string>>(new Set()); // pedidos 100% vidro do cliente
  const [avancando, setAvancando]         = useState<string | null>(null);
  const [recuando, setRecuando]           = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { supabase } = await import("@/lib/supabase/client");

    const [data, otimRows, itensRows] = await Promise.all([
      getPedidos(),
      supabase.from("historico_otimizador").select("pedido_id"),
      // Busca todos os itens dos pedidos ativos para checar vidro_cliente
      supabase.from("itens_pedido").select("pedido_id, vidro_cliente"),
    ]);

    const filtrados = data.filter(p => COLUNAS.includes(p.status as StatusPedido));
    setPedidos(filtrados);

    const otimIds = new Set<string>((otimRows.data ?? []).map((r: any) => r.pedido_id as string));
    setComOtimizacao(otimIds);

    // Monta set de pedidos onde TODOS os itens são vidro_cliente = true
    const itensPorPedido = new Map<string, boolean[]>();
    for (const row of (itensRows.data ?? []) as { pedido_id: string; vidro_cliente: boolean }[]) {
      if (!itensPorPedido.has(row.pedido_id)) itensPorPedido.set(row.pedido_id, []);
      itensPorPedido.get(row.pedido_id)!.push(row.vidro_cliente);
    }
    const vcIds = new Set<string>();
    for (const [pid, flags] of itensPorPedido.entries()) {
      if (flags.length > 0 && flags.every(f => f === true)) vcIds.add(pid);
    }
    setVidroCliente(vcIds);

    setLoading(false);
  }

  async function handleAvancar(p: Pedido) {
    const eVidroCliente = vidroCliente.has(p.id);

    // Bloquear somente se NÃO tem otimização E NÃO é 100% vidro do cliente
    if (p.status === "Aguardando otimização" && !comOtimizacao.has(p.id) && !eVidroCliente) {
      toast("Gere a otimização de corte antes de avançar para produção.", "warn");
      return;
    }

    setAvancando(p.id);
    await avancarStatusPedido(p.id, p.status as StatusPedido);
    setAvancando(null);
    load();
  }

  async function handleRetroceder(p: Pedido) {
    setRecuando(p.id);
    await retrocederStatusPedido(p.id, p.status as StatusPedido);
    setRecuando(null);
    load();
  }

  const porCol   = (col: StatusPedido) => pedidos.filter(p => p.status === col);
  const totalM2  = pedidos.reduce((a, p) => a + Number(p.m2_total), 0);
  const totalVal = pedidos.reduce((a, p) => a + Number(p.valor_total), 0);

  const hoje = new Date();
  const em3dias = new Date(hoje); em3dias.setDate(hoje.getDate() + 3);
  const retiradaProxima = pedidos.filter(p => {
    if (!p.dt_retirada) return false;
    const d = new Date(p.dt_retirada);
    return d >= hoje && d <= em3dias && p.status !== "Finalizado";
  });

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Produção</div>
      </div>

      <div className="con">
        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Em Produção",        value: String(pedidos.length), color:"var(--t1)",   sub:"pedidos ativos" },
            { label:"m² Total",           value: formatM2(totalM2),      color:"var(--acc2)", sub:"em processamento" },
            { label:"Valor Total",        value: formatBRL(totalVal),    color:"var(--acc)",  sub:"em produção" },
            { label:"Retirada em 3 dias", value: String(retiradaProxima.length), color: retiradaProxima.length > 0 ? "var(--warn)" : "var(--ok)", sub: retiradaProxima.length > 0 ? "⚠ atenção" : "✓ sem urgência" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Alerta retirada próxima */}
        {retiradaProxima.length > 0 && (
          <div style={{ marginBottom:"16px", display:"flex", flexDirection:"column", gap:"6px" }}>
            {retiradaProxima.map(p => {
              const dias = Math.ceil((new Date(p.dt_retirada!).getTime() - hoje.getTime()) / 86400000);
              return (
                <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)", borderRadius:"8px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                    <span style={{ fontSize:"13px", fontWeight:700, color:"var(--warn)" }}>⚠</span>
                    <div>
                      <span style={{ fontSize:"13px", fontWeight:700, color:"var(--acc)", fontFamily:"'DM Mono', monospace" }}>{p.id}</span>
                      <span style={{ fontSize:"12px", color:"var(--t2)", marginLeft:"10px" }}>{p.clientes?.nome}</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:"16px" }}>
                    <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono', monospace" }}>{p.status}</span>
                    <span style={{ fontSize:"12px", fontWeight:700, color:"var(--warn)", fontFamily:"'DM Mono', monospace" }}>
                      {dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`} · {formatDate(p.dt_retirada)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
                      <div style={{ fontSize:"11px", color:"var(--t3)", padding:"8px 0", textAlign:"center" }}>Nenhum pedido</div>
                    )}

                    {items.map(p => {
                      const eVidroCliente = vidroCliente.has(p.id);
                      const semOtim = p.status === "Aguardando otimização" && !comOtimizacao.has(p.id) && !eVidroCliente;
                      const diasRet = p.dt_retirada
                        ? Math.ceil((new Date(p.dt_retirada).getTime() - hoje.getTime()) / 86400000)
                        : null;
                      const retUrgente = diasRet !== null && diasRet <= 3 && !ultimo;

                      return (
                        <div key={p.id} className="kbcard" style={{ borderLeft: retUrgente ? "3px solid var(--warn)" : undefined, cursor: "pointer" }} onClick={() => router.push(`/pedidos/${p.id}`)}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span className="kbcid">{p.id}</span>
                            <div style={{ display:"flex", gap:"4px", alignItems:"center" }}>
                              {eVidroCliente && (
                                <span style={{ fontSize:"9px", color:"var(--warn)", fontFamily:"'DM Mono',monospace", fontWeight:700 }} title="Vidro do cliente">📦</span>
                              )}
                              {retUrgente && (
                                <span style={{ fontSize:"9px", color:"var(--warn)", fontFamily:"'DM Mono', monospace", fontWeight:700 }}>
                                  {diasRet === 0 ? "HOJE" : diasRet === 1 ? "AMANHÃ" : `${diasRet}d`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="kbcn">{p.clientes?.nome ?? "—"}</div>
                          <div className="kbcm">
                            <span>{formatM2(p.m2_total)}</span>
                            <span style={{ color:"var(--acc)" }}>{formatBRL(p.valor_total)}</span>
                          </div>
                          {p.dt_retirada && (
                            <div style={{ fontSize:"10px", color: retUrgente ? "var(--warn)" : "var(--t3)", marginTop:"4px", fontFamily:"'DM Mono', monospace" }}>
                              Ret: {formatDate(p.dt_retirada)}
                            </div>
                          )}

                          {/* Ação: precisa otimizar */}
                          {semOtim && (
                            <a
                              href={`/otimizador?pedido=${p.id}`}
                              onClick={e => e.stopPropagation()}
                              style={{ display:"block", marginTop:"8px", textAlign:"center", fontSize:"10px", color:"var(--warn)", background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)", borderRadius:"5px", padding:"4px 0", textDecoration:"none" }}
                            >
                              ◈ Otimizar primeiro
                            </a>
                          )}

                          {/* Ação: vidro do cliente — pode avançar sem otimização */}
                          {!ultimo && !semOtim && p.status === "Aguardando otimização" && eVidroCliente && !comOtimizacao.has(p.id) && (
                            <div style={{ marginTop:"6px", fontSize:"10px", color:"var(--warn)", fontFamily:"'DM Mono',monospace", textAlign:"center" }}>
                              📦 vidro do cliente
                            </div>
                          )}

                          {!ultimo && !semOtim && (
                            <div style={{ display:"flex", gap:"4px", marginTop:"8px" }}>
                              {p.status !== COLUNAS[0] && (
                                <button
                                  className="btn bg xs"
                                  style={{ flex: 1 }}
                                  disabled={recuando === p.id}
                                  onClick={e => { e.stopPropagation(); handleRetroceder(p); }}
                                >
                                  {recuando === p.id ? "..." : "← Recuar"}
                                </button>
                              )}
                              <button
                                className="btn bp xs"
                                style={{ flex: 1 }}
                                disabled={avancando === p.id}
                                onClick={e => { e.stopPropagation(); handleAvancar(p); }}
                              >
                                {avancando === p.id ? "..." : "Avançar →"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                    {pedidos.map(p => {
                      const eVidroCliente = vidroCliente.has(p.id);
                      const semOtim  = p.status === "Aguardando otimização" && !comOtimizacao.has(p.id) && !eVidroCliente;
                      const diasRet  = p.dt_retirada ? Math.ceil((new Date(p.dt_retirada).getTime() - hoje.getTime()) / 86400000) : null;
                      const urgente  = diasRet !== null && diasRet <= 3;
                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                              <a href={`/pedidos/${p.id}`} className="mono" style={{ color:"var(--acc)", textDecoration:"none" }}>{p.id}</a>
                              {eVidroCliente && <span title="Vidro do cliente" style={{ fontSize:"11px" }}>📦</span>}
                            </div>
                          </td>
                          <td><strong>{p.clientes?.nome ?? "—"}</strong></td>
                          <td>
                            <span className="chip" style={{ background: COR_COL[p.status] + "22", color: COR_COL[p.status], border:`1px solid ${COR_COL[p.status]}44` }}>
                              {p.status}
                            </span>
                          </td>
                          <td className="mono">{formatM2(p.m2_total)}</td>
                          <td className="mono">{formatBRL(p.valor_total)}</td>
                          <td className="mono" style={{ color: urgente ? "var(--warn)" : "var(--t2)", fontWeight: urgente ? 700 : 400 }}>
                            {formatDate(p.dt_retirada)}
                            {urgente && <span style={{ marginLeft:"6px", fontSize:"10px" }}>⚠</span>}
                          </td>
                          <td>
                            {p.status !== "Finalizado" && (
                              semOtim ? (
                                <a href={`/otimizador?pedido=${p.id}`} className="btn bg xs" style={{ textDecoration:"none", color:"var(--warn)", borderColor:"rgba(245,158,11,.4)" }}>
                                  ◈ Otimizar
                                </a>
                              ) : (
                                <div style={{ display:"flex", gap:"4px" }}>
                                  {p.status !== COLUNAS[0] && (
                                    <button className="btn bg xs" disabled={recuando === p.id} onClick={() => handleRetroceder(p)}>
                                      {recuando === p.id ? "..." : "← Recuar"}
                                    </button>
                                  )}
                                  <button className="btn bp xs" disabled={avancando === p.id} onClick={() => handleAvancar(p)}>
                                    {avancando === p.id ? "..." : "Avançar →"}
                                  </button>
                                </div>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
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