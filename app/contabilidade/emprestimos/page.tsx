"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import DatePromptModal from "@/components/ui/DatePromptModal";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import {
  getEmprestimos, criarEmprestimo, atualizarEmprestimo, inativarEmprestimo, reativarEmprestimo,
  gerarParcelasEmprestimo, getParcelasEmprestimo, marcarParcelaEmprestimoPaga, reabrirParcelaEmprestimo,
  uploadAnexoEmprestimo,
} from "@/services/emprestimos.service";
import { getContasBancarias } from "@/services/contasBancarias.service";
import type { Emprestimo, EmprestimoInsert, EmprestimoParcela, ContaBancaria } from "@/types";

function hoje() { return new Date().toISOString().split("T")[0]; }

const EMPRESTIMO_VAZIO: EmprestimoInsert = {
  descricao: "", banco: null, conta_bancaria_id: null, valor_contratado: 0,
  taxa_juros_pct_am: 0, numero_parcelas: 12, data_contratacao: hoje(), data_primeira_parcela: hoje(),
  contrato_pdf_url: null, observacoes: null, ativo: true, criado_por: null,
};

// ─── Modal: Empréstimo ──────────────────────────────────────
function ModalEmprestimo({ editando, contasBancarias, usuarioEmail, onSalvo, onFechar }: {
  editando: Emprestimo | null; contasBancarias: ContaBancaria[]; usuarioEmail: string;
  onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<EmprestimoInsert>(editando ? { ...editando } : { ...EMPRESTIMO_VAZIO });
  const [contratoFile, setContratoFile] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof EmprestimoInsert>(k: K, v: EmprestimoInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim() || !form.valor_contratado || !form.numero_parcelas) { toast("Preencha descrição, valor e número de parcelas", "err"); return; }
    setSalvando(true);

    let empId: number;
    if (editando) {
      empId = editando.id;
      const ok = await atualizarEmprestimo(empId, form);
      if (!ok) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
    } else {
      const criado = await criarEmprestimo({ ...form, criado_por: usuarioEmail });
      if (!criado) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
      empId = criado.id;
    }

    if (contratoFile) {
      const url = await uploadAnexoEmprestimo("emprestimos", empId, contratoFile, "contrato");
      if (url) await atualizarEmprestimo(empId, { contrato_pdf_url: url });
    }

    setSalvando(false);
    toast(editando ? "Empréstimo atualizado" : "Empréstimo criado");
    onSalvo();
  }

  return (
    <Modal open onClose={onFechar} title={editando ? "Editar Empréstimo" : "Novo Empréstimo"} width="560px">
        <form id="form-emprestimo" onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <Campo label="Descrição *">
            <input name="descricao" className="fc" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
          </Campo>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Campo label="Banco">
              <input name="banco" className="fc" value={form.banco ?? ""} onChange={(e) => set("banco", e.target.value || null)} />
            </Campo>
            <Campo label="Conta Bancária (recebimento)">
              <select name="conta_bancaria_id" className="fc" value={form.conta_bancaria_id ?? ""} onChange={(e) => set("conta_bancaria_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {contasBancarias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <Campo label="Valor Contratado">
              <input name="valor_contratado" className="fc" type="number" step="0.01" value={form.valor_contratado} onChange={(e) => set("valor_contratado", Number(e.target.value))} required disabled={!!editando} style={{ fontFamily: "'DM Mono', monospace" }} />
            </Campo>
            <Campo label="Taxa de Juros (% a.m.)">
              <input name="taxa_juros_pct_am" className="fc" type="number" step="0.0001" value={form.taxa_juros_pct_am} onChange={(e) => set("taxa_juros_pct_am", Number(e.target.value))} required disabled={!!editando} style={{ fontFamily: "'DM Mono', monospace" }} />
            </Campo>
            <Campo label="Nº de Parcelas">
              <input name="numero_parcelas" className="fc" type="number" value={form.numero_parcelas} onChange={(e) => set("numero_parcelas", Number(e.target.value))} required disabled={!!editando} />
            </Campo>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Campo label="Data de Contratação">
              <input name="data_contratacao" className="fc" type="date" value={form.data_contratacao} onChange={(e) => set("data_contratacao", e.target.value)} required disabled={!!editando} />
            </Campo>
            <Campo label="Data da 1ª Parcela">
              <input name="data_primeira_parcela" className="fc" type="date" value={form.data_primeira_parcela} onChange={(e) => set("data_primeira_parcela", e.target.value)} required disabled={!!editando} />
            </Campo>
          </div>
          {editando && (
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>
              Valor, taxa, nº de parcelas e datas ficam travados após a criação — eles definem a tabela de amortização já gerada.
            </div>
          )}
          <Campo label="Contrato (PDF)">
            <input name="set_contrato_file" className="fc" type="file" accept=".pdf" onChange={(e) => setContratoFile(e.target.files?.[0] ?? null)} />
          </Campo>
          <Campo label="Observações">
            <textarea name="observacoes" className="fc" rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
          </Campo>
        </form>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form="form-emprestimo" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
    </Modal>
  );
}

// ─── Página principal ───────────────────────────────────────
export default function EmprestimosPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [selecionado, setSelecionado] = useState<Emprestimo | null>(null);
  const [parcelas, setParcelas] = useState<EmprestimoParcela[]>([]);
  const [editando, setEditando] = useState<Emprestimo | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [parcelaParaPagar, setParcelaParaPagar] = useState<EmprestimoParcela | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
    getContasBancarias(true).then(setContasBancarias);
  }, []);

  useEffect(() => { load(); }, [filtroAtivo]);
  useEffect(() => { if (selecionado) loadParcelas(selecionado.id); else setParcelas([]); }, [selecionado]);

  async function load() {
    setLoading(true);
    const lista = await getEmprestimos({ ativo: filtroAtivo === "todos" ? undefined : filtroAtivo === "ativos" });
    setEmprestimos(lista);
    if (selecionado) setSelecionado(lista.find((e) => e.id === selecionado.id) ?? null);
    setLoading(false);
  }

  async function loadParcelas(id: number) {
    setParcelas(await getParcelasEmprestimo(id));
  }

  async function handleInativar(e: Emprestimo) {
    if (!(await confirm(`${e.ativo ? "Inativar" : "Reativar"} o empréstimo "${e.descricao}"?`))) return;
    const ok = e.ativo ? await inativarEmprestimo(e.id) : await reativarEmprestimo(e.id);
    toast(ok ? "Empréstimo atualizado" : "Erro ao atualizar", ok ? "ok" : "err");
    if (ok) load();
  }

  async function handleGerarParcelas() {
    if (!selecionado) return;
    if (!(await confirm(`Gerar ${selecionado.numero_parcelas} parcela(s) pela Tabela Price para "${selecionado.descricao}"? Isso só pode ser feito uma vez.`))) return;
    setGerando(true);
    const res = await gerarParcelasEmprestimo(selecionado.id);
    setGerando(false);
    toast(res.ok ? "Parcelas geradas" : (res.motivo ?? "Erro ao gerar parcelas"), res.ok ? "ok" : "err");
    if (res.ok) loadParcelas(selecionado.id);
  }

  async function handleMarcarPaga(p: EmprestimoParcela) {
    if (p.status === "pago") {
      if (!(await confirm("Reabrir esta parcela?"))) return;
      const ok = await reabrirParcelaEmprestimo(p.id);
      toast(ok ? "Parcela reaberta" : "Erro", ok ? "ok" : "err");
      if (ok && selecionado) loadParcelas(selecionado.id);
      return;
    }
    setParcelaParaPagar(p);
  }

  async function confirmarPagamento(data: string) {
    if (!parcelaParaPagar) return;
    const ok = await marcarParcelaEmprestimoPaga(parcelaParaPagar.id, data);
    toast(ok ? "Parcela marcada como paga" : "Erro", ok ? "ok" : "err");
    setParcelaParaPagar(null);
    if (ok && selecionado) loadParcelas(selecionado.id);
  }

  async function handleAnexo(p: EmprestimoParcela, file: File) {
    const url = await uploadAnexoEmprestimo("emprestimos-parcelas", p.id, file, "comprovante");
    if (url && selecionado) {
      await marcarParcelaEmprestimoPaga(p.id, p.data_pagamento ?? hoje(), url);
      loadParcelas(selecionado.id);
    }
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Empréstimos</div>
      </div>
      <ContabilidadeTabs ativo="emprestimos" />

      {modalAberto && (
        <ModalEmprestimo
          editando={editando}
          contasBancarias={contasBancarias}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalAberto(false); setEditando(null); load(); }}
          onFechar={() => { setModalAberto(false); setEditando(null); }}
        />
      )}

      {parcelaParaPagar && (
        <DatePromptModal
          titulo="Data do Pagamento"
          onConfirmar={confirmarPagamento}
          onFechar={() => setParcelaParaPagar(null)}
        />
      )}

      <div className="con">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <select name="filtro_ativo" className="fc" value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value as typeof filtroAtivo)} style={{ width: "120px" }}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
          <button className="btn bp sm" onClick={() => { setEditando(null); setModalAberto(true); }}>+ Novo Empréstimo</button>
        </div>

        {loading ? <div className="loading">Carregando...</div> : emprestimos.length === 0 ? (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhum empréstimo cadastrado.</div>
        ) : (
          <div className="tw" style={{ marginBottom: "24px" }}>
            <table>
              <thead>
                <tr><th>Descrição</th><th>Banco</th><th>Valor Contratado</th><th>Taxa a.m.</th><th>Parcelas</th><th>1ª Parcela</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {emprestimos.map((e) => (
                  <tr key={e.id} onClick={() => setSelecionado(e)} style={{ cursor: "pointer", background: selecionado?.id === e.id ? "var(--surf2)" : undefined, opacity: e.ativo ? 1 : 0.55 }}>
                    <td>{e.descricao}</td>
                    <td>{e.banco ?? "—"}</td>
                    <td className="mono">{formatBRL(e.valor_contratado)}</td>
                    <td className="mono">{e.taxa_juros_pct_am}%</td>
                    <td className="mono">{e.numero_parcelas}x</td>
                    <td>{formatDate(e.data_primeira_parcela)}</td>
                    <td style={{ display: "flex", gap: "6px" }} onClick={(ev) => ev.stopPropagation()}>
                      <button className="btn bg xs" onClick={() => { setEditando(e); setModalAberto(true); }}>Editar</button>
                      <button className="btn bg xs" onClick={() => handleInativar(e)}>{e.ativo ? "Inativar" : "Reativar"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selecionado && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>Parcelas — {selecionado.descricao}</div>
              {parcelas.length === 0 && (
                <button className="btn bp sm" onClick={handleGerarParcelas} disabled={gerando}>{gerando ? "Gerando..." : "Gerar Parcelas (Tabela Price)"}</button>
              )}
            </div>

            {parcelas.length === 0 ? (
              <div className="card" style={{ padding: "24px", textAlign: "center", color: "var(--t3)" }}>Nenhuma parcela gerada ainda.</div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr><th>#</th><th>Vencimento</th><th>Parcela</th><th>Juros</th><th>Amortização</th><th>Saldo Devedor</th><th>Status</th><th>Comprovante</th><th>Ação</th></tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p) => (
                      <tr key={p.id} style={{ opacity: p.status === "pago" ? 0.7 : 1 }}>
                        <td className="mono">{p.numero_parcela}</td>
                        <td>{formatDate(p.vencimento)}</td>
                        <td className="mono">{formatBRL(p.valor_parcela)}</td>
                        <td className="mono">{formatBRL(p.valor_juros)}</td>
                        <td className="mono">{formatBRL(p.valor_amortizacao)}</td>
                        <td className="mono">{formatBRL(p.saldo_devedor_apos)}</td>
                        <td><span className={p.status === "pago" ? "chip cg" : "chip cgr"} style={{ fontSize: "11px" }}>{p.status === "pago" ? "Pago" : "Pendente"}</span></td>
                        <td>
                          {p.comprovante_url ? (
                            <a href={p.comprovante_url} target="_blank" rel="noreferrer" style={{ fontSize: "11px" }}>Ver</a>
                          ) : (
                            <input type="file" name={`comprovante_${p.id}`} style={{ fontSize: "10px", width: "90px" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnexo(p, f); }} />
                          )}
                        </td>
                        <td><button className="btn bg xs" onClick={() => handleMarcarPaga(p)}>{p.status === "pago" ? "Reabrir" : "Marcar Paga"}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
