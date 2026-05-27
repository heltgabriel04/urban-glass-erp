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

  const filtrados = filtro ? retalhos.filter(r => r.status === filtro) : retalhos;
  const disponiveis = retalhos.filter(r => r.status === "Disponível");
  const m2Disp = disponiveis.reduce((a, r) => a + Number(r.m2), 0);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Retalhos</div>
        <div style={{ display: "flex", gap: "8px" }}>
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
        {loading ? (
          <div className="loading">Carregando retalhos...</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="g4 mb14">
              <div className="kpi">
                <div className="kpi-l">Total Retalhos</div>
                <div className="kpi-v">{retalhos.length}</div>
                <div className="kpi-s">cadastrados</div>
                <div className="kpi-bar" style={{ width: "100%", background: "var(--acc2)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Disponíveis</div>
                <div className="kpi-v" style={{ color: "var(--ok)" }}>{disponiveis.length}</div>
                <div className="kpi-s up">prontos para uso</div>
                <div className="kpi-bar" style={{ width: `${retalhos.length > 0 ? disponiveis.length / retalhos.length * 100 : 0}%`, background: "var(--ok)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">m² Disponível</div>
                <div className="kpi-v" style={{ color: "var(--acc)" }}>{m2Disp.toFixed(2)}</div>
                <div className="kpi-s">m² aproveitável</div>
                <div className="kpi-bar" style={{ width: "70%", background: "var(--acc)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Reservados</div>
                <div className="kpi-v" style={{ color: "var(--warn)" }}>
                  {retalhos.filter(r => r.status === "Reservado").length}
                </div>
                <div className="kpi-s wa">em uso pendente</div>
                <div className="kpi-bar" style={{ width: "40%", background: "var(--warn)" }} />
              </div>
            </div>

            {/* Tabela */}
            {filtrados.length === 0 ? (
              <div className="card" style={{ textAlign: "center", color: "var(--t3)", padding: "40px" }}>
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
                        <td><span className="mono" style={{ color: "var(--acc2)" }}>{r.id}</span></td>
                        <td><strong>{r.produto_nome}</strong></td>
                        <td className="mono">{r.largura} × {r.altura} mm</td>
                        <td className="mono">{formatM2(r.m2)}</td>
                        <td className="mono" style={{ color: "var(--t2)" }}>{r.chapa_origem || "—"}</td>
                        <td className="mono" style={{ color: "var(--acc)" }}>{r.pedido_origem || "—"}</td>
                        <td className="mono">{formatDate(r.dt_gerado)}</td>
                        <td><span className={CHIP[r.status as StatusRetalho] ?? "chip cgr"}>{r.status}</span></td>
                        <td>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {r.status === "Disponível" && (
                              <button className="btn bs xs" onClick={() => mudarStatus(r.id, "Reservado")}>
                                Reservar
                              </button>
                            )}
                            {r.status === "Reservado" && (
                              <button className="btn bg xs" onClick={() => mudarStatus(r.id, "Disponível")}>
                                Liberar
                              </button>
                            )}
                            {r.status !== "Descartado" && (
                              <button className="btn bw xs" onClick={() => mudarStatus(r.id, "Descartado")}>
                                Descartar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totalizador */}
            {filtrados.length > 0 && (
              <div className="totbar">
                <div className="ti">
                  <div className="tl">Exibindo</div>
                  <div className="tv">{filtrados.length} retalhos</div>
                </div>
                <div className="ti">
                  <div className="tl">m² Total</div>
                  <div className="tv" style={{ color: "var(--acc)" }}>
                    {filtrados.reduce((a, r) => a + Number(r.m2), 0).toFixed(4)} m²
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}