"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { getPedidos } from "@/services/pedidos.service";
import { salvarNotaCompleta, emitirNFeCompleta } from "@/services/notas.service";
import EspelhoModal from "@/components/notas/EspelhoModal";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { Campo } from "@/components/ui/Campo";
import { formatBRL } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import type { Pedido, Cliente } from "@/types";

const FORMAS_PGTO = [
  { cod:"01", label:"Dinheiro" }, { cod:"02", label:"Cheque" },
  { cod:"03", label:"Cartão de Crédito" }, { cod:"04", label:"Cartão de Débito" },
  { cod:"15", label:"Boleto Bancário" }, { cod:"17", label:"PIX" },
  { cod:"90", label:"Sem Pagamento" }, { cod:"99", label:"Outros" },
];

function pgtoFromStr(s: string): string {
  const m: Record<string,string> = {
    "Dinheiro":"01","Cheque":"02","Cartão":"03","Cartão de Crédito":"03",
    "Cartão de Débito":"04","Boleto":"15","PIX":"17","A Prazo":"99",
  };
  return m[s] ?? "99";
}

interface ItemNota {
  produto_nome:string; ncm:string; cfop:string; unidade:string;
  quantidade:number; valor_unitario:number; valor_bruto:number;
  ipi_pct:number; icms_pct:number; valor_ipi:number;
  valor_icms:number; valor_pis:number; valor_cofins:number; lapidacao:number;
}

interface FormNota {
  pedido_id:string; cliente_id:number|null;
  natureza_op:string; finalidade:string; tipo:string; serie:string; cfop_padrao:string;
  itens:ItemNota[];
  valor_desconto:number; valor_frete:number; valor_seguro:number; valor_outros:number;
  forma_pgto:string; parcelas:number; modalidade_frete:number;
  transportadora:string; placa_veiculo:string; uf_veiculo:string; rntc:string;
  peso_bruto:string; peso_liquido:string; volumes:string; especie_volume:string;
  dt_saida:string; hora_saida:string; obs_contribuinte:string; obs_internas:string;
}

const FORM_VAZIO: FormNota = {
  pedido_id:"", cliente_id:null,
  natureza_op:"Venda de mercadoria", finalidade:"1", tipo:"saida", serie:"1", cfop_padrao:"5.101",
  itens:[], valor_desconto:0, valor_frete:0, valor_seguro:0, valor_outros:0,
  forma_pgto:"01", parcelas:1, modalidade_frete:9,
  transportadora:"", placa_veiculo:"", uf_veiculo:"", rntc:"",
  peso_bruto:"", peso_liquido:"", volumes:"", especie_volume:"",
  dt_saida: "",
  hora_saida: "",
  obs_contribuinte:"", obs_internas:"",
};

function calcItem(item: ItemNota, cfop: string): ItemNota {
  const aliqIcms = cfop.startsWith("5") ? 18 : 12;
  const vIpi    = item.valor_bruto * (item.ipi_pct / 100);
  const vIcms   = item.valor_bruto * (aliqIcms / 100);
  const vPis    = item.valor_bruto * 0.0165;
  const vCofins = item.valor_bruto * 0.076;
  return { ...item, icms_pct:aliqIcms, valor_ipi:vIpi, valor_icms:vIcms, valor_pis:vPis, valor_cofins:vCofins };
}

// ── Componente interno que usa useSearchParams ──
function NovaNFeInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { toast }    = useToast();
  const confirm      = useConfirm();

  const [form, setForm]         = useState<FormNota>({ ...FORM_VAZIO });
  const [aba, setAba]           = useState<"cabecalho"|"itens"|"totais"|"pgto"|"transporte"|"detalhes">("cabecalho");
  const [pedidos, setPedidos]   = useState<Pedido[]>([]);
  const [cliente, setCliente]   = useState<Cliente|null>(null);
  const [salvando, setSalvando]     = useState(false);
  const [emitindo, setEmitindo]     = useState(false);
  const [loading, setLoading]       = useState(true);
  const [espelho, setEspelho]       = useState(false);

  useEffect(() => {
    async function init() {
      const peds = await getPedidos();
      setPedidos(peds);
      const pp = searchParams.get("pedido");
      if (pp) { const p = peds.find(x => x.id === pp); if (p) await preencherDoPedido(p); }
      setLoading(false);
    }
    init();
  }, []);

 async function preencherDoPedido(p: Pedido) {
    const [{ data: cliData }, { data: pedData }] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", p.cliente_id).single(),
      supabase.from("pedidos").select("*, itens_pedido(*)").eq("id", p.id).single(),
    ]);
    const cli = cliData as Cliente|null;
    const pedCompleto = (pedData as Pedido|null) ?? p;
    setCliente(cli);
    const cfop = cli?.uf && cli.uf.toUpperCase() !== "MG" ? "6.101" : "5.101";
    const itens: ItemNota[] = (pedCompleto.itens_pedido ?? []).map(item => {
      const qtd    = Number(item.m2) * item.quantidade;
      const vBruto = Number(item.subtotal);
      return calcItem({
        produto_nome:item.produto_nome, ncm:"70031200", cfop:cfop.replace(".",""),
        unidade:"M2", quantidade:Number(qtd.toFixed(4)),
        valor_unitario: qtd > 0 ? vBruto / qtd : Number(item.valor_m2),
        valor_bruto:vBruto, ipi_pct:0, icms_pct:0,
        valor_ipi:0, valor_icms:0, valor_pis:0, valor_cofins:0, lapidacao:Number(item.lapidacao),
      }, cfop);
    });
    setForm(f => ({
      ...f, pedido_id:p.id, cliente_id:p.cliente_id, cfop_padrao:cfop,
      forma_pgto:pgtoFromStr(p.forma_pgto ?? ""), parcelas:p.parcelas ?? 1,
      obs_contribuinte:cli?.obs_nfe ?? "", itens,
    }));
  }

  async function handlePedidoChange(pedidoId: string) {
    const p = pedidos.find(x => x.id === pedidoId);
    if (p) await preencherDoPedido(p);
    else { setForm(f => ({ ...f, pedido_id:pedidoId, cliente_id:null, itens:[] })); setCliente(null); }
  }

  function setF<K extends keyof FormNota>(k: K, v: FormNota[K]) { setForm(f => ({ ...f, [k]:v })); }

  function atualizarItem(idx: number, campo: keyof ItemNota, valor: number|string) {
    setForm(f => {
      const itens = [...f.itens];
      const item  = { ...itens[idx], [campo]:valor };
      itens[idx]  = (campo === "valor_bruto" || campo === "ipi_pct") ? calcItem(item, f.cfop_padrao) : item;
      return { ...f, itens };
    });
  }

  const valorProdutos = form.itens.reduce((a,i) => a + i.valor_bruto, 0);
  const valorIcms     = form.itens.reduce((a,i) => a + i.valor_icms, 0);
  const valorPis      = form.itens.reduce((a,i) => a + i.valor_pis, 0);
  const valorCofins   = form.itens.reduce((a,i) => a + i.valor_cofins, 0);
  const valorIpi      = form.itens.reduce((a,i) => a + i.valor_ipi, 0);
  const valorNota     = valorProdutos + valorIpi + form.valor_frete + form.valor_seguro + form.valor_outros - form.valor_desconto;

  async function handleSalvar() {
    if (!form.pedido_id || !form.cliente_id) { toast("Selecione um pedido","warn"); return; }
    setSalvando(true);
    const ok = await salvarNotaCompleta({ form, valorProdutos, valorIcms, valorPis, valorCofins, valorIpi, valorNota });
    setSalvando(false);
    if (!ok) { toast("Erro ao salvar rascunho","err"); return; }
    toast("Rascunho salvo"); router.push("/notas");
  }

  async function handleSalvarEmitir() {
    if (!form.pedido_id || !form.cliente_id) { toast("Selecione um pedido","warn"); return; }
    if (!(await confirm("Salvar e enviar NF-e para a SEFAZ?\nAmbiente: HOMOLOGAÇÃO"))) return;
    setEmitindo(true);
    const result = await emitirNFeCompleta({ form, valorProdutos, valorIcms, valorPis, valorCofins, valorIpi, valorNota });
    setEmitindo(false);
    toast(result.mensagem, result.ok ? "ok" : "err");
    if (result.ok) router.push("/notas");
  }

  const ABAS = [
    { id:"cabecalho",  label:"Cabeçalho" },
    { id:"itens",      label:`Produtos (${form.itens.length})` },
    { id:"totais",     label:"Totais" },
    { id:"pgto",       label:"Pagamento" },
    { id:"transporte", label:"Transporte" },
    { id:"detalhes",   label:"Detalhes" },
  ] as const;

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <>
      <div className="tb">
        <button className="btn bg sm" onClick={() => router.push("/notas")}>← Voltar</button>
        <div className="tb-title" style={{ flex:1 }}>Nova NF-e</div>
        <div style={{ fontSize:"11px", color:"var(--warn)", fontFamily:"'DM Mono', monospace",
          background:"rgba(245,158,11,.1)", border:"1px solid rgba(245,158,11,.3)",
          borderRadius:"6px", padding:"4px 10px" }}>⚠ HOMOLOGAÇÃO</div>
        <button className="btn bg sm" onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar Rascunho"}</button>
        <button className="btn bg sm" onClick={() => setEspelho(true)} disabled={!form.pedido_id || !form.itens.length}>Ver Espelho</button>
        <button className="btn bp sm" onClick={handleSalvarEmitir} disabled={emitindo||salvando}>{emitindo ? "Enviando..." : "Salvar e Emitir →"}</button>
      </div>

      {espelho && cliente && (
        <EspelhoModal
          form={form}
          cliente={cliente}
          totais={{ valorProdutos, valorIcms, valorPis, valorCofins, valorIpi, valorNota }}
          onClose={() => setEspelho(false)}
          onEmitir={() => { setEspelho(false); handleSalvarEmitir(); }}
          emitindo={emitindo}
        />
      )}

      <div className="con">
        <div style={{ display:"flex", gap:"2px", borderBottom:"1px solid var(--b1)", marginBottom:"20px" }}>
          {ABAS.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              padding:"10px 18px", fontSize:"12px", fontWeight:600, cursor:"pointer",
              background:"transparent", border:"none",
              borderBottom:`2px solid ${aba === a.id ? "var(--acc)" : "transparent"}`,
              color: aba === a.id ? "var(--acc)" : "var(--t3)", transition:"all .15s",
            }}>{a.label}</button>
          ))}
        </div>

        {aba === "cabecalho" && (
          <div className="card" style={{ padding:"24px", display:"flex", flexDirection:"column", gap:"18px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em" }}>IDENTIFICAÇÃO</div>
            <div className="fr">
              <Campo style={{ flex:2 }} label="Pedido *">
                <select className="fc" value={form.pedido_id} onChange={e => handlePedidoChange(e.target.value)}>
                  <option value="">Selecione um pedido...</option>
                  {pedidos.map(p => <option key={p.id} value={p.id}>{p.id} — {p.clientes?.nome ?? "?"} — {formatBRL(p.valor_total)}</option>)}
                </select>
              </Campo>
              <Campo label="Série"><input className="fc" value={form.serie} onChange={e => setF("serie", e.target.value)} maxLength={3} /></Campo>
            </div>
            {cliente && (
              <div style={{ background:"var(--surf2)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"14px 16px", display:"flex", gap:"24px", flexWrap:"wrap" }}>
                <div><div style={{ fontSize:"10px", color:"var(--t3)", marginBottom:"2px" }}>CLIENTE</div><div style={{ fontWeight:700, color:"var(--t1)" }}>{cliente.nome}</div></div>
                <div><div style={{ fontSize:"10px", color:"var(--t3)", marginBottom:"2px" }}>{cliente.tipo_pessoa === "PF" ? "CPF" : "CNPJ"}</div><div style={{ fontFamily:"'DM Mono', monospace", color:"var(--t2)" }}>{cliente.tipo_pessoa === "PF" ? cliente.cpf : cliente.cnpj}</div></div>
                <div><div style={{ fontSize:"10px", color:"var(--t3)", marginBottom:"2px" }}>CIDADE / UF</div><div style={{ color:"var(--t2)" }}>{[cliente.cidade, cliente.uf].filter(Boolean).join(" / ")}</div></div>
                <div><div style={{ fontSize:"10px", color:"var(--t3)", marginBottom:"2px" }}>INDICADOR IE</div><div style={{ color:"var(--t2)" }}>{{ "1":"Contribuinte","2":"Isento","9":"Não Contrib." }[cliente.ind_ie ?? "9"]}</div></div>
              </div>
            )}
            <div className="fr">
              <Campo style={{ flex:2 }} label="Natureza da Operação *"><input className="fc" value={form.natureza_op} onChange={e => setF("natureza_op", e.target.value)} /></Campo>
              <Campo label="Finalidade">
                <select className="fc" value={form.finalidade} onChange={e => setF("finalidade", e.target.value)}>
                  <option value="1">1 — NF-e Normal</option>
                  <option value="2">2 — Complementar</option>
                  <option value="3">3 — Ajuste</option>
                  <option value="4">4 — Devolução</option>
                </select>
              </Campo>
              <Campo label="Tipo">
                <select className="fc" value={form.tipo} onChange={e => setF("tipo", e.target.value)}>
                  <option value="saida">Saída</option>
                  <option value="entrada">Entrada</option>
                </select>
              </Campo>
            </div>
            <Campo label="CFOP Padrão">
              <select className="fc" value={form.cfop_padrao} onChange={e => setF("cfop_padrao", e.target.value)}>
                <option value="5.101">5.101 — Venda dentro de MG (ICMS 18%)</option>
                <option value="6.101">6.101 — Venda fora de MG (ICMS 12%)</option>
                <option value="5.102">5.102 — Prod. própria MG</option>
                <option value="6.102">6.102 — Prod. própria fora MG</option>
              </select>
            </Campo>
          </div>
        )}

        {aba === "itens" && (
          <div className="card" style={{ padding:"24px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em", marginBottom:"16px" }}>PRODUTOS / ITENS DA NOTA</div>
            {form.itens.length === 0 ? (
              <div style={{ color:"var(--t3)", padding:"32px 0", textAlign:"center" }}>Selecione um pedido na aba Cabeçalho para carregar os itens automaticamente.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                {form.itens.map((item, i) => (
                  <div key={i} style={{ background:"var(--surf2)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                      <div style={{ width:"24px", height:"24px", borderRadius:"6px", background:"var(--surf3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", fontWeight:700, color:"var(--t3)", flexShrink:0 }}>{i+1}</div>
                      <input className="fc" value={item.produto_nome} onChange={e => atualizarItem(i,"produto_nome",e.target.value)} style={{ flex:1, fontSize:"14px", fontWeight:600 }} />
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:"8px" }}>
                      <Campo label="NCM"><input className="fc" value={item.ncm} onChange={e => atualizarItem(i,"ncm",e.target.value)} maxLength={8} /></Campo>
                      <Campo label="CFOP"><input className="fc" value={item.cfop} onChange={e => atualizarItem(i,"cfop",e.target.value)} maxLength={5} /></Campo>
                      <Campo label="Unidade"><input className="fc" value={item.unidade} onChange={e => atualizarItem(i,"unidade",e.target.value)} maxLength={6} /></Campo>
                      <Campo label="Quantidade (m²)"><input className="fc" type="number" value={item.quantidade} onChange={e => atualizarItem(i,"quantidade",Number(e.target.value))} /></Campo>
                      <Campo label="Valor Unitário"><CurrencyInput value={item.valor_unitario} onChange={v => atualizarItem(i,"valor_unitario",v)} /></Campo>
                      <Campo label="Valor Bruto"><CurrencyInput value={item.valor_bruto} onChange={v => atualizarItem(i,"valor_bruto",v)} /></Campo>
                      <Campo label="IPI %"><input className="fc" type="number" min="0" max="100" step="0.5" value={item.ipi_pct} onChange={e => atualizarItem(i,"ipi_pct",Number(e.target.value))} /></Campo>
                      <Campo label="ICMS %"><input className="fc" value={item.icms_pct} readOnly style={{ opacity:0.6 }} /></Campo>
                      <Campo label="Valor ICMS"><input className="fc" value={formatBRL(item.valor_icms)} readOnly style={{ opacity:0.6 }} /></Campo>
                      <Campo label="Valor PIS"><input className="fc" value={formatBRL(item.valor_pis)} readOnly style={{ opacity:0.6 }} /></Campo>
                      <Campo label="Valor COFINS"><input className="fc" value={formatBRL(item.valor_cofins)} readOnly style={{ opacity:0.6 }} /></Campo>
                      <Campo label="Valor Total"><input className="fc" value={formatBRL(item.valor_bruto + item.valor_ipi)} readOnly style={{ color:"var(--acc)", fontWeight:700 }} /></Campo>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === "totais" && (
          <div className="card" style={{ padding:"24px", display:"flex", flexDirection:"column", gap:"18px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em" }}>TOTAIS DA NOTA FISCAL</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px" }}>
              {[
                { label:"BC ICMS",        value:formatBRL(valorProdutos), color:"var(--t2)" },
                { label:"Valor ICMS",     value:formatBRL(valorIcms),     color:"var(--warn)" },
                { label:"Valor IPI",      value:formatBRL(valorIpi),      color:"var(--t2)" },
                { label:"Valor PIS",      value:formatBRL(valorPis),      color:"var(--t2)" },
                { label:"Valor COFINS",   value:formatBRL(valorCofins),   color:"var(--t2)" },
                { label:"Valor Produtos", value:formatBRL(valorProdutos), color:"var(--acc)" },
              ].map(c => (
                <div key={c.label} style={{ background:"var(--surf2)", borderRadius:"8px", padding:"12px 14px" }}>
                  <div style={{ fontSize:"10px", color:"var(--t3)", marginBottom:"4px" }}>{c.label}</div>
                  <div style={{ fontSize:"16px", fontWeight:700, color:c.color, fontFamily:"'DM Mono', monospace" }}>{c.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px" }}>
              {([["valor_desconto","Desconto (R$)"],["valor_frete","Valor Frete"],["valor_seguro","Valor Seguro"],["valor_outros","Outras Despesas"]] as const).map(([k,l]) => (
                <Campo key={k} label={l}>
                  <CurrencyInput value={form[k]} onChange={v => setF(k, v)} />
                </Campo>
              ))}
            </div>
            <div style={{ background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.3)", borderRadius:"10px", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:"14px", fontWeight:700, color:"var(--t2)" }}>VALOR TOTAL DA NOTA</span>
              <span style={{ fontSize:"24px", fontWeight:800, color:"var(--ok)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(valorNota)}</span>
            </div>
          </div>
        )}

        {aba === "pgto" && (
          <div className="card" style={{ padding:"24px", display:"flex", flexDirection:"column", gap:"18px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em" }}>CONDIÇÕES DE PAGAMENTO</div>
            <div className="fr">
              <Campo style={{ flex:2 }} label="Forma de Pagamento *">
                <select className="fc" value={form.forma_pgto} onChange={e => setF("forma_pgto", e.target.value)}>
                  {FORMAS_PGTO.map(f => <option key={f.cod} value={f.cod}>{f.cod} — {f.label}</option>)}
                </select>
              </Campo>
              <Campo label="Parcelas"><input className="fc" type="number" min="1" max="99" value={form.parcelas} onChange={e => setF("parcelas", Number(e.target.value))} /></Campo>
            </div>
            <div style={{ fontSize:"12px", color:"var(--t3)", background:"var(--surf2)", borderRadius:"8px", padding:"10px 14px" }}>
              💡 Para pagamentos parcelados, o contador pode ajustar datas de vencimento na Nuvem Fiscal após a emissão.
            </div>
          </div>
        )}

        {aba === "transporte" && (
          <div className="card" style={{ padding:"24px", display:"flex", flexDirection:"column", gap:"18px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em" }}>TRANSPORTE</div>
            <Campo label="Modalidade de Frete">
              <select className="fc" value={form.modalidade_frete} onChange={e => setF("modalidade_frete", Number(e.target.value))}>
                <option value={9}>9 — Sem Frete</option>
                <option value={0}>0 — Por conta do Emitente (CIF)</option>
                <option value={1}>1 — Por conta do Destinatário (FOB)</option>
                <option value={2}>2 — Por conta de Terceiros</option>
                <option value={3}>3 — Próprio por conta do Remetente</option>
                <option value={4}>4 — Próprio por conta do Destinatário</option>
              </select>
            </Campo>
            {form.modalidade_frete !== 9 && (<>
              <div className="fr">
                <Campo style={{ flex:2 }} label="Transportadora"><input className="fc" value={form.transportadora} onChange={e => setF("transportadora", e.target.value)} /></Campo>
                <Campo label="Placa"><input className="fc" value={form.placa_veiculo} onChange={e => setF("placa_veiculo", e.target.value.toUpperCase())} maxLength={8} /></Campo>
                <Campo style={{ maxWidth:"80px" }} label="UF"><input className="fc" value={form.uf_veiculo} onChange={e => setF("uf_veiculo", e.target.value.toUpperCase().slice(0,2))} maxLength={2} /></Campo>
                <Campo label="RNTC"><input className="fc" value={form.rntc} onChange={e => setF("rntc", e.target.value)} /></Campo>
              </div>
              <div className="fr">
                <Campo label="Peso Bruto (kg)"><input className="fc" type="number" value={form.peso_bruto} onChange={e => setF("peso_bruto", e.target.value)} /></Campo>
                <Campo label="Peso Líquido (kg)"><input className="fc" type="number" value={form.peso_liquido} onChange={e => setF("peso_liquido", e.target.value)} /></Campo>
                <Campo label="Volumes"><input className="fc" type="number" value={form.volumes} onChange={e => setF("volumes", e.target.value)} /></Campo>
                <Campo label="Espécie"><input className="fc" value={form.especie_volume} onChange={e => setF("especie_volume", e.target.value)} placeholder="Caixa, Fardo..." /></Campo>
              </div>
            </>)}
          </div>
        )}

        {aba === "detalhes" && (
          <div className="card" style={{ padding:"24px", display:"flex", flexDirection:"column", gap:"18px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em" }}>DETALHES DA NOTA FISCAL</div>
            <div className="fr">
              <Campo label="Data de Saída"><DateInput value={form.dt_saida} onChange={v => setF("dt_saida", v)} /></Campo>
              <Campo label="Hora de Saída"><input className="fc" type="time" value={form.hora_saida} onChange={e => setF("hora_saida", e.target.value)} /></Campo>
            </div>
            <Campo label="Observações (impressas na nota)">
              <textarea className="fc" value={form.obs_contribuinte} onChange={e => setF("obs_contribuinte", e.target.value)} placeholder="Esta informação será impressa nas observações da nota." rows={4} style={{ resize:"vertical" }} />
            </Campo>
            <Campo label="Observações Internas (não impressas)">
              <textarea className="fc" value={form.obs_internas} onChange={e => setF("obs_internas", e.target.value)} placeholder="Esta informação é de uso interno e não será impressa na nota." rows={3} style={{ resize:"vertical" }} />
            </Campo>
          </div>
        )}

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"20px", padding:"16px 20px", background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px" }}>
          <div style={{ fontFamily:"'DM Mono', monospace", fontSize:"13px", color:"var(--t3)" }}>
            {form.itens.length} item(ns) · Total:{" "}
            <strong style={{ color:"var(--acc)", fontSize:"16px" }}>{formatBRL(valorNota)}</strong>
          </div>
          <div style={{ display:"flex", gap:"10px" }}>
            <button className="btn bg sm" onClick={() => router.push("/notas")}>Cancelar</button>
            <button className="btn bg sm" onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar Rascunho"}</button>
            <button className="btn bg sm" onClick={() => setEspelho(true)} disabled={!form.pedido_id || !form.itens.length}>Ver Espelho</button>
            <button className="btn bp sm" onClick={handleSalvarEmitir} disabled={emitindo||salvando}>{emitindo ? "Enviando..." : "Salvar e Emitir →"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Exportação com Suspense obrigatório para useSearchParams ──
export default function NovaNFePage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="con"><div className="loading">Carregando...</div></div>}>
        <NovaNFeInner />
      </Suspense>
    </AppLayout>
  );
}