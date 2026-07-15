"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { usePrompt } from "@/components/ui/prompt";
import { supabase } from "@/lib/supabase/client";
import { formatDate, formatM2 } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import ImportarRetalhosModal from "@/components/ui/ImportarRetalhosModal";
import type { RetalhoImportado } from "@/lib/importPlanilhaRetalhos";
import type { Retalho, StatusRetalho } from "@/types";

const CHIP: Record<StatusRetalho, string> = {
  "Disponível": "chip cg",
  "Reservado":  "chip cgr",
  "Em uso":     "chip cb",
  "Descartado": "chip cr",
};

function hoje() {
  return new Date().toISOString().split("T")[0];
}

const FORM_VAZIO = {
  produto_nome: "",
  largura: "",
  altura: "",
  espessura: "",
  box: "",
  chapa_origem: "",
  pedido_origem: "",
  localizacao: "",
  observacao: "",
  quantidade: "1",
  dt_gerado: hoje(),
  status: "Disponível" as StatusRetalho,
};

export default function RetalhoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [retalhos, setRetalhos]     = useState<Retalho[]>([]);
  const [produtos, setProdutos]     = useState<{ id: number; nome: string }[]>([]);
  const [pedidos, setPedidos]       = useState<{ id: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filtro, setFiltro]         = useState<StatusRetalho | "">("");
  const [filtroBox, setFiltroBox]   = useState("");
  const [filtroCliente, setFiltroCliente] = useState<"" | "cliente" | "proprio">("");
  const [showForm, setShowForm]     = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importando, setImportando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [form, setForm]             = useState(FORM_VAZIO);
  const [salvando, setSalvando]     = useState(false);

  useEffect(() => { load(); loadProdutos(); loadPedidos(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("retalhos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setRetalhos(data as Retalho[]);
    setLoading(false);
  }

  async function loadProdutos() {
    const { data } = await supabase.from("produtos").select("id, nome").order("nome");
    if (data) setProdutos(data);
  }

  async function loadPedidos() {
    const { data } = await supabase.from("pedidos").select("id").order("id", { ascending: false });
    if (data) setPedidos(data);
  }

  async function mudarStatus(id: string, status: StatusRetalho) {
    setRetalhos(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    await supabase.from("retalhos").update({ status }).eq("id", id);
  }

  async function deletar(id: string) {
    if (!(await confirm(`Excluir retalho ${id} permanentemente?`, { perigo: true }))) return;
    setRetalhos(prev => prev.filter(r => r.id !== id));
    await supabase.from("retalhos").delete().eq("id", id);
  }

  function proximoId(retalhosAtuais: Retalho[]) {
    const ids = retalhosAtuais.map(r => parseInt(r.id.replace("R-", ""))).filter(n => !isNaN(n));
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  }

  function abrirEdicao(r: Retalho) {
    setForm({
      produto_nome:  r.produto_nome,
      largura:       String(r.largura),
      altura:        String(r.altura),
      espessura:     r.espessura != null ? String(r.espessura) : "",
      box:           r.box ?? "",
      chapa_origem:  r.chapa_origem ?? "",
      pedido_origem: r.pedido_origem ?? "",
      localizacao:   r.localizacao ?? "",
      observacao:    r.observacao ?? "",
      quantidade:    "1",
      dt_gerado:     r.dt_gerado,
      status:        r.status,
    });
    setEditandoId(r.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function fecharForm() {
    setShowForm(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
  }

  async function handleSalvar() {
    if (!form.produto_nome.trim()) { toast("Selecione o produto.", "warn"); return; }
    if (!form.largura || !form.altura) { toast("Informe as dimensões.", "warn"); return; }

    setSalvando(true);

    const largura = parseInt(form.largura);
    const altura  = parseInt(form.altura);
    const m2      = parseFloat(((largura * altura) / 1_000_000).toFixed(4));
    const campos  = {
      produto_nome:  form.produto_nome.trim(),
      largura,
      altura,
      espessura:     form.espessura ? parseFloat(form.espessura) : null,
      m2,
      chapa_origem:  form.chapa_origem.trim() || null,
      pedido_origem: form.pedido_origem.trim() || null,
      localizacao:   form.localizacao.trim() || null,
      box:           form.box.trim() || null,
      observacao:    form.observacao.trim() || null,
      dt_gerado:     form.dt_gerado || hoje(),
      status:        form.status,
    };

    if (editandoId) {
      const { data, error } = await supabase
        .from("retalhos")
        .update(campos)
        .eq("id", editandoId)
        .select()
        .single();
      setSalvando(false);
      if (error) { toast("Erro ao salvar: " + error.message, "err"); return; }
      setRetalhos(prev => prev.map(r => r.id === editandoId ? (data as Retalho) : r));
    } else {
      const qtd = Math.max(1, parseInt(form.quantidade) || 1);
      let nextNum = proximoId(retalhos);
      const rows = Array.from({ length: qtd }, () => ({
        id: "R-" + String(nextNum++).padStart(3, "0"),
        ...campos,
      }));
      const { data, error } = await supabase.from("retalhos").insert(rows).select();
      setSalvando(false);
      if (error) { toast("Erro ao salvar: " + error.message, "err"); return; }
      setRetalhos(prev => [...(data as Retalho[]), ...prev]);
    }

    fecharForm();
  }

  async function handleImportar(itens: RetalhoImportado[]) {
    setImportando(true);

    let nextNum = proximoId(retalhos);
    const rows: Record<string, unknown>[] = [];
    for (const item of itens) {
      const m2 = parseFloat(((item.largura * item.altura) / 1_000_000).toFixed(4));
      for (let i = 0; i < item.quantidade; i++) {
        rows.push({
          id: "R-" + String(nextNum++).padStart(3, "0"),
          produto_nome:  item.produto_nome,
          largura:       item.largura,
          altura:        item.altura,
          espessura:     item.espessura,
          m2,
          chapa_origem:  item.chapa_origem,
          pedido_origem: null,
          localizacao:   item.localizacao,
          box:           item.box,
          observacao:    item.observacao,
          dt_gerado:     hoje(),
          status:        "Disponível",
        });
      }
    }

    const { data, error } = await supabase.from("retalhos").insert(rows).select();

    setImportando(false);

    if (error) { toast("Erro ao importar: " + error.message, "err"); return; }

    setRetalhos(prev => [...(data as Retalho[]), ...prev]);
    setShowImport(false);
  }

  async function zerarTudo() {
    if (retalhos.length === 0) return;
    const resp = await prompt(
      `Isso vai excluir PERMANENTEMENTE os ${retalhos.length} retalhos cadastrados e o histórico de uso deles.`,
      { titulo: "Zerar tudo", placeholder: "Digite ZERAR para confirmar", matchExato: "ZERAR", perigo: true, confirmarLabel: "Zerar tudo" }
    );
    if (resp !== "ZERAR") return;

    setLoading(true);
    await supabase.from("retalhos_uso").delete().neq("id", 0);
    await supabase.from("retalhos").delete().neq("id", "");
    setSelecionados(new Set());
    await load();
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelecionarTodos() {
    setSelecionados(prev =>
      filtrados.every(r => prev.has(r.id)) ? new Set() : new Set(filtrados.map(r => r.id))
    );
  }

  function imprimirSelecionados() {
    if (selecionados.size === 0) return;
    sessionStorage.setItem("retalhos_etiquetas_ids", JSON.stringify(Array.from(selecionados)));
    router.push("/retalhos/etiquetas");
  }

  const filtrados = retalhos.filter(r => {
    if (filtro && r.status !== filtro) return false;
    if (filtroBox && r.box !== filtroBox) return false;
    if (filtroCliente === "cliente" && !r.observacao) return false;
    if (filtroCliente === "proprio" && r.observacao) return false;
    return true;
  });

  const disponiveis = retalhos.filter(r => r.status === "Disponível");
  const reservados  = retalhos.filter(r => r.status === "Reservado");
  const deCliente   = retalhos.filter(r => r.observacao);
  const m2Disp      = disponiveis.reduce((a, r) => a + Number(r.m2), 0);
  const boxes       = Array.from(new Set(retalhos.map(r => r.box).filter(Boolean))) as string[];

  const FILTROS = ["", "Disponível", "Reservado", "Em uso", "Descartado"] as const;

  function btnStatus(label: string, cor: string, bg: string, onClick: () => void) {
    return (
      <button
        onClick={onClick}
        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", height:"28px", padding:"0 10px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"10px", fontWeight:700, fontFamily:"'DM Mono', monospace", letterSpacing:"0.4px", cursor:"pointer", transition:"all 0.15s" }}
        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = bg; b.style.borderColor = cor; b.style.color = cor; }}
        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
      >
        {label}
      </button>
    );
  }

  const inputStyle: React.CSSProperties = {
    background:"var(--surf2)", border:"1px solid var(--b2)", borderRadius:"6px",
    padding:"9px 12px", color:"var(--t1)", fontSize:"13px", fontFamily:"'Inter', sans-serif",
    outline:"none", width:"100%", boxSizing:"border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor:"pointer",
    appearance: "none" as any,
  };

  const labelStyle: React.CSSProperties = {
    fontSize:"11px", color:"var(--t3)", fontWeight:600,
    textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"4px", display:"block",
  };

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Retalhos</div>
        <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
          {FILTROS.map(s => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              style={{
                padding:"5px 14px", borderRadius:"99px", border:"1px solid", fontSize:"12px", cursor:"pointer",
                fontFamily:"'Inter', sans-serif", fontWeight: filtro === s ? 700 : 400,
                background: filtro === s ? "var(--surf2)" : "transparent",
                borderColor: filtro === s ? "var(--b2)" : "var(--b1)",
                color: filtro === s ? "var(--t1)" : "var(--t2)",
                transition:"all 0.15s",
              }}
            >
              {s || "Todos"}
              {s && (
                <span style={{ marginLeft:"6px", opacity:0.7, fontSize:"10px" }}>
                  {retalhos.filter(r => r.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
        {boxes.length > 0 && (
          <select name="filtro_box"
            value={filtroBox}
            onChange={e => setFiltroBox(e.target.value)}
            style={{ background:"var(--surf2)", border:"1px solid var(--b2)", borderRadius:"6px", padding:"5px 10px", color:"var(--t2)", fontSize:"12px", cursor:"pointer" }}
          >
            <option value="">Todos os boxes</option>
            {boxes.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        {/* Filtro de cliente */}
        <div style={{ display:"flex", gap:"4px" }}>
          {(["", "cliente", "proprio"] as const).map(v => (
            <button
              key={v}
              onClick={() => setFiltroCliente(v)}
              style={{
                padding:"5px 12px", borderRadius:"99px", border:"1px solid", fontSize:"12px", cursor:"pointer",
                fontFamily:"'Inter', sans-serif", fontWeight: filtroCliente === v ? 700 : 400,
                background: filtroCliente === v ? (v === "cliente" ? "rgba(245,158,11,.15)" : "var(--surf2)") : "transparent",
                borderColor: filtroCliente === v ? (v === "cliente" ? "var(--warn)" : "var(--b2)") : "var(--b1)",
                color: filtroCliente === v ? (v === "cliente" ? "var(--warn)" : "var(--t1)") : "var(--t2)",
                transition:"all 0.15s",
              }}
            >
              {v === "" ? "Todos" : v === "cliente" ? "De cliente" : "Próprio"}
            </button>
          ))}
        </div>
        <button className="btn bg sm" onClick={() => setShowImport(true)}>⇪ Importar Planilha</button>
        <button className="btn bg sm" disabled={selecionados.size === 0} onClick={imprimirSelecionados}>
          🖨 Etiquetas{selecionados.size > 0 ? ` (${selecionados.size})` : ""}
        </button>
        <button className="btn bp sm" onClick={() => showForm ? fecharForm() : setShowForm(true)}>
          {showForm ? "✕ Cancelar" : "+ Novo Retalho"}
        </button>
      </div>

      <div className="con">

        {/* FORM */}
        {showForm && (
          <div style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"20px 24px", marginBottom:"20px" }}>
            <div style={{ fontSize:"12px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em", marginBottom:"16px" }}>
              {editandoId ? `EDITANDO ${editandoId}` : "NOVO RETALHO"}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:"12px", alignItems:"end", marginBottom:"12px" }}>

              <div>
                <label style={labelStyle}>Produto *</label>
                <select name="produto_nome"
                  style={selectStyle}
                  value={form.produto_nome}
                  onChange={e => setForm(f => ({ ...f, produto_nome: e.target.value }))}
                >
                  <option value="">Selecione o produto...</option>
                  {produtos.map(p => (
                    <option key={p.id} value={p.nome}>{p.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Largura (mm) *</label>
                <input name="largura"
                  style={inputStyle}
                  type="number"
                  placeholder="1200"
                  value={form.largura}
                  onChange={e => setForm(f => ({ ...f, largura: e.target.value }))}
                />
              </div>

              <div>
                <label style={labelStyle}>Altura (mm) *</label>
                <input name="altura"
                  style={inputStyle}
                  type="number"
                  placeholder="800"
                  value={form.altura}
                  onChange={e => setForm(f => ({ ...f, altura: e.target.value }))}
                />
              </div>

              <div>
                <label style={labelStyle}>Espessura (mm)</label>
                <input name="espessura"
                  style={inputStyle}
                  type="number"
                  placeholder="4"
                  value={form.espessura}
                  onChange={e => setForm(f => ({ ...f, espessura: e.target.value }))}
                />
              </div>

              <div>
                <label style={labelStyle}>Quantidade</label>
                <input name="quantidade"
                  style={inputStyle}
                  type="number"
                  min={1}
                  placeholder="1"
                  value={form.quantidade}
                  onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:"12px", alignItems:"end" }}>

              <div>
                <label style={labelStyle}>Box</label>
                <input name="box"
                  style={inputStyle}
                  placeholder="BOX 3"
                  value={form.box}
                  onChange={e => setForm(f => ({ ...f, box: e.target.value }))}
                />
              </div>

              <div>
                <label style={labelStyle}>Chapa Origem</label>
                <input name="chapa_origem"
                  style={inputStyle}
                  placeholder="CH-441-0012"
                  value={form.chapa_origem}
                  onChange={e => setForm(f => ({ ...f, chapa_origem: e.target.value }))}
                />
              </div>

              <div>
                <label style={labelStyle}>Pedido Origem</label>
                <select name="pedido_origem"
                  style={selectStyle}
                  value={form.pedido_origem}
                  onChange={e => setForm(f => ({ ...f, pedido_origem: e.target.value }))}
                >
                  <option value="">— nenhum —</option>
                  {pedidos.map(p => (
                    <option key={p.id} value={p.id}>{p.id}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Data</label>
                <DateInput
                  style={inputStyle}
                  className=""
                  value={form.dt_gerado}
                  onChange={v => setForm(f => ({ ...f, dt_gerado: v }))}
                />
              </div>

              <div>
                <label style={labelStyle}>Localização</label>
                <input name="localizacao"
                  style={inputStyle}
                  placeholder="Cavalete 3 - B"
                  value={form.localizacao}
                  onChange={e => setForm(f => ({ ...f, localizacao: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ marginTop:"12px" }}>
              <label style={labelStyle}>Observação / Cliente (deixe em branco se for vidro próprio)</label>
              <input name="observacao"
                style={{ ...inputStyle, borderColor: form.observacao ? "var(--warn)" : "var(--b2)" }}
                placeholder="Nome do cliente dono do vidro, ex: Diogo"
                value={form.observacao}
                onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
              />
              {form.observacao && (
                <div style={{ fontSize:"11px", color:"var(--warn)", marginTop:"4px" }}>
                  Este retalho será marcado como vidro de cliente.
                </div>
              )}
            </div>

            <div style={{ display:"flex", gap:"8px", marginTop:"14px", justifyContent:"flex-end" }}>
              {Number(form.largura) > 0 && Number(form.altura) > 0 && (
                <span style={{ fontSize:"12px", color:"var(--t3)", alignSelf:"center", fontFamily:"'DM Mono', monospace" }}>
                  m² calculado: {((Number(form.largura) * Number(form.altura)) / 1_000_000).toFixed(4)}
                </span>
              )}
              <button className="btn bg sm" onClick={fecharForm}>Cancelar</button>
              <button className="btn bp sm" onClick={handleSalvar} disabled={salvando}>
                {salvando ? "Salvando..." : editandoId ? "Salvar Alterações" : "Salvar Retalho"}
              </button>
            </div>
          </div>
        )}

        {/* CARDS */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:"12px", marginBottom:"20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:"12px", flex:1 }}>
            {[
              { label:"Total",         value: String(retalhos.length),    color:"var(--t1)",   sub:"cadastrados" },
              { label:"Disponíveis",   value: String(disponiveis.length), color:"var(--ok)",   sub:"prontos para uso" },
              { label:"m² Disponível", value: m2Disp.toFixed(2) + " m²", color:"var(--acc)",  sub:"aproveitável" },
              { label:"Reservados",    value: String(reservados.length),  color:"var(--warn)", sub:"em uso pendente" },
              { label:"De Cliente",    value: String(deCliente.length),   color:"#f59e0b",     sub:"vidros de terceiros" },
            ].map(card => (
              <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
                <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
                <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
                <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
              </div>
            ))}
          </div>
          <button
            title="Excluir todos os retalhos cadastrados"
            onClick={zerarTudo}
            style={{ alignSelf:"stretch", padding:"0 16px", borderRadius:"10px", background:"transparent", border:"1px solid rgba(244,63,94,.35)", color:"var(--err)", fontSize:"11px", fontWeight:700, letterSpacing:"0.04em", cursor:"pointer", whiteSpace:"nowrap" }}
          >
            🗑 Zerar Tudo
          </button>
        </div>

        {loading ? (
          <div className="loading">Carregando retalhos...</div>
        ) : (
          <>
            {filtrados.length === 0 ? (
              <div className="card" style={{ textAlign:"center", color:"var(--t3)", padding:"40px" }}>
                Nenhum retalho encontrado
              </div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width:"32px", textAlign:"center" }}>
                        <input name="filtrados"
                          type="checkbox"
                          checked={filtrados.length > 0 && filtrados.every(r => selecionados.has(r.id))}
                          onChange={toggleSelecionarTodos}
                        />
                      </th>
                      <th>ID</th>
                      <th>Produto</th>
                      <th>Dimensões</th>
                      <th>m²</th>
                      <th>Box</th>
                      <th>Observação / Cliente</th>
                      <th>Chapa Origem</th>
                      <th>Pedido Origem</th>
                      <th>Gerado em</th>
                      <th>Status</th>
                      <th>Ações</th>
                      <th style={{ width:"40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(r => (
                      <tr
                        key={r.id}
                        style={r.observacao ? { background:"rgba(245,158,11,.06)", borderLeft:"3px solid rgba(245,158,11,.5)" } : undefined}
                      >
                        <td style={{ textAlign:"center" }}>
                          <input name={`r_id_${r.id}`}
                            type="checkbox"
                            checked={selecionados.has(r.id)}
                            onChange={() => toggleSelecionado(r.id)}
                          />
                        </td>
                        <td><span className="mono" style={{ color:"var(--acc2)" }}>{r.id}</span></td>
                        <td>
                          <strong>{r.produto_nome}</strong>
                          {r.espessura ? <div className="tdim">{r.espessura}mm</div> : null}
                        </td>
                        <td className="mono">{r.largura} × {r.altura} mm</td>
                        <td className="mono">{formatM2(r.m2)}</td>
                        <td className="mono" style={{ color:"var(--t2)" }}>{r.box || "—"}</td>
                        <td>
                          {r.observacao
                            ? <span style={{ display:"inline-flex", alignItems:"center", gap:"4px", background:"rgba(245,158,11,.18)", color:"var(--warn)", padding:"2px 8px", borderRadius:"4px", fontSize:"11px", fontWeight:700 }}>
                                👤 {r.observacao}
                              </span>
                            : <span className="mono" style={{ color:"var(--t3)" }}>—</span>
                          }
                        </td>
                        <td className="mono" style={{ color:"var(--t2)" }}>{r.chapa_origem || "—"}</td>
                        <td className="mono" style={{ color:"var(--acc)" }}>{r.pedido_origem || "—"}</td>
                        <td className="mono">{formatDate(r.dt_gerado)}</td>
                        <td><span className={CHIP[r.status as StatusRetalho] ?? "chip cgr"}>{r.status}</span></td>
                        <td>
                          <div style={{ display:"flex", gap:"4px", alignItems:"center" }}>
                            {r.status !== "Disponível" && btnStatus("Disponível", "var(--ok)",   "rgba(16,185,129,.15)", () => mudarStatus(r.id, "Disponível"))}
                            {r.status !== "Reservado"  && btnStatus("Reservado",  "var(--t2)", "rgba(113,113,122,.15)", () => mudarStatus(r.id, "Reservado"))}
                            {r.status !== "Em uso"     && btnStatus("Em uso",     "var(--acc2)", "rgba(99,179,237,.15)", () => mudarStatus(r.id, "Em uso"))}
                          </div>
                        </td>
                        <td style={{ textAlign:"center" }}>
                          <div style={{ display:"inline-flex", gap:"4px" }}>
                            <button
                              title="Editar retalho"
                              onClick={() => abrirEdicao(r)}
                              style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(99,179,237,.15)"; b.style.borderColor = "var(--acc2)"; b.style.color = "var(--acc2)"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                            >
                              ✎
                            </button>
                            <button
                              title="Excluir retalho"
                              onClick={() => deletar(r.id)}
                              style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showImport && (
        <ImportarRetalhosModal
          onImportar={handleImportar}
          onClose={() => setShowImport(false)}
          importando={importando}
        />
      )}
    </AppLayout>
  );
}
