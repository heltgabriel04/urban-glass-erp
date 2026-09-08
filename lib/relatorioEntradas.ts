// Relatório de Entradas — pedido, cliente, parcela, valor, conta de pagamento
// + auditoria de pedidos com informação de recebimento incompleta.
//
// Fonte da verdade pro que foi *efetivamente* recebido é `baixas_lancamento`
// (cada baixa carrega sua própria conta_id/forma_pgto/valor/data — uma
// parcela pode ter mais de uma baixa: pagamento parcial, ou em contas
// diferentes). O campo `lancamentos.conta_id` só é usado como fallback pra
// títulos "Pago" que nunca tiveram baixa (dado anterior à existência dessa
// tabela, ou lançamento manual marcado Pago direto). O campo texto
// `lancamentos.conta` NÃO entra aqui — é só o valor *planejado* no momento
// da criação do pedido (services/financeiro.service.ts:criarLancamentosParcelados),
// não necessariamente a conta onde o dinheiro de fato entrou.
//
// Mantido sem dependência de services/ (lib não importa services neste
// projeto) — a soma de baixas replica o essencial de
// services/lancamentos.service.ts:calcularSaldo, só o suficiente pro que
// este módulo precisa.

import type { Lancamento, BaixaLancamento, ContaBancaria, Pedido } from "@/types";

const SEM_INFO = "—";

function soData(data: string): string {
  return data.slice(0, 10);
}

function diffDias(de: string, ate: string): number {
  const a = new Date(soData(de) + "T00:00:00");
  const b = new Date(soData(ate) + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function baixasValidas(baixas: BaixaLancamento[] | undefined): BaixaLancamento[] {
  return (baixas ?? []).filter(b => !b.estornado_em);
}

function valorPago(lancamento: Pick<Lancamento, "valor" | "status">, baixas: BaixaLancamento[] | undefined): number {
  const lista = baixasValidas(baixas);
  if (lista.length === 0) return lancamento.status === "Pago" ? Number(lancamento.valor) : 0;
  return lista.reduce((a, b) => a + Number(b.valor), 0);
}

function nomeConta(contaId: number | null | undefined, contasPorId: Map<number, ContaBancaria>): string | null {
  if (contaId == null) return null;
  return contasPorId.get(contaId)?.nome ?? null;
}

function nomeCliente(l: Lancamento): string {
  return l.clientes?.nome ?? "Sem cliente";
}

// ── 1. Linhas de entrada (uma por baixa; título legado "Pago" sem baixa
// nenhuma vira uma linha sintética) ─────────────────────────────────────────

export interface LinhaEntrada {
  lancamentoId: number;
  pedidoId: string;
  cliente: string;
  parcela: string;
  valor: number;
  conta: string;
  formaPgto: string;
  data: string | null;
}

export function montarLinhasEntradas(
  lancamentos: Lancamento[],
  baixasPorLancamento: Map<number, BaixaLancamento[]>,
  contasPorId: Map<number, ContaBancaria>,
  periodo?: { inicio: string; fim: string },
): LinhaEntrada[] {
  const linhas: LinhaEntrada[] = [];
  const dentroDoPeriodo = (data: string | null) => {
    if (!periodo || !data) return !periodo; // sem período informado => aceita tudo; sem data => só aceita se não houver filtro
    const d = soData(data);
    return d >= periodo.inicio && d <= periodo.fim;
  };

  for (const l of lancamentos) {
    if (l.tipo !== "Entrada" || l.deletado_em || !l.pedido_id) continue;
    const baixas = baixasValidas(baixasPorLancamento.get(l.id));
    if (baixas.length > 0) {
      for (const b of baixas) {
        if (!dentroDoPeriodo(b.data)) continue;
        linhas.push({
          lancamentoId: l.id,
          pedidoId: l.pedido_id,
          cliente: nomeCliente(l),
          parcela: l.descricao,
          valor: Number(b.valor),
          conta: b.contas_bancarias?.nome ?? nomeConta(b.conta_id, contasPorId) ?? SEM_INFO,
          formaPgto: b.forma_pgto ?? SEM_INFO,
          data: b.data,
        });
      }
    } else if (l.status === "Pago") {
      if (!dentroDoPeriodo(l.dt_pagamento ?? null)) continue;
      linhas.push({
        lancamentoId: l.id,
        pedidoId: l.pedido_id,
        cliente: nomeCliente(l),
        parcela: l.descricao,
        valor: Number(l.valor),
        conta: nomeConta(l.conta_id, contasPorId) ?? SEM_INFO,
        formaPgto: l.forma_pgto ?? SEM_INFO,
        data: l.dt_pagamento ?? null,
      });
    }
  }
  return linhas.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
}

// ── 2. Pedidos com informação incompleta ────────────────────────────────────

// ── Exibição por título (usado na coluna "Conta / Forma" de /contas-receber
// e no export Excel de lá) ───────────────────────────────────────────────

export interface ContaFormaExibicao {
  texto: string;
  faltando: boolean;
}

export function contaFormaExibicao(
  lancamento: { conta_id?: number | null; status: string },
  baixas: BaixaLancamento[] | undefined,
  contasPorId: Map<number, ContaBancaria>,
): ContaFormaExibicao {
  const lista = baixasValidas(baixas);
  if (lista.length === 0) {
    if (lancamento.status !== "Pago") return { texto: SEM_INFO, faltando: false }; // ainda não recebido
    const nome = nomeConta(lancamento.conta_id, contasPorId);
    return nome ? { texto: nome, faltando: false } : { texto: "sem conta", faltando: true };
  }
  const nomes = lista.map(b => b.contas_bancarias?.nome ?? nomeConta(b.conta_id, contasPorId));
  const validos = [...new Set(nomes.filter((n): n is string => n != null))];
  const faltando = nomes.some(n => n == null);
  if (validos.length === 0) return { texto: "sem conta", faltando: true };
  const base = validos.length > 1 ? `${validos.length} contas` : validos[0];
  return { texto: faltando ? `${base} (+ sem conta)` : base, faltando };
}

export function formaPgtoExibicao(
  lancamento: { forma_pgto?: string | null; status: string },
  baixas: BaixaLancamento[] | undefined,
): string {
  const lista = baixasValidas(baixas);
  if (lista.length === 0) {
    if (lancamento.status !== "Pago") return SEM_INFO;
    return lancamento.forma_pgto ?? SEM_INFO;
  }
  const formas = [...new Set(lista.map(b => b.forma_pgto).filter((f): f is string => !!f))];
  return formas.length > 0 ? formas.join(", ") : SEM_INFO;
}

export interface ParcelaSemConta {
  lancamentoId: number;
  pedidoId: string;
  cliente: string;
  parcela: string;
  valor: number;
}

// Parcela com valor recebido > 0 mas sem nenhuma conta/forma de pagamento
// registrada (nem nas baixas, nem no legado direto do lançamento).
export function parcelasRecebidasSemConta(
  lancamentos: Lancamento[],
  baixasPorLancamento: Map<number, BaixaLancamento[]>,
): ParcelaSemConta[] {
  const resultado: ParcelaSemConta[] = [];
  for (const l of lancamentos) {
    if (l.tipo !== "Entrada" || l.deletado_em || !l.pedido_id) continue;
    const baixas = baixasValidas(baixasPorLancamento.get(l.id));
    if (valorPago(l, baixas) <= 0) continue;
    const semConta = baixas.length > 0
      ? baixas.some(b => b.conta_id == null)
      : l.conta_id == null;
    if (!semConta) continue;
    resultado.push({
      lancamentoId: l.id, pedidoId: l.pedido_id, cliente: nomeCliente(l),
      parcela: l.descricao, valor: Number(l.valor),
    });
  }
  return resultado;
}

export interface PedidoSemLancamento {
  pedidoId: string;
  cliente: string;
  status: string;
  valorTotal: number;
}

// Pedido ativo (não Cancelado) sem nenhum lançamento de Entrada vinculado —
// provável falha ao gerar as parcelas na criação/edição do pedido.
export function pedidosSemLancamento(pedidos: Pedido[], lancamentos: Lancamento[]): PedidoSemLancamento[] {
  const comLancamento = new Set(
    lancamentos.filter(l => l.tipo === "Entrada" && !l.deletado_em && l.pedido_id).map(l => l.pedido_id as string)
  );
  return pedidos
    .filter(p => p.status !== "Cancelado" && !comLancamento.has(p.id))
    .map(p => ({
      pedidoId: p.id, cliente: p.clientes?.nome ?? "Sem cliente",
      status: p.status, valorTotal: Number(p.valor_total),
    }));
}

export interface ParcelaVencidaSemBaixa {
  lancamentoId: number;
  pedidoId: string | null;
  cliente: string;
  parcela: string;
  valor: number;
  vencimento: string;
  diasAtraso: number;
}

// Parcela vencida (status "A Receber", vencimento no passado) que nunca
// recebeu nenhuma baixa — nem parcial. Mesma população da aba Inadimplência,
// reunida aqui pra dar visão única de "o que falta cobrar/registrar".
export function parcelasVencidasSemBaixa(
  lancamentos: Lancamento[],
  baixasPorLancamento: Map<number, BaixaLancamento[]>,
  hojeISO: string,
): ParcelaVencidaSemBaixa[] {
  const resultado: ParcelaVencidaSemBaixa[] = [];
  for (const l of lancamentos) {
    if (l.tipo !== "Entrada" || l.deletado_em || l.status !== "A Receber" || l.permuta) continue;
    if (!l.vencimento || l.vencimento >= hojeISO) continue;
    const baixas = baixasValidas(baixasPorLancamento.get(l.id));
    if (valorPago(l, baixas) > 0) continue; // teve baixa parcial — não é "sem nenhuma baixa"
    resultado.push({
      lancamentoId: l.id, pedidoId: l.pedido_id, cliente: nomeCliente(l),
      parcela: l.descricao, valor: Number(l.valor), vencimento: l.vencimento,
      diasAtraso: diffDias(l.vencimento, hojeISO),
    });
  }
  return resultado.sort((a, b) => b.diasAtraso - a.diasAtraso);
}
