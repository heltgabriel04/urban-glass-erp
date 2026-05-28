"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { getClientes } from "@/services/clientes.service";
import { createOrcamento, getProximoIdOrcamento } from "@/services/orcamentos.service";
import { formatBRL, formatM2 } from "@/lib/formatters";
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

export default function NovoOrcamentoPage() {
  const router = useRouter();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [tabelas, setTabelas] = useState<TabelaPreco[]>([]);
  const [proximoId, setProximoId] = useState("");

  const [clienteId, setClienteId] = useState<number | "">("");
  const [dtOrcamento, setDtOrcamento] = useState(new Date().toISOString().split("T")[0]);
  const [dtValidade, setDtValidade] = useState("");
  const [dtEntrega, setDtEntrega] = useState("");
  const [formaPgto, setFormaPgto] = useState("");
  const [conta, setConta] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [frete, setFrete] = useState("Retirada");
  const [obs, setObs] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [itens, setItens] = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, []);

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
    setItens(i => [...i, {
      ...ITEM_VAZIO,
      produto_id: prod?.id || null,
      produto_nome: prod?.nome || "",
      valor_m2: prod?.valor || 0,
    }]);
  }

  function remItem(i: number) {
    setItens(items => items.filter((_, idx) => idx !== i));
  }

  function updItem(i: number, field: keyof ItemForm, value: string | number) {
    setItens(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const novo = { ...item, [field]: value };
      if (field === "produto_id") {
        const prod = produtos.find(p => p.id === Number(value));
        if (prod) {
          novo.produto_nome = prod.nome;
          novo.valor_m2 = prod.valor;
        }
      }
      return novo;
    }));
  }

  function calcM2Item(item: ItemForm): number {
    return (item.largura / 1000) * (item.altura / 1000) * item.quantidade;
  }

  function calcSubtotal(item: ItemForm): number {
    const m2 = calcM2Item(item);
    return m2 * item.valor_m2 + item.lapidacao * m2;
  }

  const m2Total = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const subtotalBruto = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const valorDesconto = subtotalBruto * (desconto / 100);
  const valorTotal = subtotalBruto - valorDesconto;

  async function salvar() {
    if (!clienteId) { alert("Selecione um cliente"); return; }
    if (itens.some(i => i.largura === 0 || i.altura === 0)) {
      alert("Preencha as dimensões de todos os itens");
      return;
    }

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
      cliente_id: clienteId as number,
      dt_orcamento: dtOrcamento,
      dt_validade: dtValidade || null,
      dt_entrega: dtEntrega || null,
      forma_pgto: formaPgto,
      conta,
      parcelas,
      frete,
      obs,
      m2_total: m2Total,
      valor_total: valorTotal,
      desconto,
      status: "Rascunho",
    }, itensInsert);

    setSalvando(false);

    if (result) {
      router.push("/orcamentos");
    }
  }

  const tab = getTabela();

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Novo Orçamento · {proximoId}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={() => router.push("/orcamentos")}>Cancelar</button>
          <button className="btn bp sm" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "✓ Salvar Orçamento"}
          </button>
        </div>
      </div>

      <div className="con">
        <div className="g2 mb14">
          {/* Dados do orçamento */}
          <div className="card">
            <div className="ct">Dados do Orçamento</div>

            <div className="fg" style={{ marginBottom: "10px" }}>
              <label className="fl">Cliente *</label>
              <select className="fc" value={clienteId} onChange={e => setClienteId(Number(e.target.value) || "")}>
                <option value="">Selecione o cliente...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {clienteId && tab && (
              <div className="al al-i" style={{ marginBottom: "10px" }}>
                Tabela: <strong>{tab.nome}</strong> · Laminado: {formatBRL(tab.lam)}/m²
              </div>
            )}

            <div className="fr">
              <div className="fg">
                <label className="fl">Data do Orçamento</label>
                <input className="fc" type="date" value={dtOrcamento} onChange={e => setDtOrcamento(e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl">Validade do Orçamento</label>
                <input className="fc" type="date" value={dtValidade} onChange={e => setDtValidade(e.target.value)} />
              </div>
            </div>

            <div className="fr">
              <div className="fg">
                <label className="fl">Previsão de Entrega</label>
                <input className="fc" type="date" value={dtEntrega} onChange={e => setDtEntrega(e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl">Frete</label>
                <select className="fc" value={frete} onChange={e => setFrete(e.target.value)}>
                  {["Retirada", "CIF", "FOB"].map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div className="fr">
              <div className="fg">
                <label className="fl">Forma de Pagamento</label>
                <select className="fc" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                  <option value="">Selecione...</option>
                  {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Conta</label>
                <select className="fc" value={conta} onChange={e => setConta(e.target.value)}>
                  <option value="">Selecione...</option>
                  {["ZRS","Itaú","Bradesco","Nubank","Caixa Econômica","Santander"].map(c => (
                    <option key={c}>{c}</option>
                  ))}
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
              <div className="fg">
                <label className="fl">Desconto Global (%)</label>
                <input
                  className="fc" type="number" min="0" max="100" step="0.5"
                  value={desconto || ""}
                  onChange={e => setDesconto(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="fg">
              <label className="fl">Observações</label>
              <textarea className="fc" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações do orçamento..." />
            </div>
          </div>

          {/* Resumo */}
          <div className="card">
            <div className="ct">Resumo do Orçamento</div>
            <div className="sr">
              <div className="sl">ID do Orçamento</div>
              <div className="sv mono" style={{ color: "var(--acc)" }}>{proximoId}</div>
            </div>
            <div className="sr">
              <div className="sl">Total de Itens</div>
              <div className="sv">{itens.length}</div>
            </div>
            <div className="sr">
              <div className="sl">m² Total</div>
              <div className="sv" style={{ color: "var(--acc2)" }}>{formatM2(m2Total)}</div>
            </div>
            <div className="sr">
              <div className="sl">Subtotal</div>
              <div className="sv">{formatBRL(subtotalBruto)}</div>
            </div>
            {desconto > 0 && (
              <div className="sr">
                <div className="sl">Desconto ({desconto}%)</div>
                <div className="sv" style={{ color: "var(--err)" }}>− {formatBRL(valorDesconto)}</div>
              </div>
            )}
            <div className="sr">
              <div className="sl">Valor Total</div>
              <div className="sv" style={{ color: "var(--acc)", fontSize: "18px" }}>{formatBRL(valorTotal)}</div>
            </div>
            {parcelas > 1 && (
              <div className="sr">
                <div className="sl">Por Parcela</div>
                <div className="sv">{formatBRL(valorTotal / parcelas)}</div>
              </div>
            )}
            <button
              className="btn bp"
              style={{ width: "100%", marginTop: "16px", padding: "12px" }}
              onClick={salvar}
              disabled={salvando}
            >
              {salvando ? "Salvando..." : `✓ Salvar · ${formatBRL(valorTotal)}`}
            </button>
          </div>
        </div>

        {/* Itens */}
        <div className="card">
          <div className="ct">
            Itens do Orçamento
            <button className="btn bp xs" onClick={addItem}>+ Item</button>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 80px 80px 60px 100px 100px 80px",
            gap: "8px",
            padding: "6px 0",
            borderBottom: "1px solid var(--b1)",
            marginBottom: "8px",
          }}>
            {["Produto","Larg. (mm)","Alt. (mm)","Qtd","Valor/m²","Lap./m²",""].map((h, i) => (
              <div key={i} style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono',monospace" }}>
                {h}
              </div>
            ))}
          </div>

          {itens.map((item, i) => {
            const m2 = calcM2Item(item);
            const sub = calcSubtotal(item);
            return (
              <div key={i} style={{ marginBottom: "10px" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 80px 80px 60px 100px 100px 80px",
                  gap: "8px",
                  alignItems: "center",
                }}>
                  <select
                    className="fc"
                    value={item.produto_id || ""}
                    onChange={e => updItem(i, "produto_id", Number(e.target.value))}
                  >
                    {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <input className="fc" type="number" value={item.largura || ""} onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)} placeholder="0" />
                  <input className="fc" type="number" value={item.altura || ""} onChange={e => updItem(i, "altura", parseInt(e.target.value) || 0)} placeholder="0" />
                  <input className="fc" type="number" value={item.quantidade} onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                  <input className="fc" type="number" step="0.01" value={item.valor_m2} onChange={e => updItem(i, "valor_m2", parseFloat(e.target.value) || 0)} />
                  <input className="fc" type="number" step="0.01" value={item.lapidacao || ""} onChange={e => updItem(i, "lapidacao", parseFloat(e.target.value) || 0)} placeholder="0" />
                  <button className="btn bw xs" onClick={() => remItem(i)} disabled={itens.length === 1}>✕</button>
                </div>
                {m2 > 0 && (
                  <div style={{ display: "flex", gap: "16px", padding: "4px 0 0 4px" }}>
                    <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{formatM2(m2)} ·</span>
                    <span style={{ fontSize: "11px", color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{formatBRL(sub)}</span>
                  </div>
                )}
              </div>
            );
          })}

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