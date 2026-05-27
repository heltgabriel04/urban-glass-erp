"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatM2 } from "@/lib/formatters";
import type { EstoqueItem } from "@/types";

export default function EstoquePage() {
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("estoque")
      .select("*, produtos(nome, tipo, espessura, cor)")
      .order("id");
    if (error) console.error(error);
    else setEstoque(data as EstoqueItem[]);
    setLoading(false);
  }

  const m2Total = estoque.reduce((a, e) => a + Number(e.m2_saldo), 0);
  const chapasTotal = estoque.reduce((a, e) => a + Number(e.chapas_saldo), 0);
  const valorEstoque = estoque.reduce((a, e) => a + Number(e.m2_saldo) * Number(e.custo_m2), 0);

  function nivelChip(pct: number) {
    if (pct >= 60) return <span className="chip cg">Alto</span>;
    if (pct >= 30) return <span className="chip cy">Médio</span>;
    return <span className="chip cr">Baixo</span>;
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Estoque · Chapas</div>
        <button className="btn bp sm">+ Entrada de Estoque</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando estoque...</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="g3 mb14">
              <div className="kpi">
                <div className="kpi-l">m² em Estoque</div>
                <div className="kpi-v" style={{ color: "var(--acc)" }}>
                  {m2Total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="kpi-s">m² disponíveis</div>
                <div className="kpi-bar" style={{ width: "100%", background: "var(--acc)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Chapas em Estoque</div>
                <div className="kpi-v" style={{ color: "var(--acc2)" }}>{chapasTotal}</div>
                <div className="kpi-s">chapas disponíveis</div>
                <div className="kpi-bar" style={{ width: "70%", background: "var(--acc2)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Valor do Estoque</div>
                <div className="kpi-v" style={{ color: "var(--acc5)" }}>{formatBRL(valorEstoque)}</div>
                <div className="kpi-s">custo de aquisição</div>
                <div className="kpi-bar" style={{ width: "80%", background: "var(--acc5)" }} />
              </div>
            </div>

            {/* Tabela */}
            <div className="tw mb14">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Código</th>
                    <th>Chapas Entrada</th>
                    <th>m² Entrada</th>
                    <th>m² Consumido</th>
                    <th>Chapas Saldo</th>
                    <th>m² Saldo</th>
                    <th>Custo/m²</th>
                    <th>Valor Total</th>
                    <th>Nível</th>
                  </tr>
                </thead>
                <tbody>
                  {estoque.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                        Nenhum item no estoque
                      </td>
                    </tr>
                  )}
                  {estoque.map(e => {
                    const pct = Number(e.m2_entrada) > 0
                      ? (Number(e.m2_saldo) / Number(e.m2_entrada)) * 100
                      : 0;
                    const valorTotal = Number(e.m2_saldo) * Number(e.custo_m2);
                    return (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.produtos?.nome ?? "—"}</strong>
                          {e.produtos?.tipo && (
                            <div className="tdim">{e.produtos.tipo} · {e.produtos.espessura} · {e.produtos.cor}</div>
                          )}
                        </td>
                        <td className="mono" style={{ color: "var(--acc)" }}>{e.cod}</td>
                        <td className="mono">{e.chapas_entrada}</td>
                        <td className="mono">{formatM2(e.m2_entrada)}</td>
                        <td className="mono" style={{ color: "var(--warn)" }}>{formatM2(e.m2_consumido)}</td>
                        <td className="mono">{e.chapas_saldo}</td>
                        <td className="mono" style={{ color: "var(--acc)" }}>{formatM2(e.m2_saldo)}</td>
                        <td className="mono">{formatBRL(e.custo_m2)}</td>
                        <td className="mono">{formatBRL(valorTotal)}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div className="prg" style={{ width: "50px", height: "5px" }}>
                              <div className="prg-f" style={{
                                width: `${pct}%`,
                                background: pct >= 60 ? "var(--ok)" : pct >= 30 ? "var(--warn)" : "var(--err)"
                              }} />
                            </div>
                            {nivelChip(pct)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards por produto */}
            <div className="g2">
              {estoque.map(e => {
                const pct = Number(e.m2_entrada) > 0
                  ? (Number(e.m2_saldo) / Number(e.m2_entrada)) * 100
                  : 0;
                return (
                  <div key={e.id} className="card">
                    <div className="ct">
                      {e.produtos?.nome ?? e.cod}
                      <span className="mono" style={{ fontSize: "10px", color: "var(--t3)" }}>{e.cod}</span>
                    </div>
                    <div className="sr">
                      <div className="sl">m² disponível</div>
                      <div className="sv" style={{ color: "var(--acc)" }}>{formatM2(e.m2_saldo)}</div>
                    </div>
                    <div className="sr">
                      <div className="sl">Chapas</div>
                      <div className="sv">{e.chapas_saldo} un.</div>
                    </div>
                    <div className="sr">
                      <div className="sl">Consumido</div>
                      <div className="sv" style={{ color: "var(--warn)" }}>{formatM2(e.m2_consumido)}</div>
                    </div>
                    <div className="sr">
                      <div className="sl">Aproveitamento</div>
                      <div className="sv">{pct.toFixed(1)}% restante</div>
                    </div>
                    <div style={{ marginTop: "10px" }}>
                      <div className="prg" style={{ height: "6px" }}>
                        <div className="prg-f" style={{
                          width: `${pct}%`,
                          background: pct >= 60 ? "var(--ok)" : pct >= 30 ? "var(--warn)" : "var(--err)"
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}