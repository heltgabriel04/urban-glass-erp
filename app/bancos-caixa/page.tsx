"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getContasBancarias, createContaBancaria, updateContaBancaria, deletarContaBancaria } from "@/services/contasBancarias.service";
import { useToast } from "@/components/ui/toast";
import { formatBRL } from "@/lib/formatters";
import SearchInput from "@/components/ui/SearchInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { useEscToClose } from "@/components/ui/useEscToClose";
import type { ContaBancaria, ContaBancariaInsert, TipoContaBancaria } from "@/types";

const TIPOS: TipoContaBancaria[] = ["Caixa", "Banco", "Aplicação"];

const VAZIO: ContaBancariaInsert = {
  nome: "", banco: "", tipo: "Banco", saldo_inicial: 0, ativo: true,
};

export default function BancosCaixaPage() {
  const { toast } = useToast();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ContaBancariaInsert>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEscToClose(modalAberto, () => setModalAberto(false));

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setContas(await getContasBancarias());
    setLoading(false);
  }

  function abrirNovo() {
    setEditId(null);
    setForm(VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(c: ContaBancaria) {
    setEditId(c.id);
    setForm({ nome: c.nome, banco: c.banco ?? "", tipo: c.tipo, saldo_inicial: c.saldo_inicial, ativo: c.ativo });
    setModalAberto(true);
  }

  function upd<K extends keyof ContaBancariaInsert>(campo: K, valor: ContaBancariaInsert[K]) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  async function salvar() {
    if (!form.nome.trim()) { toast("Informe o nome da conta", "err"); return; }
    setSalvando(true);
    const res = editId != null
      ? await updateContaBancaria(editId, form)
      : await createContaBancaria(form);
    setSalvando(false);
    if (res) {
      toast(editId != null ? "Conta atualizada" : "Conta criada");
      setModalAberto(false);
      load();
    } else {
      toast("Erro ao salvar conta", "err");
    }
  }

  async function handleDeletar(c: ContaBancaria) {
    if (!confirm(`Excluir a conta ${c.nome}?`)) return;
    const ok = await deletarContaBancaria(c.id);
    if (ok) { toast("Conta excluída"); load(); }
    else toast("Erro ao excluir conta", "err");
  }

  async function toggleAtivo(c: ContaBancaria) {
    const res = await updateContaBancaria(c.id, { ativo: !c.ativo });
    if (res) load();
  }

  const filtradas = contas.filter(c =>
    !busca ||
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.banco ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  const totalAtivos = contas.filter(c => c.ativo).length;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Bancos &amp; Caixa</div>
        <SearchInput placeholder="Buscar por nome ou banco..." value={busca} onChange={setBusca} />
        <button className="btn bp sm" onClick={abrirNovo}>+ Nova Conta</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando contas...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Banco</th>
                  <th>Tipo</th>
                  <th>Saldo Inicial</th>
                  <th>Status</th>
                  <th style={{ width: "80px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhuma conta cadastrada
                    </td>
                  </tr>
                )}
                {filtradas.map(c => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => abrirEdicao(c)}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                  >
                    <td><strong>{c.nome}</strong></td>
                    <td>{c.banco || "—"}</td>
                    <td>{c.tipo}</td>
                    <td className="mono">{formatBRL(c.saldo_inicial)}</td>
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
                        title="Excluir conta"
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
        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--t3)" }}>{totalAtivos} conta(s) ativa(s)</div>
      </div>

      {modalAberto && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalAberto(false)}>
          <div className="mod" style={{ width: "480px" }}>
            <div className="mhd">
              <div className="mtit">{editId != null ? "Editar" : "Nova"} conta</div>
              <button className="mcl" onClick={() => setModalAberto(false)}>✕</button>
            </div>

            <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <Campo label="Nome *" span2>
                <input className="fc" placeholder="Caixa loja, Itaú CC, Aplicação XP..." value={form.nome} onChange={e => upd("nome", e.target.value)} style={{ margin: 0 }} />
              </Campo>
              <Campo label="Banco">
                <input className="fc" value={form.banco ?? ""} onChange={e => upd("banco", e.target.value)} style={{ margin: 0 }} />
              </Campo>
              <Campo label="Tipo">
                <select className="fc" value={form.tipo} onChange={e => upd("tipo", e.target.value as TipoContaBancaria)} style={{ margin: 0 }}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Saldo inicial" span2>
                <CurrencyInput value={form.saldo_inicial} onChange={v => upd("saldo_inicial", v)} />
              </Campo>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={() => setModalAberto(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : editId != null ? "Salvar alterações" : "Criar conta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function Campo({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: span2 ? "1 / -1" : undefined }}>
      <label style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}
