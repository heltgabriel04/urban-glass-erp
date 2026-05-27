"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import type { Produto, ProdutoInsert } from "@/types";

const VAZIO: ProdutoInsert = {
  cod: "", nome: "", tipo: "", espessura: "", cor: "",
  categoria: "Chapas", valor: 0, unidade: "m²", ativo: true, obs: "",
};

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<ProdutoInsert>(VAZIO);
  const [editId, setEditId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("produtos").select("*").order("nome");
    setProdutos(data as Produto[] || []);
    setLoading(false);
  }

  function abrirNovo() {
    setForm(VAZIO);
    setEditId(null);
    setModal(true);
  }

  function abrirEdit(p: Produto) {
    setForm({
      cod: p.cod, nome: p.nome, tipo: p.tipo, espessura: p.espessura,
      cor: p.cor, categoria: p.categoria, valor: p.valor,
      unidade: p.unidade, ativo: p.ativo, obs: p.obs,
    });
    setEditId(p.id);
    setModal(true);
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

  async function toggleAtivo(p: Produto) {
    await supabase.from("produtos").update({ ativo: !p.ativo } as never).eq("id", p.id);
    load();
  }

  async function duplicar(p: Produto) {
    await supabase.from("produtos").insert([{
      cod: p.cod + "-C", nome: p.nome + " (cópia)",
      tipo: p.tipo, espessura: p.espessura, cor: p.cor,
      categoria: p.categoria, valor: p.valor,
      unidade: p.unidade, ativo: true, obs: p.obs,
    } as never]);
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
          <input
            placeholder="Buscar produto, código, tipo..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
          />
        </div>
        <button className="btn bp sm" onClick={abrirNovo}>+ Novo Produto</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando produtos...</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="g3 mb14">
              <div className="kpi">
                <div className="kpi-l">Total Produtos</div>
                <div className="kpi-v">{produtos.length}</div>
                <div className="kpi-s">{ativos} ativos</div>
                <div className="kpi-bar" style={{ width: "100%", background: "var(--acc2)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Ativos</div>
                <div className="kpi-v" style={{ color: "var(--ok)" }}>{ativos}</div>
                <div className="kpi-s up">disponíveis para pedido</div>
                <div className="kpi-bar" style={{ width: `${produtos.length > 0 ? ativos / produtos.length * 100 : 0}%`, background: "var(--ok)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Inativos</div>
                <div className="kpi-v" style={{ color: "var(--err)" }}>{produtos.length - ativos}</div>
                <div className="kpi-s dn">descontinuados</div>
                <div className="kpi-bar" style={{ width: `${produtos.length > 0 ? (produtos.length - ativos) / produtos.length * 100 : 0}%`, background: "var(--err)" }} />
              </div>
            </div>

            {/* Tabela */}
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Espessura</th>
                    <th>Cor</th>
                    <th>Valor/m²</th>
                    <th>Unidade</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                        Nenhum produto encontrado
                      </td>
                    </tr>
                  )}
                  {filtrados.map(p => (
                    <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
                      <td><span className="mono" style={{ color: "var(--acc)" }}>{p.cod}</span></td>
                      <td>
                        <strong>{p.nome}</strong>
                        {p.obs && <div className="tdim">{p.obs}</div>}
                      </td>
                      <td>{p.tipo || "—"}</td>
                      <td className="mono">{p.espessura || "—"}</td>
                      <td>{p.cor || "—"}</td>
                      <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(p.valor)}</td>
                      <td className="mono">{p.unidade}</td>
                      <td>
                        <span className={p.ativo ? "chip cg" : "chip cr"}>
                          {p.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button className="btn bg xs" onClick={() => abrirEdit(p)}>Editar</button>
                          <button className="btn bg xs" onClick={() => duplicar(p)}>Dup.</button>
                          <button
                            className={`btn xs ${p.ativo ? "bw" : "bp"}`}
                            onClick={() => toggleAtivo(p)}
                          >
                            {p.ativo ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="mod" style={{ width: "560px" }}>
            <div className="mhd">
              <div className="mtit">{editId ? "Editar Produto" : "Novo Produto"}</div>
              <button className="mcl" onClick={() => setModal(false)}>✕</button>
            </div>

            <div className="fr">
              <div className="fg">
                <label className="fl">Código *</label>
                <input className="fc" value={form.cod} onChange={e => setForm(f => ({ ...f, cod: e.target.value }))} placeholder="VL-001" />
              </div>
              <div className="fg">
                <label className="fl">Nome *</label>
                <input className="fc" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Vidro Laminado 4+4" />
              </div>
            </div>

            <div className="fr3">
              <div className="fg">
                <label className="fl">Tipo</label>
                <select className="fc" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="">Selecione...</option>
                  <option>Laminado</option>
                  <option>Reflecta</option>
                  <option>Monolítico</option>
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

            <div className="fr">
              <div className="fg">
                <label className="fl">Valor (R$/m²) *</label>
                <input className="fc" type="number" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
              </div>
              <div className="fg">
                <label className="fl">Unidade</label>
                <select className="fc" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}>
                  <option>m²</option>
                  <option>un</option>
                  <option>ml</option>
                </select>
              </div>
            </div>

            <div className="fg" style={{ marginBottom: "14px" }}>
              <label className="fl">Observação</label>
              <input className="fc" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Observações opcionais" />
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar Produto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}