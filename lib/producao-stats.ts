import type { Pedido } from '@/types';

export const ETAPAS_FLUXO = [
  'Aguardando otimização',
  'Em Produção – Corte',
  'Qualidade (Corte)',
  'Em Produção – Lapidação',
  'Qualidade (Lapidação)',
  'Separação',
  'Finalizado',
  'Entregue',
] as const;

type Entrada = { status: string; desde: string };

// Retorna ms gastos em cada etapa (apenas etapas já concluídas, com transição registrada)
export function calcTempoEtapas(history: Entrada[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (let i = 0; i < history.length - 1; i++) {
    const start = new Date(history[i].desde).getTime();
    const end   = new Date(history[i + 1].desde).getTime();
    const dur   = end - start;
    if (dur > 0) result[history[i].status] = (result[history[i].status] ?? 0) + dur;
  }
  return result;
}

export interface EtapaStats {
  media: number;    // ms
  mediana: number;  // ms
  min: number;      // ms
  max: number;      // ms
  count: number;
}

// Agrega estatísticas por etapa a partir de uma lista de pedidos
export function calcStatsEtapas(pedidos: Pedido[]): Record<string, EtapaStats> {
  const buckets: Record<string, number[]> = {};

  for (const p of pedidos) {
    const history = (p.status_history ?? []) as Entrada[];
    if (history.length < 2) continue;
    for (const [etapa, ms] of Object.entries(calcTempoEtapas(history))) {
      (buckets[etapa] ??= []).push(ms);
    }
  }

  const result: Record<string, EtapaStats> = {};
  for (const [etapa, vals] of Object.entries(buckets)) {
    const sorted = [...vals].sort((a, b) => a - b);
    const media  = vals.reduce((a, b) => a + b, 0) / vals.length;
    const mid    = Math.floor(sorted.length / 2);
    const mediana = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    result[etapa] = { media, mediana, min: sorted[0], max: sorted[sorted.length - 1], count: vals.length };
  }
  return result;
}

// Lead time total em ms de um pedido finalizado/entregue (primeiro histórico → último)
export function calcLeadTime(pedido: Pedido): number | null {
  const history = (pedido.status_history ?? []) as Entrada[];
  if (history.length < 2) return null;
  if (!['Finalizado', 'Entregue'].includes(pedido.status)) return null;
  const ms = new Date(history[history.length - 1].desde).getTime() - new Date(history[0].desde).getTime();
  return ms > 0 ? ms : null;
}

export interface PrevisaoEntrega {
  diasMedia: number;
  diasMediana: number;
  count: number;
  confianca: 'alta' | 'media' | 'baixa';
  m2Min: number;
  m2Max: number;
}

// Prevê lead time em dias para um orçamento com dado m² baseado no histórico real
export function preverLeadTime(pedidos: Pedido[], m2Alvo: number): PrevisaoEntrega | null {
  const dados = pedidos
    .filter(p => ['Finalizado', 'Entregue'].includes(p.status))
    .map(p => ({ m2: Number(p.m2_total), leadMs: calcLeadTime(p) }))
    .filter((d): d is { m2: number; leadMs: number } => d.leadMs !== null && d.m2 > 0);

  if (dados.length === 0) return null;

  // Tenta encontrar pedidos de tamanho similar (±50% do alvo)
  let similares = dados.filter(d => d.m2 >= m2Alvo * 0.5 && d.m2 <= m2Alvo * 1.5);
  if (similares.length < 3) similares = dados; // fallback: usa todos

  const dias   = similares.map(d => d.leadMs / 86400000);
  const sorted = [...dias].sort((a, b) => a - b);
  const media  = dias.reduce((a, b) => a + b, 0) / dias.length;
  const mid    = Math.floor(sorted.length / 2);
  const mediana = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    diasMedia:   Math.round(media * 10) / 10,
    diasMediana: Math.round(mediana * 10) / 10,
    count:       similares.length,
    confianca:   similares.length >= 10 ? 'alta' : similares.length >= 4 ? 'media' : 'baixa',
    m2Min: Math.min(...similares.map(d => d.m2)),
    m2Max: Math.max(...similares.map(d => d.m2)),
  };
}
