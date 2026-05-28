"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getOrcamentoById, updateOrcamento, aprovarOrcamento, rejeitarOrcamento } from "@/services/orcamentos.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";

const CHIP: Record<string, string> = {
  "Rascunho":  "chip cgr",
  "Enviado":   "chip cy",
  "Aprovado":  "chip cg",
  "Rejeitado": "chip cr",
};

// Logo Urban Glass em base64 (fundo azul)
const LOGO_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAyAGQDASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAYHBAUIAwEC/8QAMhAAAQMDAgQEBQQDAAAAAAAAAQIDBAAFEQYSITFBUWEHEyJxgRQykaHBFSNCUmL/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A2pSlKBSlKBSlKBSlKBSlKBSlKBXO1XW3WlhL9ynxoTSjgLkOpQCfbJFdGtV7i6Es13lOtx2bfGW6txQJAABJJ/oDmg2DS1KUClKUClKUClKUClKUCuBr3Wdv0Xp9y63IlQCghtpAyt1Z6IH9fQZNd+uBq7SkDW+mZthuKlJakgFLqBktLBylYHwR+OKDz/pTX2odW6gmTb/ACHWgkiNGfSENMJ5ISlPTucAnzNeztaQ0vSukLfpuI8p5mIgorXjBWtRKlH2yTge1clzs3R9luLlun2OPGlNYCm3GlBQz0PXB+K9IezGxNJSq1ycqAJHMI/1QW1KUoBSlKBSlKBSlKBSlKBSlKD/2Q==";

export default function OrcamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [orc, setOrc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const data = await getOrcamentoById(id);
    setOrc(data);
    setLoading(false);
  }

  async function handleEnviar() {
    setSalvando(true);
    const result = await updateOrcamento(id, { status: "Enviado" } as any);
    setSalvando(false);
    if (result) { toast("Orçamento marcado como Enviado"); load(); }
    else toast("Erro ao atualizar", "err");
  }

  async function handleAprovar() {
    if (!confirm("Aprovar orçamento e gerar pedido automaticamente?")) return;
    setSalvando(true);
    const pedido = await aprovarOrcamento(id);
    setSalvando(false);
    if (pedido) { toast(`✓ Pedido ${pedido.id} gerado!`); load(); }
    else toast("Erro ao aprovar orçamento", "err");
  }

  async function handleRejeitar() {
    if (!confirm("Rejeitar orçamento? O pedido vinculado será removido.")) return;
    setSalvando(true);
    const result = await rejeitarOrcamento(id);
    setSalvando(false);
    if (result) { toast("Orçamento rejeitado", "warn"); load(); }
    else toast("Erro ao rejeitar", "err");
  }

  async function handleVoltarRascunho() {
    if (!confirm("Voltar para Rascunho? O pedido vinculado será removido.")) return;
    setSalvando(true);
    const result = await rejeitarOrcamento(id);
    if (result) await updateOrcamento(id, { status: "Rascunho" } as any);
    setSalvando(false);
    if (result) { toast("Orçamento voltou para Rascunho"); load(); }
    else toast("Erro ao atualizar", "err");
  }

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando...</div></div></AppLayout>;
  if (!orc) return <AppLayout><div className="con" style={{ color: "var(--err)", padding: "32px" }}>Orçamento não encontrado.</div></AppLayout>;

  const itens = orc.itens_orcamento ?? [];

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb, .tb-topbar { display: none !important; }
          body { background: white !important; color: black !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .print-area { display: block !important; }
          .con { padding: 0 !important; }
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

          <button className="btn bg sm" onClick={() => window.print()}>⎙ PDF</button>

          {/* Ações por status */}
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

        {/* Tela normal */}
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
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <Row label="m² Total"    value={`${Number(orc.m2_total).toFixed(2)} m²`} />
                {orc.desconto > 0 && <Row label={`Desconto (${orc.desconto}%)`} value={`− ${formatBRL(orc.valor_total / (1 - orc.desconto/100) * orc.desconto/100)}`} color="var(--err)" />}
                <Row label="Valor Total" value={formatBRL(orc.valor_total)} accent />
                {orc.parcelas > 1 && <Row label="Por Parcela" value={formatBRL(orc.valor_total / orc.parcelas)} />}
              </div>
              {orc.status === "Aprovado" && orc.pedido_id && (
                <div style={{ marginTop: "20px", padding: "12px", background: "rgba(0,200,100,.08)", borderRadius: "8px", color: "var(--ok)", fontSize: "13px", textAlign: "center" }}>
                  ✓ Aprovado · Pedido <strong>{orc.pedido_id}</strong> gerado
                </div>
              )}
              {orc.status === "Rejeitado" && (
                <div style={{ marginTop: "20px", padding: "12px", background: "rgba(244,63,94,.08)", borderRadius: "8px", color: "var(--err)", fontSize: "13px", textAlign: "center" }}>
                  ✕ Orçamento rejeitado
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>
              ITENS DO ORÇAMENTO ({itens.length})
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Produto</th><th>Dimensão</th>
                    <th>m²</th><th>Qtd</th><th>R$/m²</th><th>Lapidação</th><th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item: any, i: number) => (
                    <tr key={item.id}>
                      <td className="mono" style={{ color: "var(--t3)" }}>{i + 1}</td>
                      <td><strong>{item.produto_nome}</strong></td>
                      <td className="mono">{item.largura} × {item.altura} mm</td>
                      <td className="mono">{Number(item.m2).toFixed(3)}</td>
                      <td className="mono">{item.quantidade}</td>
                      <td className="mono">{formatBRL(item.valor_m2)}</td>
                      <td className="mono">{item.lapidacao > 0 ? formatBRL(item.lapidacao) : <span style={{ color: "var(--t3)" }}>—</span>}</td>
                      <td className="mono" style={{ color: "var(--acc)", fontWeight: 600 }}>{formatBRL(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── PDF ─── */}
        <div className="print-area" style={{ padding: "28px 36px", fontFamily: "Arial, sans-serif", color: "#1a1a2e", background: "white", minHeight: "100vh" }}>

          {/* Cabeçalho */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px", paddingBottom: "20px", borderBottom: "3px solid #2d5fa6" }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "64px", height: "64px", background: "#2d5fa6", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src={LOGO_B64} alt="Urban Glass" style={{ width: "56px", height: "56px", objectFit: "contain" }} />
              </div>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-0.5px" }}>
                  urban<span style={{ color: "#3d8c5c" }}>glass</span>
                </div>
                <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase", letterSpacing: "1.5px" }}>Urban Glass Comércio Ltda</div>
                <div style={{ fontSize: "9px", color: "#888" }}>CNPJ: 65.668.970/0001-05</div>
                <div style={{ fontSize: "9px", color: "#888" }}>Av. Vereador Raymundo Hargreaves, 17 – Fontesville – Juiz de Fora/MG</div>
                <div style={{ fontSize: "9px", color: "#888" }}>(32) 99986-0317</div>
              </div>
            </div>

            {/* Número e status */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "4px" }}>Orçamento</div>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" }}>{orc.id}</div>
              <div style={{ fontSize: "11px", color: "#555", marginTop: "6px" }}>Emissão: <strong>{formatDate(orc.dt_orcamento)}</strong></div>
              {orc.dt_validade && <div style={{ fontSize: "11px", color: "#c00" }}>Válido até: <strong>{formatDate(orc.dt_validade)}</strong></div>}
              <div style={{
                display: "inline-block", marginTop: "8px", padding: "3px 14px",
                borderRadius: "99px", fontSize: "10px", fontWeight: 700, letterSpacing: "1px",
                background: orc.status === "Aprovado" ? "#d4edda" : orc.status === "Rejeitado" ? "#f8d7da" : "#fff3cd",
                color: orc.status === "Aprovado" ? "#155724" : orc.status === "Rejeitado" ? "#721c24" : "#856404",
                border: `1px solid ${orc.status === "Aprovado" ? "#c3e6cb" : orc.status === "Rejeitado" ? "#f5c6cb" : "#ffeeba"}`,
              }}>
                {orc.status.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Cliente + Condições */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            <div style={{ padding: "16px", background: "#f0f4ff", borderRadius: "10px", borderLeft: "4px solid #2d5fa6" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: "#2d5fa6", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px" }}>Cliente</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>{orc.clientes?.nome ?? "—"}</div>
              {orc.clientes?.cnpj && <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>CNPJ: {orc.clientes.cnpj}</div>}
              {orc.clientes?.cidade && <div style={{ fontSize: "11px", color: "#555" }}>{orc.clientes.cidade}</div>}
              {orc.clientes?.tel && <div style={{ fontSize: "11px", color: "#555" }}>Tel: {orc.clientes.tel}</div>}
            </div>
            <div style={{ padding: "16px", background: "#f0f4ff", borderRadius: "10px", borderLeft: "4px solid #3d8c5c" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: "#3d8c5c", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px" }}>Condições Comerciais</div>
              <div style={{ fontSize: "11px", color: "#333", display: "flex", flexDirection: "column", gap: "5px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#777" }}>Pagamento</span>
                  <strong>{orc.forma_pgto || "—"}</strong>
                </div>
                {orc.parcelas > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#777" }}>Parcelas</span>
                    <strong>{orc.parcelas}× de {formatBRL(orc.valor_total / orc.parcelas)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#777" }}>Frete</span>
                  <strong>{orc.frete || "Retirada"}</strong>
                </div>
                {orc.dt_entrega && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#777" }}>Entrega prev.</span>
                    <strong>{formatDate(orc.dt_entrega)}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabela de itens */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: "#2d5fa6" }}>
                {["#","Produto","Dimensão (mm)","m²","Qtd","R$/m²","Lapidação","Subtotal"].map((h, i) => (
                  <th key={i} style={{
                    padding: "10px 10px", color: "white", fontWeight: 700, fontSize: "10px",
                    textAlign: i === 0 || i === 4 ? "center" : i >= 5 ? "right" : "left",
                    letterSpacing: "0.5px",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((item: any, i: number) => (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #e8ecf5", textAlign: "center", color: "#aaa", fontSize: "11px" }}>{i + 1}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #e8ecf5", fontWeight: 600, color: "#1a1a2e" }}>{item.produto_nome}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #e8ecf5", fontFamily: "monospace", fontSize: "11px" }}>{item.largura} × {item.altura}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #e8ecf5", fontFamily: "monospace", fontSize: "11px" }}>{Number(item.m2).toFixed(3)}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #e8ecf5", textAlign: "center" }}>{item.quantidade}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #e8ecf5", textAlign: "right", fontFamily: "monospace", fontSize: "11px" }}>{formatBRL(item.valor_m2)}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #e8ecf5", textAlign: "right", fontFamily: "monospace", fontSize: "11px" }}>{item.lapidacao > 0 ? formatBRL(item.lapidacao) : "—"}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #e8ecf5", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#2d5fa6" }}>{formatBRL(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totais */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "24px" }}>
            <div style={{ minWidth: "300px", background: "#f0f4ff", borderRadius: "10px", padding: "16px", border: "1px solid #d0daf0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "12px" }}>
                <span style={{ color: "#777" }}>m² Total</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{Number(orc.m2_total).toFixed(2)} m²</span>
              </div>
              {orc.desconto > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "12px" }}>
                  <span style={{ color: "#c00" }}>Desconto ({orc.desconto}%)</span>
                  <span style={{ fontFamily: "monospace", color: "#c00" }}>− {formatBRL(orc.valor_total / (1 - orc.desconto/100) * orc.desconto/100)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "2px solid #2d5fa6" }}>
                <span style={{ fontWeight: 700, fontSize: "14px", color: "#2d5fa6" }}>VALOR TOTAL</span>
                <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "20px", color: "#2d5fa6" }}>{formatBRL(orc.valor_total)}</span>
              </div>
            </div>
          </div>

          {/* Observações */}
          {orc.obs && (
            <div style={{ padding: "12px 16px", background: "#fffbea", borderRadius: "8px", marginBottom: "20px", fontSize: "11px", borderLeft: "3px solid #f59e0b" }}>
              <strong style={{ color: "#92400e" }}>Observações:</strong> <span style={{ color: "#555" }}>{orc.obs}</span>
            </div>
          )}

          {/* Assinatura */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", marginBottom: "24px", marginTop: "32px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #999", paddingTop: "8px", fontSize: "11px", color: "#555" }}>
                Vendedor / Urban Glass
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #999", paddingTop: "8px", fontSize: "11px", color: "#555" }}>
                Cliente / Aprovação
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div style={{ borderTop: "2px solid #2d5fa6", paddingTop: "10px", display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#aaa" }}>
            <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 17 – Fontesville – Juiz de Fora/MG</div>
            <div style={{ color: "#e00", fontStyle: "italic" }}>Não substitui a Nota Fiscal Eletrônica</div>
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