"use client";

import { Fragment, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import { Campo } from "@/components/ui/Campo";
import {
  getCompras, createCompra, confirmarRecebimento, deletarCompra, anexarXmlNaCompra,
} from "@/services/compras.service";
import ImportarXmlCompraModal, { type DadosImportadosXml } from "@/components/ui/ImportarXmlCompraModal";
import BuscarNotasRecebidasModal from "@/components/ui/BuscarNotasRecebidasModal";
import { calcularCustoImportacao, type DadosImportacao } from "@/lib/custoImportacao";
import { HistoricoPrecoProduto } from "@/components/ui/HistoricoPrecoProduto";
import type { XmlCompraParseado } from "@/lib/importXmlCompra";
import type { Compra, Produto, StatusCompra } from "@/types";

const CHIP: Record<StatusCompra, string> = {
  rascunho: "chip cy",
  recebido: "chip cg",
};

function hoje() {
  return new Date().toISOString().split("T")[0];
}

interface ItemForm {
  produto_id: string;
  colares: string;
  chapas: string;
  m2_por_chapa: string;
  custo_unitario_m2: number;
}

const ITEM_VAZIO: ItemForm = { produto_id: "", colares: "", chapas: "", m2_por_chapa: "", custo_unitario_m2: 0 };

const FORM_VAZIO = {
  fornecedor_id: "",
  nf: "",
  dt_compra: hoje(),
  condicao_pgto: "",
  obs: "",
};

// Defaults de creditabilidade pro Lucro Real: PIS/COFINS e ICMS
// creditáveis; IPI não, até o contador confirmar o enquadramento.
const IMP_VAZIO: DadosImportacao & { numero_di: string } = {
  numero_di: "",
  valor_fob_usd: 0,
  frete_internacional_usd: 0,
  seguro_internacional_usd: 0,
  cambio_usd: 0,
  ii: 0,
  ipi_importacao: 0,
  pis_cofins_importacao: 0,
  icms_importacao: 0,
  despesas_aduaneiras: 0,
  ipi_creditavel: false,
  pis_cofins_creditavel: true,
  icms_creditavel: true,
};

export default function ComprasPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [compras, setCompras]       = useState<Compra[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: number; nome: string; cnpj: string }[]>([]);
  const [produtos, setProdutos]     = useState<Produto[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filtro, setFiltro]         = useState<StatusCompra | "">("");
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(FORM_VAZIO);
  const [itens, setItens]           = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);
  const [salvando, setSalvando]     = useState(false);
  const [expandido, setExpandido]   = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);
  const [modalXmlAberto, setModalXmlAberto] = useState(false);
  const [modalSiegAberto, setModalSiegAberto] = useState(false);
  const [arquivoSiegRevisao, setArquivoSiegRevisao] = useState<File | null>(null);
  const [ehImportacao, setEhImportacao] = useState(false);
  const [imp, setImp] = useState({ ...IMP_VAZIO });
  const [xmlPendente, setXmlPendente] = useState<{ dados: XmlCompraParseado; xmlFile: File } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [comprasData, { data: forn }, { data: prod }] = await Promise.all([
      getCompras(),
      supabase.from("fornecedores").select("id, nome, cnpj").eq("ativo", true).order("nome"),
      supabase.from("produtos").select("*").eq("ativo", true).order("nome"),
    ]);
    setCompras(comprasData);
    setFornecedores(forn ?? []);
    setProdutos((prod as Produto[]) ?? []);
    setLoading(false);
  }

  function addItem() { setItens(prev => [...prev, { ...ITEM_VAZIO }]); }
  function remItem(i: number) { setItens(prev => prev.filter((_, idx) => idx !== i)); }

  function updItem(i: number, field: keyof ItemForm, value: string | number) {
    setItens(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const novo = { ...it, [field]: value };
      const p = produtos.find(p => String(p.id) === novo.produto_id);
      if (field === "produto_id") {
        if (p?.chapa_largura_mm && p?.chapa_altura_mm) {
          novo.m2_por_chapa = (((Number(p.chapa_largura_mm) / 1000) * (Number(p.chapa_altura_mm) / 1000)).toFixed(4));
        }
        if (p?.chapas_por_colar && novo.colares !== "") {
          novo.chapas = String(Number(novo.colares) * p.chapas_por_colar);
        }
      }
      if (field === "colares" && p?.chapas_por_colar && value !== "") {
        novo.chapas = String(Number(value) * p.chapas_por_colar);
      }
      return novo;
    }));
  }

  function subtotalItem(it: ItemForm): number {
    const chapas = Number(it.chapas) || 0;
    const m2PorChapa = Number(it.m2_por_chapa) || 0;
    return chapas * m2PorChapa * Number(it.custo_unitario_m2 || 0);
  }

  const valorTotalForm = itens.reduce((a, it) => a + subtotalItem(it), 0);
  // Mesmo filtro de validade do handleSalvar — linha meio-preenchida (sem
  // produto) não pode entrar no divisor do custo/m², senão dilui o rateio.
  const m2TotalForm = itens
    .filter(it => it.produto_id && Number(it.chapas) > 0 && Number(it.m2_por_chapa) > 0)
    .reduce((a, it) => a + Number(it.chapas) * Number(it.m2_por_chapa), 0);
  const resumoImp = calcularCustoImportacao(imp, m2TotalForm);

  function aplicarCustoImportacaoAosItens() {
    setItens(prev => prev.map(it => ({ ...it, custo_unitario_m2: resumoImp.custoM2 })));
    toast(`Custo de ${formatBRL(resumoImp.custoM2)}/m² aplicado a todos os itens`);
  }

  function resetForm() {
    setForm(FORM_VAZIO);
    setItens([{ ...ITEM_VAZIO }]);
    setXmlPendente(null);
    setEhImportacao(false);
    setImp({ ...IMP_VAZIO });
    setShowForm(false);
  }

  function handleImportarXml(dados: DadosImportadosXml) {
    setModalXmlAberto(false);
    setArquivoSiegRevisao(null);
    // Importar XML substitui o form inteiro — a seção Importação também
    // volta ao zero, senão valores de DI digitados antes ficariam órfãos
    // colados numa NF-e que não tem nada a ver com eles.
    setEhImportacao(false);
    setImp({ ...IMP_VAZIO });
    setForm({
      fornecedor_id: dados.fornecedorId ? String(dados.fornecedorId) : "",
      nf: dados.xmlDados.numeroNF ?? "",
      dt_compra: dados.xmlDados.dataEmissao ?? hoje(),
      condicao_pgto: "",
      obs: "",
    });
    setItens(dados.xmlDados.itens.map((item, i) => {
      const produtoId = dados.produtoIdsPorItem[i];
      const produto = produtoId ? produtos.find(p => p.id === produtoId) : undefined;
      const m2PorChapa = produto?.chapa_largura_mm && produto?.chapa_altura_mm
        ? ((Number(produto.chapa_largura_mm) / 1000) * (Number(produto.chapa_altura_mm) / 1000)).toFixed(4)
        : "";
      return {
        produto_id: produtoId ? String(produtoId) : "",
        colares: "",
        chapas: "",
        m2_por_chapa: m2PorChapa,
        custo_unitario_m2: item.unidade.toUpperCase() === "M2" ? item.valorUnitario : 0,
      };
    }));
    setXmlPendente({ dados: dados.xmlDados, xmlFile: dados.xmlFile });
    setShowForm(true);
  }

  function handleFornecedorCriado(f: { id: number; nome: string; cnpj: string }) {
    setFornecedores(prev => [...prev, f].sort((a, b) => a.nome.localeCompare(b.nome)));
  }

  async function handleSalvar() {
    if (!form.fornecedor_id) { toast("Selecione o fornecedor.", "warn"); return; }
    const itensValidos = itens.filter(it => it.produto_id && Number(it.chapas) > 0 && Number(it.m2_por_chapa) > 0);
    if (itensValidos.length === 0) { toast("Adicione ao menos um item com produto, chapas e m²/chapa.", "warn"); return; }

    setSalvando(true);

    const itensPayload = itensValidos.map(it => {
      const chapas = Number(it.chapas);
      const m2PorChapa = Number(it.m2_por_chapa);
      const m2 = parseFloat((chapas * m2PorChapa).toFixed(4));
      return {
        produto_id: Number(it.produto_id),
        colares: it.colares ? Number(it.colares) : null,
        chapas, m2_por_chapa: m2PorChapa, m2,
        custo_unitario_m2: Number(it.custo_unitario_m2) || 0,
        subtotal: parseFloat((m2 * Number(it.custo_unitario_m2 || 0)).toFixed(2)),
      };
    });

    const valorTotal = itensPayload.reduce((a, it) => a + it.subtotal, 0);

    // Campos de importação só entram no payload com o checkbox marcado —
    // compra nacional salva exatamente como antes, mesmo se a migração
    // sql/importacao-compras.sql ainda não tiver rodado no Supabase.
    const camposImportacao = ehImportacao ? {
      eh_importacao: true,
      numero_di: imp.numero_di.trim() || null,
      valor_fob_usd: imp.valor_fob_usd,
      frete_internacional_usd: imp.frete_internacional_usd,
      seguro_internacional_usd: imp.seguro_internacional_usd,
      cambio_usd: imp.cambio_usd,
      ii: imp.ii,
      ipi_importacao: imp.ipi_importacao,
      pis_cofins_importacao: imp.pis_cofins_importacao,
      icms_importacao: imp.icms_importacao,
      despesas_aduaneiras: imp.despesas_aduaneiras,
      ipi_creditavel: imp.ipi_creditavel,
      pis_cofins_creditavel: imp.pis_cofins_creditavel,
      icms_creditavel: imp.icms_creditavel,
    } : {};

    const res = await createCompra({
      fornecedor_id: Number(form.fornecedor_id),
      nf: form.nf.trim() || null,
      dt_compra: form.dt_compra || hoje(),
      condicao_pgto: form.condicao_pgto.trim() || null,
      valor_total: parseFloat(valorTotal.toFixed(2)),
      obs: form.obs.trim() || null,
      ...camposImportacao,
    }, itensPayload);

    if (!res) { setSalvando(false); toast("Erro ao salvar compra.", "err"); return; }

    if (xmlPendente) {
      const dt = form.dt_compra || hoje();
      const primeiroItem = xmlPendente.dados.itens[0];
      const anexo = await anexarXmlNaCompra(res.id, {
        chaveAcesso: xmlPendente.dados.chaveAcesso,
        numeroNF: xmlPendente.dados.numeroNF,
        serie: xmlPendente.dados.serie,
        // NCM/CFOP/CST só do primeiro item — mesma limitação de antes,
        // documentos_fiscais tem um campo só, não por item. Nota com NCM
        // diferente por item perde essa granularidade aqui (ver
        // compras_itens pra ver os NCMs/CFOPs individuais salvos por item).
        ncm: primeiroItem?.ncm ?? null,
        cfop: primeiroItem?.cfop ?? null,
        cst: primeiroItem?.cst ?? null,
        valorTotal: xmlPendente.dados.valorTotalNota,
        valorProdutos: xmlPendente.dados.valorProdutos,
        valorIcms: xmlPendente.dados.valorIcms,
        valorIpi: xmlPendente.dados.valorIpi,
        valorPis: xmlPendente.dados.valorPis,
        valorCofins: xmlPendente.dados.valorCofins,
        fornecedorId: Number(form.fornecedor_id),
        competenciaAno: Number(dt.slice(0, 4)),
        competenciaMes: Number(dt.slice(5, 7)),
      }, xmlPendente.xmlFile);
      if (!anexo.ok && anexo.aviso) toast(anexo.aviso, "warn");
    }

    setSalvando(false);
    resetForm();
    load();
  }

  async function handleConfirmarRecebimento(id: string) {
    if (!(await confirm(`Confirmar recebimento de ${id}? Isso vai dar entrada nos itens no estoque.`))) return;
    setProcessando(id);
    const res = await confirmarRecebimento(id);
    setProcessando(null);
    if (!res.ok) { toast("Erro ao confirmar recebimento: " + res.motivo, "err"); return; }
    load();
  }

  async function handleExcluir(id: string, status: StatusCompra) {
    const aviso = status === "recebido"
      ? `Excluir ${id} permanentemente? Como já foi recebida, isso vai reverter a entrada de estoque dela.`
      : `Excluir ${id} permanentemente?`;
    if (!(await confirm(aviso, { perigo: true }))) return;
    setProcessando(id);
    await deletarCompra(id);
    setProcessando(null);
    load();
  }

  const filtradas = filtro ? compras.filter(c => c.status === filtro) : compras;
  const pendentes = compras.filter(c => c.status === "rascunho");
  const valorRecebidoMes = compras
    .filter(c => c.status === "recebido" && c.dt_recebimento && c.dt_recebimento.slice(0, 7) === hoje().slice(0, 7))
    .reduce((a, c) => a + Number(c.valor_total), 0);

  const inputStyle: React.CSSProperties = {
    background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "6px",
    padding: "9px 12px", color: "var(--t1)", fontSize: "13px", fontFamily: "'Inter', sans-serif",
    outline: "none", width: "100%", boxSizing: "border-box",
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px", color: "var(--t3)", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px", display: "block",
  };

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Compras</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {(["", "rascunho", "recebido"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              style={{
                padding: "5px 14px", borderRadius: "99px", border: "1px solid", fontSize: "12px", cursor: "pointer",
                fontFamily: "'Inter', sans-serif", fontWeight: filtro === s ? 700 : 400,
                background: filtro === s ? "var(--surf2)" : "transparent",
                borderColor: filtro === s ? "var(--b2)" : "var(--b1)",
                color: filtro === s ? "var(--t1)" : "var(--t2)",
              }}
            >
              {s === "" ? "Todas" : s === "rascunho" ? "Pendentes" : "Recebidas"}
            </button>
          ))}
        </div>
        <button className="btn bg sm" onClick={() => setModalXmlAberto(true)}>
          Importar XML
        </button>
        <button className="btn bg sm" onClick={() => setModalSiegAberto(true)}>
          🔍 Buscar Notas Recebidas
        </button>
        <button className="btn bp sm" onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}>
          {showForm ? "✕ Cancelar" : "+ Nova Compra"}
        </button>
      </div>

      {(modalXmlAberto || arquivoSiegRevisao) && (
        <ImportarXmlCompraModal
          produtos={produtos.map(p => ({ id: p.id, nome: p.nome }))}
          fornecedores={fornecedores}
          onImportar={handleImportarXml}
          onFornecedorCriado={handleFornecedorCriado}
          onClose={() => { setModalXmlAberto(false); setArquivoSiegRevisao(null); }}
          arquivoInicial={arquivoSiegRevisao ?? undefined}
        />
      )}

      {modalSiegAberto && (
        <BuscarNotasRecebidasModal
          onRevisar={(arquivo) => { setModalSiegAberto(false); setArquivoSiegRevisao(arquivo); }}
          onClose={() => setModalSiegAberto(false)}
        />
      )}

      <div className="con">
        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total de Compras",        value: String(compras.length),           color: "var(--t1)",   sub: "cadastradas" },
            { label: "Pendentes de Recebimento", value: String(pendentes.length),          color: pendentes.length > 0 ? "var(--warn)" : "var(--t2)", sub: "ainda em rascunho" },
            { label: "Recebido este mês",        value: formatBRL(valorRecebidoMes),       color: "var(--ok)",   sub: "valor confirmado" },
          ].map(card => (
            <div key={card.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{card.value}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* FORM */}
        {showForm && (
          <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
            <div style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "16px" }}>NOVA COMPRA</div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <Campo labelStyle={labelStyle} label="Fornecedor *">
                <select name="fornecedor_id" style={selectStyle} value={form.fornecedor_id} onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
              <Campo labelStyle={labelStyle} label="NF">
                <input name="nf" style={inputStyle} value={form.nf} onChange={e => setForm(f => ({ ...f, nf: e.target.value }))} placeholder="000123" />
              </Campo>
              <Campo labelStyle={labelStyle} label="Data">
                <DateInput style={inputStyle} className="" value={form.dt_compra} onChange={v => setForm(f => ({ ...f, dt_compra: v }))} />
              </Campo>
              <Campo labelStyle={labelStyle} label="Condição de Pagamento">
                <input name="condicao_pgto" style={inputStyle} value={form.condicao_pgto} onChange={e => setForm(f => ({ ...f, condicao_pgto: e.target.value }))} placeholder="30/60/90" />
              </Campo>
            </div>

            {/* ── IMPORTAÇÃO ── */}
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", fontSize: "13px", color: "var(--t2)", cursor: "pointer" }}>
              <input name="eh_importacao" type="checkbox" checked={ehImportacao} onChange={e => setEhImportacao(e.target.checked)} />
              Compra importada (custo real via DI)
            </label>

            {ehImportacao && (
              <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "8px", padding: "14px 16px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "12px" }}>IMPORTAÇÃO — VALORES DA DI</div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "12px" }}>
                  <Campo labelStyle={labelStyle} label="Nº da DI">
                    <input name="numero_di" style={inputStyle} value={imp.numero_di} onChange={e => setImp(v => ({ ...v, numero_di: e.target.value }))} placeholder="25/1234567-8" />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="FOB (USD)">
                    <CurrencyInput aria-label="FOB (USD)" style={inputStyle} className="" value={imp.valor_fob_usd} onChange={v => setImp(s => ({ ...s, valor_fob_usd: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="Frete intl. (USD)">
                    <CurrencyInput aria-label="Frete internacional (USD)" style={inputStyle} className="" value={imp.frete_internacional_usd} onChange={v => setImp(s => ({ ...s, frete_internacional_usd: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="Seguro intl. (USD)">
                    <CurrencyInput aria-label="Seguro internacional (USD)" style={inputStyle} className="" value={imp.seguro_internacional_usd} onChange={v => setImp(s => ({ ...s, seguro_internacional_usd: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="Câmbio (R$/USD)">
                    <input name="cambio_usd" style={inputStyle} type="number" min="0" step="0.0001" value={imp.cambio_usd || ""} onChange={e => setImp(s => ({ ...s, cambio_usd: parseFloat(e.target.value) || 0 }))} placeholder="5.0000" />
                  </Campo>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "12px" }}>
                  <Campo labelStyle={labelStyle} label="II (R$)">
                    <CurrencyInput aria-label="II (R$)" style={inputStyle} className="" value={imp.ii} onChange={v => setImp(s => ({ ...s, ii: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="IPI (R$)">
                    <CurrencyInput aria-label="IPI importação (R$)" style={inputStyle} className="" value={imp.ipi_importacao} onChange={v => setImp(s => ({ ...s, ipi_importacao: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="PIS/COFINS (R$)">
                    <CurrencyInput aria-label="PIS/COFINS importação (R$)" style={inputStyle} className="" value={imp.pis_cofins_importacao} onChange={v => setImp(s => ({ ...s, pis_cofins_importacao: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="ICMS (R$)">
                    <CurrencyInput aria-label="ICMS importação (R$)" style={inputStyle} className="" value={imp.icms_importacao} onChange={v => setImp(s => ({ ...s, icms_importacao: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="Despesas aduaneiras (R$)">
                    <CurrencyInput aria-label="Despesas aduaneiras (R$)" style={inputStyle} className="" value={imp.despesas_aduaneiras} onChange={v => setImp(s => ({ ...s, despesas_aduaneiras: v }))} />
                  </Campo>
                </div>

                <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                    <input name="ipi_creditavel" type="checkbox" checked={imp.ipi_creditavel} onChange={e => setImp(s => ({ ...s, ipi_creditavel: e.target.checked }))} />
                    IPI creditável <span style={{ color: "var(--t3)", fontSize: "11px" }}>(confirmar com contador)</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                    <input name="pis_cofins_creditavel" type="checkbox" checked={imp.pis_cofins_creditavel} onChange={e => setImp(s => ({ ...s, pis_cofins_creditavel: e.target.checked }))} />
                    PIS/COFINS creditável
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                    <input name="icms_creditavel" type="checkbox" checked={imp.icms_creditavel} onChange={e => setImp(s => ({ ...s, icms_creditavel: e.target.checked }))} />
                    ICMS creditável
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", alignItems: "end" }}>
                  {[
                    { label: "Valor Aduaneiro", valor: resumoImp.valorAduaneiroBrl, cor: "var(--t1)" },
                    { label: "Desembolsado", valor: resumoImp.custoDesembolsado, cor: "var(--t1)" },
                    { label: "Não-Recuperável", valor: resumoImp.custoNaoRecuperavel, cor: "var(--acc)" },
                    { label: "Créditos Tributários", valor: resumoImp.creditosTributarios, cor: "var(--ok)" },
                  ].map(box => (
                    <div key={box.label}>
                      <div style={labelStyle}>{box.label}</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: box.cor, fontFamily: "'DM Mono', monospace" }}>{formatBRL(box.valor)}</div>
                    </div>
                  ))}
                  <div>
                    <div style={labelStyle}>Custo real/m² · {m2TotalForm.toFixed(2)} m²</div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(resumoImp.custoM2)}</span>
                      <button className="btn bp xs" onClick={aplicarCustoImportacaoAosItens} disabled={m2TotalForm <= 0} title={m2TotalForm <= 0 ? "Lance os itens (chapas e m²/chapa) primeiro" : "Preenche o Custo/m² de todos os itens"}>
                        ↵ Aplicar aos itens
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "10px" }}>ITENS</div>
            {itens.map((it, i) => {
              const prod = produtos.find(p => String(p.id) === it.produto_id);
              return (
                <div key={i} style={{ marginBottom: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.9fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                    <div>
                      {i === 0 && <label style={labelStyle}>Produto</label>}
                      <select name={`it_produto_id_${i}`} aria-label="Produto" style={selectStyle} value={it.produto_id} onChange={e => updItem(i, "produto_id", e.target.value)}>
                        <option value="">Selecione...</option>
                        {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Colares</label>}
                      <input name={`it_colares_${i}`} aria-label="Colares" style={inputStyle} type="number" min="0" value={it.colares} onChange={e => updItem(i, "colares", e.target.value)}
                        placeholder={prod?.chapas_por_colar ? `× ${prod.chapas_por_colar} ch.` : "config. no produto"} />
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Chapas *</label>}
                      {prod?.chapas_por_colar ? (
                        <div style={{ ...inputStyle, background: "transparent", color: "var(--t2)" }} title="Calculado automaticamente a partir dos colares">
                          {it.chapas || "—"}
                        </div>
                      ) : (
                        <input name={`it_chapas_${i}`} aria-label="Chapas" style={inputStyle} type="number" min="0" value={it.chapas} onChange={e => updItem(i, "chapas", e.target.value)} />
                      )}
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>m²/chapa *</label>}
                      {prod?.chapa_largura_mm && prod?.chapa_altura_mm ? (
                        <div style={{ ...inputStyle, background: "transparent", color: "var(--t2)" }} title="Calculado automaticamente a partir da chapa do produto">
                          {it.m2_por_chapa}
                        </div>
                      ) : (
                        <input name={`it_m2_por_chapa_${i}`} aria-label="m²/chapa" style={inputStyle} type="number" min="0" step="0.0001" value={it.m2_por_chapa} onChange={e => updItem(i, "m2_por_chapa", e.target.value)} />
                      )}
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Custo/m²</label>}
                      <CurrencyInput aria-label="Custo/m²" style={inputStyle} className="" value={it.custo_unitario_m2} onChange={v => updItem(i, "custo_unitario_m2", v)} />
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Subtotal</label>}
                      <div style={{ ...inputStyle, background: "transparent", border: "1px solid transparent", color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>
                        {formatBRL(subtotalItem(it))}
                      </div>
                    </div>
                    <button
                      onClick={() => remItem(i)}
                      title="Remover item"
                      style={{ height: "37px", width: "32px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", cursor: "pointer" }}
                    >✕</button>
                  </div>
                  {it.produto_id && <HistoricoPrecoProduto produtoId={Number(it.produto_id)} />}
                </div>
              );
            })}
            <button className="btn bg sm" onClick={addItem} style={{ marginBottom: "16px" }}>+ Item</button>

            <Campo style={{ marginBottom: "14px" }} labelStyle={labelStyle} label="Observação">
              <input name="obs" style={inputStyle} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Observações opcionais" />
            </Campo>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "var(--t2)", marginRight: "8px" }}>
                Total: <strong style={{ color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(valorTotalForm)}</strong>
              </span>
              <button className="btn bg sm" onClick={resetForm}>Cancelar</button>
              <button className="btn bp sm" onClick={handleSalvar} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar Compra (rascunho)"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading">Carregando compras...</div>
        ) : filtradas.length === 0 ? (
          <div className="card" style={{ textAlign: "center", color: "var(--t3)", padding: "40px" }}>Nenhuma compra encontrada</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Fornecedor</th><th>NF</th><th>Data</th>
                  <th>Valor Total</th><th>Status</th><th>Ações</th><th style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(c => (
                  <Fragment key={c.id}>
                    <tr>
                      <td>
                        <span className="mono" style={{ color: "var(--acc2)", cursor: "pointer" }} onClick={() => setExpandido(expandido === c.id ? null : c.id)}>
                          {expandido === c.id ? "▾" : "▸"} {c.id}
                        </span>
                      </td>
                      <td><strong>{c.fornecedores?.nome ?? "—"}</strong></td>
                      <td className="mono">{c.nf || "—"}</td>
                      <td className="mono">{formatDate(c.dt_compra)}</td>
                      <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(c.valor_total)}</td>
                      <td><span className={CHIP[c.status]}>{c.status === "rascunho" ? "Pendente" : "Recebida"}</span></td>
                      <td>
                        {c.status === "rascunho" && (
                          <button
                            className="btn bp xs"
                            onClick={() => handleConfirmarRecebimento(c.id)}
                            disabled={processando === c.id}
                          >
                            {processando === c.id ? "..." : "Confirmar Recebimento"}
                          </button>
                        )}
                      </td>
                      <td style={{ width: "40px", textAlign: "center" }}>
                        <button
                          title="Excluir compra"
                          onClick={() => handleExcluir(c.id, c.status)}
                          disabled={processando === c.id}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", fontSize: "13px", cursor: "pointer" }}
                        >🗑</button>
                      </td>
                    </tr>
                    {expandido === c.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "var(--surf2)", padding: "12px 20px" }}>
                          {(c.compras_itens ?? []).length === 0 ? (
                            <span style={{ color: "var(--t3)", fontSize: "12px" }}>Sem itens.</span>
                          ) : (
                            <table style={{ width: "100%" }}>
                              <thead>
                                <tr>
                                  <th>Produto</th><th>Colares</th><th>Chapas</th><th>m²/chapa</th><th>m²</th><th>Custo/m²</th><th>Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(c.compras_itens ?? []).map(it => (
                                  <tr key={it.id}>
                                    <td>{it.produtos?.nome ?? "—"}</td>
                                    <td className="mono">{it.colares ?? "—"}</td>
                                    <td className="mono">{it.chapas}</td>
                                    <td className="mono">{Number(it.m2_por_chapa).toFixed(2)}</td>
                                    <td className="mono">{Number(it.m2).toFixed(2)}</td>
                                    <td className="mono">{formatBRL(it.custo_unitario_m2)}</td>
                                    <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(it.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {c.obs && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--t3)" }}>Observação: {c.obs}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
