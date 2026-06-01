"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidos, avancarStatusPedido, retrocederStatusPedido, deletarPedido } from "@/services/pedidos.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import type { Pedido } from "@/types";

const CHIP: Record<string, string> = {
  "Aguardando otimização":    "chip cy",
  "Em Produção – Corte":      "chip cp",
  "Em Produção – Lapidação":  "chip co",
  "Separação":                "chip cb",
  "Saiu para entrega":        "chip cb",
  "Entregue":                 "chip cg",
  "Finalizado":               "chip cg",
  "Cancelado":                "chip cr",
};

function PedidosContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pedidos, setPedidos]           = useState<Pedido[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filtro, setFiltro]             = useState(searchParams.get("busca") ?? "");
  const [comOtimizacao, setComOtimizacao] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [data, otimRows] = await Promise.all([
      getPedidos(),
      supabase.from("historico_otimizador").select("pedido_id"),
    ]);
    setPedidos(data);
    const ids = new Set<string>(
      (otimRows.data ?? []).map((r: any) => r.pedido_id as string)
    );
    setComOtimizacao(ids);
    setLoading(false);
  }

  async function handleAvancar(id: string, status: Pedido["status"]) {
    const result = await avancarStatusPedido(id, status);
    if (result) { toast(`${id} → ${result.status}`); load(); }
    else toast("Erro ao avançar status", "err");
  }

  async function handleRetroceder(id: string, status: Pedido["status"]) {
    const result = await retrocederStatusPedido(id, status);
    if (result) { toast(`${id} → ${result.status}`); load(); }
    else toast("Erro ao retroceder status", "err");
  }

  async function handleDeletar(id: string) {
    if (!confirm(`Excluir pedido ${id} permanentemente?`)) return;
    const ok = await deletarPedido(id);
    if (ok) { toast(`${id} excluído`); load(); }
    else toast("Erro ao excluir pedido", "err");
  }

  const totalValor    = pedidos.reduce((a, p) => a + Number(p.valor_total), 0);
  const totalRecebido = pedidos.reduce((a, p) => a + Number(p.valor_recebido), 0);
  const totalAberto   = totalValor - totalRecebido;
  const emProducao    = pedidos.filter(p => p.status.startsWith("Em Produção")).length;

  const filtrados = pedidos.filter(p =>
    !filtro ||
    p.id.toLowerCase().includes(filtro.toLowerCase()) ||
    p.clientes?.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    p.status.toLowerCase().includes(filtro.toLowerCase())
  );

  function btnAcao(corHover: string, bgHover: string, titulo: string, icone: string, onClick: () => void) {
    return (
      <button
        title={titulo}
        onClick={onClick}
        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = bgHover; b.style.borderColor = corHover; b.style.color = corHover; }}
        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
      >
        {icone}
      </button>
    );
  }

  function btnLink(href: string, titulo: string, icone: string, corHover: string, bgHover: string) {
    return (
      <a
        href={href}
        title={titulo}
        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", textDecoration:"none", transition:"all 0.15s" }}
        onMouseEnter={e => { const a = e.currentTarget as HTMLAnchorElement; a.style.background = bgHover; a.style.borderColor = corHover; a.style.color = corHover; }}
        onMouseLeave={e => { const a = e.currentTarget as HTMLAnchorElement; a.style.background = "transparent"; a.style.borderColor = "var(--b2)"; a.style.color = "var(--t3)"; }}
      >
        {icone}
      </a>
    );
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Pedidos</div>
        <div className="tb-search">
          <span className="tb-search-ic">⌕</span>
          <input
            placeholder="Buscar pedido ou cliente..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
          />
        </div>
        <a href="/pedidos/novo" className="btn bp sm">+ Novo Pedido</a>
      </div>

      <div className="con">

        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total",       value: String(pedidos.length),    color:"var(--t1)",   sub:"pedidos" },
            { label:"Valor Total", value: formatBRL(totalValor),     color:"var(--acc)",  sub:"soma geral" },
            { label:"Recebido",    value: formatBRL(totalRecebido),  color:"var(--ok)",   sub:"pagamentos" },
            { label:"A Receber",   value: formatBRL(totalAberto),    color:"var(--warn)", sub:"em aberto" },
            { label:"Em Produção", value: String(emProducao),        color:"var(--acc2)", sub:"em andamento" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* TABELA */}
        {loading ? (
          <div className="loading">Carregando pedidos...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Retirada</th>
                  <th>m²</th>
                  <th>Valor</th>
                  <th>Recebido</th>
                  <th>Status</th>
                  <th>Ações</th>
                  <th style={{ width:"40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>
                      Nenhum pedido encontrado
                    </td>
                  </tr>
                )}
                {filtrados.map(p => {
                  const aberto       = p.valor_total - p.valor_recebido;
                  const quitado      = aberto <= 0;
                  const finalizado   = ["Entregue","Cancelado"].includes(p.status);
                  const primeiro     = p.status === "Aguardando otimização";
                  const podeRomaneio = ["Finalizado","Entregue"].includes(p.status);
                  const temOtim      = comOtimizacao.has(p.id);

                  return (
                    <tr key={p.id}>
                      <td><span className="mono" style={{ color:"var(--acc)" }}>{p.id}</span></td>
                      <td>
                        <strong>{p.clientes?.nome ?? "—"}</strong>
                        {p.clientes?.cidade && <div className="tdim">{p.clientes.cidade}</div>}
                      </td>
                      <td className="mono">{formatDate(p.dt_pedido)}</td>
                      <td className="mono">{formatDate(p.dt_retirada)}</td>
                      <td className="mono">{Number(p.m2_total).toFixed(2)} m²</td>
                      <td className="mono">{formatBRL(p.valor_total)}</td>
                      <td>
                        <span className="mono" style={{ color: quitado ? "var(--ok)" : "var(--warn)" }}>
                          {formatBRL(p.valor_recebido)}
                        </span>
                        {!quitado && (
                          <div className="tdim" style={{ color:"var(--err)" }}>
                            − {formatBRL(aberto)}
                          </div>
                        )}
                      </td>
                      <td><span className={CHIP[p.status] ?? "chip cgr"}>{p.status}</span></td>
                      <td>
                        <div style={{ display:"flex", gap:"4px", alignItems:"center" }}>

                          {/* Ver pedido */}
                          {btnLink(`/pedidos/${p.id}`, "Ver pedido", "◉", "var(--acc)", "rgba(99,102,241,.12)")}

                          {/* Plano de corte — só se tiver otimização */}
                          {temOtim && btnLink(
                            `/pedidos/${p.id}/plano`,
                            "Ver Plano de Corte",
                            "◈",
                            "var(--ok)",
                            "rgba(16,185,129,.12)"
                          )}

                          {/* Etiquetas — só se tiver otimização */}
                          {temOtim && btnLink(
                            `/pedidos/${p.id}/etiquetas`,
                            "Imprimir Etiquetas",
                            "🏷",
                            "var(--acc2)",
                            "rgba(139,92,246,.12)"
                          )}

                          {/* Romaneio */}
                          {podeRomaneio && (
                            <button
                              title="Imprimir Romaneio de Saída"
                              onClick={() => {
                                const i = document.createElement("iframe");
                                i.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999;background:white;";
                                i.src = "/pedidos/" + p.id + "?print=1";
                                document.body.appendChild(i);
                                setTimeout(() => { document.body.removeChild(i); }, 4000);
                              }}
                              style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", height:"28px", padding:"0 8px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"10px", fontWeight:700, fontFamily:"DM Mono, monospace", letterSpacing:"0.5px", cursor:"pointer", transition:"all 0.15s" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(16,185,129,.15)"; b.style.borderColor = "var(--ok)"; b.style.color = "var(--ok)"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                            >
                              R
                            </button>
                          )}

                          {/* Retroceder / Avançar */}
                          {btnAcao("var(--warn)", "rgba(245,158,11,.15)", primeiro ? "Já está no início do fluxo" : "Retroceder etapa", "←", () => !primeiro && handleRetroceder(p.id, p.status))}
                          {btnAcao("var(--ok)",   "rgba(16,185,129,.15)", finalizado ? "Pedido encerrado" : (!temOtim && p.status === "Aguardando otimização") ? "Otimização pendente — gere o plano antes de avançar" : "Avançar etapa", "→", () => { if (finalizado) return; if (!temOtim && p.status === "Aguardando otimização") { toast("Gere a otimização de corte antes de avançar este pedido.", "warn"); return; } handleAvancar(p.id, p.status); })}
                        </div>
                      </td>
                      <td style={{ width:"40px", textAlign:"center" }}>
                        <button
                          title="Excluir pedido"
                          onClick={() => handleDeletar(p.id)}
                          style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function PedidosPage() {
  return (
    <Suspense fallback={<div />}>
      <PedidosContent />
    </Suspense>
  );
}