"use client";

import { useEffect, useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { getPedidoById, updatePedido, recalcularRecebido } from "@/services/pedidos.service";
import { getLancamentosPorPedido } from "@/services/financeiro.service";
import { formatBRL, formatM2 } from "@/lib/formatters";
import { ALIQ_IPI_PEDIDO, calcularValorIpi, valorComIpi } from "@/lib/pedidoIpi";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { Campo } from "@/components/ui/Campo";
import { useToast } from "@/components/ui/toast";
import type { Cliente, Produto, TabelaPreco, TabelaPrecoItem, Vendedor } from "@/types";

type ModoPedido = "m2" | "ml";

interface ItemForm {
  id?: number;
  produto_id: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  quantidade: number;
  valor_m2: number;
  lapidacao: number;
  ml_larg: boolean;
  ml_alt: boolean;
  vidro_cliente: boolean;
  preco_base: number;
  margem_prod: number;
  codigo_adicional: string;
}

interface ParcelaForm {
  data: string;
  valor: number;
  editado: boolean;
  lancamento_id?: number;
}

const ITEM_VAZIO: ItemForm = {
  produto_id: null, produto_nome: "",
  largura: 0, altura: 0, quantidade: 1,
  valor_m2: 0, lapidacao: 0,
  ml_larg: true, ml_alt: true,
  vidro_cliente: false,
  preco_base: 0, margem_prod: 0,
  codigo_adicional: "",
};

const CHAPAS_DIMS = [
  { w: 3300, h: 2250 }, { w: 2250, h: 3300 },
  { w: 3660, h: 2140 }, { w: 2140, h: 3660 },
  { w: 2150, h: 3660 }, { w: 3660, h: 2150 },
];

function arredondarParaMultiplo50(v: number): number {
  if (v % 50 === 0) return v;
  return Math.ceil(v / 50) * 50;
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

export default function EditarPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const vendedorFieldId = useId();

  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [produtos, setProdutos]       = useState<Produto[]>([]);
  const [tabelas, setTabelas]         = useState<TabelaPreco[]>([]);
  const [tabelaItens, setTabelaItens] = useState<TabelaPrecoItem[]>([]);
  const [vendedores, setVendedores]   = useState<Pick<Vendedor, "id" | "nome" | "comissao_pct">[]>([]);

  const [clienteId, setClienteId]   = useState<number | null>(null);
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [dtPedido, setDtPedido]     = useState("");
  const [dtRetirada, setDtRetirada] = useState("");
  const [frete, setFrete]           = useState("Retirada");
  const [formaPgto, setFormaPgto]   = useState("");
  const [conta, setConta]           = useState("");
  const [parcelas, setParcelas]     = useState(1);
  const [obs, setObs]               = useState("");
  const [temIpi, setTemIpi]         = useState(false);
  const [itens, setItens]           = useState<ItemForm[]>([]);
  const [itensDeletados, setItensDeletados] = useState<number[]>([]);
  const [modoPedido, setModoPedido] = useState<ModoPedido>("m2");
  const [parcelasForm, setParcelasForm] = useState<ParcelaForm[]>([]);
  const [valorRecebidoOriginal, setValorRecebidoOriginal] = useState(0);
  const [totalPedidoInput, setTotalPedidoInput] = useState(0);
  const [valorGeralInput, setValorGeralInput] = useState(0);

  const [loading, setLoading]   = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [pedido, lancs, clis, prods, tabs, tabItens, vends] = await Promise.all([
      getPedidoById(id),
      getLancamentosPorPedido(id),
      supabase.from("clientes").select("*").eq("ativo", true).order("nome").then(r => r.data as Cliente[] ?? []),
      supabase.from("produtos").select("*").eq("ativo", true).then(r => r.data as Produto[] ?? []),
      supabase.from("tabelas_preco").select("*").eq("ativo", true).then(r => r.data as TabelaPreco[] ?? []),
      supabase.from("tabela_preco_itens").select("*").then(r => r.data as TabelaPrecoItem[] ?? []),
      supabase.from("vendedores").select("id, nome, comissao_pct").eq("ativo", true).order("nome").then(r => r.data ?? []),
    ]);

    if (!pedido) { toast("Pedido não encontrado", "err"); router.back(); return; }

    setValorRecebidoOriginal(pedido.valor_recebido ?? 0);
    setClientes(clis);
    setProdutos(prods);
    setTabelas(tabs);
    setTabelaItens(tabItens);
    setVendedores(vends as Pick<Vendedor, "id" | "nome" | "comissao_pct">[]);
    setClienteId(pedido.cliente_id);
    setVendedorId(pedido.vendedor_id ?? null);
    setDtPedido(pedido.dt_pedido ?? "");
    setDtRetirada(pedido.dt_retirada ?? "");
    setFrete(pedido.frete ?? "Retirada");
    setFormaPgto(pedido.forma_pgto ?? "");
    setConta(pedido.conta ?? "");
    setParcelas(pedido.parcelas ?? 1);
    setObs(pedido.obs ?? "");
    setTemIpi(pedido.tem_ipi ?? false);

    // Detectar modo ML: se todos os itens são vidro_cliente ou produto ml
    const rawItens = (pedido.itens_pedido ?? []) as any[];
    const todosMl = rawItens.length > 0 && rawItens.every(i =>
      i.vidro_cliente === true || i.produtos?.unidade === "ml"
    );
    setModoPedido(todosMl ? "ml" : "m2");

    setItens(rawItens.map(i => ({
      id:               i.id,
      produto_id:       i.produto_id,
      produto_nome:     i.produto_nome,
      largura:          i.largura,
      altura:           i.altura,
      quantidade:       i.quantidade,
      valor_m2:         Number(i.valor_m2),
      lapidacao:        Number(i.lapidacao ?? 0),
      ml_larg:          true,
      ml_alt:           true,
      vidro_cliente:    Boolean(i.vidro_cliente),
      preco_base:       Number(i.valor_m2),
      margem_prod:      0,
      codigo_adicional: i.codigo_adicional ?? "",
    })));
    setItensDeletados([]);

    // Parcelas a receber
    const aReceber = lancs.filter(l => l.status === "A Receber").sort((a, b) =>
      (a.vencimento ?? "").localeCompare(b.vencimento ?? "")
    );
    if (aReceber.length > 0) {
      setParcelasForm(aReceber.map(l => ({
        data: l.vencimento ?? "", valor: l.valor, editado: false, lancamento_id: l.id,
      })));
    } else {
      const n = pedido.parcelas ?? 1;
      const datas = pedido.datas_pgto ?? [];
      const vals  = pedido.valores_pgto ?? [];
      setParcelasForm(Array.from({ length: n }, (_, i) => ({
        data: datas[i] ?? "", valor: vals[i] ?? parseFloat((valorComIpi(pedido) / n).toFixed(2)), editado: false,
      })));
    }

    setLoading(false);
  }

  // ── cálculos ─────────────────────────────────────────────────────

  function calcM2Item(item: ItemForm): number {
    const l = arredondarParaMultiplo50(item.largura);
    const a = arredondarParaMultiplo50(item.altura);
    return (l / 1000) * (a / 1000) * item.quantidade;
  }

  function calcMLItem(item: ItemForm): number {
    return ((item.ml_larg ? item.largura / 1000 : 0) + (item.ml_alt ? item.altura / 1000 : 0)) * item.quantidade;
  }

  function calcSubtotal(item: ItemForm): number {
    if (modoPedido === "ml") return calcMLItem(item) * item.valor_m2;
    return calcM2Item(item) * item.valor_m2 + item.lapidacao * calcM2Item(item);
  }

  const m2Total    = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const valorTotal = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const valorIpi   = temIpi ? calcularValorIpi(valorTotal) : 0;
  const valorComIpiCalc = valorTotal + valorIpi;
  const todosVC    = itens.length > 0 && itens.every(i => i.vidro_cliente);
  const algumVC    = itens.some(i => i.vidro_cliente);

  // Redistribuir parcelas quando total muda
  useEffect(() => {
    setParcelasForm(prev => redistribuirParcelas(prev, valorComIpiCalc));
  }, [valorComIpiCalc]);

  const somaParcelas = parcelasForm.reduce((a, p) => a + p.valor, 0);
  const difParcelas  = Math.abs(somaParcelas - valorComIpiCalc);
  const parcelasOk   = difParcelas < 0.02;

  // ── tabela de preços ─────────────────────────────────────────────

  function getTabela(): TabelaPreco | null {
    if (!clienteId) return tabelas[0] || null;
    const cli = clientes.find(c => c.id === clienteId);
    if (!cli) return tabelas[0] || null;
    return tabelas.find(t => (cli as any).tabela === "g" ? t.tipo === "Grandes Clientes" : t.tipo === "Padrão") || tabelas[0] || null;
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

  // ── itens ────────────────────────────────────────────────────────

  function addItem() { setItens(i => [...i, { ...ITEM_VAZIO }]); }

  function remItem(i: number) {
    const item = itens[i];
    if (item.id) setItensDeletados(d => [...d, item.id!]);
    setItens(items => items.filter((_, idx) => idx !== i));
  }

  function updItem(i: number, field: keyof ItemForm, value: string | number | boolean) {
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const novo = { ...item, [field]: value };
      if (field === "produto_id") {
        const prodId = Number(value);
        if (prodId) {
          const prod = produtos.find(p => p.id === prodId);
          const { valor, margem } = getPrecoProduto(prodId);
          novo.produto_nome = prod?.nome ?? "";
          novo.valor_m2     = valor;
          novo.preco_base   = valor;
          novo.margem_prod  = margem;
        }
      }
      return novo;
    }));
  }

  function setProdutoItem(i: number, id: number | null, label: string) {
    const { valor, margem } = id !== null ? getPrecoProduto(id) : { valor: 0, margem: 0 };
    setItens(items => items.map((item, idx) => idx !== i ? item : id !== null ? {
      ...item, produto_id: id, produto_nome: label, valor_m2: valor, preco_base: valor, margem_prod: margem,
    } : {
      ...item, produto_id: id, produto_nome: label,
    }));
  }

  function updTotalItem(i: number, total: number) {
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      if (modoPedido === "ml") {
        const ml = calcMLItem(item);
        return { ...item, valor_m2: ml > 0 ? parseFloat((total / ml).toFixed(4)) : 0 };
      }
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

  function marcarTodosVC(valor: boolean) {
    setItens(items => items.map(item => ({ ...item, vidro_cliente: valor })));
  }

  function aplicarTotalPedido(total: number) {
    if (total <= 0) return;
    if (modoPedido === "ml") {
      const mlTot = itens.reduce((a, i) => a + calcMLItem(i), 0);
      if (mlTot <= 0) return;
      setItens(items => items.map(item => ({ ...item, valor_m2: parseFloat((total / mlTot).toFixed(4)) })));
    } else {
      const m2Tot = itens.reduce((a, i) => a + calcM2Item(i), 0);
      if (m2Tot <= 0) return;
      setItens(items => items.map(item => ({ ...item, valor_m2: parseFloat((total / m2Tot).toFixed(4)) })));
    }
    setTotalPedidoInput(0);
  }

  function aplicarValorGeral(valor: number) {
    if (valor <= 0) return;
    setItens(items => items.map(item => ({ ...item, valor_m2: valor })));
    setValorGeralInput(0);
  }

  function handleModoPedido(modo: ModoPedido) {
    setModoPedido(modo);
    setItens(items => items.map(item => ({ ...item, valor_m2: 0 })));
  }

  // ── parcelas ─────────────────────────────────────────────────────

  function handleNParcelas(n: number) {
    setParcelas(n);
    const primeiraData = parcelasForm[0]?.data ?? "";
    setParcelasForm(redistribuirParcelas(
      Array.from({ length: n }, (_, i) => ({
        data: primeiraData ? (i === 0 ? primeiraData : addMeses(primeiraData, i)) : "",
        valor: 0, editado: false,
      })),
      valorComIpiCalc,
    ));
  }

  function handlePrimeiraDt(data: string) {
    setParcelasForm(prev => prev.map((p, i) => ({
      ...p, data: !data ? "" : (i === 0 ? data : addMeses(data, i)),
    })));
  }

  function handleDtParcela(idx: number, data: string) {
    setParcelasForm(prev => prev.map((p, i) => i === idx ? { ...p, data } : p));
  }

  function handleValorParcela(idx: number, valor: number) {
    setParcelasForm(prev => {
      const atualizado = prev.map((p, i) => i === idx ? { ...p, valor, editado: true } : p);
      return redistribuirParcelas(atualizado, valorComIpiCalc, idx);
    });
  }

  // ── salvar ───────────────────────────────────────────────────────

  async function salvar() {
    if (!clienteId) { toast("Selecione um cliente", "err"); return; }
    if (itens.some(i => i.largura === 0 || i.altura === 0)) { toast("Preencha as dimensões de todos os itens", "err"); return; }
    if (!parcelasOk) { toast(`Soma das parcelas (${formatBRL(somaParcelas)}) difere do total (${formatBRL(valorComIpiCalc)})`, "err"); return; }

    setSalvando(true);

    const result = await updatePedido(id, {
      cliente_id:   clienteId,
      vendedor_id:  vendedorId,
      dt_pedido:    dtPedido,
      dt_retirada:  dtRetirada || null,
      frete,
      forma_pgto:   formaPgto,
      conta,
      parcelas,
      obs,
      datas_pgto:   parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.data),
      valores_pgto: parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.valor),
      valor_total:  parseFloat(valorTotal.toFixed(2)),
      tem_ipi:      temIpi,
      valor_ipi:    valorIpi,
      m2_total:     parseFloat(m2Total.toFixed(4)),
    });

    if (!result) { toast("Erro ao salvar pedido", "err"); setSalvando(false); return; }

    // Deletar itens removidos — 1 chamada em lote em vez de N sequenciais
    if (itensDeletados.length > 0) {
      await supabase.from("itens_pedido").delete().in("id", itensDeletados);
    }

    // Salvar itens: novos num insert em lote, existentes num upsert em lote
    // (antes eram N updates/inserts sequenciais — um pedido com 40-50 peças
    // travava a tela até completar tudo).
    const itensNovos: Record<string, unknown>[] = [];
    const itensExistentes: Record<string, unknown>[] = [];
    for (const item of itens) {
      const m2val  = modoPedido === "ml" ? calcMLItem(item) : calcM2Item(item);
      const subtot = calcSubtotal(item);
      const payload = {
        produto_id: item.produto_id, produto_nome: item.produto_nome,
        largura: item.largura, altura: item.altura,
        quantidade: item.quantidade, valor_m2: item.valor_m2,
        lapidacao: item.lapidacao,
        vidro_cliente: item.vidro_cliente,
        m2: parseFloat(m2val.toFixed(4)),
        subtotal: parseFloat(subtot.toFixed(2)),
        codigo_adicional: item.codigo_adicional || null,
      };
      if (item.id) itensExistentes.push({ id: item.id, ...payload });
      else itensNovos.push({ ...payload, pedido_id: id });
    }
    if (itensNovos.length > 0) await supabase.from("itens_pedido").insert(itensNovos as never);
    if (itensExistentes.length > 0) await supabase.from("itens_pedido").upsert(itensExistentes as never);

    // Recriar lançamentos A Receber — delete e insert em lote em vez de N+N
    // chamadas individuais. recalcularRecebido(id) já roda uma vez no fim,
    // cobrindo o mesmo efeito colateral que cada delete/create faria sozinho.
    //
    // Só reconcilia se havia parcela "A Receber" de verdade pra substituir OU
    // se o total agora excede o que já foi recebido (ex: item novo aumentou
    // o valor). Sem essa guarda, salvar um pedido já quitado (0 lançamentos
    // "A Receber") inseria parcelas fantasma — o formulário reconstrói
    // parcelasForm a partir de pedido.parcelas/valor_total quando não há
    // nenhuma "A Receber" pra carregar (ver load(), acima), e esse valor
    // reconstruído sempre bate com valorTotal, então nada impedia o insert.
    const lancsAtual = await getLancamentosPorPedido(id);
    const idsParaExcluir = lancsAtual.filter(l => l.status === "A Receber").map(l => l.id);
    const saldoPendente = parseFloat((valorComIpiCalc - valorRecebidoOriginal).toFixed(2));
    if (idsParaExcluir.length > 0 || saldoPendente > 0.02) {
      if (idsParaExcluir.length > 0) {
        await supabase.from("lancamentos").delete().in("id", idsParaExcluir);
      }
      const novasParcelas = parcelasForm
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.data && p.valor > 0)
        .map(({ p, i }) => ({
          tipo: "Entrada", status: "A Receber", vencimento: p.data, valor: p.valor,
          descricao: parcelas === 1 ? `Recebimento · ${id}` : `Parcela ${i + 1}/${parcelas} · ${id}`,
          pedido_id: id, cliente_id: clienteId,
        }));
      if (novasParcelas.length > 0) {
        await supabase.from("lancamentos").insert(novasParcelas as never);
      }
    }
    await recalcularRecebido(id);

    // ── Lançamento de comissão ──────────────────────────────────────
    const lancsAtual2 = await getLancamentosPorPedido(id);
    const lancComissao = lancsAtual2.find(
      l => l.tipo === "Saída" && (l as any).vendedor_id != null
    );
    const vendedor = vendedorId ? vendedores.find(v => v.id === vendedorId) : null;
    const valorComissao = vendedor
      ? parseFloat((valorTotal * vendedor.comissao_pct / 100).toFixed(2))
      : 0;

    if (lancComissao) {
      if (!vendedorId) {
        await supabase.from("lancamentos").delete().eq("id", lancComissao.id);
      } else {
        await supabase.from("lancamentos").update({
          descricao:   `Comissão — ${vendedor!.nome} — Pedido ${id}`,
          valor:        valorComissao,
          vencimento:   parcelasForm[0]?.data || null,
          vendedor_id:  vendedorId,
        } as never).eq("id", lancComissao.id);
      }
    } else if (vendedorId && vendedor && valorComissao > 0) {
      await supabase.from("lancamentos").insert([{
        tipo:        "Saída",
        descricao:   `Comissão — ${vendedor.nome} — Pedido ${id}`,
        valor:        valorComissao,
        status:       "Pendente",
        vencimento:   parcelasForm[0]?.data || null,
        pedido_id:    id,
        cliente_id:   null,
        vendedor_id:  vendedorId,
      } as never]);
    }

    toast("Pedido atualizado");
    router.push(`/pedidos/${id}`);
  }

  // ── render ───────────────────────────────────────────────────────

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando pedido...</div></div></AppLayout>;

  const tab  = getTabela();
  const isMl = modoPedido === "ml";

  const toggleBase:   React.CSSProperties = { padding:"5px 14px", borderRadius:"6px", fontSize:"12px", fontWeight:600, cursor:"pointer", border:"1px solid var(--b2)", transition:"all 0.15s", fontFamily:"'DM Mono',monospace" };
  const toggleAtivo:  React.CSSProperties = { ...toggleBase, background:"var(--acc)", color:"#000", borderColor:"var(--acc)" };
  const toggleInativo:React.CSSProperties = { ...toggleBase, background:"transparent", color:"var(--t3)" };
  const colsM2 = "2fr 90px 90px 90px 90px 110px 90px 36px 100px";
  const colsMl = "2fr 100px 100px 90px 90px 90px 36px 100px";

  const clienteOpts = clientes.map(c => ({ id: c.id, label: c.nome, sub: c.cidade ?? undefined }));
  const produtoOpts = produtos.map(p => ({ id: p.id, label: p.nome, sub: formatBRL(p.valor) + "/m²" }));

  return (
    <AppLayout>
      <div className="tb">
        <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
        <div className="tb-title" style={{ flex:1 }}>Editar Pedido · <span style={{ color:"var(--acc)" }}>{id}</span></div>
        <button className="btn bg sm" onClick={() => router.back()}>Cancelar</button>
        <button className="btn bp sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "✓ Salvar Alterações"}</button>
      </div>

      <div className="con">
        <div className="g2 mb14">

          {/* ── Dados do Pedido ── */}
          <div className="card">
            <div className="ct">Dados do Pedido</div>

            <Campo style={{ marginBottom:"10px" }} label="Cliente *">
              <AutocompleteInput options={clienteOpts} value={clienteId} onChange={id => setClienteId(id)} placeholder="Buscar cliente..." />
            </Campo>

            <div className="fg" style={{ marginBottom:"10px" }}>
              <label className="fl" htmlFor={vendedorFieldId}>Vendedor / Comissão</label>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <select id={vendedorFieldId} className="fc" style={{ flex:1 }} value={vendedorId ?? ""} onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Sem vendedor —</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.comissao_pct}%)</option>)}
                </select>
                {vendedorId && (() => {
                  const vend = vendedores.find(v => v.id === vendedorId);
                  const val  = vend ? valorTotal * vend.comissao_pct / 100 : 0;
                  return val > 0 ? (
                    <span style={{ fontSize:"12px", color:"var(--warn)", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>
                      {vend!.comissao_pct}% = {val.toLocaleString("pt-BR", { style:"currency", currency:"BRL" })}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {clienteId && tab && (
              <div className="al al-i" style={{ marginBottom:"10px" }}>
                Tabela: <strong>{tab.nome}</strong> · Laminado: {formatBRL(tab.lam)}/m² · Reflecta: {formatBRL(tab.ref)}/m²
              </div>
            )}

            <div className="fr3">
              <Campo label="Data do Pedido"><DateInput value={dtPedido} onChange={setDtPedido} /></Campo>
              <Campo label="Previsão Retirada"><DateInput value={dtRetirada} onChange={setDtRetirada} /></Campo>
              <Campo label="Frete">
                <select name="frete" className="fc" value={frete} onChange={e => setFrete(e.target.value)}>
                  {["Retirada","Fretado"].map(f => <option key={f}>{f}</option>)}
                </select>
              </Campo>
            </div>
            <div className="fr">
              <Campo label="Forma de Pagamento">
                <select name="forma_pgto" className="fc" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                  <option value="">Selecione...</option>
                  {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => <option key={f}>{f}</option>)}
                </select>
              </Campo>
              <Campo label="Conta">
                <select name="conta" className="fc" value={conta} onChange={e => setConta(e.target.value)}>
                  <option value="">Selecione...</option>
                  {["ZRS","Itaú","Bradesco","Nubank","Caixa Econômica","Santander"].map(c => <option key={c}>{c}</option>)}
                </select>
              </Campo>
            </div>

            <div className="fr">
              <Campo label="Parcelas">
                <select name="parcelas" className="fc" value={parcelas} onChange={e => handleNParcelas(Number(e.target.value))}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </Campo>
            </div>

            <div style={{ marginTop:"10px", padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"10px", textTransform:"uppercase" }}>
                {parcelas === 1 ? "Pagamento" : `Parcelas (${parcelas}x)`}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                <input name="tem_ipi" type="checkbox" checked={temIpi} onChange={e => setTemIpi(e.target.checked)} />
                Tem IPI ({ALIQ_IPI_PEDIDO}%)
                {temIpi && <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--warn)", marginLeft: "4px" }}>— {formatBRL(valorIpi)}</span>}
              </label>
              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                {parcelasForm.map((p, idx) => (
                  <div key={idx} style={{ display:"grid", gridTemplateColumns: parcelas > 1 ? "60px 1fr 120px" : "1fr 120px", gap:"8px", alignItems:"center" }}>
                    {parcelas > 1 && <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{idx + 1}ª</span>}
                    <DateInput value={p.data} onChange={v => idx === 0 ? handlePrimeiraDt(v) : handleDtParcela(idx, v)} />
                    <CurrencyInput value={p.valor} onChange={v => handleValorParcela(idx, v)} placeholder="R$ 0,00" style={{ margin:0 }} />
                  </div>
                ))}
              </div>
              {valorComIpiCalc > 0 && !parcelasOk && (
                <div style={{ marginTop:"8px", fontSize:"11px", color:"var(--warn, #f59e0b)", fontFamily:"'DM Mono',monospace" }}>
                  ⚠ Soma das parcelas ({formatBRL(somaParcelas)}) difere do total ({formatBRL(valorComIpiCalc)})
                </div>
              )}
            </div>

            <Campo style={{ marginTop:"10px" }} label="Observações">
              <textarea name="obs" className="fc" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações do pedido..." />
            </Campo>
          </div>

          {/* ── Resumo ── */}
          <div className="card">
            <div className="ct">Resumo do Pedido</div>
            <div className="sr"><div className="sl">ID do Pedido</div><div className="sv mono" style={{ color:"var(--acc)" }}>{id}</div></div>
            <div className="sr"><div className="sl">Total de Itens</div><div className="sv">{itens.length}</div></div>
            <div className="sr"><div className="sl">m² Total</div><div className="sv" style={{ color:"var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            <div className="sr">
              <div className="sl">Cobrança</div>
              <div className="sv">
                <span className="chip" style={{ background: isMl ? "rgba(99,102,241,.2)" : "rgba(16,185,129,.2)", color: isMl ? "#818cf8" : "var(--acc)", border:"none" }}>
                  {isMl ? "Metro Linear" : "Metro Quadrado"}
                </span>
              </div>
            </div>
            {algumVC && (
              <div className="sr">
                <div className="sl">Vidro do Cliente</div>
                <div className="sv">
                  <span className="chip" style={{ background:"rgba(245,158,11,.15)", color:"var(--warn)", border:"1px solid rgba(245,158,11,.3)" }}>
                    {todosVC ? "Todos os itens" : `${itens.filter(i => i.vidro_cliente).length} de ${itens.length}`}
                  </span>
                </div>
              </div>
            )}
            <div className="sr"><div className="sl">Valor Total</div><div className="sv" style={{ color:"var(--acc)", fontSize:"18px" }}>{formatBRL(valorComIpiCalc)}</div></div>
            {parcelas > 1 && <div className="sr"><div className="sl">Por Parcela</div><div className="sv">{formatBRL(valorComIpiCalc / parcelas)}</div></div>}
            {clienteId && tab && tab.min > 0 && valorTotal < tab.min && (
              <div className="al al-w" style={{ marginTop:"10px" }}>⚠ Pedido abaixo do mínimo de {formatBRL(tab.min)}</div>
            )}
            <button className="btn bp" style={{ width:"100%", marginTop:"16px", padding:"12px" }} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : `✓ Salvar Alterações · ${formatBRL(valorComIpiCalc)}`}
            </button>
          </div>
        </div>

        {/* ── Itens ── */}
        <div className="card">
          <div className="ct">
            Itens do Pedido
            <div style={{ display:"flex", gap:"4px", marginLeft:"auto", marginRight:"8px" }}>
              <button style={!isMl ? toggleAtivo : toggleInativo} onClick={() => handleModoPedido("m2")}>m²</button>
              <button style={isMl ? { ...toggleAtivo, background:"#6366f1", borderColor:"#6366f1" } : toggleInativo} onClick={() => handleModoPedido("ml")}>ml</button>
            </div>
            <button className="btn bp xs" onClick={addItem}>+ Item</button>
          </div>

          {isMl && (
            <div style={{ marginBottom:"10px", padding:"8px 12px", background:"rgba(99,102,241,.1)", borderRadius:"6px", border:"1px solid rgba(99,102,241,.3)", fontSize:"12px", color:"#818cf8", fontFamily:"'DM Mono',monospace" }}>
              Metro Linear · fórmula: (Largura_m × ☑ + Altura_m × ☑) × Quantidade × R$/ml
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns: isMl ? colsMl : colsM2, gap:"6px", padding:"6px 0", borderBottom:"1px solid var(--b1)", marginBottom:"8px", alignItems:"center" }}>
            {(isMl
              ? ["Produto","Largura (mm)","Altura (mm)","Quantidade","R$/ml","Total (R$)",""]
              : ["Produto","Largura","Altura","Quantidade","R$/m²","Unitário (R$)","Total (R$)",""]
            ).map((h, i) => (
              <div key={i} style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", fontFamily:"'DM Mono',monospace" }}>{h}</div>
            ))}
            <div style={{ display:"flex", alignItems:"center", gap:"4px" }}>
              <input name="todos_vc"
                type="checkbox" checked={todosVC}
                ref={el => { if (el) el.indeterminate = algumVC && !todosVC; }}
                onChange={e => marcarTodosVC(e.target.checked)}
                style={{ width:"12px", height:"12px", accentColor:"var(--warn)", cursor:"pointer" }}
                title="Marcar todos como vidro do cliente"
              />
              <span style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>Vidro Cliente</span>
            </div>
          </div>

          {itens.map((item, i) => {
            const m2     = calcM2Item(item);
            const ml     = calcMLItem(item);
            const sub    = calcSubtotal(item);
            const lArred = arredondarParaMultiplo50(item.largura);
            const aArred = arredondarParaMultiplo50(item.altura);
            const m2unit = (lArred / 1000) * (aArred / 1000);
            const unitVal = m2unit > 0 ? item.valor_m2 * m2unit : 0;
            const mostrarArred = item.largura > 0 && item.altura > 0 && (lArred !== item.largura || aArred !== item.altura);

            const margemMin = item.preco_base > 0 && item.margem_prod > 0 ? item.preco_base * (1 - item.margem_prod / 100) : null;
            const margemMax = item.preco_base > 0 && item.margem_prod > 0 ? item.preco_base * (1 + item.margem_prod / 100) : null;
            const foraAbaixo = margemMin !== null && item.valor_m2 < margemMin - 0.005;
            const foraAcima  = margemMax !== null && item.valor_m2 > margemMax + 0.005;
            const foraMarjem = foraAbaixo || foraAcima;

            const checkboxVC = (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
                <input name={`item_vidro_cliente_${i}`} type="checkbox" checked={item.vidro_cliente} onChange={e => updItem(i, "vidro_cliente", e.target.checked)}
                  style={{ width:"14px", height:"14px", accentColor:"var(--warn)", cursor:"pointer" }} />
              </div>
            );

            return (
              <div key={i} style={{ marginBottom:"10px" }}>
                {item.vidro_cliente && (
                  <div style={{ fontSize:"10px", color:"var(--warn)", fontFamily:"'DM Mono',monospace", marginBottom:"3px", paddingLeft:"2px" }}>
                    📦 Vidro do cliente — não desconta estoque
                  </div>
                )}
                {isMl ? (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:colsMl, gap:"6px", alignItems:"center" }}>
                      <AutocompleteInput options={produtoOpts} value={item.produto_id} valueLabel={item.produto_nome} allowFreeText={item.vidro_cliente} onChange={(id, label) => setProdutoItem(i, id, label)} placeholder={item.vidro_cliente ? "Buscar ou digitar produto do cliente..." : "Buscar produto..."} />
                      <div style={{ position:"relative" }}>
                        <input name={`item_largura_${i}`} className="fc" type="number" value={item.largura || ""} onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)} placeholder="0" style={{ paddingRight:"24px" }} />
                        <label style={{ position:"absolute", right:"6px", top:"50%", transform:"translateY(-50%)", cursor:"pointer" }}>
                          <input name={`item_ml_larg_${i}`} type="checkbox" checked={item.ml_larg} onChange={e => updItem(i, "ml_larg", e.target.checked)} style={{ width:"12px", height:"12px", accentColor:"#6366f1" }} />
                        </label>
                      </div>
                      <div style={{ position:"relative" }}>
                        <input name={`item_altura_${i}`} className="fc" type="number" value={item.altura || ""} onChange={e => updItem(i, "altura", parseInt(e.target.value) || 0)} placeholder="0" style={{ paddingRight:"24px" }} />
                        <label style={{ position:"absolute", right:"6px", top:"50%", transform:"translateY(-50%)", cursor:"pointer" }}>
                          <input name={`item_ml_alt_${i}`} type="checkbox" checked={item.ml_alt} onChange={e => updItem(i, "ml_alt", e.target.checked)} style={{ width:"12px", height:"12px", accentColor:"#6366f1" }} />
                        </label>
                      </div>
                      <input name={`item_quantidade_${i}`} className="fc" type="number" value={item.quantidade} onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                      <CurrencyInput value={item.valor_m2} onChange={v => updItem(i, "valor_m2", v)} placeholder="R$/ml"
                        style={foraMarjem ? { border:"1px solid var(--err)", color:"var(--err)" } : undefined} />
                      <CurrencyInput value={ml > 0 && item.valor_m2 > 0 ? parseFloat(sub.toFixed(2)) : 0} onChange={v => updTotalItem(i, v)} placeholder="total" />
                      <button className="btn bw xs" onClick={() => remItem(i)} disabled={itens.length === 1}>✕</button>
                      {checkboxVC}
                    </div>
                    {(item.largura > 0 || item.altura > 0) && (
                      <div style={{ display:"flex", gap:"14px", padding:"4px 0 0 4px", flexWrap:"wrap" }}>
                        <span style={{ fontSize:"11px", color:"#818cf8", fontFamily:"'DM Mono',monospace" }}>{ml.toFixed(3)} ml</span>
                        {sub > 0 && <span style={{ fontSize:"11px", color:"var(--acc)", fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{formatBRL(sub)}</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:colsM2, gap:"6px", alignItems:"center" }}>
                      <AutocompleteInput options={produtoOpts} value={item.produto_id} valueLabel={item.produto_nome} allowFreeText={item.vidro_cliente} onChange={(id, label) => setProdutoItem(i, id, label)} placeholder={item.vidro_cliente ? "Buscar ou digitar produto do cliente..." : "Buscar produto..."} />
                      <input name={`item_largura_${i}`} className="fc" type="number" value={item.largura || ""} onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)} placeholder="0" />
                      <input name={`item_altura_${i}`} className="fc" type="number" value={item.altura  || ""} onChange={e => updItem(i, "altura",  parseInt(e.target.value) || 0)} placeholder="0" />
                      <input name={`item_quantidade_${i}`} className="fc" type="number" value={item.quantidade} onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                      <CurrencyInput value={item.valor_m2} onChange={v => updItem(i, "valor_m2", v)} placeholder="R$/m²"
                        title={item.margem_prod > 0 ? `Base: ${formatBRL(item.preco_base)}/m² · Margem ±${item.margem_prod}%` : "Valor por m²"}
                        style={foraMarjem ? { border:"1px solid var(--err)", color:"var(--err)" } : undefined} />
                      <CurrencyInput value={m2 > 0 && item.valor_m2 > 0 ? parseFloat(unitVal.toFixed(2)) : 0} onChange={v => updUnitItem(i, v)} placeholder="por peça" />
                      <CurrencyInput value={m2 > 0 && item.valor_m2 > 0 ? parseFloat(sub.toFixed(2)) : 0} onChange={v => updTotalItem(i, v)} placeholder="total" />
                      <button className="btn bw xs" onClick={() => remItem(i)} disabled={itens.length === 1}>✕</button>
                      {checkboxVC}
                    </div>
                    {m2 > 0 && (
                      <div style={{ display:"flex", gap:"14px", padding:"4px 0 0 4px", flexWrap:"wrap" }}>
                        <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{formatM2(m2)}</span>
                        <span style={{ fontSize:"11px", color:"var(--acc)", fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{formatBRL(sub)}</span>
                        {mostrarArred && <span style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", opacity:0.7 }}>cobrado: {lArred}×{aArred}</span>}
                      </div>
                    )}
                    {foraMarjem && (
                      <div style={{ fontSize:"11px", color:"var(--err)", fontFamily:"'DM Mono',monospace", padding:"3px 4px", marginTop:"2px" }}>
                        ⚠ Preço {foraAbaixo ? `abaixo — mínimo ${formatBRL(margemMin!)}/m²` : `acima — máximo ${formatBRL(margemMax!)}/m²`} (±{item.margem_prod}%)
                      </div>
                    )}
                    <div style={{ display:"flex", alignItems:"center", gap:"6px", marginTop:"4px", paddingLeft:"2px" }}>
                      <span style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>Código</span>
                      <input name={`item_codigo_adicional_${i}`}
                        className="fc"
                        type="text"
                        value={item.codigo_adicional}
                        onChange={e => updItem(i, "codigo_adicional", e.target.value)}
                        placeholder="—"
                        style={{ width:"120px", fontSize:"11px", padding:"2px 6px", height:"22px", fontFamily:"'DM Mono',monospace" }}
                      />
                      {item.codigo_adicional && (
                        <span style={{ fontSize:"10px", color:"var(--acc2)", fontFamily:"'DM Mono',monospace" }}>{item.codigo_adicional}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Distribuir total */}
          <div style={{ marginTop:"14px", padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)", display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
            <span style={{ fontSize:"11px", color:"var(--t2)", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>Distribuir total do pedido:</span>
            <CurrencyInput value={totalPedidoInput} onChange={setTotalPedidoInput} placeholder="Ex: R$ 850,00" style={{ width:"140px", margin:0 }} />
            <button className="btn bp sm" onClick={() => aplicarTotalPedido(totalPedidoInput)} disabled={totalPedidoInput <= 0 || m2Total === 0}>↵ Aplicar</button>
            <span style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>distribui proporcionalmente ao {isMl ? "ml" : "m²"} de cada item</span>
          </div>

          <div style={{ marginTop:"8px", padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)", display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
            <span style={{ fontSize:"11px", color:"var(--t2)", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>Aplicar preço único a todos os itens:</span>
            <CurrencyInput value={valorGeralInput} onChange={setValorGeralInput} placeholder={isMl ? "Ex: R$ 15,00/ml" : "Ex: R$ 80,00/m²"} style={{ width:"140px", margin:0 }} />
            <button className="btn bp sm" onClick={() => aplicarValorGeral(valorGeralInput)} disabled={valorGeralInput <= 0}>↵ Aplicar</button>
            <span style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>define o mesmo R$/{isMl ? "ml" : "m²"} em todas as linhas — útil quando você não sabe o total, só o preço unitário</span>
          </div>

          {/* Totbar */}
          <div className="totbar" style={{ marginTop:"8px" }}>
            <div className="ti"><div className="tl">Itens</div><div className="tv">{itens.length}</div></div>
            <div className="ti"><div className="tl">m² Total</div><div className="tv" style={{ color:"var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            {isMl && <div className="ti"><div className="tl">ML Total</div><div className="tv" style={{ color:"#818cf8" }}>{itens.reduce((a, i) => a + calcMLItem(i), 0).toFixed(3)} ml</div></div>}
            {algumVC && <div className="ti"><div className="tl">Vidro Cliente</div><div className="tv" style={{ color:"var(--warn)" }}>{itens.filter(i => i.vidro_cliente).length} item(s)</div></div>}
            <div className="ti"><div className="tl">Valor Total</div><div className="tv" style={{ color:"var(--acc)" }}>{formatBRL(valorComIpiCalc)}</div></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
