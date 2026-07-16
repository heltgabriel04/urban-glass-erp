import type { DocumentoFiscalInsert, PerdaMensalVidro } from "@/types";
import { formatBRL, formatM2 } from "./formatters";

const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface GrupoMesPerdaVidro {
  chaveMs: string; // "YYYY-MM"
  label: string;   // "Julho/2026"
  itens: PerdaMensalVidro[];
  m2Total: number;
  valorTotal: number;
}

export function formatarMesReferencia(chaveMs: string): string {
  const [ano, mes] = chaveMs.split("-").map(Number);
  return `${MESES_LONGOS[mes - 1]}/${ano}`;
}

export function agruparPorMes(itens: PerdaMensalVidro[]): GrupoMesPerdaVidro[] {
  const ordem: string[] = [];
  const porMes = new Map<string, PerdaMensalVidro[]>();
  for (const item of itens) {
    const chave = item.mes_referencia.slice(0, 7);
    if (!porMes.has(chave)) { porMes.set(chave, []); ordem.push(chave); }
    porMes.get(chave)!.push(item);
  }
  return ordem.map((chaveMs) => {
    const lista = porMes.get(chaveMs)!;
    return {
      chaveMs,
      label: formatarMesReferencia(chaveMs),
      itens: lista,
      m2Total: lista.reduce((s, l) => s + l.m2_perda_total, 0),
      valorTotal: lista.reduce((s, l) => s + l.valor_perda_total, 0),
    };
  });
}

export function montarPrefillNfMes(itens: PerdaMensalVidro[]): Partial<DocumentoFiscalInsert> {
  const [ano, mes] = itens[0].mes_referencia.slice(0, 7).split("-").map(Number);
  const m2Total = itens.reduce((s, l) => s + l.m2_perda_total, 0);
  const valorTotal = itens.reduce((s, l) => s + l.valor_perda_total, 0);
  return {
    competencia_ano: ano,
    competencia_mes: mes,
    material: itens.map((l) => l.produto_nome).join(", "),
    quantidade: Number(m2Total.toFixed(2)),
    valor_total: Number(valorTotal.toFixed(2)),
    observacoes: itens
      .map((l) => `${l.produto_nome}: ${formatM2(l.m2_perda_total)} – ${formatBRL(l.valor_perda_total)}`)
      .join("\n"),
  };
}
