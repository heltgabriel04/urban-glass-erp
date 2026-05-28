"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getOrcamentoById, updateOrcamento, aprovarOrcamento } from "@/services/orcamentos.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";

const CHIP: Record<string, string> = {
  "Rascunho":  "chip cgr",
  "Enviado":   "chip cy",
  "Aprovado":  "chip cg",
  "Rejeitado": "chip cr",
};

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

  async function handleRejeitar() {
    if (!confirm("Confirmar rejeição do orçamento?")) return;
    setSalvando(true);
    const result = await updateOrcamento(id, { status: "Rejeitado" } as any);
    setSalvando(false);
    if (result) { toast("Orçamento rejeitado", "warn"); load(); }
    else toast("Erro ao rejeitar", "err");
  }

  async function handleAprovar() {
    if (!confirm("Aprovar orçamento e gerar pedido automaticamente?")) return;
    setSalvando(true);
    const pedido = await aprovarOrcamento(id);
    setSalvando(false);
    if (pedido) {
      toast(`✓ Pedido ${pedido.id} gerado com sucesso!`);
      load();
    } else {
      toast("Erro ao aprovar orçamento", "err");
    }
  }

  function handlePDF() {
    window.print();
  }

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando...</div></div></AppLayout>;
  if (!orc) return <AppLayout><div className="con" style={{ color: "var(--err)", padding: "32px" }}>Orçamento não encontrado.</div></AppLayout>;

  const podEnviar   = orc.status === "Rascunho";
  const podeAprovar = ["Rascunho","Enviado"].includes(orc.status);
  const podeRejeitar = ["Rascunho","Enviado"].includes(orc.status);

  return (
    <>
      {/* CSS de impressão */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb, .tb, .sb-ft { display: none !important; }
          body { background: white !important; color: black !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content { overflow: visible !important; }
          .erp-main { overflow: visible !important; }
          .print-area { display: block !important; }
          .con { padding: 0 !important; }
        }
        .print-area { display: none; }
        @media print { .print-area { display: block; } }
      `}</style>

      <AppLayout>
        {/* Topbar — não imprime */}
        <div className="tb no-print">
          <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
          <div className="tb-title" style={{ flex: 1 }}>
            Orçamento <span style={{ color: "var(--acc)" }}>{orc.id}</span>
          </div>
          <span className={CHIP[orc.status] ?? "chip cgr"}>{orc.status}</span>

          {orc.status === "Aprovado" && orc.pedido_id && (
            <a href={`/pedidos/${orc.pedido_id}`} className="btn bs sm">
              → Ver Pedido {orc.pedido_id}
            </a>
          )}

          <button className="btn bg sm" onClick={handlePDF}>⎙ Imprimir PDF</button>

          {podEnviar && (
            <button className="btn bs sm" onClick={handleEnviar} disabled={salvando}>
              Marcar como Enviado
            </button>
          )}
          {podeRejeitar && (
            <button className="btn bw sm" onClick={handleRejeitar} disabled={salvando}>
              ✕ Rejeitar
            </button>
          )}
          {podeAprovar && (
            <button className="btn bp sm" onClick={handleAprovar} disabled={salvando}>
              {salvando ? "Processando..." : "✓ Aprovar → Gerar Pedido"}
            </button>
          )}
        </div>

        <div className="con no-print" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Grid info + financeiro */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>
                INFORMAÇÕES DO ORÇAMENTO
              </div>
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
              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>
                FINANCEIRO
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <Row label="m² Total"  value={`${Number(orc.m2_total).toFixed(2)} m²`} />
                <Row label="Subtotal"  value={formatBRL(orc.valor_total / (1 - (orc.desconto || 0) / 100))} />
                {orc.desconto > 0 && (
                  <Row label={`Desconto (${orc.desconto}%)`} value={`− ${formatBRL(orc.valor_total / (1 - orc.desconto / 100) * orc.desconto / 100)}`} color="var(--err)" />
                )}
                <Row label="Valor Total" value={formatBRL(orc.valor_total)} accent />
                {orc.parcelas > 1 && (
                  <Row label="Por Parcela" value={formatBRL(orc.valor_total / orc.parcelas)} />
                )}
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

          {/* Itens */}
          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>
              ITENS DO ORÇAMENTO ({orc.itens_orcamento?.length ?? 0})
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
                  {(orc.itens_orcamento ?? []).map((item: any, i: number) => (
                    <tr key={item.id}>
                      <td className="mono" style={{ color: "var(--t3)" }}>{i + 1}</td>
                      <td><strong>{item.produto_nome}</strong></td>
                      <td className="mono">{item.largura} × {item.altura} mm</td>
                      <td className="mono">{Number(item.m2).toFixed(3)}</td>
                      <td className="mono">{item.quantidade}</td>
                      <td className="mono">{formatBRL(item.valor_m2)}</td>
                      <td className="mono">
                        {item.lapidacao > 0 ? formatBRL(item.lapidacao) : <span style={{ color: "var(--t3)" }}>—</span>}
                      </td>
                      <td className="mono" style={{ color: "var(--acc)", fontWeight: 600 }}>
                        {formatBRL(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── ÁREA DE IMPRESSÃO / PDF ─────────────────────────── */}
        <div className="print-area" style={{ padding: "32px", fontFamily: "Arial, sans-serif", color: "#111", background: "white" }}>

          {/* Cabeçalho */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", paddingBottom: "16px", borderBottom: "2px solid #1a3a6b" }}>
            <div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: "#1a3a6b", letterSpacing: "-0.5px" }}>
                Urban<span style={{ color: "#3d8c5c" }}>Glass</span>
              </div>
              <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>URBAN GLASS COMÉRCIO LTDA</div>
              <div style={{ fontSize: "10px", color: "#666" }}>CNPJ: 65.668.970/0001-05</div>
              <div style={{ fontSize: "10px", color: "#666" }}>Rua Doutor Eládio Lopes, 255 – Distrito Industrial – Juiz de Fora/MG</div>
              <div style={{ fontSize: "10px", color: "#666" }}>(32) 99986-0317 · compras@maxibuild.com.br</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#1a3a6b" }}>ORÇAMENTO</div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: "#3d8c5c", marginTop: "4px" }}>{orc.id}</div>
              <div style={{ fontSize: "11px", color: "#666", marginTop: "8px" }}>
                Data: <strong>{formatDate(orc.dt_orcamento)}</strong>
              </div>
              {orc.dt_validade && (
                <div style={{ fontSize: "11px", color: "#c00" }}>
                  Válido até: <strong>{formatDate(orc.dt_validade)}</strong>
                </div>
              )}
              <div style={{ marginTop: "8px", padding: "4px 12px", background: orc.status === "Aprovado" ? "#d4edda" : orc.status === "Rejeitado" ? "#f8d7da" : "#fff3cd", borderRadius: "4px", fontSize: "11px", fontWeight: 700, color: orc.status === "Aprovado" ? "#155724" : orc.status === "Rejeitado" ? "#721c24" : "#856404" }}>
                {orc.status.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Cliente */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ padding: "14px", background: "#f8f9fa", borderRadius: "8px", border: "1px solid #dee2e6" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#1a3a6b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>👤 Cliente</div>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>{orc.clientes?.nome ?? "—"}</div>
              {orc.clientes?.cnpj && <div style={{ fontSize: "11px", color: "#555" }}>CNPJ: {orc.clientes.cnpj}</div>}
              {orc.clientes?.cidade && <div style={{ fontSize: "11px", color: "#555" }}>{orc.clientes.cidade}</div>}
              {orc.clientes?.tel && <div style={{ fontSize: "11px", color: "#555" }}>Tel: {orc.clientes.tel}</div>}
            </div>
            <div style={{ padding: "14px", background: "#f8f9fa", borderRadius: "8px", border: "1px solid #dee2e6" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#1a3a6b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>📋 Condições</div>
              <div style={{ fontSize: "11px", color: "#555", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div>Pagamento: <strong>{orc.forma_pgto || "—"}</strong></div>
                {orc.parcelas > 1 && <div>Parcelas: <strong>{orc.parcelas}×</strong></div>}
                <div>Frete: <strong>{orc.frete || "Retirada"}</strong></div>
                {orc.dt_entrega && <div>Entrega: <strong>{formatDate(orc.dt_entrega)}</strong></div>}
              </div>
            </div>
          </div>

          {/* Itens */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: "#1a3a6b", color: "white" }}>
                <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700 }}>#</th>
                <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700 }}>Produto</th>
                <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700 }}>Dimensão (mm)</th>
                <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700 }}>m²</th>
                <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700 }}>Qtd</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>R$/m²</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>Lapidação</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(orc.itens_orcamento ?? []).map((item: any, i: number) => (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9fa" }}>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #dee2e6", color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #dee2e6", fontWeight: 600 }}>{item.produto_nome}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #dee2e6", textAlign: "center", fontFamily: "monospace" }}>{item.largura} × {item.altura}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #dee2e6", textAlign: "center", fontFamily: "monospace" }}>{Number(item.m2).toFixed(3)}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #dee2e6", textAlign: "center" }}>{item.quantidade}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #dee2e6", textAlign: "right", fontFamily: "monospace" }}>{formatBRL(item.valor_m2)}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #dee2e6", textAlign: "right", fontFamily: "monospace" }}>
                    {item.lapidacao > 0 ? formatBRL(item.lapidacao) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #dee2e6", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#1a3a6b" }}>
                    {formatBRL(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totais */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
            <div style={{ minWidth: "280px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #dee2e6", fontSize: "12px" }}>
                <span style={{ color: "#555" }}>m² Total</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{Number(orc.m2_total).toFixed(2)} m²</span>
              </div>
              {orc.desconto > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #dee2e6", fontSize: "12px" }}>
                  <span style={{ color: "#c00" }}>Desconto ({orc.desconto}%)</span>
                  <span style={{ fontFamily: "monospace", color: "#c00" }}>− {formatBRL(orc.valor_total / (1 - orc.desconto / 100) * orc.desconto / 100)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "#1a3a6b", borderRadius: "6px", marginTop: "6px" }}>
                <span style={{ color: "white", fontWeight: 700, fontSize: "14px" }}>VALOR TOTAL</span>
                <span style={{ color: "#3dffa0", fontWeight: 900, fontSize: "16px", fontFamily: "monospace" }}>{formatBRL(orc.valor_total)}</span>
              </div>
            </div>
          </div>

          {/* Observações */}
          {orc.obs && (
            <div style={{ padding: "12px", background: "#fff3cd", borderRadius: "6px", marginBottom: "16px", fontSize: "12px" }}>
              <strong>Observações:</strong> {orc.obs}
            </div>
          )}

          {/* Rodapé */}
          <div style={{ borderTop: "2px solid #1a3a6b", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#888" }}>
            <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Juiz de Fora/MG</div>
            <div style={{ color: "#c00", fontStyle: "italic" }}>Este documento não substitui a Nota Fiscal Eletrônica</div>
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