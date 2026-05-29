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

  const filtrados   = filtro ? retalhos.filter(r => r.status === filtro) : retalhos;
  const disponiveis = retalhos.filter(r => r.status === "Disponível");
  const reservados  = retalhos.filter(r => r.status === "Reservado");
  const descartados = retalhos.filter(r => r.status === "Descartado");
  const m2Disp      = disponiveis.reduce((a, r) => a + Number(r.m2), 0);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Retalhos</div>
        <div style={{ display:"flex", gap:"8px" }}>
          {(["", "Disponível", "Reservado", "Em uso", "Descartado"] as const).map(s => (
            <button
              key={s}
              className={`btn sm ${filtro === s ? "bp" : "bg"}`}
              onClick={() => setFiltro(s)}
            >
              {s || "Todos"}
            </button>
          ))}
        </div>
      </div>

      <div className="con">

        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total",       value: String(retalhos.length),   color:"var(--t1)",   sub:"cadastrados" },
            { label:"Disponíveis", value: String(disponiveis.length), color:"var(--ok)",   sub:"prontos para uso" },
            { label:"m² Disponível", value: m2Disp.toFixed(2) + " m²", color:"var(--acc)", sub:"aproveitável" },
            { label:"Reservados",  value: String(reservados.length),  color:"var(--warn)", sub:"em uso pendente" },
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
                          <div style={{ display:"flex", gap:"4px" }}>
                            {r.status === "Disponível" && (
                              <button className="btn bs xs" onClick={() => mudarStatus(r.id, "Reservado")}>Reservar</button>
                            )}
                            {r.status === "Reservado" && (
                              <button className="btn bg xs" onClick={() => mudarStatus(r.id, "Disponível")}>Liberar</button>
                            )}
                            {r.status !== "Descartado" && (
                              <button className="btn bw xs" onClick={() => mudarStatus(r.id, "Descartado")}>Descartar</button>
                            )}
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
    </AppLayout>
  );
}