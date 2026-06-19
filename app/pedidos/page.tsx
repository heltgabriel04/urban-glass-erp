"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidosPaginado, getPedidosTotais, avancarStatusPedido, retrocederStatusPedido, deletarPedido, type PedidosTotais, type TabPedidos } from "@/services/pedidos.service";
import { getClientes } from "@/services/clientes.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import type { Pedido, Cliente } from "@/types";

const CHIP: Record<string, string> = {
  "Aguardando otimização":    "chip cy",
  "Em Produção – Corte":      "chip cp",
  "Qualidade (Corte)":        "chip cg",
  "Em Produção – Lapidação":  "chip co",
  "Qualidade (Lapidação)":    "chip cg",
  "Separação":                "chip cb",
  "Entregue":                 "chip cg",
  "Finalizado":               "chip cg",
  "Cancelado":                "chip cr",
};

const CHAPAS_DIMS = [
  { w: 3300, h: 2250 }, { w: 2250, h: 3300 },
  { w: 3660, h: 2140 }, { w: 2140, h: 3660 },
  { w: 2150, h: 3660 }, { w: 3660, h: 2150 },
];

function isChapaInteira(largura: number, altura: number): boolean {
  return CHAPAS_DIMS.some(c =>
    Math.abs(largura - c.w) < 50 && Math.abs(altura - c.h) < 50
  );
}

const PAGE_SIZE = 50;

export default function PedidosPage() {
  return (
    <Suspense fallback={null}>
      <PedidosPageInner />
    </Suspense>
  );
}

function PedidosPageInner() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pedidos, setPedidos]             = useState<Pedido[]>([]);
  const [loading, setLoading]             = useState(true);
  const [filtro, setFiltro]               = useState(searchParams.get("q") ?? "");
  const [tab, setTab]                     = useState<TabPedidos>((searchParams.get("tab") as TabPedidos) || "todos");
  const [page, setPage]                   = useState(Number(searchParams.get("page") ?? 0)); // 0-based
  const [total, setTotal]                 = useState(0);
  const [totais, setTotais]               = useState<PedidosTotais>({ count: 0, valorTotal: 0, recebido: 0, emProducao: 0 });
  const [comOtimizacao, setComOtimizacao] = useState<Set<string>>(new Set());
  const [pedidosChapa, setPedidosChapa]   = useState<Set<string>>(new Set());
  const [pedidosVidroCliente, setPedidosVidroCliente] = useState<Set<string>>(new Set());
  const [deletando, setDeletando]         = useState<Set<string>>(new Set());
  const [clientes, setClientes]           = useState<Cliente[]>([]);
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);

  useEffect(() => { getClientes().then(setClientes); }, []);

  // Recarrega ao mudar página, busca ou aba (busca com debounce de 300ms).
  // A URL é atualizada (sem novo histórico) junto, para que "Voltar" do detalhe do pedido
  // retorne para esta mesma busca/aba/página em vez de resetar os filtros.
  useEffect(() => {
    const t = setTimeout(() => {
      load();
      const params = new URLSearchParams();
      if (filtro.trim()) params.set("q", filtro.trim());
      if (tab !== "todos") params.set("tab", tab);
      if (page > 0) params.set("page", String(page));
      const qs = params.toString();
      router.replace(qs ? `/pedidos?${qs}` : "/pedidos", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filtro, tab]);

  const termoBusca = filtro.trim().toLowerCase();
  const sugestoesClientes = termoBusca.length === 0 ? [] : clientes
    .filter(c => c.nome.toLowerCase().includes(termoBusca))
    .slice(0, 8);

  function selecionarCliente(cliente: Cliente) {
    setFiltro(cliente.nome);
    setPage(0);
    setSugestoesAbertas(false);
  }

  async function load() {
    setLoading(true);
    const [{ rows, total: tot }, totaisFiltrados] = await Promise.all([
      getPedidosPaginado({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, busca: filtro, tab }),
      getPedidosTotais(filtro),
    ]);
    setPedidos(rows);
    setTotal(tot);
    setTotais(totaisFiltrados);

    // Badges (otimização / chapa inteira / vidro do cliente) só da página visível
    const ids = rows.map(p => p.id);
    if (ids.length === 0) {
      setComOtimizacao(new Set());
      setPedidosChapa(new Set());
      setPedidosVidroCliente(new Set());
      setLoading(false);
      return;
    }

    const [otimRows, itensRows] = await Promise.all([
      supabase.from("historico_otimizador").select("pedido_id").in("pedido_id", ids),
      supabase.from("itens_pedido").select("pedido_id, largura, altura, vidro_cliente").in("pedido_id", ids),
    ]);

    setComOtimizacao(new Set<string>((otimRows.data ?? []).map((r: any) => r.pedido_id as string)));

    // Agrupa itens por pedido
    const itensPorPedido: Record<string, any[]> = {};
    for (const item of (itensRows.data ?? [])) {
      if (!itensPorPedido[item.pedido_id]) itensPorPedido[item.pedido_id] = [];
      itensPorPedido[item.pedido_id].push(item);
    }

    // Detecta pedidos de chapa inteira e vidro do cliente
    const chapas = new Set<string>();
    const vidroCliente = new Set<string>();
    for (const [pedidoId, itens] of Object.entries(itensPorPedido)) {
      if (itens.length > 0 && itens.every((i: any) => isChapaInteira(i.largura, i.altura))) {
        chapas.add(pedidoId);
      }
      if (itens.length > 0 && itens.every((i: any) => i.vidro_cliente === true)) {
        vidroCliente.add(pedidoId);
      }
    }
    setPedidosChapa(chapas);
    setPedidosVidroCliente(vidroCliente);

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
    if (!confirm(`Excluir pedido ${id} permanentemente? Esta ação não pode ser desfeita.`)) return;
    setDeletando(prev => new Set(prev).add(id));
    const { ok, erro } = await deletarPedido(id);
    setDeletando(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (ok) { toast(`Pedido ${id} excluído`); load(); }
    else toast(erro ? `Erro ao excluir: ${erro}` : "Erro ao excluir pedido", "err");
  }

  const totalAberto = totais.valorTotal - totais.recebido;
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function btnAcao(corHover: string, bgHover: string, titulo: string, icone: string, onClick: () => void) {
    return (
      <button
        title={titulo}
        onClick={e => { e.stopPropagation(); onClick(); }}
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
        onClick={e => e.stopPropagation()}
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
            onChange={e => { setFiltro(e.target.value); setPage(0); setSugestoesAbertas(true); }}
            onFocus={() => setSugestoesAbertas(true)}
            onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
            style={filtro ? { paddingRight: "22px" } : undefined}
          />
          {filtro && (
            <button
              type="button"
              title="Limpar busca"
              onClick={() => { setFiltro(""); setPage(0); setSugestoesAbertas(false); }}
              style={{ position:"absolute", right:"6px", top:"50%", transform:"translateY(-50%)", width:"16px", height:"16px", display:"flex", alignItems:"center", justifyContent:"center", border:"none", background:"transparent", color:"var(--t3)", cursor:"pointer", fontSize:"13px", lineHeight:1, padding:0 }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--t1)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--t3)"}
            >×</button>
          )}
          {sugestoesAbertas && sugestoesClientes.length > 0 && (
            <ul style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
              background: "var(--surf2)", border: "1px solid var(--acc)",
              borderRadius: "8px", marginTop: "4px", padding: "4px",
              listStyle: "none", maxHeight: "220px", overflowY: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,.4)",
            }}>
              {sugestoesClientes.map(c => (
                <li
                  key={c.id}
                  onMouseDown={() => selecionarCliente(c)}
                  style={{ padding: "8px 10px", borderRadius: "6px", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLLIElement).style.background = "rgba(61,255,160,.12)"}
                  onMouseLeave={e => (e.currentTarget as HTMLLIElement).style.background = "transparent"}
                >
                  <div style={{ fontSize: "13px", color: "var(--t1)", fontWeight: 500 }}>{c.nome}</div>
                  {c.cidade && <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px", fontFamily: "'DM Mono', monospace" }}>{c.cidade}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <a href="/pedidos/novo" className="btn bp sm">+ Novo Pedido</a>
      </div>

      <div className="con">

        {filtro.trim() && (
          <div style={{ fontSize:"12px", color:"var(--t3)", marginBottom:"10px" }}>
            Totais filtrados por: <strong style={{ color:"var(--t1)" }}>{filtro.trim()}</strong>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total",       value: String(totais.count),        color:"var(--t1)",   sub:"pedidos" },
            { label:"Valor Total", value: formatBRL(totais.valorTotal), color:"var(--acc)",  sub:"soma geral" },
            { label:"Recebido",    value: formatBRL(totais.recebido),   color:"var(--ok)",   sub:"pagamentos" },
            { label:"A Receber",   value: formatBRL(totalAberto),       color:"var(--warn)", sub:"em aberto" },
            { label:"Em Produção", value: String(totais.emProducao),    color:"var(--acc2)", sub:"em andamento" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs de filtro */}
        <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid var(--b1)", marginBottom: "16px" }}>
          {([
            { key: "todos",    label: "Todos" },
            { key: "ativos",   label: "Em Produção" },
            { key: "aberto",   label: "Em Aberto" },
            { key: "quitado",  label: "Quitados" },
            { key: "entregue", label: "Entregues" },
            { key: "cancelado",label: "Cancelados" },
          ] as { key: TabPedidos; label: string }[]).map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(0); }} style={{
              padding: "8px 16px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer",
              background: "transparent", borderBottom: tab === t.key ? "2px solid var(--acc)" : "2px solid transparent",
              color: tab === t.key ? "var(--acc)" : "var(--t3)", marginBottom: "-1px", letterSpacing: "0.04em",
            }}>{t.label}</button>
          ))}
        </div>

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
                {pedidos.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>
                      Nenhum pedido encontrado
                    </td>
                  </tr>
                )}
                {pedidos.map(p => {
                  const aberto        = p.valor_total - p.valor_recebido;
                  const quitado       = aberto <= 0;
                  const finalizado    = ["Entregue","Cancelado"].includes(p.status);
                  const primeiro      = p.status === "Aguardando otimização";
                  const podeRomaneio  = true;
                  const temOtim       = comOtimizacao.has(p.id);
                  const isChapa       = pedidosChapa.has(p.id);
                  const isVidroCliente = pedidosVidroCliente.has(p.id);
                  const podeAvancarSemOtim = temOtim || isChapa || isVidroCliente;
                  const bloqueado     = !finalizado && p.status === "Aguardando otimização" && !podeAvancarSemOtim;
                  const temEtiqueta   = temOtim || isChapa || isVidroCliente;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/pedidos/${p.id}`)}
                      style={{ cursor:"pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                    >
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

                          {temOtim && btnLink(`/pedidos/${p.id}/plano`, "Ver Plano de Corte", "◈", "var(--ok)", "rgba(16,185,129,.12)")}

                          {temEtiqueta && btnLink(`/pedidos/${p.id}/etiquetas`, "Imprimir Etiquetas", "🏷", "var(--acc2)", "rgba(139,92,246,.12)")}

                          {podeRomaneio && (
                            <button
                              title="Imprimir Romaneio de Saída"
                              onClick={e => {
                                e.stopPropagation();
                                const nome = (p as any).clientes?.nome ?? "Cliente";
                                const data = p.dt_pedido
                                  ? new Date(p.dt_pedido + "T00:00:00").toLocaleDateString("pt-BR").replace(/\//g, "-")
                                  : "";
                                const tituloOriginal = document.title;
                                document.title = `${nome} - ${data}`;
                                const i = document.createElement("iframe");
                                i.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999;background:white;";
                                i.src = "/pedidos/" + p.id + "?print=1";
                                document.body.appendChild(i);
                                setTimeout(() => { document.body.removeChild(i); document.title = tituloOriginal; }, 5000);
                              }}
                              style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", height:"28px", padding:"0 8px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"10px", fontWeight:700, fontFamily:"DM Mono, monospace", letterSpacing:"0.5px", cursor:"pointer", transition:"all 0.15s" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(16,185,129,.15)"; b.style.borderColor = "var(--ok)"; b.style.color = "var(--ok)"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                            >R</button>
                          )}

                          {btnAcao("var(--warn)", "rgba(245,158,11,.15)",
                            primeiro ? "Já está no início do fluxo" : "Retroceder etapa",
                            "←",
                            () => !primeiro && handleRetroceder(p.id, p.status)
                          )}

                          {btnAcao("var(--ok)", "rgba(16,185,129,.15)",
                            finalizado ? "Pedido encerrado" : bloqueado ? "Otimização pendente — gere o plano antes de avançar" : "Avançar etapa",
                            "→",
                            () => {
                              if (finalizado) return;
                              if (bloqueado) { toast("Gere a otimização de corte antes de avançar este pedido.", "warn"); return; }
                              handleAvancar(p.id, p.status);
                            }
                          )}
                        </div>
                      </td>
                      <td style={{ width:"40px", textAlign:"center" }}>
                        <button
                          title="Excluir pedido"
                          disabled={deletando.has(p.id)}
                          onClick={e => { e.stopPropagation(); handleDeletar(p.id); }}
                          style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color: deletando.has(p.id) ? "var(--err)" : "var(--t3)", fontSize:deletando.has(p.id) ? "9px" : "13px", cursor: deletando.has(p.id) ? "not-allowed" : "pointer", transition:"all 0.15s", opacity: deletando.has(p.id) ? 0.6 : 1 }}
                          onMouseEnter={e => { if (!deletando.has(p.id)) { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; } }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = deletando.has(p.id) ? "var(--err)" : "var(--t3)"; }}
                        >{deletando.has(p.id) ? "..." : "🗑"}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:"16px", fontSize:"12px", color:"var(--t3)" }}>
              <span>
                {total === 0
                  ? "0 pedidos"
                  : `Mostrando ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} de ${total}`}
              </span>
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ padding:"6px 12px", borderRadius:"6px", border:"1px solid var(--b2)", background:"transparent", color: page === 0 ? "var(--t4,#555)" : "var(--t2)", cursor: page === 0 ? "not-allowed" : "pointer" }}
                >◀ Anterior</button>
                <span className="mono">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  style={{ padding:"6px 12px", borderRadius:"6px", border:"1px solid var(--b2)", background:"transparent", color: page >= totalPages - 1 ? "var(--t4,#555)" : "var(--t2)", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer" }}
                >Próxima ▶</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}