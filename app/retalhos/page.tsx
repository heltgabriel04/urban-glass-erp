"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatDate, formatM2 } from "@/lib/formatters";
import type { Retalho, StatusRetalho } from "@/types";

const CHIP: Record<StatusRetalho, string> = {
  "Disponível": "chip cg",
  "Reservado":  "chip cy",
  "Em uso":     "chip cb",
  "Descartado": "chip cr",
};

export default function RetalhoPage() {
  const [retalhos, setRetalhos] = useState<Retalho[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<StatusRetalho | "">("");

  useEffect(() => { load(); }, []);

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

  async function mudarStatus(id: string, status: StatusRetalho) {
    await supabase.from("retalhos").update({ status }).eq("id", id);
    load();
  }

  async function deletar(id: string) {
    if (!confirm(`Excluir retalho ${id} permanentemente?`)) return;
    await supabase.from("retalhos").delete().eq("id", id);
    load();
  }

  const filtrados   = filtro ? retalhos.filter(r => r.status === filtro) : retalhos;
  const disponiveis = retalhos.filter(r => r.status === "Disponível");
  const reservados  = retalhos.filter(r => r.status === "Reservado");
  const m2Disp      = disponiveis.reduce((a, r) => a + Number(r.m2), 0);

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

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Retalhos</div>
        <div style={{ display:"flex", gap:"6px" }}>
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
      </div>

      <div className="con">

        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total",         value: String(retalhos.length),   color:"var(--t1)",   sub:"cadastrados" },
            { label:"Disponíveis",   value: String(disponiveis.length), color:"var(--ok)",   sub:"prontos para uso" },
            { label:"m² Disponível", value: m2Disp.toFixed(2) + " m²", color:"var(--acc)",  sub:"aproveitável" },
            { label:"Reservados",    value: String(reservados.length),  color:"var(--warn)", sub:"em uso pendente" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
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
                      <th>ID</th>
                      <th>Produto</th>
                      <th>Dimensões</th>
                      <th>m²</th>
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
                      <tr key={r.id}>
                        <td><span className="mono" style={{ color:"var(--acc2)" }}>{r.id}</span></td>
                        <td><strong>{r.produto_nome}</strong></td>
                        <td className="mono">{r.largura} × {r.altura} mm</td>
                        <td className="mono">{formatM2(r.m2)}</td>
                        <td className="mono" style={{ color:"var(--t2)" }}>{r.chapa_origem || "—"}</td>
                        <td className="mono" style={{ color:"var(--acc)" }}>{r.pedido_origem || "—"}</td>
                        <td className="mono">{formatDate(r.dt_gerado)}</td>
                        <td><span className={CHIP[r.status as StatusRetalho] ?? "chip cgr"}>{r.status}</span></td>
                        <td>
                          <div style={{ display:"flex", gap:"4px", alignItems:"center" }}>
                            {r.status !== "Disponível" && btnStatus("Disponível", "var(--ok)",   "rgba(16,185,129,.15)",  () => mudarStatus(r.id, "Disponível"))}
                            {r.status !== "Reservado"  && btnStatus("Reservado",  "var(--warn)", "rgba(245,158,11,.15)",  () => mudarStatus(r.id, "Reservado"))}
                            {r.status !== "Em uso"     && btnStatus("Em uso",     "var(--acc2)", "rgba(99,179,237,.15)",  () => mudarStatus(r.id, "Em uso"))}
                          </div>
                        </td>
                        <td style={{ width:"40px", textAlign:"center" }}>
                          <button
                            title="Excluir retalho"
                            onClick={() => deletar(r.id)}
                            style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                          >
                            🗑
                          </button>
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
    </AppLayout>
  );
}