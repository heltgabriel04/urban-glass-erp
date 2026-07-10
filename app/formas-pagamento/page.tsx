"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFormasPagamento, createFormaPagamento, updateFormaPagamento, deletarFormaPagamento } from "@/services/formasPagamento.service";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { useEscToClose } from "@/components/ui/useEscToClose";
import SearchInput from "@/components/ui/SearchInput";
import type { FormaPagamento, FormaPagamentoInsert } from "@/types";

const VAZIO: FormaPagamentoInsert = { nome: "", ativo: true, taxa_pct: null };

export default function FormasPagamentoPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormaPagamentoInsert>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEscToClose(modalAberto, () => setModalAberto(false));

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setFormas(await getFormasPagamento());
    setLoading(false);
  }

  function abrirNovo() {
    setEditId(null);
    setForm(VAZIO);
    setModalAberto(true);
  }
  function abrirEdicao(f: FormaPagamento) {
    setEditId(f.id);
    setForm({ nome: f.nome, ativo: f.ativo, taxa_pct: f.taxa_pct });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.nome.trim()) { toast("Informe o nome da forma de pagamento", "err"); return; }
    setSalvando(true);
    const res = editId != null
      ? await updateFormaPagamento(editId, form)
      : await createFormaPagamento(form);
    setSalvando(false);
    if (res) {
      toast(editId != null ? "Forma de pagamento atualizada" : "Forma de pagamento criada");
      setModalAberto(false);
      load();
    } else {
      toast("Erro ao salvar forma de pagamento", "err");
    }
  }

  async function handleDeletar(f: FormaPagamento) {
    if (!(await confirm(`Excluir a forma de pagamento ${f.nome}?`, { perigo: true }))) return;
    const ok = await deletarFormaPagamento(f.id);
    if (ok) { toast("Forma de pagamento excluída"); load(); }
    else toast("Erro ao excluir forma de pagamento", "err");
  }

  async function toggleAtivo(f: FormaPagamento) {
    const res = await updateFormaPagamento(f.id, { ativo: !f.ativo });
    if (res) load();
  }

  const filtradas = formas.filter(f => !busca || f.nome.toLowerCase().includes(busca.toLowerCase()));
  const totalAtivas = formas.filter(f => f.ativo).length;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Formas de Pagamento</div>
        <SearchInput placeholder="Buscar por nome..." value={busca} onChange={setBusca} />
        <button className="btn bp sm" onClick={abrirNovo}>+ Nova Forma de Pagamento</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando formas de pagamento...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Taxa %</th>
                  <th>Status</th>
                  <th style={{ width: "80px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhuma forma de pagamento cadastrada
                    </td>
                  </tr>
                )}
                {filtradas.map(f => (
                  <tr key={f.id} style={{ cursor: "pointer" }} onClick={() => abrirEdicao(f)}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                  >
                    <td><strong>{f.nome}</strong></td>
                    <td className="mono">{f.taxa_pct != null ? `${f.taxa_pct}%` : "—"}</td>
                    <td>
                      <button
                        onClick={e => { e.stopPropagation(); toggleAtivo(f); }}
                        className={f.ativo ? "chip cg" : "chip cgr"}
                        style={{ border: "none", cursor: "pointer" }}
                        title="Alternar ativo/inativo"
                      >{f.ativo ? "Ativa" : "Inativa"}</button>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        title="Excluir"
                        onClick={e => { e.stopPropagation(); handleDeletar(f); }}
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
        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--t3)" }}>{totalAtivas} forma(s) ativa(s)</div>
      </div>

      {modalAberto && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalAberto(false)}>
          <div className="mod" style={{ width: "400px" }}>
            <div className="mhd">
              <div className="mtit">{editId != null ? "Editar" : "Nova"} forma de pagamento</div>
              <button className="mcl" onClick={() => setModalAberto(false)} aria-label="Fechar">✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="fg">
                <label className="fl">Nome *</label>
                <input className="fc" placeholder="PIX, Boleto, Cartão..." value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={{ margin: 0 }} />
              </div>
              <div className="fg">
                <label className="fl">Taxa (%) — opcional</label>
                <input className="fc" type="number" step="0.01" placeholder="Ex: 2.5 (maquininha)" value={form.taxa_pct ?? ""}
                  onChange={e => setForm(f => ({ ...f, taxa_pct: e.target.value ? Number(e.target.value) : null }))} style={{ margin: 0 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={() => setModalAberto(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : editId != null ? "Salvar alterações" : "Criar forma de pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
