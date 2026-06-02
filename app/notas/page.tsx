"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getNotas, criarRascunho, deletarNota, emitirNFe, consultarStatusNFe } from "../../services/notas.service";
import { getPedidos } from "../../services/pedidos.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import type { NotaFiscal, Pedido } from "@/types";

const STATUS_CHIP: Record<string, string> = {
  rascunho:   "chip cgr",
  enviando:   "chip cy",
  autorizada: "chip cg",
  cancelada:  "chip cr",
  rejeitada:  "chip cr",
};

const STATUS_LABEL: Record<string, string> = {
  rascunho:   "Rascunho",
  enviando:   "Processando",
  autorizada: "Autorizada",
  cancelada:  "Cancelada",
  rejeitada:  "Rejeitada",
};

export default function NotasPage() {
  const { toast } = useToast();

  const [notas, setNotas]           = useState<NotaFiscal[]>([]);
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState(false);
  const [modalNova, setModalNova]   = useState(false);
  const [pedidoSel, setPedidoSel]   = useState<string>("");
  const [cfopSel, setCfopSel]       = useState<string>("5.101");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [ns, peds] = await Promise.all([getNotas(), getPedidos()]);
    setNotas(ns);
    // Só pedidos que ainda não têm nota autorizada
    const pedidosComNota = ns
      .filter(n => n.status === "autorizada" && n.pedido_id)
      .map(n => n.pedido_id!);
    setPedidos(peds.filter(p => !pedidosComNota.includes(p.id)));
    setLoading(false);
  }

  async function handleCriarRascunho() {
    const pedido = pedidos.find(p => p.id === pedidoSel);
    if (!pedido) { toast("Selecione um pedido", "warn"); return; }
    if (!pedido.clientes?.cnpj) {
      toast(`Cliente ${pedido.clientes?.nome ?? ""} sem CNPJ cadastrado`, "warn");
      return;
    }
    setSalvando(true);
    const nota = await criarRascunho(pedido, cfopSel);
    setSalvando(false);
    if (!nota) { toast("Erro ao criar rascunho", "err"); return; }
    toast(`Rascunho criado para ${pedido.id}`);
    setModalNova(false);
    setPedidoSel("");
    await load();
  }

  async function handleEmitir(nota: NotaFiscal) {
    const pedido = pedidos.find(p => p.id === nota.pedido_id)
      ?? (await getPedidos()).find(p => p.id === nota.pedido_id);
    if (!pedido) { toast("Pedido não encontrado", "err"); return; }
    if (!confirm(`Emitir NF-e para ${pedido.id}?\nAmbiente: HOMOLOGAÇÃO`)) return;
    setSalvando(true);
    const result = await emitirNFe(nota.id, pedido);
    setSalvando(false);
    toast(result.mensagem, result.ok ? "ok" : "err");
    await load();
  }

  async function handleConsultar(nota: NotaFiscal) {
    setSalvando(true);
    await consultarStatusNFe(nota.id);
    setSalvando(false);
    toast("Status atualizado");
    await load();
  }

  async function handleDeletar(nota: NotaFiscal) {
    if (!confirm(`Remover rascunho ${nota.id}?`)) return;
    const ok = await deletarNota(nota.id);
    if (!ok) { toast("Erro ao remover", "err"); return; }
    toast("Rascunho removido");
    await load();
  }

  const notasFiltradas = filtroStatus === "todos"
    ? notas
    : notas.filter(n => n.status === filtroStatus);

  const totais = notas.reduce((acc, n) => ({
    autorizadas: acc.autorizadas + (n.status === "autorizada" ? 1 : 0),
    valor:       acc.valor       + (n.status === "autorizada" ? Number(n.valor_total) : 0),
    pendentes:   acc.pendentes   + (["rascunho","enviando"].includes(n.status) ? 1 : 0),
    rejeitadas:  acc.rejeitadas  + (n.status === "rejeitada" ? 1 : 0),
  }), { autorizadas: 0, valor: 0, pendentes: 0, rejeitadas: 0 });

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Notas Fiscais</div>
        <div style={{ fontSize:"11px", color:"var(--warn)", fontFamily:"'DM Mono', monospace",
          background:"rgba(245,158,11,.1)", border:"1px solid rgba(245,158,11,.3)",
          borderRadius:"6px", padding:"4px 10px" }}>
          ⚠ Ambiente: HOMOLOGAÇÃO
        </div>
        <button className="btn bp sm" onClick={() => setModalNova(true)}>+ Nova NF-e</button>
      </div>

      <div className="con">
        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"NF-e Autorizadas",  value: totais.autorizadas.toString(), color:"var(--ok)",   sub:"no período" },
            { label:"Valor Emitido",     value: formatBRL(totais.valor),        color:"var(--acc)",  sub:"notas autorizadas" },
            { label:"Pendentes",         value: totais.pendentes.toString(),     color:"var(--warn)", sub:"rascunhos + processando" },
            { label:"Rejeitadas",        value: totais.rejeitadas.toString(),    color:"var(--err)",  sub:"verificar motivo" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600, marginBottom:"4px" }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)", marginTop:"4px" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* AVISO HOMOLOGAÇÃO */}
        <div style={{ background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)",
          borderRadius:"10px", padding:"14px 18px", marginBottom:"20px",
          display:"flex", gap:"12px", alignItems:"flex-start" }}>
          <div style={{ fontSize:"20px" }}>⚠️</div>
          <div>
            <div style={{ fontSize:"13px", fontWeight:700, color:"var(--warn)", marginBottom:"4px" }}>
              Sistema em modo de homologação
            </div>
            <div style={{ fontSize:"12px", color:"var(--t3)", lineHeight:1.6 }}>
              As NF-e emitidas agora são apenas para teste junto à SEFAZ. Nenhuma nota tem validade fiscal até você trocar para ambiente de produção.<br />
              <strong style={{ color:"var(--t2)" }}>Antes de ir para produção:</strong> validar alíquotas com o contador, configurar certificado A1 na Nuvem Fiscal, e testar ao menos 5 notas em homologação.
            </div>
          </div>
        </div>

        {/* FILTROS */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"16px" }}>
          {["todos","rascunho","enviando","autorizada","rejeitada"].map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              style={{
                padding:"5px 12px", borderRadius:"6px", fontSize:"12px", fontWeight:600, cursor:"pointer",
                background: filtroStatus === s ? "var(--acc)" : "transparent",
                border: `1px solid ${filtroStatus === s ? "var(--acc)" : "var(--b2)"}`,
                color: filtroStatus === s ? "#000" : "var(--t3)",
                transition:"all .15s",
              }}
            >
              {s === "todos" ? "Todos" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando notas...</div>
        ) : notasFiltradas.length === 0 ? (
          <div className="card" style={{ padding:"40px", textAlign:"center", color:"var(--t3)" }}>
            Nenhuma nota encontrada.{" "}
            <button className="btn bp sm" style={{ marginLeft:"12px" }} onClick={() => setModalNova(true)}>
              + Criar primeira NF-e
            </button>
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Nº / Chave</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>CFOP</th>
                  <th>Valor</th>
                  <th>ICMS</th>
                  <th>Emissão</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {notasFiltradas.map(nota => (
                  <tr key={nota.id}>
                    <td className="mono" style={{ fontSize:"11px" }}>
                      {nota.numero
                        ? <><strong>{nota.numero}</strong><br /><span style={{ color:"var(--t3)", fontSize:"10px" }}>{nota.chave?.slice(-8)}</span></>
                        : <span style={{ color:"var(--t3)" }}>—</span>
                      }
                    </td>
                    <td className="mono">
                      {nota.pedido_id
                        ? <a href={`/pedidos/${nota.pedido_id}`} style={{ color:"var(--acc)", textDecoration:"none" }}>{nota.pedido_id}</a>
                        : "—"
                      }
                    </td>
                    <td><strong>{nota.clientes?.nome ?? "—"}</strong><br /><span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono', monospace" }}>{nota.clientes?.cnpj ?? "sem CNPJ"}</span></td>
                    <td className="mono">{nota.cfop}</td>
                    <td className="mono" style={{ color:"var(--acc)", fontWeight:600 }}>{formatBRL(nota.valor_total)}</td>
                    <td className="mono" style={{ color:"var(--t2)" }}>{formatBRL(nota.valor_icms)}</td>
                    <td className="mono" style={{ fontSize:"11px" }}>{formatDate(nota.dt_emissao)}</td>
                    <td>
                      <span className={STATUS_CHIP[nota.status] ?? "chip cgr"}>
                        {STATUS_LABEL[nota.status]}
                      </span>
                      {nota.status === "rejeitada" && nota.motivo_rejeicao && (
                        <div style={{ fontSize:"10px", color:"var(--err)", marginTop:"3px", maxWidth:"140px" }}>
                          {nota.motivo_rejeicao.slice(0, 60)}...
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display:"flex", gap:"5px", flexWrap:"wrap" }}>
                        {nota.status === "rascunho" && (
                          <>
                            <button
                              className="btn bp xs"
                              onClick={() => handleEmitir(nota)}
                              disabled={salvando}
                            >
                              Emitir
                            </button>
                            <button
                              className="btn bg xs"
                              onClick={() => handleDeletar(nota)}
                              disabled={salvando}
                              style={{ color:"var(--err)", borderColor:"var(--err)" }}
                            >
                              🗑
                            </button>
                          </>
                        )}
                        {nota.status === "enviando" && (
                          <button
                            className="btn bg xs"
                            onClick={() => handleConsultar(nota)}
                            disabled={salvando}
                          >
                            ↻ Consultar
                          </button>
                        )}
                        {nota.status === "autorizada" && (
                          <div style={{ display:"flex", gap:"5px" }}>
                            {nota.danfe_url && (
                              <a href={nota.danfe_url} target="_blank" className="btn bg xs"
                                style={{ textDecoration:"none" }}>
                                DANFE
                              </a>
                            )}
                            {nota.xml_url && (
                              <a href={nota.xml_url} target="_blank" className="btn bg xs"
                                style={{ textDecoration:"none" }}>
                                XML
                              </a>
                            )}
                          </div>
                        )}
                        {nota.status === "rejeitada" && (
                          <button
                            className="btn bg xs"
                            onClick={() => handleDeletar(nota)}
                            disabled={salvando}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL NOVA NF-e */}
      {modalNova && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalNova(false)}>
          <div className="mod" style={{ width:"480px" }}>
            <div className="mhd">
              <div className="mtit">Nova NF-e</div>
              <button className="mcl" onClick={() => setModalNova(false)}>✕</button>
            </div>

            <div style={{ background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)",
              borderRadius:"8px", padding:"10px 14px", marginBottom:"16px",
              fontSize:"12px", color:"var(--warn)" }}>
              ⚠ Verifique se o cliente tem CNPJ cadastrado antes de emitir.
            </div>

            <div className="fg" style={{ marginBottom:"14px" }}>
              <label className="fl">Pedido *</label>
              <select className="fc" value={pedidoSel} onChange={e => setPedidoSel(e.target.value)}>
                <option value="">Selecione um pedido...</option>
                {pedidos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.id} — {p.clientes?.nome ?? "?"} — {formatBRL(p.valor_total)}
                    {!p.clientes?.cnpj ? " ⚠ sem CNPJ" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="fg" style={{ marginBottom:"14px" }}>
              <label className="fl">CFOP *</label>
              <select className="fc" value={cfopSel} onChange={e => setCfopSel(e.target.value)}>
                <option value="5.101">5.101 — Venda dentro de MG (ICMS 18%)</option>
                <option value="6.101">6.101 — Venda fora de MG (ICMS 12%)</option>
              </select>
            </div>

            {pedidoSel && (
              <div style={{ background:"var(--surf2)", border:"1px solid var(--b1)",
                borderRadius:"8px", padding:"12px", marginBottom:"16px",
                fontSize:"12px", color:"var(--t3)" }}>
                <div style={{ marginBottom:"6px", fontWeight:700, color:"var(--t2)" }}>Impostos calculados (rascunho)</div>
                {(() => {
                  const p = pedidos.find(x => x.id === pedidoSel);
                  if (!p) return null;
                  const v = Number(p.valor_total);
                  const aliq = cfopSel.startsWith("5") ? 0.18 : 0.12;
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:"4px", fontFamily:"'DM Mono', monospace" }}>
                      <div style={{ display:"flex", justifyContent:"space-between" }}><span>Valor produtos</span><strong style={{ color:"var(--t1)" }}>{formatBRL(v)}</strong></div>
                      <div style={{ display:"flex", justifyContent:"space-between" }}><span>ICMS ({cfopSel.startsWith("5") ? "18" : "12"}%)</span><span>{formatBRL(v * aliq)}</span></div>
                      <div style={{ display:"flex", justifyContent:"space-between" }}><span>PIS (1,65%)</span><span>{formatBRL(v * 0.0165)}</span></div>
                      <div style={{ display:"flex", justifyContent:"space-between" }}><span>COFINS (7,6%)</span><span>{formatBRL(v * 0.076)}</span></div>
                      <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid var(--b1)", paddingTop:"6px", marginTop:"2px" }}>
                        <strong style={{ color:"var(--t2)" }}>Total NF-e</strong>
                        <strong style={{ color:"var(--acc)" }}>{formatBRL(v)}</strong>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ marginTop:"8px", fontSize:"11px", color:"var(--t3)", fontStyle:"italic" }}>
                  * Alíquotas padrão. Confirme com seu contador antes de emitir em produção.
                </div>
              </div>
            )}

            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg" onClick={() => setModalNova(false)}>Cancelar</button>
              <button
                className="btn bp"
                onClick={handleCriarRascunho}
                disabled={salvando || !pedidoSel}
              >
                {salvando ? "Criando..." : "Criar Rascunho"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}