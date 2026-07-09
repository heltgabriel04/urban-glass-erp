"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import { GRUPOS_ITEM_ESTOQUE, labelGrupoItem } from "@/lib/itensEstoqueGeraisConstants";
import {
  getItensEstoqueGerais, criarItemEstoqueGeral, atualizarItemEstoqueGeral,
  inativarItemEstoqueGeral, reativarItemEstoqueGeral,
} from "@/services/itensEstoqueGerais.service";
import {
  registrarMovimentacaoItem, reverterMovimentacaoItem, getMovimentacoes,
} from "@/services/itensEstoqueMovimentacoes.service";
import { getCMVPeriodo, type CMVPeriodo } from "@/services/contabilidadeEstoqueCmv.service";
import { getFornecedores } from "@/services/fornecedores.service";
import { getDocumentosFiscais } from "@/services/contabilidadeDocumentos.service";
import type {
  DocumentoFiscal, Fornecedor, GrupoItemEstoqueGeral, ItemEstoqueGeral, ItemEstoqueGeralInsert,
  ItemEstoqueMovimentacao, TipoMovimentacaoItemEstoque,
} from "@/types";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type AbaEstoque = "itens" | "movimentacoes" | "cmv";

const TIPO_LABEL: Record<TipoMovimentacaoItemEstoque, string> = {
  entrada: "Entrada", saida: "Saída", ajuste: "Ajuste", perda: "Perda",
  transferencia: "Transferência", saldo_inicial: "Saldo Inicial",
};
const TIPO_CHIP: Record<TipoMovimentacaoItemEstoque, string> = {
  entrada: "chip cg", saida: "chip cy", ajuste: "chip cb", perda: "chip cr",
  transferencia: "chip cp", saldo_inicial: "chip cgr",
};

function fimMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).toISOString().split("T")[0];
}
function inicioMes(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

// ─── Modal: Item de Estoque ─────────────────────────────────
const ITEM_VAZIO: ItemEstoqueGeralInsert = {
  codigo: "", descricao: "", grupo: "outros", subgrupo: null, localizacao: null,
  unidade: "un", ncm: null, fornecedor_principal_id: null, estoque_minimo: 0, ativo: true, criado_por: null,
};

function ModalItem({ editando, fornecedores, usuarioEmail, onSalvo, onFechar }: {
  editando: ItemEstoqueGeral | null; fornecedores: Fornecedor[]; usuarioEmail: string;
  onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ItemEstoqueGeralInsert>(editando ? { ...editando } : { ...ITEM_VAZIO });
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof ItemEstoqueGeralInsert>(k: K, v: ItemEstoqueGeralInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.codigo.trim() || !form.descricao.trim()) { toast("Preencha código e descrição", "err"); return; }
    setSalvando(true);
    const ok = editando
      ? await atualizarItemEstoqueGeral(editando.id, form)
      : await criarItemEstoqueGeral({ ...form, criado_por: usuarioEmail });
    setSalvando(false);
    if (!ok) { toast("Erro ao salvar", "err"); return; }
    toast(editando ? "Item atualizado" : "Item criado");
    onSalvo();
  }

  return (
    <div className="mov open" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="mod" style={{ width: "560px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="mhd">
          <div className="mtit">{editando ? "Editar Item de Estoque" : "Novo Item de Estoque"}</div>
          <button className="mcl" onClick={onFechar}>✕</button>
        </div>

        <form id="form-item-estoque" onSubmit={handleSubmit} style={{ overflowY: "auto", padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Código *</label>
              <input className="fc" value={form.codigo} onChange={(e) => set("codigo", e.target.value)} required />
            </div>
            <div className="fg">
              <label className="fl">Descrição *</label>
              <input className="fc" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Grupo</label>
              <select className="fc" value={form.grupo} onChange={(e) => set("grupo", e.target.value as GrupoItemEstoqueGeral)}>
                {GRUPOS_ITEM_ESTOQUE.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Subgrupo</label>
              <input className="fc" value={form.subgrupo ?? ""} onChange={(e) => set("subgrupo", e.target.value || null)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Localização</label>
              <input className="fc" value={form.localizacao ?? ""} onChange={(e) => set("localizacao", e.target.value || null)} />
            </div>
            <div className="fg">
              <label className="fl">Unidade</label>
              <input className="fc" value={form.unidade} onChange={(e) => set("unidade", e.target.value)} placeholder="un, kg, m, cx..." />
            </div>
            <div className="fg">
              <label className="fl">NCM</label>
              <input className="fc" value={form.ncm ?? ""} maxLength={8} style={{ fontFamily: "'DM Mono', monospace" }}
                onChange={(e) => set("ncm", e.target.value.replace(/\D/g, "").slice(0, 8) || null)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">Fornecedor Principal</label>
              <select className="fc" value={form.fornecedor_principal_id ?? ""} onChange={(e) => set("fornecedor_principal_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Estoque Mínimo</label>
              <input className="fc" type="number" step="0.001" value={form.estoque_minimo} onChange={(e) => set("estoque_minimo", Number(e.target.value))} />
            </div>
          </div>

          {editando && (
            <div style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "12px 14px", display: "flex", gap: "24px" }}>
              <div>
                <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase" }}>Saldo Atual</div>
                <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{editando.saldo_qtd} {editando.unidade}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase" }}>Custo Médio</div>
                <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{formatBRL(editando.custo_medio)}</div>
              </div>
              <div style={{ fontSize: "10px", color: "var(--t3)", alignSelf: "center" }}>Saldo/custo só mudam via Movimentações</div>
            </div>
          )}
        </form>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form="form-item-estoque" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Nova Movimentação ────────────────────────────────
function ModalMovimentacao({ itens, documentosFiscais, usuarioEmail, onSalvo, onFechar }: {
  itens: ItemEstoqueGeral[]; documentosFiscais: DocumentoFiscal[]; usuarioEmail: string;
  onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [itemId, setItemId] = useState<number | "">("");
  const [tipo, setTipo] = useState<TipoMovimentacaoItemEstoque>("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [sentidoAjuste, setSentidoAjuste] = useState<"aumentar" | "diminuir">("aumentar");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [localizacaoDestino, setLocalizacaoDestino] = useState("");
  const [documentoFiscalId, setDocumentoFiscalId] = useState<number | "">("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemId) { toast("Selecione um item", "err"); return; }
    if (tipo !== "transferencia" && !quantidade) { toast("Informe a quantidade", "err"); return; }
    if (tipo === "transferencia" && !localizacaoDestino.trim()) { toast("Informe a localização de destino", "err"); return; }

    let qtdSinalizada = Number(quantidade) || 0;
    if (tipo === "saida" || tipo === "perda") qtdSinalizada = -Math.abs(qtdSinalizada);
    if (tipo === "entrada" || tipo === "saldo_inicial") qtdSinalizada = Math.abs(qtdSinalizada);
    if (tipo === "ajuste") qtdSinalizada = sentidoAjuste === "aumentar" ? Math.abs(qtdSinalizada) : -Math.abs(qtdSinalizada);

    setSalvando(true);
    const res = await registrarMovimentacaoItem({
      itemId: Number(itemId), tipo, quantidade: qtdSinalizada,
      custoUnitario: custoUnitario ? Number(custoUnitario) : null,
      localizacaoDestino: tipo === "transferencia" ? localizacaoDestino : null,
      documentoFiscalId: documentoFiscalId ? Number(documentoFiscalId) : null,
      usuario: usuarioEmail, obs: obs || null,
    });
    setSalvando(false);
    if (!res.ok) { toast(res.motivo ?? "Erro ao registrar movimentação", "err"); return; }
    if (res.alertaMinimo) toast(res.alertaMensagem ?? "Estoque abaixo do mínimo", "warn");
    else toast("Movimentação registrada");
    onSalvo();
  }

  return (
    <div className="mov open" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="mod" style={{ width: "520px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="mhd">
          <div className="mtit">Nova Movimentação</div>
          <button className="mcl" onClick={onFechar}>✕</button>
        </div>

        <form id="form-movimentacao" onSubmit={handleSubmit} style={{ overflowY: "auto", padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="fg">
            <label className="fl">Item</label>
            <select className="fc" value={itemId} onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : "")} required>
              <option value="">Selecione...</option>
              {itens.map((i) => <option key={i.id} value={i.id}>{i.codigo} — {i.descricao} (saldo: {i.saldo_qtd} {i.unidade})</option>)}
            </select>
          </div>

          <div className="fg">
            <label className="fl">Tipo</label>
            <select className="fc" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimentacaoItemEstoque)}>
              {(Object.keys(TIPO_LABEL) as TipoMovimentacaoItemEstoque[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </select>
          </div>

          {tipo === "ajuste" && (
            <div style={{ display: "flex", gap: "8px" }}>
              {(["aumentar", "diminuir"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSentidoAjuste(s)} style={{
                  padding: "7px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  background: sentidoAjuste === s ? "var(--acc)" : "transparent",
                  border: `1px solid ${sentidoAjuste === s ? "var(--acc)" : "var(--b2)"}`,
                  color: sentidoAjuste === s ? "#000" : "var(--t3)",
                }}>{s === "aumentar" ? "Aumentar saldo" : "Diminuir saldo"}</button>
              ))}
            </div>
          )}

          {tipo !== "transferencia" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="fg">
                <label className="fl">Quantidade</label>
                <input className="fc" type="number" step="0.001" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required style={{ fontFamily: "'DM Mono', monospace" }} />
              </div>
              <div className="fg">
                <label className="fl">Custo Unitário</label>
                <input className="fc" type="number" step="0.0001" value={custoUnitario} onChange={(e) => setCustoUnitario(e.target.value)} placeholder="opcional" style={{ fontFamily: "'DM Mono', monospace" }} />
              </div>
            </div>
          )}

          {tipo === "transferencia" && (
            <div className="fg">
              <label className="fl">Localização de Destino</label>
              <input className="fc" value={localizacaoDestino} onChange={(e) => setLocalizacaoDestino(e.target.value)} required />
            </div>
          )}

          <div className="fg">
            <label className="fl">Documento Fiscal (opcional)</label>
            <select className="fc" value={documentoFiscalId} onChange={(e) => setDocumentoFiscalId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">—</option>
              {documentosFiscais.map((d) => <option key={d.id} value={d.id}>{d.numero_documento ?? `#${d.id}`} ({d.tipo})</option>)}
            </select>
          </div>

          <div className="fg">
            <label className="fl">Observações</label>
            <textarea className="fc" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </form>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form="form-movimentacao" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ───────────────────────────────────────
export default function EstoqueGeralPage() {
  const { toast } = useToast();
  const agora = new Date();
  const [aba, setAba] = useState<AbaEstoque>("itens");
  const [usuarioEmail, setUsuarioEmail] = useState("");

  // Itens
  const [itens, setItens] = useState<ItemEstoqueGeral[]>([]);
  const [buscaItens, setBuscaItens] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState<GrupoItemEstoqueGeral | "">("");
  const [filtroAtivo, setFiltroAtivo] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [editandoItem, setEditandoItem] = useState<ItemEstoqueGeral | null>(null);
  const [modalItemAberto, setModalItemAberto] = useState(false);

  // Movimentações
  const [movs, setMovs] = useState<ItemEstoqueMovimentacao[]>([]);
  const [filtroItemMov, setFiltroItemMov] = useState<number | "">("");
  const [filtroTipoMov, setFiltroTipoMov] = useState<TipoMovimentacaoItemEstoque | "">("");
  const [modalMovAberto, setModalMovAberto] = useState(false);

  // CMV
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [cmv, setCmv] = useState<CMVPeriodo | null>(null);

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [documentosFiscais, setDocumentosFiscais] = useState<DocumentoFiscal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
    getFornecedores(true).then(setFornecedores);
    getDocumentosFiscais({}).then(setDocumentosFiscais);
  }, []);

  useEffect(() => { load(); }, [aba, ano, mes]);

  async function load() {
    setLoading(true);
    if (aba === "itens") {
      setItens(await getItensEstoqueGerais({
        grupo: filtroGrupo || undefined,
        ativo: filtroAtivo === "todos" ? undefined : filtroAtivo === "ativos",
      }));
    } else if (aba === "movimentacoes") {
      const [lista, todosItens] = await Promise.all([
        getMovimentacoes({}),
        getItensEstoqueGerais({ ativo: true }),
      ]);
      setMovs(lista);
      setItens(todosItens);
    } else if (aba === "cmv") {
      setCmv(await getCMVPeriodo(inicioMes(ano, mes), fimMes(ano, mes)));
    }
    setLoading(false);
  }

  // Reaplica filtro de itens quando muda busca/grupo/ativo (sem novo round-trip pro grupo/ativo, já filtrado client-side pra busca)
  useEffect(() => { if (aba === "itens") load(); }, [filtroGrupo, filtroAtivo]);

  const itensFiltrados = useMemo(() => {
    if (!buscaItens.trim()) return itens;
    const q = buscaItens.toLowerCase();
    return itens.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q));
  }, [itens, buscaItens]);

  const movsFiltradas = useMemo(() => {
    let lista = movs;
    if (filtroItemMov) lista = lista.filter((m) => m.item_id === filtroItemMov);
    if (filtroTipoMov) lista = lista.filter((m) => m.tipo === filtroTipoMov);
    return lista;
  }, [movs, filtroItemMov, filtroTipoMov]);

  const ultimaMovPorItem = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of movs) {
      const atual = map.get(m.item_id) ?? -Infinity;
      if (m.id > atual) map.set(m.item_id, m.id);
    }
    return map;
  }, [movs]);

  async function handleInativar(item: ItemEstoqueGeral) {
    if (!confirm(`${item.ativo ? "Inativar" : "Reativar"} o item "${item.descricao}"?`)) return;
    const ok = item.ativo ? await inativarItemEstoqueGeral(item.id) : await reativarItemEstoqueGeral(item.id);
    toast(ok ? "Item atualizado" : "Erro ao atualizar", ok ? "ok" : "err");
    if (ok) load();
  }

  async function handleExcluirMov(mov: ItemEstoqueMovimentacao) {
    if (!confirm("Excluir esta movimentação? O saldo do item será restaurado ao estado anterior.")) return;
    const res = await reverterMovimentacaoItem({ movimentacaoId: mov.id });
    toast(res.ok ? "Movimentação revertida" : (res.motivo ?? "Erro ao reverter"), res.ok ? "ok" : "err");
    if (res.ok) load();
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Estoque / CMV</div>
      </div>
      <ContabilidadeTabs ativo="estoque" />

      {modalItemAberto && (
        <ModalItem
          editando={editandoItem}
          fornecedores={fornecedores}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalItemAberto(false); setEditandoItem(null); load(); }}
          onFechar={() => { setModalItemAberto(false); setEditandoItem(null); }}
        />
      )}
      {modalMovAberto && (
        <ModalMovimentacao
          itens={itens}
          documentosFiscais={documentosFiscais}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalMovAberto(false); load(); }}
          onFechar={() => setModalMovAberto(false)}
        />
      )}

      <div className="con">
        <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--b1)", marginBottom: "20px" }}>
          {([
            { id: "itens", label: "Itens" },
            { id: "movimentacoes", label: "Movimentações" },
            { id: "cmv", label: "CMV" },
          ] as { id: AbaEstoque; label: string }[]).map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              padding: "10px 18px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${aba === a.id ? "var(--acc)" : "transparent"}`,
              color: aba === a.id ? "var(--acc)" : "var(--t3)", transition: "all .15s",
            }}>{a.label}</button>
          ))}
        </div>

        {aba === "itens" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input className="fc" placeholder="Buscar código ou descrição..." value={buscaItens} onChange={(e) => setBuscaItens(e.target.value)} style={{ width: "220px" }} />
                <select className="fc" value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value as GrupoItemEstoqueGeral | "")} style={{ width: "180px" }}>
                  <option value="">Todos os grupos</option>
                  {GRUPOS_ITEM_ESTOQUE.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
                <select className="fc" value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value as typeof filtroAtivo)} style={{ width: "120px" }}>
                  <option value="ativos">Ativos</option>
                  <option value="inativos">Inativos</option>
                  <option value="todos">Todos</option>
                </select>
              </div>
              <button className="btn bp sm" onClick={() => { setEditandoItem(null); setModalItemAberto(true); }}>+ Novo Item</button>
            </div>

            {loading ? <div className="loading">Carregando...</div> : itensFiltrados.length === 0 ? (
              <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhum item encontrado.</div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th><th>Descrição</th><th>Grupo</th><th>Localização</th>
                      <th>Saldo</th><th>Custo Médio</th><th>Valor Total</th><th>Última Compra</th><th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensFiltrados.map((i) => (
                      <tr key={i.id} style={{ opacity: i.ativo ? 1 : 0.55 }}>
                        <td className="mono">{i.codigo}</td>
                        <td>{i.descricao}</td>
                        <td><span className="chip cgr" style={{ fontSize: "11px" }}>{labelGrupoItem(i.grupo)}</span></td>
                        <td>{i.localizacao ?? "—"}</td>
                        <td className="mono">
                          {i.saldo_qtd} {i.unidade}
                          {i.estoque_minimo > 0 && i.saldo_qtd <= i.estoque_minimo && (
                            <span className="chip cr" style={{ fontSize: "9px", marginLeft: "6px" }}>mín.</span>
                          )}
                        </td>
                        <td className="mono">{formatBRL(i.custo_medio)}</td>
                        <td className="mono">{formatBRL(i.valor_total)}</td>
                        <td className="mono" style={{ fontSize: "11px", color: "var(--t3)" }}>{i.ultima_compra_em ? formatDate(i.ultima_compra_em) : "—"}</td>
                        <td style={{ display: "flex", gap: "6px" }}>
                          <button className="btn bg xs" onClick={() => { setEditandoItem(i); setModalItemAberto(true); }}>Editar</button>
                          <button className="btn bg xs" onClick={() => handleInativar(i)}>{i.ativo ? "Inativar" : "Reativar"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {aba === "movimentacoes" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <select className="fc" value={filtroItemMov} onChange={(e) => setFiltroItemMov(e.target.value ? Number(e.target.value) : "")} style={{ width: "220px" }}>
                  <option value="">Todos os itens</option>
                  {itens.map((i) => <option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>)}
                </select>
                <select className="fc" value={filtroTipoMov} onChange={(e) => setFiltroTipoMov(e.target.value as TipoMovimentacaoItemEstoque | "")} style={{ width: "160px" }}>
                  <option value="">Todos os tipos</option>
                  {(Object.keys(TIPO_LABEL) as TipoMovimentacaoItemEstoque[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                </select>
              </div>
              <button className="btn bp sm" onClick={() => setModalMovAberto(true)}>+ Nova Movimentação</button>
            </div>

            {loading ? <div className="loading">Carregando...</div> : movsFiltradas.length === 0 ? (
              <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhuma movimentação encontrada.</div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th><th>Item</th><th>Tipo</th><th>Quantidade</th><th>Custo Unit.</th>
                      <th>Saldo Após</th><th>Doc. Fiscal</th><th>Usuário</th><th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movsFiltradas.map((m) => {
                      const ehUltima = ultimaMovPorItem.get(m.item_id) === m.id;
                      return (
                        <tr key={m.id}>
                          <td className="mono" style={{ fontSize: "12px", color: "var(--t3)" }}>{formatDate(m.created_at)}</td>
                          <td>{m.itens_estoque_gerais ? `${m.itens_estoque_gerais.codigo} — ${m.itens_estoque_gerais.descricao}` : `#${m.item_id}`}</td>
                          <td><span className={TIPO_CHIP[m.tipo]} style={{ fontSize: "11px" }}>{TIPO_LABEL[m.tipo]}</span></td>
                          <td className="mono">{m.quantidade > 0 ? "+" : ""}{m.quantidade}</td>
                          <td className="mono">{m.custo_unitario !== null ? formatBRL(m.custo_unitario) : "—"}</td>
                          <td className="mono">{m.saldo_apos}</td>
                          <td style={{ fontSize: "12px" }}>{m.documentos_fiscais ? (m.documentos_fiscais.numero_documento ?? `#${m.documentos_fiscais.id}`) : "—"}</td>
                          <td style={{ fontSize: "12px", color: "var(--t3)" }}>{m.usuario ?? "—"}</td>
                          <td>
                            <button className="btn bg xs" disabled={!ehUltima} title={ehUltima ? "Excluir e reverter" : "Só a movimentação mais recente do item pode ser excluída"} onClick={() => handleExcluirMov(m)}>
                              Excluir
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {aba === "cmv" && (
          <>
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
              <select className="fc" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: "140px" }}>
                {MESES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
              </select>
              <input className="fc" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: "90px" }} />
            </div>

            {loading || !cmv ? <div className="loading">Carregando...</div> : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
                  {[
                    { label: "Receita do Período", value: formatBRL(cmv.receita) },
                    { label: "CMV Total", value: formatBRL(cmv.cmvTotal) },
                    { label: "Lucro Bruto", value: formatBRL(cmv.lucroBruto) },
                    { label: "Margem Bruta", value: `${cmv.margemBrutaPct.toFixed(1)}%` },
                  ].map((c) => (
                    <div key={c.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px" }}>
                      <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "4px" }}>{c.label}</div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "18px 20px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", marginBottom: "4px" }}>Vidro</div>
                    <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "14px" }}>CMV por pedido entregue — EI/Compras/EF não se aplicam (ledger de vidro só guarda custo atual)</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "var(--t1)" }}>{formatBRL(cmv.vidro.cmv)}</div>
                  </div>

                  <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "18px 20px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", marginBottom: "4px" }}>Itens Gerais</div>
                    <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "14px" }}>Estoque Inicial + Compras − Estoque Final</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                      <span style={{ color: "var(--t3)" }}>Estoque Inicial</span><span className="mono">{formatBRL(cmv.itensGerais.estoqueInicial)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                      <span style={{ color: "var(--t3)" }}>Compras</span><span className="mono">+ {formatBRL(cmv.itensGerais.compras)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "10px" }}>
                      <span style={{ color: "var(--t3)" }}>Estoque Final</span><span className="mono">− {formatBRL(cmv.itensGerais.estoqueFinal)}</span>
                    </div>
                    <div style={{ borderTop: "1px solid var(--b1)", paddingTop: "10px", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700 }}>CMV</span>
                      <span className="mono" style={{ fontSize: "18px", fontWeight: 700 }}>{formatBRL(cmv.itensGerais.cmv)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
