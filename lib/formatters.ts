// lib/formatters.ts
// Espelha as funções utilitárias do HTML original:
// R$(), M2(), PC(), FD()

export const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** R$ 1.234,56 */
export function formatBRL(value: number | null | undefined, decimals = 2): string {
  return 'R$ ' + Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 12,34 m² */
export function formatM2(value: number | null | undefined, decimals = 2): string {
  return Number(value || 0).toFixed(decimals) + ' m²';
}

/** 87,45% */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  return Number(value || 0).toFixed(decimals) + '%';
}

/**
 * Área real da peça (largura × altura × quantidade), sem o arredondamento pra
 * múltiplo de 50mm que o campo `item.m2` carrega (regra de cobrança — cada
 * dimensão sobe pro próximo múltiplo de 50mm, então uma peça de 900×950mm é
 * cobrada como se fosse 1000×1000mm = 1m²). Pra exibir a medida real da peça
 * (romaneio, listas) use esta função em vez de `item.m2` direto.
 * Em modo ML (vidro do cliente / produto por metro linear) `item.m2` já é o
 * valor exato sem arredondamento, então é reaproveitado.
 */
export function medidaReal(
  item: { largura: number; altura: number; quantidade: number; m2: number },
  isML: boolean
): number {
  return isML ? item.m2 : (item.largura * item.altura * item.quantidade) / 1e6;
}

/** 23/05/2026 — parseia YYYY-MM-DD sem converter para UTC para evitar bug de fuso */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

/** Diferença em dias entre hoje e uma data */
export function diffDias(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00');
  const hoje = new Date();
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
}

/** Label legível da diff de dias */
export function labelDiff(diff: number): string {
  if (diff < 0) return `Vencido há ${Math.abs(diff)}d`;
  if (diff === 0) return 'Hoje';
  return `${diff}d`;
}

/** mm → string legível */
export function formatMM(mm: number): string {
  return `${mm} mm`;
}

/** Gera próximo ID no formato P-001, ORC-001, R-001 */
export function gerarId(prefixo: string, ultimo: number): string {
  return `${prefixo}-${String(ultimo + 1).padStart(3, '0')}`;
}

/** Duração legível: 2d 4h, 3h, 45min */
export function formatDuracao(ms: number): string {
  if (ms <= 0) return '<1min';
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  const h     = hours % 24;
  if (days > 0 && h > 0) return `${days}d ${h}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${mins}min`;
}