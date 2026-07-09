"use client";

import { useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { FiltroFinanceiroGlobal, PeriodoFiltro } from "@/lib/filtroFinanceiro";

// Lê/escreve o filtro global do financeiro na querystring (?periodo=&centro=&conta=).
// Precisa ser chamado por um componente que já está dentro de um <Suspense>
// (useSearchParams exige isso no App Router) — os 4 níveis do dashboard
// financeiro seguem o mesmo padrão usado em /movimentacoes.
export function useFiltroFinanceiro() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtro: FiltroFinanceiroGlobal = useMemo(() => {
    const centro = searchParams.get("centro");
    const conta = searchParams.get("conta");
    return {
      periodo: (searchParams.get("periodo") as PeriodoFiltro) || "mes",
      centroCustoId: centro ? Number(centro) : null,
      contaId: conta ? Number(conta) : null,
    };
  }, [searchParams]);

  const setFiltro = useCallback((patch: Partial<FiltroFinanceiroGlobal>) => {
    const next = { ...filtro, ...patch };
    const params = new URLSearchParams(searchParams.toString());
    if (next.periodo === "mes") params.delete("periodo"); else params.set("periodo", next.periodo);
    if (next.centroCustoId == null) params.delete("centro"); else params.set("centro", String(next.centroCustoId));
    if (next.contaId == null) params.delete("conta"); else params.set("conta", String(next.contaId));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [filtro, pathname, router, searchParams]);

  return { filtro, setFiltro };
}
