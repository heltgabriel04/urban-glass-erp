import { supabase } from '@/lib/supabase/client';

export interface GiroProduto {
  produto_nome: string;
  m2Saldo: number;
  chapasSaldo: number;
  consumoM2: number;             // consumo no período
  giro: number | null;           // consumo ÷ saldo atual (aprox.)
  coberturaDias: number | null;  // saldo ÷ consumo diário
}

/**
 * Giro e cobertura de estoque a partir do consumo derivado do histórico de
 * otimizações (chapas cortadas, exceto retalhos) nos últimos `dias`.
 * Aproximações: estoque médio ≈ saldo atual; consumo por NOME de produto
 * (mesma chave usada na baixa de estoque).
 */
export async function getGiroEstoque(dias: number): Promise<GiroProduto[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();

  const [estoqueRes, histRes] = await Promise.all([
    supabase.from('estoque').select('m2_saldo, chapas_saldo, produtos ( nome )'),
    supabase.from('historico_otimizador').select('chapas_json, created_at').gte('created_at', desde),
  ]);

  // Consumo (m²) por nome de produto no período
  const consumo = new Map<string, number>();
  for (const h of (histRes.data ?? []) as Array<{ chapas_json: unknown }>) {
    const chapas = (h.chapas_json ?? []) as Array<{ W: number; H: number; prod: string; placed?: unknown[]; retalhoId?: string | null }>;
    for (const c of chapas) {
      if (c.retalhoId) continue;                       // retalho reaproveitado não baixa chapa
      if (!c.placed || c.placed.length === 0) continue; // chapa sem peças
      consumo.set(c.prod, (consumo.get(c.prod) ?? 0) + (Number(c.W) * Number(c.H)) / 1e6);
    }
  }

  return ((estoqueRes.data ?? []) as Array<{ m2_saldo: number; chapas_saldo: number; produtos?: { nome?: string } }>)
    .map(e => {
      const nome = e.produtos?.nome ?? '—';
      const m2Saldo = Number(e.m2_saldo) || 0;
      const consumoM2 = parseFloat((consumo.get(nome) ?? 0).toFixed(2));
      const giro = m2Saldo > 0 ? parseFloat((consumoM2 / m2Saldo).toFixed(2)) : null;
      const consumoDiario = consumoM2 / dias;
      const coberturaDias = consumoDiario > 0 ? Math.round(m2Saldo / consumoDiario) : null;
      return { produto_nome: nome, m2Saldo, chapasSaldo: Number(e.chapas_saldo) || 0, consumoM2, giro, coberturaDias };
    })
    .sort((a, b) => b.consumoM2 - a.consumoM2);
}
