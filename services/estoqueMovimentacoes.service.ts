import { supabase } from '@/lib/supabase/client';
import { calcularMovimentacao } from '@/lib/movimentacaoEstoque';
import type { TipoMovimentacaoEstoque, OrigemMovimentacaoEstoque } from '@/types';

export interface RegistrarMovimentacaoParams {
  produtoId?: number | null;
  produtoNome?: string;
  /**
   * Quando informado, a movimentação decrementa/incrementa esse lote
   * específico de `lotes_estoque` em vez do agregado por produto em
   * `estoque` (migração de 2026-07-21, ver lib/movimentacaoEstoque.ts).
   * Único chamador que já resolve isso hoje: app/otimizador/page.tsx
   * (baixa de produção real, via resolverDimensaoPorProduto). Os outros
   * pontos de baixa (venda direta de chapa inteira, recebimento de compra,
   * ajuste manual em /estoque) ainda não escolhem lote — continuam no
   * agregado até serem migrados um a um.
   */
  loteId?: number | null;
  tipo: TipoMovimentacaoEstoque;
  origemTipo: OrigemMovimentacaoEstoque;
  /** Chave de idempotência junto com produto. Omita para entradas manuais — cada
   *  chamada sempre insere (não há risco de double-fire como nos fluxos automáticos). */
  origemId?: string;
  /** Positivo = entrada, negativo = saída. */
  chapas?: number;
  /** Positivo = entrada, negativo = saída. */
  m2?: number;
  /**
   * Custo/m² desta movimentação específica. Em entradas, é usado para
   * recalcular o custo médio ponderado de `estoque.custo_m2` (ou
   * `lotes_estoque.custo_m2` quando `loteId` é informado). Em saídas, se
   * omitido, é preenchido automaticamente com o custo médio vigente no
   * momento — isso é o que permite reconstruir o custo histórico depois.
   */
  custoUnitarioM2?: number | null;
  usuario?: string | null;
  obs?: string | null;
}

export interface ResultadoMovimentacao {
  ok: boolean;
  jaExistia?: boolean;
  motivo?: string;
  /** true quando saldo ficou abaixo do mínimo configurado */
  alertaMinimo?: boolean;
  alertaMensagem?: string;
}

/**
 * Registra uma movimentação de estoque de forma idempotente: a combinação
 * (origemTipo, origemId, produto) só gera 1 movimento, mesmo se a função for
 * chamada de novo (double-click, re-otimização sem zerar, retry de rede etc.).
 */
export async function registrarMovimentacao(params: RegistrarMovimentacaoParams): Promise<ResultadoMovimentacao> {
  const { tipo, origemTipo, origemId, chapas = 0, m2 = 0, custoUnitarioM2, usuario, obs, loteId } = params;

  let produtoId = params.produtoId ?? null;
  if (!produtoId && params.produtoNome) {
    const { data } = await supabase.from('produtos').select('id').eq('nome', params.produtoNome).limit(1).maybeSingle();
    produtoId = (data as { id: number } | null)?.id ?? null;
  }
  if (!produtoId) return { ok: false, motivo: `produto não encontrado: ${params.produtoNome ?? params.produtoId}` };

  if (origemId) {
    const { data: existente } = await supabase
      .from('estoque_movimentacoes')
      .select('id')
      .eq('origem_tipo', origemTipo)
      .eq('origem_id', origemId)
      .eq('produto_id', produtoId)
      .maybeSingle();
    if (existente) return { ok: true, jaExistia: true };
  }

  const movimento = { tipo, chapas, m2, custoUnitarioM2 };

  // ── Lote específico (2026-07-21) ────────────────────────────
  if (loteId != null) {
    const { data: loteItem } = await supabase
      .from('lotes_estoque')
      .select('id, chapas_saldo, m2_saldo, custo_m2, estoque_minimo_chapas')
      .eq('id', loteId)
      .maybeSingle();
    if (!loteItem) return { ok: false, motivo: `lote ${loteId} não encontrado` };
    const lote = loteItem as { id: number; chapas_saldo: number; m2_saldo: number; custo_m2: number | null; estoque_minimo_chapas: number | null };

    const calc = calcularMovimentacao(
      { chapasSaldo: Number(lote.chapas_saldo), m2Saldo: Number(lote.m2_saldo), custoM2: lote.custo_m2 },
      movimento,
    );
    if (!calc.ok) return { ok: false, motivo: calc.motivo };
    const { novoSaldoChapas, novoSaldoM2, custoEfetivo, novoCustoM2 } = calc.resultado;

    const { error: errUpd } = await supabase
      .from('lotes_estoque')
      .update({ chapas_saldo: novoSaldoChapas, m2_saldo: novoSaldoM2, custo_m2: novoCustoM2 } as never)
      .eq('id', loteId);
    if (errUpd) return { ok: false, motivo: errUpd.message };

    const { error: errIns } = await supabase.from('estoque_movimentacoes').insert({
      produto_id: produtoId, lote_id: loteId,
      tipo, origem_tipo: origemTipo, origem_id: origemId ?? null,
      chapas, m2,
      custo_unitario_m2: custoEfetivo,
      saldo_chapas_apos: novoSaldoChapas,
      saldo_m2_apos:     novoSaldoM2,
      usuario: usuario ?? null,
      obs:     obs ?? null,
    } as never);
    if (errIns) return { ok: false, motivo: errIns.message };

    const minimoLote = lote.estoque_minimo_chapas;
    if (minimoLote != null && minimoLote > 0 && novoSaldoChapas <= minimoLote) {
      return { ok: true, alertaMinimo: true, alertaMensagem: `Lote abaixo do mínimo: ${novoSaldoChapas} chapas (mínimo: ${minimoLote})` };
    }
    return { ok: true };
  }

  // ── Agregado por produto (comportamento original) ───────────
  const { data: estoqueItem } = await supabase
    .from('estoque')
    .select('id, chapas_saldo, m2_saldo, m2_consumido, custo_m2, estoque_minimo_chapas')
    .eq('produto_id', produtoId)
    .limit(1)
    .maybeSingle();
  if (!estoqueItem) return { ok: false, motivo: `produto ${produtoId} sem registro em estoque` };

  const item = estoqueItem as { id: number; chapas_saldo: number; m2_saldo: number; m2_consumido: number; custo_m2: number; estoque_minimo_chapas: number | null };

  const calc = calcularMovimentacao(
    { chapasSaldo: Number(item.chapas_saldo), m2Saldo: Number(item.m2_saldo), custoM2: Number(item.custo_m2 ?? 0) },
    movimento,
  );
  if (!calc.ok) return { ok: false, motivo: calc.motivo };
  const { novoSaldoChapas, novoSaldoM2, custoEfetivo, novoCustoM2 } = calc.resultado;

  // Saída (m2 negativo) soma ao consumido; entrada não altera consumido.
  // m2_consumido não existe em lotes_estoque — só faz sentido no agregado.
  const novoConsumido = m2 < 0
    ? parseFloat((Number(item.m2_consumido) - m2).toFixed(4))
    : Number(item.m2_consumido);

  const { error: errUpd } = await supabase
    .from('estoque')
    .update({
      chapas_saldo: novoSaldoChapas,
      m2_saldo:     novoSaldoM2,
      m2_consumido: novoConsumido,
      custo_m2:     novoCustoM2 ?? 0,
      updated_at:   new Date().toISOString(),
    } as never)
    .eq('id', item.id);
  if (errUpd) return { ok: false, motivo: errUpd.message };

  const { error: errIns } = await supabase.from('estoque_movimentacoes').insert({
    produto_id: produtoId,
    tipo, origem_tipo: origemTipo, origem_id: origemId ?? null,
    chapas, m2,
    custo_unitario_m2: custoEfetivo,
    saldo_chapas_apos: novoSaldoChapas,
    saldo_m2_apos:     novoSaldoM2,
    usuario: usuario ?? null,
    obs:     obs ?? null,
  } as never);
  if (errIns) return { ok: false, motivo: errIns.message };

  // C6: alerta quando saldo fica abaixo do mínimo configurado
  const minimo = item.estoque_minimo_chapas;
  if (minimo != null && minimo > 0 && novoSaldoChapas <= minimo) {
    return {
      ok: true,
      alertaMinimo: true,
      alertaMensagem: `Estoque abaixo do mínimo: ${novoSaldoChapas} chapas (mínimo: ${minimo})`,
    };
  }

  return { ok: true };
}

/** Desfaz todas as movimentações de uma origem (ex.: ao zerar/excluir um pedido). */
export async function reverterMovimentacao(origemTipo: OrigemMovimentacaoEstoque, origemId: string): Promise<boolean> {
  const { data: movs, error } = await supabase
    .from('estoque_movimentacoes')
    .select('id, produto_id, lote_id, chapas, m2')
    .eq('origem_tipo', origemTipo)
    .eq('origem_id', origemId);
  if (error) { console.error('reverterMovimentacao:', error); return false; }
  if (!movs || movs.length === 0) return true;

  for (const mov of movs as Array<{ id: number; produto_id: number; lote_id: number | null; chapas: number; m2: number }>) {
    if (mov.lote_id != null) {
      // Movimentação era de um lote específico — credita de volta nele,
      // nunca no agregado do produto (senão o saldo migra pro lote errado).
      const { data: loteItem } = await supabase
        .from('lotes_estoque')
        .select('id, chapas_saldo, m2_saldo')
        .eq('id', mov.lote_id)
        .maybeSingle();
      if (loteItem) {
        const lote = loteItem as { id: number; chapas_saldo: number; m2_saldo: number };
        const novoSaldoChapas = Math.max(0, Number(lote.chapas_saldo) - mov.chapas);
        const novoSaldoM2     = Math.max(0, parseFloat((Number(lote.m2_saldo) - mov.m2).toFixed(4)));
        await supabase.from('lotes_estoque').update({
          chapas_saldo: novoSaldoChapas,
          m2_saldo:     novoSaldoM2,
        } as never).eq('id', lote.id);
      }
    } else {
      const { data: estoqueItem } = await supabase
        .from('estoque')
        .select('id, chapas_saldo, m2_saldo, m2_consumido')
        .eq('produto_id', mov.produto_id)
        .limit(1)
        .maybeSingle();

      if (estoqueItem) {
        const item = estoqueItem as { id: number; chapas_saldo: number; m2_saldo: number; m2_consumido: number };
        const novoSaldoChapas = Math.max(0, Number(item.chapas_saldo) - mov.chapas);
        const novoSaldoM2     = Math.max(0, parseFloat((Number(item.m2_saldo) - mov.m2).toFixed(4)));
        const novoConsumido   = mov.m2 < 0
          ? Math.max(0, parseFloat((Number(item.m2_consumido) + mov.m2).toFixed(4)))
          : Number(item.m2_consumido);

        await supabase.from('estoque').update({
          chapas_saldo: novoSaldoChapas,
          m2_saldo:     novoSaldoM2,
          m2_consumido: novoConsumido,
          updated_at:   new Date().toISOString(),
        } as never).eq('id', item.id);
      }
    }
    await supabase.from('estoque_movimentacoes').delete().eq('id', mov.id);
  }
  return true;
}

export async function getMovimentacoesPorProduto(produtoId: number) {
  const { data, error } = await supabase
    .from('estoque_movimentacoes')
    .select('*')
    .eq('produto_id', produtoId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getMovimentacoesPorProduto:', error); return []; }
  return data;
}

export async function getEstoqueConsolidado() {
  const { data, error } = await supabase
    .from('vw_estoque_consolidado')
    .select('*')
    .order('nome');
  if (error) { console.error('getEstoqueConsolidado:', error); return []; }
  return data;
}
