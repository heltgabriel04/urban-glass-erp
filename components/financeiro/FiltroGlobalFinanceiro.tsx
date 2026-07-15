"use client";

import { useEffect, useState } from "react";
import { useFiltroFinanceiro } from "./useFiltroFinanceiro";
import { getContasBancarias } from "@/services/contasBancarias.service";
import { PERIODO_LABEL, type PeriodoFiltro } from "@/lib/filtroFinanceiro";
import type { ContaBancaria } from "@/types";

interface FiltroGlobalFinanceiroProps {
  // Nem todo nível do dashboard tem consulta que aceite esses filtros —
  // mostrar o seletor sem ele fazer nada é pior que não mostrar (achado
  // 2026-07-15: Analítica/Estratégica não liam o filtro, Operacional não
  // tem noção de período). Cada página passa só o que sua própria
  // consulta de fato usa.
  mostrarPeriodo?: boolean;
  mostrarConta?: boolean;
}

// Barra de filtro compartilhada pelos níveis do dashboard financeiro que
// realmente filtram algo. Vive na URL (useFiltroFinanceiro).
export default function FiltroGlobalFinanceiro({ mostrarPeriodo = true, mostrarConta = true }: FiltroGlobalFinanceiroProps) {
  const { filtro, setFiltro } = useFiltroFinanceiro();
  const [contas, setContas] = useState<ContaBancaria[]>([]);

  useEffect(() => {
    if (mostrarConta) getContasBancarias(true).then(setContas);
  }, [mostrarConta]);

  if (!mostrarPeriodo && !mostrarConta) return null;

  const temFiltroAtivo = (mostrarPeriodo && filtro.periodo !== "mes") || (mostrarConta && filtro.contaId != null);

  return (
    <div className="no-print" style={{
      display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
      padding: "10px 26px", borderTop: "1px solid var(--b1)", borderBottom: "1px solid var(--b1)",
      background: "var(--surf2)",
    }}>
      <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Filtros
      </span>
      {mostrarPeriodo && (
        <select name="filtro_periodo" className="fc" style={{ margin: 0, width: "auto" }} value={filtro.periodo}
          onChange={e => setFiltro({ periodo: e.target.value as PeriodoFiltro })}>
          {(Object.keys(PERIODO_LABEL) as PeriodoFiltro[]).map(p => (
            <option key={p} value={p}>{PERIODO_LABEL[p]}</option>
          ))}
        </select>
      )}
      {mostrarConta && (
        <select name="filtro_conta_id" className="fc" style={{ margin: 0, width: "auto" }} value={filtro.contaId ?? ""}
          onChange={e => setFiltro({ contaId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Todas as contas</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}
      {temFiltroAtivo && (
        <button className="btn bg xs" onClick={() => setFiltro({ periodo: "mes", contaId: null })}>
          Limpar
        </button>
      )}
    </div>
  );
}
