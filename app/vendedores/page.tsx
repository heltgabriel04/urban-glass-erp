"use client";

import { useEffect, useId, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { formatBRL } from "@/lib/formatters";
import type { Vendedor, VendedorInsert } from "@/types";

const VAZIO: VendedorInsert = {
  nome: "", email: null, telefone: null, cpf: null,
  comissao_pct: 0, ativo: true, obs: null,
};

function mascCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function mascTel(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
}

export default function VendedoresPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const comissaoFieldId = useId();
  const [vendedores, setVendedores]             = useState<Vendedor[]>([]);
  const [comissoesPendentes, setComissoesPend]  = useState<Record<number, number>>({});
  const [loading, setLoading]                   = useState(true);
  const [modal, setModal]                       = useState(false);
  const [form, setForm]                         = useState<VendedorInsert>(VAZIO);
  const [editId, setEditId]                     = useState<number | null>(null);
  const [salvando, setSalvando]                 = useState(false);
  const [filtro, setFiltro]                     = useState<"ativos" | "todos" | "inativos">("ativos");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [vRes, lRes] = await Promise.all([
      supabase.from("vendedores").select("*").order("nome"),
      supabase.from("lancamentos").select("vendedor_id, valor")
        .eq("tipo", "Saída").eq("status", "Pendente").not("vendedor_id", "is", null),
    ]);
    setVendedores((vRes.data ?? []) as Vendedor[]);
    const totais: Record<number, number> = {};
    for (const l of (lRes.data ?? []) as any[]) {
      if (l.vendedor_id) totais[l.vendedor_id] = (totais[l.vendedor_id] ?? 0) + Number(l.valor);
    }
    setComissoesPend(totais);
    setLoading(false);
  }

  function F(k: keyof VendedorInsert, v: any) { setForm(f => ({ ...f, [k]: v })); }

  function abrirNovo() { setForm(VAZIO); setEditId(null); setModal(true); }
  function abrirEdit(v: Vendedor) {
    setForm({ nome: v.nome, email: v.email, telefone: v.telefone, cpf: v.cpf, comissao_pct: v.comissao_pct, ativo: v.ativo, obs: v.obs });
    setEditId(v.id);
    setModal(true);
  }

  async function salvar() {
    if (!form.nome.trim()) { toast("Nome é obrigatório", "err"); return; }
    if (form.comissao_pct < 0 || form.comissao_pct > 100) { toast("Comissão deve ser entre 0% e 100%", "err"); return; }
    setSalvando(true);
    const payload = {
      nome:         form.nome.trim(),
      email:        form.email?.trim() || null,
      telefone:     form.telefone?.replace(/\D/g, "") || null,
      cpf:          form.cpf?.replace(/\D/g, "") || null,
      comissao_pct: form.comissao_pct,
      ativo:        form.ativo,
      obs:          form.obs?.trim() || null,
    };
    if (editId) {
      const { error } = await supabase.from("vendedores").update(payload).eq("id", editId);
      if (error) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
      toast("Vendedor atualizado");
    } else {
      const { error } = await supabase.from("vendedores").insert([payload]);
      if (error) { toast("Erro ao cadastrar", "err"); setSalvando(false); return; }
      toast("Vendedor cadastrado");
    }
    setSalvando(false);
    setModal(false);
    load();
  }

  async function toggleAtivo(v: Vendedor) {
    await supabase.from("vendedores").update({ ativo: !v.ativo }).eq("id", v.id);
    load();
  }

  async function excluir(v: Vendedor) {
    if (!(await confirm(`Excluir "${v.nome}" permanentemente? Esta ação não pode ser desfeita.`, { perigo: true }))) return;
    const { error } = await supabase.from("vendedores").delete().eq("id", v.id);
    if (error) { toast("Erro ao excluir: " + error.message, "err"); return; }
    toast(`${v.nome} excluído`);
    load();
  }

  const lista = vendedores.filter(v =>
    filtro === "todos" ? true : filtro === "ativos" ? v.ativo : !v.ativo
  );

  const totalPendente = Object.values(comissoesPendentes).reduce((a, b) => a + b, 0);

  return (
    <AppLayout>
      {/* ── TOPBAR ── */}
      <div className="tb">
        <div className="tb-title">Vendedores</div>
        {totalPendente > 0 && (
          <div style={{ fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", background: "rgba(234,179,8,.1)", border: "1px solid rgba(234,179,8,.3)", borderRadius: "6px", padding: "4px 12px" }}>
            ⚠ Comissões a pagar: <strong>{formatBRL(totalPendente)}</strong>
          </div>
        )}
        <button className="btn bp sm" onClick={abrirNovo}>+ Novo Vendedor</button>
      </div>

      <div className="con">

        {/* ── KPIs ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total",           value: String(vendedores.length),                               color: "var(--t1)",   sub: "cadastrados" },
            { label: "Ativos",          value: String(vendedores.filter(v => v.ativo).length),          color: "var(--ok)",   sub: "em operação" },
            { label: "A Pagar",         value: formatBRL(totalPendente),                                color: totalPendente > 0 ? "var(--warn)" : "var(--t2)", sub: "comissões pendentes" },
            { label: "Média Comissão",  value: vendedores.length > 0 ? (vendedores.filter(v => v.ativo).reduce((a, v) => a + v.comissao_pct, 0) / Math.max(vendedores.filter(v => v.ativo).length, 1)).toFixed(1) + "%" : "—", color: "var(--acc)", sub: "entre ativos" },
          ].map(card => (
            <div key={card.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2, marginTop: "4px" }}>{card.value}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* ── FILTROS ── */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          {(["ativos", "todos", "inativos"] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={filtro === f ? "btn bp sm" : "btn bg sm"}
              style={{ textTransform: "capitalize" }}>
              {f}
            </button>
          ))}
        </div>

        {/* ── TABELA ── */}
        {loading ? (
          <div className="loading">Carregando vendedores...</div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--t3)" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>◉</div>
            <div style={{ fontWeight: 600 }}>Nenhum vendedor {filtro !== "todos" ? filtro : "cadastrado"}</div>
            {filtro === "ativos" && <div style={{ fontSize: "12px", marginTop: "6px" }}>Clique em "+ Novo Vendedor" para começar</div>}
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>CPF</th>
                  <th>E-mail</th>
                  <th style={{ textAlign: "right" }}>Comissão</th>
                  <th style={{ textAlign: "right" }}>A Pagar</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(v => {
                  const pendente = comissoesPendentes[v.id] ?? 0;
                  return (
                    <tr key={v.id} style={{ opacity: v.ativo ? 1 : 0.55 }}>
                      <td>
                        <strong>{v.nome}</strong>
                        {v.obs && <div className="tdim">{v.obs}</div>}
                      </td>
                      <td className="mono">{v.telefone ? mascTel(v.telefone) : <span style={{ color: "var(--t3)" }}>—</span>}</td>
                      <td className="mono">{v.cpf ? mascCpf(v.cpf) : <span style={{ color: "var(--t3)" }}>—</span>}</td>
                      <td style={{ fontSize: "12px" }}>{v.email ?? <span style={{ color: "var(--t3)" }}>—</span>}</td>
                      <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: "var(--acc)", fontSize: "15px" }}>
                        {v.comissao_pct.toFixed(1)}%
                      </td>
                      <td className="mono" style={{ textAlign: "right", fontWeight: pendente > 0 ? 700 : 400, color: pendente > 0 ? "var(--warn)" : "var(--t3)" }}>
                        {pendente > 0 ? formatBRL(pendente) : "—"}
                      </td>
                      <td>
                        <span className={`chip ${v.ativo ? "cg" : "cr"}`}>{v.ativo ? "Ativo" : "Inativo"}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button className="btn bg xs" onClick={() => abrirEdit(v)}>Editar</button>
                          <button className="btn bg xs" style={{ color: v.ativo ? "var(--err)" : "var(--ok)" }} onClick={() => toggleAtivo(v)}>
                            {v.ativo ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            title="Excluir vendedor"
                            onClick={() => excluir(v)}
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", fontSize: "13px", cursor: "pointer", transition: "all 0.15s" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                          >🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar Vendedor" : "Novo Vendedor"} width="520px">
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>

              <div className="fr">
                <Campo label="Status">
                  <select className="fc" value={form.ativo ? "1" : "0"} onChange={e => F("ativo", e.target.value === "1")}>
                    <option value="1">Ativo</option>
                    <option value="0">Inativo</option>
                  </select>
                </Campo>
              </div>

              <Campo label="Nome completo *">
                <input className="fc" value={form.nome} onChange={e => F("nome", e.target.value)} placeholder="Nome do vendedor" autoFocus />
              </Campo>

              <div className="fr">
                <Campo label="Telefone">
                  <input className="fc" value={form.telefone ? mascTel(form.telefone) : ""}
                    onChange={e => F("telefone", e.target.value.replace(/\D/g, ""))}
                    placeholder="(32) 99999-9999" maxLength={15} inputMode="numeric" />
                </Campo>
                <Campo label="CPF">
                  <input className="fc" value={form.cpf ? mascCpf(form.cpf) : ""}
                    onChange={e => F("cpf", e.target.value.replace(/\D/g, ""))}
                    placeholder="000.000.000-00" maxLength={14} inputMode="numeric" />
                </Campo>
              </div>

              <Campo label="E-mail">
                <input className="fc" type="email" value={form.email ?? ""}
                  onChange={e => F("email", e.target.value || null)}
                  placeholder="vendedor@email.com" inputMode="email" />
              </Campo>

              <div className="fg">
                <label className="fl" htmlFor={comissaoFieldId}>% de Comissão por Venda</label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input id={comissaoFieldId} className="fc" type="number" min={0} max={100} step={0.5}
                    value={form.comissao_pct}
                    onChange={e => F("comissao_pct", parseFloat(e.target.value) || 0)}
                    style={{ maxWidth: "120px" }} />
                  <span style={{ fontSize: "12px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                    % fixo sobre o valor do pedido
                  </span>
                </div>
                {form.comissao_pct > 0 && (
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px", background: "var(--surf2)", borderRadius: "6px", padding: "6px 10px" }}>
                    Ex.: pedido de{" "}
                    <strong style={{ color: "var(--t1)" }}>R$ 1.000</strong>
                    {" → comissão de "}
                    <strong style={{ color: "var(--acc)" }}>
                      {formatBRL(1000 * form.comissao_pct / 100)}
                    </strong>
                    {" · pedido de "}
                    <strong style={{ color: "var(--t1)" }}>R$ 5.000</strong>
                    {" → "}
                    <strong style={{ color: "var(--acc)" }}>
                      {formatBRL(5000 * form.comissao_pct / 100)}
                    </strong>
                  </div>
                )}
              </div>

              <Campo label="Observações">
                <textarea className="fc" rows={2} style={{ resize: "vertical" }}
                  value={form.obs ?? ""} onChange={e => F("obs", e.target.value || null)}
                  placeholder="Informações adicionais..." />
              </Campo>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
              <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando || !form.nome.trim()}>
                {salvando ? "Salvando..." : editId ? "Salvar Vendedor" : "Cadastrar Vendedor"}
              </button>
            </div>
      </Modal>
    </AppLayout>
  );
}
