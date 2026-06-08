"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { getClientes } from "@/services/clientes.service";
import { createOrcamento, getProximoIdOrcamento } from "@/services/orcamentos.service";
import { formatBRL, formatM2 } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import type { Cliente, Produto, TabelaPreco } from "@/types";

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

export default function NovoOrcamentoPage() {
  const router = useRouter();

  const [clientes, setClientes]   = useState<Cliente[]>([]);
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [tabelas, setTabelas]     = useState<TabelaPreco[]>([]);
  const [proximoId, setProximoId] = useState("");

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
  const [salvando, setSalvando]       = useState(false);
  const [totalPedidoInput, setTotalPedidoInput] = useState(0);

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
    const [clis, prods, tabs, pid] = await Promise.all([
      getClientes(true),
      supabase.from("produtos").select("*").eq("ativo", true).then(r => r.data as Produto[]),
      supabase.from("tabelas_preco").select("*").eq("ativo", true).then(r => r.data as TabelaPreco[]),
      getProximoIdOrcamento(),
    ]);
    setClientes(clis || []);
    setProdutos(prods || []);
    setTabelas(tabs || []);
    setProximoId(pid);
    setItens([{ ...ITEM_VAZIO }]);
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

  function addItemAposLinha(i: number) {
    const atual = itens[i];
    const novo: ItemForm = {
      ...ITEM_VAZIO,
      produto_id: atual.produto_id,
      produto_nome: atual.produto_nome,
      valor_m2: atual.valor_m2,
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
    };
    focarLinha.current = itens.length;
    setItens(i => [...i, novo]);
  }

  function remItem(i: number) { setItens(items => items.filter((_, idx) => idx !== i)); }

  function calcM2Item(item: ItemForm): number {
    const l = arredondarParaMultiplo50(item.largura);
    const a = arredondarParaMultiplo50(item.altura);
    return (l / 1000) * (a / 1000) * item.quantidade;
  }

  function calcSubtotal(item: ItemForm): number {
    return calcM2Item(item) * (item.valor_m2 + item.lapidacao);
  }

  function updProduto(i: number, id: number, label: string) {
    const prod = produtos.find(p => p.id === id);
    setItens(items => items.map((item, idx) => idx !== i ? item : {
      ...item,
      produto_id: id,
      produto_nome: label,
      valor_m2: prod?.valor ?? item.valor_m2,
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

  const m2Total       = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const subtotalBruto = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const valorDesconto = subtotalBruto * (desconto / 100);
  const valorTotal    = subtotalBruto - valorDesconto;

  const clienteOptions = clientes.map(c => ({
    id: c.id,
    label: c.nome,
    sub: c.cidade || undefined,
  }));

  const produtoOptions = produtos.map(p => ({ id: p.id, label: p.nome }));

  async function salvar() {
    if (!clienteId) { alert("Selecione um cliente"); return; }
    if (itens.some(i => !i.produto_id)) { alert("Selecione o produto em todos os itens"); return; }
    if (itens.some(i => i.largura === 0 || i.altura === 0)) { alert("Preencha as dimensões de todos os itens"); return; }

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
      forma_pgto: formaPgto,
      conta, parcelas, frete, obs,
      m2_total: m2Total,
      valor_total: valorTotal,
      desconto,
      status: "Rascunho",
    }, itensInsert);

    setSalvando(false);
    if (result) router.push("/orcamentos");
  }

  const tab = getTabela();

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

            <div className="fg" style={{ marginBottom: "10px" }}>
              <label className="fl">Cliente *</label>
              <AutocompleteInput
                options={clienteOptions}
                value={clienteId}
                onChange={(id) => setClienteId(id)}
                placeholder="Digite o nome do cliente..."
                tabIndex={-1}
              />
            </div>

            {clienteId && tab && (
              <div className="al al-i" style={{ marginBottom: "10px" }}>
                Tabela: <strong>{tab.nome}</strong> · Laminado: {formatBRL(tab.lam)}/m²
              </div>
            )}

            <div className="fr">
              <div className="fg"><label className="fl">Data do Orçamento</label><DateInput value={dtOrcamento} onChange={setDtOrcamento} /></div>
              <div className="fg"><label className="fl">Validade do Orçamento</label><DateInput value={dtValidade} onChange={setDtValidade} /></div>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Previsão de Entrega</label><DateInput value={dtEntrega} onChange={setDtEntrega} /></div>
              <div className="fg">
                <label className="fl">Frete</label>
                <select tabIndex={-1} className="fc" value={frete} onChange={e => setFrete(e.target.value)}>
                  {["Retirada","CIF","FOB"].map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">Forma de Pagamento</label>
                <select tabIndex={-1} className="fc" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                  <option value="">Selecione...</option>
                  {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Conta</label>
                <select tabIndex={-1} className="fc" value={conta} onChange={e => setConta(e.target.value)}>
                  <option value="">Selecione...</option>
                  {["ZRS","Itaú","Bradesco","Nubank","Caixa Econômica","Santander"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">Parcelas</label>
                <select tabIndex={-1} className="fc" value={parcelas} onChange={e => setParcelas(Number(e.target.value))}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Desconto Global (%)</label>
                <input tabIndex={-1} className="fc" type="number" min="0" max="100" step="0.5" value={desconto || ""} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} placeholder="0" />
              </div>
            </div>
            <div className="fg">
              <label className="fl">Observações</label>
              <textarea tabIndex={-1} className="fc" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações do orçamento..." />
            </div>
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
          </div>
        </div>

        <div className="card">
          <div className="ct">
            Itens do Orçamento
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>
                Enter avança · Enter em Qtd cria nova linha
              </span>
              <button tabIndex={-1} className="btn bp sm" onClick={addItem}>+ Item</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 50px 90px 90px 90px 36px", gap: "6px", padding: "6px 0", borderBottom: "1px solid var(--b1)", marginBottom: "8px" }}>
            {["Produto","Larg.","Alt.","Qtd","R$/m²","Unit.(R$)","Total(R$)",""].map((h, idx) => (
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

            return (
              <div key={i} style={{ marginBottom: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 50px 90px 90px 90px 36px", gap: "6px", alignItems: "center" }}>
                  <AutocompleteInput
                    options={produtoOptions}
                    value={item.produto_id}
                    onChange={(id, label) => updProduto(i, id, label)}
                    placeholder="Buscar produto..."
                    tabIndex={i * 4 + 1}
                  />
                  <input
                    className="fc"
                    type="number"
                    ref={el => { largRefs.current[i] = el; }}
                    value={item.largura || ""}
                    onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); altRefs.current[i]?.focus(); } }}
                    tabIndex={i * 4 + 2}
                    placeholder="0"
                  />
                  <input
                    className="fc"
                    type="number"
                    ref={el => { altRefs.current[i] = el; }}
                    value={item.altura || ""}
                    onChange={e => updItem(i, "altura", parseInt(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); qtdRefs.current[i]?.focus(); } }}
                    tabIndex={i * 4 + 3}
                    placeholder="0"
                  />
                  <input
                    className="fc"
                    type="number"
                    ref={el => { qtdRefs.current[i] = el; }}
                    value={item.quantidade}
                    onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItemAposLinha(i); } }}
                    tabIndex={i * 4 + 4}
                    min={1}
                  />
                  <CurrencyInput tabIndex={-1} value={item.valor_m2} onChange={v => updItem(i, "valor_m2", v)} placeholder="R$/m²" title="Valor por m²" />
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

          <div className="totbar" style={{ marginTop: "8px" }}>
            <div className="ti"><div className="tl">Itens</div><div className="tv">{itens.length}</div></div>
            <div className="ti"><div className="tl">m² Total</div><div className="tv" style={{ color: "var(--acc2)" }}>{formatM2(m2Total)}</div></div>
            <div className="ti"><div className="tl">Subtotal</div><div className="tv">{formatBRL(subtotalBruto)}</div></div>
            {desconto > 0 && <div className="ti"><div className="tl">Desconto</div><div className="tv" style={{ color: "var(--err)" }}>− {formatBRL(valorDesconto)}</div></div>}
            <div className="ti"><div className="tl">Total</div><div className="tv" style={{ color: "var(--acc)" }}>{formatBRL(valorTotal)}</div></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}