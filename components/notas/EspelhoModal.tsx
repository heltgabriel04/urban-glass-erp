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
  form: FormNota; cliente: ClienteInfo; totais: Totais;
  onClose: () => void; onEmitir: () => void; emitindo: boolean;
}

const MOD_FRETE: Record<number, string> = {
  0:"0-Emitente", 1:"1-Destinatário", 2:"2-Terceiros",
  3:"3-Próprio/Rem.", 4:"4-Próprio/Dest.", 9:"9-Sem Frete",
};

// ─── primitivos DANFE ────────────────────────────────────────────
const B: React.CSSProperties = { border:"0.5px solid #000", boxSizing:"border-box", background:"#fff" };

function F({ label, value, style }: { label:string; value?:string|null; style?:React.CSSProperties }) {
  return (
    <div style={{ ...B, padding:"1px 3px", minHeight:"18px", ...style }}>
      <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.2px", lineHeight:1, color:"#000", marginBottom:"1px" }}>{label}</div>
      <div style={{ fontSize:"7.5px", fontWeight:700, color:"#000", lineHeight:1.3, wordBreak:"break-word" }}>{value ?? " "}</div>
    </div>
  );
}

function SecBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background:"#4472c4", color:"#fff", fontSize:"6px", fontWeight:800, textTransform:"uppercase", letterSpacing:"0.5px", padding:"2px 4px", ...B, borderBottom:"none", marginTop:"3px" }}>
      {children}
    </div>
  );
}

export default function EspelhoModal({ form, cliente, totais, onClose, onEmitir, emitindo }: Props) {
  const [emit, setEmit] = useState<EmitenteInfo | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch("/api/notas/emitente").then(r => r.json()).then(setEmit).catch(() => null); }, []);

  const docDest = cliente.tipo_pessoa === "PF" ? cliente.cpf : cliente.cnpj;
  const endDest = [cliente.logradouro || cliente.endereco, cliente.numero ? `Nº ${cliente.numero}` : null].filter(Boolean).join(", ");
  const endEmit = emit ? `${emit.logradouro}, ${emit.numero} – ${emit.bairro}` : "";
  const dtHoje  = new Date().toLocaleDateString("pt-BR");
  const totalIcmsBase = totais.valorIcms > 0 ? totais.valorProdutos : 0;

  return (
    <div ref={overlayRef} onClick={e => e.target === overlayRef.current && onClose()} style={{
      position:"fixed", inset:0, zIndex:999,
      background:"rgba(0,0,0,.75)", backdropFilter:"blur(3px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:"12px",
    }}>
      <div style={{
        background:"var(--surf0)", borderRadius:"10px",
        width:"100%", maxWidth:"860px", maxHeight:"95vh",
        display:"flex", flexDirection:"column", overflow:"hidden",
        boxShadow:"0 24px 80px rgba(0,0,0,.7)",
      }}>

        {/* ── barra superior do modal ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderBottom:"1px solid var(--b1)", flexShrink:0, background:"var(--surf1)" }}>
          <div>
            <div style={{ fontSize:"13px", fontWeight:700, color:"var(--t1)" }}>Prévia do DANFE — Espelho da NF-e</div>
            <div style={{ fontSize:"10px", color:"var(--t3)" }}>Confira todos os dados antes de enviar à SEFAZ</div>
          </div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            <span style={{ fontSize:"10px", color:"#f59e0b", background:"rgba(245,158,11,.1)", border:"1px solid rgba(245,158,11,.25)", borderRadius:"5px", padding:"3px 8px", fontWeight:700 }}>⚠ HOMOLOGAÇÃO</span>
            <button className="btn bg sm" onClick={onClose}>Fechar</button>
            <button className="btn bp sm" onClick={onEmitir} disabled={emitindo}>{emitindo ? "Enviando..." : "Confirmar e Emitir →"}</button>
          </div>
        </div>

        {/* ── folha DANFE ── */}
        <div style={{ overflowY:"auto", flex:1, background:"#c8c8c8", padding:"14px 0" }}>
          <div style={{
            fontFamily:"Arial, Helvetica, sans-serif",
            background:"#fff", width:"780px", margin:"0 auto",
            padding:"6px 6px 10px 6px",
            boxShadow:"0 2px 16px rgba(0,0,0,.35)",
            position:"relative",
          }}>

            {/* ── watermark ── */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              transform:"translate(-50%,-50%) rotate(-40deg)",
              fontSize:"80px", fontWeight:900, color:"rgba(255,0,0,.07)",
              pointerEvents:"none", whiteSpace:"nowrap", zIndex:0, letterSpacing:"4px",
              userSelect:"none",
            }}>SEM VALOR FISCAL</div>

            {/* ════════════════ CANHOTO ════════════════ */}
            <div style={{ ...B, borderStyle:"dashed", padding:"4px 6px", marginBottom:"6px", display:"grid", gridTemplateColumns:"1fr auto" }}>
              <div>
                <div style={{ fontSize:"6px", fontWeight:700, color:"#000", textTransform:"uppercase", marginBottom:"2px" }}>
                  Recebemos de {emit?.nome ?? "EMITENTE"} os produtos e/ou serviços constantes da Nota Fiscal Eletrônica indicada ao lado
                </div>
                <div style={{ display:"flex", gap:"24px", marginTop:"6px" }}>
                  <div>
                    <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Data de Recebimento</div>
                    <div style={{ borderBottom:"0.5px solid #000", width:"100px", marginTop:"10px" }} />
                  </div>
                  <div>
                    <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Identificação e Assinatura do Recebedor</div>
                    <div style={{ borderBottom:"0.5px solid #000", width:"200px", marginTop:"10px" }} />
                  </div>
                </div>
              </div>
              <div style={{ borderLeft:"0.5px dashed #000", paddingLeft:"8px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"2px" }}>
                <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>NF-e</div>
                <div style={{ fontSize:"10px", fontWeight:900, color:"#000" }}>Nº A EMITIR</div>
                <div style={{ fontSize:"6px", color:"#000" }}>Série {form.serie || "1"}</div>
              </div>
            </div>

            {/* ════════════════ CABEÇALHO ════════════════ */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 185px 62px", border:"0.5px solid #000" }}>

              {/* emitente */}
              <div style={{ borderRight:"0.5px solid #000", padding:"5px 6px" }}>
                <div style={{ fontSize:"10px", fontWeight:900, color:"#000", lineHeight:1.25, marginBottom:"2px" }}>
                  {emit?.nome ?? "—"}
                </div>
                {emit?.fantasia && <div style={{ fontSize:"7px", color:"#000", marginBottom:"1px" }}>{emit.fantasia}</div>}
                <div style={{ fontSize:"7px", color:"#000" }}>{endEmit}</div>
                <div style={{ fontSize:"7px", color:"#000" }}>{emit ? `${emit.municipio} – ${emit.uf}` : ""}</div>
                <div style={{ fontSize:"7px", color:"#000", marginTop:"3px" }}>
                  {emit?.tel ? `Fone/Fax: ${emit.tel}   ` : ""}CEP: {emit?.cep ?? "—"}
                </div>
                <div style={{ display:"flex", gap:"14px", marginTop:"3px" }}>
                  <span style={{ fontSize:"7px", color:"#000" }}>CNPJ: <strong>{emit?.cnpj ?? "—"}</strong></span>
                  <span style={{ fontSize:"7px", color:"#000" }}>IE: <strong>{emit?.ie ?? "—"}</strong></span>
                </div>
              </div>

              {/* título DANFE */}
              <div style={{ borderRight:"0.5px solid #000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"5px 4px", gap:"3px" }}>
                <div style={{ fontSize:"18px", fontWeight:900, letterSpacing:"3px", color:"#000" }}>DANFE</div>
                <div style={{ fontSize:"6px", textAlign:"center", color:"#000", lineHeight:1.4 }}>
                  Documento Auxiliar da<br />Nota Fiscal Eletrônica
                </div>
                <div style={{ display:"flex", gap:"3px", marginTop:"4px" }}>
                  <div style={{ ...B, padding:"1px 5px", textAlign:"center" }}>
                    <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Modelo</div>
                    <div style={{ fontSize:"9px", fontWeight:900, color:"#000" }}>55</div>
                  </div>
                  <div style={{ ...B, padding:"1px 5px", textAlign:"center" }}>
                    <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Série</div>
                    <div style={{ fontSize:"9px", fontWeight:900, color:"#000" }}>{form.serie || "1"}</div>
                  </div>
                  <div style={{ ...B, padding:"1px 5px", textAlign:"center" }}>
                    <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Número</div>
                    <div style={{ fontSize:"8px", fontWeight:900, color:"#000" }}>A EMITIR</div>
                  </div>
                </div>
                <div style={{ fontSize:"6px", color:"#555", marginTop:"4px" }}>Folha 1 / 1</div>
              </div>

              {/* tipo entrada/saída */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"4px", padding:"4px" }}>
                <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Entrada / Saída</div>
                <div style={{
                  width:"36px", height:"36px", borderRadius:"50%", border:"1.5px solid #000",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:"20px", fontWeight:900, color:"#000",
                }}>
                  {form.tipo === "saida" ? "1" : "0"}
                </div>
                <div style={{ fontSize:"6.5px", fontWeight:700, color:"#000" }}>
                  {form.tipo === "saida" ? "SAÍDA" : "ENTRADA"}
                </div>
              </div>
            </div>

            {/* natureza / datas */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 110px 90px 80px", border:"0.5px solid #000", borderTop:"none" }}>
              <F label="Natureza da Operação" value={form.natureza_op} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="CFOP" value={form.cfop_padrao} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Data de Emissão" value={dtHoje} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Data Saída / Entrada" value={form.dt_saida || dtHoje} style={{ border:"none" }} />
            </div>

            {/* chave de acesso */}
            <div style={{ ...B, borderTop:"none", padding:"2px 4px" }}>
              <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", color:"#000", marginBottom:"1px" }}>Chave de Acesso</div>
              <div style={{ fontSize:"7px", fontFamily:"'Courier New', monospace", color:"#000", letterSpacing:"1.5px", textAlign:"center" }}>
                0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000
              </div>
              <div style={{ fontSize:"5.5px", color:"#555", textAlign:"center", marginTop:"1px" }}>
                Consulta de autenticidade em nfe.fazenda.gov.br — Número do Protocolo: A DEFINIR APÓS EMISSÃO
              </div>
            </div>

            {/* ════════════════ DESTINATÁRIO ════════════════ */}
            <SecBar>Destinatário / Remetente</SecBar>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 90px", border:"0.5px solid #000" }}>
              <F label="Nome / Razão Social" value={cliente.nome} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label={cliente.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} value={docDest ?? "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Data de Emissão" value={dtHoje} style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px 55px 80px", border:"0.5px solid #000", borderTop:"none" }}>
              <F label="Endereço" value={endDest || "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Bairro / Distrito" value={cliente.bairro ?? "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="CEP" value={cliente.cep ?? "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="UF" value={cliente.uf ?? "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Município" value={cliente.cidade ?? "—"} style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", border:"0.5px solid #000", borderTop:"none" }}>
              <F label="Inscrição Estadual" value={cliente.ie ?? "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Insc. Est. do Subst. Tributário" value="—" style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Inscrição Municipal" value="—" style={{ border:"none" }} />
            </div>

            {/* ════════════════ CÁLCULO DO IMPOSTO ════════════════ */}
            <SecBar>Cálculo do Imposto</SecBar>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", border:"0.5px solid #000" }}>
              <F label="Base de Cálculo do ICMS" value={formatBRL(totalIcmsBase)} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Valor do ICMS" value={formatBRL(totais.valorIcms)} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Base de Cálculo do ICMS ST" value="R$ 0,00" style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Valor do ICMS ST" value="R$ 0,00" style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Valor Total do IPI" value={formatBRL(totais.valorIpi)} style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", border:"0.5px solid #000", borderTop:"none" }}>
              <F label="Valor dos Produtos" value={formatBRL(totais.valorProdutos)} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Valor do Frete" value={formatBRL(form.valor_frete)} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Valor do Seguro" value={formatBRL(form.valor_seguro)} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Desconto" value={formatBRL(form.valor_desconto)} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Outras Desp. Acessórias" value={formatBRL(form.valor_outros)} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Valor Total do PIS" value={formatBRL(totais.valorPis)} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Valor Total da COFINS" value={formatBRL(totais.valorCofins)} style={{ border:"none" }} />
            </div>
            <div style={{ ...B, borderTop:"none", background:"#4472c4", padding:"3px 6px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:"7px", fontWeight:800, textTransform:"uppercase", letterSpacing:"0.5px", color:"#fff" }}>Valor Total da Nota Fiscal</span>
              <span style={{ fontSize:"13px", fontWeight:900, color:"#fff", fontFamily:"'Courier New', monospace" }}>{formatBRL(totais.valorNota)}</span>
            </div>

            {/* ════════════════ TRANSPORTADOR ════════════════ */}
            <SecBar>Transportador / Volumes Transportados</SecBar>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 130px 120px 50px 90px", border:"0.5px solid #000" }}>
              <F label="Nome / Razão Social" value={form.transportadora || "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Frete por Conta" value={MOD_FRETE[form.modalidade_frete] ?? "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="CNPJ / CPF" value="—" style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="UF" value={form.uf_veiculo || "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Placa do Veículo" value={form.placa_veiculo || "—"} style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"55px 60px 60px 80px 80px 80px", border:"0.5px solid #000", borderTop:"none" }}>
              <F label="Qtde" value={form.volumes || "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Espécie" value={form.especie_volume || "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Marca" value="—" style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Numeração" value="—" style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Peso Bruto (kg)" value={form.peso_bruto || "—"} style={{ border:"none", borderRight:"0.5px solid #000" }} />
              <F label="Peso Líquido (kg)" value={form.peso_liquido || "—"} style={{ border:"none" }} />
            </div>

            {/* ════════════════ PRODUTOS ════════════════ */}
            <SecBar>Dados dos Produtos / Serviços</SecBar>
            <div style={{ ...B, borderTop:"none", overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"6.5px", fontFamily:"Arial, sans-serif" }}>
                <thead>
                  <tr style={{ background:"#eaf0fb" }}>
                    {([
                      ["Cód.","30px"],["Descrição do Produto / Serviço","auto"],
                      ["NCM/SH","50px"],["O/CST","28px"],["CFOP","30px"],
                      ["Un.","24px"],["Qtde. Trib.","50px"],["Vl. Unit. Trib.","60px"],
                      ["Vl. Total Bruto","62px"],["B. Cálc. ICMS","52px"],
                      ["Vl. ICMS","48px"],["Vl. IPI","44px"],["% ICMS","36px"],["% IPI","32px"],
                    ] as [string,string][]).map(([h, w]) => (
                      <th key={h} style={{ border:"0.5px solid #999", padding:"2px 2px", textAlign:"center", fontSize:"5.5px", fontWeight:800, whiteSpace:"nowrap", width:w, color:"#000", background:"#dce6f1" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.itens.map((item, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f7f7f7" }}>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", color:"#000" }}>{i + 1}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", color:"#000", fontWeight:700 }}>{item.produto_nome}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", color:"#000", fontFamily:"monospace" }}>{item.ncm}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", color:"#000" }}>000</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", color:"#000" }}>{item.cfop}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", color:"#000" }}>{item.unidade}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", color:"#000", fontFamily:"monospace" }}>{item.quantidade.toFixed(4)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", color:"#000", fontFamily:"monospace" }}>{formatBRL(item.valor_unitario)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", color:"#000", fontFamily:"monospace", fontWeight:700 }}>{formatBRL(item.valor_bruto)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", color:"#000", fontFamily:"monospace" }}>{formatBRL(item.icms_pct > 0 ? item.valor_bruto : 0)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", color:"#000", fontFamily:"monospace" }}>{formatBRL(item.valor_icms)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", color:"#000", fontFamily:"monospace" }}>{formatBRL(item.valor_ipi)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", color:"#000" }}>{item.icms_pct > 0 ? `${item.icms_pct}%` : "—"}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", color:"#000" }}>{item.ipi_pct > 0 ? `${item.ipi_pct}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ════════════════ DADOS ADICIONAIS ════════════════ */}
            <SecBar>Dados Adicionais</SecBar>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 160px", border:"0.5px solid #000" }}>
              <div style={{ borderRight:"0.5px solid #000", padding:"3px 4px", minHeight:"48px" }}>
                <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", color:"#000", marginBottom:"2px" }}>Informações Complementares de Interesse do Contribuinte</div>
                <div style={{ fontSize:"7px", color:"#000", lineHeight:1.5, whiteSpace:"pre-wrap" }}>{form.obs_contribuinte || " "}</div>
              </div>
              <div style={{ padding:"3px 4px", minHeight:"48px" }}>
                <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", color:"#000", marginBottom:"2px" }}>Reservado ao Fisco</div>
              </div>
            </div>

            {/* rodapé */}
            <div style={{ marginTop:"5px", borderTop:"0.5px dashed #999", paddingTop:"3px", display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:"5.5px", color:"#888" }}>Prévia gerada pelo sistema — Sem valor fiscal</span>
              <span style={{ fontSize:"5.5px", color:"#888" }}>A numeração, chave de acesso e protocolo serão definidos pela SEFAZ após a autorização.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
