"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { usePrompt } from "@/components/ui/prompt";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import { CATEGORIAS_DOC_DIVERSO, labelCategoriaDocDiverso } from "@/lib/documentosDiversosConstants";
import {
  getDocumentosDiversos, criarDocumentoDiverso, atualizarDocumentoDiverso,
  softDeleteDocumentoDiverso, uploadAnexoDocumentoDiverso,
} from "@/services/contabilidadeDocumentosDiversos.service";
import { getFornecedores } from "@/services/fornecedores.service";
import type { DocumentoDiverso, DocumentoDiversoInsert, CategoriaDocumentoDiverso, Fornecedor } from "@/types";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function hoje() { return new Date().toISOString().split("T")[0]; }

function formVazio(ano: number, mes: number): DocumentoDiversoInsert {
  return {
    categoria: "outros", fornecedor_id: null,
    competencia_ano: ano, competencia_mes: mes,
    descricao: "", valor: 0, vencimento: null, observacoes: null,
  };
}

// ─── Modal: Documento Diverso ─────────────────────────────────
function ModalDocDiverso({ ano, mes, fornecedores, usuarioEmail, onSalvo, onFechar }: {
  ano: number; mes: number; fornecedores: Fornecedor[]; usuarioEmail: string;
  onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<DocumentoDiversoInsert>(formVazio(ano, mes));
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof DocumentoDiversoInsert>(k: K, v: DocumentoDiversoInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim() || !(form.valor > 0)) { toast("Preencha descrição e valor", "err"); return; }
    setSalvando(true);

    const criado = await criarDocumentoDiverso({ ...form, criado_por: usuarioEmail } as DocumentoDiversoInsert);
    if (!criado) { toast("Erro ao salvar", "err"); setSalvando(false); return; }

    if (pdfFile) {
      const url = await uploadAnexoDocumentoDiverso(criado.id, pdfFile);
      if (url) await atualizarDocumentoDiverso(criado.id, { pdf_url: url });
    }

    setSalvando(false);
    toast("Documento criado");
    onSalvo();
  }

  return (
    <Modal open onClose={onFechar} title="Novo Documento Diverso" width="560px" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
      <form id="form-doc-diverso" onSubmit={handleSubmit} style={{ overflowY: "auto", padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Campo label="Categoria">
            <select className="fc" value={form.categoria} onChange={(e) => set("categoria", e.target.value as CategoriaDocumentoDiverso)}>
              {CATEGORIAS_DOC_DIVERSO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Campo>
          <Campo label="Fornecedor">
            <select className="fc" value={form.fornecedor_id ?? ""} onChange={(e) => set("fornecedor_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
        </div>

        <Campo label="Descrição *">
          <input className="fc" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex: Conta de energia — Julho/2026" required />
        </Campo>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Campo label="Valor *">
            <CurrencyInput value={form.valor} onChange={(v) => set("valor", v)} placeholder="R$ 0,00" />
          </Campo>
          <Campo label="Vencimento">
            <DateInput value={form.vencimento ?? ""} onChange={(v) => set("vencimento", v || null)} />
          </Campo>
        </div>

        <Campo label="PDF do documento">
          <input className="fc" type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
        </Campo>

        <Campo label="Observações">
          <textarea className="fc" rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
        </Campo>
      </form>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
        <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button type="submit" form="form-doc-diverso" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
      </div>
    </Modal>
  );
}

// ─── Página principal ───────────────────────────────────────
export default function DocumentosDiversosPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaDocumentoDiverso | "">("");
  const [docs, setDocs] = useState<DocumentoDiverso[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
    getFornecedores(true).then(setFornecedores);
  }, []);

  useEffect(() => { load(); }, [ano, mes, filtroCategoria]);

  async function load() {
    setLoading(true);
    setDocs(await getDocumentosDiversos({
      competenciaAno: ano, competenciaMes: mes,
      categoria: filtroCategoria || undefined,
    }));
    setLoading(false);
  }

  async function handleExcluir(id: number) {
    const motivo = (await prompt("Motivo da exclusão (opcional):", { titulo: "Excluir documento" })) ?? undefined;
    if (!(await confirm("Excluir este documento? O registro fica no histórico, não é apagado de fato.", { perigo: true }))) return;
    const ok = await softDeleteDocumentoDiverso(id, usuarioEmail, motivo);
    toast(ok ? "Documento excluído" : "Erro ao excluir", ok ? "ok" : "err");
    if (ok) load();
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Documentos Diversos</div>
      </div>
      <ContabilidadeTabs ativo="diversos" />

      {modalAberto && (
        <ModalDocDiverso
          ano={ano} mes={mes} fornecedores={fornecedores} usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalAberto(false); load(); }}
          onFechar={() => setModalAberto(false)}
        />
      )}

      <div className="con">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <select className="fc" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: "140px" }}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input className="fc" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: "90px" }} />
            <select className="fc" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value as CategoriaDocumentoDiverso | "")} style={{ width: "220px" }}>
              <option value="">Todas as categorias</option>
              {CATEGORIAS_DOC_DIVERSO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <button className="btn bp sm" onClick={() => setModalAberto(true)}>+ Novo Documento</button>
        </div>

        {loading ? <div className="loading">Carregando...</div> : docs.length === 0 ? (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhum documento nesta competência.</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Categoria</th><th>Fornecedor</th><th>Descrição</th>
                  <th>Valor</th><th>Vencimento</th><th>PDF</th><th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td><span className="chip cgr" style={{ fontSize: "11px" }}>{labelCategoriaDocDiverso(d.categoria)}</span></td>
                    <td>{d.fornecedores?.nome ?? "—"}</td>
                    <td>{d.descricao}</td>
                    <td className="mono">{formatBRL(d.valor)}</td>
                    <td className="mono">{d.vencimento ? formatDate(d.vencimento) : "—"}</td>
                    <td>{d.pdf_url ? <a href={d.pdf_url} target="_blank" rel="noreferrer">Ver</a> : <span style={{ color: "var(--err)" }}>Sem PDF</span>}</td>
                    <td><button className="btn bg xs" onClick={() => handleExcluir(d.id)}>Excluir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
