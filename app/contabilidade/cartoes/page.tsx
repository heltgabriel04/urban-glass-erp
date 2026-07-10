"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { usePrompt } from "@/components/ui/prompt";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import { ordenarPorCodigoEstruturado } from "@/lib/planoContas";
import {
  getCartoes, criarCartao, atualizarCartao, inativarCartao, reativarCartao,
  getFaturas, criarFatura, atualizarFatura,
  getLancamentosFatura, getLancamentosCartao, criarLancamentoCartao, atualizarLancamentoCartao, softDeleteLancamentoCartao,
  uploadAnexoCartao,
} from "@/services/cartoes.service";
import { getFornecedores } from "@/services/fornecedores.service";
import { getContasBancarias } from "@/services/contasBancarias.service";
import type {
  Cartao, CartaoInsert, CartaoFatura, CartaoFaturaInsert, CartaoLancamento, CartaoLancamentoInsert,
  Fornecedor, ContaBancaria,
} from "@/types";

interface PlanoContasOpcao { id: number; codigo_estruturado: string; descricao: string }

function hoje() { return new Date().toISOString().split("T")[0]; }

const CARTAO_VAZIO: CartaoInsert = {
  nome: "", tipo: "credito", bandeira: null, banco_emissor: null, final_numero: null,
  conta_bancaria_id: null, limite: null, dia_fechamento: null, dia_vencimento: null,
  ativo: true, criado_por: null,
};

const LANC_VAZIO: Omit<CartaoLancamentoInsert, "cartao_id" | "fatura_id"> = {
  data: hoje(), descricao: "", plano_contas_id: null, fornecedor_id: null, valor: 0,
  parcela_atual: null, parcela_total: null, comprovante_url: null, conciliado: false,
  observacoes: null, criado_por: null,
};

// ─── Modal: Cartão ──────────────────────────────────────────
function ModalCartao({ editando, contasBancarias, usuarioEmail, onSalvo, onFechar }: {
  editando: Cartao | null; contasBancarias: ContaBancaria[]; usuarioEmail: string;
  onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<CartaoInsert>(editando ? { ...editando } : { ...CARTAO_VAZIO });
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof CartaoInsert>(k: K, v: CartaoInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { toast("Preencha o nome do cartão", "err"); return; }
    setSalvando(true);
    const ok = editando
      ? await atualizarCartao(editando.id, form)
      : !!(await criarCartao({ ...form, criado_por: usuarioEmail }));
    setSalvando(false);
    if (!ok) { toast("Erro ao salvar", "err"); return; }
    toast(editando ? "Cartão atualizado" : "Cartão criado");
    onSalvo();
  }

  return (
    <div className="mov open" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="mod" style={{ width: "520px" }}>
        <div className="mhd">
          <div className="mtit">{editando ? "Editar Cartão" : "Novo Cartão"}</div>
          <button className="mcl" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <form id="form-cartao" onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Nome *</label>
              <input className="fc" value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
            </div>
            <div className="fg">
              <label className="fl">Tipo</label>
              <select className="fc" value={form.tipo} onChange={(e) => set("tipo", e.target.value as Cartao["tipo"])}>
                <option value="credito">Crédito</option>
                <option value="debito">Débito</option>
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Bandeira</label>
              <input className="fc" value={form.bandeira ?? ""} onChange={(e) => set("bandeira", e.target.value || null)} />
            </div>
            <div className="fg">
              <label className="fl">Banco Emissor</label>
              <input className="fc" value={form.banco_emissor ?? ""} onChange={(e) => set("banco_emissor", e.target.value || null)} />
            </div>
            <div className="fg">
              <label className="fl">Final do Número</label>
              <input className="fc" maxLength={4} value={form.final_numero ?? ""} onChange={(e) => set("final_numero", e.target.value || null)} />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Conta Bancária (débito/pagamento da fatura)</label>
            <select className="fc" value={form.conta_bancaria_id ?? ""} onChange={(e) => set("conta_bancaria_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {contasBancarias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          {form.tipo === "credito" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <div className="fg">
                <label className="fl">Limite</label>
                <input className="fc" type="number" step="0.01" value={form.limite ?? ""} onChange={(e) => set("limite", e.target.value ? Number(e.target.value) : null)} style={{ fontFamily: "'DM Mono', monospace" }} />
              </div>
              <div className="fg">
                <label className="fl">Dia de Fechamento</label>
                <input className="fc" type="number" min={1} max={31} value={form.dia_fechamento ?? ""} onChange={(e) => set("dia_fechamento", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="fg">
                <label className="fl">Dia de Vencimento</label>
                <input className="fc" type="number" min={1} max={31} value={form.dia_vencimento ?? ""} onChange={(e) => set("dia_vencimento", e.target.value ? Number(e.target.value) : null)} />
              </div>
            </div>
          )}
        </form>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form="form-cartao" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Fatura ──────────────────────────────────────────
function ModalFatura({ cartao, editando, onSalvo, onFechar }: {
  cartao: Cartao; editando: CartaoFatura | null; onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const agora = new Date();
  const [form, setForm] = useState<CartaoFaturaInsert>(
    editando ? { ...editando } : {
      cartao_id: cartao.id, competencia_ano: agora.getFullYear(), competencia_mes: agora.getMonth() + 1,
      status: "aberta", data_fechamento: null, data_vencimento: null, data_pagamento: null,
      pdf_url: null, comprovante_pagamento_url: null, observacoes: null, criado_por: null,
    }
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof CartaoFaturaInsert>(k: K, v: CartaoFaturaInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    let faturaId: number;
    if (editando) {
      faturaId = editando.id;
      const ok = await atualizarFatura(faturaId, form);
      if (!ok) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
    } else {
      const criada = await criarFatura(form);
      if (!criada) { toast("Erro ao salvar (competência já existe?)", "err"); setSalvando(false); return; }
      faturaId = criada.id;
    }

    const patch: Partial<CartaoFaturaInsert> = {};
    if (pdfFile) { const url = await uploadAnexoCartao("cartoes-faturas", faturaId, pdfFile, "fatura"); if (url) patch.pdf_url = url; }
    if (comprovanteFile) { const url = await uploadAnexoCartao("cartoes-faturas", faturaId, comprovanteFile, "comprovante"); if (url) patch.comprovante_pagamento_url = url; }
    if (Object.keys(patch).length > 0) await atualizarFatura(faturaId, patch);

    setSalvando(false);
    toast(editando ? "Fatura atualizada" : "Fatura criada");
    onSalvo();
  }

  return (
    <div className="mov open" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="mod" style={{ width: "520px" }}>
        <div className="mhd">
          <div className="mtit">{editando ? `Editar Fatura — ${cartao.nome}` : `Nova Fatura — ${cartao.nome}`}</div>
          <button className="mcl" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <form id="form-fatura" onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Competência — Mês</label>
              <input className="fc" type="number" min={1} max={12} value={form.competencia_mes} onChange={(e) => set("competencia_mes", Number(e.target.value))} required disabled={!!editando} />
            </div>
            <div className="fg">
              <label className="fl">Competência — Ano</label>
              <input className="fc" type="number" value={form.competencia_ano} onChange={(e) => set("competencia_ano", Number(e.target.value))} required disabled={!!editando} />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Status</label>
            <select className="fc" value={form.status} onChange={(e) => set("status", e.target.value as CartaoFatura["status"])}>
              <option value="aberta">Aberta</option>
              <option value="fechada">Fechada</option>
              <option value="paga">Paga</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Data de Fechamento</label>
              <input className="fc" type="date" value={form.data_fechamento ?? ""} onChange={(e) => set("data_fechamento", e.target.value || null)} />
            </div>
            <div className="fg">
              <label className="fl">Data de Vencimento</label>
              <input className="fc" type="date" value={form.data_vencimento ?? ""} onChange={(e) => set("data_vencimento", e.target.value || null)} />
            </div>
          </div>
          {form.status === "paga" && (
            <div className="fg">
              <label className="fl">Data de Pagamento</label>
              <input className="fc" type="date" value={form.data_pagamento ?? ""} onChange={(e) => set("data_pagamento", e.target.value || null)} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">PDF da Fatura</label>
              <input className="fc" type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="fg">
              <label className="fl">Comprovante de Pagamento</label>
              <input className="fc" type="file" onChange={(e) => setComprovanteFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Observações</label>
            <textarea className="fc" rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
          </div>
        </form>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form="form-fatura" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Lançamentos da Fatura ───────────────────────────
function ModalLancamentos({ cartao, fatura, fornecedores, planoContas, usuarioEmail, onFechar, onMudou }: {
  cartao: Cartao; fatura: CartaoFatura | null; fornecedores: Fornecedor[]; planoContas: PlanoContasOpcao[]; usuarioEmail: string;
  onFechar: () => void; onMudou: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [lancamentos, setLancamentos] = useState<CartaoLancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof LANC_VAZIO>({ ...LANC_VAZIO });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, [fatura?.id]);

  async function load() {
    setLoading(true);
    setLancamentos(fatura ? await getLancamentosFatura(fatura.id) : await getLancamentosCartao(cartao.id, { semFatura: true }));
    setLoading(false);
  }

  function set<K extends keyof typeof LANC_VAZIO>(k: K, v: (typeof LANC_VAZIO)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim() || !form.valor) { toast("Preencha descrição e valor", "err"); return; }
    setSalvando(true);
    const criado = await criarLancamentoCartao({
      ...form, cartao_id: cartao.id, fatura_id: fatura?.id ?? null, criado_por: usuarioEmail,
    });
    setSalvando(false);
    if (!criado) { toast("Erro ao adicionar lançamento", "err"); return; }
    toast("Lançamento adicionado");
    setForm({ ...LANC_VAZIO });
    load();
    onMudou();
  }

  async function handleExcluir(id: number) {
    const motivo = (await prompt("Motivo da exclusão (opcional):", { titulo: "Excluir lançamento" })) ?? undefined;
    if (!(await confirm("Excluir este lançamento? O registro fica no histórico, não é apagado de fato.", { perigo: true }))) return;
    const ok = await softDeleteLancamentoCartao(id, usuarioEmail, motivo);
    toast(ok ? "Lançamento excluído" : "Erro ao excluir", ok ? "ok" : "err");
    if (ok) { load(); onMudou(); }
  }

  async function handleAnexo(id: number, file: File) {
    const url = await uploadAnexoCartao("cartoes-lancamentos", id, file, "comprovante");
    if (url) { await atualizarLancamentoCartao(id, { comprovante_url: url }); load(); }
  }

  const total = lancamentos.reduce((s, l) => s + Number(l.valor), 0);

  return (
    <div className="mov open" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="mod" style={{ width: "780px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="mhd">
          <div className="mtit">
            {fatura ? `Lançamentos — ${cartao.nome} (${String(fatura.competencia_mes).padStart(2, "0")}/${fatura.competencia_ano})` : `Lançamentos avulsos (débito) — ${cartao.nome}`}
          </div>
          <button className="mcl" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr auto", gap: "8px", marginBottom: "16px", alignItems: "end" }}>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Data</label>
              <input className="fc" type="date" value={form.data} onChange={(e) => set("data", e.target.value)} required />
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Descrição</label>
              <input className="fc" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Fornecedor</label>
              <select className="fc" value={form.fornecedor_id ?? ""} onChange={(e) => set("fornecedor_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Conta</label>
              <select className="fc" value={form.plano_contas_id ?? ""} onChange={(e) => set("plano_contas_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {planoContas.map((p) => <option key={p.id} value={p.id}>{p.codigo_estruturado}</option>)}
              </select>
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Valor</label>
              <input className="fc" type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", Number(e.target.value))} required style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
            <button type="submit" className="btn bp sm" disabled={salvando}>+ Add</button>
          </form>

          {loading ? <div className="loading">Carregando...</div> : lancamentos.length === 0 ? (
            <div className="card" style={{ padding: "24px", textAlign: "center", color: "var(--t3)" }}>Nenhum lançamento.</div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr><th>Data</th><th>Descrição</th><th>Fornecedor</th><th>Parcela</th><th>Valor</th><th>Comprovante</th><th>Ação</th></tr>
                </thead>
                <tbody>
                  {lancamentos.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDate(l.data)}</td>
                      <td>{l.descricao}</td>
                      <td>{l.fornecedores?.nome ?? "—"}</td>
                      <td>{l.parcela_atual && l.parcela_total ? `${l.parcela_atual}/${l.parcela_total}` : "—"}</td>
                      <td className="mono">{formatBRL(l.valor)}</td>
                      <td>
                        {l.comprovante_url ? (
                          <a href={l.comprovante_url} target="_blank" rel="noreferrer" style={{ fontSize: "11px" }}>Ver</a>
                        ) : (
                          <input type="file" style={{ fontSize: "10px", width: "90px" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnexo(l.id, f); }} />
                        )}
                      </td>
                      <td><button className="btn bg xs" onClick={() => handleExcluir(l.id)}>Excluir</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>Total</td><td className="mono" style={{ fontWeight: 700 }}>{formatBRL(total)}</td><td colSpan={2}></td></tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ───────────────────────────────────────
export default function CartoesPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [faturas, setFaturas] = useState<CartaoFatura[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [planoContas, setPlanoContas] = useState<PlanoContasOpcao[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [cartaoSelecionado, setCartaoSelecionado] = useState<Cartao | null>(null);
  const [editandoCartao, setEditandoCartao] = useState<Cartao | null>(null);
  const [modalCartaoAberto, setModalCartaoAberto] = useState(false);
  const [editandoFatura, setEditandoFatura] = useState<CartaoFatura | null>(null);
  const [modalFaturaAberto, setModalFaturaAberto] = useState(false);
  const [faturaLancamentos, setFaturaLancamentos] = useState<CartaoFatura | null | "avulso">(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
    getFornecedores(true).then(setFornecedores);
    getContasBancarias(true).then(setContasBancarias);
    supabase.from("plano_contas").select("id, codigo_estruturado, descricao").eq("ativo", true).then(({ data }) => {
      setPlanoContas(ordenarPorCodigoEstruturado((data ?? []) as PlanoContasOpcao[]));
    });
  }, []);

  useEffect(() => { loadCartoes(); }, [filtroAtivo]);
  useEffect(() => { if (cartaoSelecionado) loadFaturas(cartaoSelecionado.id); else setFaturas([]); }, [cartaoSelecionado]);

  async function loadCartoes() {
    setLoading(true);
    const lista = await getCartoes({ ativo: filtroAtivo === "todos" ? undefined : filtroAtivo === "ativos" });
    setCartoes(lista);
    if (cartaoSelecionado) {
      const atualizado = lista.find((c) => c.id === cartaoSelecionado.id);
      setCartaoSelecionado(atualizado ?? null);
    }
    setLoading(false);
  }

  async function loadFaturas(cartaoId: number) {
    setFaturas(await getFaturas({ cartaoId }));
  }

  async function handleInativar(c: Cartao) {
    if (!(await confirm(`${c.ativo ? "Inativar" : "Reativar"} o cartão "${c.nome}"?`))) return;
    const ok = c.ativo ? await inativarCartao(c.id) : await reativarCartao(c.id);
    toast(ok ? "Cartão atualizado" : "Erro ao atualizar", ok ? "ok" : "err");
    if (ok) loadCartoes();
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Cartões</div>
      </div>
      <ContabilidadeTabs ativo="cartoes" />

      {modalCartaoAberto && (
        <ModalCartao
          editando={editandoCartao}
          contasBancarias={contasBancarias}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalCartaoAberto(false); setEditandoCartao(null); loadCartoes(); }}
          onFechar={() => { setModalCartaoAberto(false); setEditandoCartao(null); }}
        />
      )}

      {modalFaturaAberto && cartaoSelecionado && (
        <ModalFatura
          cartao={cartaoSelecionado}
          editando={editandoFatura}
          onSalvo={() => { setModalFaturaAberto(false); setEditandoFatura(null); loadFaturas(cartaoSelecionado.id); }}
          onFechar={() => { setModalFaturaAberto(false); setEditandoFatura(null); }}
        />
      )}

      {faturaLancamentos && cartaoSelecionado && (
        <ModalLancamentos
          cartao={cartaoSelecionado}
          fatura={faturaLancamentos === "avulso" ? null : faturaLancamentos}
          fornecedores={fornecedores}
          planoContas={planoContas}
          usuarioEmail={usuarioEmail}
          onFechar={() => setFaturaLancamentos(null)}
          onMudou={() => loadFaturas(cartaoSelecionado.id)}
        />
      )}

      <div className="con">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <select className="fc" value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value as typeof filtroAtivo)} style={{ width: "120px" }}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
          <button className="btn bp sm" onClick={() => { setEditandoCartao(null); setModalCartaoAberto(true); }}>+ Novo Cartão</button>
        </div>

        {loading ? <div className="loading">Carregando...</div> : cartoes.length === 0 ? (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhum cartão cadastrado.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px", marginBottom: "24px" }}>
            {cartoes.map((c) => (
              <div
                key={c.id}
                onClick={() => setCartaoSelecionado(c)}
                style={{
                  background: cartaoSelecionado?.id === c.id ? "var(--surf2)" : "var(--surf1)",
                  border: cartaoSelecionado?.id === c.id ? "1px solid var(--acc)" : "1px solid var(--b1)",
                  borderRadius: "10px", padding: "14px 16px", cursor: "pointer", opacity: c.ativo ? 1 : 0.55,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--t1)" }}>{c.nome}</div>
                  <span className="chip cgr" style={{ fontSize: "10px" }}>{c.tipo === "credito" ? "Crédito" : "Débito"}</span>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--t3)", marginTop: "4px" }}>
                  {c.bandeira ?? "—"} {c.final_numero ? `•••• ${c.final_numero}` : ""}
                </div>
                {c.tipo === "credito" && c.limite != null && (
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>Limite: <span className="mono">{formatBRL(c.limite)}</span></div>
                )}
                <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                  <button className="btn bg xs" onClick={(e) => { e.stopPropagation(); setEditandoCartao(c); setModalCartaoAberto(true); }}>Editar</button>
                  <button className="btn bg xs" onClick={(e) => { e.stopPropagation(); handleInativar(c); }}>{c.ativo ? "Inativar" : "Reativar"}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cartaoSelecionado && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>
                {cartaoSelecionado.tipo === "credito" ? `Faturas — ${cartaoSelecionado.nome}` : `Lançamentos — ${cartaoSelecionado.nome}`}
              </div>
              {cartaoSelecionado.tipo === "credito" ? (
                <button className="btn bp sm" onClick={() => { setEditandoFatura(null); setModalFaturaAberto(true); }}>+ Nova Fatura</button>
              ) : (
                <button className="btn bp sm" onClick={() => setFaturaLancamentos("avulso")}>+ Ver Lançamentos</button>
              )}
            </div>

            {cartaoSelecionado.tipo === "credito" && (
              faturas.length === 0 ? (
                <div className="card" style={{ padding: "24px", textAlign: "center", color: "var(--t3)" }}>Nenhuma fatura cadastrada.</div>
              ) : (
                <div className="tw">
                  <table>
                    <thead>
                      <tr><th>Competência</th><th>Status</th><th>Valor Total</th><th>Vencimento</th><th>Pagamento</th><th>Ação</th></tr>
                    </thead>
                    <tbody>
                      {faturas.map((f) => (
                        <tr key={f.id}>
                          <td className="mono">{String(f.competencia_mes).padStart(2, "0")}/{f.competencia_ano}</td>
                          <td>
                            <span className={f.status === "paga" ? "chip cg" : f.status === "fechada" ? "chip cy" : "chip cgr"} style={{ fontSize: "11px" }}>
                              {f.status === "paga" ? "Paga" : f.status === "fechada" ? "Fechada" : "Aberta"}
                            </span>
                          </td>
                          <td className="mono">{formatBRL(f.valor_total)}</td>
                          <td>{f.data_vencimento ? formatDate(f.data_vencimento) : "—"}</td>
                          <td>{f.data_pagamento ? formatDate(f.data_pagamento) : "—"}</td>
                          <td style={{ display: "flex", gap: "6px" }}>
                            <button className="btn bg xs" onClick={() => setFaturaLancamentos(f)}>Lançamentos</button>
                            <button className="btn bg xs" onClick={() => { setEditandoFatura(f); setModalFaturaAberto(true); }}>Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
