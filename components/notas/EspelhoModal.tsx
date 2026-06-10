"use client";

import { useEffect, useState } from "react";
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
  nome: string; cpf?: string|null; cnpj?: string|null; tipo_pessoa: string;
  ie?: string|null; logradouro?: string|null; endereco?: string|null;
  numero?: string|null; bairro?: string|null;
  cidade?: string|null; uf?: string|null; cep?: string|null; tel?: string|null;
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

const MOD_FRETE: Record<number,string> = {
  0:"0-Emitente",1:"1-Destinatário",2:"2-Terceiros",
  3:"3-Próprio/Rem.",4:"4-Próprio/Dest.",9:"9-Sem frete",
};

const bd = "0.5px solid #000";

function F({ label, value, style }: { label:string; value?:string|null; style?:React.CSSProperties }) {
  return (
    <div style={{ border:bd, padding:"1px 3px", minHeight:"17px", boxSizing:"border-box", background:"#fff", ...style }}>
      <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.2px", lineHeight:1, color:"#000", marginBottom:"1px" }}>{label}</div>
      <div style={{ fontSize:"7.5px", fontWeight:700, color:"#000", lineHeight:1.3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{value || " "}</div>
    </div>
  );
}

function Sec({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border:bd, borderBottom:"none", padding:"1px 3px", background:"#d9d9d9", marginTop:"2px" }}>
      <span style={{ fontSize:"5.5px", fontWeight:800, textTransform:"uppercase", letterSpacing:"0.4px", color:"#000" }}>{children}</span>
    </div>
  );
}

export default function EspelhoModal({ form, cliente, totais, onClose, onEmitir, emitindo }: Props) {
  const [emit, setEmit] = useState<EmitenteInfo|null>(null);
  useEffect(() => { fetch("/api/notas/emitente").then(r=>r.json()).then(setEmit).catch(()=>null); }, []);

  const docDest = cliente.tipo_pessoa === "PF" ? cliente.cpf : cliente.cnpj;
  const endDest = [cliente.logradouro || cliente.endereco, cliente.numero ? `Nº ${cliente.numero}` : null].filter(Boolean).join(", ");
  const endEmit = emit ? `${emit.logradouro}, ${emit.numero} – ${emit.bairro}` : "";
  const dtHoje  = new Date().toLocaleDateString("pt-BR");
  const icmsBase = totais.valorIcms > 0 ? totais.valorProdutos : 0;

  const barPattern = [1,1,2,1,1,2,3,1,2,1,1,2,1,3,1,1,2,1,1,2,3,1,2,1,1,2,1,1,3,1,1,2,1,1,2,1,3,1,2,1,1,2,3,1,1,2,1,1,2,3,1,1,2,1,2,1,1,2,1,1,2,3,1,2,1,1,2,1,1,1];

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:999, background:"rgba(0,0,0,.75)", backdropFilter:"blur(3px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"12px" }}
    >
      <div style={{ background:"var(--surf0)", borderRadius:"10px", width:"100%", maxWidth:"860px", maxHeight:"95vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,.7)" }}>

        {/* barra do modal */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderBottom:"1px solid var(--b1)", flexShrink:0, background:"var(--surf1)" }}>
          <div>
            <div style={{ fontSize:"13px", fontWeight:700, color:"var(--t1)" }}>Espelho da NF-e — Prévia DANFE</div>
            <div style={{ fontSize:"10px", color:"var(--t3)" }}>Confira os dados antes de enviar à SEFAZ</div>
          </div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            <span style={{ fontSize:"10px", color:"#f59e0b", background:"rgba(245,158,11,.1)", border:"1px solid rgba(245,158,11,.25)", borderRadius:"5px", padding:"3px 8px", fontWeight:700 }}>⚠ HOMOLOGAÇÃO</span>
            <button className="btn bg sm" onClick={onClose}>Fechar</button>
            <button className="btn bp sm" onClick={onEmitir} disabled={emitindo}>{emitindo ? "Enviando..." : "Confirmar e Emitir →"}</button>
          </div>
        </div>

        {/* folha DANFE */}
        <div style={{ overflowY:"auto", flex:1, background:"#c8c8c8", padding:"14px 0" }}>
          <div style={{ fontFamily:"Arial, Helvetica, sans-serif", background:"#fff", width:"780px", margin:"0 auto", padding:"6px", boxShadow:"0 2px 16px rgba(0,0,0,.35)", position:"relative" }}>

            {/* watermark */}
            <div aria-hidden style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%) rotate(-35deg)", fontSize:"76px", fontWeight:900, color:"rgba(0,0,0,.07)", pointerEvents:"none", whiteSpace:"nowrap", zIndex:0, letterSpacing:"6px", userSelect:"none" }}>
              SEM VALOR FISCAL
            </div>

            {/* ── CANHOTO ── */}
            <div style={{ border:bd, borderStyle:"dashed", marginBottom:"4px", display:"grid", gridTemplateColumns:"1fr 135px" }}>
              <div style={{ padding:"3px 5px", borderRight:"0.5px dashed #000" }}>
                <div style={{ fontSize:"6px", color:"#000", lineHeight:1.6, marginBottom:"5px" }}>
                  Recebemos de <strong>{emit?.nome ?? "EMITENTE"}</strong> ({(emit?.fantasia || emit?.nome) ?? "EMITENTE"}) os produtos e/ou
                  serviços constantes na Nota Fiscal Eletrônica indicada ao lado.
                  Destinatário: <strong>{cliente.nome}</strong>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", gap:"12px" }}>
                  <div>
                    <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Data de Recebimento</div>
                    <div style={{ borderBottom:"0.5px solid #000", marginTop:"10px" }} />
                  </div>
                  <div>
                    <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Identificação e Assinatura do Recebedor</div>
                    <div style={{ borderBottom:"0.5px solid #000", marginTop:"10px" }} />
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"3px 6px", gap:"1px", textAlign:"center" }}>
                <div style={{ fontSize:"7px", fontWeight:800, letterSpacing:"1px", color:"#000" }}>NF-e</div>
                <div style={{ fontSize:"5.5px", fontWeight:700, textTransform:"uppercase", color:"#000" }}>Nº</div>
                <div style={{ fontSize:"12px", fontWeight:900, color:"#000" }}>A EMITIR</div>
                <div style={{ fontSize:"6px", color:"#000" }}>Série {form.serie || "1"}</div>
                <div style={{ fontSize:"5.5px", color:"#000" }}>Emissão {dtHoje}</div>
              </div>
            </div>

            {/* ── HEADER: emitente | DANFE info | barcode+chave ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 170px 200px", border:bd }}>

              {/* emitente */}
              <div style={{ borderRight:bd, padding:"5px 6px" }}>
                <div style={{ fontSize:"12px", fontWeight:900, color:"#000", lineHeight:1.25, marginBottom:"3px" }}>
                  {emit?.nome ?? "—"}
                </div>
                {emit?.fantasia && emit.fantasia !== emit.nome &&
                  <div style={{ fontSize:"7px", color:"#555", marginBottom:"2px" }}>({emit.fantasia})</div>}
                <div style={{ fontSize:"7px", color:"#000", lineHeight:1.7 }}>
                  {endEmit}<br/>
                  {emit ? `${emit.municipio} – ${emit.uf}` : ""}
                  {emit?.cep ? <><br/>CEP: {emit.cep}{emit.tel ? ` – Tel.: ${emit.tel}` : ""}</> : null}
                </div>
              </div>

              {/* DANFE título */}
              <div style={{ borderRight:bd, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"space-around", padding:"5px 4px", textAlign:"center" }}>
                <div>
                  <div style={{ fontSize:"22px", fontWeight:900, letterSpacing:"4px", color:"#000" }}>DANFE</div>
                  <div style={{ fontSize:"5.5px", color:"#000", lineHeight:1.6, marginTop:"2px" }}>
                    DOCUMENTO AUXILIAR DA<br/>NOTA FISCAL ELETRÔNICA
                  </div>
                </div>
                <div style={{ fontSize:"7px", color:"#000", lineHeight:1.9 }}>
                  <strong>TIPO: {form.tipo === "saida" ? "1-SAÍDA" : "0-ENTRADA"}</strong><br/>
                  <strong>Nº: A EMITIR</strong><br/>
                  <strong>SÉRIE: {form.serie || "1"}</strong><br/>
                  FOLHA: 1/1
                </div>
              </div>

              {/* barcode decorativo + chave */}
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"4px 5px" }}>
                <div style={{ display:"flex", alignItems:"flex-end", height:"30px", overflow:"hidden" }}>
                  {barPattern.map((w, i) => (
                    <div key={i} style={{ width:`${w}px`, marginRight: i%9===8 ? "2px" : "0", height:`${14 + (i%5)*3}px`, background:"#000", flexShrink:0 }}/>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:"4.5px", fontWeight:700, textTransform:"uppercase", color:"#000", marginBottom:"1px" }}>Chave de Acesso</div>
                  <div style={{ fontSize:"6px", fontFamily:"'Courier New',monospace", color:"#000", letterSpacing:"0.3px", lineHeight:1.7, wordBreak:"break-all" }}>
                    0000 0000 0000 0000 0000 0000<br/>0000 0000 0000 0000 0000
                  </div>
                  <div style={{ fontSize:"4.5px", color:"#555", marginTop:"2px", lineHeight:1.5 }}>
                    Consulta de autenticidade no portal nacional da NF-e (www.nfe.fazenda.gov.br/portal) ou no site da Sefaz Autorizadora
                  </div>
                </div>
              </div>
            </div>

            {/* natureza op | protocolo */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 260px", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Natureza da Operação" value={form.natureza_op} style={{ border:"none", borderRight:bd }} />
              <F label="Protocolo de Autorização de Uso" value="A DEFINIR APÓS A AUTORIZAÇÃO PELA SEFAZ" style={{ border:"none" }} />
            </div>

            {/* IE emitente | IE subst | CNPJ */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 185px", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Inscrição Estadual" value={emit?.ie} style={{ border:"none", borderRight:bd }} />
              <F label="Insc. Estadual do Subst. Tributário" value="—" style={{ border:"none", borderRight:bd }} />
              <F label="CNPJ" value={emit?.cnpj} style={{ border:"none" }} />
            </div>

            {/* ── DESTINATÁRIO ── */}
            <Sec>Destinatário / Remetente</Sec>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 155px 90px", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Nome / Razão Social" value={cliente.nome} style={{ border:"none", borderRight:bd }} />
              <F label={cliente.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} value={docDest ?? "—"} style={{ border:"none", borderRight:bd }} />
              <F label="Data de Emissão" value={dtHoje} style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 130px 82px 80px", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Endereço" value={endDest || "—"} style={{ border:"none", borderRight:bd }} />
              <F label="Bairro / Distrito" value={cliente.bairro ?? "—"} style={{ border:"none", borderRight:bd }} />
              <F label="CEP" value={cliente.cep ?? "—"} style={{ border:"none", borderRight:bd }} />
              <F label="Data de Saída" value={form.dt_saida || "—"} style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 38px 130px 78px", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Município" value={cliente.cidade ?? "—"} style={{ border:"none", borderRight:bd }} />
              <F label="Fone / Fax" value={cliente.tel ?? "—"} style={{ border:"none", borderRight:bd }} />
              <F label="UF" value={cliente.uf ?? "—"} style={{ border:"none", borderRight:bd }} />
              <F label="Inscrição Estadual" value={cliente.ie ?? "—"} style={{ border:"none", borderRight:bd }} />
              <F label="Hora de Saída" value={form.hora_saida || "—"} style={{ border:"none" }} />
            </div>

            {/* ── CÁLCULO DO IMPOSTO ── */}
            <Sec>Cálculo do Imposto</Sec>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Base de Cálculo do ICMS" value={formatBRL(icmsBase)} style={{ border:"none", borderRight:bd }} />
              <F label="Valor do ICMS" value={formatBRL(totais.valorIcms)} style={{ border:"none", borderRight:bd }} />
              <F label="Base Cálculo ICMS ST" value="R$ 0,00" style={{ border:"none", borderRight:bd }} />
              <F label="Valor do ICMS ST" value="R$ 0,00" style={{ border:"none", borderRight:bd }} />
              <F label="Valor ICMS Desonerado" value="R$ 0,00" style={{ border:"none", borderRight:bd }} />
              <F label="Valor dos Produtos" value={formatBRL(totais.valorProdutos)} style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Valor do Frete" value={formatBRL(form.valor_frete)} style={{ border:"none", borderRight:bd }} />
              <F label="Valor do Seguro" value={formatBRL(form.valor_seguro)} style={{ border:"none", borderRight:bd }} />
              <F label="Desconto" value={formatBRL(form.valor_desconto)} style={{ border:"none", borderRight:bd }} />
              <F label="Outras Despesas" value={formatBRL(form.valor_outros)} style={{ border:"none", borderRight:bd }} />
              <F label="Valor do IPI" value={formatBRL(totais.valorIpi)} style={{ border:"none", borderRight:bd }} />
              <div style={{ padding:"1px 3px", background:"#fff" }}>
                <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", color:"#000", marginBottom:"1px" }}>Valor Total da Nota</div>
                <div style={{ fontSize:"10px", fontWeight:900, color:"#000" }}>{formatBRL(totais.valorNota)}</div>
              </div>
            </div>

            {/* ── TRANSPORTADOR ── */}
            <Sec>Transportador / Volumes Transportados</Sec>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 135px 82px 92px 38px", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Nome / Razão Social" value={form.transportadora || "—"} style={{ border:"none", borderRight:bd }} />
              <F label="Frete por Conta" value={MOD_FRETE[form.modalidade_frete] ?? "—"} style={{ border:"none", borderRight:bd }} />
              <F label="Código ANTT" value="—" style={{ border:"none", borderRight:bd }} />
              <F label="Placa do Veículo" value={form.placa_veiculo || "—"} style={{ border:"none", borderRight:bd }} />
              <F label="UF" value={form.uf_veiculo || "—"} style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="CNPJ / CPF" value="—" style={{ border:"none", borderRight:bd }} />
              <F label="Inscrição Estadual" value="—" style={{ border:"none" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 200px 40px", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <F label="Endereço" value="—" style={{ border:"none", borderRight:bd }} />
              <F label="Município" value="—" style={{ border:"none", borderRight:bd }} />
              <F label="UF" value="—" style={{ border:"none" }} />
            </div>

            {/* ── PRODUTOS ── */}
            <Sec>Dados dos Produtos / Serviços</Sec>
            <div style={{ border:bd, borderTop:"none" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"Arial, sans-serif" }}>
                <thead>
                  <tr style={{ background:"#f2f2f2" }}>
                    {([
                      ["Cód.Prod.","52px"],
                      ["Descrição do Produto / Serviço","auto"],
                      ["NCM/SH","54px"],
                      ["CST","30px"],
                      ["CFOP","32px"],
                      ["Unid.","28px"],
                      ["Quant.","54px"],
                      ["Valor Unit.","62px"],
                      ["Valor Total","62px"],
                      ["B.Cálc.ICMS","54px"],
                      ["Valor ICMS","50px"],
                      ["Alíq.ICMS","40px"],
                    ] as [string,string][]).map(([h,w]) => (
                      <th key={h} style={{ border:"0.5px solid #999", padding:"2px 2px", textAlign:"center", fontSize:"5.5px", fontWeight:800, whiteSpace:"nowrap", width:w, color:"#000" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.itens.map((item, i) => (
                    <tr key={i} style={{ background: i%2===0 ? "#fff" : "#f9f9f9" }}>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", fontSize:"6.5px", color:"#000" }}>ITEM-{String(i+1).padStart(3,"0")}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", fontSize:"7px", color:"#000", fontWeight:700 }}>{item.produto_nome}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", fontSize:"6.5px", color:"#000", fontFamily:"monospace" }}>{item.ncm}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", fontSize:"6.5px", color:"#000" }}>000</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", fontSize:"6.5px", color:"#000" }}>{item.cfop}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", fontSize:"6.5px", color:"#000" }}>{item.unidade}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", fontSize:"6.5px", color:"#000", fontFamily:"monospace" }}>{item.quantidade.toFixed(4)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", fontSize:"6.5px", color:"#000", fontFamily:"monospace" }}>{formatBRL(item.valor_unitario)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", fontSize:"6.5px", color:"#000", fontFamily:"monospace", fontWeight:700 }}>{formatBRL(item.valor_bruto)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", fontSize:"6.5px", color:"#000", fontFamily:"monospace" }}>{formatBRL(item.icms_pct>0 ? item.valor_bruto : 0)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"right", fontSize:"6.5px", color:"#000", fontFamily:"monospace" }}>{formatBRL(item.valor_icms)}</td>
                      <td style={{ border:"0.5px solid #ccc", padding:"2px", textAlign:"center", fontSize:"6.5px", color:"#000" }}>{item.icms_pct>0 ? `${item.icms_pct},00` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── DADOS ADICIONAIS ── */}
            <Sec>Dados Adicionais</Sec>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 180px", borderLeft:bd, borderRight:bd, borderBottom:bd }}>
              <div style={{ borderRight:bd, padding:"3px 4px", minHeight:"52px" }}>
                <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", color:"#000", marginBottom:"2px" }}>Informações Complementares de Interesse do Contribuinte</div>
                <div style={{ fontSize:"7px", color:"#000", lineHeight:1.5, whiteSpace:"pre-wrap" }}>{form.obs_contribuinte || " "}</div>
              </div>
              <div style={{ padding:"3px 4px", minHeight:"52px" }}>
                <div style={{ fontSize:"5px", fontWeight:700, textTransform:"uppercase", color:"#000", marginBottom:"2px" }}>Reservado ao Fisco</div>
              </div>
            </div>

            {/* rodapé */}
            <div style={{ marginTop:"4px", display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:"5px", color:"#999" }}>Prévia gerada pelo sistema — Sem valor fiscal</span>
              <span style={{ fontSize:"5px", color:"#999" }}>Numeração, chave e protocolo definidos pela SEFAZ após autorização</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
