"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { Vendedor, VendedorInsert } from "@/types";

const VAZIO: VendedorInsert = {
  nome: "", email: null, telefone: null, cpf: null,
  comissao_pct: 0, ativo: true, obs: null,
};

function mascCpf(v: string) {
  return v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function mascTel(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
}

export default function VendedoresPage() {
  const { toast } = useToast();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [comissoesPendentes, setComissoesPendentes] = useState<Record<number, number>>({});
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [form, setForm]             = useState<VendedorInsert>(VAZIO);
  const [editId, setEditId]         = useState<number | null>(null);
  const [salvando, setSalvando]     = useState(false);
  const [filtro, setFiltro]         = useState<"todos" | "ativos" | "inativos">("ativos");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [vRes, lRes] = await Promise.all([
      supabase.from("vendedores").select("*").order("nome"),
      supabase.from("lancamentos")
        .select("vendedor_id, valor")
        .eq("tipo", "Saída")
        .eq("status", "Pendente")
        .not("vendedor_id", "is", null),
    ]);
    setVendedores((vRes.data ?? []) as Vendedor[]);
    // Agrupa comissões pendentes por vendedor
    const totais: Record<number, number> = {};
    for (const l of (lRes.data ?? []) as any[]) {
      if (l.vendedor_id) totais[l.vendedor_id] = (totais[l.vendedor_id] ?? 0) + Number(l.valor);
    }
    setComissoesPendentes(totais);
    setLoading(false);
  }

  function abrirNovo() {
    setForm(VAZIO);
    setEditId(null);
    setModal(true);
  }

  function abrirEditar(v: Vendedor) {
    setForm({
      nome: v.nome, email: v.email, telefone: v.telefone, cpf: v.cpf,
      comissao_pct: v.comissao_pct, ativo: v.ativo, obs: v.obs,
    });
    setEditId(v.id);
    setModal(true);
  }

  async function salvar() {
    if (!form.nome.trim()) { toast("Nome é obrigatório", "err"); return; }
    if (form.comissao_pct < 0 || form.comissao_pct > 100) { toast("Comissão deve ser entre 0 e 100%", "err"); return; }
    setSalvando(true);
    const payload = {
      nome:          form.nome.trim(),
      email:         form.email?.trim() || null,
      telefone:      form.telefone?.replace(/\D/g, "") || null,
      cpf:           form.cpf?.replace(/\D/g, "") || null,
      comissao_pct:  form.comissao_pct,
      ativo:         form.ativo,
      obs:           form.obs?.trim() || null,
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

  const lista = vendedores.filter(v =>
    filtro === "todos" ? true : filtro === "ativos" ? v.ativo : !v.ativo
  );

  const totalPendente = Object.values(comissoesPendentes).reduce((a, b) => a + b, 0);

  return (
    <AppLayout>
      <div className="con">
        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: "var(--t1)", margin: 0 }}>Vendedores</h1>
            <p style={{ fontSize: "12px", color: "var(--t3)", margin: "3px 0 0", fontFamily: "'DM Mono', monospace" }}>
              {vendedores.filter(v => v.ativo).length} ativo{vendedores.filter(v => v.ativo).length !== 1 ? "s" : ""} · {vendedores.length} total
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {totalPendente > 0 && (
              <div style={{ fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", background: "rgba(234,179,8,.1)", border: "1px solid rgba(234,179,8,.3)", borderRadius: "6px", padding: "4px 10px" }}>
                ⚠ Comissões a pagar: <strong>{totalPendente.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
              </div>
            )}
            <button className="btn bp" onClick={abrirNovo}>+ Novo Vendedor</button>
          </div>
        </div>

        {/* ── FILTRO ── */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          {(["ativos", "todos", "inativos"] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={filtro === f ? "btn bp" : "btn bg"}
              style={{ fontSize: "11px", padding: "4px 12px", textTransform: "capitalize" }}>
              {f}
            </button>
          ))}
        </div>

        {/* ── TABELA ── */}
        {loading ? (
          <div style={{ color: "var(--t3)", textAlign: "center", padding: "40px", fontFamily: "'DM Mono', monospace" }}>carregando...</div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--t3)" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>◎</div>
            <div style={{ fontWeight: 600 }}>Nenhum vendedor cadastrado</div>
            <div style={{ fontSize: "12px", marginTop: "6px" }}>Clique em "+ Novo Vendedor" para começar</div>
          </div>
        ) : (
          <div style={{ background: "var(--surf1)", borderRadius: "10px", border: "1px solid var(--b1)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 1fr auto", padding: "10px 16px", borderBottom: "1px solid var(--b1)" }}>
              {["Nome", "E-mail / Tel", "CPF", "Comissão", "A Pagar", "Status", ""].map((h, i) => (
                <div key={i} style={{ fontSize: "10px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono', monospace" }}>{h}</div>
              ))}
            </div>
            {lista.map((v, i) => {
              const pendente = comissoesPendentes[v.id] ?? 0;
              return (
                <div key={v.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 1fr auto", padding: "13px 16px", borderBottom: i < lista.length - 1 ? "1px solid var(--b1)" : "none", alignItems: "center", opacity: v.ativo ? 1 : 0.5 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--t1)", fontSize: "13px" }}>{v.nome}</div>
                    {v.obs && <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>{v.obs}</div>}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono', monospace" }}>
                    {v.email && <div>{v.email}</div>}
                    {v.telefone && <div>{mascTel(v.telefone)}</div>}
                    {!v.email && !v.telefone && <span style={{ color: "var(--t3)" }}>—</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono', monospace" }}>
                    {v.cpf ? mascCpf(v.cpf) : <span style={{ color: "var(--t3)" }}>—</span>}
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>
                    {v.comissao_pct.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: pendente > 0 ? 700 : 400, color: pendente > 0 ? "var(--warn)" : "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                    {pendente > 0 ? pendente.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                  </div>
                  <div>
                    <span className={`chip ${v.ativo ? "cg" : "cr"}`} style={{ fontSize: "10px" }}>{v.ativo ? "Ativo" : "Inativo"}</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button className="btn bg" style={{ fontSize: "11px", padding: "4px 10px" }} onClick={() => abrirEditar(v)}>Editar</button>
                    <button className="btn bg" style={{ fontSize: "11px", padding: "4px 10px", color: v.ativo ? "var(--err)" : "var(--ok)" }} onClick={() => toggleAtivo(v)}>
                      {v.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "var(--surf2)", borderRadius: "12px", padding: "28px", width: "480px", maxWidth: "95vw", border: "1px solid var(--b2)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "var(--t1)" }}>
                {editId ? "Editar Vendedor" : "Novo Vendedor"}
              </h2>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", color: "var(--t3)", fontSize: "20px", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="fg">
                <label className="fl">Nome *</label>
                <input className="fi" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo do vendedor" autoFocus />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="fg">
                  <label className="fl">Telefone</label>
                  <input className="fi" value={form.telefone ? mascTel(form.telefone) : ""}
                    onChange={e => setForm(f => ({ ...f, telefone: e.target.value.replace(/\D/g, "") }))}
                    placeholder="(32) 99999-9999" />
                </div>
                <div className="fg">
                  <label className="fl">CPF</label>
                  <input className="fi" value={form.cpf ? mascCpf(form.cpf) : ""}
                    onChange={e => setForm(f => ({ ...f, cpf: e.target.value.replace(/\D/g, "") }))}
                    placeholder="000.000.000-00" />
                </div>
              </div>

              <div className="fg">
                <label className="fl">E-mail</label>
                <input className="fi" type="email" value={form.email ?? ""}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value || null }))}
                  placeholder="vendedor@email.com" />
              </div>

              <div className="fg">
                <label className="fl">% de Comissão por Venda</label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input className="fi" type="number" min={0} max={100} step={0.5}
                    value={form.comissao_pct}
                    onChange={e => setForm(f => ({ ...f, comissao_pct: parseFloat(e.target.value) || 0 }))}
                    style={{ width: "100px" }} />
                  <span style={{ fontSize: "12px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
                    % fixo sobre o valor do pedido
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>
                  Ex.: pedido de R$ 1.000 → comissão de{" "}
                  <strong style={{ color: "var(--acc)" }}>
                    {(1000 * form.comissao_pct / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </strong>
                </div>
              </div>

              <div className="fg">
                <label className="fl">Observações</label>
                <textarea className="fi" style={{ minHeight: "64px", resize: "vertical" }}
                  value={form.obs ?? ""} onChange={e => setForm(f => ({ ...f, obs: e.target.value || null }))}
                  placeholder="Informações adicionais..." />
              </div>

              {editId && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" id="vendedor-ativo" checked={form.ativo}
                    onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
                  <label htmlFor="vendedor-ativo" style={{ fontSize: "13px", color: "var(--t2)", cursor: "pointer" }}>Vendedor ativo</label>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", paddingTop: "4px", borderTop: "1px solid var(--b1)", marginTop: "4px" }}>
                <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn bp" onClick={salvar} disabled={salvando}>
                  {salvando ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
