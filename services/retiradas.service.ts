import { supabase } from '@/lib/supabase/client';
import { registrarLog } from './log.service';
import type {
  RetiradaPedido, RetiradaPedidoInsert,
  RetiradaPedidoItemInsert,
  ItemPedido, SaldoItemRetirada,
} from '@/types';

export async function getRetiradasPorPedido(pedidoId: string): Promise<RetiradaPedido[]> {
  const { data, error } = await supabase
    .from('retiradas_pedido')
    .select(`*, retiradas_pedido_itens ( *, itens_pedido ( id, produto_nome, largura, altura, quantidade, vidro_cliente, codigo_adicional ) )`)
    .eq('pedido_id', pedidoId)
    .order('dt_retirada', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) { console.error('getRetiradasPorPedido:', error); return []; }
  return data as RetiradaPedido[];
}

/** Soma as retiradas já registradas e calcula o saldo pendente de cada item do pedido. */
export function calcularSaldoItens(itensPedido: ItemPedido[], retiradas: RetiradaPedido[]): SaldoItemRetirada[] {
  const retiradoPorItem = new Map<number, number>();
  for (const retirada of retiradas) {
    for (const item of retirada.retiradas_pedido_itens ?? []) {
      retiradoPorItem.set(item.item_pedido_id, (retiradoPorItem.get(item.item_pedido_id) ?? 0) + item.quantidade);
    }
  }

  return itensPedido.map(item => {
    const quantidade_retirada = retiradoPorItem.get(item.id) ?? 0;
    const quantidade_pendente = Math.max(0, item.quantidade - quantidade_retirada);
    const status: SaldoItemRetirada['status'] =
      quantidade_retirada === 0 ? 'Pendente' : quantidade_retirada >= item.quantidade ? 'Retirado' : 'Parcial';

    return {
      item_pedido_id: item.id,
      produto_nome: item.produto_nome,
      largura: item.largura,
      altura: item.altura,
      quantidade_total: item.quantidade,
      quantidade_retirada,
      quantidade_pendente,
      status,
    };
  });
}

export async function createRetirada(
  pedidoId: string,
  dados: Omit<RetiradaPedidoInsert, 'pedido_id'>,
  itens: Array<Pick<RetiradaPedidoItemInsert, 'item_pedido_id' | 'quantidade' | 'obs'>>
): Promise<RetiradaPedido | null> {
  if (itens.length === 0) { console.error('createRetirada: nenhum item informado'); return null; }

  const { data: retirada, error } = await supabase
    .from('retiradas_pedido')
    .insert([{ ...dados, pedido_id: pedidoId } as never])
    .select()
    .single();

  if (error) { console.error('createRetirada:', error); return null; }

  const itensComRetiradaId = itens.map(i => ({ ...i, retirada_id: (retirada as RetiradaPedido).id }));
  const { data: itensInseridos, error: errItens } = await supabase
    .from('retiradas_pedido_itens')
    .insert(itensComRetiradaId as never)
    .select(`*, itens_pedido ( id, produto_nome, largura, altura, quantidade, vidro_cliente, codigo_adicional )`);

  if (errItens) {
    console.error('createRetirada itens:', errItens);
    await supabase.from('retiradas_pedido').delete().eq('id', (retirada as RetiradaPedido).id);
    return null;
  }

  registrarLog({
    acao: "criou", tabela: "retiradas_pedido", registro_id: (retirada as RetiradaPedido).id,
    descricao: `Registrou retirada de ${itens.length} item(ns) do pedido ${pedidoId}`,
    campos_alterados: { pedido_id: pedidoId, motorista: dados.motorista, qtd_itens: itens.length },
  });

  return { ...(retirada as RetiradaPedido), retiradas_pedido_itens: itensInseridos as never };
}

export async function deletarRetirada(retiradaId: string, pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase.from('retiradas_pedido').delete().eq('id', retiradaId);
  if (error) { console.error('deletarRetirada:', error); return { ok: false, erro: error.message }; }

  registrarLog({
    acao: "excluiu", tabela: "retiradas_pedido", registro_id: retiradaId,
    descricao: `Excluiu retirada do pedido ${pedidoId}`,
  });
  return { ok: true };
}

/** Usado por deletarPedido em pedidos.service.ts — sem log próprio (operação em cascata interna). */
export async function deletarRetiradasPorPedido(pedidoId: string): Promise<void> {
  await supabase.from('retiradas_pedido').delete().eq('pedido_id', pedidoId);
}
