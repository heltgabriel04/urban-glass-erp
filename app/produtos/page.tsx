"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { useConfirm } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import SearchInput from "@/components/ui/SearchInput";
import ModalClassificacaoFiscal from "@/components/produtos/ModalClassificacaoFiscal";
import { getConfigPadrao, salvarConfigFiscalProduto, PADRAO_FALLBACK } from "@/services/contabilidade.service";
import type { ConfigFiscalProdutoInput } from "@/services/contabilidade.service";
import type { Produto, ProdutoInsert, ConfigFiscalPadrao } from "@/types";

// "Chapa" não é um tipo de vidro — é só um estado de venda (inteira vs.
// cortada), já tratado por isChapaInteira() a partir das medidas do item.
// Não readicione como opção aqui: isso recria produto duplicado e fragmenta
// o estoque do mesmo material (ver histórico de unificação em /produtos).
const PREFIXOS: Record<string, string> = {
  "Laminado": "VL",
  "Reflecta": "VR",
  "Monolítico": "VM",
};

const TIPOS = ["Laminado", "Reflecta", "Monolítico"];

const VAZIO: ProdutoInsert = {
  cod: "", nome: "", tipo: "", espessura: "", cor: "",
  categoria: "Chapas", valor: 0, margem: 0, unidade: "m²", ativo: true, obs: "",
  chapas_por_colar: null, chapa_largura_mm: null, chapa_altura_mm: null,
  pode_rotacionar: true,
};

export default function ProdutosPage() {
  const confirm = useConfirm();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState("");
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState<ProdutoInsert>(VAZIO);
  const [editId, setEditId]     = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [comConfigFiscal, setComConfigFiscal] = useState<Set<number>>(new Set());
  const [padrao, setPadrao] = useState<ConfigFiscalPadrao>({ ...PADRAO_FALLBACK });
  const [produtoPendenteFiscal, setProdutoPendenteFiscal] = useState<Produto | null>(null);
  const [salvandoFiscal, setSalvandoFiscal] = useState(false);

  useEffect(() => { load(); getConfigPadrao().then(setPadrao); }, []);

  async function load() {
    setLoading(true);
    const [{ data }, { data: configs }] = await Promise.all([
      supabase.from("produtos").select("*").order("nome"),
      supabase.from("config_fiscal_produtos").select("produto_id"),
    ]);
    setProdutos(data as Produto[] || []);
    setComConfigFiscal(new Set((configs ?? []).map((c: { produto_id: number }) => c.produto_id)));
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
      chapas_por_colar: p.chapas_por_colar ?? null,
      chapa_largura_mm: p.chapa_largura_mm ?? null,
      chapa_altura_mm:  p.chapa_altura_mm  ?? null,
      pode_rotacionar: p.pode_rotacionar,
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
      setSalvando(false);
      setModal(false);
      load();
      return;
    }
    const { data, error } = await supabase.from("produtos").insert([form as never]).select().single();
    setSalvando(false);
    setModal(false);
    if (error || !data) { load(); return; }
    setProdutoPendenteFiscal(data as Produto);
    load();
  }

  async function handleSalvarFiscalObrigatoria(input: ConfigFiscalProdutoInput) {
    setSalvandoFiscal(true);
    const ok = await salvarConfigFiscalProduto(input);
    setSalvandoFiscal(false);
    if (!ok) return;
    setProdutoPendenteFiscal(null);
    load();
  }

  async function handleCancelarFiscalObrigatoria() {
    if (!produtoPendenteFiscal) return;
    if (!(await confirm(`Excluir o produto "${produtoPendenteFiscal.nome}"? A classificação fiscal é obrigatória para produtos novos.`, { perigo: true }))) return;
    setSalvandoFiscal(true);
    await supabase.from("produtos").delete().eq("id", produtoPendenteFiscal.id);
    setSalvandoFiscal(false);
    setProdutoPendenteFiscal(null);
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
      chapas_por_colar: p.chapas_por_colar ?? null,
      chapa_largura_mm: p.chapa_largura_mm ?? null,
      chapa_altura_mm:  p.chapa_altura_mm  ?? null,
      pode_rotacionar: p.pode_rotacionar,
    } as never]);
    load();
  }

  async function excluir(p: Produto) {
    if (!(await confirm(`Excluir "${p.nome}" permanentemente? Esta ação não pode ser desfeita.`, { perigo: true }))) return;
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
        <SearchInput placeholder="Buscar produto, código, tipo..." value={filtro} onChange={setFiltro} />
        <button className="btn bp sm" onClick={abrirNovo}>+ Novo Produto</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando produtos...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Nome</th><th>Tipo</th><th>Espessura</th>
                  <th>Cor</th><th>Valor/m²</th><th>Unidade</th><th>Status</th>
                  <th>Fiscal</th>
                  <th>Ações</th><th style={{ width:"40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>Nenhum produto encontrado</td></tr>
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
                      <Link href="/contabilidade/fiscal-produtos" title="Ver/editar na Configuração Fiscal" style={{ textDecoration: "none" }}>
                        <span className={comConfigFiscal.has(p.id) ? "chip cg" : "chip cgr"} style={{ fontSize: "10px" }}>
                          {comConfigFiscal.has(p.id) ? "Própria" : "Padrão"}
                        </span>
                      </Link>
                    </td>
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

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar Produto" : "Novo Produto"} width="560px">
            <div className="fr">
              {/* Código — gerado automaticamente, bloqueado em novo; editável em edição */}
              <Campo label="Código">
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
              </Campo>
              <Campo label="Nome *">
                <input
                  className="fc"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Vidro Laminado 4+4 Incolor"
                />
              </Campo>
            </div>

            <div className="fr3">
              <Campo label="Tipo">
                <select className="fc" value={form.tipo} onChange={e => handleTipo(e.target.value)}>
                  <option value="">Selecione...</option>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Espessura">
                <input className="fc" value={form.espessura} onChange={e => setForm(f => ({ ...f, espessura: e.target.value }))} placeholder="4+4" />
              </Campo>
              <Campo label="Cor">
                <input className="fc" value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} placeholder="Incolor" />
              </Campo>
            </div>

            <div className="fr3">
              <Campo label="Valor (R$/m²) *">
                <CurrencyInput
                  value={form.valor}
                  onChange={v => setForm(f => ({ ...f, valor: v }))}
                  placeholder="R$ 0,00"
                />
              </Campo>
              <Campo label="Margem negociação (%)">
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
              </Campo>
              <Campo label="Unidade">
                <select className="fc" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}>
                  <option>m²</option><option>un</option><option>ml</option>
                </select>
              </Campo>
            </div>

            <div className="fr3">
              <Campo label="Chapas por colar">
                <input
                  className="fc" type="number" min="0" step="1"
                  value={form.chapas_por_colar ?? ""}
                  onChange={e => setForm(f => ({ ...f, chapas_por_colar: e.target.value ? parseInt(e.target.value, 10) : null }))}
                  placeholder="Ex: 18"
                />
              </Campo>
              <Campo label="Chapa — largura (mm)">
                <input
                  className="fc" type="number" min="0" step="1"
                  value={form.chapa_largura_mm ?? ""}
                  onChange={e => setForm(f => ({ ...f, chapa_largura_mm: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="Ex: 3300"
                />
              </Campo>
              <Campo label="Chapa — altura (mm)">
                <input
                  className="fc" type="number" min="0" step="1"
                  value={form.chapa_altura_mm ?? ""}
                  onChange={e => setForm(f => ({ ...f, chapa_altura_mm: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="Ex: 2250"
                />
              </Campo>
            </div>

            <div className="fg" style={{ marginBottom:"14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.pode_rotacionar}
                  onChange={e => setForm(f => ({ ...f, pode_rotacionar: e.target.checked }))}
                />
                <span className="fl" style={{ margin: 0 }}>Pode rotacionar no otimizador de corte</span>
              </label>
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>
                Desmarque para vidro direcional, com padrão ou serigrafado — o otimizador nunca vai girar a peça 90° ao montar o plano de corte.
              </div>
            </div>

            <Campo style={{ marginBottom:"14px" }} label="Observação">
              <input className="fc" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Observações opcionais" />
            </Campo>

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
      </Modal>

      {produtoPendenteFiscal && (
        <ModalClassificacaoFiscal
          item={{ produto: produtoPendenteFiscal, config: null }}
          padrao={padrao}
          onSalvar={handleSalvarFiscalObrigatoria}
          onFechar={() => {}}
          obrigatorio
          onCancelarObrigatorio={handleCancelarFiscalObrigatoria}
          salvando={salvandoFiscal}
        />
      )}
    </AppLayout>
  );
}