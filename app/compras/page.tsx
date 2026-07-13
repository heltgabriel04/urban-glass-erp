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

  function resetForm() {
    setForm(FORM_VAZIO);
    setItens([{ ...ITEM_VAZIO }]);
    setXmlPendente(null);
    setShowForm(false);
  }

  function handleImportarXml(dados: DadosImportadosXml) {
    setModalXmlAberto(false);
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

    const res = await createCompra({
      fornecedor_id: Number(form.fornecedor_id),
      nf: form.nf.trim() || null,
      dt_compra: form.dt_compra || hoje(),
      condicao_pgto: form.condicao_pgto.trim() || null,
      valor_total: parseFloat(valorTotal.toFixed(2)),
      obs: form.obs.trim() || null,
    }, itensPayload);

    if (!res) { setSalvando(false); toast("Erro ao salvar compra.", "err"); return; }

    if (xmlPendente) {
      const dt = form.dt_compra || hoje();
      const primeiroItem = xmlPendente.dados.itens[0];
      const anexo = await anexarXmlNaCompra(res.id, {
        chaveAcesso: xmlPendente.dados.chaveAcesso,
        numeroNF: xmlPendente.dados.numeroNF,
        serie: xmlPendente.dados.serie,
        ncm: primeiroItem?.ncm ?? null,
        cfop: primeiroItem?.cfop ?? null,
        valorTotal: xmlPendente.dados.valorTotalNota,
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
        <button className="btn bp sm" onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}>
          {showForm ? "✕ Cancelar" : "+ Nova Compra"}
        </button>
      </div>

      {modalXmlAberto && (
        <ImportarXmlCompraModal
          produtos={produtos.map(p => ({ id: p.id, nome: p.nome }))}
          fornecedores={fornecedores}
          onImportar={handleImportarXml}
          onFornecedorCriado={handleFornecedorCriado}
          onClose={() => setModalXmlAberto(false)}
        />
      )}

      <div className="con">
        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total de Compras",        value: String(compras.length),           color: "var(--t1)",   sub: "cadastradas" },
            { label: "Pendentes de Recebimento", value: String(pendentes.length),          color: "var(--warn)", sub: "ainda em rascunho" },
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
                <select style={selectStyle} value={form.fornecedor_id} onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
              <Campo labelStyle={labelStyle} label="NF">
                <input style={inputStyle} value={form.nf} onChange={e => setForm(f => ({ ...f, nf: e.target.value }))} placeholder="000123" />
              </Campo>
              <Campo labelStyle={labelStyle} label="Data">
                <DateInput style={inputStyle} className="" value={form.dt_compra} onChange={v => setForm(f => ({ ...f, dt_compra: v }))} />
              </Campo>
              <Campo labelStyle={labelStyle} label="Condição de Pagamento">
                <input style={inputStyle} value={form.condicao_pgto} onChange={e => setForm(f => ({ ...f, condicao_pgto: e.target.value }))} placeholder="30/60/90" />
              </Campo>
            </div>

            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "10px" }}>ITENS</div>
            {itens.map((it, i) => {
              const prod = produtos.find(p => String(p.id) === it.produto_id);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.9fr 1fr 1fr auto", gap: "10px", alignItems: "end", marginBottom: "10px" }}>
                  <div>
                    {i === 0 && <label style={labelStyle}>Produto</label>}
                    <select aria-label="Produto" style={selectStyle} value={it.produto_id} onChange={e => updItem(i, "produto_id", e.target.value)}>
                      <option value="">Selecione...</option>
                      {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>Colares</label>}
                    <input aria-label="Colares" style={inputStyle} type="number" min="0" value={it.colares} onChange={e => updItem(i, "colares", e.target.value)}
                      placeholder={prod?.chapas_por_colar ? `× ${prod.chapas_por_colar} ch.` : "config. no produto"} />
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>Chapas *</label>}
                    {prod?.chapas_por_colar ? (
                      <div style={{ ...inputStyle, background: "transparent", color: "var(--t2)" }} title="Calculado automaticamente a partir dos colares">
                        {it.chapas || "—"}
                      </div>
                    ) : (
                      <input aria-label="Chapas" style={inputStyle} type="number" min="0" value={it.chapas} onChange={e => updItem(i, "chapas", e.target.value)} />
                    )}
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>m²/chapa *</label>}
                    {prod?.chapa_largura_mm && prod?.chapa_altura_mm ? (
                      <div style={{ ...inputStyle, background: "transparent", color: "var(--t2)" }} title="Calculado automaticamente a partir da chapa do produto">
                        {it.m2_por_chapa}
                      </div>
                    ) : (
                      <input aria-label="m²/chapa" style={inputStyle} type="number" min="0" step="0.0001" value={it.m2_por_chapa} onChange={e => updItem(i, "m2_por_chapa", e.target.value)} />
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
              );
            })}
            <button className="btn bg sm" onClick={addItem} style={{ marginBottom: "16px" }}>+ Item</button>

            <Campo style={{ marginBottom: "14px" }} labelStyle={labelStyle} label="Observação">
              <input style={inputStyle} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Observações opcionais" />
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
