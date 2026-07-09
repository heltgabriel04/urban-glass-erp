"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import { getRecorrencias, createRecorrencia, updateRecorrencia, deletarRecorrencia, gerarProximosMeses } from "@/services/recorrencias.service";
import { getContasBancarias } from "@/services/contasBancarias.service";
import { useToast } from "@/components/ui/toast";
import { useEscToClose } from "@/components/ui/useEscToClose";
import ActionMenu from "@/components/ui/ActionMenu";
import SearchInput from "@/components/ui/SearchInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { LancamentoRecorrente, LancamentoRecorrenteInsert, ContaBancaria } from "@/types";

interface PlanoItem { id: number; codigo_estruturado: string; descricao: string; }
interface ClienteItem { id: number; nome: string; }

const VAZIO: LancamentoRecorrenteInsert = {
  tipo: "Saída", descricao: "", valor: 0, dia_vencimento: 5,
  plano_contas_id: null, conta_id: null,
  fornecedor: "", cliente_id: null, ativo: true,
};

function fmtData(s: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export default function RecorrenciasPage() {
  const { toast } = useToast();
  const [regras, setRegras] = useState<LancamentoRecorrente[]>([]);
  const [planos, setPlanos] = useState<PlanoItem[]>([]);
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<LancamentoRecorrenteInsert>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEscToClose(modalAberto, () => setModalAberto(false));

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [rs, pls, cls, cbs] = await Promise.all([
      getRecorrencias(),
      supabase.from("plano_contas").select("id, codigo_estruturado, descricao").order("codigo"),
      supabase.from("clientes").select("id, nome").order("nome"),
      getContasBancarias(true),
    ]);
    setRegras(rs);
    setPlanos(((pls as { data: PlanoItem[] | null }).data ?? []));
    setClientes(((cls as { data: ClienteItem[] | null }).data ?? []));
    setContasBancarias(cbs);
    setLoading(false);
  }

  function abrirNovo() {
    setEditId(null);
    setForm(VAZIO);
    setModalAberto(true);
  }
  function abrirEdicao(r: LancamentoRecorrente) {
    setEditId(r.id);
    setForm({
      tipo: r.tipo, descricao: r.descricao, valor: r.valor, dia_vencimento: r.dia_vencimento,
      plano_contas_id: r.plano_contas_id, conta_id: r.conta_id,
      fornecedor: r.fornecedor ?? "", cliente_id: r.cliente_id, ativo: r.ativo,
    });
    setModalAberto(true);
  }

  function upd<K extends keyof LancamentoRecorrenteInsert>(campo: K, valor: LancamentoRecorrenteInsert[K]) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  async function salvar() {
    if (!form.descricao.trim() || form.valor <= 0) { toast("Informe descrição e valor", "err"); return; }
    setSalvando(true);
    if (editId != null) {
      const res = await updateRecorrencia(editId, form);
      setSalvando(false);
      if (res) { toast("Recorrência atualizada"); setModalAberto(false); load(); }
      else toast("Erro ao salvar recorrência", "err");
      return;
    }
    const nova = await createRecorrencia(form);
    if (!nova) { setSalvando(false); toast("Erro ao criar recorrência", "err"); return; }
    const geradas = await gerarProximosMeses(nova.id, 12);
    setSalvando(false);
    toast(`Recorrência criada — ${geradas} lançamento(s) gerado(s)`);
    setModalAberto(false);
    load();
  }

  async function handleDeletar(r: LancamentoRecorrente) {
    if (!confirm(`Excluir a recorrência "${r.descricao}"? Os lançamentos já gerados não são apagados.`)) return;
    const ok = await deletarRecorrencia(r.id);
    if (ok) { toast("Recorrência excluída"); load(); }
    else toast("Erro ao excluir recorrência", "err");
  }

  async function handleGerarMais(r: LancamentoRecorrente) {
    const n = await gerarProximosMeses(r.id, 12);
    if (n > 0) { toast(`${n} lançamento(s) gerado(s)`); load(); }
    else toast("Erro ao gerar lançamentos", "err");
  }

  async function toggleAtivo(r: LancamentoRecorrente) {
    const res = await updateRecorrencia(r.id, { ativo: !r.ativo });
    if (res) load();
  }

  const filtradas = regras.filter(r => !busca || r.descricao.toLowerCase().includes(busca.toLowerCase()));
  const totalAtivas = regras.filter(r => r.ativo).length;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Recorrências</div>
        <SearchInput placeholder="Buscar por descrição..." value={busca} onChange={setBusca} />
        <button className="btn bp sm" onClick={abrirNovo}>+ Nova Recorrência</button>
      </div>

      <div className="con">
        <div className="al al-i" style={{ marginBottom: "16px", fontSize: "12px" }}>
          Ao criar uma recorrência, os próximos 12 lançamentos já são gerados de uma vez em Contas a Pagar/Receber.
          Use &quot;Gerar mais 12 meses&quot; pra continuar de onde parou.
        </div>

        {loading ? (
          <div className="loading">Carregando recorrências...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Dia</th>
                  <th>Gerado até</th>
                  <th>Status</th>
                  <th style={{ width: "50px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhuma recorrência cadastrada
                    </td>
                  </tr>
                )}
                {filtradas.map(r => (
                  <tr key={r.id}>
                    <td>
                      <span className={r.tipo === "Entrada" ? "chip cg" : "chip cr"}>{r.tipo}</span>
                    </td>
                    <td>
                      {(r.clientes?.nome ?? r.fornecedor) && <strong>{r.clientes?.nome ?? r.fornecedor}</strong>}
                      <div className={r.clientes?.nome || r.fornecedor ? "tdim" : undefined}>{r.descricao}</div>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{formatBRL(r.valor)}</td>
                    <td className="mono">{r.dia_vencimento}</td>
                    <td className="mono" style={{ fontSize: "12px" }}>{fmtData(r.gerado_ate)}</td>
                    <td>
                      <button
                        onClick={() => toggleAtivo(r)}
                        className={r.ativo ? "chip cg" : "chip cgr"}
                        style={{ border: "none", cursor: "pointer" }}
                        title="Alternar ativo/inativo"
                      >{r.ativo ? "Ativa" : "Inativa"}</button>
                    </td>
                    <td>
                      <ActionMenu items={[
                        { label: "Gerar mais 12 meses", onClick: () => handleGerarMais(r) },
                        { label: "Editar", onClick: () => abrirEdicao(r) },
                        { label: "Excluir", onClick: () => handleDeletar(r), danger: true },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--t3)" }}>{totalAtivas} recorrência(s) ativa(s)</div>
      </div>

      {modalAberto && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalAberto(false)}>
          <div className="mod" style={{ width: "560px" }}>
            <div className="mhd">
              <div className="mtit">{editId != null ? "Editar" : "Nova"} recorrência</div>
              <button className="mcl" onClick={() => setModalAberto(false)}>✕</button>
            </div>

            <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <Campo label="Tipo *">
                <select className="fc" value={form.tipo} onChange={e => upd("tipo", e.target.value as "Entrada" | "Saída")} style={{ margin: 0 }}>
                  <option value="Saída">Saída (a pagar)</option>
                  <option value="Entrada">Entrada (a receber)</option>
                </select>
              </Campo>
              <Campo label="Dia do vencimento *">
                <input className="fc" type="number" min={1} max={28} value={form.dia_vencimento}
                  onChange={e => upd("dia_vencimento", Number(e.target.value))} style={{ margin: 0 }} />
              </Campo>

              <Campo label="Descrição *" span2>
                <input className="fc" placeholder="Aluguel, mensalidade, assinatura..." value={form.descricao}
                  onChange={e => upd("descricao", e.target.value)} style={{ margin: 0 }} />
              </Campo>

              <Campo label="Valor *">
                <CurrencyInput value={form.valor} onChange={v => upd("valor", v)} />
              </Campo>
              {form.tipo === "Saída" ? (
                <Campo label="Fornecedor">
                  <input className="fc" value={form.fornecedor ?? ""} onChange={e => upd("fornecedor", e.target.value)} style={{ margin: 0 }} />
                </Campo>
              ) : (
                <Campo label="Cliente">
                  <select className="fc" value={form.cliente_id ?? ""} onChange={e => upd("cliente_id", e.target.value ? Number(e.target.value) : null)} style={{ margin: 0 }}>
                    <option value="">Selecione...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Campo>
              )}

              <Campo label="Plano de Contas" span2>
                <select className="fc" value={form.plano_contas_id ?? ""} onChange={e => upd("plano_contas_id", e.target.value ? Number(e.target.value) : null)} style={{ margin: 0 }}>
                  <option value="">Selecione...</option>
                  {planos.map(p => <option key={p.id} value={p.id}>{p.codigo_estruturado} · {p.descricao}</option>)}
                </select>
              </Campo>

              <Campo label="Conta Bancária" span2>
                <select className="fc" value={form.conta_id ?? ""} onChange={e => upd("conta_id", e.target.value ? Number(e.target.value) : null)} style={{ margin: 0 }}>
                  <option value="">Selecione...</option>
                  {contasBancarias.map(cb => <option key={cb.id} value={cb.id}>{cb.nome}</option>)}
                </select>
              </Campo>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={() => setModalAberto(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : editId != null ? "Salvar alterações" : "Criar e gerar 12 meses"}
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
