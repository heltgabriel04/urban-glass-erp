"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getTodasCaixas } from "@/services/lotes.service";
import { statusCaixa } from "@/lib/caixaEstoque";
import { formatDate, formatM2 } from "@/lib/formatters";
import type { LoteEstoque } from "@/types";

type FiltroStatus = "todas" | "fechada" | "aberta" | "esgotada";

const CHIP_STATUS: Record<"fechada" | "aberta" | "esgotada", string> = {
  fechada:  "chip cg",
  aberta:   "chip cy",
  esgotada: "chip cr",
};

export default function CaixasEstoquePage() {
  const [caixas, setCaixas]   = useState<LoteEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProduto, setFiltroProduto] = useState<number | "todas">("todas");
  const [filtroStatus, setFiltroStatus]   = useState<FiltroStatus>("todas");

  useEffect(() => {
    getTodasCaixas().then(c => { setCaixas(c); setLoading(false); });
  }, []);

  const produtosOpts = useMemo(() => {
    const porId = new Map<number, string>();
    caixas.forEach(c => porId.set(c.produto_id, c.produtos?.nome ?? `#${c.produto_id}`));
    return Array.from(porId.entries());
  }, [caixas]);

  const caixasFiltradas = caixas.filter(c => {
    if (filtroProduto !== "todas" && c.produto_id !== filtroProduto) return false;
    if (filtroStatus !== "todas" && statusCaixa(c.chapas_saldo, c.chapas_entrada) !== filtroStatus) return false;
    return true;
  });

  if (loading) return <AppLayout><div className="con">Carregando…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="tb">
        <div>
          <div className="tb-title">Estoque · Caixas</div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>
            {caixasFiltradas.length} caixa{caixasFiltradas.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="fc sm" value={filtroProduto} onChange={e => setFiltroProduto(e.target.value === "todas" ? "todas" : Number(e.target.value))}>
            <option value="todas">Todos os produtos</option>
            {produtosOpts.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <select className="fc sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as FiltroStatus)}>
            <option value="todas">Todos os status</option>
            <option value="fechada">Fechada</option>
            <option value="aberta">Aberta</option>
            <option value="esgotada">Esgotada</option>
          </select>
        </div>
      </div>

      <div className="con">
        <div className="tw" style={{ maxHeight: "calc(100vh - 160px)" }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th>Medida</th>
                <th>Status</th>
                <th>Chapas (saldo/entrada)</th>
                <th>m² saldo</th>
                <th>Data de entrada</th>
              </tr>
            </thead>
            <tbody>
              {caixasFiltradas.map(c => {
                const status = statusCaixa(c.chapas_saldo, c.chapas_entrada);
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{c.codigo}</td>
                    <td>{c.produtos?.nome ?? `#${c.produto_id}`}</td>
                    <td className="mono">{c.chapa_largura_mm ?? "—"} × {c.chapa_altura_mm ?? "—"} mm</td>
                    <td><span className={CHIP_STATUS[status]}>{status}</span></td>
                    <td className="mono">{c.chapas_saldo} / {c.chapas_entrada}</td>
                    <td className="mono">{formatM2(Number(c.m2_saldo))}</td>
                    <td className="mono">{c.dt_entrada_estimada ? "estimada" : formatDate(c.dt_entrada)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
