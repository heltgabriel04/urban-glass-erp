"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  getNaoConformidades,
  createNaoConformidade,
  updateNaoConformidade,
  getHistoricoNC,
  uploadFotosNC,
  deleteFotoNC,
} from "@/services/qualidade.service";
import { formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import SearchInput from "@/components/ui/SearchInput";
import type {
  NaoConformidade, NaoConformidadeInsert,
  StatusNaoConformidade, GravidadeNC, TipoNC,
  HistoricoNC,
} from "@/types";
import { supabase } from "@/lib/supabase/client";

const TIPOS_NC: TipoNC[] = [
  "Quebra de vidro","Medida incorreta","Corte errado","Lapidação incorreta",
  "Furo em posição errada","Mancha ou risco","Peça trincada","Material com defeito",
  "Erro de separação","Erro de conferência","Retrabalho necessário",
  "Perda de matéria-prima","Perda operacional","Outro",
];

const ETAPAS = [
  "Aguardando otimização","Em Produção – Corte","Qualidade (Corte)",
  "Em Produção – Lapidação","Qualidade (Lapidação)","Separação","Finalizado","Expedição","Recebimento",
];

const GRAVIDADE_COR: Record<GravidadeNC, string> = {
  Baixa:    "var(--ok)",
  Média:    "var(--warn)",
  Alta:     "#f97316",
  Crítica:  "var(--err)",
};

const STATUS_COR: Record<StatusNaoConformidade, string> = {
  "Aberta":               "var(--warn)",
  "Em Análise":           "var(--acc2)",
  "Aguardando Correção":  "#f97316",
  "Resolvida":            "var(--ok)",
  "Cancelada":            "var(--t3)",
};

const STATUS_LIST: StatusNaoConformidade[] = [
  "Aberta","Em Análise","Aguardando Correção","Resolvida","Cancelada",
];

const BLANK_FORM: NaoConformidadeInsert = {
  codigo: "",
  pedido_id: null,
  cliente_id: null,
  produto_nome: null,
  item_pedido_id: null,
  etapa: ETAPAS[0],
  tipo: "Quebra de vidro",
  gravidade: "Média",
  status: "Aberta",
  descricao: "",
  obs: null,
  fotos_urls: null,
  registrado_por: null,
  responsavel_analise: null,
  dt_ocorrencia: new Date().toISOString(),
  dt_resolucao: null,
};

export default function NaoConformidadesPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [ncs, setNcs]               = useState<NaoConformidade[]>([]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState(false);
  const [modal, setModal]           = useState(false);
  const [detalhe, setDetalhe]       = useState<NaoConformidade | null>(null);
  const [historico, setHistorico]   = useState<HistoricoNC[]>([]);
  const [form, setForm]             = useState<NaoConformidadeInsert>(BLANK_FORM);
  const [pedidos, setPedidos]       = useState<{ id: string; cliente_nome: string }[]>([]);
  const [usuario, setUsuario]       = useState<string>("");
  const [fotosNovas, setFotosNovas]               = useState<File[]>([]);
  const [fotosDetalhePendentes, setFotosDetalhePendentes] = useState<File[]>([]);
  const [fotoVisualizando, setFotoVisualizando]   = useState<string | null>(null);
  const [uploadando, setUploadando]               = useState(false);

  // Filtros
  const [filtroStatus, setFiltroStatus]     = useState<string>("todos");
  const [filtroGravidade, setFiltroGravidade] = useState<string>("todas");
  const [busca, setBusca]                   = useState("");

  useEffect(() => {
    load();
    supabase.from("pedidos").select("id, clientes(nome)").in("status", [
      "Aguardando otimização","Em Produção – Corte","Qualidade (Corte)",
      "Em Produção – Lapidação","Qualidade (Lapidação)","Separação",
    ]).order("id", { ascending: false }).limit(100)
      .then(({ data }) => setPedidos((data ?? []).map((p: any) => ({ id: p.id, cliente_nome: p.clientes?.nome ?? "—" }))));
    supabase.auth.getUser().then(({ data }) => setUsuario(data.user?.email ?? ""));
  }, []);

  async function load() {
    setLoading(true);
    const data = await getNaoConformidades();
    setNcs(data);
    setLoading(false);
  }

  const filtradas = useMemo(() => ncs.filter(nc => {
    if (filtroStatus !== "todos" && nc.status !== filtroStatus) return false;
    if (filtroGravidade !== "todas" && nc.gravidade !== filtroGravidade) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return nc.codigo.toLowerCase().includes(b) || (nc.pedido_id ?? "").toLowerCase().includes(b) || nc.tipo.toLowerCase().includes(b) || nc.descricao.toLowerCase().includes(b);
    }
    return true;
  }), [ncs, filtroStatus, filtroGravidade, busca]);

  async function abrirDetalhe(nc: NaoConformidade) {
    setDetalhe(nc);
    const hist = await getHistoricoNC(nc.id);
    setHistorico(hist);
  }

  async function handleSalvar() {
    if (!form.descricao.trim()) { toast("Descrição obrigatória", "warn"); return; }
    setSalvando(true);
    const payload: NaoConformidadeInsert = { ...form, registrado_por: usuario || null };
    const result = await createNaoConformidade(payload);
    if (result) {
      if (fotosNovas.length > 0) {
        setUploadando(true);
        const urls = await uploadFotosNC(result.id, fotosNovas);
        if (urls.length > 0) await updateNaoConformidade(result.id, { fotos_urls: urls });
        setUploadando(false);
      }
      toast(`${result.codigo} aberta com sucesso`);
      setModal(false);
      setForm(BLANK_FORM);
      setFotosNovas([]);
      await load();
    } else {
      toast("Erro ao criar NC", "err");
    }
    setSalvando(false);
  }

  async function handleAdicionarFotos(nc: NaoConformidade) {
    if (fotosDetalhePendentes.length === 0) return;
    setUploadando(true);
    const urls = await uploadFotosNC(nc.id, fotosDetalhePendentes);
    if (urls.length > 0) {
      const existentes = nc.fotos_urls ?? [];
      const result = await updateNaoConformidade(nc.id, { fotos_urls: [...existentes, ...urls] }, usuario);
      if (result) { setDetalhe(result); toast("Foto(s) adicionada(s)"); }
      else toast("Erro ao salvar fotos", "err");
    }
    setFotosDetalhePendentes([]);
    setUploadando(false);
  }

  async function handleDeletarFoto(nc: NaoConformidade, url: string) {
    if (!(await confirm("Remover esta foto permanentemente?", { perigo: true }))) return;
    setUploadando(true);
    await deleteFotoNC(url);
    const novas = (nc.fotos_urls ?? []).filter(u => u !== url);
    const result = await updateNaoConformidade(nc.id, { fotos_urls: novas.length > 0 ? novas : null }, usuario);
    if (result) { setDetalhe(result); toast("Foto removida"); }
    setUploadando(false);
  }

  async function handleMudarStatus(nc: NaoConformidade, novoStatus: StatusNaoConformidade) {
    setSalvando(true);
    const updates: Partial<NaoConformidade> = {
      status: novoStatus,
      ...(novoStatus === "Resolvida" ? { dt_resolucao: new Date().toISOString() } : {}),
    };
    const result = await updateNaoConformidade(nc.id, updates, usuario, `Status alterado para ${novoStatus}`);
    if (result) {
      toast(`Status → ${novoStatus}`);
      setDetalhe(result);
      const hist = await getHistoricoNC(nc.id);
      setHistorico(hist);
      await load();
    } else {
      toast("Erro ao atualizar", "err");
    }
    setSalvando(false);
  }

  const resumo = useMemo(() => ({
    total:    ncs.length,
    abertas:  ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length,
    criticas: ncs.filter(n => n.gravidade === "Crítica" && n.status !== "Resolvida" && n.status !== "Cancelada").length,
    resolvidas: ncs.filter(n => n.status === "Resolvida").length,
  }), [ncs]);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Não Conformidades</div>
        <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
          <SearchInput
            icon={false}
            placeholder="Buscar por código, pedido ou tipo…"
            value={busca} onChange={setBusca}
            inputStyle={{ fontSize:"11px", padding:"5px 10px", borderRadius:"6px", border:"1px solid var(--b2)", background:"var(--surf2)", color:"var(--t1)", width:"220px", fontFamily:"'DM Mono',monospace" }}
          />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ fontSize:"11px", padding:"5px 8px", borderRadius:"6px", border:"1px solid var(--b2)", background:"var(--surf2)", color:"var(--t1)", fontFamily:"'DM Mono',monospace" }}>
            <option value="todos">Todos os status</option>
            {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filtroGravidade} onChange={e => setFiltroGravidade(e.target.value)}
            style={{ fontSize:"11px", padding:"5px 8px", borderRadius:"6px", border:"1px solid var(--b2)", background:"var(--surf2)", color:"var(--t1)", fontFamily:"'DM Mono',monospace" }}>
            <option value="todas">Toda gravidade</option>
            {(["Baixa","Média","Alta","Crítica"] as GravidadeNC[]).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button className="btn bp sm" onClick={() => { setForm(BLANK_FORM); setModal(true); }}>+ Nova NC</button>
        </div>
      </div>

      <div className="con" style={{ display:"flex", flexDirection:"column", gap:"14px" }}>

        {/* KPIs */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px" }}>
          {[
            { label:"Total de NCs",     value: resumo.total,      color:"var(--acc)"  },
            { label:"Em Aberto",        value: resumo.abertas,    color:"var(--warn)" },
            { label:"Críticas Ativas",  value: resumo.criticas,   color:"var(--err)"  },
            { label:"Resolvidas",       value: resumo.resolvidas, color:"var(--ok)"   },
          ].map(c => (
            <div key={c.label} style={{ background:"var(--surf)", border:"1px solid var(--b1)", borderRadius:"12px", padding:"18px 20px" }}>
              <div style={{ fontSize:"10px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".08em", fontWeight:600, marginBottom:"8px" }}>{c.label}</div>
              <div style={{ fontSize:"28px", fontWeight:700, color:c.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Lista */}
        <div className="card" style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--b1)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span className="ct" style={{ margin:0 }}>Registros <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{filtradas.length} resultado(s)</span></span>
          </div>

          {loading ? (
            <div className="loading" style={{ padding:"40px" }}>Carregando…</div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px", color:"var(--t3)", fontSize:"13px" }}>
              Nenhuma não conformidade encontrada.
              <br/><span style={{ fontSize:"11px" }}>Clique em "+ Nova NC" para registrar a primeira ocorrência.</span>
            </div>
          ) : (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 120px 80px 90px 110px 100px", gap:"8px", padding:"8px 18px", fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".07em", fontFamily:"'DM Mono',monospace", borderBottom:"1px solid var(--b1)" }}>
                <div>Código</div><div>Tipo / Descrição</div><div>Pedido</div><div>Etapa</div><div>Gravidade</div><div>Status</div><div>Data</div>
              </div>
              {filtradas.map((nc, i) => (
                <div key={nc.id}
                  onClick={() => abrirDetalhe(nc)}
                  style={{ display:"grid", gridTemplateColumns:"90px 1fr 120px 80px 90px 110px 100px", gap:"8px", padding:"11px 18px", borderBottom:"1px solid var(--b1)", cursor:"pointer", background: i % 2 === 0 ? "transparent" : "var(--surf2)", transition:"background .1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(61,255,160,.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "var(--surf2)")}
                >
                  <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", fontWeight:700, color:"var(--acc)" }}>{nc.codigo}</div>
                  <div>
                    <div style={{ fontSize:"12px", fontWeight:600, color:"var(--t1)" }}>{nc.tipo}</div>
                    <div style={{ fontSize:"10px", color:"var(--t3)", marginTop:"2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nc.descricao}</div>
                  </div>
                  <div style={{ fontSize:"11px", fontFamily:"'DM Mono',monospace", color:"var(--acc2)", fontWeight:600 }}>{nc.pedido_id ?? "—"}</div>
                  <div style={{ fontSize:"10px", color:"var(--t2)" }}>{nc.etapa.replace("Em Produção – ","").replace("Qualidade ","Q.")}</div>
                  <div>
                    <span style={{ fontSize:"10px", fontWeight:700, padding:"2px 7px", borderRadius:"4px", background: GRAVIDADE_COR[nc.gravidade] + "22", color: GRAVIDADE_COR[nc.gravidade], border:`1px solid ${GRAVIDADE_COR[nc.gravidade]}44` }}>
                      {nc.gravidade}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize:"10px", fontWeight:600, padding:"2px 7px", borderRadius:"4px", background: STATUS_COR[nc.status] + "22", color: STATUS_COR[nc.status], border:`1px solid ${STATUS_COR[nc.status]}44` }}>
                      {nc.status}
                    </span>
                  </div>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{formatDate(nc.dt_ocorrencia.substring(0,10))}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Modal: Nova NC ─────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={{ background:"var(--surf)", border:"1px solid var(--b2)", borderRadius:"14px", width:"620px", maxHeight:"90vh", overflow:"auto", padding:"24px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
              <span style={{ fontSize:"15px", fontWeight:700, color:"var(--t1)" }}>Registrar Não Conformidade</span>
              <button onClick={() => setModal(false)} style={{ background:"transparent", border:"none", color:"var(--t3)", fontSize:"18px", cursor:"pointer" }}>✕</button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Tipo de ocorrência *</label>
                  <select className="fc" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoNC }))}>
                    {TIPOS_NC.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Gravidade *</label>
                  <select className="fc" value={form.gravidade} onChange={e => setForm(f => ({ ...f, gravidade: e.target.value as GravidadeNC }))}>
                    {(["Baixa","Média","Alta","Crítica"] as GravidadeNC[]).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Etapa da produção *</label>
                  <select className="fc" value={form.etapa} onChange={e => setForm(f => ({ ...f, etapa: e.target.value }))}>
                    {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Pedido vinculado</label>
                  <select className="fc" value={form.pedido_id ?? ""} onChange={e => setForm(f => ({ ...f, pedido_id: e.target.value || null }))}>
                    <option value="">— Nenhum —</option>
                    {pedidos.map(p => <option key={p.id} value={p.id}>{p.id} · {p.cliente_nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="fg">
                <label className="fl">Produto envolvido</label>
                <input className="fc" placeholder="Ex: Temperado 8mm Incolor" value={form.produto_nome ?? ""} onChange={e => setForm(f => ({ ...f, produto_nome: e.target.value || null }))} />
              </div>

              <div className="fg">
                <label className="fl">Descrição detalhada *</label>
                <textarea className="fc" rows={3} placeholder="Descreva o que aconteceu…" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} style={{ resize:"vertical", fontFamily:"inherit" }} />
              </div>

              <div className="fg">
                <label className="fl">Observações</label>
                <textarea className="fc" rows={2} placeholder="Informações adicionais…" value={form.obs ?? ""} onChange={e => setForm(f => ({ ...f, obs: e.target.value || null }))} style={{ resize:"vertical", fontFamily:"inherit" }} />
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Responsável pela análise</label>
                  <input className="fc" placeholder="Nome ou setor responsável" value={form.responsavel_analise ?? ""} onChange={e => setForm(f => ({ ...f, responsavel_analise: e.target.value || null }))} />
                </div>
                <div className="fg">
                  <label className="fl">Status inicial</label>
                  <select className="fc" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as StatusNaoConformidade }))}>
                    {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Fotos */}
              <div className="fg">
                <label className="fl">Fotos (opcional)</label>
                <label style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"6px", padding:"16px", border:"2px dashed var(--b2)", borderRadius:"8px", cursor:"pointer", background:"var(--surf2)", transition:"border-color .15s" }}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--acc)"; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = "var(--b2)"; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--b2)"; const f = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); setFotosNovas(p => [...p, ...f]); }}>
                  <span style={{ fontSize:"20px" }}>📷</span>
                  <span style={{ fontSize:"11px", color:"var(--t3)" }}>Arraste imagens ou clique para selecionar</span>
                  <input type="file" accept="image/*" multiple style={{ display:"none" }}
                    onChange={e => { const f = Array.from(e.target.files ?? []); setFotosNovas(p => [...p, ...f]); e.target.value = ""; }} />
                </label>
                {fotosNovas.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", marginTop:"8px" }}>
                    {fotosNovas.map((f, i) => (
                      <div key={i} style={{ position:"relative", width:"72px", height:"72px" }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"6px", border:"1px solid var(--b2)" }} />
                        <button onClick={() => setFotosNovas(p => p.filter((_, j) => j !== i))}
                          style={{ position:"absolute", top:"-6px", right:"-6px", background:"var(--err)", border:"none", borderRadius:"50%", width:"18px", height:"18px", color:"#fff", fontSize:"10px", cursor:"pointer", lineHeight:"18px", padding:0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", marginTop:"6px" }}>
                <button className="btn bg sm" onClick={() => { setModal(false); setFotosNovas([]); }}>Cancelar</button>
                <button className="btn bp sm" onClick={handleSalvar} disabled={salvando || uploadando}>
                  {uploadando ? "Enviando fotos…" : salvando ? "Salvando…" : "Registrar NC"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalhe NC ──────────────────────────────────────────── */}
      {detalhe && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => e.target === e.currentTarget && setDetalhe(null)}>
          <div style={{ background:"var(--surf)", border:"1px solid var(--b2)", borderRadius:"14px", width:"680px", maxHeight:"90vh", overflow:"auto", padding:"24px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"18px" }}>
              <div>
                <div style={{ fontSize:"18px", fontWeight:800, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{detalhe.codigo}</div>
                <div style={{ fontSize:"13px", color:"var(--t2)", marginTop:"2px" }}>{detalhe.tipo} · {detalhe.etapa}</div>
              </div>
              <button onClick={() => setDetalhe(null)} style={{ background:"transparent", border:"none", color:"var(--t3)", fontSize:"18px", cursor:"pointer" }}>✕</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"16px" }}>
              {[
                { label:"Gravidade", value: detalhe.gravidade, color: GRAVIDADE_COR[detalhe.gravidade] },
                { label:"Status",    value: detalhe.status,    color: STATUS_COR[detalhe.status] },
                { label:"Pedido",    value: detalhe.pedido_id ?? "—", color:"var(--acc2)" },
                { label:"Produto",   value: detalhe.produto_nome ?? "—", color:"var(--t1)" },
                { label:"Registrado por", value: detalhe.registrado_por ?? "—", color:"var(--t2)" },
                { label:"Responsável análise", value: detalhe.responsavel_analise ?? "—", color:"var(--t2)" },
              ].map(r => (
                <div key={r.label} style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 14px" }}>
                  <div style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:"4px" }}>{r.label}</div>
                  <div style={{ fontSize:"13px", fontWeight:600, color:r.color }}>{r.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background:"var(--surf2)", borderRadius:"8px", padding:"12px 14px", marginBottom:"14px" }}>
              <div style={{ fontSize:"10px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:"6px" }}>Descrição</div>
              <div style={{ fontSize:"13px", color:"var(--t1)", lineHeight:1.6 }}>{detalhe.descricao}</div>
              {detalhe.obs && <div style={{ fontSize:"11px", color:"var(--t3)", marginTop:"8px" }}>{detalhe.obs}</div>}
            </div>

            {/* Fotos */}
            <div style={{ marginBottom:"14px" }}>
              <div style={{ fontSize:"10px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:"8px" }}>Fotos</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
                {(detalhe.fotos_urls ?? []).map((url, i) => (
                  <div key={i} style={{ position:"relative", width:"80px", height:"80px" }}>
                    <img src={url} alt="" onClick={() => setFotoVisualizando(url)}
                      style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"6px", border:"1px solid var(--b2)", cursor:"zoom-in" }} />
                    {detalhe.status !== "Resolvida" && detalhe.status !== "Cancelada" && (
                      <button onClick={() => handleDeletarFoto(detalhe, url)} disabled={uploadando}
                        style={{ position:"absolute", top:"-6px", right:"-6px", background:"var(--err)", border:"none", borderRadius:"50%", width:"18px", height:"18px", color:"#fff", fontSize:"10px", cursor:"pointer", lineHeight:"18px", padding:0 }}>✕</button>
                    )}
                  </div>
                ))}
                {/* Adicionar fotos */}
                {detalhe.status !== "Resolvida" && detalhe.status !== "Cancelada" && (
                  <label style={{ width:"80px", height:"80px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:"2px dashed var(--b2)", borderRadius:"6px", cursor:"pointer", background:"var(--surf2)", fontSize:"10px", color:"var(--t3)", gap:"4px" }}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--acc)"; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = "var(--b2)"; }}
                    onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--b2)"; const f = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); setFotosDetalhePendentes(p => [...p, ...f]); }}>
                    <span style={{ fontSize:"18px" }}>+</span>
                    <span>foto</span>
                    <input type="file" accept="image/*" multiple style={{ display:"none" }}
                      onChange={e => { const f = Array.from(e.target.files ?? []); setFotosDetalhePendentes(p => [...p, ...f]); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              {fotosDetalhePendentes.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", marginTop:"8px", alignItems:"center" }}>
                  {fotosDetalhePendentes.map((f, i) => (
                    <div key={i} style={{ position:"relative", width:"60px", height:"60px" }}>
                      <img src={URL.createObjectURL(f)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"6px", border:"2px dashed var(--acc)", opacity:.8 }} />
                      <button onClick={() => setFotosDetalhePendentes(p => p.filter((_, j) => j !== i))}
                        style={{ position:"absolute", top:"-5px", right:"-5px", background:"var(--err)", border:"none", borderRadius:"50%", width:"16px", height:"16px", color:"#fff", fontSize:"9px", cursor:"pointer", lineHeight:"16px", padding:0 }}>✕</button>
                    </div>
                  ))}
                  <button className="btn bp sm" onClick={() => handleAdicionarFotos(detalhe)} disabled={uploadando}
                    style={{ fontSize:"11px" }}>
                    {uploadando ? "Enviando…" : `Enviar ${fotosDetalhePendentes.length} foto(s)`}
                  </button>
                </div>
              )}
              {(detalhe.fotos_urls ?? []).length === 0 && fotosDetalhePendentes.length === 0 && (
                <span style={{ fontSize:"11px", color:"var(--t3)" }}>Nenhuma foto anexada.</span>
              )}
            </div>

            {/* Ações de status */}
            {detalhe.status !== "Resolvida" && detalhe.status !== "Cancelada" && (
              <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"16px" }}>
                {STATUS_LIST.filter(s => s !== detalhe.status && s !== "Cancelada").map(s => (
                  <button key={s} disabled={salvando} onClick={() => handleMudarStatus(detalhe, s)}
                    style={{ fontSize:"11px", padding:"5px 12px", borderRadius:"6px", cursor:"pointer", border:`1px solid ${STATUS_COR[s]}55`, background:`${STATUS_COR[s]}15`, color:STATUS_COR[s], fontWeight:600 }}>
                    → {s}
                  </button>
                ))}
                <button disabled={salvando} onClick={() => handleMudarStatus(detalhe, "Cancelada")}
                  style={{ fontSize:"11px", padding:"5px 12px", borderRadius:"6px", cursor:"pointer", border:"1px solid var(--b2)", background:"transparent", color:"var(--t3)", fontWeight:600 }}>
                  Cancelar NC
                </button>
              </div>
            )}

            {/* Histórico */}
            {historico.length > 0 && (
              <div>
                <div style={{ fontSize:"10px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:"8px" }}>Histórico de alterações</div>
                <div style={{ display:"flex", flexDirection:"column", gap:"5px" }}>
                  {historico.map(h => (
                    <div key={h.id} style={{ display:"flex", gap:"10px", alignItems:"flex-start", fontSize:"11px", padding:"7px 10px", background:"var(--surf2)", borderRadius:"6px" }}>
                      <span style={{ color:"var(--t3)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>{formatDate(h.created_at.substring(0,10))}</span>
                      <span style={{ color:"var(--t2)" }}>
                        <strong style={{ color:"var(--t1)" }}>{h.campo_alterado}</strong>
                        {h.valor_anterior && <> · <span style={{ color:"var(--err)" }}>{h.valor_anterior}</span> → <span style={{ color:"var(--ok)" }}>{h.valor_novo}</span></>}
                        {h.obs && <> · {h.obs}</>}
                      </span>
                      {h.usuario && <span style={{ marginLeft:"auto", color:"var(--t3)", flexShrink:0 }}>{h.usuario}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Lightbox ───────────────────────────────────────────────────── */}
      {fotoVisualizando && (
        <div onClick={() => setFotoVisualizando(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.92)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", cursor:"zoom-out" }}>
          <img src={fotoVisualizando} alt=""
            style={{ maxWidth:"92vw", maxHeight:"92vh", objectFit:"contain", borderRadius:"8px", boxShadow:"0 8px 40px rgba(0,0,0,.6)" }} />
          <button onClick={() => setFotoVisualizando(null)}
            style={{ position:"fixed", top:"20px", right:"24px", background:"rgba(255,255,255,.12)", border:"none", color:"#fff", fontSize:"22px", cursor:"pointer", borderRadius:"50%", width:"36px", height:"36px", lineHeight:"36px", padding:0 }}>✕</button>
        </div>
      )}
    </AppLayout>
  );
}
