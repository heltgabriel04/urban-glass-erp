"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { getClientes } from "@/services/clientes.service";
import { createPedido, getProximoIdPedido } from "@/services/pedidos.service";
import { criarLancamentosParcelados } from "@/services/financeiro.service";
import { formatBRL, formatM2 } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import type { Cliente, Produto, TabelaPreco, TabelaPrecoItem, ItemPedidoInsert, PedidoInsert, Vendedor } from "@/types";

type ModoPedido = "m2" | "ml";

interface ItemForm {
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
}

interface ParcelaForm {
  data: string;
  valor: number;
  editado: boolean;
}

const ITEM_VAZIO: ItemForm = {
  produto_id: null, produto_nome: "",
  largura: 0, altura: 0, quantidade: 1,
  valor_m2: 0, lapidacao: 0,
  ml_larg: true, ml_alt: true,
  vidro_cliente: false,
  preco_base: 0, margem_prod: 0,
};

const CHAPAS_DIMS = [
  { w: 3300, h: 2250 }, { w: 2250, h: 3300 },
  { w: 3660, h: 2140 }, { w: 2140, h: 3660 },
  { w: 2150, h: 3660 }, { w: 3660, h: 2150 },
];

function isChapaInteira(largura: number, altura: number): boolean {
  return CHAPAS_DIMS.some(c =>
    Math.abs(largura - c.w) < 50 && Math.abs(altura - c.h) < 50
  );
}

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
  // Finds the last free parcel to absorb the centavo rounding diff
  let lastFreeIdx = -1;
  for (let i = parcelas.length - 1; i >= 0; i--) {
    if (!parcelas[i].editado || i === idxEditado) { lastFreeIdx = i; break; }
  }
  return parcelas.map((p, i) => {
    if (p.editado && i !== idxEditado) return p;
    return { ...p, valor: i === lastFreeIdx ? parseFloat((valorBase + diff).toFixed(2)) : valorBase };
  });
}

export default function NovoPedidoPage() {
  const router = useRouter();

  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [produtos, setProdutos]       = useState<Produto[]>([]);
  const [tabelas, setTabelas]         = useState<TabelaPreco[]>([]);
  const [tabelaItens, setTabelaItens] = useState<TabelaPrecoItem[]>([]);
  const [vendedores, setVendedores]   = useState<Pick<Vendedor, "id" | "nome" | "comissao_pct">[]>([]);
  const [proximoId, setProximoId]     = useState("");

  const [clienteId, setClienteId]   = useState<number | null>(null);
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [dtPedido, setDtPedido]     = useState(new Date().toISOString().split("T")[0]);
  const [dtRetirada, setDtRetirada] = useState("");
  const [formaPgto, setFormaPgto]   = useState("");
  const [conta, setConta]           = useState("");
  const [parcelas, setParcelas]     = useState(1);
  const [obs, setObs]               = useState("");
  const [itens, setItens]           = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState(false);
  const [totalPedidoInput, setTotalPedidoInput] = useState(0);
  const [modoPedido, setModoPedido] = useState<ModoPedido>("m2");
  const [parcelasForm, setParcelasForm] = useState<ParcelaForm[]>([{ data: "", valor: 0, editado: false }]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [clis, prods, tabs, itens, pid, vends] = await Promise.all([
      getClientes(true),
      supabase.from("produtos").select("*").eq("ativo", true).then(r => r.data as Produto[]),
      supabase.from("tabelas_preco").select("*").eq("ativo", true).then(r => r.data as TabelaPreco[]),
      supabase.from("tabela_preco_itens").select("*").then(r => r.data as TabelaPrecoItem[] || []),
      getProximoIdPedido(),
      supabase.from("vendedores").select("id, nome, comissao_pct").eq("ativo", true).order("nome").then(r => r.data ?? []),
    ]);
    setClientes(clis || []);
    setProdutos(prods || []);
    setTabelas(tabs || []);
    setTabelaItens(itens || []);
    setVendedores(vends as Pick<Vendedor, "id" | "nome" | "comissao_pct">[]);
    setProximoId(pid);
    setItens([{ ...ITEM_VAZIO }]);
    setLoading(false);
  }

  useEffect(() => {
    if (!clienteId) return;
    const cli = clientes.find(c => c.id === clienteId);
    if (cli) setFormaPgto(cli.pgto || "");
  }, [clienteId, clientes]);

  const clienteOpts = clientes.map(c => ({ id: c.id, label: c.nome, sub: c.cidade ?? undefined }));
  const produtoOpts = produtos.map(p => ({ id: p.id, label: p.nome, sub: formatBRL(p.valor) + "/m²" }));

  function calcM2Item(item: ItemForm): number {
    const l = arredondarParaMultiplo50(item.largura);
    const a = arredondarParaMultiplo50(item.altura);
    return (l / 1000) * (a / 1000) * item.quantidade;
  }

  function calcMLItem(item: ItemForm): number {
    const l = item.largura / 1000;
    const a = item.altura  / 1000;
    return ((item.ml_larg ? l : 0) + (item.ml_alt ? a : 0)) * item.quantidade;
  }

  function calcSubtotal(item: ItemForm): number {
    if (modoPedido === "ml") return calcMLItem(item) * item.valor_m2;
    return calcM2Item(item) * item.valor_m2 + item.lapidacao * calcM2Item(item);
  }

  const m2Total    = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const valorTotal = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const todosVidroCliente = itens.length > 0 && itens.every(i => i.vidro_cliente);
  const algumVidroCliente = itens.some(i => i.vidro_cliente);

  useEffect(() => {
    setParcelasForm(prev => {
      const novaPrimeira = prev[0]?.data || "";
      const novas: ParcelaForm[] = Array.from({ length: parcelas }, (_, i) => ({
        data: novaPrimeira ? (i === 0 ? novaPrimeira : addMeses(novaPrimeira, i)) : "",
        valor: 0, editado: false,
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

  function getTabela(): TabelaPreco | null {
    if (!clienteId) return tabelas[0] || null;
    const cli = clientes.find(c => c.id === clienteId);
    if (!cli) return tabelas[0] || null;
    return tabelas.find(t => cli.tabela === "g" ? t.tipo === "Grandes Clientes" : t.tipo === "Padrão") || tabelas[0] || null;
  }

  function addItem() { setItens(i => [...i, { ...ITEM_VAZIO }]); }
  function remItem(i: number) { setItens(items => items.filter((_, idx) => idx !== i)); }

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
        } else {
          novo.produto_nome = "";
          novo.valor_m2     = 0;
          novo.preco_base   = 0;
          novo.margem_prod  = 0;
        }
      }
      return novo;
    }));
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

  function setProdutoItem(i: number, id: number, label: string) {
    const { valor, margem } = getPrecoProduto(id);
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      return {
        ...item,
        produto_id: id,
        produto_nome: label,
        valor_m2: valor,
        preco_base: valor,
        margem_prod: margem,
      };
    }));
  }

  function marcarTodosVidroCliente(valor: boolean) {
    setItens(items => items.map(item => ({ ...item, vidro_cliente: valor })));
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

  function handleModoPedido(modo: ModoPedido) {
    setModoPedido(modo);
    setItens(items => items.map(item => ({ ...item, valor_m2: 0 })));
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

  const somaParcelas = parcelasForm.reduce((a, p) => a + p.valor, 0);
  const difParcelas  = Math.abs(somaParcelas - valorTotal);
  const parcelasOk   = difParcelas < 0.02;

  async function salvar() {
    if (!clienteId) { alert("Selecione um cliente"); return; }
    if (itens.some(i => i.largura === 0 || i.altura === 0)) { alert("Preencha as dimensões de todos os itens"); return; }
    if (!parcelasOk) { alert(`Soma das parcelas (${formatBRL(somaParcelas)}) difere do total (${formatBRL(valorTotal)}). Ajuste os valores antes de salvar.`); return; }

    setSalvando(true);

    const todosChapa = itens.every(i => isChapaInteira(i.largura, i.altura));

    const pedido: PedidoInsert = {
      id: proximoId,
      cliente_id: clienteId,
      vendedor_id: vendedorId,
      dt_pedido: dtPedido,
      dt_retirada: dtRetirada || null,
      datas_pgto: parcelasForm.map(p => p.data).filter(d => d),
      valores_pgto: parcelasForm.map(p => p.valor),
      m2_total: m2Total,
      valor_total: valorTotal,
      valor_recebido: 0,
      status: todosChapa ? "Em Produção – Corte" : "Aguardando otimização",
      forma_pgto: formaPgto,
      conta, parcelas, obs,
    };

    const itensInsert: ItemPedidoInsert[] = itens.map(i => ({
      pedido_id: proximoId,
      produto_id: i.produto_id,
      produto_nome: i.produto_nome,
      largura: i.largura,
      altura: i.altura,
      m2: modoPedido === "ml" ? calcMLItem(i) : calcM2Item(i),
      valor_m2: i.valor_m2,
      lapidacao: i.lapidacao,
      quantidade: i.quantidade,
      subtotal: calcSubtotal(i),
      vidro_cliente: i.vidro_cliente,
    }));

    const result = await createPedido(pedido, itensInsert);
    if (result) {
      await criarLancamentosParcelados({ pedidoId: proximoId, clienteId, parcelas: parcelasForm });
      if (vendedorId) {
        const vendedor = vendedores.find(v => v.id === vendedorId);
        const valorComissao = vendedor ? parseFloat((valorTotal * vendedor.comissao_pct / 100).toFixed(2)) : 0;
        if (vendedor && valorComissao > 0) {
          await supabase.from("lancamentos").insert([{
            tipo:        "Saída",
            descricao:   `Comissão — ${vendedor.nome} — Pedido ${proximoId}`,
            valor:        valorComissao,
            status:       "Pendente",
            vencimento:   parcelasForm[0]?.data || null,
            pedido_id:    proximoId,
            cliente_id:   null,
            vendedor_id:  vendedorId,
          } as never]);
        }
      }
      router.push("/pedidos");
    }
    setSalvando(false);
  }

  const tab  = getTabela();
  const isMl = modoPedido === "ml";

  const toggleBase: React.CSSProperties = { padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid var(--b2)", transition: "all 0.15s", fontFamily: "'DM Mono', monospace" };
  const toggleAtivo: React.CSSProperties   = { ...toggleBase, background: "var(--acc)", color: "#000", borderColor: "var(--acc)" };
  const toggleInativo: React.CSSProperties = { ...toggleBase, background: "transparent", color: "var(--t3)" };
  const colsM2 = "2fr 70px 70px 50px 90px 90px 90px 90px 36px";
  const colsMl = "2fr 90px 90px 50px 90px 90px 90px 36px";

  if (loading) return <AppLayout><div style={{ padding: "40px", textAlign: "center", color: "var(--t3)", fontSize: "13px" }}>Carregando...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Novo Pedido · {proximoId}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={() => router.push("/pedidos")}>Cancelar</button>
          <button className="btn bp sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "✓ Salvar Pedido"}</button>
        </div>
      </div>

      <div className="con">
        <div className="g2 mb14">
          <div className="card">
            <div className="ct">Dados do Pedido</div>

            <div className="fg" style={{ marginBottom: "10px" }}>
              <label className="fl">Cliente *</label>
              <AutocompleteInput options={clienteOpts} value={clienteId} onChange={(id) => setClienteId(id)} placeholder="Buscar cliente..." />
            </div>

            <div className="fg" style={{ marginBottom: "10px" }}>
              <label className="fl">Vendedor / Comissão</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select className="fc" style={{ flex: 1 }} value={vendedorId ?? ""} onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Sem vendedor —</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.comissao_pct}%)</option>)}
                </select>
                {vendedorId && (() => {
                  const vend = vendedores.find(v => v.id === vendedorId);
                  const val  = vend ? valorTotal * vend.comissao_pct / 100 : 0;
                  return val > 0 ? (
                    <span style={{ fontSize: "12px", color: "var(--warn)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
                      {vend!.comissao_pct}% = {val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {clienteId && tab && (
              <div className="al al-i" style={{ marginBottom: "10px" }}>
                Tabela: <strong>{tab.nome}</strong> · Laminado: {formatBRL(tab.lam)}/m² · Reflecta: {formatBRL(tab.ref)}/m²
              </div>
            )}

            <div className="fr">
              <div className="fg"><label className="fl">Data do Pedido</label><DateInput value={dtPedido} onChange={setDtPedido} /></div>
              <div className="fg"><label className="fl">Previsão Retirada</label><DateInput value={dtRetirada} onChange={setDtRetirada} /></div>
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">Forma de Pagamento</label>
                <select className="fc" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                  <option value="">Selecione...</option>
                  {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Conta</label>
                <select className="fc" value={conta} onChange={e => setConta(e.target.value)}>
                  <option value="">Selecione...</option>
                  {["ZRS","Itaú","Bradesco","Nubank","Caixa Econômica","Santander"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="fr">
              <div className="fg">
                <label className="fl">Parcelas</label>
                <select className="fc" value={parcelas} onChange={e => setParcelas(Number(e.target.value))}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: "10px", padding: "12px 14px", background: "var(--surf2)", borderRadius: "8px", border: "1px solid var(--b2)" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", marginBottom: "10px", textTransform: "uppercase" }}>
                {parcelas === 1 ? "Pagamento" : `Parcelas (${parcelas}x)`}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {parcelasForm.map((p, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: parcelas > 1 ? "60px 1fr 120px" : "1fr 120px", gap: "8px", alignItems: "center" }}>
                    {parcelas > 1 && <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>{idx + 1}ª</span>}
                    <DateInput value={p.data} onChange={v => idx === 0 ? handlePrimeiraDtPgto(v) : handleDtPgto(idx, v)} />
                    <CurrencyInput value={p.valor} onChange={v => handleValorParcela(idx, v)} placeholder="R$ 0,00" style={{ margin: 0 }} />
                  </div>
                ))}
              </div>
              {valorTotal > 0 && !parcelasOk && (
                <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--warn, #f59e0b)", fontFamily: "'DM Mono', monospace" }}>
                  ⚠ Soma das parcelas ({formatBRL(somaParcelas)}) difere do total ({formatBRL(valorTotal)})
                </div>
              )}
            </div>

            <div className="fg" style={{ marginTop: "10px" }}>
              <label className="fl">Observações</label>
              <textarea className="fc" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações do pedido..." />
            </div>
          </div>

          <div className="card">
            <div className="ct">Resumo do Pedido</div>
            <div className="sr"><div className="sl">ID do Pedido</div><div className="sv mono" style={{ color: "var(--acc)" }}>{proximoId}</div></div>
            <div className="sr"><div className="sl">Total de Itens</div><div className="sv">{itens.length}</div></div>
            <div className="sr"><div className="sl">m² Total</div><div className="sv" style={{ color: "var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            <div className="sr">
              <div className="sl">Cobrança</div>
              <div className="sv"><span className="chip" style={{ background: isMl ? "rgba(99,102,241,.2)" : "rgba(16,185,129,.2)", color: isMl ? "#818cf8" : "var(--acc)", border: "none" }}>{isMl ? "Metro Linear" : "Metro Quadrado"}</span></div>
            </div>
            {algumVidroCliente && (
              <div className="sr">
                <div className="sl">Vidro do Cliente</div>
                <div className="sv">
                  <span className="chip" style={{ background: "rgba(245,158,11,.15)", color: "var(--warn)", border: "1px solid rgba(245,158,11,.3)" }}>
                    {todosVidroCliente ? "Todos os itens" : `${itens.filter(i => i.vidro_cliente).length} de ${itens.length} itens`}
                  </span>
                </div>
              </div>
            )}
            <div className="sr"><div className="sl">Valor Total</div><div className="sv" style={{ color: "var(--acc)", fontSize: "18px" }}>{formatBRL(valorTotal)}</div></div>
            {parcelas > 1 && <div className="sr"><div className="sl">Por Parcela</div><div className="sv">{formatBRL(valorTotal / parcelas)}</div></div>}
            {clienteId && tab && tab.min > 0 && valorTotal < tab.min && (
              <div className="al al-w" style={{ marginTop: "10px" }}>⚠ Pedido abaixo do mínimo de {formatBRL(tab.min)}</div>
            )}
            <button className="btn bp" style={{ width: "100%", marginTop: "16px", padding: "12px" }} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : `✓ Salvar Pedido · ${formatBRL(valorTotal)}`}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="ct">
            Itens do Pedido
            <div style={{ display: "flex", gap: "4px", marginLeft: "auto", marginRight: "8px" }}>
              <button style={!isMl ? toggleAtivo : toggleInativo} onClick={() => handleModoPedido("m2")}>m²</button>
              <button style={isMl ? { ...toggleAtivo, background: "#6366f1", borderColor: "#6366f1" } : toggleInativo} onClick={() => handleModoPedido("ml")}>ml</button>
            </div>
            <button className="btn bp xs" onClick={addItem}>+ Item</button>
          </div>

          {isMl && (
            <div style={{ marginBottom: "10px", padding: "8px 12px", background: "rgba(99,102,241,.1)", borderRadius: "6px", border: "1px solid rgba(99,102,241,.3)", fontSize: "12px", color: "#818cf8", fontFamily: "'DM Mono', monospace" }}>
              Metro Linear · fórmula: (Larg_m × ☑ + Alt_m × ☑) × Qtd × R$/ml
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMl ? colsMl : colsM2, gap: "6px", padding: "6px 0", borderBottom: "1px solid var(--b1)", marginBottom: "8px", alignItems: "center" }}>
            {(isMl
              ? ["Produto","Larg. (mm)","Alt. (mm)","Qtd","R$/ml","Total(R$)",""]
              : ["Produto","Larg.","Alt.","Qtd","R$/m²","Unit.(R$)","Total(R$)",""]
            ).map((h, i) => (
              <div key={i} style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono',monospace" }}>{h}</div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <input
                type="checkbox"
                checked={todosVidroCliente}
                ref={el => { if (el) el.indeterminate = algumVidroCliente && !todosVidroCliente; }}
                onChange={e => marcarTodosVidroCliente(e.target.checked)}
                style={{ width: "12px", height: "12px", accentColor: "var(--warn)", cursor: "pointer" }}
                title="Marcar todos como vidro do cliente"
              />
              <span style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>V.Cliente</span>
            </div>
          </div>

          {itens.map((item, i) => {
            const m2     = calcM2Item(item);
            const ml     = calcMLItem(item);
            const sub    = calcSubtotal(item);
            const m2unit = (() => { const l = arredondarParaMultiplo50(item.largura); const a = arredondarParaMultiplo50(item.altura); return (l/1000)*(a/1000); })();
            const unitVal = m2unit > 0 ? item.valor_m2 * m2unit : 0;
            const lArred = arredondarParaMultiplo50(item.largura);
            const aArred = arredondarParaMultiplo50(item.altura);
            const mostrarArred = item.largura > 0 && item.altura > 0 && (lArred !== item.largura || aArred !== item.altura);

            const margemMin = item.preco_base > 0 && item.margem_prod > 0
              ? item.preco_base * (1 - item.margem_prod / 100) : null;
            const margemMax = item.preco_base > 0 && item.margem_prod > 0
              ? item.preco_base * (1 + item.margem_prod / 100) : null;
            const foraAbaixo = margemMin !== null && item.valor_m2 < margemMin - 0.005;
            const foraAcima  = margemMax !== null && item.valor_m2 > margemMax + 0.005;
            const foraMarjem = foraAbaixo || foraAcima;

            const checkboxVC = (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <input type="checkbox" checked={item.vidro_cliente} onChange={e => updItem(i, "vidro_cliente", e.target.checked)}
                  style={{ width: "14px", height: "14px", accentColor: "var(--warn)", cursor: "pointer" }} />
              </div>
            );

            const avisoMarjem = foraMarjem ? (
              <div style={{ fontSize: "11px", color: "var(--err)", fontFamily: "'DM Mono',monospace", padding: "3px 4px", marginTop: "2px" }}>
                ⚠ Preço {foraAbaixo
                  ? `abaixo da margem — mínimo ${formatBRL(margemMin!)}/m²`
                  : `acima da margem — máximo ${formatBRL(margemMax!)}/m²`
                } (±{item.margem_prod}%)
              </div>
            ) : null;

            return (
              <div key={i} style={{ marginBottom: "10px" }}>
                {item.vidro_cliente && (
                  <div style={{ fontSize: "10px", color: "var(--warn)", fontFamily: "'DM Mono',monospace", marginBottom: "3px", paddingLeft: "2px" }}>
                    📦 Vidro do cliente — não desconta estoque
                  </div>
                )}
                {isMl ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: colsMl, gap: "6px", alignItems: "center" }}>
                      <AutocompleteInput options={produtoOpts} value={item.produto_id} onChange={(id, label) => setProdutoItem(i, id, label)} placeholder="Buscar produto..." />
                      <div style={{ position: "relative" }}>
                        <input className="fc" type="number" value={item.largura || ""} onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)} placeholder="0" style={{ paddingRight: "24px" }} />
                        <label style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", cursor: "pointer" }}>
                          <input type="checkbox" checked={item.ml_larg} onChange={e => updItem(i, "ml_larg", e.target.checked)} style={{ width: "12px", height: "12px", accentColor: "#6366f1" }} />
                        </label>
                      </div>
                      <div style={{ position: "relative" }}>
                        <input className="fc" type="number" value={item.altura || ""} onChange={e => updItem(i, "altura", parseInt(e.target.value) || 0)} placeholder="0" style={{ paddingRight: "24px" }} />
                        <label style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", cursor: "pointer" }}>
                          <input type="checkbox" checked={item.ml_alt} onChange={e => updItem(i, "ml_alt", e.target.checked)} style={{ width: "12px", height: "12px", accentColor: "#6366f1" }} />
                        </label>
                      </div>
                      <input className="fc" type="number" value={item.quantidade} onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                      <CurrencyInput
                        value={item.valor_m2}
                        onChange={v => updItem(i, "valor_m2", v)}
                        placeholder="R$/ml"
                        style={foraMarjem ? { border: "1px solid var(--err)", color: "var(--err)" } : undefined}
                      />
                      <CurrencyInput value={ml > 0 && item.valor_m2 > 0 ? parseFloat(sub.toFixed(2)) : 0} onChange={v => updTotalItem(i, v)} placeholder="total" />
                      <button className="btn bw xs" onClick={() => remItem(i)} disabled={itens.length === 1}>✕</button>
                      {checkboxVC}
                    </div>
                    {(item.largura > 0 || item.altura > 0) && (
                      <div style={{ display: "flex", gap: "14px", padding: "4px 0 0 4px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "11px", color: "#818cf8", fontFamily: "'DM Mono',monospace" }}>{ml.toFixed(3)} ml</span>
                        {sub > 0 && <span style={{ fontSize: "11px", color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{formatBRL(sub)}</span>}
                      </div>
                    )}
                    {avisoMarjem}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: colsM2, gap: "6px", alignItems: "center" }}>
                      <AutocompleteInput options={produtoOpts} value={item.produto_id} onChange={(id, label) => setProdutoItem(i, id, label)} placeholder="Buscar produto..." />
                      <input className="fc" type="number" value={item.largura || ""} onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)} placeholder="0" />
                      <input className="fc" type="number" value={item.altura  || ""} onChange={e => updItem(i, "altura",  parseInt(e.target.value) || 0)} placeholder="0" />
                      <input className="fc" type="number" value={item.quantidade} onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                      <CurrencyInput
                        value={item.valor_m2}
                        onChange={v => updItem(i, "valor_m2", v)}
                        placeholder="R$/m²"
                        title={item.margem_prod > 0 ? `Base: ${formatBRL(item.preco_base)}/m² · Margem ±${item.margem_prod}%` : "Valor por m²"}
                        style={foraMarjem ? { border: "1px solid var(--err)", color: "var(--err)" } : undefined}
                      />
                      <CurrencyInput value={m2 > 0 && item.valor_m2 > 0 ? parseFloat(unitVal.toFixed(2)) : 0} onChange={v => updUnitItem(i, v)} placeholder="por peça" />
                      <CurrencyInput value={m2 > 0 && item.valor_m2 > 0 ? parseFloat(sub.toFixed(2)) : 0} onChange={v => updTotalItem(i, v)} placeholder="total" />
                      <button className="btn bw xs" onClick={() => remItem(i)} disabled={itens.length === 1}>✕</button>
                      {checkboxVC}
                    </div>
                    {m2 > 0 && (
                      <div style={{ display: "flex", gap: "14px", padding: "4px 0 0 4px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{formatM2(m2)}</span>
                        <span style={{ fontSize: "11px", color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{formatBRL(sub)}</span>
                        {mostrarArred && <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", opacity: 0.7 }}>cobrado: {lArred}×{aArred}</span>}
                      </div>
                    )}
                    {avisoMarjem}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ marginTop: "14px", padding: "12px 14px", background: "var(--surf2)", borderRadius: "8px", border: "1px solid var(--b2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>Distribuir total do pedido:</span>
            <CurrencyInput value={totalPedidoInput} onChange={setTotalPedidoInput} placeholder="Ex: R$ 850,00" style={{ width: "140px", margin: 0 }} />
            <button className="btn bp sm" onClick={() => aplicarTotalPedido(totalPedidoInput)} disabled={totalPedidoInput <= 0 || m2Total === 0}>↵ Aplicar</button>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>distribui proporcionalmente ao {isMl ? "ml" : "m²"} de cada item</span>
          </div>

          <div className="totbar" style={{ marginTop: "8px" }}>
            <div className="ti"><div className="tl">Itens</div><div className="tv">{itens.length}</div></div>
            <div className="ti"><div className="tl">m² Total</div><div className="tv" style={{ color: "var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            {isMl && <div className="ti"><div className="tl">ML Total</div><div className="tv" style={{ color: "#818cf8" }}>{itens.reduce((a, i) => a + calcMLItem(i), 0).toFixed(3)} ml</div></div>}
            {algumVidroCliente && <div className="ti"><div className="tl">Vidro Cliente</div><div className="tv" style={{ color: "var(--warn)" }}>{itens.filter(i => i.vidro_cliente).length} item(s)</div></div>}
            <div className="ti"><div className="tl">Valor Total</div><div className="tv" style={{ color: "var(--acc)" }}>{formatBRL(valorTotal)}</div></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}