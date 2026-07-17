"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getOrcamentoById, updateOrcamento, aprovarOrcamento, rejeitarOrcamento, uploadArquivoAssinado, deleteArquivoAssinado } from "@/services/orcamentos.service";
import { formatBRL, formatDate, formatM2 } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { supabase } from "@/lib/supabase/client";
import { preverLeadTime } from "@/lib/producao-stats";
import type { Pedido } from "@/types";

const CHIP: Record<string, string> = {
  "Rascunho":  "chip cgr",
  "Enviado":   "chip cy",
  "Aprovado":  "chip cg",
  "Rejeitado": "chip cr",
};

export default function OrcamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";
  const { toast } = useToast();
  const confirm = useConfirm();

  const [orc, setOrc] = useState<any>(null);
  const [estoque, setEstoque] = useState<Map<number, { m2: number; chapas: number }>>(new Map());
  const [comprometido, setComprometido] = useState<Map<number, number>>(new Map());
  const [previsao, setPrevisao] = useState<ReturnType<typeof preverLeadTime>>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalRejeitar, setModalRejeitar] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [obsRejeicao, setObsRejeicao] = useState("");
  const [uploadandoAssinado, setUploadandoAssinado] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MOTIVOS = ["Preço", "Prazo de entrega", "Prazo de pagamento", "Transporte", "Desistência"];

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [data, estRows, histPedidos] = await Promise.all([
      getOrcamentoById(id),
      supabase.from("estoque").select("produto_id, m2_saldo, chapas_saldo").then(r => r.data ?? []),
      supabase.from("pedidos").select("id, m2_total, status, status_history").in("status", ["Finalizado", "Entregue"]).then(r => (r.data ?? []) as Pedido[]),
    ]);
    setOrc(data);
    const em = new Map<number, { m2: number; chapas: number }>();
    (estRows as any[]).forEach((e: any) => {
      if (e.produto_id != null) em.set(e.produto_id, { m2: Number(e.m2_saldo), chapas: Number(e.chapas_saldo) });
    });
    setEstoque(em);

    // m² comprometidos em outros orçamentos pendentes (excluindo o atual)
    const { data: pendOrcs } = await supabase.from("orcamentos").select("id").in("status", ["Rascunho", "Enviado"]).neq("id", id);
    const pendIds = (pendOrcs ?? []).map((o: any) => o.id as string);
    if (pendIds.length > 0) {
      const { data: pendItens } = await supabase.from("itens_orcamento").select("produto_id, m2").in("orcamento_id", pendIds).not("produto_id", "is", null);
      const cm = new Map<number, number>();
      (pendItens ?? []).forEach((r: any) => { cm.set(r.produto_id, (cm.get(r.produto_id) ?? 0) + Number(r.m2)); });
      setComprometido(cm);
    }

    if (data && histPedidos.length > 0) {
      setPrevisao(preverLeadTime(histPedidos, Number(data.m2_total)));
    }

    setLoading(false);
  }

  // Auto-print quando ?print=1
  useEffect(() => {
    if (autoPrint && !loading && orc) {
      const timer = setTimeout(() => { handlePrint(); }, 800);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, loading, orc]);

  // Abre o diálogo de impressão com o título correto para nome do arquivo
  function handlePrint() {
    if (!orc) return;
    const cliente = orc.clientes?.nome ?? "Cliente";
    const data = orc.dt_orcamento
      ? new Date(orc.dt_orcamento + "T00:00:00").toLocaleDateString("pt-BR").replace(/\//g, "-")
      : "";
    const tituloOriginal = document.title;
    document.title = `${cliente} - ${data}`;
    window.print();
    setTimeout(() => { document.title = tituloOriginal; }, 2000);
  }

  async function handleEnviar() {
    setSalvando(true);
    const result = await updateOrcamento(id, { status: "Enviado" } as any);
    setSalvando(false);
    if (result) { toast("Orçamento marcado como Enviado"); load(); }
    else toast("Erro ao atualizar", "err");
  }

  async function handleAprovar() {
    if (!(await confirm("Aprovar orçamento e gerar pedido automaticamente?"))) return;
    setSalvando(true);
    const pedido = await aprovarOrcamento(id);
    setSalvando(false);
    if (pedido) { toast(`✓ Pedido ${(pedido as any).id} gerado!`); load(); }
    else toast("Erro ao aprovar orçamento", "err");
  }

  function handleRejeitar() {
    setMotivoRejeicao("");
    setObsRejeicao("");
    setModalRejeitar(true);
  }

  async function confirmarRejeicao() {
    setModalRejeitar(false);
    setSalvando(true);
    const result = await rejeitarOrcamento(id, motivoRejeicao || null, obsRejeicao || null);
    setSalvando(false);
    if (result) { toast("Orçamento rejeitado", "warn"); load(); }
    else toast("Erro ao rejeitar", "err");
  }

  async function handleVoltarRascunho() {
    if (!(await confirm("Voltar para Rascunho? O pedido vinculado será removido.", { perigo: true }))) return;
    setSalvando(true);
    const result = await rejeitarOrcamento(id);
    if (result) await updateOrcamento(id, { status: "Rascunho" } as any);
    setSalvando(false);
    if (result) { toast("Orçamento voltou para Rascunho"); load(); }
    else toast("Erro ao atualizar", "err");
  }

  async function handleUploadAssinado(file: File) {
    setUploadandoAssinado(true);
    const url = await uploadArquivoAssinado(id, file);
    if (url) {
      await updateOrcamento(id, { arquivo_assinado_url: url } as any);
      toast("Orçamento assinado salvo");
      load();
    } else {
      toast("Erro ao enviar arquivo", "err");
    }
    setUploadandoAssinado(false);
  }

  async function handleRemoverAssinado() {
    if (!orc.arquivo_assinado_url) return;
    if (!(await confirm("Remover o arquivo assinado anexado?", { perigo: true }))) return;
    await deleteArquivoAssinado(orc.arquivo_assinado_url);
    await updateOrcamento(id, { arquivo_assinado_url: null } as any);
    toast("Arquivo removido");
    load();
  }

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando...</div></div></AppLayout>;
  if (!orc) return <AppLayout><div className="con" style={{ color: "var(--err)", padding: "32px" }}>Orçamento não encontrado.</div></AppLayout>;

  const itens = orc.itens_orcamento ?? [];

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb { display: none !important; }
          body { background: white !important; color: black !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .print-area { display: block !important; }
          .con { padding: 0 !important; }
          @page { margin: 0; size: A4; }
          .print-area * { font-weight: 700 !important; color: #000 !important; }
        }
        .print-area { display: none; }
        @media print { .print-area { display: block; } }
      `}</style>

      <AppLayout>
        <div className="tb no-print">
          <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
          <div className="tb-title" style={{ flex: 1 }}>
            Orçamento <span style={{ color: "var(--acc)" }}>{orc.id}</span>
          </div>
          <span className={CHIP[orc.status] ?? "chip cgr"}>{orc.status}</span>

          {orc.status === "Aprovado" && orc.pedido_id && (
            <a href={`/pedidos/${orc.pedido_id}`} className="btn bs sm">→ Pedido {orc.pedido_id}</a>
          )}

          <button className="btn bg sm" onClick={handlePrint}>⎙ PDF</button>
          <button className="btn bg sm" onClick={() => router.push(`/orcamentos/${id}/editar`)}>✎ Editar Orçamento</button>

          {orc.status === "Rascunho" && (
            <>
              <button className="btn bs sm" onClick={handleEnviar} disabled={salvando}>Marcar Enviado</button>
              <button className="btn bp sm" onClick={handleAprovar} disabled={salvando}>✓ Aprovar</button>
              <button className="btn bw sm" onClick={handleRejeitar} disabled={salvando}>✕ Rejeitar</button>
            </>
          )}
          {orc.status === "Enviado" && (
            <>
              <button className="btn bp sm" onClick={handleAprovar} disabled={salvando}>✓ Aprovar → Pedido</button>
              <button className="btn bw sm" onClick={handleRejeitar} disabled={salvando}>✕ Rejeitar</button>
              <button className="btn bg sm" onClick={handleVoltarRascunho} disabled={salvando}>↩ Rascunho</button>
            </>
          )}
          {orc.status === "Aprovado" && (
            <>
              <button className="btn bw sm" onClick={handleRejeitar} disabled={salvando}>✕ Rejeitar</button>
              <button className="btn bg sm" onClick={handleVoltarRascunho} disabled={salvando}>↩ Rascunho</button>
            </>
          )}
          {orc.status === "Rejeitado" && (
            <>
              <button className="btn bp sm" onClick={handleAprovar} disabled={salvando}>✓ Aprovar novamente</button>
              <button className="btn bg sm" onClick={handleVoltarRascunho} disabled={salvando}>↩ Rascunho</button>
            </>
          )}
        </div>

        <div className="con no-print" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>INFORMAÇÕES DO ORÇAMENTO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <Row label="Cliente"       value={orc.clientes?.nome ?? "—"} />
                <Row label="Cidade"        value={orc.clientes?.cidade ?? "—"} />
                <Row label="Telefone"      value={orc.clientes?.tel ?? "—"} />
                <Row label="Data"          value={formatDate(orc.dt_orcamento)} />
                <Row label="Validade"      value={formatDate(orc.dt_validade) || "—"} />
                <Row label="Entrega prev." value={formatDate(orc.dt_entrega) || "—"} />
                <Row label="Frete"         value={orc.frete || "Retirada"} />
                <Row label="Pagamento"     value={orc.forma_pgto || "—"} />
                {orc.parcelas > 1 && <Row label="Parcelas" value={`${orc.parcelas}×`} />}
                {orc.obs && <Row label="Observações" value={orc.obs} />}
              </div>
            </div>

            <div className="card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>FINANCEIRO</div>

              {/* Resumo em 3 colunas */}
              {(() => {
                const isML = itens.every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true);
                const unidade = isML ? "ml" : "m²";
                const medida = `${Number(orc.m2_total).toFixed(2)} ${unidade}`;
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                    <div style={{ background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--b2)" }}>
                      <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "4px" }}>Total</div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--acc)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(orc.valor_total)}</div>
                    </div>
                    <div style={{ background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--b2)" }}>
                      <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "4px" }}>{unidade} Total</div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--t2)", fontFamily: "'DM Mono',monospace" }}>{medida}</div>
                    </div>
                    <div style={{ background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--b2)" }}>
                      <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "4px" }}>
                        {orc.parcelas > 1 ? `${orc.parcelas}× Parcelas` : "Pagamento"}
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--t1)", fontFamily: "'DM Mono',monospace" }}>
                        {orc.parcelas > 1 ? formatBRL(orc.valor_total / orc.parcelas) : (orc.forma_pgto || "—")}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Desconto e detalhes adicionais */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {orc.desconto > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--b1)" }}>
                    <span style={{ fontSize: "12px", color: "var(--t3)" }}>Desconto ({orc.desconto}%)</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--err)", fontFamily: "'DM Mono',monospace" }}>
                      − {formatBRL(orc.valor_total / (1 - orc.desconto / 100) * orc.desconto / 100)}
                    </span>
                  </div>
                )}
                {orc.parcelas > 1 && orc.forma_pgto && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--b1)" }}>
                    <span style={{ fontSize: "12px", color: "var(--t3)" }}>Forma de Pagamento</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--t1)" }}>{orc.forma_pgto}</span>
                  </div>
                )}
                {orc.conta && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--b1)" }}>
                    <span style={{ fontSize: "12px", color: "var(--t3)" }}>Conta</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--t1)" }}>{orc.conta}</span>
                  </div>
                )}
              </div>

              {orc.status === "Aprovado" && orc.pedido_id && (
                <div style={{ marginTop: "16px", padding: "12px", background: "rgba(0,200,100,.08)", borderRadius: "8px", color: "var(--ok)", fontSize: "13px", textAlign: "center", border: "1px solid rgba(16,185,129,.2)" }}>
                  ✓ Aprovado · Pedido <strong>{orc.pedido_id}</strong> gerado
                </div>
              )}
              {orc.status === "Rejeitado" && (
                <div style={{ marginTop: "16px", padding: "14px 16px", background: "rgba(244,63,94,.08)", borderRadius: "8px", border: "1px solid rgba(244,63,94,.2)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ color: "var(--err)", fontSize: "13px", fontWeight: 700 }}>✕ Orçamento rejeitado</div>
                  {orc.motivo_rejeicao && (
                    <div style={{ fontSize: "12px", color: "var(--t2)" }}>
                      <span style={{ color: "var(--t3)" }}>Motivo: </span>{orc.motivo_rejeicao}
                    </div>
                  )}
                  {orc.obs_rejeicao && (
                    <div style={{ fontSize: "12px", color: "var(--t2)" }}>
                      <span style={{ color: "var(--t3)" }}>Observação: </span>{orc.obs_rejeicao}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Orçamento Assinado */}
          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>ORÇAMENTO ASSINADO</div>

            {orc.arquivo_assinado_url ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "rgba(16,185,129,.08)", borderRadius: "8px", border: "1px solid rgba(16,185,129,.2)" }}>
                <span style={{ fontSize: "18px" }}>📄</span>
                <a href={orc.arquivo_assinado_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "var(--ok)", fontWeight: 600, fontSize: "13px", textDecoration: "underline" }}>
                  Ver arquivo assinado
                </a>
                <button className="btn bg sm" onClick={() => fileInputRef.current?.click()} disabled={uploadandoAssinado}>
                  {uploadandoAssinado ? "Enviando..." : "Substituir"}
                </button>
                <button className="btn bw sm" onClick={handleRemoverAssinado} disabled={uploadandoAssinado}>Remover</button>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" name="arquivo_assinado" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAssinado(f); e.target.value = ""; }} />
              </div>
            ) : (
              <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", padding: "20px", border: "2px dashed var(--b2)", borderRadius: "8px", cursor: uploadandoAssinado ? "default" : "pointer", background: "var(--surf2)" }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !uploadandoAssinado) handleUploadAssinado(f); }}>
                <span style={{ fontSize: "20px" }}>📎</span>
                <span style={{ fontSize: "12px", color: "var(--t3)" }}>
                  {uploadandoAssinado ? "Enviando..." : "Arraste ou clique para anexar o orçamento assinado pelo cliente (PDF ou imagem)"}
                </span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" name="arquivo_assinado" style={{ display: "none" }} disabled={uploadandoAssinado}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAssinado(f); e.target.value = ""; }} />
              </label>
            )}
          </div>

          {/* Previsão de Entrega */}
          {previsao && (
            <div className="card" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>PREVISÃO DE ENTREGA (baseada em dados reais)</div>
                <span style={{
                  fontSize: "10px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px",
                  color:       previsao.confianca === 'alta' ? "var(--ok)" : previsao.confianca === 'media' ? "var(--warn)" : "var(--t3)",
                  background:  previsao.confianca === 'alta' ? "rgba(16,185,129,.1)" : previsao.confianca === 'media' ? "rgba(245,158,11,.1)" : "var(--surf2)",
                  border: `1px solid ${previsao.confianca === 'alta' ? "rgba(16,185,129,.3)" : previsao.confianca === 'media' ? "rgba(245,158,11,.3)" : "var(--b1)"}`,
                }}>
                  Confiança {previsao.confianca === 'alta' ? 'alta' : previsao.confianca === 'media' ? 'média' : 'baixa'} · {previsao.count} pedido{previsao.count !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div style={{ padding: "14px 16px", background: "var(--surf2)", borderRadius: "10px", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 600, marginBottom: "6px" }}>Lead Time Mediano</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>{previsao.diasMediana.toFixed(0)} dias</div>
                  <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "4px" }}>valor central do histórico</div>
                </div>
                <div style={{ padding: "14px 16px", background: "var(--surf2)", borderRadius: "10px", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 600, marginBottom: "6px" }}>Lead Time Médio</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--acc2)", fontFamily: "'DM Mono', monospace" }}>{previsao.diasMedia.toFixed(0)} dias</div>
                  <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "4px" }}>média de todos os similares</div>
                </div>
                <div style={{ padding: "14px 16px", background: "var(--surf2)", borderRadius: "10px", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 600, marginBottom: "6px" }}>Entrega Estimada</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--ok)", fontFamily: "'DM Mono', monospace" }}>
                    {new Date(Date.now() + previsao.diasMediana * 86400000).toLocaleDateString("pt-BR")}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "4px" }}>a partir de hoje + mediana</div>
                </div>
              </div>
              <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--t3)", display: "flex", gap: "6px", alignItems: "center" }}>
                <span>Base: pedidos de</span>
                <strong style={{ color: "var(--t2)", fontFamily: "'DM Mono', monospace" }}>{previsao.m2Min.toFixed(1)} – {previsao.m2Max.toFixed(1)} m²</strong>
                <span>· Tamanho deste orçamento:</span>
                <strong style={{ color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>{Number(orc.m2_total).toFixed(2)} m²</strong>
              </div>
            </div>
          )}

          {/* Disponibilidade de Estoque */}
          {estoque.size > 0 && itens.length > 0 && (() => {
            const m2PorProd = new Map<number, { nome: string; m2: number }>();
            for (const item of itens) {
              if (!item.produto_id) continue;
              const prev = m2PorProd.get(item.produto_id) ?? { nome: item.produto_nome, m2: 0 };
              m2PorProd.set(item.produto_id, { nome: item.produto_nome, m2: prev.m2 + Number(item.m2) });
            }
            const linhas = Array.from(m2PorProd.entries()).map(([pid, { nome, m2 }]) => {
              const est    = estoque.get(pid);
              const saldo  = est?.m2 ?? null;
              const chapas = est?.chapas ?? null;
              const comp   = comprometido.get(pid) ?? 0;
              const real   = saldo !== null ? Math.max(0, saldo - comp) : null;
              const ok     = real !== null && real >= m2 - 0.001;
              const falta  = real !== null ? Math.max(0, m2 - real) : null;
              return { pid, nome, m2, saldo, chapas, comp, real, ok, falta };
            });
            const insuf    = linhas.filter(l => !l.ok);
            const allOk    = insuf.length === 0;
            const semReg   = linhas.filter(l => l.saldo === null);
            const temComp  = linhas.some(l => l.comp > 0.001);
            return (
              <div className="card" style={{ padding:"20px 24px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"4px" }}>
                  <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>DISPONIBILIDADE DE ESTOQUE</div>
                  <span style={{ fontSize:"11px", fontWeight:700, padding:"3px 12px", borderRadius:"99px",
                    color: allOk ? "var(--ok)" : "var(--err)",
                    background: allOk ? "rgba(16,185,129,.1)" : "rgba(244,63,94,.1)",
                    border: `1px solid ${allOk ? "rgba(16,185,129,.3)" : "rgba(244,63,94,.3)"}`,
                  }}>
                    {allOk
                      ? `✓ Estoque suficiente`
                      : `⚠ ${insuf.length} produto${insuf.length > 1 ? "s" : ""} insuficiente${insuf.length > 1 ? "s" : ""}`}
                  </span>
                </div>
                {temComp && (
                  <div style={{ fontSize:"11px", color:"var(--warn)", marginBottom:"14px" }}>
                    ⚠ Considera m² comprometidos em outros orçamentos pendentes (Rascunho/Enviado)
                  </div>
                )}
                {!temComp && <div style={{ marginBottom:"14px" }} />}

                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 120px", gap:"0", borderBottom:"1px solid var(--b1)", paddingBottom:"7px", marginBottom:"2px" }}>
                  {["Produto","Precisa","Estoque","Outros ORC.","Real disp.","Situação"].map(h => (
                    <div key={h} style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", fontFamily:"'DM Mono',monospace", padding:"0 8px 0 0" }}>{h}</div>
                  ))}
                </div>

                {linhas.map(l => (
                  <div key={l.pid} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 120px", gap:"0", padding:"9px 0", borderBottom:"1px solid var(--b1)" }}>
                    <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", paddingRight:"12px" }}>{l.nome}</div>
                    <div style={{ fontSize:"12px", color:"var(--t2)", fontFamily:"'DM Mono',monospace" }}>{formatM2(l.m2)}</div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color:"var(--t3)" }}>
                      {l.saldo === null ? "—" : formatM2(l.saldo)}
                    </div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color: l.comp > 0.001 ? "var(--warn)" : "var(--t3)" }}>
                      {l.comp > 0.001 ? `−${formatM2(l.comp)}` : "—"}
                    </div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", fontWeight:700, color: l.real === null ? "var(--t3)" : l.ok ? "var(--ok)" : "var(--err)" }}>
                      {l.real === null ? "—" : formatM2(l.real)}
                    </div>
                    <div style={{ fontSize:"11px", fontWeight:600 }}>
                      {l.real === null
                        ? <span style={{ color:"var(--t3)" }}>Sem registro</span>
                        : l.ok
                          ? <span style={{ color:"var(--ok)" }}>✓ OK</span>
                          : <span style={{ color:"var(--err)" }}>⚠ Falta {formatM2(l.falta!)}</span>
                      }
                    </div>
                  </div>
                ))}

                {semReg.length > 0 && (
                  <div style={{ marginTop:"10px", fontSize:"11px", color:"var(--t3)", fontStyle:"italic" }}>
                    * Produtos sem entrada no estoque não são rastreados automaticamente.
                  </div>
                )}
              </div>
            );
          })()}

          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>
              ITENS DO ORÇAMENTO ({itens.length})
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Produto</th><th>Dimensão</th>
                    <th>m²</th><th>Quantidade</th><th>R$/m²</th><th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--t3)", padding: "24px" }}>Nenhum item neste orçamento</td></tr>
                  )}
                  {itens.map((item: any, i: number) => (
                    <tr key={item.id}>
                      <td className="mono" style={{ color: "var(--t3)" }}>{i + 1}</td>
                      <td><strong>{item.produto_nome}</strong></td>
                      <td className="mono">{item.largura} × {item.altura} mm</td>
                      <td className="mono">{Number(item.m2).toFixed(3)}</td>
                      <td className="mono">{item.quantidade}</td>
                      <td className="mono">{formatBRL(item.valor_m2)}</td>
                      <td className="mono" style={{ color: "var(--acc)", fontWeight: 600 }}>{formatBRL(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal de Rejeição */}
        {modalRejeitar && (
          <div className="no-print" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}
            onClick={() => setModalRejeitar(false)}>
            <div style={{ background:"var(--surf1)", border:"1px solid var(--b2)", borderRadius:"12px", padding:"28px 32px", width:"420px", maxWidth:"92vw", display:"flex", flexDirection:"column", gap:"16px" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:"15px", fontWeight:700, color:"var(--t1)" }}>Rejeitar orçamento <span style={{ color:"var(--acc)" }}>{id}</span></div>

              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                <label style={{ fontSize:"12px", color:"var(--t3)", fontWeight:600 }}>Motivo</label>
                <select name="motivo_rejeicao" className="fc" value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)} style={{ margin:0 }}>
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                <label style={{ fontSize:"12px", color:"var(--t3)", fontWeight:600 }}>Observações <span style={{ fontWeight:400 }}>(opcional)</span></label>
                <textarea name="obs_rejeicao"
                  className="fc"
                  value={obsRejeicao}
                  onChange={e => setObsRejeicao(e.target.value)}
                  placeholder="Detalhe o motivo da rejeição..."
                  rows={3}
                  style={{ margin:0, resize:"vertical" }}
                />
              </div>

              <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", marginTop:"4px" }}>
                <button className="btn bg sm" onClick={() => setModalRejeitar(false)}>Cancelar</button>
                <button className="btn bw sm" onClick={confirmarRejeicao}>✕ Confirmar Rejeição</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── PDF ─── */}
        <div className="print-area" style={{
          padding: "20px 28px",
          fontFamily: "Arial, sans-serif",
          color: "#111",
          background: "white",
          width: "210mm",
          minHeight: "auto",
          boxSizing: "border-box",
        }}>
          {/* Cabeçalho */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", paddingBottom: "16px", borderBottom: "3px solid #2d5fa6" }}>
            <div>
              <div style={{ fontSize: "26px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" }}>urbanglass</div>
              <div style={{ fontSize: "9px", fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: "2px" }}>Urban Glass Comércio Ltda</div>
              <div style={{ fontSize: "9px", fontWeight: 600, color: "#444", marginTop: "2px" }}>CNPJ: 65.668.970/0001-05</div>
              <div style={{ fontSize: "9px", fontWeight: 600, color: "#444" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
              <div style={{ fontSize: "9px", fontWeight: 600, color: "#444" }}>(32) 99986-0317</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "4px" }}>Orçamento</div>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" }}>{orc.id}</div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#333", marginTop: "6px" }}>Emissão: <strong>{formatDate(orc.dt_orcamento)}</strong></div>
              {orc.dt_validade && <div style={{ fontSize: "11px", fontWeight: 700, color: "#c00" }}>Válido até: <strong>{formatDate(orc.dt_validade)}</strong></div>}
              <div style={{
                display: "inline-block", marginTop: "8px", padding: "3px 14px",
                borderRadius: "99px", fontSize: "10px", fontWeight: 800, letterSpacing: "1px",
                background: orc.status === "Aprovado" ? "#d4edda" : orc.status === "Rejeitado" ? "#f8d7da" : "#fff3cd",
                color: orc.status === "Aprovado" ? "#155724" : orc.status === "Rejeitado" ? "#721c24" : "#856404",
                border: `1px solid ${orc.status === "Aprovado" ? "#c3e6cb" : orc.status === "Rejeitado" ? "#f5c6cb" : "#ffeeba"}`,
              }}>
                {orc.status.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Cliente + Condições */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "18px" }}>
            <div style={{ padding: "12px", background: "#f0f4ff", borderRadius: "8px", borderLeft: "4px solid #2d5fa6" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#2d5fa6", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Cliente</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#111" }}>{orc.clientes?.nome ?? "—"}</div>
              {orc.clientes?.cnpj && <div style={{ fontSize: "10px", fontWeight: 600, color: "#333", marginTop: "3px" }}>CNPJ: {orc.clientes.cnpj}</div>}
              {orc.clientes?.cidade && <div style={{ fontSize: "10px", fontWeight: 600, color: "#333" }}>{orc.clientes.cidade}</div>}
              {orc.clientes?.tel && <div style={{ fontSize: "10px", fontWeight: 600, color: "#333" }}>Tel: {orc.clientes.tel}</div>}
            </div>
            <div style={{ padding: "12px", background: "#f0f4ff", borderRadius: "8px", borderLeft: "4px solid #3d8c5c" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#3d8c5c", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Condições Comerciais</div>
              <div style={{ fontSize: "11px", color: "#222", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, color: "#444" }}>Pagamento</span>
                  <strong>{orc.forma_pgto || "—"}</strong>
                </div>
                {orc.parcelas > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, color: "#444" }}>Parcelas</span>
                    <strong>{orc.parcelas}× de {formatBRL(orc.valor_total / orc.parcelas)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, color: "#444" }}>Frete</span>
                  <strong>{orc.frete || "Retirada"}</strong>
                </div>
                {orc.dt_entrega && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, color: "#444" }}>Entrega prev.</span>
                    <strong>{formatDate(orc.dt_entrega)}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabela de itens */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "11px" }}>
            <thead>
              <tr style={{ background: "#2d5fa6" }}>
                {["#","Produto","Dimensão (mm)","Medida","Quantidade","Preço Unitário","Subtotal"].map((h, i) => (
                  <th key={i} style={{
                    padding: "8px", color: "white", fontWeight: 800, fontSize: "10px",
                    textAlign: i === 0 || i === 4 ? "center" : i >= 5 ? "right" : "left",
                    letterSpacing: "0.5px",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((item: any, i: number) => {
                const isML = item.produtos?.unidade === "ml" || item.vidro_cliente === true;
                return (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                  <td style={{ padding: "7px 8px", borderBottom: "1px solid #e0e6f5", textAlign: "center", fontWeight: 700, color: "#666", fontSize: "10px" }}>{i + 1}</td>
                  <td style={{ padding: "7px 8px", borderBottom: "1px solid #e0e6f5", fontWeight: 800, color: "#111" }}>{item.produto_nome}</td>
                  <td style={{ padding: "7px 8px", borderBottom: "1px solid #e0e6f5", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, color: "#222" }}>{item.largura} × {item.altura}</td>
                  <td style={{ padding: "7px 8px", borderBottom: "1px solid #e0e6f5", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, color: "#222" }}>{Number(item.m2).toFixed(3)} {isML ? "ml" : "m²"}</td>
                  <td style={{ padding: "7px 8px", borderBottom: "1px solid #e0e6f5", textAlign: "center", fontWeight: 700 }}>{item.quantidade}</td>
                  <td style={{ padding: "7px 8px", borderBottom: "1px solid #e0e6f5", textAlign: "right", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, color: "#222" }}>{formatBRL(item.valor_m2)}</td>
                  <td style={{ padding: "7px 8px", borderBottom: "1px solid #e0e6f5", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#2d5fa6", fontSize: "11px" }}>{formatBRL(item.subtotal)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>

          {/* Total */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "18px" }}>
            <div style={{ minWidth: "260px", background: "#f0f4ff", borderRadius: "8px", padding: "12px", border: "1px solid #d0daf0" }}>
              {orc.desconto > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "11px" }}>
                  <span style={{ fontWeight: 700, color: "#c00" }}>Desconto ({orc.desconto}%)</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#c00" }}>− {formatBRL(orc.valor_total / (1 - orc.desconto/100) * orc.desconto/100)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "2px solid #2d5fa6" }}>
                <span style={{ fontWeight: 800, fontSize: "13px", color: "#2d5fa6" }}>VALOR TOTAL</span>
                <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "18px", color: "#2d5fa6" }}>{formatBRL(orc.valor_total)}</span>
              </div>
            </div>
          </div>

          {/* Observações */}
          {orc.obs && (
            <div style={{ padding: "10px 14px", background: "#fffbea", borderRadius: "8px", marginBottom: "16px", fontSize: "10px", borderLeft: "3px solid #f59e0b" }}>
              <strong style={{ fontWeight: 800, color: "#7a3500" }}>Observações:</strong> <span style={{ fontWeight: 600, color: "#333" }}>{orc.obs}</span>
            </div>
          )}

          {/* Assinaturas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", marginBottom: "16px", marginTop: "24px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #666", paddingTop: "8px", fontSize: "10px", fontWeight: 700, color: "#333" }}>Vendedor / Urban Glass</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #666", paddingTop: "8px", fontSize: "10px", fontWeight: 700, color: "#333" }}>Cliente / Aprovação</div>
            </div>
          </div>

          {/* Rodapé */}
          <div style={{ borderTop: "2px solid #2d5fa6", paddingTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#555", fontWeight: 600 }}>
            <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
            <div style={{ color: "#c00", fontStyle: "italic", fontWeight: 700 }}>Não substitui a Nota Fiscal Eletrônica</div>
          </div>
        </div>
      </AppLayout>
    </>
  );
}

function Row({ label, value, accent, color }: {
  label: string; value: string | number; accent?: boolean; color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
      <span style={{ fontSize: "13px", color: "var(--t3)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: accent ? 700 : 500, color: color ?? (accent ? "var(--acc)" : "var(--t1)"), textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}