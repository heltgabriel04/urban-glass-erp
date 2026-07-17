"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { getClientes } from "@/services/clientes.service";
import { getOrcamentoById, updateOrcamento } from "@/services/orcamentos.service";
import { formatBRL, formatM2 } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { Campo } from "@/components/ui/Campo";
import { useToast } from "@/components/ui/toast";
import type { Cliente, Produto, TabelaPreco, TabelaPrecoItem } from "@/types";

interface ItemForm {
  id?: number;
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

export default function EditarOrcamentoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [produtos, setProdutos]       = useState<Produto[]>([]);
  const [tabelas, setTabelas]         = useState<TabelaPreco[]>([]);
  const [tabelaItens, setTabelaItens] = useState<TabelaPrecoItem[]>([]);

  const [clienteId, setClienteId]     = useState<number | null>(null);
  const [dtOrcamento, setDtOrcamento] = useState("");
  const [dtValidade, setDtValidade]   = useState("");
  const [dtEntrega, setDtEntrega]     = useState("");
  const [formaPgto, setFormaPgto]     = useState("");
  const [conta, setConta]             = useState("");
  const [parcelas, setParcelas]       = useState(1);
  const [frete, setFrete]             = useState("Retirada");
  const [obs, setObs]                 = useState("");
  const [desconto, setDesconto]       = useState(0);
  const [itens, setItens]             = useState<ItemForm[]>([]);
  const [itensDeletados, setItensDeletados] = useState<number[]>([]);
  const [totalOrcamentoInput, setTotalOrcamentoInput] = useState(0);
  const [valorGeralInput, setValorGeralInput] = useState(0);

  const [loading, setLoading]   = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [orc, clis, prods, tabs, tabItens] = await Promise.all([
      getOrcamentoById(id),
      getClientes(true),
      supabase.from("produtos").select("*").eq("ativo", true).then(r => r.data as Produto[] ?? []),
      supabase.from("tabelas_preco").select("*").eq("ativo", true).then(r => r.data as TabelaPreco[] ?? []),
      supabase.from("tabela_preco_itens").select("*").then(r => r.data as TabelaPrecoItem[] ?? []),
    ]);

    if (!orc) { toast("Orçamento não encontrado", "err"); router.back(); return; }

    setClientes(clis ?? []);
    setProdutos(prods);
    setTabelas(tabs);
    setTabelaItens(tabItens);

    setClienteId(orc.cliente_id);
    setDtOrcamento(orc.dt_orcamento ?? "");
    setDtValidade(orc.dt_validade ?? "");
    setDtEntrega(orc.dt_entrega ?? "");
    setFormaPgto(orc.forma_pgto ?? "");
    setConta(orc.conta ?? "");
    setParcelas(orc.parcelas ?? 1);
    setFrete(orc.frete ?? "Retirada");
    setObs(orc.obs ?? "");
    setDesconto(orc.desconto ?? 0);

    const rawItens = (orc.itens_orcamento ?? []) as any[];
    setItens(rawItens.map(i => ({
      id:           i.id,
      produto_id:   i.produto_id,
      produto_nome: i.produto_nome,
      largura:      i.largura,
      altura:       i.altura,
      quantidade:   i.quantidade,
      valor_m2:     Number(i.valor_m2),
      lapidacao:    Number(i.lapidacao ?? 0),
      preco_base:   Number(i.valor_m2),
      margem_prod:  0,
    })));
    setItensDeletados([]);

    setLoading(false);
  }

  // ── cálculos ─────────────────────────────────────────────────────

  function calcM2Item(item: ItemForm): number {
    const l = arredondarParaMultiplo50(item.largura);
    const a = arredondarParaMultiplo50(item.altura);
    return (l / 1000) * (a / 1000) * item.quantidade;
  }

  function calcSubtotal(item: ItemForm): number {
    return calcM2Item(item) * (item.valor_m2 + item.lapidacao);
  }

  const m2Total       = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const subtotalBruto = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const valorDesconto = subtotalBruto * (desconto / 100);
  const valorTotal    = subtotalBruto - valorDesconto;

  // ── tabela de preços ─────────────────────────────────────────────

  function getTabela(): TabelaPreco | null {
    if (!clienteId) return tabelas[0] || null;
    const cli = clientes.find(c => c.id === clienteId);
    if (!cli) return tabelas[0] || null;
    return tabelas.find(t => cli.tabela === "g" ? t.tipo === "Grandes Clientes" : t.tipo === "Padrão") || tabelas[0] || null;
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

  function addItem() {
    const ultimo = itens[itens.length - 1];
    setItens(i => [...i, {
      ...ITEM_VAZIO,
      produto_id: ultimo?.produto_id ?? null,
      produto_nome: ultimo?.produto_nome ?? "",
      valor_m2: ultimo?.valor_m2 ?? 0,
      preco_base: ultimo?.preco_base ?? 0,
      margem_prod: ultimo?.margem_prod ?? 0,
    }]);
  }

  function remItem(i: number) {
    const item = itens[i];
    if (item.id) setItensDeletados(d => [...d, item.id!]);
    setItens(items => items.filter((_, idx) => idx !== i));
  }

  function updProduto(i: number, id: number | null, label: string) {
    if (id === null) return; // orçamento não tem vidro do cliente — produto sempre vem do catálogo
    const { valor, margem } = getPrecoProduto(id);
    setItens(items => items.map((item, idx) => idx !== i ? item : {
      ...item, produto_id: id, produto_nome: label, valor_m2: valor, preco_base: valor, margem_prod: margem,
    }));
  }

  function updItem(i: number, field: keyof ItemForm, value: string | number) {
    setItens(items => items.map((item, idx) => idx !== i ? item : { ...item, [field]: value }));
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

  function aplicarTotalOrcamento(total: number) {
    if (total <= 0) return;
    const m2Tot = itens.reduce((a, i) => a + calcM2Item(i), 0);
    if (m2Tot <= 0) return;
    const valorM2Geral = total / m2Tot;
    setItens(items => items.map(item => ({ ...item, valor_m2: parseFloat(valorM2Geral.toFixed(4)) })));
    setTotalOrcamentoInput(0);
  }

  function aplicarValorGeral(valor: number) {
    if (valor <= 0) return;
    setItens(items => items.map(item => ({ ...item, valor_m2: valor })));
    setValorGeralInput(0);
  }

  // ── salvar ───────────────────────────────────────────────────────

  async function salvar() {
    if (!clienteId) { toast("Selecione um cliente", "err"); return; }
    if (itens.some(i => !i.produto_id)) { toast("Selecione o produto em todos os itens", "err"); return; }
    if (itens.some(i => i.largura === 0 || i.altura === 0)) { toast("Preencha as dimensões de todos os itens", "err"); return; }

    setSalvando(true);

    const result = await updateOrcamento(id, {
      cliente_id:   clienteId,
      dt_orcamento: dtOrcamento,
      dt_validade:  dtValidade || null,
      dt_entrega:   dtEntrega || null,
      forma_pgto:   formaPgto,
      conta,
      parcelas,
      frete,
      obs,
      desconto,
      m2_total:     parseFloat(m2Total.toFixed(4)),
      valor_total:  parseFloat(valorTotal.toFixed(2)),
    });

    if (!result) { toast("Erro ao salvar orçamento", "err"); setSalvando(false); return; }

    if (itensDeletados.length > 0) {
      await supabase.from("itens_orcamento").delete().in("id", itensDeletados);
    }

    const itensNovos: Record<string, unknown>[] = [];
    const itensExistentes: Record<string, unknown>[] = [];
    for (const item of itens) {
      const payload = {
        produto_id: item.produto_id, produto_nome: item.produto_nome,
        largura: item.largura, altura: item.altura,
        quantidade: item.quantidade, valor_m2: item.valor_m2,
        lapidacao: item.lapidacao, desconto: 0,
        m2: parseFloat(calcM2Item(item).toFixed(4)),
        subtotal: parseFloat(calcSubtotal(item).toFixed(2)),
      };
      if (item.id) itensExistentes.push({ id: item.id, ...payload });
      else itensNovos.push({ ...payload, orcamento_id: id });
    }
    if (itensNovos.length > 0) await supabase.from("itens_orcamento").insert(itensNovos as never);
    if (itensExistentes.length > 0) await supabase.from("itens_orcamento").upsert(itensExistentes as never);

    toast("Orçamento atualizado");
    router.push(`/orcamentos/${id}`);
  }

  // ── render ───────────────────────────────────────────────────────

  if (loading) return <AppLayout><div style={{ padding: "40px", textAlign: "center", color: "var(--t3)", fontSize: "13px" }}>Carregando orçamento...</div></AppLayout>;

  const tab = getTabela();
  const clienteOptions = clientes.map(c => ({ id: c.id, label: c.nome, sub: c.cidade || undefined }));
  const produtoOptions = produtos.map(p => ({ id: p.id, label: p.nome }));

  return (
    <AppLayout>
      <div className="tb">
        <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
        <div className="tb-title" style={{ flex: 1 }}>Editar Orçamento · <span style={{ color: "var(--acc)" }}>{id}</span></div>
        <button className="btn bg sm" onClick={() => router.back()}>Cancelar</button>
        <button className="btn bp sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "✓ Salvar Alterações"}</button>
      </div>

      <div className="con">
        <div className="g2 mb14">
          <div className="card">
            <div className="ct">Dados do Orçamento</div>

            <Campo style={{ marginBottom: "10px" }} label="Cliente *">
              <AutocompleteInput options={clienteOptions} value={clienteId} onChange={id => setClienteId(id)} placeholder="Digite o nome do cliente..." />
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
                <select name="parcelas" className="fc" value={parcelas} onChange={e => setParcelas(Number(e.target.value))}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </Campo>
              <Campo label="Desconto (%)">
                <input name="desconto" className="fc" type="number" min="0" max="100" step="0.5" value={desconto || ""} onChange={e => setDesconto(parseFloat(e.target.value) || 0)} placeholder="0" />
              </Campo>
            </div>

            <Campo style={{ marginTop: "10px" }} label="Observações">
              <textarea name="obs" className="fc" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações do orçamento..." />
            </Campo>
          </div>

          <div className="card">
            <div className="ct">Resumo do Orçamento</div>
            <div className="sr"><div className="sl">ID do Orçamento</div><div className="sv mono" style={{ color: "var(--acc)" }}>{id}</div></div>
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
            <button className="btn bp" style={{ width:"100%", marginTop:"16px", padding:"12px" }} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : `✓ Salvar Alterações · ${formatBRL(valorTotal)}`}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="ct">
            Itens do Orçamento
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button className="btn bp sm" onClick={addItem}>+ Item</button>
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
            const lArred  = arredondarParaMultiplo50(item.largura);
            const aArred  = arredondarParaMultiplo50(item.altura);
            const m2unit  = (lArred / 1000) * (aArred / 1000);
            const unitVal = m2unit > 0 ? item.valor_m2 * m2unit : 0;
            const mostrarArred = item.largura > 0 && item.altura > 0 && (lArred !== item.largura || aArred !== item.altura);

            const margemMin = item.preco_base > 0 && item.margem_prod > 0 ? item.preco_base * (1 - item.margem_prod / 100) : null;
            const margemMax = item.preco_base > 0 && item.margem_prod > 0 ? item.preco_base * (1 + item.margem_prod / 100) : null;
            const foraAbaixo = margemMin !== null && item.valor_m2 < margemMin - 0.005;
            const foraAcima  = margemMax !== null && item.valor_m2 > margemMax + 0.005;
            const foraMarjem = foraAbaixo || foraAcima;

            return (
              <div key={i} style={{ marginBottom: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 90px 90px 90px 90px 110px 90px 36px", gap: "6px", alignItems: "center" }}>
                  <AutocompleteInput options={produtoOptions} value={item.produto_id} onChange={(id, label) => updProduto(i, id, label)} placeholder="Buscar produto..." />
                  <input name={`item_largura_${i}`} className="fc" type="number" value={item.largura || ""} onChange={e => updItem(i, "largura", parseInt(e.target.value) || 0)} placeholder="0" />
                  <input name={`item_altura_${i}`} className="fc" type="number" value={item.altura  || ""} onChange={e => updItem(i, "altura",  parseInt(e.target.value) || 0)} placeholder="0" />
                  <input name={`item_quantidade_${i}`} className="fc" type="number" value={item.quantidade} onChange={e => updItem(i, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                  <CurrencyInput value={item.valor_m2} onChange={v => updItem(i, "valor_m2", v)} placeholder="R$/m²"
                    title={item.margem_prod > 0 ? `Base: ${formatBRL(item.preco_base)}/m² · Margem ±${item.margem_prod}%` : "Valor por m²"}
                    style={foraMarjem ? { border: "1px solid var(--err)", color: "var(--err)" } : undefined} />
                  <CurrencyInput value={m2 > 0 ? parseFloat(unitVal.toFixed(2)) : 0} onChange={v => updUnitItem(i, v)} placeholder="por peça" />
                  <CurrencyInput value={m2 > 0 ? parseFloat(sub.toFixed(2)) : 0} onChange={v => updTotalItem(i, v)} placeholder="total" />
                  <button className="btn bw xs" onClick={() => remItem(i)} disabled={itens.length === 1}>✕</button>
                </div>
                {m2 > 0 && (
                  <div style={{ display: "flex", gap: "14px", padding: "4px 0 0 4px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{formatM2(m2)}</span>
                    <span style={{ fontSize: "11px", color: "var(--acc)", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{formatBRL(sub)}</span>
                    {mostrarArred && (
                      <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", opacity: 0.7 }}>cobrado: {lArred}×{aArred}</span>
                    )}
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
              Distribuir total do orçamento:
            </span>
            <CurrencyInput value={totalOrcamentoInput} onChange={setTotalOrcamentoInput} placeholder="Ex: R$ 850,00" style={{ width: "140px", margin: 0 }} />
            <button className="btn bp sm" onClick={() => aplicarTotalOrcamento(totalOrcamentoInput)} disabled={totalOrcamentoInput <= 0 || m2Total === 0}>↵ Aplicar</button>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>distribui proporcionalmente ao m² de cada item</span>
          </div>

          <div style={{ marginTop: "8px", padding: "12px 14px", background: "var(--surf2)", borderRadius: "8px", border: "1px solid var(--b2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
              Aplicar preço único a todos os itens:
            </span>
            <CurrencyInput value={valorGeralInput} onChange={setValorGeralInput} placeholder="Ex: R$ 80,00/m²" style={{ width: "140px", margin: 0 }} />
            <button className="btn bp sm" onClick={() => aplicarValorGeral(valorGeralInput)} disabled={valorGeralInput <= 0}>↵ Aplicar</button>
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
    </AppLayout>
  );
}
