"use client";

import { useEffect, useState, useId, cloneElement, isValidElement } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getContasBancarias, createContaBancaria, updateContaBancaria, deletarContaBancaria } from "@/services/contasBancarias.service";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { formatBRL } from "@/lib/formatters";
import SearchInput from "@/components/ui/SearchInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { Modal } from "@/components/ui/Modal";
import DateInput from "@/components/ui/DateInput";
import { getTransferencias, registrarTransferencia, type Transferencia } from "@/services/transferencias.service";
import type { ContaBancaria, ContaBancariaInsert, TipoContaBancaria } from "@/types";

const TIPOS: TipoContaBancaria[] = ["Caixa", "Banco", "Aplicação"];

const VAZIO: ContaBancariaInsert = {
  nome: "", banco: "", tipo: "Banco", saldo_inicial: 0, ativo: true,
};

function hoje() { return new Date().toISOString().split("T")[0]; }
function fmtData(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export default function BancosCaixaPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ContaBancariaInsert>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [modalTransfAberto, setModalTransfAberto] = useState(false);
  const [contaOrigemId, setContaOrigemId] = useState<string | number>("");
  const [contaDestinoId, setContaDestinoId] = useState<string | number>("");
  const [valorTransf, setValorTransf] = useState(0);
  const [dataTransf, setDataTransf] = useState(hoje());
  const [obsTransf, setObsTransf] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [cs, ts] = await Promise.all([getContasBancarias(), getTransferencias()]);
    setContas(cs);
    setTransferencias(ts);
    setLoading(false);
  }

  function abrirTransferencia() {
    setContaOrigemId("");
    setContaDestinoId("");
    setValorTransf(0);
    setDataTransf(hoje());
    setObsTransf("");
    setModalTransfAberto(true);
  }

  async function salvarTransferencia() {
    if (!contaOrigemId || !contaDestinoId || contaOrigemId === contaDestinoId || valorTransf <= 0) {
      toast("Selecione contas diferentes e um valor válido", "err");
      return;
    }
    setSalvando(true);
    const ok = await registrarTransferencia({
      contaOrigemId: Number(contaOrigemId),
      contaDestinoId: Number(contaDestinoId),
      valor: valorTransf,
      data: dataTransf,
      obs: obsTransf.trim() || null,
    });
    setSalvando(false);
    if (ok) { toast("Transferência registrada"); setModalTransfAberto(false); load(); }
    else toast("Erro ao registrar transferência", "err");
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
    if (!(await confirm(`Excluir a conta ${c.nome}?`, { perigo: true }))) return;
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
        <button className="btn bg sm" onClick={abrirTransferencia}>⇄ Transferência</button>
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

        <div className="ct" style={{ marginTop: "24px" }}>Transferências recentes</div>
        {transferencias.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--t3)", padding: "12px 0" }}>Nenhuma transferência registrada.</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>De</th>
                  <th>Para</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {transferencias.map(t => (
                  <tr key={t.id}>
                    <td className="mono" style={{ fontSize: "12px" }}>{fmtData(t.data)}</td>
                    <td>{t.origem?.nome ?? "—"}</td>
                    <td>{t.destino?.nome ?? "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{formatBRL(t.valor)}</td>
                    <td style={{ fontSize: "12px", color: "var(--t3)" }}>{t.obs ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={`${editId != null ? "Editar" : "Nova"} conta`} width="480px">
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
      </Modal>

      <Modal open={modalTransfAberto} onClose={() => setModalTransfAberto(false)} title="Nova Transferência" width="420px">
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <Campo label="De (conta de origem) *">
                <select className="fc" value={contaOrigemId} onChange={e => setContaOrigemId(e.target.value)} style={{ margin: 0 }}>
                  <option value="">Selecione...</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Para (conta de destino) *">
                <select className="fc" value={contaDestinoId} onChange={e => setContaDestinoId(e.target.value)} style={{ margin: 0 }}>
                  <option value="">Selecione...</option>
                  {contas.filter(c => String(c.id) !== String(contaOrigemId)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <Campo label="Valor *">
                  <CurrencyInput value={valorTransf} onChange={setValorTransf} />
                </Campo>
                <Campo label="Data *">
                  <DateInput value={dataTransf} onChange={setDataTransf} />
                </Campo>
              </div>
              <Campo label="Observação">
                <input className="fc" value={obsTransf} onChange={e => setObsTransf(e.target.value)} style={{ margin: 0 }} />
              </Campo>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={() => setModalTransfAberto(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarTransferencia} disabled={salvando}>
                {salvando ? "Salvando..." : "Confirmar transferência"}
              </button>
            </div>
      </Modal>
    </AppLayout>
  );
}

function Campo({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactElement }) {
  const id = useId();
  const campo = isValidElement(children) ? cloneElement(children, { id } as Record<string, unknown>) : children;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: span2 ? "1 / -1" : undefined }}>
      <label style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 600 }} htmlFor={id}>{label}</label>
      {campo}
    </div>
  );
}
