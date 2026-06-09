"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { Produto, ProdutoInsert } from "@/types";

const PREFIXOS: Record<string, string> = {
  "Laminado": "VL",
  "Chapa":    "CH",
  "Reflecta": "VR",
};

const TIPOS = ["Laminado", "Chapa", "Reflecta", "Monolítico"];

const VAZIO: ProdutoInsert = {
  cod: "", nome: "", tipo: "", espessura: "", cor: "",
  categoria: "Chapas", valor: 0, margem: 0, unidade: "m²", ativo: true, obs: "",
};

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState("");
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState<ProdutoInsert>(VAZIO);
  const [editId, setEditId]     = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("produtos").select("*").order("nome");
    setProdutos(data as Produto[] || []);
    setLoading(false);
  }

  // Gera próximo código para o tipo selecionado
  async function gerarCodigo(tipo: string): Promise<string> {
    const prefixo = PREFIXOS[tipo];
    if (!prefixo) return "";

    // Busca todos os códigos que começam com esse prefixo
    const { data } = await supabase
      .from("produtos")
      .select("cod")
      .ilike("cod", `${prefixo}-%`);

    const numeros = (data || [])
      .map(p => {
        const partes = p.cod.split("-");
        return parseInt(partes[1] || "0", 10);
      })
      .filter(n => !isNaN(n));

    const proximo = numeros.length > 0 ? Math.max(...numeros) + 1 : 1;
    return `${prefixo}-${String(proximo).padStart(3, "0")}`;
  }

  async function abrirNovo() {
    setForm(VAZIO);
    setEditId(null);
    setModal(true);
  }

  function abrirEdit(p: Produto) {
    setForm({
      cod: p.cod, nome: p.nome, tipo: p.tipo, espessura: p.espessura,
      cor: p.cor, categoria: p.categoria, valor: p.valor,
      margem: p.margem ?? 0, unidade: p.unidade, ativo: p.ativo, obs: p.obs,
    });
    setEditId(p.id);
    setModal(true);
  }

  // Ao mudar o tipo no modal (apenas para novo produto), gera código automaticamente
  async function handleTipo(tipo: string) {
    if (editId) {
      setForm(f => ({ ...f, tipo }));
      return;
    }
    const cod = await gerarCodigo(tipo);
    setForm(f => ({ ...f, tipo, cod }));
  }

  async function salvar() {
    if (!form.cod || !form.nome) return;
    setSalvando(true);
    if (editId) {
      await supabase.from("produtos").update(form as never).eq("id", editId);
    } else {
      await supabase.from("produtos").insert([form as never]);
    }
    setSalvando(false);
    setModal(false);
    load();
  }

  async function duplicar(p: Produto) {
    const cod = await gerarCodigo(p.tipo);
    await supabase.from("produtos").insert([{
      cod: cod || p.cod + "-C",
      nome: p.nome + " (cópia)",
      tipo: p.tipo, espessura: p.espessura, cor: p.cor,
      categoria: p.categoria, valor: p.valor,
      unidade: p.unidade, ativo: true, obs: p.obs,
    } as never]);
    load();
  }

  async function excluir(p: Produto) {
    if (!confirm(`Excluir "${p.nome}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    await supabase.from("produtos").delete().eq("id", p.id);
    load();
  }

  const filtrados = produtos.filter(p =>
    !filtro ||
    p.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    p.cod.toLowerCase().includes(filtro.toLowerCase()) ||
    p.tipo.toLowerCase().includes(filtro.toLowerCase())
  );
  const ativos = produtos.filter(p => p.ativo).length;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Produtos</div>
        <div className="tb-search">
          <span className="tb-search-ic">⌕</span>
          <input placeholder="Buscar produto, código, tipo..." value={filtro} onChange={e => setFiltro(e.target.value)} />
        </div>
        <button className="btn bp sm" onClick={abrirNovo}>+ Novo Produto</button>
      </div>

      <div className="con">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total Produtos", value: String(produtos.length), color:"var(--t1)",   sub: ativos + " ativos" },
            { label:"Ativos",         value: String(ativos),          color:"var(--ok)",   sub:"disponíveis para pedido" },
            { label:"Inativos",       value: String(produtos.length - ativos), color:"var(--err)", sub:"descontinuados" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando produtos...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Nome</th><th>Tipo</th><th>Espessura</th>
                  <th>Cor</th><th>Valor/m²</th><th>Unidade</th><th>Status</th>
                  <th>Ações</th><th style={{ width:"40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>Nenhum produto encontrado</td></tr>
                )}
                {filtrados.map(p => (
                  <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.55 }}>
                    <td><span className="mono" style={{ color:"var(--acc)" }}>{p.cod}</span></td>
                    <td><strong>{p.nome}</strong>{!p.ativo && <div className="tdim">Descontinuado</div>}</td>
                    <td>{p.tipo || "—"}</td>
                    <td className="mono">{p.espessura || "—"}</td>
                    <td>{p.cor || "—"}</td>
                    <td className="mono" style={{ color:"var(--acc)" }}>{formatBRL(p.valor)}</td>
                    <td className="mono">{p.unidade}</td>
                    <td><span className={p.ativo ? "chip cg" : "chip cr"}>{p.ativo ? "Ativo" : "Inativo"}</span></td>
                    <td>
                      <div style={{ display:"flex", gap:"4px" }}>
                        <button className="btn bg xs" onClick={() => abrirEdit(p)}>Editar</button>
                        <button className="btn bg xs" onClick={() => duplicar(p)}>Duplicar</button>
                      </div>
                    </td>
                    <td style={{ width:"40px", textAlign:"center" }}>
                      <button
                        title="Excluir produto"
                        onClick={() => excluir(p)}
                        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="mod" style={{ width:"560px" }}>
            <div className="mhd">
              <div className="mtit">{editId ? "Editar Produto" : "Novo Produto"}</div>
              <button className="mcl" onClick={() => setModal(false)}>✕</button>
            </div>

            <div className="fr">
              {/* Código — gerado automaticamente, bloqueado em novo; editável em edição */}
              <div className="fg">
                <label className="fl">Código</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="fc"
                    value={form.cod || (editId ? "" : "Selecione o tipo...")}
                    readOnly
                    style={{
                      opacity: form.cod ? 1 : 0.45,
                      cursor: "default",
                      background: "var(--surf2)",
                      color: form.cod ? "var(--acc)" : "var(--t3)",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Nome *</label>
                <input
                  className="fc"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Vidro Laminado 4+4 Incolor"
                />
              </div>
            </div>

            <div className="fr3">
              <div className="fg">
                <label className="fl">Tipo</label>
                <select className="fc" value={form.tipo} onChange={e => handleTipo(e.target.value)}>
                  <option value="">Selecione...</option>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Espessura</label>
                <input className="fc" value={form.espessura} onChange={e => setForm(f => ({ ...f, espessura: e.target.value }))} placeholder="4+4" />
              </div>
              <div className="fg">
                <label className="fl">Cor</label>
                <input className="fc" value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} placeholder="Incolor" />
              </div>
            </div>

            <div className="fr3">
              <div className="fg">
                <label className="fl">Valor (R$/m²) *</label>
                <CurrencyInput
                  value={form.valor}
                  onChange={v => setForm(f => ({ ...f, valor: v }))}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="fg">
                <label className="fl">Margem negociação (%)</label>
                <input
                  className="fc"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={(form as any).margem || ""}
                  onChange={e => setForm(f => ({ ...f, margem: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                />
              </div>
              <div className="fg">
                <label className="fl">Unidade</label>
                <select className="fc" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}>
                  <option>m²</option><option>un</option><option>ml</option>
                </select>
              </div>
            </div>

            <div className="fg" style={{ marginBottom:"14px" }}>
              <label className="fl">Observação</label>
              <input className="fc" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Observações opcionais" />
            </div>

            {/* Aviso se tipo não selecionado em novo produto */}
            {!editId && !form.cod && (
              <div className="al al-i" style={{ marginBottom: "12px", fontSize: "12px" }}>
                Selecione o tipo para gerar o código automaticamente
              </div>
            )}

            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
              <button
                className="btn bp"
                onClick={salvar}
                disabled={salvando || !form.cod || !form.nome}
              >
                {salvando ? "Salvando..." : "Salvar Produto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}