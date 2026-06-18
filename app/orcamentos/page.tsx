"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getOrcamentos, updateOrcamento, aprovarOrcamento, rejeitarOrcamento, deletarOrcamento } from "@/services/orcamentos.service";
import { formatBRL, formatDate, formatPercent } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import SearchInput from "@/components/ui/SearchInput";

const CHIP: Record<string, string> = {
  "Rascunho":  "chip cgr",
  "Enviado":   "chip cy",
  "Aprovado":  "chip cg",
  "Rejeitado": "chip cr",
};

const FILTROS = ["Todos", "Rascunho", "Enviado", "Aprovado", "Rejeitado"];
const MOTIVOS = ["Preço", "Prazo de entrega", "Prazo de pagamento", "Transporte", "Desistência"];

export default function OrcamentosPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busca, setBusca]           = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [modalRejeicao, setModalRejeicao] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [obsRejeicao, setObsRejeicao] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await getOrcamentos();
    setOrcamentos(data);
    setLoading(false);
  }

  async function handleStatus(id: string, status: "Enviado" | "Aprovado") {
    if (status === "Aprovado") {
      const result = await aprovarOrcamento(id);
      if (result) { toast(`Orçamento ${id} aprovado — pedido gerado`); load(); }
      else toast("Erro ao aprovar orçamento", "err");
    } else {
      const result = await updateOrcamento(id, { status } as any);
      if (result) { toast(`Orçamento ${id} marcado como ${status}`); load(); }
      else toast("Erro ao atualizar status", "err");
    }
  }

  function abrirModalRejeicao(id: string) {
    setModalRejeicao(id);
    setMotivoRejeicao("");
    setObsRejeicao("");
  }

  async function confirmarRejeicao() {
    if (!modalRejeicao) return;
    const id = modalRejeicao;
    setModalRejeicao(null);
    const result = await rejeitarOrcamento(id, motivoRejeicao || null, obsRejeicao || null);
    if (result) { toast(`Orçamento ${id} rejeitado`); load(); }
    else toast("Erro ao rejeitar orçamento", "err");
  }

  async function handleDeletar(id: string) {
    if (!confirm(`Excluir ${id} permanentemente? O pedido vinculado também será removido.`)) return;
    const ok = await deletarOrcamento(id);
    if (ok) { toast(`${id} excluído`); load(); }
    else toast("Erro ao excluir orçamento", "err");
  }

  const filtrados = orcamentos.filter(o => {
    const matchBusca = !busca ||
      o.id.toLowerCase().includes(busca.toLowerCase()) ||
      o.clientes?.nome?.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "Todos" || o.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  const totalValor      = orcamentos.reduce((a, o) => a + Number(o.valor_total), 0);
  const totalAprovados  = orcamentos.filter(o => o.status === "Aprovado").length;
  const totalPendentes  = orcamentos.filter(o => ["Rascunho", "Enviado"].includes(o.status)).length;
  const totalRejeitados = orcamentos.filter(o => o.status === "Rejeitado").length;
  // Taxa de conversão: aprovados ÷ decididos (aprovados + rejeitados); ignora pendentes.
  const decididos     = totalAprovados + totalRejeitados;
  const taxaConversao = decididos > 0 ? (totalAprovados / decididos) * 100 : 0;

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

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Orçamentos</div>
        <SearchInput placeholder="Buscar orçamento ou cliente..." value={busca} onChange={setBusca} />
        <a href="/orcamentos/novo" className="btn bp sm">+ Novo Orçamento</a>
      </div>

      <div className="con">

        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total",       value: String(orcamentos.length), color:"var(--t1)",   sub:"orçamentos" },
            { label:"Valor Total", value: formatBRL(totalValor),     color:"var(--acc)",  sub:"soma geral" },
            { label:"Aprovados",   value: String(totalAprovados),    color:"var(--ok)",   sub:"convertidos" },
            { label:"Pendentes",   value: String(totalPendentes),    color:"var(--warn)", sub:"rascunho + enviado" },
            { label:"Rejeitados",  value: String(totalRejeitados),   color:"var(--err)",  sub:"não aprovados" },
            { label:"Conversão",   value: formatPercent(taxaConversao, 0), color:"var(--acc2)", sub:"aprov. ÷ decididos" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* FILTROS */}
        <div style={{ display:"flex", gap:"6px", marginBottom:"14px" }}>
          {FILTROS.map(f => (
            <button
              key={f}
              onClick={() => setFiltroStatus(f)}
              style={{
                padding:"5px 14px", borderRadius:"99px", border:"1px solid", fontSize:"12px", cursor:"pointer",
                fontFamily:"'Inter', sans-serif", fontWeight: filtroStatus === f ? 700 : 400,
                background: filtroStatus === f
                  ? f === "Aprovado"  ? "rgba(16,185,129,.15)"
                  : f === "Rejeitado" ? "rgba(244,63,94,.15)"
                  : f === "Enviado"   ? "rgba(245,158,11,.15)"
                  : "var(--surf2)" : "transparent",
                borderColor: filtroStatus === f
                  ? f === "Aprovado"  ? "var(--ok)"
                  : f === "Rejeitado" ? "var(--err)"
                  : f === "Enviado"   ? "var(--warn)"
                  : "var(--b2)" : "var(--b1)",
                color: filtroStatus === f
                  ? f === "Aprovado"  ? "var(--ok)"
                  : f === "Rejeitado" ? "var(--err)"
                  : f === "Enviado"   ? "var(--warn)"
                  : "var(--t1)" : "var(--t2)",
                transition:"all 0.15s",
              }}
            >
              {f}
              {f !== "Todos" && (
                <span style={{ marginLeft:"6px", opacity:0.7, fontSize:"10px" }}>
                  {orcamentos.filter(o => o.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* TABELA */}
        {loading ? (
          <div className="loading">Carregando orçamentos...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Orçamento</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Validade</th>
                  <th>m²</th>
                  <th>Valor Total</th>
                  <th>Status</th>
                  <th>Pedido</th>
                  <th>Ações</th>
                  <th style={{ width:"40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>
                      Nenhum orçamento encontrado
                    </td>
                  </tr>
                )}
                {filtrados.map(o => (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/orcamentos/${o.id}`)}
                    style={{ cursor:"pointer" }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                  >
                    <td><span className="mono" style={{ color:"var(--acc)" }}>{o.id}</span></td>
                    <td>
                      <strong>{o.clientes?.nome ?? "—"}</strong>
                      {o.clientes?.cidade && <div className="tdim">{o.clientes.cidade}</div>}
                    </td>
                    <td className="mono">{formatDate(o.dt_orcamento)}</td>
                    <td className="mono">{formatDate(o.dt_validade) || "—"}</td>
                    <td className="mono">{Number(o.m2_total).toFixed(2)} m²</td>
                    <td className="mono" style={{ color:"var(--acc)", fontWeight:600 }}>{formatBRL(o.valor_total)}</td>
                    <td><span className={CHIP[o.status] ?? "chip cgr"}>{o.status}</span></td>
                    <td>
                      {o.pedido_id ? (
                        <a href={`/pedidos/${o.pedido_id}`} className="mono" onClick={e => e.stopPropagation()} style={{ color:"var(--acc2)", fontSize:"12px" }}>{o.pedido_id}</a>
                      ) : (
                        <span style={{ color:"var(--t3)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display:"flex", gap:"4px", alignItems:"center" }}>
                        <button
                          title="Gerar PDF"
                          onClick={e => {
                            e.stopPropagation();
                            const nome = o.clientes?.nome ?? "Cliente";
                            const data = o.dt_orcamento
                              ? new Date(o.dt_orcamento + "T00:00:00").toLocaleDateString("pt-BR").replace(/\//g, "-")
                              : "";
                            const tituloOriginal = document.title;
                            document.title = `${nome} - ${data}`;
                            const iframe = document.createElement("iframe");
                            iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999;background:white;";
                            iframe.src = `/orcamentos/${o.id}?print=1`;
                            document.body.appendChild(iframe);
                            setTimeout(() => { document.body.removeChild(iframe); document.title = tituloOriginal; }, 5000);
                          }}
                          style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", height:"28px", padding:"0 8px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"10px", fontWeight:700, fontFamily:"'DM Mono', monospace", letterSpacing:"0.5px", cursor:"pointer", transition:"all 0.15s" }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(99,179,237,.15)"; b.style.borderColor = "var(--acc2)"; b.style.color = "var(--acc2)"; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                        >
                          PDF
                        </button>
                        {btnAcao("var(--warn)", "rgba(245,158,11,.15)",  "Marcar como Enviado",  "✉", () => handleStatus(o.id, "Enviado"))}
                        {btnAcao("var(--ok)",   "rgba(16,185,129,.15)",  "Aprovar orçamento",    "✓", () => handleStatus(o.id, "Aprovado"))}
                        {btnAcao("var(--err)",  "rgba(244,63,94,.15)",   "Rejeitar orçamento",   "✕", () => abrirModalRejeicao(o.id))}
                      </div>
                    </td>
                    <td style={{ width:"40px", textAlign:"center" }}>
                      <button
                        title="Excluir orçamento"
                        onClick={e => { e.stopPropagation(); handleDeletar(o.id); }}
                        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Rejeição */}
      {modalRejeicao && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalRejeicao(null)}>
          <div className="mod" style={{ width:"420px" }}>
            <div className="mhd">
              <div className="mtit">Rejeitar orçamento <span style={{ color:"var(--acc)" }}>{modalRejeicao}</span></div>
              <button className="mcl" onClick={() => setModalRejeicao(null)}>✕</button>
            </div>

            <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:"16px" }}>
              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                <label style={{ fontSize:"12px", color:"var(--t3)", fontWeight:600 }}>Motivo</label>
                <select className="fc" value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)} style={{ margin:0 }}>
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                <label style={{ fontSize:"12px", color:"var(--t3)", fontWeight:600 }}>Observações <span style={{ fontWeight:400 }}>(opcional)</span></label>
                <textarea
                  className="fc"
                  value={obsRejeicao}
                  onChange={e => setObsRejeicao(e.target.value)}
                  placeholder="Detalhe o motivo da rejeição..."
                  rows={3}
                  style={{ margin:0, resize:"vertical" }}
                />
              </div>
            </div>

            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", padding:"16px 20px", borderTop:"1px solid var(--b1)" }}>
              <button className="btn bg" onClick={() => setModalRejeicao(null)}>Cancelar</button>
              <button className="btn bw" onClick={confirmarRejeicao}>✕ Confirmar Rejeição</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}