"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getRetrabalhos, createRetrabalho, updateRetrabalho } from "@/services/qualidade.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { Campo } from "@/components/ui/Campo";
import type { Retrabalho, RetrabalhoInsert, StatusRetrabalho } from "@/types";
import { supabase } from "@/lib/supabase/client";

const ETAPAS = [
  "Aguardando otimização","Em Produção – Corte","Qualidade (Corte)",
  "Em Produção – Lapidação","Qualidade (Lapidação)","Separação","Expedição",
];

const STATUS_RT: StatusRetrabalho[] = ["Pendente","Em Execução","Concluído","Cancelado"];

const STATUS_COR: Record<StatusRetrabalho, string> = {
  Pendente:      "var(--warn)",
  "Em Execução": "var(--acc2)",
  Concluído:     "var(--ok)",
  Cancelado:     "var(--t3)",
};

const MOTIVOS = [
  "Medida incorreta","Lapidação fora de especificação","Furo em posição errada",
  "Aresta irregular","Polimento insuficiente","Mancha ou risco",
  "Produto não atende ao pedido","Erro de separação","Outro",
];

const BLANK: RetrabalhoInsert = {
  nc_id: null, pedido_id: null, cliente_id: null, produto_nome: null,
  motivo: "", etapa_origem: ETAPAS[0], etapa_correcao: ETAPAS[0],
  responsavel_original: null, responsavel_correcao: null,
  tempo_adicional_min: null, custo_adicional: null,
  quantidade: 1, status: "Pendente",
  dt_retrabalho: new Date().toISOString(), dt_conclusao: null,
  lancamento_gerado: false,
};

export default function RetrabalhosPage() {
  const { toast } = useToast();
  const [retrabalhos, setRetrabalhos] = useState<Retrabalho[]>([]);
  const [loading, setLoading]         = useState(true);
  const [salvando, setSalvando]       = useState(false);
  const [modal, setModal]             = useState(false);
  const [form, setForm]               = useState<RetrabalhoInsert>(BLANK);
  const [pedidos, setPedidos]         = useState<{ id: string; cliente_nome: string }[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("todos");

  useEffect(() => {
    load();
    supabase.from("pedidos").select("id, clientes(nome)").order("id", { ascending: false }).limit(150)
      .then(({ data }) => setPedidos((data ?? []).map((p: any) => ({ id: p.id, cliente_nome: p.clientes?.nome ?? "—" }))));
  }, []);

  async function load() {
    setLoading(true);
    const data = await getRetrabalhos();
    setRetrabalhos(data);
    setLoading(false);
  }

  async function handleSalvar() {
    if (!form.motivo.trim()) { toast("Motivo obrigatório", "warn"); return; }
    setSalvando(true);
    const result = await createRetrabalho(form);
    if (result) {
      toast("Retrabalho registrado");
      setModal(false);
      setForm(BLANK);
      await load();
    } else {
      toast("Erro ao registrar", "err");
    }
    setSalvando(false);
  }

  async function handleMudarStatus(id: number, novoStatus: StatusRetrabalho) {
    setSalvando(true);
    const updates: Partial<Retrabalho> = {
      status: novoStatus,
      ...(novoStatus === "Concluído" ? { dt_conclusao: new Date().toISOString() } : {}),
    };
    const ok = await updateRetrabalho(id, updates);
    const gerouLancamento = novoStatus === "Concluído" && ok?.lancamento_gerado;
    toast(ok ? `→ ${novoStatus}${gerouLancamento ? " (custo lançado no financeiro)" : ""}` : "Erro ao atualizar", ok ? undefined : "err");
    await load();
    setSalvando(false);
  }

  const filtrados = useMemo(() => retrabalhos.filter(r => filtroStatus === "todos" || r.status === filtroStatus), [retrabalhos, filtroStatus]);

  const indicadores = useMemo(() => {
    const ativos  = retrabalhos.filter(r => ["Pendente","Em Execução"].includes(r.status));
    const concl   = retrabalhos.filter(r => r.status === "Concluído");
    const custo   = retrabalhos.reduce((a, r) => a + Number(r.custo_adicional ?? 0), 0);
    const taxaFPY = retrabalhos.length > 0
      ? ((retrabalhos.filter(r => r.status !== "Cancelado").length === 0) ? 100 : (1 - concl.length / Math.max(retrabalhos.filter(r => r.status !== "Cancelado").length, 1)) * 100)
      : 100;
    return { total: retrabalhos.length, ativos: ativos.length, custo, taxaFPY };
  }, [retrabalhos]);

  // Ranking por etapa de origem
  const porEtapa = useMemo(() => {
    const map = new Map<string, number>();
    retrabalhos.forEach(r => { map.set(r.etapa_origem, (map.get(r.etapa_origem) ?? 0) + 1); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [retrabalhos]);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Controle de Retrabalhos</div>
        <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
          <select name="filtro_status" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ fontSize:"11px", padding:"5px 8px", borderRadius:"6px", border:"1px solid var(--b2)", background:"var(--surf2)", color:"var(--t1)", fontFamily:"'DM Mono',monospace" }}>
            <option value="todos">Todos os status</option>
            {STATUS_RT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn bp sm" onClick={() => { setForm(BLANK); setModal(true); }}>+ Registrar Retrabalho</button>
        </div>
      </div>

      <div className="con" style={{ display:"flex", flexDirection:"column", gap:"14px" }}>

        {/* KPIs */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px" }}>
          {[
            { label:"Total registrados", value: String(indicadores.total),            color:"var(--acc)"  },
            { label:"Ativos",            value: String(indicadores.ativos),           color:"var(--warn)" },
            { label:"Custo acumulado",   value: formatBRL(indicadores.custo),         color:"var(--err)"  },
            { label:"FPY estimado",      value: indicadores.taxaFPY.toFixed(1) + "%", color: indicadores.taxaFPY >= 90 ? "var(--ok)" : "var(--warn)" },
          ].map(c => (
            <div key={c.label} style={{ background:"var(--surf)", border:"1px solid var(--b1)", borderRadius:"12px", padding:"18px 20px" }}>
              <div style={{ fontSize:"10px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".08em", fontWeight:600, marginBottom:"8px" }}>{c.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:c.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 260px", gap:"14px" }}>

          {/* Lista */}
          <div className="card" style={{ padding:0, overflow:"hidden" }}>
            <div style={{ padding:"12px 18px", borderBottom:"1px solid var(--b1)" }}>
              <span className="ct" style={{ margin:0 }}>Registros <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{filtrados.length}</span></span>
            </div>
            {loading ? <div className="loading" style={{ padding:"40px" }}>Carregando…</div> : filtrados.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px", color:"var(--t3)", fontSize:"13px" }}>Nenhum retrabalho registrado.</div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 120px 120px 95px 90px 100px", gap:"6px", padding:"7px 18px", fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".07em", fontFamily:"'DM Mono',monospace", borderBottom:"1px solid var(--b1)" }}>
                  <div>Data</div><div>Motivo / Produto</div><div>Etapa origem</div><div>Etapa correção</div><div>Quantidade</div><div>Custo</div><div>Status</div>
                </div>
                {filtrados.map((r, i) => (
                  <div key={r.id} style={{ display:"grid", gridTemplateColumns:"90px 1fr 120px 120px 95px 90px 100px", gap:"6px", padding:"10px 18px", borderBottom:"1px solid var(--b1)", background: i % 2 === 0 ? "transparent" : "var(--surf2)", alignItems:"center" }}>
                    <div style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{formatDate(r.dt_retrabalho.substring(0,10))}</div>
                    <div>
                      <div style={{ fontSize:"12px", fontWeight:600, color:"var(--t1)" }}>{r.motivo}</div>
                      {r.produto_nome && <div style={{ fontSize:"10px", color:"var(--t3)" }}>{r.produto_nome}</div>}
                      {r.pedido_id && <div style={{ fontSize:"10px", color:"var(--acc2)", fontFamily:"'DM Mono',monospace" }}>{r.pedido_id}</div>}
                    </div>
                    <div style={{ fontSize:"10px", color:"var(--t2)" }}>{r.etapa_origem.replace("Em Produção – ","")}</div>
                    <div style={{ fontSize:"10px", color:"var(--acc2)" }}>{r.etapa_correcao.replace("Em Produção – ","")}</div>
                    <div style={{ fontSize:"12px", fontFamily:"'DM Mono',monospace", color:"var(--t1)", fontWeight:600 }}>{r.quantidade}</div>
                    <div style={{ fontSize:"11px", fontFamily:"'DM Mono',monospace", color:"var(--err)" }}>{r.custo_adicional ? formatBRL(r.custo_adicional) : "—"}</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
                      <span style={{ fontSize:"9px", fontWeight:700, padding:"2px 6px", borderRadius:"4px", background: STATUS_COR[r.status] + "22", color: STATUS_COR[r.status], border:`1px solid ${STATUS_COR[r.status]}44` }}>
                        {r.status}
                      </span>
                      {r.status === "Pendente" && (
                        <button disabled={salvando} onClick={() => handleMudarStatus(r.id, "Em Execução")}
                          style={{ fontSize:"8px", padding:"1px 5px", borderRadius:"3px", cursor:"pointer", border:"1px solid var(--acc2)", background:"transparent", color:"var(--acc2)" }}>
                          Iniciar
                        </button>
                      )}
                      {r.status === "Em Execução" && (
                        <button disabled={salvando} onClick={() => handleMudarStatus(r.id, "Concluído")}
                          style={{ fontSize:"8px", padding:"1px 5px", borderRadius:"3px", cursor:"pointer", border:"1px solid var(--ok)", background:"transparent", color:"var(--ok)" }}>
                          Concluir
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Ranking por etapa */}
          <div className="card">
            <div className="ct">Retrabalhos por Etapa de Origem</div>
            {porEtapa.length === 0 ? (
              <div style={{ color:"var(--t3)", fontSize:"12px", textAlign:"center", padding:"20px" }}>Sem dados</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {porEtapa.map(([etapa, count]) => {
                  const pct = (count / Math.max(...porEtapa.map(e => e[1]))) * 100;
                  return (
                    <div key={etapa}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"3px" }}>
                        <span style={{ fontSize:"11px", color:"var(--t1)" }}>{etapa.replace("Em Produção – ","")}</span>
                        <span style={{ fontSize:"12px", fontWeight:700, color:"var(--err)", fontFamily:"'DM Mono',monospace" }}>{count}</span>
                      </div>
                      <div style={{ height:"5px", borderRadius:"3px", background:"var(--surf2)", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:"rgba(244,63,94,.5)", borderRadius:"3px" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Novo Retrabalho ──────────────────────────────────── */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={{ background:"var(--surf)", border:"1px solid var(--b2)", borderRadius:"14px", width:"600px", maxHeight:"90vh", overflow:"auto", padding:"24px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
              <span style={{ fontSize:"15px", fontWeight:700, color:"var(--t1)" }}>Registrar Retrabalho</span>
              <button onClick={() => setModal(false)} style={{ background:"transparent", border:"none", color:"var(--t3)", fontSize:"18px", cursor:"pointer" }}>✕</button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <div className="fr">
                <Campo label="Motivo *">
                  <select name="motivo" className="fc" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}>
                    <option value="">— Selecione —</option>
                    {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Campo>
                <Campo label="Quantidade">
                  <input name="quantidade" type="number" className="fc" min={1} value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))} />
                </Campo>
              </div>

              <div className="fr">
                <Campo label="Etapa onde gerou o problema *">
                  <select name="etapa_origem" className="fc" value={form.etapa_origem} onChange={e => setForm(f => ({ ...f, etapa_origem: e.target.value }))}>
                    {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </Campo>
                <Campo label="Etapa de correção *">
                  <select name="etapa_correcao" className="fc" value={form.etapa_correcao} onChange={e => setForm(f => ({ ...f, etapa_correcao: e.target.value }))}>
                    {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </Campo>
              </div>

              <div className="fr">
                <Campo label="Responsável original">
                  <input name="responsavel_original" className="fc" placeholder="Quem gerou o erro" value={form.responsavel_original ?? ""} onChange={e => setForm(f => ({ ...f, responsavel_original: e.target.value || null }))} />
                </Campo>
                <Campo label="Responsável pela correção">
                  <input name="responsavel_correcao" className="fc" placeholder="Quem vai corrigir" value={form.responsavel_correcao ?? ""} onChange={e => setForm(f => ({ ...f, responsavel_correcao: e.target.value || null }))} />
                </Campo>
              </div>

              <div className="fr">
                <Campo label="Tempo adicional (min)">
                  <input name="tempo_adicional_min" type="number" className="fc" min={0} value={form.tempo_adicional_min ?? ""} onChange={e => setForm(f => ({ ...f, tempo_adicional_min: e.target.value ? Number(e.target.value) : null }))} />
                </Campo>
                <Campo label="Custo adicional (R$)">
                  <input name="custo_adicional" type="number" className="fc" step="0.01" min={0} value={form.custo_adicional ?? ""} onChange={e => setForm(f => ({ ...f, custo_adicional: e.target.value ? Number(e.target.value) : null }))} />
                </Campo>
              </div>

              <div className="fr">
                <Campo label="Pedido vinculado">
                  <select name="pedido_id" className="fc" value={form.pedido_id ?? ""} onChange={e => setForm(f => ({ ...f, pedido_id: e.target.value || null }))}>
                    <option value="">— Nenhum —</option>
                    {pedidos.map(p => <option key={p.id} value={p.id}>{p.id} · {p.cliente_nome}</option>)}
                  </select>
                </Campo>
                <Campo label="Produto">
                  <input name="produto_nome" className="fc" placeholder="Nome do produto" value={form.produto_nome ?? ""} onChange={e => setForm(f => ({ ...f, produto_nome: e.target.value || null }))} />
                </Campo>
              </div>

              <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", marginTop:"6px" }}>
                <button className="btn bg sm" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn bp sm" onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando…" : "Registrar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
