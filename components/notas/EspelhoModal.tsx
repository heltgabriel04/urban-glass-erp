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
}

interface EmitenteInfo {
  nome: string; fantasia: string; cnpj: string; ie: string;
  logradouro: string; numero: string; bairro: string;
  municipio: string; uf: string; cep: string;
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

const FORMAS_PGTO: Record<string, string> = {
  "01": "Dinheiro", "02": "Cheque", "03": "Cartão de Crédito",
  "04": "Cartão de Débito", "15": "Boleto Bancário", "17": "PIX",
  "90": "Sem Pagamento", "99": "Outros",
};

const MOD_FRETE: Record<number, string> = {
  0: "0 — CIF (Emitente)", 1: "1 — FOB (Destinatário)",
  2: "2 — Terceiros", 3: "3 — Próprio/Remetente",
  4: "4 — Próprio/Destinatário", 9: "9 — Sem Frete",
};

const FINALIDADE: Record<string, string> = {
  "1": "1 — NF-e Normal", "2": "2 — Complementar",
  "3": "3 — Ajuste", "4": "4 — Devolução",
};

const IND_IE: Record<string, string> = {
  "1": "Contribuinte ICMS", "2": "Isento", "9": "Não Contribuinte",
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "flex", gap: "8px", minWidth: 0 }}>
      <span style={{ fontSize: "10px", color: "var(--t3)", minWidth: "90px", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "12px", color: "var(--t1)", fontWeight: 600, wordBreak: "break-all" }}>{value || "—"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{
        fontSize: "10px", fontWeight: 800, letterSpacing: "0.08em",
        color: "var(--acc)", borderBottom: "1px solid var(--b1)",
        paddingBottom: "4px", marginBottom: "10px",
      }}>{title}</div>
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

  const docDest = form.itens.length
    ? (cliente.tipo_pessoa === "PF" ? cliente.cpf : cliente.cnpj) ?? "—"
    : "—";

  const endDest = [
    cliente.logradouro || cliente.endereco,
    cliente.numero ? `nº ${cliente.numero}` : null,
    cliente.bairro,
    cliente.cidade,
    cliente.uf,
    cliente.cep,
  ].filter(Boolean).join(", ");

  const endEmit = emitente
    ? [emitente.logradouro, emitente.numero, emitente.bairro, emitente.municipio, emitente.uf]
        .filter(Boolean).join(", ")
    : "";

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "rgba(0,0,0,.65)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div style={{
        background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "14px",
        width: "100%", maxWidth: "860px", maxHeight: "90vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--b1)", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--t1)" }}>Espelho da NF-e</div>
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>Confira os dados antes de enviar à SEFAZ</div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{
              fontSize: "11px", color: "var(--warn)", background: "rgba(245,158,11,.1)",
              border: "1px solid rgba(245,158,11,.3)", borderRadius: "6px", padding: "4px 10px",
            }}>⚠ HOMOLOGAÇÃO</div>
            <button className="btn bg sm" onClick={onClose}>Fechar</button>
            <button className="btn bp sm" onClick={onEmitir} disabled={emitindo}>
              {emitindo ? "Enviando..." : "Confirmar e Emitir →"}
            </button>
          </div>
        </div>

        {/* Body scrollável */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>

          {/* Cabeçalho da nota */}
          <Section title="IDENTIFICAÇÃO DA NOTA">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
              <Row label="Pedido"          value={form.pedido_id} />
              <Row label="Série"           value={form.serie} />
              <Row label="Finalidade"      value={FINALIDADE[form.finalidade] ?? form.finalidade} />
              <Row label="Natureza Op."    value={form.natureza_op} />
              <Row label="Tipo"            value={form.tipo === "saida" ? "Saída" : "Entrada"} />
              <Row label="CFOP Padrão"     value={form.cfop_padrao} />
              {form.dt_saida && <Row label="Data Saída" value={`${form.dt_saida} ${form.hora_saida || "00:00"}`} />}
            </div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            {/* Emitente */}
            <Section title="EMITENTE">
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Row label="Razão Social"  value={emitente?.nome} />
                <Row label="Nome Fantasia" value={emitente?.fantasia} />
                <Row label="CNPJ"          value={emitente?.cnpj} />
                <Row label="IE"            value={emitente?.ie} />
                <Row label="Endereço"      value={endEmit || undefined} />
              </div>
            </Section>

            {/* Destinatário */}
            <Section title="DESTINATÁRIO">
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Row label="Nome"          value={cliente.nome} />
                <Row label={cliente.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} value={docDest} />
                <Row label="Ind. IE"       value={IND_IE[cliente.ind_ie ?? "9"]} />
                {cliente.ie && <Row label="IE"      value={cliente.ie} />}
                <Row label="Endereço"      value={endDest || undefined} />
              </div>
            </Section>
          </div>

          {/* Itens */}
          <Section title={`PRODUTOS / ITENS (${form.itens.length})`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--b1)" }}>
                    {["#","Descrição","NCM","CFOP","Un","Qtd","Vl. Unit.","Vl. Bruto","ICMS%","IPI%","Vl. ICMS","Total Item"].map(h => (
                      <th key={h} style={{ padding: "5px 6px", textAlign: "right", color: "var(--t3)", fontWeight: 700, whiteSpace: "nowrap" }}
                        className={h === "Descrição" ? "" : undefined}
                      >{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.itens.map((item, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--b2)" }}>
                      <td style={{ padding: "5px 6px", color: "var(--t3)", textAlign: "right" }}>{i + 1}</td>
                      <td style={{ padding: "5px 6px", color: "var(--t1)", fontWeight: 600, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.produto_nome}</td>
                      <td style={{ padding: "5px 6px", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{item.ncm}</td>
                      <td style={{ padding: "5px 6px", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{item.cfop}</td>
                      <td style={{ padding: "5px 6px", textAlign: "right" }}>{item.unidade}</td>
                      <td style={{ padding: "5px 6px", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{item.quantidade.toFixed(4)}</td>
                      <td style={{ padding: "5px 6px", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{formatBRL(item.valor_unitario)}</td>
                      <td style={{ padding: "5px 6px", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{formatBRL(item.valor_bruto)}</td>
                      <td style={{ padding: "5px 6px", textAlign: "right", color: "var(--warn)" }}>{item.icms_pct}%</td>
                      <td style={{ padding: "5px 6px", textAlign: "right" }}>{item.ipi_pct > 0 ? `${item.ipi_pct}%` : "—"}</td>
                      <td style={{ padding: "5px 6px", fontFamily: "'DM Mono', monospace", textAlign: "right", color: "var(--warn)" }}>{formatBRL(item.valor_icms)}</td>
                      <td style={{ padding: "5px 6px", fontFamily: "'DM Mono', monospace", textAlign: "right", color: "var(--acc)", fontWeight: 700 }}>{formatBRL(item.valor_bruto + item.valor_ipi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Totais */}
          <Section title="TOTAIS">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "10px" }}>
              {[
                { l: "Valor Produtos",  v: totais.valorProdutos, c: "var(--t2)" },
                { l: "Valor ICMS",      v: totais.valorIcms,     c: "var(--warn)" },
                { l: "Valor IPI",       v: totais.valorIpi,      c: "var(--t2)" },
                { l: "Valor PIS",       v: totais.valorPis,      c: "var(--t2)" },
                { l: "Valor COFINS",    v: totais.valorCofins,   c: "var(--t2)" },
                { l: "Desconto",        v: form.valor_desconto,  c: "var(--err)" },
                { l: "Frete",           v: form.valor_frete,     c: "var(--t2)" },
                { l: "Seguro",          v: form.valor_seguro,    c: "var(--t2)" },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ background: "var(--surf2)", borderRadius: "6px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", marginBottom: "2px" }}>{l}</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: c, fontFamily: "'DM Mono', monospace" }}>{formatBRL(v)}</div>
                </div>
              ))}
            </div>
            <div style={{
              background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.3)",
              borderRadius: "8px", padding: "12px 16px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--t2)" }}>VALOR TOTAL DA NOTA</span>
              <span style={{ fontSize: "22px", fontWeight: 800, color: "var(--ok)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(totais.valorNota)}</span>
            </div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Transporte */}
            <Section title="TRANSPORTE">
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Row label="Modalidade"    value={MOD_FRETE[form.modalidade_frete] ?? String(form.modalidade_frete)} />
                {form.transportadora && <Row label="Transportadora" value={form.transportadora} />}
                {form.placa_veiculo  && <Row label="Placa"          value={`${form.placa_veiculo} / ${form.uf_veiculo}`} />}
                {form.volumes        && <Row label="Volumes"        value={`${form.volumes} ${form.especie_volume || "UN"}`} />}
                {form.peso_bruto     && <Row label="Peso Bruto"     value={`${form.peso_bruto} kg`} />}
                {form.peso_liquido   && <Row label="Peso Líquido"   value={`${form.peso_liquido} kg`} />}
              </div>
            </Section>

            {/* Pagamento */}
            <Section title="PAGAMENTO">
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Row label="Forma"    value={`${form.forma_pgto} — ${FORMAS_PGTO[form.forma_pgto] ?? "Outros"}`} />
                <Row label="Parcelas" value={String(form.parcelas)} />
              </div>
            </Section>
          </div>

          {/* Observações */}
          {form.obs_contribuinte && (
            <Section title="OBSERVAÇÕES (impressas na nota)">
              <div style={{ fontSize: "12px", color: "var(--t2)", background: "var(--surf2)", borderRadius: "6px", padding: "10px 12px", whiteSpace: "pre-wrap" }}>
                {form.obs_contribuinte}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
