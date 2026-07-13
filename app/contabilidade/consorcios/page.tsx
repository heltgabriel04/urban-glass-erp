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
  getConsorcios, criarConsorcio, atualizarConsorcio, inativarConsorcio, reativarConsorcio, marcarContemplado,
  gerarParcelasConsorcio, getParcelasConsorcio, marcarParcelaConsorcioPaga, reabrirParcelaConsorcio,
  getLancesConsorcio, criarLance, uploadAnexoConsorcio,
} from "@/services/consorcios.service";
import type { Consorcio, ConsorcioInsert, ConsorcioParcela, ConsorcioLance, ConsorcioLanceInsert } from "@/types";

function hoje() { return new Date().toISOString().split("T")[0]; }

const CONSORCIO_VAZIO: ConsorcioInsert = {
  descricao: "", administradora: null, grupo: null, cota: null, valor_credito: 0,
  numero_parcelas: 60, valor_parcela: 0, data_adesao: hoje(), status: "ativo",
  contemplado_em: null, carta_contemplacao_url: null, contrato_pdf_url: null,
  observacoes: null, ativo: true, criado_por: null,
};

const LANCE_VAZIO: Omit<ConsorcioLanceInsert, "consorcio_id"> = {
  data: hoje(), valor: 0, tipo: "livre", resultado: "pendente", observacoes: null, criado_por: null,
};

// ─── Modal: Consórcio ───────────────────────────────────────
function ModalConsorcio({ editando, usuarioEmail, onSalvo, onFechar }: {
  editando: Consorcio | null; usuarioEmail: string; onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ConsorcioInsert>(editando ? { ...editando } : { ...CONSORCIO_VAZIO });
  const [contratoFile, setContratoFile] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof ConsorcioInsert>(k: K, v: ConsorcioInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim() || !form.valor_credito || !form.numero_parcelas || !form.valor_parcela) {
      toast("Preencha descrição, valor do crédito, nº de parcelas e valor da parcela", "err"); return;
    }
    setSalvando(true);

    let consId: number;
    if (editando) {
      consId = editando.id;
      const ok = await atualizarConsorcio(consId, form);
      if (!ok) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
    } else {
      const criado = await criarConsorcio({ ...form, criado_por: usuarioEmail });
      if (!criado) { toast("Erro ao salvar", "err"); setSalvando(false); return; }
      consId = criado.id;
    }

    if (contratoFile) {
      const url = await uploadAnexoConsorcio("consorcios", consId, contratoFile, "contrato");
      if (url) await atualizarConsorcio(consId, { contrato_pdf_url: url });
    }

    setSalvando(false);
    toast(editando ? "Consórcio atualizado" : "Consórcio criado");
    onSalvo();
  }

  return (
    <Modal open onClose={onFechar} title={editando ? "Editar Consórcio" : "Novo Consórcio"} width="560px">
        <form id="form-consorcio" onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <Campo label="Descrição *">
            <input className="fc" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
          </Campo>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <Campo label="Administradora">
              <input className="fc" value={form.administradora ?? ""} onChange={(e) => set("administradora", e.target.value || null)} />
            </Campo>
            <Campo label="Grupo">
              <input className="fc" value={form.grupo ?? ""} onChange={(e) => set("grupo", e.target.value || null)} />
            </Campo>
            <Campo label="Cota">
              <input className="fc" value={form.cota ?? ""} onChange={(e) => set("cota", e.target.value || null)} />
            </Campo>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <Campo label="Valor do Crédito">
              <input className="fc" type="number" step="0.01" value={form.valor_credito} onChange={(e) => set("valor_credito", Number(e.target.value))} required style={{ fontFamily: "'DM Mono', monospace" }} />
            </Campo>
            <Campo label="Nº de Parcelas">
              <input className="fc" type="number" value={form.numero_parcelas} onChange={(e) => set("numero_parcelas", Number(e.target.value))} required disabled={!!editando} />
            </Campo>
            <Campo label="Valor da Parcela">
              <input className="fc" type="number" step="0.01" value={form.valor_parcela} onChange={(e) => set("valor_parcela", Number(e.target.value))} required disabled={!!editando} style={{ fontFamily: "'DM Mono', monospace" }} />
            </Campo>
          </div>
          <Campo label="Data de Adesão">
            <input className="fc" type="date" value={form.data_adesao} onChange={(e) => set("data_adesao", e.target.value)} required disabled={!!editando} />
          </Campo>
          {editando && (
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>
              Nº de parcelas, valor da parcela e data de adesão ficam travados após a criação — eles definem o plano de parcelas já gerado.
            </div>
          )}
          <Campo label="Contrato (PDF)">
            <input className="fc" type="file" accept=".pdf" onChange={(e) => setContratoFile(e.target.files?.[0] ?? null)} />
          </Campo>
          <Campo label="Observações">
            <textarea className="fc" rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
          </Campo>
        </form>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form="form-consorcio" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
    </Modal>
  );
}

// ─── Modal: Lances ──────────────────────────────────────────
function ModalLances({ consorcio, usuarioEmail, onFechar }: {
  consorcio: Consorcio; usuarioEmail: string; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [lances, setLances] = useState<ConsorcioLance[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof LANCE_VAZIO>({ ...LANCE_VAZIO });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setLances(await getLancesConsorcio(consorcio.id));
    setLoading(false);
  }

  function set<K extends keyof typeof LANCE_VAZIO>(k: K, v: (typeof LANCE_VAZIO)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.valor) { toast("Preencha o valor do lance", "err"); return; }
    setSalvando(true);
    const criado = await criarLance({ ...form, consorcio_id: consorcio.id, criado_por: usuarioEmail });
    setSalvando(false);
    if (!criado) { toast("Erro ao adicionar lance", "err"); return; }
    toast("Lance adicionado");
    setForm({ ...LANCE_VAZIO });
    load();
  }

  return (
    <Modal open onClose={onFechar} title={`Lances — ${consorcio.descricao}`} width="620px" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "8px", marginBottom: "16px", alignItems: "end" }}>
            <Campo style={{ margin: 0 }} label="Data">
              <input className="fc" type="date" value={form.data} onChange={(e) => set("data", e.target.value)} required />
            </Campo>
            <Campo style={{ margin: 0 }} label="Valor">
              <input className="fc" type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", Number(e.target.value))} required style={{ fontFamily: "'DM Mono', monospace" }} />
            </Campo>
            <Campo style={{ margin: 0 }} label="Tipo">
              <select className="fc" value={form.tipo} onChange={(e) => set("tipo", e.target.value as ConsorcioLance["tipo"])}>
                <option value="livre">Livre</option>
                <option value="embutido">Embutido</option>
                <option value="fixo">Fixo</option>
              </select>
            </Campo>
            <button type="submit" className="btn bp sm" disabled={salvando}>+ Add</button>
          </form>

          {loading ? <div className="loading">Carregando...</div> : lances.length === 0 ? (
            <div className="card" style={{ padding: "24px", textAlign: "center", color: "var(--t3)" }}>Nenhum lance registrado.</div>
          ) : (
            <div className="tw">
              <table>
                <thead><tr><th>Data</th><th>Valor</th><th>Tipo</th><th>Resultado</th></tr></thead>
                <tbody>
                  {lances.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDate(l.data)}</td>
                      <td className="mono">{formatBRL(l.valor)}</td>
                      <td>{l.tipo === "livre" ? "Livre" : l.tipo === "embutido" ? "Embutido" : "Fixo"}</td>
                      <td>
                        <span className={l.resultado === "aprovado" ? "chip cg" : l.resultado === "recusado" ? "chip cr" : "chip cgr"} style={{ fontSize: "11px" }}>
                          {l.resultado === "aprovado" ? "Aprovado" : l.resultado === "recusado" ? "Recusado" : "Pendente"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onFechar}>Fechar</button>
        </div>
    </Modal>
  );
}

// ─── Página principal ───────────────────────────────────────
export default function ConsorciosPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [selecionado, setSelecionado] = useState<Consorcio | null>(null);
  const [parcelas, setParcelas] = useState<ConsorcioParcela[]>([]);
  const [editando, setEditando] = useState<Consorcio | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalLances, setModalLances] = useState<Consorcio | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [consorcioParaContemplar, setConsorcioParaContemplar] = useState<Consorcio | null>(null);
  const [parcelaParaPagar, setParcelaParaPagar] = useState<ConsorcioParcela | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
  }, []);

  useEffect(() => { load(); }, [filtroAtivo]);
  useEffect(() => { if (selecionado) loadParcelas(selecionado.id); else setParcelas([]); }, [selecionado]);

  async function load() {
    setLoading(true);
    const lista = await getConsorcios({ ativo: filtroAtivo === "todos" ? undefined : filtroAtivo === "ativos" });
    setConsorcios(lista);
    if (selecionado) setSelecionado(lista.find((c) => c.id === selecionado.id) ?? null);
    setLoading(false);
  }

  async function loadParcelas(id: number) {
    setParcelas(await getParcelasConsorcio(id));
  }

  async function handleInativar(c: Consorcio) {
    if (!(await confirm(`${c.ativo ? "Inativar" : "Reativar"} o consórcio "${c.descricao}"?`))) return;
    const ok = c.ativo ? await inativarConsorcio(c.id) : await reativarConsorcio(c.id);
    toast(ok ? "Consórcio atualizado" : "Erro ao atualizar", ok ? "ok" : "err");
    if (ok) load();
  }

  function handleContemplar(c: Consorcio) {
    setConsorcioParaContemplar(c);
  }

  async function confirmarContemplacao(data: string) {
    if (!consorcioParaContemplar) return;
    const ok = await marcarContemplado(consorcioParaContemplar.id, data);
    toast(ok ? "Consórcio marcado como contemplado" : "Erro", ok ? "ok" : "err");
    setConsorcioParaContemplar(null);
    if (ok) load();
  }

  async function handleGerarParcelas() {
    if (!selecionado) return;
    if (!(await confirm(`Gerar ${selecionado.numero_parcelas} parcela(s) fixa(s) para "${selecionado.descricao}"? Isso só pode ser feito uma vez.`))) return;
    setGerando(true);
    const res = await gerarParcelasConsorcio(selecionado.id);
    setGerando(false);
    toast(res.ok ? "Parcelas geradas" : (res.motivo ?? "Erro ao gerar parcelas"), res.ok ? "ok" : "err");
    if (res.ok) loadParcelas(selecionado.id);
  }

  async function handleMarcarPaga(p: ConsorcioParcela) {
    if (p.status === "pago") {
      if (!(await confirm("Reabrir esta parcela?"))) return;
      const ok = await reabrirParcelaConsorcio(p.id);
      toast(ok ? "Parcela reaberta" : "Erro", ok ? "ok" : "err");
      if (ok && selecionado) loadParcelas(selecionado.id);
      return;
    }
    setParcelaParaPagar(p);
  }

  async function confirmarPagamento(data: string) {
    if (!parcelaParaPagar) return;
    const ok = await marcarParcelaConsorcioPaga(parcelaParaPagar.id, data);
    toast(ok ? "Parcela marcada como paga" : "Erro", ok ? "ok" : "err");
    setParcelaParaPagar(null);
    if (ok && selecionado) loadParcelas(selecionado.id);
  }

  async function handleAnexo(p: ConsorcioParcela, file: File) {
    const url = await uploadAnexoConsorcio("consorcios-parcelas", p.id, file, "comprovante");
    if (url && selecionado) {
      await marcarParcelaConsorcioPaga(p.id, p.data_pagamento ?? hoje(), url);
      loadParcelas(selecionado.id);
    }
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Consórcios</div>
      </div>
      <ContabilidadeTabs ativo="consorcios" />

      {modalAberto && (
        <ModalConsorcio
          editando={editando}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalAberto(false); setEditando(null); load(); }}
          onFechar={() => { setModalAberto(false); setEditando(null); }}
        />
      )}

      {modalLances && (
        <ModalLances consorcio={modalLances} usuarioEmail={usuarioEmail} onFechar={() => setModalLances(null)} />
      )}

      {consorcioParaContemplar && (
        <DatePromptModal
          titulo="Data da Contemplação"
          onConfirmar={confirmarContemplacao}
          onFechar={() => setConsorcioParaContemplar(null)}
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
          <select className="fc" value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value as typeof filtroAtivo)} style={{ width: "120px" }}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
          <button className="btn bp sm" onClick={() => { setEditando(null); setModalAberto(true); }}>+ Novo Consórcio</button>
        </div>

        {loading ? <div className="loading">Carregando...</div> : consorcios.length === 0 ? (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhum consórcio cadastrado.</div>
        ) : (
          <div className="tw" style={{ marginBottom: "24px" }}>
            <table>
              <thead>
                <tr><th>Descrição</th><th>Administradora</th><th>Grupo/Cota</th><th>Valor Crédito</th><th>Parcela</th><th>Status</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {consorcios.map((c) => (
                  <tr key={c.id} onClick={() => setSelecionado(c)} style={{ cursor: "pointer", background: selecionado?.id === c.id ? "var(--surf2)" : undefined, opacity: c.ativo ? 1 : 0.55 }}>
                    <td>{c.descricao}</td>
                    <td>{c.administradora ?? "—"}</td>
                    <td>{c.grupo ?? "—"}{c.cota ? ` / ${c.cota}` : ""}</td>
                    <td className="mono">{formatBRL(c.valor_credito)}</td>
                    <td className="mono">{formatBRL(c.valor_parcela)}</td>
                    <td>
                      <span className={c.status === "contemplado" ? "chip cg" : c.status === "encerrado" ? "chip cy" : "chip cgr"} style={{ fontSize: "11px" }}>
                        {c.status === "contemplado" ? "Contemplado" : c.status === "encerrado" ? "Encerrado" : "Ativo"}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: "6px" }} onClick={(ev) => ev.stopPropagation()}>
                      <button className="btn bg xs" onClick={() => setModalLances(c)}>Lances</button>
                      {c.status === "ativo" && <button className="btn bg xs" onClick={() => handleContemplar(c)}>Contemplar</button>}
                      <button className="btn bg xs" onClick={() => { setEditando(c); setModalAberto(true); }}>Editar</button>
                      <button className="btn bg xs" onClick={() => handleInativar(c)}>{c.ativo ? "Inativar" : "Reativar"}</button>
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
                <button className="btn bp sm" onClick={handleGerarParcelas} disabled={gerando}>{gerando ? "Gerando..." : "Gerar Parcelas"}</button>
              )}
            </div>

            {parcelas.length === 0 ? (
              <div className="card" style={{ padding: "24px", textAlign: "center", color: "var(--t3)" }}>Nenhuma parcela gerada ainda.</div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr><th>#</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Comprovante</th><th>Ação</th></tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p) => (
                      <tr key={p.id} style={{ opacity: p.status === "pago" ? 0.7 : 1 }}>
                        <td className="mono">{p.numero_parcela}</td>
                        <td>{formatDate(p.vencimento)}</td>
                        <td className="mono">{formatBRL(p.valor)}</td>
                        <td><span className={p.status === "pago" ? "chip cg" : "chip cgr"} style={{ fontSize: "11px" }}>{p.status === "pago" ? "Pago" : "Pendente"}</span></td>
                        <td>
                          {p.comprovante_url ? (
                            <a href={p.comprovante_url} target="_blank" rel="noreferrer" style={{ fontSize: "11px" }}>Ver</a>
                          ) : (
                            <input type="file" style={{ fontSize: "10px", width: "90px" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnexo(p, f); }} />
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
