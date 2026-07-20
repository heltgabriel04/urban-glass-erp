import type { NotaSieg } from "@/app/api/compras/buscar-notas-sieg/route";

export type { NotaSieg };

export interface PeriodoBusca { inicio: string; fim: string; }

export async function buscarNotasSieg(periodo: PeriodoBusca): Promise<{ notas: NotaSieg[]; erro: string | null }> {
  try {
    const params = new URLSearchParams({ inicio: periodo.inicio, fim: periodo.fim });
    const res = await fetch(`/api/compras/buscar-notas-sieg?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) return { notas: [], erro: json.error ?? `Erro ${res.status}` };
    return { notas: (json.notas ?? []) as NotaSieg[], erro: null };
  } catch (err) {
    console.error("buscarNotasSieg:", err);
    return { notas: [], erro: "Erro de conexão" };
  }
}
