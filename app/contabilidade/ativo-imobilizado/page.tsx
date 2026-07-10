"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import { ordenarPorCodigoEstruturado } from "@/lib/planoContas";
import { CATEGORIAS_ATIVO, labelCategoriaAtivo } from "@/lib/ativosImobilizadosConstants";
import { calcularDepreciacao } from "@/lib/depreciacao";
import {
  getAtivosImobilizados, criarAtivoImobilizado, atualizarAtivoImobilizado,
  inativarAtivoImobilizado, reativarAtivoImobilizado, uploadAnexoAtivoImobilizado,
} from "@/services/ativosImobilizados.service";
import { getFornecedores } from "@/services/fornecedores.service";
import type { AtivoImobilizado, AtivoImobilizadoInsert, CategoriaAtivoImobilizado, Fornecedor } from "@/types";

interface PlanoContasOpcao { id: number; codigo_estruturado: string; descricao: string }

function hoje() { return new Date().toISOString().split("T")[0]; }

const ATIVO_VAZIO: AtivoImobilizadoInsert = {
  numero_patrimonio: "", descricao: "", categoria: "outros",
  fornecedor_id: null, documento_fiscal_id: null, numero_nota: null, plano_contas_id: null,
  valor_aquisicao: 0, valor_residual: 0, vida_util_meses: 60, data_aquisicao: hoje(),
  localizacao: null, responsavel: null, garantia_ate: null,
  xml_url: null, pdf_url: null, manual_url: null, fotos_urls: null,
  observacoes: null, ativo: true, criado_por: null,
};

// ─── Modal: Ativo Imobilizado ────────────────────────────────
function ModalAtivo({ editando, fornecedores, planoContas, usuarioEmail, onSalvo, onFechar }: {
  editando: AtivoImobilizado | null; fornecedores: Fornecedor[]; planoContas: PlanoContasOpcao[]; usuarioEmail: string;
  onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<AtivoImobilizadoInsert>(editando ? { ...editando } : { ...ATIVO_VAZIO });
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof AtivoImobilizadoInsert>(k: K, v: AtivoImobilizadoInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.numero_patrimonio.trim() || !form.descricao.trim()) { toast("Preencha nº de patrimônio e descrição", "err"); return; }
    setSalvando(true);

    let ativoId: number;
    if (editando) {
      ativoId = editando.id;
      const ok = await atualizarAtivoImobilizado(ativoId, form);
      if (!ok) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
    } else {
      const criado = await criarAtivoImobilizado({ ...form, criado_por: usuarioEmail });
      if (!criado) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
      ativoId = criado.id;
    }

    const patch: Partial<AtivoImobilizadoInsert> = {};
    if (xmlFile) { const url = await uploadAnexoAtivoImobilizado(ativoId, xmlFile, "xml"); if (url) patch.xml_url = url; }
    if (pdfFile) { const url = await uploadAnexoAtivoImobilizado(ativoId, pdfFile, "pdf"); if (url) patch.pdf_url = url; }
    if (manualFile) { const url = await uploadAnexoAtivoImobilizado(ativoId, manualFile, "manual"); if (url) patch.manual_url = url; }
    if (fotos.length > 0) {
      const urls: string[] = [];
      for (const f of fotos) {
        const url = await uploadAnexoAtivoImobilizado(ativoId, f, "foto");
        if (url) urls.push(url);
      }
      if (urls.length > 0) patch.fotos_urls = [...(editando?.fotos_urls ?? []), ...urls];
    }
    if (Object.keys(patch).length > 0) await atualizarAtivoImobilizado(ativoId, patch);

    setSalvando(false);
    toast(editando ? "Ativo atualizado" : "Ativo criado");
    onSalvo();
  }

  return (
    <div className="mov open" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="mod" style={{ width: "620px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="mhd">
          <div className="mtit">{editando ? "Editar Ativo Imobilizado" : "Novo Ativo Imobilizado"}</div>
          <button className="mcl" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <form id="form-ativo-imobilizado" onSubmit={handleSubmit} style={{ overflowY: "auto", padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Nº Patrimônio *</label>
              <input className="fc" value={form.numero_patrimonio} onChange={(e) => set("numero_patrimonio", e.target.value)} required />
            </div>
            <div className="fg">
              <label className="fl">Descrição *</label>
              <input className="fc" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Categoria</label>
              <select className="fc" value={form.categoria} onChange={(e) => set("categoria", e.target.value as CategoriaAtivoImobilizado)}>
                {CATEGORIAS_ATIVO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Fornecedor</label>
              <select className="fc" value={form.fornecedor_id ?? ""} onChange={(e) => set("fornecedor_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Nº da Nota</label>
              <input className="fc" value={form.numero_nota ?? ""} onChange={(e) => set("numero_nota", e.target.value || null)} />
            </div>
            <div className="fg">
              <label className="fl">Conta Contábil</label>
              <select className="fc" value={form.plano_contas_id ?? ""} onChange={(e) => set("plano_contas_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {planoContas.map((p) => <option key={p.id} value={p.id}>{p.codigo_estruturado} — {p.descricao}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Valor de Aquisição</label>
              <input className="fc" type="number" step="0.01" value={form.valor_aquisicao} onChange={(e) => set("valor_aquisicao", Number(e.target.value))} required style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
            <div className="fg">
              <label className="fl">Valor Residual</label>
              <input className="fc" type="number" step="0.01" value={form.valor_residual} onChange={(e) => set("valor_residual", Number(e.target.value))} style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
            <div className="fg">
              <label className="fl">Vida Útil (meses)</label>
              <input className="fc" type="number" value={form.vida_util_meses} onChange={(e) => set("vida_util_meses", Number(e.target.value))} required style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Data de Aquisição</label>
              <input className="fc" type="date" value={form.data_aquisicao} onChange={(e) => set("data_aquisicao", e.target.value)} required />
            </div>
            <div className="fg">
              <label className="fl">Garantia Até</label>
              <input className="fc" type="date" value={form.garantia_ate ?? ""} onChange={(e) => set("garantia_ate", e.target.value || null)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Localização</label>
              <input className="fc" value={form.localizacao ?? ""} onChange={(e) => set("localizacao", e.target.value || null)} />
            </div>
            <div className="fg">
              <label className="fl">Responsável</label>
              <input className="fc" value={form.responsavel ?? ""} onChange={(e) => set("responsavel", e.target.value || null)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">XML</label>
              <input className="fc" type="file" accept=".xml" onChange={(e) => setXmlFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="fg">
              <label className="fl">PDF (nota)</label>
              <input className="fc" type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="fg">
              <label className="fl">Manual (PDF)</label>
              <input className="fc" type="file" accept=".pdf" onChange={(e) => setManualFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          <div className="fg">
            <label className="fl">Fotos</label>
            <input className="fc" type="file" accept="image/*" multiple onChange={(e) => setFotos(Array.from(e.target.files ?? []))} />
          </div>

          <div className="fg">
            <label className="fl">Observações</label>
            <textarea className="fc" rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
          </div>

          {editando && (
            <div style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "12px 14px" }}>
              {(() => {
                const dep = calcularDepreciacao(editando);
                return (
                  <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase" }}>Depreciação Acumulada</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{formatBRL(dep.depreciacaoAcumulada)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase" }}>Valor Contábil Atual</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{formatBRL(dep.valorContabilAtual)}</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </form>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form="form-ativo-imobilizado" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ───────────────────────────────────────
export default function AtivoImobilizadoPage() {
  const { toast } = useToast();
  const [ativos, setAtivos] = useState<AtivoImobilizado[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaAtivoImobilizado | "">("");
  const [filtroAtivo, setFiltroAtivo] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [planoContas, setPlanoContas] = useState<PlanoContasOpcao[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [editando, setEditando] = useState<AtivoImobilizado | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
    getFornecedores(true).then(setFornecedores);
    supabase.from("plano_contas").select("id, codigo_estruturado, descricao").eq("ativo", true).then(({ data }) => {
      setPlanoContas(ordenarPorCodigoEstruturado((data ?? []) as PlanoContasOpcao[]));
    });
  }, []);

  useEffect(() => { load(); }, [filtroCategoria, filtroAtivo]);

  async function load() {
    setLoading(true);
    setAtivos(await getAtivosImobilizados({
      categoria: filtroCategoria || undefined,
      ativo: filtroAtivo === "todos" ? undefined : filtroAtivo === "ativos",
    }));
    setLoading(false);
  }

  const ativosFiltrados = useMemo(() => {
    if (!busca.trim()) return ativos;
    const q = busca.toLowerCase();
    return ativos.filter((a) => a.numero_patrimonio.toLowerCase().includes(q) || a.descricao.toLowerCase().includes(q));
  }, [ativos, busca]);

  async function handleInativar(a: AtivoImobilizado) {
    if (!confirm(`${a.ativo ? "Inativar" : "Reativar"} o ativo "${a.descricao}"?`)) return;
    const ok = a.ativo ? await inativarAtivoImobilizado(a.id) : await reativarAtivoImobilizado(a.id);
    toast(ok ? "Ativo atualizado" : "Erro ao atualizar", ok ? "ok" : "err");
    if (ok) load();
  }

  const hojeStr = hoje();

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Ativo Imobilizado</div>
      </div>
      <ContabilidadeTabs ativo="ativo-imobilizado" />

      {modalAberto && (
        <ModalAtivo
          editando={editando}
          fornecedores={fornecedores}
          planoContas={planoContas}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalAberto(false); setEditando(null); load(); }}
          onFechar={() => { setModalAberto(false); setEditando(null); }}
        />
      )}

      <div className="con">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input className="fc" placeholder="Buscar patrimônio ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: "220px" }} />
            <select className="fc" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value as CategoriaAtivoImobilizado | "")} style={{ width: "200px" }}>
              <option value="">Todas as categorias</option>
              {CATEGORIAS_ATIVO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select className="fc" value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value as typeof filtroAtivo)} style={{ width: "120px" }}>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          <button className="btn bp sm" onClick={() => { setEditando(null); setModalAberto(true); }}>+ Novo Ativo</button>
        </div>

        {loading ? <div className="loading">Carregando...</div> : ativosFiltrados.length === 0 ? (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhum ativo encontrado.</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Patrimônio</th><th>Descrição</th><th>Categoria</th><th>Localização</th>
                  <th>Valor Aquisição</th><th>Depr. Acumulada</th><th>Valor Contábil</th><th>Garantia</th><th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {ativosFiltrados.map((a) => {
                  const dep = calcularDepreciacao(a);
                  const garantiaVencida = a.garantia_ate !== null && a.garantia_ate < hojeStr;
                  return (
                    <tr key={a.id} style={{ opacity: a.ativo ? 1 : 0.55 }}>
                      <td className="mono">{a.numero_patrimonio}</td>
                      <td>{a.descricao}</td>
                      <td><span className="chip cgr" style={{ fontSize: "11px" }}>{labelCategoriaAtivo(a.categoria)}</span></td>
                      <td>{a.localizacao ?? "—"}</td>
                      <td className="mono">{formatBRL(a.valor_aquisicao)}</td>
                      <td className="mono">{formatBRL(dep.depreciacaoAcumulada)}</td>
                      <td className="mono">{formatBRL(dep.valorContabilAtual)}</td>
                      <td>
                        {a.garantia_ate ? (
                          <span className={garantiaVencida ? "chip cr" : "chip cg"} style={{ fontSize: "11px" }}>{formatDate(a.garantia_ate)}</span>
                        ) : "—"}
                      </td>
                      <td style={{ display: "flex", gap: "6px" }}>
                        <button className="btn bg xs" onClick={() => { setEditando(a); setModalAberto(true); }}>Editar</button>
                        <button className="btn bg xs" onClick={() => handleInativar(a)}>{a.ativo ? "Inativar" : "Reativar"}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
