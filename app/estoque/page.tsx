"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatM2 } from "@/lib/formatters";
import { registrarMovimentacao } from "@/services/estoqueMovimentacoes.service";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { EstoqueItem, Produto } from "@/types";

const MEDIDAS_PADRAO = [
  { label: "2600 × 2000 — 5,20 m²", larg: 2600, alt: 2000 },
  { label: "3000 × 2100 — 6,30 m²", larg: 3000, alt: 2100 },
  { label: "3210 × 2250 — 7,22 m²", larg: 3210, alt: 2250 },
  { label: "3300 × 2140 — 7,06 m²", larg: 3300, alt: 2140 },
  { label: "Personalizado",           larg: 0,    alt: 0    },
];

interface FormState {
  produto_id: string;
  chapas: string;
  larg_chapa: string;
  alt_chapa: string;
  custo_m2: number;
}

const FORM_VAZIO: FormState = { produto_id: "", chapas: "", larg_chapa: "", alt_chapa: "", custo_m2: 0 };

export default function EstoquePage() {
  const [estoque, setEstoque]   = useState<EstoqueItem[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [comprometidoPorProduto, setComprometidoPorProduto] = useState<Record<number, number>>({});
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm]         = useState<FormState>(FORM_VAZIO);
  const [medidaPadrao, setMedidaPadrao] = useState("");

  // Edição
  const [editItem, setEditItem]         = useState<EstoqueItem | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => { load(); }, []);

  // Reconciliação: a baixa por otimização já é aplicada automaticamente ao salvar
  // o plano de corte (ver app/otimizador/page.tsx). Esta função existe só para
  // cobrir casos em que isso falhou (ex.: erro de rede) — é idempotente via
  // registrarMovimentacao, então rodar de novo não duplica nenhuma baixa.
  async function handleSincronizarBaixas() {
    setSincronizando(true);

    const { data: historico, error } = await supabase
      .from("historico_otimizador")
      .select("id, pedido_id, chapas_json, created_at")
      .order("created_at", { ascending: true });

    if (error || !historico) {
      alert("Erro ao buscar histórico: " + (error?.message ?? "Desconhecido"));
      setSincronizando(false);
      return;
    }

    // Usa o registro mais recente de cada pedido — é o plano de corte vigente.
    const ultimoPorPedido = new Map<string, { chapas_json: any }>();
    for (const rec of historico) {
      if (!rec.pedido_id) continue;
      ultimoPorPedido.set(rec.pedido_id, rec);
    }

    let aplicados = 0, jaOk = 0, falhas = 0;
    const erros: string[] = [];

    for (const [pedidoId, rec] of ultimoPorPedido.entries()) {
      const chapas = rec.chapas_json as Array<{ prod: string; W: number; H: number; retalhoId?: string | null }> | null;
      if (!chapas) continue;

      const consumoPorProd = new Map<string, { chapas: number; m2: number }>();
      for (const chapa of chapas) {
        if (!chapa?.prod || chapa.retalhoId) continue;
        const prev = consumoPorProd.get(chapa.prod) ?? { chapas: 0, m2: 0 };
        consumoPorProd.set(chapa.prod, {
          chapas: prev.chapas + 1,
          m2: parseFloat((prev.m2 + (chapa.W * chapa.H) / 1e6).toFixed(4)),
        });
      }

      for (const [prodNome, consumo] of consumoPorProd.entries()) {
        const res = await registrarMovimentacao({
          produtoNome: prodNome,
          tipo: "saida_producao", origemTipo: "otimizacao", origemId: pedidoId,
          chapas: -consumo.chapas, m2: -consumo.m2,
        });
        if (res.jaExistia) jaOk++;
        else if (res.ok) aplicados++;
        else { falhas++; erros.push(`${pedidoId} / ${prodNome}: ${res.motivo}`); }
      }
    }

    setSincronizando(false);
    load();

    let msg = `Reconciliação concluída.\n${aplicados} movimentação(ões) aplicada(s) agora.\n${jaOk} já estavam em dia (nada feito).`;
    if (falhas > 0) msg += `\n\n${falhas} falha(s):\n${erros.join("\n")}`;
    alert(msg);
  }

  async function load() {
    setLoading(true);
    const [{ data: est }, { data: prod }, { data: comprometido }] = await Promise.all([
      supabase.from("estoque").select("*, produtos(nome, tipo, espessura, cor, cod, chapas_por_colar)").order("id"),
      supabase.from("produtos").select("*").eq("ativo", true).order("nome"),
      supabase.from("vw_estoque_comprometido").select("produto_id, m2_comprometido"),
    ]);
    setEstoque(est as EstoqueItem[] || []);
    setProdutos(prod as Produto[] || []);
    const mapaComprometido: Record<number, number> = {};
    (comprometido ?? []).forEach((c: { produto_id: number; m2_comprometido: number }) => {
      mapaComprometido[c.produto_id] = Number(c.m2_comprometido) || 0;
    });
    setComprometidoPorProduto(mapaComprometido);
    setLoading(false);
  }

  const prodSelecionado = produtos.find(p => String(p.id) === form.produto_id) || null;
  const itemExistente   = !editItem ? estoque.find(e => String(e.produto_id) === form.produto_id) || null : null;

  const chapasNum  = parseInt(form.chapas || "0");
  const largMm     = parseFloat(form.larg_chapa || "0");
  const altMm      = parseFloat(form.alt_chapa  || "0");
  const m2PorChapa = largMm > 0 && altMm > 0 ? parseFloat(((largMm / 1000) * (altMm / 1000)).toFixed(4)) : 0;
  const custoM2    = form.custo_m2;
  const m2Preview  = chapasNum > 0 && m2PorChapa > 0 ? parseFloat((chapasNum * m2PorChapa).toFixed(4)) : 0;

  function handleMedidaPadrao(label: string) {
    setMedidaPadrao(label);
    const found = MEDIDAS_PADRAO.find(m => m.label === label);
    if (!found || found.larg === 0) return;
    setForm(f => ({ ...f, larg_chapa: String(found.larg), alt_chapa: String(found.alt) }));
  }

  function handleProduto(pid: string) {
    const item = estoque.find(es => String(es.produto_id) === pid);
    setForm(f => ({ ...f, produto_id: pid, chapas: "", custo_m2: item ? Number(item.custo_m2) : 0 }));
  }

  function resetForm() {
    setForm(FORM_VAZIO);
    setMedidaPadrao("");
    setEditItem(null);
  }

  function abrirNovo() {
    resetForm();
    setShowForm(true);
  }

  function abrirEditar(item: EstoqueItem) {
    // Tenta reconstruir largura/altura a partir do m2_por_chapa — usa campo direto se disponível
    // Deixa o usuário corrigir as dimensões manualmente
    setEditItem(item);
    setForm({
      produto_id: String(item.produto_id),
      chapas:     String(item.chapas_saldo),
      larg_chapa: "",
      alt_chapa:  "",
      custo_m2:   Number(item.custo_m2),
    });
    setMedidaPadrao("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluir(item: EstoqueItem) {
    const nome = item.produtos?.nome ?? item.cod;
    if (!confirm(`Excluir "${nome}" do estoque permanentemente? Esta ação não pode ser desfeita.`)) return;
    await supabase.from("estoque").delete().eq("id", item.id);
    load();
  }

  async function handleEntrada() {
    if (!editItem && !form.produto_id) { alert("Selecione o produto."); return; }
    if (chapasNum <= 0)  { alert("Informe a quantidade de chapas."); return; }

    // Na edição, m²/chapa pode vir do campo ou do item existente
    const m2ChapFinal = m2PorChapa > 0 ? m2PorChapa : (editItem ? Number(editItem.m2_por_chapa) : 0);
    if (m2ChapFinal <= 0) { alert("Informe as medidas da chapa."); return; }

    const m2Final = parseFloat((chapasNum * m2ChapFinal).toFixed(4));

    setSalvando(true);

    if (editItem) {
      // Edição: substitui os valores do item pelo que o usuário digitou
      const novoCusto = custoM2 > 0 ? custoM2 : Number(editItem.custo_m2);
      const { error } = await supabase.from("estoque").update({
        chapas_entrada: chapasNum,
        m2_entrada:     m2Final,
        chapas_saldo:   chapasNum,
        m2_saldo:       m2Final,
        m2_por_chapa:   m2ChapFinal,
        custo_m2:       novoCusto,
        updated_at:     new Date().toISOString(),
      }).eq("id", editItem.id);

      if (error) { alert("Erro: " + error.message); setSalvando(false); return; }

    } else if (itemExistente) {
      // Totais acumulados (entrada bruta histórica) são só estatística — não
      // fazem parte do livro-razão. Saldo e custo médio ponderado vêm de lá.
      const { error } = await supabase.from("estoque").update({
        chapas_entrada: Number(itemExistente.chapas_entrada) + chapasNum,
        m2_entrada:     parseFloat((Number(itemExistente.m2_entrada) + m2Final).toFixed(4)),
        m2_por_chapa:   m2ChapFinal,
      }).eq("id", itemExistente.id);

      if (error) { alert("Erro: " + error.message); setSalvando(false); return; }

      const res = await registrarMovimentacao({
        produtoId: itemExistente.produto_id, tipo: "entrada_compra", origemTipo: "manual",
        chapas: chapasNum, m2: m2Final, custoUnitarioM2: custoM2 > 0 ? custoM2 : null,
      });
      if (!res.ok) { alert("Erro ao registrar entrada no livro-razão: " + res.motivo); setSalvando(false); return; }

    } else {
      if (!prodSelecionado) { setSalvando(false); return; }
      const { data: novoItem, error } = await supabase.from("estoque").insert([{
        produto_id: prodSelecionado.id, cod: prodSelecionado.cod,
        chapas_entrada: chapasNum, m2_entrada: m2Final,
        m2_consumido: 0, m2_saldo: 0, chapas_saldo: 0,
        m2_por_chapa: m2ChapFinal, custo_m2: 0,
        updated_at: new Date().toISOString(),
      } as never]).select().single();

      if (error) { alert("Erro: " + error.message); setSalvando(false); return; }

      const res = await registrarMovimentacao({
        produtoId: prodSelecionado.id, tipo: "entrada_compra", origemTipo: "manual",
        chapas: chapasNum, m2: m2Final, custoUnitarioM2: custoM2 || 0,
      });
      if (!res.ok) {
        alert("Erro ao registrar entrada no livro-razão: " + res.motivo);
        await supabase.from("estoque").delete().eq("id", (novoItem as { id: number }).id);
        setSalvando(false); return;
      }
    }

    setSalvando(false);
    resetForm();
    setShowForm(false);
    load();
  }

  const m2Total        = estoque.reduce((a, e) => a + Number(e.m2_saldo), 0);
  const chapasTotal    = estoque.reduce((a, e) => a + Number(e.chapas_saldo), 0);
  const valorEstoque   = estoque.reduce((a, e) => a + Number(e.m2_saldo) * Number(e.custo_m2), 0);
  const m2Comprometido = Object.values(comprometidoPorProduto).reduce((a, v) => a + v, 0);
  const m2Disponivel   = m2Total - m2Comprometido;

  // Ruptura: saldo de chapas no nível ou abaixo do mínimo definido (mínimo > 0)
  function emRuptura(e: EstoqueItem): boolean {
    const min = Number(e.estoque_minimo_chapas ?? 0);
    return min > 0 && Number(e.chapas_saldo) <= min;
  }
  const emRupturaCount = estoque.filter(emRuptura).length;

  async function salvarMinimo(item: EstoqueItem, valor: number) {
    const v = Math.max(0, Math.floor(valor || 0));
    if (v === Number(item.estoque_minimo_chapas ?? 0)) return;
    const { error } = await supabase.from("estoque").update({ estoque_minimo_chapas: v } as never).eq("id", item.id);
    if (error) { alert("Erro ao salvar mínimo: " + error.message); return; }
    setEstoque(prev => prev.map(e => e.id === item.id ? { ...e, estoque_minimo_chapas: v } : e));
  }

  function nivelChip(pct: number) {
    if (pct >= 60) return <span className="chip cg">Alto</span>;
    if (pct >= 30) return <span className="chip cy">Médio</span>;
    return <span className="chip cr">Baixo</span>;
  }

  const inp: React.CSSProperties = {
    background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "6px",
    padding: "9px 12px", color: "var(--t1)", fontSize: "13px",
    fontFamily: "'Inter', sans-serif", outline: "none", width: "100%", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    fontSize: "11px", color: "var(--t3)", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px", display: "block",
  };
  const ro: React.CSSProperties = {
    ...inp, color: "var(--acc)", fontFamily: "'DM Mono', monospace",
    fontWeight: 600, background: "var(--surf3)", border: "1px solid var(--b1)", cursor: "default",
  };

  // Ordena: ruptura primeiro → depois por nível crescente (Baixo → Médio → Alto)
  const estoqueSorted = [...estoque].sort((a, b) => {
    const ra = emRuptura(a) ? 0 : 1;
    const rb = emRuptura(b) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const pa = Number(a.m2_entrada) > 0 ? (Number(a.m2_saldo) / Number(a.m2_entrada)) * 100 : 100;
    const pb = Number(b.m2_entrada) > 0 ? (Number(b.m2_saldo) / Number(b.m2_entrada)) * 100 : 100;
    return pa - pb;
  });

  const pctComprometido = m2Total > 0 ? Math.min(100, (m2Comprometido / m2Total) * 100) : 0;
  const itensRuptura    = estoque.filter(emRuptura);

  const inpMin: React.CSSProperties = {
    width: 48, padding: "3px 6px", fontSize: 11, textAlign: "center",
    background: "var(--surf3)", border: "1px solid var(--b2)",
    borderRadius: 5, color: "var(--t1)", fontFamily: "'DM Mono', monospace",
    outline: "none",
  };

  return (
    <AppLayout>
      {/* ── TOPBAR ── */}
      <div className="tb">
        <div>
          <div className="tb-title">Estoque · Chapas</div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>
            {estoque.length} produto{estoque.length !== 1 ? "s" : ""} cadastrado{estoque.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn bg sm" onClick={handleSincronizarBaixas} disabled={sincronizando}
            title="A baixa por otimização já é automática. Use apenas se suspeitar de pendências — é idempotente.">
            {sincronizando ? "↺ Reconciliando…" : "↺ Reconciliar"}
          </button>
          <button className="btn bp sm" onClick={() => { if (showForm) { setShowForm(false); resetForm(); } else abrirNovo(); }}>
            {showForm ? "✕ Cancelar" : "+ Entrada de Estoque"}
          </button>
        </div>
      </div>

      <div className="con">

        {/* ── FORMULÁRIO DE ENTRADA ── */}
        {showForm && (
          <div style={{ background: "var(--surf1)", border: "1px solid var(--b2)", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 16 }}>
              {editItem ? `✏ Editando — ${editItem.produtos?.nome ?? editItem.cod}` : "📦 Nova Entrada de Estoque"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Produto *</label>
                {editItem ? (
                  <div style={ro}>{editItem.produtos?.nome ?? editItem.cod}</div>
                ) : (
                  <select style={{ ...inp, cursor: "pointer" }} value={form.produto_id} onChange={e => handleProduto(e.target.value)}>
                    <option value="">Selecione o produto...</option>
                    {produtos.map(p => <option key={p.id} value={String(p.id)}>{p.cod} — {p.nome}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label style={lbl}>{editItem ? "Chapas (novo total) *" : "Quantidade de Chapas *"}</label>
                <input style={inp} type="number" min="1"
                  placeholder={editItem ? `Atual: ${editItem.chapas_saldo}` : "Ex: 10"}
                  value={form.chapas}
                  onChange={e => setForm(f => ({ ...f, chapas: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Medida Padrão</label>
              <select style={{ ...inp, cursor: "pointer" }} value={medidaPadrao} onChange={e => handleMedidaPadrao(e.target.value)}>
                <option value="">Selecione uma medida padrão ou preencha manualmente...</option>
                {MEDIDAS_PADRAO.map(m => <option key={m.label} value={m.label}>{m.label}</option>)}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Largura (mm) *</label>
                <input style={inp} type="number" placeholder="Ex: 3210"
                  value={form.larg_chapa}
                  onChange={e => { setMedidaPadrao("Personalizado"); setForm(f => ({ ...f, larg_chapa: e.target.value })); }}
                />
              </div>
              <div>
                <label style={lbl}>Altura (mm) *</label>
                <input style={inp} type="number" placeholder="Ex: 2250"
                  value={form.alt_chapa}
                  onChange={e => { setMedidaPadrao("Personalizado"); setForm(f => ({ ...f, alt_chapa: e.target.value })); }}
                />
              </div>
              <div>
                <label style={lbl}>m² / Chapa</label>
                <div style={ro}>
                  {m2PorChapa > 0
                    ? `${m2PorChapa.toFixed(4)} m²`
                    : editItem ? `${Number(editItem.m2_por_chapa).toFixed(4)} m² (atual)` : "—"}
                </div>
              </div>
              <div>
                <label style={lbl}>Custo por m² (R$)</label>
                <CurrencyInput style={inp} className="" value={form.custo_m2}
                  onChange={v => setForm(f => ({ ...f, custo_m2: v }))} />
              </div>
              <div>
                <label style={lbl}>m² Total</label>
                <div style={ro}>
                  {m2Preview > 0
                    ? formatM2(m2Preview)
                    : editItem && chapasNum > 0 ? formatM2(chapasNum * Number(editItem.m2_por_chapa)) : "—"}
                </div>
              </div>
            </div>

            {editItem && (
              <div style={{ display: "flex", gap: 20, padding: "10px 14px", background: "var(--surf2)", borderRadius: 8, fontSize: 12, color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>
                <span>Saldo atual: <strong style={{ color: "var(--acc)" }}>{formatM2(editItem.m2_saldo)}</strong></span>
                <span>Chapas: <strong style={{ color: "var(--t1)" }}>{editItem.chapas_saldo} un.</strong></span>
                <span style={{ color: "var(--warn)" }}>⚠ Edição substitui os valores atuais</span>
              </div>
            )}
            {!editItem && !itemExistente && prodSelecionado && (
              <div className="al al-i" style={{ marginBottom: 12, fontSize: 12 }}>Produto sem entrada — será criado automaticamente.</div>
            )}
            {!editItem && itemExistente && (
              <div style={{ display: "flex", gap: 20, padding: "10px 14px", background: "var(--surf2)", borderRadius: 8, fontSize: 12, color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>
                <span>Saldo atual: <strong style={{ color: "var(--acc)" }}>{formatM2(itemExistente.m2_saldo)}</strong></span>
                <span>Chapas: <strong style={{ color: "var(--t1)" }}>{itemExistente.chapas_saldo} un.</strong></span>
                {m2Preview > 0 && <span>Novo saldo: <strong style={{ color: "var(--ok)" }}>{formatM2(Number(itemExistente.m2_saldo) + m2Preview)}</strong></span>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn bg sm" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button>
              <button className="btn bp sm" onClick={handleEntrada} disabled={salvando}>
                {salvando ? "Salvando…" : editItem ? "Salvar Alterações" : "Registrar Entrada"}
              </button>
            </div>
          </div>
        )}

        {/* ── HERO BALANCE CARD ── */}
        <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: 20, padding: "28px 32px", marginBottom: 12 }}>
          {/* Linha principal: disponível (hero) + valor (secundário) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 10 }}>
                Saldo Disponível
              </div>
              <div style={{ fontSize: 40, fontWeight: 800, color: "var(--ok)", fontFamily: "'DM Mono', monospace", lineHeight: 1, letterSpacing: "-1.5px" }}>
                {formatM2(m2Disponivel)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 10 }}>
                Valor em Estoque
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                {formatBRL(valorEstoque)}
              </div>
            </div>
          </div>

          {/* Barra comprometido / disponível */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ height: 5, background: "var(--surf3)", borderRadius: 99, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${pctComprometido}%`, background: "var(--warn)", transition: "width .5s" }} />
              <div style={{ flex: 1, background: "var(--ok)", opacity: 0.35 }} />
            </div>
          </div>

          {/* Stats inline */}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {[
              { label: "Total",         value: formatM2(m2Total),         color: "var(--t1)" },
              { label: "Comprometido",  value: formatM2(m2Comprometido),  color: "var(--warn)" },
              { label: "Chapas",        value: `${chapasTotal} un`,       color: "var(--t2)" },
              { label: "Produtos",      value: String(estoque.length),    color: "var(--t2)" },
              ...(emRupturaCount > 0 ? [{ label: "⚠ Ruptura", value: `${emRupturaCount} produto${emRupturaCount > 1 ? "s" : ""}`, color: "var(--err)" }] : []),
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RUPTURA BANNER ── */}
        {itensRuptura.length > 0 && (
          <div style={{ marginBottom: 12, padding: "12px 18px", background: "rgba(244,63,94,.07)", border: "1px solid rgba(244,63,94,.25)", borderRadius: 14, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <div style={{ fontSize: 12, color: "var(--t2)" }}>
              <strong style={{ color: "var(--err)" }}>{itensRuptura.length} produto{itensRuptura.length > 1 ? "s" : ""} abaixo do mínimo:</strong>
              {" "}{itensRuptura.map((e, i) => (
                <span key={e.id}>
                  <strong style={{ color: "var(--t1)" }}>{e.produtos?.nome ?? e.cod}</strong>
                  <span style={{ color: "var(--t3)" }}> ({e.chapas_saldo}/{e.estoque_minimo_chapas} ch)</span>
                  {i < itensRuptura.length - 1 && <span style={{ color: "var(--b3)", margin: "0 5px" }}>·</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── LISTA DE PRODUTOS (estilo extrato bancário) ── */}
        {loading ? (
          <div className="loading">Carregando estoque…</div>
        ) : estoque.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--t3)", fontSize: 13 }}>
            Nenhum item no estoque — clique em "+ Entrada" para começar.
          </div>
        ) : (
          <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: 20, overflow: "hidden" }}>
            {/* Cabeçalho da lista */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1.2px" }}>
                Produtos em Estoque
              </span>
              <span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                {estoque.length} ite{estoque.length !== 1 ? "ns" : "m"}
              </span>
            </div>

            {/* Itens */}
            {estoqueSorted.map((e, idx) => {
              const pct        = Number(e.m2_entrada) > 0 ? (Number(e.m2_saldo) / Number(e.m2_entrada)) * 100 : 0;
              const ruptura    = emRuptura(e);
              const nivelCor   = ruptura ? "var(--err)" : pct >= 60 ? "var(--ok)" : pct >= 30 ? "var(--warn)" : "var(--err)";
              const nivelLabel = ruptura ? "Ruptura" : pct >= 60 ? "Alto" : pct >= 30 ? "Médio" : "Baixo";
              const valor      = Number(e.m2_saldo) * Number(e.custo_m2);
              const compM2     = comprometidoPorProduto[e.produto_id] ?? 0;

              return (
                <div key={e.id}>
                  <div
                    style={{ display: "flex", alignItems: "center", padding: "15px 24px", gap: 16, transition: "background .12s" }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = "var(--surf2)")}
                    onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
                  >
                    {/* Ponto de status */}
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: nivelCor, boxShadow: `0 0 5px ${nivelCor}70` }} />
                    </div>

                    {/* Informações principais */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", lineHeight: 1.2 }}>
                          {e.produtos?.nome ?? e.cod}
                        </span>
                        {ruptura && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--err)", textTransform: "uppercase", letterSpacing: "0.5px" }}>⚠ ruptura</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--t3)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "var(--acc)", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{e.cod}</span>
                        <span style={{ color: nivelCor, fontWeight: 600 }}>● {nivelLabel}</span>
                        <span>{e.chapas_saldo} chapas</span>
                        {e.produtos?.tipo && <span>{e.produtos.tipo} {e.produtos.espessura}</span>}
                        {compM2 > 0 && (
                          <span style={{ color: "var(--warn)" }}>{formatM2(compM2)} comprometido</span>
                        )}
                      </div>
                    </div>

                    {/* Barra de nível (compacta) */}
                    <div style={{ width: 72, flexShrink: 0 }}>
                      <div style={{ height: 4, background: "var(--surf3)", borderRadius: 99, overflow: "hidden", marginBottom: 4 }}>
                        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: nivelCor, borderRadius: 99 }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--t3)", textAlign: "center", fontFamily: "'DM Mono', monospace" }}>{pct.toFixed(0)}%</div>
                    </div>

                    {/* Mínimo inline */}
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: "var(--t3)" }}>mín</span>
                      <input
                        type="number" min="0"
                        defaultValue={Number(e.estoque_minimo_chapas ?? 0)}
                        onBlur={ev => salvarMinimo(e, parseInt(ev.target.value || "0"))}
                        title="Estoque mínimo (chapas)"
                        style={{ ...inpMin, width: 42 }}
                      />
                    </div>

                    {/* Valor (alinhado à direita, como saldo bancário) */}
                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 110 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: nivelCor, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                        {formatM2(e.m2_saldo)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3, fontFamily: "'DM Mono', monospace" }}>
                        {formatBRL(valor)}
                      </div>
                    </div>

                    {/* Ações */}
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      <button className="btn bg xs" onClick={() => abrirEditar(e)}>Editar</button>
                      <button
                        onClick={() => excluir(e)}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}
                        onMouseEnter={ev => { const b = ev.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                        onMouseLeave={ev => { const b = ev.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                      >🗑</button>
                    </div>
                  </div>

                  {/* Divisor fino (estilo extrato) */}
                  {idx < estoqueSorted.length - 1 && (
                    <div style={{ height: 1, background: "var(--b1)", margin: "0 24px" }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}