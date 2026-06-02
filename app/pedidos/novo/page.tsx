"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { getClientes } from "@/services/clientes.service";
import { createPedido, getProximoIdPedido } from "@/services/pedidos.service";
import { formatBRL, formatM2 } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import type { Cliente, Produto, TabelaPreco, ItemPedidoInsert, PedidoInsert } from "@/types";

interface ItemForm {
  produto_id: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  quantidade: number;
  valor_m2: number;
  lapidacao: number;
}

const ITEM_VAZIO: ItemForm = {
  produto_id: null, produto_nome: "",
  largura: 0, altura: 0, quantidade: 1,
  valor_m2: 0, lapidacao: 0,
};

function arredondarParaMultiplo50(v: number): number {
  if (v % 50 === 0) return v;
  return Math.ceil(v / 50) * 50;
}

export default function NovoPedidoPage() {
  const router = useRouter();

  const [clientes, setClientes]   = useState<Cliente[]>([]);
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [tabelas, setTabelas]     = useState<TabelaPreco[]>([]);
  const [proximoId, setProximoId] = useState("");

  const [clienteId, setClienteId]   = useState<number | "">("");
  const [dtPedido, setDtPedido]     = useState(new Date().toISOString().split("T")[0]);
  const [dtRetirada, setDtRetirada] = useState("");
  const [formaPgto, setFormaPgto]   = useState("");
  const [conta, setConta]           = useState("");
  const [parcelas, setParcelas]     = useState(1);
  const [obs, setObs]               = useState("");
  const [itens, setItens]           = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);
  const [salvando, setSalvando]     = useState(false);
  const [totalPedidoInput, setTotalPedidoInput] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const [clis, prods, tabs, pid] = await Promise.all([
      getClientes(true),
      supabase.from("produtos").select("*").eq("ativo", true).then(r => r.data as Produto[]),
      supabase.from("tabelas_preco").select("*").eq("ativo", true).then(r => r.data as TabelaPreco[]),
      getProximoIdPedido(),
    ]);
    setClientes(clis || []);
    setProdutos(prods || []);
    setTabelas(tabs || []);
    setProximoId(pid);
    if (prods && prods.length > 0) {
      setItens([{ ...ITEM_VAZIO, produto_id: prods[0].id, produto_nome: prods[0].nome, valor_m2: prods[0].valor }]);
    }
  }

  useEffect(() => {
    if (!clienteId) return;
    const cli = clientes.find(c => c.id === clienteId);
    if (cli) setFormaPgto(cli.pgto || "");
  }, [clienteId, clientes]);

  function getTabela(): TabelaPreco | null {
    if (!clienteId) return tabelas[0] || null;
    const cli = clientes.find(c => c.id === clienteId);
    if (!cli) return tabelas[0] || null;
    return tabelas.find(t => cli.tabela === "g" ? t.tipo === "Grandes Clientes" : t.tipo === "Padrão") || tabelas[0] || null;
  }

  function addItem() {
    const prod = produtos[0];
    setItens(i => [...i, { ...ITEM_VAZIO, produto_id: prod?.id || null, produto_nome: prod?.nome || "", valor_m2: prod?.valor || 0 }]);
  }

  function remItem(i: number) {
    setItens(items => items.filter((_, idx) => idx !== i));
  }

  function calcM2Item(item: ItemForm): number {
    const l = arredondarParaMultiplo50(item.largura);
    const a = arredondarParaMultiplo50(item.altura);
    return (l / 1000) * (a / 1000) * item.quantidade;
  }

  function calcSubtotal(item: ItemForm): number {
    return calcM2Item(item) * item.valor_m2 + item.lapidacao * calcM2Item(item);
  }

  function updItem(i: number, field: keyof ItemForm, value: string | number) {
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const novo = { ...item, [field]: value };
      if (field === "produto_id") {
        const prod = produtos.find(p => p.id === Number(value));
        if (prod) { novo.produto_nome = prod.nome; novo.valor_m2 = prod.valor; }
      }
      return novo;
    }));
  }

  function updTotalItem(i: number, totalStr: string) {
    const total = parseFloat(totalStr) || 0;
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const m2 = calcM2Item(item);
      return { ...item, valor_m2: m2 > 0 ? parseFloat((total / m2).toFixed(4)) : 0 };
    }));
  }

  function updUnitItem(i: number, unitStr: string) {
    const unit = parseFloat(unitStr) || 0;
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const l = arredondarParaMultiplo50(item.largura);
      const a = arredondarParaMultiplo50(item.altura);
      const m2unit = (l / 1000) * (a / 1000);
      return { ...item, valor_m2: m2unit > 0 ? parseFloat((unit / m2unit).toFixed(4)) : 0 };
    }));
  }

  // Modo 4 — Total geral → distribui proporcionalmente por m²
  function aplicarTotalPedido(totalStr: string) {
    const total = parseFloat(totalStr) || 0;
    if (total <= 0) return;
    const m2Tot = itens.reduce((a, i) => a + calcM2Item(i), 0);
    if (m2Tot <= 0) return;
    const valorM2Geral = total / m2Tot;
    setItens(items => items.map(item => ({
      ...item,
      valor_m2: parseFloat(valorM2Geral.toFixed(4)),
    })));
    setTotalPedidoInput("");
  }

  const m2Total    = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const valorTotal = itens.reduce((a, i) => a + calcSubtotal(i), 0);

  async function salvar() {
    if (!clienteId) { alert("Selecione um cliente"); return; }
    if (itens.some(i => i.largura === 0 || i.altura === 0)) { alert("Preencha as dimensões de todos os itens"); return; }

    setSalvando(true);

    const pedido: PedidoInsert = {
      id: proximoId,
      cliente_id: clienteId as number,
      dt_pedido: dtPedido,
      dt_retirada: dtRetirada || null,
      m2_total: m2Total,
      valor_total: valorTotal,
      valor_recebido: 0,
      status: "Aguardando otimização",
      forma_pgto: formaPgto,
      conta, parcelas, obs,
    };

    const itensInsert: ItemPedidoInsert[] = itens.map(i => ({
      pedido_id: proximoId,
      produto_id: i.produto_id,
      produto_nome: i.produto_nome,
      largura: i.largura,
      altura: i.altura,
      m2: calcM2Item(i),
      valor_m2: i.valor_m2,
      lapidacao: i.lapidacao,
      quantidade: i.quantidade,
      subtotal: calcSubtotal(i),
    }));

    const result = await createPedido(pedido, itensInsert);
    setSalvando(false);
    if (result) router.push("/pedidos");
  }

  const tab = getTabela();

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Novo Pedido · {proximoId}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={() => router.push("/pedidos")}>Cancelar</button>
          <button className="btn bp sm" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "✓ Salvar Pedido"}
          </button>
        </div>
      </div>

      <div className="con">
        <div className="g2 mb14">
          <div className="card">
            <div className="ct">Dados do Pedido</div>

            <div className="fg" style={{ marginBottom: "10px" }}>
              <label className="fl">Cliente *</label>
              <select className="fc" value={clienteId} onChange={e => setClienteId(Number(e.target.value) || "")}>
                <option value="">Selecione o cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
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
            <div className="fg">
              <label className="fl">Observações</label>
              <textarea className="fc" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações do pedido..." />
            </div>
          </div>

          <div className="card">
            <div className="ct">Resumo do Pedido</div>
            <div className="sr"><div className="sl">ID do Pedido</div><div className="sv mono" style={{ color: "var(--acc)" }}>{proximoId}</div></div>
            <div className="sr"><div className="sl">Total de Itens</div><div className="sv">{itens.length}</div></div>
            <div className="sr"><div className="sl">m² Total</div><div className="sv" style={{ color: "var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            <div className="sr"><div className="sl">Valor Total</div><div className="sv" style={{ color: "var(--acc)", fontSize: "18px" }}>{formatBRL(valorTotal)}</div></div>
            {parcelas > 1 && (
              <div className="sr"><div className="sl">Por Parcela</div><div className="sv">{formatBRL(valorTotal / parcelas)}</div></div>
            )}
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
            <button className="btn bp xs" onClick={addItem}>+ Item</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 50px 90px 90px 90px 90px 36px", gap: "6px", padding: "6px 0", borderBottom: "1px solid var(--b1)", marginBottom: "8px" }}>
            {["Produto","Larg.","Alt.","Qtd","R$/m²","Unit.(R$)","Total(R$)","Lap./m²",""].map((h, i) => (
              <div key={i} style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono',monospace" }}>{h}</div>
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

            return (
              <div key={i} style={{ marginBottom: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 50px 90px 90px 90px 90px 36px", gap: "6px", alignItems: "center" }}>
                  <select className="fc" value={item.produto_id || ""} onChange={e => updItem(i, "produto_id", Number(e.target.value))}>
                    {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <input className="fc" type="number" value={item.largura || ""} onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)} placeholder="0" />
                  <input className="fc" type="number" value={item.altura  || ""} onChange={e => updItem(i, "altura",  parseInt(e.target.value) || 0)} placeholder="0" />
                  <input className="fc" type="number" value={item.quantidade} onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                  <input className="fc" type="number" step="0.01" value={item.valor_m2 || ""} onChange={e => updItem(i, "valor_m2", parseFloat(e.target.value) || 0)} placeholder="R$/m²" title="Valor por m²" />
                  <input className="fc" type="number" step="0.01" value={m2 > 0 && item.valor_m2 > 0 ? parseFloat(unitVal.toFixed(2)) : ""} onChange={e => updUnitItem(i, e.target.value)} placeholder="por peça" title="Valor por peça" />
                  <input className="fc" type="number" step="0.01" value={m2 > 0 && item.valor_m2 > 0 ? parseFloat(sub.toFixed(2)) : ""} onChange={e => updTotalItem(i, e.target.value)} placeholder="total" title="Total do item" />
                  <input className="fc" type="number" step="0.01" value={item.lapidacao || ""} onChange={e => updItem(i, "lapidacao", parseFloat(e.target.value) || 0)} placeholder="0" title="Lapidação por m²" />
                  <button className="btn bw xs" onClick={() => remItem(i)} disabled={itens.length === 1}>✕</button>
                </div>
                {m2 > 0 && (
                  <div style={{ display: "flex", gap: "14px", padding: "4px 0 0 4px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{formatM2(m2)}</span>
                    <span style={{ fontSize: "11px", color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{formatBRL(sub)}</span>
                    {mostrarArred && (
                      <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", opacity: 0.7 }}>cobrado: {lArred}×{aArred}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Total geral do pedido ── */}
          <div style={{ marginTop: "14px", padding: "12px 14px", background: "var(--surf2)", borderRadius: "8px", border: "1px solid var(--b2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
              Distribuir total do pedido:
            </span>
            <input
              className="fc"
              type="number"
              step="0.01"
              value={totalPedidoInput}
              onChange={e => setTotalPedidoInput(e.target.value)}
              placeholder="Ex: 850,00"
              style={{ width: "140px", margin: 0 }}
              title="Digite o valor total e pressione Enter para distribuir proporcionalmente entre os itens"
              onKeyDown={e => { if (e.key === "Enter") aplicarTotalPedido(totalPedidoInput); }}
            />
            <button
              className="btn bp sm"
              onClick={() => aplicarTotalPedido(totalPedidoInput)}
              disabled={!totalPedidoInput || m2Total === 0}
            >
              ↵ Aplicar
            </button>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>
              distribui proporcionalmente ao m² de cada item
            </span>
          </div>

          <div className="totbar" style={{ marginTop: "8px" }}>
            <div className="ti"><div className="tl">Itens</div><div className="tv">{itens.length}</div></div>
            <div className="ti"><div className="tl">m² Total</div><div className="tv" style={{ color: "var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            <div className="ti"><div className="tl">Valor Total</div><div className="tv" style={{ color: "var(--acc)" }}>{formatBRL(valorTotal)}</div></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}