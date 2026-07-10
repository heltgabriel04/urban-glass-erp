"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getQuebras, createQuebra, confirmarBaixaEstoqueQuebra } from "@/services/qualidade.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import SearchInput from "@/components/ui/SearchInput";
import type { Quebra, QuebraInsert, SetorQualidade } from "@/types";
import { supabase } from "@/lib/supabase/client";
import { getEstoque } from "@/services/estoque.service";

const SETORES: SetorQualidade[] = ["Corte","Lapidação","Furação","Separação","Expedição","Recebimento"];

const MOTIVOS = [
  "Queda acidental","Vibração excessiva","Defeito no material","Medida incorreta",
  "Pressão excessiva no corte","Resfriamento inadequado","Manuseio incorreto",
  "Fissura pré-existente","Erro operacional","Outro",
];

const BLANK: QuebraInsert = {
  nc_id: null, pedido_id: null, cliente_id: null,
  produto_nome: "", espessura: null, cor: null, chapa_referencia: null,
  largura_mm: null, altura_mm: null,
  m2_perdido: 0, custo_m2: null,
  motivo: "", setor: null, maquina: null, responsavel: null,
  baixa_estoque: false, dt_quebra: new Date().toISOString(),
};

export default function QuebrasPage() {
  const { toast } = useToast();
  const [quebras, setQuebras]   = useState<Quebra[]>([]);
  const [loading, setLoading]   = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState<QuebraInsert>(BLANK);
  const [pedidos, setPedidos]   = useState<{ id: string; cliente_nome: string }[]>([]);
  const [produtos, setProdutos] = useState<{ nome: string; custo_m2: number }[]>([]);
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [busca, setBusca]       = useState("");

  useEffect(() => {
    load();
    supabase.from("pedidos").select("id, clientes(nome)")
      .order("id", { ascending: false }).limit(150)
      .then(({ data }) => setPedidos((data ?? []).map((p: any) => ({ id: p.id, cliente_nome: p.clientes?.nome ?? "—" }))));
    getEstoque().then(est => setProdutos(est.map((e: any) => ({ nome: e.cod ?? e.produtos?.nome ?? "—", custo_m2: Number(e.custo_m2) }))));
  }, []);

  async function load() {
    setLoading(true);
    const data = await getQuebras();
    setQuebras(data);
    setLoading(false);
  }

  function handleProdutoChange(nome: string) {
    const prod = produtos.find(p => p.nome === nome);
    setForm(f => ({ ...f, produto_nome: nome, custo_m2: prod?.custo_m2 ?? null }));
  }

  function calcM2(): number {
    if (form.largura_mm && form.altura_mm)
      return parseFloat(((form.largura_mm / 1000) * (form.altura_mm / 1000)).toFixed(4));
    return form.m2_perdido;
  }

  const valorEstimado = useMemo(() => {
    const m2 = form.largura_mm && form.altura_mm ? calcM2() : form.m2_perdido;
    return form.custo_m2 ? m2 * form.custo_m2 : null;
  }, [form]);

  async function handleSalvar() {
    if (!form.produto_nome.trim()) { toast("Produto obrigatório", "warn"); return; }
    if (!form.motivo.trim())       { toast("Motivo obrigatório", "warn"); return; }
    const m2 = form.largura_mm && form.altura_mm ? calcM2() : form.m2_perdido;
    if (m2 <= 0) { toast("Informe as dimensões ou m² perdido", "warn"); return; }
    setSalvando(true);
    const payload: QuebraInsert = { ...form, m2_perdido: m2 };
    const { quebra, baixaOk } = await createQuebra(payload);
    if (quebra) {
      toast(baixaOk ? "Quebra registrada — baixa de estoque e lançamento feitos" : "Quebra registrada, mas a baixa automática falhou — confirme manualmente", baixaOk ? undefined : "warn");
      setModal(false);
      setForm(BLANK);
      await load();
    } else {
      toast("Erro ao registrar quebra", "err");
    }
    setSalvando(false);
  }

  async function handleBaixaEstoque(id: number) {
    if (!confirm("Confirmar baixa no estoque e lançamento de custo no financeiro?")) return;
    setSalvando(true);
    const ok = await confirmarBaixaEstoqueQuebra(id);
    toast(ok ? "Baixa executada" : "Erro ao executar baixa", ok ? undefined : "err");
    await load();
    setSalvando(false);
  }

  const filtradas = useMemo(() => quebras.filter(q => {
    if (filtroSetor !== "todos" && q.setor !== filtroSetor) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return q.produto_nome.toLowerCase().includes(b) || (q.pedido_id ?? "").toLowerCase().includes(b) || (q.responsavel ?? "").toLowerCase().includes(b);
    }
    return true;
  }), [quebras, filtroSetor, busca]);

  const totais = useMemo(() => ({
    m2:    filtradas.reduce((a, q) => a + Number(q.m2_perdido), 0),
    valor: filtradas.reduce((a, q) => a + Number(q.valor_perda ?? 0), 0),
    count: filtradas.length,
  }), [filtradas]);

  // Ranking por responsável
  const porResponsavel = useMemo(() => {
    const map = new Map<string, { count: number; m2: number; valor: number }>();
    quebras.forEach(q => {
      const resp = q.responsavel ?? "Não informado";
      const prev = map.get(resp) ?? { count: 0, m2: 0, valor: 0 };
      map.set(resp, { count: prev.count + 1, m2: prev.m2 + Number(q.m2_perdido), valor: prev.valor + Number(q.valor_perda ?? 0) });
    });
    return [...map.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 5);
  }, [quebras]);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Controle de Quebras</div>
        <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
          <SearchInput icon={false} placeholder="Buscar produto, pedido, responsável…" value={busca} onChange={setBusca}
            inputStyle={{ fontSize:"11px", padding:"5px 10px", borderRadius:"6px", border:"1px solid var(--b2)", background:"var(--surf2)", color:"var(--t1)", width:"220px", fontFamily:"'DM Mono',monospace" }} />
          <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}
            style={{ fontSize:"11px", padding:"5px 8px", borderRadius:"6px", border:"1px solid var(--b2)", background:"var(--surf2)", color:"var(--t1)", fontFamily:"'DM Mono',monospace" }}>
            <option value="todos">Todos os setores</option>
            {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn bp sm" onClick={() => { setForm(BLANK); setModal(true); }}>+ Registrar Quebra</button>
        </div>
      </div>

      <div className="con" style={{ display:"flex", flexDirection:"column", gap:"14px" }}>

        {/* KPIs */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px" }}>
          {[
            { label:"Total de quebras",   value: String(totais.count),                  color:"var(--acc)"  },
            { label:"m² perdido",         value: totais.m2.toFixed(3) + " m²",          color:"var(--warn)" },
            { label:"Valor perdido",      value: formatBRL(totais.valor),               color:"var(--err)"  },
            { label:"Sem baixa estoque",  value: String(quebras.filter(q => !q.baixa_estoque).length), color:"#f97316" },
          ].map(c => (
            <div key={c.label} style={{ background:"var(--surf)", border:"1px solid var(--b1)", borderRadius:"12px", padding:"18px 20px" }}>
              <div style={{ fontSize:"10px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".08em", fontWeight:600, marginBottom:"8px" }}>{c.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:c.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:"14px" }}>

          {/* Lista */}
          <div className="card" style={{ padding:0, overflow:"hidden" }}>
            <div style={{ padding:"12px 18px", borderBottom:"1px solid var(--b1)" }}>
              <span className="ct" style={{ margin:0 }}>Registros <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{filtradas.length}</span></span>
            </div>
            {loading ? <div className="loading" style={{ padding:"40px" }}>Carregando…</div> : filtradas.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px", color:"var(--t3)", fontSize:"13px" }}>Nenhuma quebra registrada.</div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 80px 70px 90px 80px 60px", gap:"6px", padding:"7px 18px", fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:".07em", fontFamily:"'DM Mono',monospace", borderBottom:"1px solid var(--b1)" }}>
                  <div>Data</div><div>Produto / Pedido</div><div>Setor</div><div>m²</div><div>Valor</div><div>Responsável</div><div>Estoque</div>
                </div>
                {filtradas.map((q, i) => (
                  <div key={q.id} style={{ display:"grid", gridTemplateColumns:"90px 1fr 80px 70px 90px 80px 60px", gap:"6px", padding:"10px 18px", borderBottom:"1px solid var(--b1)", background: i % 2 === 0 ? "transparent" : "var(--surf2)", alignItems:"center" }}>
                    <div style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{formatDate(q.dt_quebra.substring(0,10))}</div>
                    <div>
                      <div style={{ fontSize:"12px", fontWeight:600, color:"var(--t1)" }}>{q.produto_nome}</div>
                      {q.pedido_id && <div style={{ fontSize:"10px", color:"var(--acc2)", fontFamily:"'DM Mono',monospace" }}>{q.pedido_id}</div>}
                      <div style={{ fontSize:"10px", color:"var(--t3)" }}>{q.motivo}</div>
                    </div>
                    <div style={{ fontSize:"10px", color:"var(--t2)" }}>{q.setor ?? "—"}</div>
                    <div style={{ fontSize:"11px", fontFamily:"'DM Mono',monospace", color:"var(--warn)", fontWeight:600 }}>{Number(q.m2_perdido).toFixed(3)}</div>
                    <div style={{ fontSize:"11px", fontFamily:"'DM Mono',monospace", color:"var(--err)", fontWeight:600 }}>{q.valor_perda ? formatBRL(q.valor_perda) : "—"}</div>
                    <div style={{ fontSize:"10px", color:"var(--t2)" }}>{q.responsavel ?? "—"}</div>
                    <div>
                      {q.baixa_estoque ? (
                        <span style={{ fontSize:"9px", padding:"2px 6px", borderRadius:"4px", background:"rgba(16,185,129,.15)", color:"var(--ok)", fontWeight:700 }}>OK</span>
                      ) : (
                        <button disabled={salvando} onClick={() => handleBaixaEstoque(q.id)}
                          style={{ fontSize:"9px", padding:"2px 6px", borderRadius:"4px", background:"rgba(244,63,94,.15)", color:"var(--err)", border:"1px solid rgba(244,63,94,.3)", cursor:"pointer", fontWeight:700 }}>
                          Baixar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Ranking */}
          <div className="card">
            <div className="ct">Top Responsáveis por Perdas</div>
            {porResponsavel.length === 0 ? (
              <div style={{ color:"var(--t3)", fontSize:"12px", textAlign:"center", padding:"20px" }}>Sem dados</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {porResponsavel.map(([resp, dados], i) => (
                  <div key={resp} style={{ padding:"10px 12px", background:"var(--surf2)", borderRadius:"8px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
                      <span style={{ fontSize:"12px", fontWeight:600, color:"var(--t1)" }}>{i + 1}° {resp}</span>
                      <span style={{ fontSize:"11px", fontFamily:"'DM Mono',monospace", color:"var(--err)", fontWeight:700 }}>{formatBRL(dados.valor)}</span>
                    </div>
                    <div style={{ fontSize:"10px", color:"var(--t3)" }}>{dados.count} quebra(s) · {dados.m2.toFixed(3)} m²</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Nova Quebra ─────────────────────────────────────── */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={{ background:"var(--surf)", border:"1px solid var(--b2)", borderRadius:"14px", width:"600px", maxHeight:"90vh", overflow:"auto", padding:"24px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
              <span style={{ fontSize:"15px", fontWeight:700, color:"var(--t1)" }}>Registrar Quebra de Vidro</span>
              <button onClick={() => setModal(false)} style={{ background:"transparent", border:"none", color:"var(--t3)", fontSize:"18px", cursor:"pointer" }}>✕</button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Produto *</label>
                  <input className="fc" list="produtos-list" placeholder="Nome do produto" value={form.produto_nome}
                    onChange={e => handleProdutoChange(e.target.value)} />
                  <datalist id="produtos-list">{produtos.map(p => <option key={p.nome} value={p.nome} />)}</datalist>
                </div>
                <div className="fg">
                  <label className="fl">Setor</label>
                  <select className="fc" value={form.setor ?? ""} onChange={e => setForm(f => ({ ...f, setor: (e.target.value || null) as SetorQualidade | null }))}>
                    <option value="">— Selecione —</option>
                    {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Largura (mm)</label>
                  <input type="number" className="fc" min={0} value={form.largura_mm ?? ""} onChange={e => setForm(f => ({ ...f, largura_mm: e.target.value ? Number(e.target.value) : null }))} />
                </div>
                <div className="fg">
                  <label className="fl">Altura (mm)</label>
                  <input type="number" className="fc" min={0} value={form.altura_mm ?? ""} onChange={e => setForm(f => ({ ...f, altura_mm: e.target.value ? Number(e.target.value) : null }))} />
                </div>
                <div className="fg">
                  <label className="fl">m² perdido</label>
                  <input type="number" className="fc" step="0.001" min={0}
                    value={(form.largura_mm && form.altura_mm) ? calcM2() : (form.m2_perdido || "")}
                    readOnly={!!(form.largura_mm && form.altura_mm)}
                    onChange={e => !form.largura_mm && !form.altura_mm && setForm(f => ({ ...f, m2_perdido: Number(e.target.value) }))}
                    style={{ background: (form.largura_mm && form.altura_mm) ? "var(--surf2)" : undefined }} />
                </div>
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Custo/m² (R$)</label>
                  <input type="number" className="fc" step="0.01" min={0} value={form.custo_m2 ?? ""} onChange={e => setForm(f => ({ ...f, custo_m2: e.target.value ? Number(e.target.value) : null }))} />
                </div>
                <div className="fg" style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
                  <label className="fl">Valor estimado da perda</label>
                  <div style={{ fontSize:"16px", fontWeight:700, color:"var(--err)", fontFamily:"'DM Mono',monospace", padding:"8px 0" }}>
                    {valorEstimado != null ? formatBRL(valorEstimado) : "—"}
                  </div>
                </div>
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Motivo *</label>
                  <select className="fc" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}>
                    <option value="">— Selecione —</option>
                    {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Máquina</label>
                  <input className="fc" placeholder="Ex: Serra 1, Mesa 2…" value={form.maquina ?? ""} onChange={e => setForm(f => ({ ...f, maquina: e.target.value || null }))} />
                </div>
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Responsável</label>
                  <input className="fc" placeholder="Nome do operador" value={form.responsavel ?? ""} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value || null }))} />
                </div>
                <div className="fg">
                  <label className="fl">Pedido vinculado</label>
                  <select className="fc" value={form.pedido_id ?? ""} onChange={e => setForm(f => ({ ...f, pedido_id: e.target.value || null }))}>
                    <option value="">— Nenhum —</option>
                    {pedidos.map(p => <option key={p.id} value={p.id}>{p.id} · {p.cliente_nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Espessura</label>
                  <input className="fc" placeholder="Ex: 6mm, 8mm" value={form.espessura ?? ""} onChange={e => setForm(f => ({ ...f, espessura: e.target.value || null }))} />
                </div>
                <div className="fg">
                  <label className="fl">Cor</label>
                  <input className="fc" placeholder="Ex: Incolor, Fumê" value={form.cor ?? ""} onChange={e => setForm(f => ({ ...f, cor: e.target.value || null }))} />
                </div>
                <div className="fg">
                  <label className="fl">Chapa referência</label>
                  <input className="fc" placeholder="Ex: CHAPA 3 – P-047" value={form.chapa_referencia ?? ""} onChange={e => setForm(f => ({ ...f, chapa_referencia: e.target.value || null }))} />
                </div>
              </div>

              <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", marginTop:"6px" }}>
                <button className="btn bg sm" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn bp sm" onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando…" : "Registrar Quebra"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
