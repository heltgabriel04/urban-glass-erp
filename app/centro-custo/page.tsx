"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getCentrosCusto, createCentroCusto, updateCentroCusto, deletarCentroCusto } from "@/services/centrosCusto.service";
import { useToast } from "@/components/ui/toast";
import SearchInput from "@/components/ui/SearchInput";
import { useEscToClose } from "@/components/ui/useEscToClose";
import type { CentroCusto, CentroCustoInsert } from "@/types";

const VAZIO: CentroCustoInsert = { nome: "", ativo: true };

export default function CentroCustoPage() {
  const { toast } = useToast();
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CentroCustoInsert>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEscToClose(modalAberto, () => setModalAberto(false));

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setCentros(await getCentrosCusto());
    setLoading(false);
  }

  function abrirNovo() {
    setEditId(null);
    setForm(VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(c: CentroCusto) {
    setEditId(c.id);
    setForm({ nome: c.nome, ativo: c.ativo });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.nome.trim()) { toast("Informe o nome do centro de custo", "err"); return; }
    setSalvando(true);
    const res = editId != null
      ? await updateCentroCusto(editId, form)
      : await createCentroCusto(form);
    setSalvando(false);
    if (res) {
      toast(editId != null ? "Centro de custo atualizado" : "Centro de custo criado");
      setModalAberto(false);
      load();
    } else {
      toast("Erro ao salvar centro de custo", "err");
    }
  }

  async function handleDeletar(c: CentroCusto) {
    if (!confirm(`Excluir o centro de custo ${c.nome}?`)) return;
    const ok = await deletarCentroCusto(c.id);
    if (ok) { toast("Centro de custo excluído"); load(); }
    else toast("Erro ao excluir centro de custo", "err");
  }

  async function toggleAtivo(c: CentroCusto) {
    const res = await updateCentroCusto(c.id, { ativo: !c.ativo });
    if (res) load();
  }

  const filtrados = centros.filter(c => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()));
  const totalAtivos = centros.filter(c => c.ativo).length;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Centro de Custo</div>
        <SearchInput placeholder="Buscar por nome..." value={busca} onChange={setBusca} />
        <button className="btn bp sm" onClick={abrirNovo}>+ Novo Centro de Custo</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando centros de custo...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th style={{ width: "80px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhum centro de custo cadastrado
                    </td>
                  </tr>
                )}
                {filtrados.map(c => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => abrirEdicao(c)}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                  >
                    <td><strong>{c.nome}</strong></td>
                    <td>
                      <button
                        onClick={e => { e.stopPropagation(); toggleAtivo(c); }}
                        className={c.ativo ? "chip cg" : "chip cgr"}
                        style={{ border: "none", cursor: "pointer" }}
                        title="Alternar ativo/inativo"
                      >{c.ativo ? "Ativo" : "Inativo"}</button>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        title="Excluir centro de custo"
                        onClick={e => { e.stopPropagation(); handleDeletar(c); }}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", fontSize: "13px", cursor: "pointer", transition: "all 0.15s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                      >🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--t3)" }}>{totalAtivos} centro(s) ativo(s)</div>
      </div>

      {modalAberto && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalAberto(false)}>
          <div className="mod" style={{ width: "420px" }}>
            <div className="mhd">
              <div className="mtit">{editId != null ? "Editar" : "Novo"} centro de custo</div>
              <button className="mcl" onClick={() => setModalAberto(false)}>✕</button>
            </div>

            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>Nome *</label>
                <input className="fc" placeholder="Produção, Comercial, Administrativo..." value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={{ margin: 0 }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={() => setModalAberto(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : editId != null ? "Salvar alterações" : "Criar centro de custo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
