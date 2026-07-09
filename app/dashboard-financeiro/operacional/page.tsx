"use client";

import { Suspense } from "react";
import AppLayout from "@/components/layout/AppLayout";
import NivelTabs from "@/components/financeiro/NivelTabs";
import FiltroGlobalFinanceiro from "@/components/financeiro/FiltroGlobalFinanceiro";

export default function OperacionalPage() {
  return (
    <Suspense fallback={<AppLayout><div className="loading">Carregando...</div></AppLayout>}>
      <AppLayout>
        <div className="tb">
          <div className="tb-title">Dashboard Financeiro</div>
        </div>
        <NivelTabs ativo="operacional" />
        <FiltroGlobalFinanceiro />
        <div className="con">
          <div className="card" style={{ textAlign: "center", padding: "60px 24px", color: "var(--t3)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t2)", marginBottom: 6 }}>
              Visão Operacional — Etapa 5.2
            </div>
            <div style={{ fontSize: 12.5, maxWidth: 420, margin: "0 auto" }}>
              Contas a pagar, contas a receber, fluxo de caixa, saldos por conta,
              conciliações pendentes e movimentações recentes entram nesta aba
              na próxima fase do blueprint do dashboard.
            </div>
          </div>
        </div>
      </AppLayout>
    </Suspense>
  );
}
