"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/formatters";

interface ItemNota {
  produto_nome: string; ncm: string; cfop: string; unidade: string;
  quantidade: number; valor_unitario: number; valor_bruto: number;
  ipi_pct: number; icms_pct: number; valor_ipi: number;
  valor_icms: number; valor_pis: number; valor_cofins: number;
}

interface FormNota {
  pedido_id: string; natureza_op: string; finalidade: string;
  tipo: string; serie: string; cfop_padrao: string; itens: ItemNota[];
  valor_desconto: number; valor_frete: number; valor_seguro: number; valor_outros: number;
  forma_pgto: string; parcelas: number; modalidade_frete: number;
  transportadora: string; placa_veiculo: string; uf_veiculo: string;
  peso_bruto: string; peso_liquido: string; volumes: string; especie_volume: string;
  dt_saida: string; hora_saida: string; obs_contribuinte: string;
}

interface ClienteInfo {
  nome: string; cpf?: string | null; cnpj?: string | null; tipo_pessoa: string;
  ie?: string | null; ind_ie?: string | null;
  logradouro?: string | null; endereco?: string | null;
  numero?: string | null; bairro?: string | null;
  cidade?: string | null; uf?: string | null; cep?: string | null;
  tel?: string | null;
}

interface EmitenteInfo {
  nome: string; fantasia: string; cnpj: string; ie: string;
  logradouro: string; numero: string; bairro: string;
  municipio: string; uf: string; cep: string; tel?: string;
}

interface Totais {
  valorProdutos: number; valorIcms: number; valorPis: number;
  valorCofins: number; valorIpi: number; valorNota: number;
}

interface Props {
  form: FormNota;
  cliente: ClienteInfo;
  totais: Totais;
  onClose: () => void;
  onEmitir: () => void;
  emitindo: boolean;
}

const MOD_FRETE: Record<number, string> = {
  0: "0-Emitente", 1: "1-Destinatário", 2: "2-Terceiros",
  3: "3-Próprio/Rem.", 4: "4-Próprio/Dest.", 9: "9-Sem Frete",
};

// ─── helpers visuais DANFE ───────────────────────────────────────

const cell: React.CSSProperties = {
  border: "1px solid #000", padding: "2px 4px",
  background: "#fff", minHeight: "22px", boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  fontSize: "6px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.3px", color: "#000", lineHeight: 1, marginBottom: "1px",
  display: "block",
};
const val: React.CSSProperties = {
  fontSize: "9px", fontWeight: 700, color: "#000",
  lineHeight: 1.2, wordBreak: "break-word",
};

function Cell({ label, value, style }: { label: string; value?: string | null; style?: React.CSSProperties }) {
  return (
    <div style={{ ...cell, ...style }}>
      <span style={lbl}>{label}</span>
      <span style={val}>{value || " "}</span>
    </div>
  );
}

function SecHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "#003399", color: "#fff", fontSize: "7px", fontWeight: 800,
      textTransform: "uppercase", letterSpacing: "0.5px", padding: "2px 4px",
      border: "1px solid #000", borderBottom: "none", marginTop: "4px",
    }}>
      {children}
    </div>
  );
}

export default function EspelhoModal({ form, cliente, totais, onClose, onEmitir, emitindo }: Props) {
  const [emitente, setEmitente] = useState<EmitenteInfo | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notas/emitente").then(r => r.json()).then(setEmitente).catch(() => null);
  }, []);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  const docDest = cliente.tipo_pessoa === "PF" ? cliente.cpf : cliente.cnpj;
  const endDest = [cliente.logradouro || cliente.endereco, cliente.numero ? `Nº ${cliente.numero}` : null].filter(Boolean).join(", ");
  const endEmit = emitente ? `${emitente.logradouro}, ${emitente.numero}` : "";
  const totalIcms    = form.itens.reduce((s, i) => s + i.valor_icms, 0);
  const totalIpi     = form.itens.reduce((s, i) => s + i.valor_ipi, 0);
  const valorTotal   = totais.valorNota;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "rgba(0,0,0,.72)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "12px",
      }}
    >
      <div style={{
        background: "var(--surf1)", borderRadius: "12px",
        width: "100%", maxWidth: "920px", maxHeight: "94vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,.6)",
      }}>

        {/* ── Header do modal (dark) ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", borderBottom: "1px solid var(--b1)", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--t1)" }}>Prévia — DANFE</div>
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>Confira antes de enviar à SEFAZ</div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{
              fontSize: "10px", color: "#f59e0b", background: "rgba(245,158,11,.1)",
              border: "1px solid rgba(245,158,11,.3)", borderRadius: "6px", padding: "3px 8px", fontWeight: 700,
            }}>⚠ HOMOLOGAÇÃO</div>
            <button className="btn bg sm" onClick={onClose}>Fechar</button>
            <button className="btn bp sm" onClick={onEmitir} disabled={emitindo}>
              {emitindo ? "Enviando..." : "Confirmar e Emitir →"}
            </button>
          </div>
        </div>

        {/* ── Área do DANFE (branca, scrollável) ── */}
        <div style={{ overflowY: "auto", flex: 1, background: "#e0e0e0", padding: "16px" }}>
          <div style={{
            background: "#fff", fontFamily: "Arial, Helvetica, sans-serif",
            width: "100%", maxWidth: "800px", margin: "0 auto",
            padding: "6px", boxShadow: "0 2px 12px rgba(0,0,0,.2)",
            position: "relative",
          }}>

            {/* Marca d'água ESPELHO */}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%,-50%) rotate(-35deg)",
              fontSize: "72px", fontWeight: 900, color: "rgba(0,0,0,.04)",
              pointerEvents: "none", whiteSpace: "nowrap", zIndex: 0,
              letterSpacing: "8px",
            }}>ESPELHO</div>

            {/* ── BLOCO 1: Emitente | DANFE | Tipo ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 50px", border: "1px solid #000" }}>
              {/* Emitente */}
              <div style={{ borderRight: "1px solid #000", padding: "4px 6px" }}>
                <div style={{ fontSize: "11px", fontWeight: 900, color: "#000", lineHeight: 1.3 }}>
                  {emitente?.nome || "—"}
                </div>
                {emitente?.fantasia && (
                  <div style={{ fontSize: "8px", color: "#000", marginTop: "1px" }}>{emitente.fantasia}</div>
                )}
                <div style={{ fontSize: "8px", color: "#000", marginTop: "3px" }}>{endEmit}</div>
                <div style={{ fontSize: "8px", color: "#000" }}>
                  {emitente ? `${emitente.bairro} – ${emitente.municipio}/${emitente.uf}` : ""}
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "2px" }}>
                  {emitente?.tel && <span style={{ fontSize: "8px", color: "#000" }}>Fone: {emitente.tel}</span>}
                  <span style={{ fontSize: "8px", color: "#000" }}>CEP: {emitente?.cep || "—"}</span>
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "3px" }}>
                  <span style={{ fontSize: "8px", color: "#000" }}>CNPJ: <strong>{emitente?.cnpj || "—"}</strong></span>
                  <span style={{ fontSize: "8px", color: "#000" }}>IE: <strong>{emitente?.ie || "—"}</strong></span>
                </div>
              </div>

              {/* Centro: DANFE */}
              <div style={{ borderRight: "1px solid #000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px" }}>
                <div style={{ fontSize: "18px", fontWeight: 900, color: "#000", letterSpacing: "2px" }}>DANFE</div>
                <div style={{ fontSize: "6px", textAlign: "center", color: "#000", lineHeight: 1.4, marginTop: "2px" }}>
                  Documento Auxiliar da<br />Nota Fiscal Eletrônica
                </div>
                <div style={{ border: "1px solid #000", padding: "3px 8px", marginTop: "6px", textAlign: "center" }}>
                  <span style={lbl}>Modelo</span>
                  <span style={{ ...val, fontSize: "11px" }}>55</span>
                </div>
                <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                  <div style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center" }}>
                    <span style={lbl}>Série</span>
                    <span style={{ ...val, fontSize: "10px" }}>{form.serie || "1"}</span>
                  </div>
                  <div style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "center" }}>
                    <span style={lbl}>Nº</span>
                    <span style={{ ...val, fontSize: "10px" }}>A EMITIR</span>
                  </div>
                </div>
                <div style={{ fontSize: "6px", color: "#555", marginTop: "6px" }}>Folha 1/1</div>
              </div>

              {/* Tipo Saída/Entrada */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px", gap: "4px" }}>
                <span style={lbl}>Entrada / Saída</span>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "50%",
                  border: "2px solid #000", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "18px", fontWeight: 900, color: "#000",
                }}>
                  {form.tipo === "saida" ? "1" : "0"}
                </div>
                <div style={{ fontSize: "7px", color: "#000", fontWeight: 700 }}>
                  {form.tipo === "saida" ? "SAÍDA" : "ENTRADA"}
                </div>
              </div>
            </div>

            {/* ── Natureza da Operação + Data/Hora Saída ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px", borderLeft: "1px solid #000", borderRight: "1px solid #000", borderBottom: "1px solid #000" }}>
              <Cell label="Natureza da Operação" value={form.natureza_op} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Data de Saída / Entrada" value={form.dt_saida || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Hora de Saída" value={form.hora_saida || "—"} style={{ border: "none" }} />
            </div>

            {/* ── Chave de Acesso ── */}
            <div style={{ border: "1px solid #000", borderTop: "none", padding: "2px 4px" }}>
              <span style={lbl}>Chave de Acesso</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "8px", fontFamily: "monospace", color: "#000", letterSpacing: "1px", flex: 1 }}>
                  0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000
                </span>
                <span style={{ fontSize: "6px", color: "#555" }}>Consulta em nfe.fazenda.gov.br</span>
              </div>
            </div>

            {/* ── DESTINATÁRIO ── */}
            <SecHeader>Destinatário / Remetente</SecHeader>
            <div style={{ border: "1px solid #000", display: "grid", gridTemplateColumns: "1fr 140px 90px" }}>
              <Cell label="Nome / Razão Social" value={cliente.nome} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label={cliente.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} value={docDest || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Data de Emissão" value={new Date().toLocaleDateString("pt-BR")} style={{ border: "none" }} />
            </div>
            <div style={{ border: "1px solid #000", borderTop: "none", display: "grid", gridTemplateColumns: "1fr 1fr 80px 60px 80px 40px" }}>
              <Cell label="Endereço" value={endDest || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Bairro / Distrito" value={cliente.bairro || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="CEP" value={cliente.cep || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="UF" value={cliente.uf || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Município" value={cliente.cidade || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Fone" value={(cliente as any).tel || "—"} style={{ border: "none" }} />
            </div>
            <div style={{ border: "1px solid #000", borderTop: "none", display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              <Cell label="Inscrição Estadual" value={cliente.ie || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Inscrição Estadual Subst. Tributário" value="—" style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Inscrição Suframa" value="—" style={{ border: "none" }} />
            </div>

            {/* ── CÁLCULO DO IMPOSTO ── */}
            <SecHeader>Cálculo do Imposto</SecHeader>
            <div style={{ border: "1px solid #000", display: "grid", gridTemplateColumns: "repeat(5,1fr)" }}>
              <Cell label="Base de Cálculo do ICMS" value={formatBRL(totalIcms > 0 ? totais.valorProdutos : 0)} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Valor do ICMS" value={formatBRL(totais.valorIcms)} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Base de Cálculo ICMS ST" value="R$ 0,00" style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Valor do ICMS ST" value="R$ 0,00" style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Valor Total do IPI" value={formatBRL(totais.valorIpi)} style={{ border: "none" }} />
            </div>
            <div style={{ border: "1px solid #000", borderTop: "none", display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
              <Cell label="Valor dos Produtos" value={formatBRL(totais.valorProdutos)} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Valor do Frete" value={formatBRL(form.valor_frete)} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Valor do Seguro" value={formatBRL(form.valor_seguro)} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Desconto" value={formatBRL(form.valor_desconto)} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Outras Despesas Acessórias" value={formatBRL(form.valor_outros)} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Valor Total do PIS" value={formatBRL(totais.valorPis)} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Valor Total da COFINS" value={formatBRL(totais.valorCofins)} style={{ border: "none" }} />
            </div>
            {/* Total da nota com destaque */}
            <div style={{ border: "1px solid #000", borderTop: "none", display: "flex", justifyContent: "flex-end" }}>
              <div style={{
                background: "#003399", color: "#fff", padding: "4px 12px",
                display: "flex", alignItems: "center", gap: "12px", width: "100%", justifyContent: "flex-end",
              }}>
                <span style={{ fontSize: "8px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>Valor Total da Nota</span>
                <span style={{ fontSize: "14px", fontWeight: 900, fontFamily: "monospace" }}>{formatBRL(valorTotal)}</span>
              </div>
            </div>

            {/* ── TRANSPORTADOR ── */}
            <SecHeader>Transportador / Volumes Transportados</SecHeader>
            <div style={{ border: "1px solid #000", display: "grid", gridTemplateColumns: "1fr 100px 100px 60px" }}>
              <Cell label="Nome / Razão Social" value={form.transportadora || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Frete por Conta" value={MOD_FRETE[form.modalidade_frete] ?? "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Placa do Veículo" value={form.placa_veiculo ? `${form.placa_veiculo}/${form.uf_veiculo}` : "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="UF" value={form.uf_veiculo || "—"} style={{ border: "none" }} />
            </div>
            <div style={{ border: "1px solid #000", borderTop: "none", display: "grid", gridTemplateColumns: "60px 60px 60px 80px 80px 1fr" }}>
              <Cell label="Qtde" value={form.volumes || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Espécie" value={form.especie_volume || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Marca" value="—" style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Numeração" value="—" style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Peso Bruto (kg)" value={form.peso_bruto || "—"} style={{ border: "none", borderRight: "1px solid #000" }} />
              <Cell label="Peso Líquido (kg)" value={form.peso_liquido || "—"} style={{ border: "none" }} />
            </div>

            {/* ── PRODUTOS ── */}
            <SecHeader>Dados dos Produtos / Serviços</SecHeader>
            <div style={{ border: "1px solid #000", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7px", fontFamily: "Arial, sans-serif" }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    {[
                      ["Cód.", "30px"], ["Descrição do Produto / Serviço", "auto"],
                      ["NCM/SH", "50px"], ["CST", "26px"], ["CFOP", "30px"],
                      ["Un.", "24px"], ["Qtd.", "40px"], ["Vl. Unit.", "54px"],
                      ["Vl. Total", "54px"], ["B.ICMS", "46px"], ["V.ICMS", "46px"],
                      ["V.IPI", "40px"], ["ICMS%", "30px"], ["IPI%", "26px"],
                    ].map(([h, w]) => (
                      <th key={h as string} style={{
                        border: "1px solid #999", padding: "2px 3px", textAlign: "center",
                        fontSize: "6px", fontWeight: 800, whiteSpace: "nowrap",
                        width: w as string, color: "#000",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.itens.map((item, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "center", color: "#000" }}>{i + 1}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", color: "#000", fontWeight: 700 }}>{item.produto_nome}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "center", color: "#000", fontFamily: "monospace" }}>{item.ncm}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "center", color: "#000" }}>000</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "center", color: "#000" }}>{item.cfop}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "center", color: "#000" }}>{item.unidade}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "right", color: "#000", fontFamily: "monospace" }}>{item.quantidade.toFixed(4)}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "right", color: "#000", fontFamily: "monospace" }}>{formatBRL(item.valor_unitario)}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "right", color: "#000", fontFamily: "monospace", fontWeight: 700 }}>{formatBRL(item.valor_bruto)}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "right", color: "#000", fontFamily: "monospace" }}>{formatBRL(item.icms_pct > 0 ? item.valor_bruto : 0)}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "right", color: "#000", fontFamily: "monospace" }}>{formatBRL(item.valor_icms)}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "right", color: "#000", fontFamily: "monospace" }}>{formatBRL(item.valor_ipi)}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "center", color: "#000" }}>{item.icms_pct > 0 ? `${item.icms_pct}%` : "—"}</td>
                      <td style={{ border: "1px solid #ccc", padding: "2px 3px", textAlign: "center", color: "#000" }}>{item.ipi_pct > 0 ? `${item.ipi_pct}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── DADOS ADICIONAIS ── */}
            <SecHeader>Dados Adicionais</SecHeader>
            <div style={{ border: "1px solid #000", display: "grid", gridTemplateColumns: "1fr 160px" }}>
              <div style={{ borderRight: "1px solid #000", padding: "3px 4px", minHeight: "40px" }}>
                <span style={lbl}>Informações Complementares</span>
                <span style={{ ...val, fontSize: "8px", display: "block", whiteSpace: "pre-wrap", marginTop: "2px" }}>
                  {form.obs_contribuinte || " "}
                </span>
              </div>
              <div style={{ padding: "3px 4px", minHeight: "40px" }}>
                <span style={lbl}>Reservado ao Fisco</span>
              </div>
            </div>

            {/* Rodapé */}
            <div style={{ marginTop: "6px", fontSize: "6px", color: "#666", textAlign: "center", borderTop: "1px dashed #ccc", paddingTop: "4px" }}>
              Prévia — Este documento não é a NF-e oficial. A numeração e a chave de acesso serão geradas após a emissão pela SEFAZ.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
