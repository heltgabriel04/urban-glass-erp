"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { getClientes } from "@/services/clientes.service";
import { createOrcamento, getProximoIdOrcamento, getOrcamentoById } from "@/services/orcamentos.service";
import { getSaldoPorProduto } from "@/services/lotes.service";
import { formatBRL, formatM2 } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { Campo } from "@/components/ui/Campo";
import ImportarMedidasModal from "@/components/ui/ImportarMedidasModal";
import ImportarPdfModal from "@/components/ui/ImportarPdfModal";
import type { MedidaImportada } from "@/lib/importPlanilhaMedidas";
import type { ItemPdfImportado } from "@/lib/importPdfOrcamento";
import type { Cliente, Produto, TabelaPreco, TabelaPrecoItem } from "@/types";

interface ParcelaForm {
  data: string;
  valor: number;
  editado: boolean;
  conta: string;
  formaPgto: string;
}

function addMeses(dateStr: string, meses: number): string {
  if (!dateStr || dateStr.length < 10) return "";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + meses);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function redistribuirParcelas(parcelas: ParcelaForm[], valorTotal: number, idxEditado?: number): ParcelaForm[] {
  if (parcelas.length === 0) return parcelas;
  const fixadas = parcelas.filter((p, i) => p.editado && i !== idxEditado);
  const somaFixadas = fixadas.reduce((a, p) => a + p.valor, 0);
  const restante = Math.max(0, valorTotal - somaFixadas);
  const qtdLivres = parcelas.filter((p, i) => !p.editado || i === idxEditado).length;
  if (qtdLivres === 0) return parcelas;
  const valorBase = parseFloat((restante / qtdLivres).toFixed(2));
  const somaBase  = parseFloat((valorBase * qtdLivres).toFixed(2));
  const diff      = parseFloat((restante - somaBase).toFixed(2));
  let lastFreeIdx = -1;
  for (let i = parcelas.length - 1; i >= 0; i--) {
    if (!parcelas[i].editado || i === idxEditado) { lastFreeIdx = i; break; }
  }
  return parcelas.map((p, i) => {
    if (p.editado && i !== idxEditado) return p;
    return { ...p, valor: i === lastFreeIdx ? parseFloat((valorBase + diff).toFixed(2)) : valorBase };
  });
}

interface ItemForm {
  produto_id: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  quantidade: number;
  valor_m2: number;
  lapidacao: number;
  preco_base: number;
  margem_prod: number;
}

const ITEM_VAZIO: ItemForm = {
  produto_id: null, produto_nome: "",
  largura: 0, altura: 0, quantidade: 1,
  valor_m2: 0, lapidacao: 0,
  preco_base: 0, margem_prod: 0,
};

function arredondarParaMultiplo50(v: number): number {
  if (v % 50 === 0) return v;
  return Math.ceil(v / 50) * 50;
}

export default function NovoOrcamentoPage() {
  return (
    <Suspense fallback={null}>
      <NovoOrcamentoPageInner />
    </Suspense>
  );
}

function NovoOrcamentoPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [produtos, setProdutos]       = useState<Produto[]>([]);
  const [tabelas, setTabelas]         = useState<TabelaPreco[]>([]);
  const [tabelaItens, setTabelaItens] = useState<TabelaPrecoItem[]>([]);
  const [proximoId, setProximoId]     = useState("");

  const [clienteId, setClienteId]     = useState<number | null>(null);
  const [dtOrcamento, setDtOrcamento] = useState(new Date().toISOString().split("T")[0]);
  const [dtValidade, setDtValidade]   = useState("");
  const [dtEntrega, setDtEntrega]     = useState("");
  const [formaPgto, setFormaPgto]     = useState("");
  const [conta, setConta]             = useState("");
  const [parcelas, setParcelas]       = useState(1);
  const [frete, setFrete]             = useState("Retirada");
  const [obs, setObs]                 = useState("");
  const [desconto, setDesconto]       = useState(0);
  const [itens, setItens]             = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);
  const [estoque, setEstoque]         = useState<Map<number, number>>(new Map());
  const [comprometido, setComprometido] = useState<Map<number, number>>(new Map());
  const [loading, setLoading]         = useState(true);
  const [salvando, setSalvando]       = useState(false);
  const [totalPedidoInput, setTotalPedidoInput] = useState(0);
  const [valorGeralInput, setValorGeralInput] = useState(0);
  const [parcelasForm, setParcelasForm] = useState<ParcelaForm[]>([{ data: "", valor: 0, editado: false, conta: "", formaPgto: "" }]);
  const [modalImportar, setModalImportar] = useState(false);
  const [modalImportarPdf, setModalImportarPdf] = useState(false);

  const largRefs   = useRef<(HTMLInputElement | null)[]>([]);
  const altRefs    = useRef<(HTMLInputElement | null)[]>([]);
  const qtdRefs    = useRef<(HTMLInputElement | null)[]>([]);
  const focarLinha = useRef<number | null>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (focarLinha.current !== null) {
      const idx = focarLinha.current;
      focarLinha.current = null;
      setTimeout(() => largRefs.current[idx]?.focus(), 30);
    }
  }, [itens.length]);

  async function load() {
    const [clis, prods, tabs, tpcItens, pid, saldoPorProduto] = await Promise.all([
      getClientes(true),
      supabase.from("produtos").select("*").eq("ativo", true).then(r => r.data as Produto[]),
      supabase.from("tabelas_preco").select("*").eq("ativo", true).then(r => r.data as TabelaPreco[]),
      supabase.from("tabela_preco_itens").select("*").then(r => r.data as TabelaPrecoItem[] || []),
      getProximoIdOrcamento(),
      getSaldoPorProduto(),
    ]);
    setClientes(clis || []);
    setProdutos(prods || []);
    setTabelas(tabs || []);
    setTabelaItens(tpcItens || []);
    setProximoId(pid);
    const em = new Map<number, number>();
    saldoPorProduto.forEach(e => em.set(e.produtoId, e.m2Saldo));
    setEstoque(em);

    // m² já comprometidos em outros orçamentos pendentes (Rascunho + Enviado)
    const { data: pendOrcs } = await supabase.from("orcamentos").select("id").in("status", ["Rascunho", "Enviado"]);
    const pendIds = (pendOrcs ?? []).map((o: any) => o.id as string);
    if (pendIds.length > 0) {
      const { data: pendItens } = await supabase.from("itens_orcamento").select("produto_id, m2").in("orcamento_id", pendIds).not("produto_id", "is", null);
      const cm = new Map<number, number>();
      (pendItens ?? []).forEach((r: any) => { cm.set(r.produto_id, (cm.get(r.produto_id) ?? 0) + Number(r.m2)); });
      setComprometido(cm);
    }

    setItens([{ ...ITEM_VAZIO }]);

    const duplicarDe = searchParams.get("duplicarDe");
    if (duplicarDe) {
      const original = await getOrcamentoById(duplicarDe);
      if (original) {
        setClienteId(original.cliente_id);
        setObs(original.obs ?? "");
        setFrete(original.frete === "Retirada" ? "Retirada" : original.frete ? "Fretado" : "Retirada");
        const itensOriginais = original.itens_orcamento ?? [];
        if (itensOriginais.length > 0) {
          setItens(itensOriginais.map((i: any) => ({
            ...ITEM_VAZIO,
            produto_id:   i.produto_id,
            produto_nome: i.produto_nome,
            largura:      i.largura,
            altura:       i.altura,
            quantidade:   i.quantidade,
            valor_m2:     Number(i.valor_m2),
            lapidacao:    Number(i.lapidacao ?? 0),
            preco_base:   Number(i.valor_m2),
          })));
        }
        toast(`Itens copiados do orçamento ${duplicarDe} — revise antes de salvar`);
      } else {
        toast(`Orçamento ${duplicarDe} não encontrado para duplicar`, "err");
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!clienteId) return;
    const cli = clientes.find(c => c.id === clienteId);
    if (cli) {
      const pgto = cli.pgto || "";
      setFormaPgto(pgto);
      setParcelasForm(prev => prev.map(p => ({ ...p, formaPgto: pgto })));
    }
  }, [clienteId, clientes]);

  const m2Total       = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const subtotalBruto = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const valorDesconto = subtotalBruto * (desconto / 100);
  const valorTotal    = subtotalBruto - valorDesconto;

  useEffect(() => {
    setParcelasForm(prev => {
      const novaPrimeira   = prev[0]?.data      || "";
      const defaultConta   = prev[0]?.conta     ?? "";
      const defaultForma   = prev[0]?.formaPgto ?? "";
      const novas: ParcelaForm[] = Array.from({ length: parcelas }, (_, i) => ({
        data:      novaPrimeira ? (i === 0 ? novaPrimeira : addMeses(novaPrimeira, i)) : "",
        valor: 0, editado: false,
        conta:     prev[i]?.conta     ?? defaultConta,
        formaPgto: prev[i]?.formaPgto ?? defaultForma,
      }));
      return redistribuirParcelas(novas, valorTotal);
    });
  }, [parcelas]);

  useEffect(() => {
    setParcelasForm(prev => redistribuirParcelas(prev, valorTotal));
  }, [valorTotal]);

  function handlePrimeiraDtPgto(data: string) {
    setParcelasForm(prev => prev.map((p, i) => ({
      ...p, data: !data ? "" : (i === 0 ? data : addMeses(data, i)),
    })));
  }

  function handleDtPgto(idx: number, data: string) {
    setParcelasForm(prev => prev.map((p, i) => i === idx ? { ...p, data } : p));
  }

  function handleValorParcela(idx: number, valor: number) {
    setParcelasForm(prev => {
      const atualizado = prev.map((p, i) => i === idx ? { ...p, valor, editado: true } : p);
      return redistribuirParcelas(atualizado, valorTotal, idx);
    });
  }

  // Editar a 1ª parcela aplica a forma/conta a todas (mesmo padrão usado na data de pagamento);
  // editar uma parcela específica só muda aquela, permitindo personalizar depois.
  function handleFormaParc(idx: number, forma: string) {
    setParcelasForm(prev => prev.map((p, i) => (idx === 0 || i === idx) ? { ...p, formaPgto: forma } : p));
  }

  function handleContaParc(idx: number, c: string) {
    setParcelasForm(prev => prev.map((p, i) => (idx === 0 || i === idx) ? { ...p, conta: c } : p));
  }

  const somaParcelas = parcelasForm.reduce((a, p) => a + p.valor, 0);
  const parcelasOk   = Math.abs(somaParcelas - valorTotal) < 0.02;

  function getTabela(): TabelaPreco | null {
    if (!clienteId) return tabelas[0] || null;
    const cli = clientes.find(c => c.id === clienteId);
    if (!cli) return tabelas[0] || null;
    return tabelas.find(t => cli.tabela === "g" ? t.tipo === "Grandes Clientes" : t.tipo === "Padrão") || tabelas[0] || null;
  }

  function addItemAposLinha(i: number) {
    const atual = itens[i];
    const novo: ItemForm = {
      ...ITEM_VAZIO,
      produto_id: atual.produto_id,
      produto_nome: atual.produto_nome,
      valor_m2: atual.valor_m2,
      preco_base: atual.preco_base,
      margem_prod: atual.margem_prod,
    };
    focarLinha.current = i + 1;
    setItens(items => [
      ...items.slice(0, i + 1),
      novo,
      ...items.slice(i + 1),
    ]);
  }

  function addItem() {
    const ultimo = itens[itens.length - 1];
    const novo: ItemForm = {
      ...ITEM_VAZIO,
      produto_id: ultimo?.produto_id ?? null,
      produto_nome: ultimo?.produto_nome ?? "",
      valor_m2: ultimo?.valor_m2 ?? 0,
      preco_base: ultimo?.preco_base ?? 0,
      margem_prod: ultimo?.margem_prod ?? 0,
    };
    focarLinha.current = itens.length;
    setItens(i => [...i, novo]);
  }

  function remItem(i: number) { setItens(items => items.filter((_, idx) => idx !== i)); }

  function handleImportarPdf(itens: ItemPdfImportado[], produtoOverride: number | null) {
    const novos: ItemForm[] = itens.map(item => {
      let prodId = produtoOverride;
      if (prodId === null) {
        const found = produtos.find(p =>
          p.nome.toLowerCase().includes(item.produto_nome.toLowerCase()) ||
          item.produto_nome.toLowerCase().includes(p.nome.toLowerCase())
        );
        prodId = found?.id ?? null;
      }
      const prod = prodId ? produtos.find(p => p.id === prodId) : undefined;
      const { valor: valorTab, margem } = prodId ? getPrecoProduto(prodId) : { valor: 0, margem: 0 };

      // Back-calcula valor_m2 a partir do total do PDF para que o sistema mostre o mesmo total,
      // independente do arredondamento de dimensões (múltiplo de 50) usado pelo sistema.
      let valorM2Final = item.valor_m2 > 0 ? item.valor_m2 : valorTab;
      if (item.total_pdf > 0 && item.largura > 0 && item.altura > 0 && item.quantidade > 0) {
        const lArred = arredondarParaMultiplo50(item.largura);
        const aArred = arredondarParaMultiplo50(item.altura);
        const m2Sistema = (lArred / 1000) * (aArred / 1000) * item.quantidade;
        if (m2Sistema > 0) valorM2Final = item.total_pdf / m2Sistema;
      }

      return {
        ...ITEM_VAZIO,
        produto_id: prodId,
        produto_nome: prod?.nome ?? item.produto_nome,
        largura: item.largura,
        altura: item.altura,
        quantidade: item.quantidade,
        valor_m2: valorM2Final,
        preco_base: valorTab || item.valor_m2,
        margem_prod: margem,
      };
    });
    setItens(prev => {
      const base = prev.length === 1 && prev[0].largura === 0 && prev[0].altura === 0 && prev[0].produto_id === null ? [] : prev;
      return [...base, ...novos];
    });
    setModalImportarPdf(false);
  }

  function handleImportarMedidas(medidas: MedidaImportada[], produtoId: number | null) {
    const prod = produtoId ? produtos.find(p => p.id === produtoId) : undefined;
    const { valor, margem } = produtoId ? getPrecoProduto(produtoId) : { valor: 0, margem: 0 };
    const novos: ItemForm[] = medidas.map(m => ({
      ...ITEM_VAZIO,
      produto_id: produtoId,
      produto_nome: prod?.nome ?? "",
      largura: m.largura,
      altura: m.altura,
      quantidade: m.quantidade,
      valor_m2: valor,
      preco_base: valor,
      margem_prod: margem,
    }));
    setItens(prev => {
      const base = prev.length === 1 && prev[0].largura === 0 && prev[0].altura === 0 && prev[0].produto_id === null ? [] : prev;
      return [...base, ...novos];
    });
    setModalImportar(false);
  }

  function calcM2Item(item: ItemForm): number {
    const l = arredondarParaMultiplo50(item.largura);
    const a = arredondarParaMultiplo50(item.altura);
    return (l / 1000) * (a / 1000) * item.quantidade;
  }

  function calcSubtotal(item: ItemForm): number {
    return calcM2Item(item) * (item.valor_m2 + item.lapidacao);
  }

  function getPrecoProduto(produtoId: number): { valor: number; margem: number } {
    const tab = getTabela();
    if (tab) {
      const item = tabelaItens.find(i => i.tabela_id === tab.id && i.produto_id === produtoId);
      if (item) return { valor: item.valor, margem: item.margem };
    }
    const prod = produtos.find(p => p.id === produtoId);
    return { valor: prod?.valor ?? 0, margem: prod?.margem ?? 0 };
  }

  function updProduto(i: number, id: number | null, label: string) {
    if (id === null) return; // orçamento não tem vidro do cliente — produto sempre vem do catálogo
    const { valor, margem } = getPrecoProduto(id);
    setItens(items => items.map((item, idx) => idx !== i ? item : {
      ...item,
      produto_id: id,
      produto_nome: label,
      valor_m2: valor,
      preco_base: valor,
      margem_prod: margem,
    }));
  }

  function updItem(i: number, field: keyof ItemForm, value: string | number) {
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      return { ...item, [field]: value };
    }));
  }

  function updTotalItem(i: number, total: number) {
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const m2 = calcM2Item(item);
      return { ...item, valor_m2: m2 > 0 ? parseFloat((total / m2).toFixed(4)) : 0 };
    }));
  }

  function updUnitItem(i: number, unit: number) {
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const l = arredondarParaMultiplo50(item.largura);
      const a = arredondarParaMultiplo50(item.altura);
      const m2unit = (l / 1000) * (a / 1000);
      return { ...item, valor_m2: m2unit > 0 ? parseFloat((unit / m2unit).toFixed(4)) : 0 };
    }));
  }

  function aplicarTotalPedido(total: number) {
    if (total <= 0) return;
    const m2Tot = itens.reduce((a, i) => a + calcM2Item(i), 0);
    if (m2Tot <= 0) return;
    const valorM2Geral = total / m2Tot;
    setItens(items => items.map(item => ({
      ...item,
      valor_m2: parseFloat(valorM2Geral.toFixed(4)),
    })));
    setTotalPedidoInput(0);
  }

  function aplicarValorGeral(valor: number) {
    if (valor <= 0) return;
    setItens(items => items.map(item => ({ ...item, valor_m2: valor })));
    setValorGeralInput(0);
  }

  // Agrega m² necessário por produto (para checar contra estoque)
  const m2NecPorProduto = new Map<number, number>();
  for (const item of itens) {
    if (item.produto_id == null) continue;
    m2NecPorProduto.set(item.produto_id, (m2NecPorProduto.get(item.produto_id) ?? 0) + calcM2Item(item));
  }

  const clienteOptions = clientes.map(c => ({
    id: c.id,
    label: c.nome,
    sub: c.cidade || undefined,
  }));

  const produtoOptions = produtos.map(p => ({ id: p.id, label: p.nome }));

  async function salvar() {
    if (!clienteId) { toast("Selecione um cliente", "warn"); return; }
    if (itens.some(i => !i.produto_id)) { toast("Selecione o produto em todos os itens", "warn"); return; }
    if (itens.some(i => i.largura === 0 || i.altura === 0)) { toast("Preencha as dimensões de todos os itens", "warn"); return; }

    setSalvando(true);

    const itensInsert = itens.map(i => ({
      produto_id: i.produto_id,
      produto_nome: i.produto_nome,
      largura: i.largura,
      altura: i.altura,
      quantidade: i.quantidade,
      m2: calcM2Item(i),
      valor_m2: i.valor_m2,
      lapidacao: i.lapidacao,
      desconto: 0,
      subtotal: calcSubtotal(i),
    }));

    const result = await createOrcamento({
      id: proximoId,
      cliente_id: clienteId,
      dt_orcamento: dtOrcamento,
      dt_validade: dtValidade || null,
      dt_entrega: dtEntrega || null,
      forma_pgto: parcelasForm[0]?.formaPgto || formaPgto,
      conta: parcelasForm[0]?.conta || conta,
      parcelas, frete, obs,
      m2_total: m2Total,
      valor_total: valorTotal,
      desconto,
      status: "Rascunho",
    }, itensInsert);

    setSalvando(false);
    if (result) router.push("/orcamentos");
  }

  const tab = getTabela();

  if (loading) return <AppLayout><div style={{ padding: "40px", textAlign: "center", color: "var(--t3)", fontSize: "13px" }}>Carregando...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Novo Orçamento · {proximoId}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" tabIndex={-1} onClick={() => router.push("/orcamentos")}>Cancelar</button>
          <button className="btn bp sm" tabIndex={-1} onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "✓ Salvar Orçamento"}
          </button>
        </div>
      </div>

      <div className="con">
        <div className="g2 mb14">
          <div className="card">
            <div className="ct">Dados do Orçamento</div>

            <Campo style={{ marginBottom: "10px" }} label="Cliente *">
              <AutocompleteInput
                options={clienteOptions}
                value={clienteId}
                onChange={(id) => setClienteId(id)}
                placeholder="Digite o nome do cliente..."
                tabIndex={-1}
              />
            </Campo>

            {clienteId && tab && (
              <div className="al al-i" style={{ marginBottom: "10px" }}>
                Tabela: <strong>{tab.nome}</strong> · Laminado: {formatBRL(tab.lam)}/m²
              </div>
            )}

            <div className="fr">
              <Campo label="Data do Orçamento"><DateInput value={dtOrcamento} onChange={setDtOrcamento} /></Campo>
              <Campo label="Validade do Orçamento"><DateInput value={dtValidade} onChange={setDtValidade} /></Campo>
            </div>
            <div className="fr">
              <Campo label="Previsão de Entrega"><DateInput value={dtEntrega} onChange={setDtEntrega} /></Campo>
              <Campo label="Frete">
                <select name="frete" tabIndex={-1} className="fc" value={frete} onChange={e => setFrete(e.target.value)}>
                  {["Retirada","Fretado"].map(f => <option key={f}>{f}</option>)}
                </select>
              </Campo>
            </div>
            {/* ── FINANCEIRO ── */}
            <div style={{ marginTop: "14px", borderTop: "1px solid var(--b1)", paddingTop: "14px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "12px", letterSpacing: ".06em" }}>FINANCEIRO</div>

              {/* 3 boxes */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                <div style={{ background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--b2)" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "4px" }}>Total</div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--acc)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(valorTotal)}</div>
                </div>
                <div style={{ background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--b2)" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "4px" }}>m² Total</div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--t2)", fontFamily: "'DM Mono',monospace" }}>{formatM2(m2Total)}</div>
                </div>
                <div style={{ background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--b2)" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "4px" }}>
                    {parcelas > 1 ? `${parcelas}× Parcelas` : "Pagamento"}
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--t1)", fontFamily: "'DM Mono',monospace" }}>
                    {parcelas > 1 ? formatBRL(valorTotal / parcelas) : (parcelasForm[0]?.formaPgto || formaPgto || "—")}
                  </div>
                </div>
              </div>

              {/* Parcelas + Desconto */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Parcelas</div>
                <select name="parcelas" tabIndex={-1} className="fc" style={{ margin: 0, width: "72px" }} value={parcelas} onChange={e => setParcelas(Number(e.target.value))}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
                <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginLeft: "8px" }}>Desconto (%)</div>
                <input name="desconto" tabIndex={-1} className="fc" style={{ margin: 0, width: "72px" }} type="number" min="0" max="100" step="0.5" value={desconto || ""} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} placeholder="0" />
              </div>

              {/* Tabela de parcelas — tudo em linha */}
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr 1fr 110px", gap: "6px", padding: "0 12px 6px 12px" }}>
                  {["#","DATA PGTO","FORMA PGTO","CONTA","VALOR"].map(h => (
                    <div key={h} style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono',monospace" }}>{h}</div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {parcelasForm.map((p, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr 1fr 110px", gap: "6px", alignItems: "center", background: "var(--surf2)", borderRadius: "8px", padding: "8px 12px", border: "1px solid var(--b2)" }}>
                      <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>
                        {parcelas > 1 ? `${idx + 1}ª` : "·"}
                      </div>
                      <DateInput value={p.data} onChange={v => idx === 0 ? handlePrimeiraDtPgto(v) : handleDtPgto(idx, v)} />
                      <select name={`p_forma_pgto_${idx}`}
                        tabIndex={-1}
                        className="fc"
                        style={{ margin: 0, fontSize: "12px", padding: "7px 8px" }}
                        value={p.formaPgto}
                        onChange={e => handleFormaParc(idx, e.target.value)}
                      >
                        <option value="">— Forma —</option>
                        {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => <option key={f}>{f}</option>)}
                      </select>
                      <select name={`p_conta_${idx}`}
                        tabIndex={-1}
                        className="fc"
                        style={{ margin: 0, fontSize: "12px", padding: "7px 8px" }}
                        value={p.conta}
                        onChange={e => handleContaParc(idx, e.target.value)}
                      >
                        <option value="">— Conta —</option>
                        {["ZRS","Itaú","Bradesco","Nubank","Caixa Econômica","Santander"].map(c => <option key={c}>{c}</option>)}
                      </select>
                      <CurrencyInput value={p.valor} onChange={v => handleValorParcela(idx, v)} placeholder="R$ 0,00" style={{ margin: 0, fontSize: "12px", padding: "7px 8px" }} />
                    </div>
                  ))}
                </div>
                {valorTotal > 0 && !parcelasOk && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono',monospace", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", borderRadius: "6px", padding: "6px 10px" }}>
                    ⚠ Soma das parcelas ({formatBRL(somaParcelas)}) difere do total ({formatBRL(valorTotal)})
                  </div>
                )}
              </div>
            </div>
            <Campo style={{ marginTop: "10px" }} label="Observações">
              <textarea name="obs" tabIndex={-1} className="fc" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações do orçamento..." />
            </Campo>
          </div>

          <div className="card">
            <div className="ct">Resumo do Orçamento</div>
            <div className="sr"><div className="sl">ID do Orçamento</div><div className="sv mono" style={{ color: "var(--acc)" }}>{proximoId}</div></div>
            <div className="sr"><div className="sl">Total de Itens</div><div className="sv">{itens.length}</div></div>
            <div className="sr"><div className="sl">m² Total</div><div className="sv" style={{ color: "var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            <div className="sr"><div className="sl">Subtotal</div><div className="sv">{formatBRL(subtotalBruto)}</div></div>
            {desconto > 0 && (
              <div className="sr">
                <div className="sl">Desconto ({desconto}%)</div>
                <div className="sv" style={{ color: "var(--err)" }}>− {formatBRL(valorDesconto)}</div>
              </div>
            )}
            <div className="sr"><div className="sl">Valor Total</div><div className="sv" style={{ color: "var(--acc)", fontSize: "18px" }}>{formatBRL(valorTotal)}</div></div>
            {parcelas > 1 && (
              <div className="sr"><div className="sl">Por Parcela</div><div className="sv">{formatBRL(valorTotal / parcelas)}</div></div>
            )}

            {estoque.size > 0 && m2NecPorProduto.size > 0 && (() => {
              const linhas = Array.from(m2NecPorProduto.entries()).map(([pid, nec]) => {
                const nome  = itens.find(i => i.produto_id === pid)?.produto_nome ?? "—";
                const saldo = estoque.get(pid) ?? null;
                const comp  = comprometido.get(pid) ?? 0;
                const real  = saldo !== null ? Math.max(0, saldo - comp) : null;
                const ok    = real !== null && real >= nec - 0.001;
                return { nome, nec, saldo, comp, real, ok };
              });
              const algumRuim = linhas.some(l => !l.ok);
              const temComp   = linhas.some(l => l.comp > 0.001);
              return (
                <div style={{ borderTop:"1px solid var(--b1)", marginTop:"14px", paddingTop:"14px" }}>
                  <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:".06em", marginBottom:"10px", color: algumRuim ? "var(--err)" : "var(--ok)" }}>
                    {algumRuim ? "⚠ ESTOQUE INSUFICIENTE" : "✓ ESTOQUE OK"}
                    {temComp && <span style={{ fontWeight:400, color:"var(--t3)", marginLeft:"6px" }}>considerando outros orçamentos pendentes</span>}
                  </div>
                  {/* cabeçalho */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 52px 70px 62px", gap:"4px", marginBottom:"6px" }}>
                    {["Produto","Precisa","Orçamentos","Real"].map(h => (
                      <div key={h} style={{ fontSize:"8px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", fontFamily:"'DM Mono',monospace", textAlign: h === "Produto" ? "left" : "right" }}>{h}</div>
                    ))}
                  </div>
                  {linhas.map(l => (
                    <div key={l.nome} style={{ display:"grid", gridTemplateColumns:"1fr 52px 70px 62px", gap:"4px", alignItems:"center", marginBottom:"5px" }}>
                      <span style={{ fontSize:"11px", color:"var(--t2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }} title={l.nome}>{l.nome}</span>
                      <span style={{ fontSize:"10px", fontFamily:"'DM Mono',monospace", color:"var(--t3)", textAlign:"right" }}>{formatM2(l.nec)}</span>
                      <span style={{ fontSize:"10px", fontFamily:"'DM Mono',monospace", color: l.comp > 0.001 ? "var(--warn)" : "var(--t3)", textAlign:"right" }}>
                        {l.comp > 0.001 ? `−${formatM2(l.comp)}` : "—"}
                      </span>
                      <div style={{ textAlign:"right" }}>
                        {l.real === null
                          ? <span style={{ fontSize:"10px", color:"var(--t3)" }}>sem dado</span>
                          : <span style={{ fontSize:"10px", fontFamily:"'DM Mono',monospace", fontWeight:700, color: l.ok ? "var(--ok)" : "var(--err)" }}>
                              {formatM2(l.real)}{!l.ok ? <span style={{ fontSize:"8px" }}> ⚠</span> : <span style={{ fontSize:"8px" }}> ✓</span>}
                            </span>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="ct">
            Itens do Orçamento
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>
                Enter avança · Enter em Quantidade cria nova linha
              </span>
              <button tabIndex={-1} className="btn bg sm" onClick={() => setModalImportarPdf(true)} title="Reimporta um orçamento/pedido que este sistema já exportou como PDF">⇪ Importar PDF</button>
              <button tabIndex={-1} className="btn bg sm" onClick={() => setModalImportar(true)} title="Planilha ou PDF de medidas de terceiros (ex.: Relação de Vidros de arquiteto/fornecedor)">⇪ Importar Medidas</button>
              <button tabIndex={-1} className="btn bp sm" onClick={addItem}>+ Item</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 90px 90px 90px 90px 110px 90px 36px", gap: "6px", padding: "6px 0", borderBottom: "1px solid var(--b1)", marginBottom: "8px" }}>
            {["Produto","Largura","Altura","Quantidade","R$/m²","Unitário (R$)","Total (R$)",""].map((h, idx) => (
              <div key={idx} style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono',monospace" }}>{h}</div>
            ))}
          </div>

          {itens.map((item, i) => {
            const m2      = calcM2Item(item);
            const sub     = calcSubtotal(item);
            const m2unit  = (() => { const l = arredondarParaMultiplo50(item.largura); const a = arredondarParaMultiplo50(item.altura); return (l/1000)*(a/1000); })();
            const unitVal = m2unit > 0 ? item.valor_m2 * m2unit : 0;
            const lArred  = arredondarParaMultiplo50(item.largura);
            const aArred  = arredondarParaMultiplo50(item.altura);
            const mostrarArred = item.largura > 0 && item.altura > 0 && (lArred !== item.largura || aArred !== item.altura);

            const margemMin = item.preco_base > 0 && item.margem_prod > 0
              ? item.preco_base * (1 - item.margem_prod / 100) : null;
            const margemMax = item.preco_base > 0 && item.margem_prod > 0
              ? item.preco_base * (1 + item.margem_prod / 100) : null;
            const foraAbaixo = margemMin !== null && item.valor_m2 < margemMin - 0.005;
            const foraAcima  = margemMax !== null && item.valor_m2 > margemMax + 0.005;
            const foraMarjem = foraAbaixo || foraAcima;

            return (
              <div key={i} style={{ marginBottom: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 90px 90px 90px 90px 110px 90px 36px", gap: "6px", alignItems: "center" }}>
                  <AutocompleteInput
                    options={produtoOptions}
                    value={item.produto_id}
                    onChange={(id, label) => updProduto(i, id, label)}
                    placeholder="Buscar produto..."
                    tabIndex={i * 4 + 1}
                  />
                  <input name={`item_largura_${i}`}
                    className="fc"
                    type="number"
                    ref={el => { largRefs.current[i] = el; }}
                    value={item.largura || ""}
                    onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); altRefs.current[i]?.focus(); } }}
                    tabIndex={i * 4 + 2}
                    placeholder="0"
                  />
                  <input name={`item_altura_${i}`}
                    className="fc"
                    type="number"
                    ref={el => { altRefs.current[i] = el; }}
                    value={item.altura || ""}
                    onChange={e => updItem(i, "altura", parseInt(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); qtdRefs.current[i]?.focus(); } }}
                    tabIndex={i * 4 + 3}
                    placeholder="0"
                  />
                  <input name={`item_quantidade_${i}`}
                    className="fc"
                    type="number"
                    ref={el => { qtdRefs.current[i] = el; }}
                    value={item.quantidade}
                    onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItemAposLinha(i); } }}
                    tabIndex={i * 4 + 4}
                    min={1}
                  />
                  <CurrencyInput
                    tabIndex={-1}
                    value={item.valor_m2}
                    onChange={v => updItem(i, "valor_m2", v)}
                    placeholder="R$/m²"
                    title={item.margem_prod > 0 ? `Base: ${formatBRL(item.preco_base)}/m² · Margem ±${item.margem_prod}%` : "Valor por m²"}
                    style={foraMarjem ? { border: "1px solid var(--err)", color: "var(--err)" } : undefined}
                  />
                  <CurrencyInput tabIndex={-1} value={m2 > 0 ? parseFloat(unitVal.toFixed(2)) : 0} onChange={v => updUnitItem(i, v)} placeholder="por peça" title="Valor por peça" />
                  <CurrencyInput tabIndex={-1} value={m2 > 0 ? parseFloat(sub.toFixed(2)) : 0} onChange={v => updTotalItem(i, v)} placeholder="total" title="Total do item" />
                  <button tabIndex={-1} className="btn bw xs" onClick={() => remItem(i)} disabled={itens.length === 1}>✕</button>
                </div>
                {m2 > 0 && (
                  <div style={{ display: "flex", gap: "14px", padding: "4px 0 0 4px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{formatM2(m2)}</span>
                    <span style={{ fontSize: "11px", color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{formatBRL(sub)}</span>
                    {mostrarArred && (
                      <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", opacity: 0.7 }}>cobrado: {lArred}×{aArred}</span>
                    )}
                    {item.produto_id != null && estoque.size > 0 && (() => {
                      const saldo   = estoque.get(item.produto_id!);
                      const comp    = comprometido.get(item.produto_id!) ?? 0;
                      const real    = saldo !== undefined ? Math.max(0, saldo - comp) : undefined;
                      const totalNec = m2NecPorProduto.get(item.produto_id!) ?? 0;
                      if (saldo === undefined) return (
                        <span style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", background:"var(--surf3)", border:"1px solid var(--b2)", padding:"1px 7px", borderRadius:"4px" }}>
                          📦 sem registro de estoque
                        </span>
                      );
                      const ok = real! >= totalNec - 0.001;
                      return (
                        <span style={{ fontSize:"10px", fontFamily:"'DM Mono',monospace", fontWeight:600, color: ok ? "var(--ok)" : "var(--err)", background: ok ? "rgba(16,185,129,.08)" : "rgba(244,63,94,.08)", border:`1px solid ${ok ? "rgba(16,185,129,.25)" : "rgba(244,63,94,.25)"}`, padding:"1px 7px", borderRadius:"4px", whiteSpace:"nowrap" }}>
                          {ok ? "📦 " : "⚠ "}{formatM2(real!)} real{comp > 0.001 ? ` (−${formatM2(comp)} outros ORC.)` : ""}{!ok ? ` · falta ${formatM2(totalNec - real!)}` : ""}
                        </span>
                      );
                    })()}
                  </div>
                )}
                {foraMarjem && (
                  <div style={{ fontSize: "11px", color: "var(--err)", fontFamily: "'DM Mono',monospace", padding: "3px 4px", marginTop: "2px" }}>
                    ⚠ Preço {foraAbaixo
                      ? `abaixo da margem — mínimo ${formatBRL(margemMin!)}/m²`
                      : `acima da margem — máximo ${formatBRL(margemMax!)}/m²`
                    } (±{item.margem_prod}%)
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ marginTop: "14px", padding: "12px 14px", background: "var(--surf2)", borderRadius: "8px", border: "1px solid var(--b2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
              Distribuir total do pedido:
            </span>
            <CurrencyInput tabIndex={-1} value={totalPedidoInput} onChange={setTotalPedidoInput} placeholder="Ex: R$ 850,00" style={{ width: "140px", margin: 0 }} />
            <button tabIndex={-1} className="btn bp sm" onClick={() => aplicarTotalPedido(totalPedidoInput)} disabled={totalPedidoInput <= 0 || m2Total === 0}>↵ Aplicar</button>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>distribui proporcionalmente ao m² de cada item</span>
          </div>

          <div style={{ marginTop: "8px", padding: "12px 14px", background: "var(--surf2)", borderRadius: "8px", border: "1px solid var(--b2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
              Aplicar preço único a todos os itens:
            </span>
            <CurrencyInput tabIndex={-1} value={valorGeralInput} onChange={setValorGeralInput} placeholder="Ex: R$ 80,00/m²" style={{ width: "140px", margin: 0 }} />
            <button tabIndex={-1} className="btn bp sm" onClick={() => aplicarValorGeral(valorGeralInput)} disabled={valorGeralInput <= 0}>↵ Aplicar</button>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>define o mesmo R$/m² em todas as linhas — útil quando você não sabe o total, só o preço unitário</span>
          </div>

          <div className="totbar" style={{ marginTop: "8px" }}>
            <div className="ti"><div className="tl">Itens</div><div className="tv">{itens.length}</div></div>
            <div className="ti"><div className="tl">m² Total</div><div className="tv" style={{ color: "var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            <div className="ti"><div className="tl">Subtotal</div><div className="tv">{formatBRL(subtotalBruto)}</div></div>
            {desconto > 0 && <div className="ti"><div className="tl">Desconto</div><div className="tv" style={{ color: "var(--err)" }}>− {formatBRL(valorDesconto)}</div></div>}
            <div className="ti"><div className="tl">Total</div><div className="tv" style={{ color: "var(--acc)" }}>{formatBRL(valorTotal)}</div></div>
          </div>
        </div>
      </div>

      {modalImportarPdf && (
        <ImportarPdfModal
          produtos={produtos.map(p => ({ id: p.id, nome: p.nome }))}
          onImportar={handleImportarPdf}
          onClose={() => setModalImportarPdf(false)}
        />
      )}

      {modalImportar && (
        <ImportarMedidasModal
          produtos={produtos.map(p => ({ id: p.id, nome: p.nome }))}
          onImportar={handleImportarMedidas}
          onClose={() => setModalImportar(false)}
        />
      )}
    </AppLayout>
  );
}