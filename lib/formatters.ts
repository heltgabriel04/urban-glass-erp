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

/** 23/05/2026 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T12:00').toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
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