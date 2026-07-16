"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { usePrompt } from "@/components/ui/prompt";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import {
  getDocumentosFiscais,
  criarDocumentoFiscal,
  atualizarDocumentoFiscal,
  softDeleteDocumentoFiscal,
  uploadAnexoDocumentoFiscal,
} from "@/services/contabilidadeDocumentos.service";
import { getResumoNotasSaida, getNotasCanceladas, type ResumoNotasSaida, type NotaCancelada } from "@/services/contabilidadeDashboard.service";
import { getFornecedores } from "@/services/fornecedores.service";
import { getNotas } from "@/services/notas.service";
import { getItensEstoqueGerais } from "@/services/itensEstoqueGerais.service";
import type { DocumentoFiscal, DocumentoFiscalInsert, Fornecedor, ItemEstoqueGeral, NotaFiscal, TipoDocumentoFiscal } from "@/types";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type AbaDocumentos = "compra" | "perda" | "carta_correcao" | "inutilizacao" | "cancelamentos" | "saida";

const SUB_ABAS: { id: AbaDocumentos; label: string }[] = [
  { id: "compra", label: "Compra / Entrada" },
  { id: "saida", label: "Saída" },
  { id: "perda", label: "Perda" },
  { id: "cancelamentos", label: "Cancelamentos" },
  { id: "carta_correcao", label: "Carta de Correção" },
  { id: "inutilizacao", label: "Inutilização" },
];

function docVazio(tipo: TipoDocumentoFiscal, ano: number, mes: number): DocumentoFiscalInsert {
  return {
    tipo, entrada: false, competencia_ano: ano, competencia_mes: mes,
    numero_documento: null, serie: null, chave_acesso: null,
    fornecedor_id: null, compra_id: null, nota_fiscal_id: null,
    ncm: null, cfop: null, cst: null,
    valor_produtos: null, valor_icms: null, valor_pis: null, valor_cofins: null, valor_ipi: null, valor_total: null,
    motivo: null, material: null, quantidade: null,
    numero_inicial: null, numero_final: null,
    sequencia_evento: null, texto_correcao: null,
    responsavel: null, observacoes: null,
    xml_url: null, pdf_url: null, fotos_urls: null,
    criado_por: null,
  };
}

// ─── Modal genérico de documento fiscal ────────────────────
interface ModalDocProps {
  tipo: TipoDocumentoFiscal;
  titulo: string;
  editando: DocumentoFiscal | null;
  valoresIniciais?: Partial<DocumentoFiscalInsert>;
  ano: number;
  mes: number;
  fornecedores: Fornecedor[];
  notasVenda: NotaFiscal[];
  itensEstoque: ItemEstoqueGeral[];
  usuarioEmail: string;
  onSalvo: () => void;
  onFechar: () => void;
}

function ModalDocumento({ tipo, titulo, editando, valoresIniciais, ano, mes, fornecedores, notasVenda, itensEstoque, usuarioEmail, onSalvo, onFechar }: ModalDocProps) {
  const { toast } = useToast();
  const base = editando ?? { ...docVazio(tipo, ano, mes), ...valoresIniciais };
  const [form, setForm] = useState<DocumentoFiscalInsert>({ ...base });
  // Só ajuda a pré-preencher o NCM a partir do cadastro do item — não é
  // salvo no documento fiscal (que não tem vínculo a item de estoque),
  // só evita redigitar um NCM que já existe em outro lugar do sistema.
  const [itemEstoqueId, setItemEstoqueId] = useState("");
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof DocumentoFiscalInsert>(k: K, v: DocumentoFiscalInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    let docId: number;
    if (editando) {
      docId = editando.id;
      const ok = await atualizarDocumentoFiscal(docId, form);
      if (!ok) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
    } else {
      const criado = await criarDocumentoFiscal({ ...form, criado_por: usuarioEmail });
      if (!criado) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
      docId = criado.id;
    }

    const patch: Partial<DocumentoFiscalInsert> = {};
    if (xmlFile) {
      const url = await uploadAnexoDocumentoFiscal(docId, xmlFile, "xml");
      if (url) patch.xml_url = url;
    }
    if (pdfFile) {
      const url = await uploadAnexoDocumentoFiscal(docId, pdfFile, "pdf");
      if (url) patch.pdf_url = url;
    }
    if (fotos.length > 0) {
      const urls: string[] = [];
      for (const f of fotos) {
        const url = await uploadAnexoDocumentoFiscal(docId, f, "foto");
        if (url) urls.push(url);
      }
      if (urls.length > 0) patch.fotos_urls = [...(editando?.fotos_urls ?? []), ...urls];
    }
    if (Object.keys(patch).length > 0) await atualizarDocumentoFiscal(docId, patch);

    setSalvando(false);
    toast(editando ? "Documento atualizado" : "Documento criado");
    onSalvo();
  }

  return (
    <Modal open onClose={onFechar} title={titulo} width="600px" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <form id={`form-doc-${tipo}`} onSubmit={handleSubmit} style={{ overflowY: "auto", padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Competência */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Campo label="Competência — Mês">
              <select name="competencia_mes" className="fc" value={form.competencia_mes} onChange={(e) => set("competencia_mes", Number(e.target.value))}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Campo>
            <Campo label="Competência — Ano">
              <input name="competencia_ano" className="fc" type="number" value={form.competencia_ano} onChange={(e) => set("competencia_ano", Number(e.target.value))} />
            </Campo>
          </div>

          {(tipo === "compra" || tipo === "cancelamento") && (
            <Campo label="Fornecedor">
              <select name="fornecedor_id" className="fc" value={form.fornecedor_id ?? ""} onChange={(e) => set("fornecedor_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Selecione...</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.cnpj ? ` — ${f.cnpj}` : ""}</option>)}
              </select>
            </Campo>
          )}

          {(tipo === "compra" || tipo === "cancelamento" || tipo === "inutilizacao") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Campo label="Nº do Documento">
                <input name="numero_documento" className="fc" value={form.numero_documento ?? ""} onChange={(e) => set("numero_documento", e.target.value || null)} />
              </Campo>
              <Campo label="Série">
                <input name="serie" className="fc" value={form.serie ?? ""} onChange={(e) => set("serie", e.target.value || null)} />
              </Campo>
            </div>
          )}

          {tipo === "compra" && (
            <>
              <Campo label="Chave de Acesso (44 dígitos)">
                <input name="chave_acesso" className="fc" value={form.chave_acesso ?? ""} maxLength={44} style={{ fontFamily: "'DM Mono', monospace" }}
                  onChange={(e) => set("chave_acesso", e.target.value.replace(/\D/g, "").slice(0, 44) || null)} />
              </Campo>
              <Campo label="Item do Estoque Geral (opcional — preenche o NCM)">
                <select className="fc" value={itemEstoqueId} onChange={(e) => {
                  const id = e.target.value;
                  setItemEstoqueId(id);
                  const item = itensEstoque.find((i) => String(i.id) === id);
                  if (item?.ncm) set("ncm", item.ncm);
                }}>
                  <option value="">Selecione pra preencher o NCM...</option>
                  {itensEstoque.map((i) => (
                    <option key={i.id} value={i.id}>{i.codigo} · {i.descricao}{i.ncm ? ` (NCM ${i.ncm})` : " (sem NCM cadastrado)"}</option>
                  ))}
                </select>
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <Campo label="NCM">
                  <input name="ncm" className="fc" value={form.ncm ?? ""} maxLength={8} style={{ fontFamily: "'DM Mono', monospace" }}
                    onChange={(e) => set("ncm", e.target.value.replace(/\D/g, "").slice(0, 8) || null)} />
                </Campo>
                <Campo label="CFOP">
                  <input name="cfop" className="fc" value={form.cfop ?? ""} maxLength={4} style={{ fontFamily: "'DM Mono', monospace" }}
                    onChange={(e) => set("cfop", e.target.value.replace(/\D/g, "").slice(0, 4) || null)} />
                </Campo>
                <Campo label="CST">
                  <input name="cst" className="fc" value={form.cst ?? ""} style={{ fontFamily: "'DM Mono', monospace" }}
                    onChange={(e) => set("cst", e.target.value || null)} />
                </Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                {([
                  ["valor_produtos", "Produtos"], ["valor_icms", "ICMS"], ["valor_pis", "PIS"],
                  ["valor_cofins", "COFINS"], ["valor_ipi", "IPI"],
                ] as const).map(([key, label]) => (
                  <Campo key={key} labelStyle={{ fontSize: "10px" }} label={label}>
                    <input name={key} className="fc" type="number" step="0.01" style={{ fontFamily: "'DM Mono', monospace" }}
                      value={form[key] ?? ""} onChange={(e) => set(key, e.target.value ? Number(e.target.value) : null)} />
                  </Campo>
                ))}
              </div>
              <Campo label="Valor Total">
                <input name="valor_total" className="fc" type="number" step="0.01" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}
                  value={form.valor_total ?? ""} onChange={(e) => set("valor_total", e.target.value ? Number(e.target.value) : null)} />
              </Campo>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                <input name="entrada" type="checkbox" checked={form.entrada} onChange={(e) => set("entrada", e.target.checked)} />
                Também classificar como &quot;NF Entrada&quot;
              </label>
            </>
          )}

          {tipo === "perda" && (
            <>
              <Campo label="Motivo">
                <input name="motivo" className="fc" value={form.motivo ?? ""} onChange={(e) => set("motivo", e.target.value || null)} required />
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Campo label="Material">
                  <input name="material" className="fc" value={form.material ?? ""} onChange={(e) => set("material", e.target.value || null)} />
                </Campo>
                <Campo label="Quantidade">
                  <input name="quantidade" className="fc" type="number" step="0.001" value={form.quantidade ?? ""} onChange={(e) => set("quantidade", e.target.value ? Number(e.target.value) : null)} />
                </Campo>
              </div>
              <Campo label="Valor">
                <input name="valor_total" className="fc" type="number" step="0.01" value={form.valor_total ?? ""} onChange={(e) => set("valor_total", e.target.value ? Number(e.target.value) : null)} />
              </Campo>
              <Campo label="Responsável">
                <input name="responsavel" className="fc" value={form.responsavel ?? ""} onChange={(e) => set("responsavel", e.target.value || null)} />
              </Campo>
              <Campo label="Fotos (opcional)">
                <input name="set_fotos" className="fc" type="file" accept="image/*" multiple onChange={(e) => setFotos(Array.from(e.target.files ?? []))} />
              </Campo>
            </>
          )}

          {tipo === "cancelamento" && (
            <>
              <Campo label="Motivo">
                <input name="motivo" className="fc" value={form.motivo ?? ""} onChange={(e) => set("motivo", e.target.value || null)} required />
              </Campo>
              <Campo label="Responsável">
                <input name="responsavel" className="fc" value={form.responsavel ?? ""} onChange={(e) => set("responsavel", e.target.value || null)} />
              </Campo>
            </>
          )}

          {tipo === "carta_correcao" && (
            <>
              <Campo label="Nota Fiscal relacionada">
                <select name="nota_fiscal_id" className="fc" value={form.nota_fiscal_id ?? ""} onChange={(e) => set("nota_fiscal_id", e.target.value ? Number(e.target.value) : null)} required>
                  <option value="">Selecione...</option>
                  {notasVenda.map((n) => <option key={n.id} value={n.id}>{n.numero ?? `#${n.id}`} — {n.clientes?.nome ?? "—"}</option>)}
                </select>
              </Campo>
              <Campo label="Sequência do Evento">
                <input name="sequencia_evento" className="fc" type="number" value={form.sequencia_evento ?? ""} onChange={(e) => set("sequencia_evento", e.target.value ? Number(e.target.value) : null)} />
              </Campo>
              <Campo label="Texto da Correção">
                <textarea name="texto_correcao" className="fc" rows={3} value={form.texto_correcao ?? ""} onChange={(e) => set("texto_correcao", e.target.value || null)} required />
              </Campo>
            </>
          )}

          {tipo === "inutilizacao" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Campo label="Número Inicial">
                <input name="numero_inicial" className="fc" type="number" value={form.numero_inicial ?? ""} onChange={(e) => set("numero_inicial", e.target.value ? Number(e.target.value) : null)} required />
              </Campo>
              <Campo label="Número Final">
                <input name="numero_final" className="fc" type="number" value={form.numero_final ?? ""} onChange={(e) => set("numero_final", e.target.value ? Number(e.target.value) : null)} required />
              </Campo>
            </div>
          )}

          {tipo === "compra" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Campo label="Anexar XML">
                <input name="set_xml_file" className="fc" type="file" accept=".xml" onChange={(e) => setXmlFile(e.target.files?.[0] ?? null)} />
              </Campo>
              <Campo label="Anexar PDF">
                <input name="set_pdf_file" className="fc" type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
              </Campo>
            </div>
          )}

          <Campo label="Observações">
            <textarea name="observacoes" className="fc" rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
          </Campo>
        </form>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form={`form-doc-${tipo}`} className="btn bp" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
    </Modal>
  );
}

// ─── Página principal ───────────────────────────────────────
export default function DocumentosFiscaisPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [aba, setAba] = useState<AbaDocumentos>("compra");

  const [docs, setDocs] = useState<DocumentoFiscal[]>([]);
  const [resumoSaida, setResumoSaida] = useState<ResumoNotasSaida | null>(null);
  const [canceladas, setCanceladas] = useState<NotaCancelada[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [notasVenda, setNotasVenda] = useState<NotaFiscal[]>([]);
  const [itensEstoque, setItensEstoque] = useState<ItemEstoqueGeral[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<DocumentoFiscal | null>(null);
  const [modalAberto, setModalAberto] = useState<TipoDocumentoFiscal | null>(null);

  useEffect(() => {
    getFornecedores(true).then(setFornecedores);
    getItensEstoqueGerais({ ativo: true }).then(setItensEstoque);
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
  }, []);

  useEffect(() => { load(); }, [aba, ano, mes]);

  async function load() {
    setLoading(true);
    if (aba === "saida") {
      setResumoSaida(await getResumoNotasSaida(ano, mes));
    } else if (aba === "cancelamentos") {
      setCanceladas(await getNotasCanceladas(ano, mes));
    } else if (aba === "carta_correcao") {
      const [d, notas] = await Promise.all([
        getDocumentosFiscais({ tipo: "carta_correcao", competenciaAno: ano, competenciaMes: mes }),
        getNotas(),
      ]);
      setDocs(d);
      setNotasVenda(notas.filter((n) => n.status === "autorizada"));
    } else {
      const tipo = aba as TipoDocumentoFiscal;
      setDocs(await getDocumentosFiscais({ tipo, competenciaAno: ano, competenciaMes: mes }));
    }
    setLoading(false);
  }

  async function handleExcluir(id: number) {
    const motivo = (await prompt("Motivo da exclusão (opcional):", { titulo: "Excluir documento" })) ?? undefined;
    if (!(await confirm("Excluir este documento? O registro fica no histórico, não é apagado de fato.", { perigo: true }))) return;
    const ok = await softDeleteDocumentoFiscal(id, usuarioEmail, motivo);
    toast(ok ? "Documento excluído" : "Erro ao excluir", ok ? "ok" : "err");
    if (ok) load();
  }

  const tipoModalAtivo: TipoDocumentoFiscal = aba === "cancelamentos" ? "cancelamento" : (aba as TipoDocumentoFiscal);
  const tituloModal: Record<TipoDocumentoFiscal, string> = {
    compra: editando ? "Editar NF Compra/Entrada" : "Nova NF Compra/Entrada",
    perda: editando ? "Editar NF Perda" : "Nova NF Perda",
    cancelamento: "Novo Cancelamento (Compra/Entrada)",
    carta_correcao: editando ? "Editar Carta de Correção" : "Nova Carta de Correção",
    inutilizacao: editando ? "Editar Inutilização" : "Nova Inutilização de Numeração",
  };

  const mostraNovo = aba !== "saida";

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Documentos Fiscais</div>
      </div>
      <ContabilidadeTabs ativo="documentos" />

      {modalAberto && (
        <ModalDocumento
          tipo={modalAberto}
          titulo={tituloModal[modalAberto]}
          editando={editando}
          ano={ano}
          mes={mes}
          fornecedores={fornecedores}
          notasVenda={notasVenda}
          itensEstoque={itensEstoque}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalAberto(null); setEditando(null); load(); }}
          onFechar={() => { setModalAberto(null); setEditando(null); }}
        />
      )}

      <div className="con">
        {/* Competência + sub-abas */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "2px" }}>
            {SUB_ABAS.map((a) => (
              <button key={a.id} onClick={() => setAba(a.id)} style={{
                padding: "8px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: `2px solid ${aba === a.id ? "var(--acc)" : "transparent"}`,
                color: aba === a.id ? "var(--acc)" : "var(--t3)", transition: "all .15s",
              }}>{a.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select name="mes" className="fc" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: "140px" }}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input name="ano" className="fc" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: "90px" }} />
            {mostraNovo && (
              <button className="btn bp sm" onClick={() => { setEditando(null); setModalAberto(tipoModalAtivo); }}>
                + Novo
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : aba === "saida" ? (
          <SecaoSaida resumo={resumoSaida} />
        ) : aba === "cancelamentos" ? (
          <SecaoCancelamentos itens={canceladas} />
        ) : (
          <SecaoDocumentos
            aba={aba}
            docs={docs}
            onEditar={(d) => { setEditando(d); setModalAberto(d.tipo); }}
            onExcluir={handleExcluir}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ─── Seção: tabela genérica de documentos_fiscais ──────────
function SecaoDocumentos({ aba, docs, onEditar, onExcluir }: {
  aba: AbaDocumentos; docs: DocumentoFiscal[];
  onEditar: (d: DocumentoFiscal) => void; onExcluir: (id: number) => void;
}) {
  if (docs.length === 0) {
    return <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhum documento nesta competência.</div>;
  }

  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            {aba === "compra" && <><th>Fornecedor</th><th>Nº Doc.</th><th>NCM/CFOP/CST</th><th>Valor Total</th><th>XML/PDF</th><th>Entrada?</th></>}
            {aba === "perda" && <><th>Motivo</th><th>Material</th><th>Qtd.</th><th>Valor</th><th>Responsável</th></>}
            {aba === "carta_correcao" && <><th>Nota Fiscal</th><th>Sequência</th><th>Texto</th></>}
            {aba === "inutilizacao" && <><th>Série</th><th>Nº Inicial</th><th>Nº Final</th></>}
            <th>Data</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              {aba === "compra" && (
                <>
                  <td>{d.fornecedores?.nome ?? "—"}</td>
                  <td className="mono">{d.numero_documento ?? "—"}</td>
                  <td className="mono" style={{ fontSize: "11px" }}>{[d.ncm, d.cfop, d.cst].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="mono">{d.valor_total !== null ? formatBRL(d.valor_total) : "—"}</td>
                  <td>
                    <span className={d.xml_url ? "chip cg" : "chip cr"} style={{ fontSize: "10px", marginRight: "4px" }}>XML</span>
                    <span className={d.pdf_url ? "chip cg" : "chip cr"} style={{ fontSize: "10px" }}>PDF</span>
                  </td>
                  <td>{d.entrada ? <span className="chip cg" style={{ fontSize: "11px" }}>Sim</span> : "—"}</td>
                </>
              )}
              {aba === "perda" && (
                <>
                  <td>{d.motivo ?? "—"}</td>
                  <td>{d.material ?? "—"}</td>
                  <td className="mono">{d.quantidade ?? "—"}</td>
                  <td className="mono">{d.valor_total !== null ? formatBRL(d.valor_total) : "—"}</td>
                  <td>{d.responsavel ?? "—"}</td>
                </>
              )}
              {aba === "carta_correcao" && (
                <>
                  <td className="mono">{d.nota_fiscal_id ? `#${d.nota_fiscal_id}` : "—"}</td>
                  <td className="mono">{d.sequencia_evento ?? "—"}</td>
                  <td style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.texto_correcao ?? "—"}</td>
                </>
              )}
              {aba === "inutilizacao" && (
                <>
                  <td>{d.serie ?? "—"}</td>
                  <td className="mono">{d.numero_inicial ?? "—"}</td>
                  <td className="mono">{d.numero_final ?? "—"}</td>
                </>
              )}
              <td className="mono" style={{ fontSize: "12px", color: "var(--t3)" }}>{formatDate(d.created_at)}</td>
              <td style={{ display: "flex", gap: "6px" }}>
                <button className="btn bg xs" onClick={() => onEditar(d)}>Editar</button>
                <button className="btn bg xs" style={{ color: "var(--err)", borderColor: "var(--err)" }} onClick={() => onExcluir(d.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Seção: NF Saída (só leitura, derivado de notas_fiscais) ──
function SecaoSaida({ resumo }: { resumo: ResumoNotasSaida | null }) {
  if (!resumo) return null;
  const cards = [
    { label: "Total Faturado", value: formatBRL(resumo.totalFaturado) },
    { label: "Notas Emitidas", value: String(resumo.totalNotas) },
    { label: "Clientes", value: String(resumo.totalClientes) },
    { label: "ICMS", value: formatBRL(resumo.totalIcms) },
    { label: "IPI", value: formatBRL(resumo.totalIpi) },
    { label: "PIS", value: formatBRL(resumo.totalPis) },
    { label: "COFINS", value: formatBRL(resumo.totalCofins) },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace", marginTop: "4px" }}>{c.value}</div>
          </div>
        ))}
      </div>

      {resumo.notas.length === 0 ? (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhuma NF de venda autorizada nesta competência.</div>
      ) : (
        <div className="tw">
          <table>
            <thead><tr><th>Nº</th><th>Cliente</th><th>CFOP</th><th>Valor Total</th><th>Emissão</th></tr></thead>
            <tbody>
              {resumo.notas.map((n) => (
                <tr key={n.id}>
                  <td className="mono">{n.numero ?? `#${n.id}`}</td>
                  <td>{n.clientes?.nome ?? "—"}</td>
                  <td className="mono">{n.cfop}</td>
                  <td className="mono">{formatBRL(n.valor_total)}</td>
                  <td className="mono" style={{ fontSize: "12px", color: "var(--t3)" }}>{formatDate(n.dt_emissao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Seção: Cancelamentos (venda + compra mesclados) ────────
function SecaoCancelamentos({ itens }: { itens: NotaCancelada[] }) {
  if (itens.length === 0) {
    return <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhuma nota cancelada nesta competência.</div>;
  }
  return (
    <div className="tw">
      <table>
        <thead><tr><th>Origem</th><th>Nº</th><th>Motivo</th><th>Responsável</th><th>Data</th></tr></thead>
        <tbody>
          {itens.map((n) => (
            <tr key={`${n.origem}-${n.id}`}>
              <td><span className={n.origem === "venda" ? "chip cy" : "chip cgr"} style={{ fontSize: "11px" }}>{n.origem === "venda" ? "Venda" : "Compra"}</span></td>
              <td className="mono">{n.numero ?? `#${n.id}`}</td>
              <td>{n.motivo ?? "—"}</td>
              <td>{n.responsavel ?? "—"}</td>
              <td className="mono" style={{ fontSize: "12px", color: "var(--t3)" }}>{formatDate(n.data)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
