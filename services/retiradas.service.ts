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
    .select(`*, retiradas_pedido_itens ( *, itens_pedido ( id, produto_nome, largura, altura, quantidade, vidro_cliente, codigo_adicional, produtos ( unidade ) ) )`)
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
      codigo_adicional: item.codigo_adicional ?? null,
      quantidade_total: item.quantidade,
      quantidade_retirada,
      quantidade_pendente,
      status,
    };
  });
}

export interface ResultadoRetirada {
  ok: boolean;
  retirada?: RetiradaPedido;
  erro?: string;
}

// C5: calcula saldo disponível por item excluindo uma retirada em edição
async function _validarQuantidades(
  pedidoId: string,
  itens: Array<Pick<RetiradaPedidoItemInsert, 'item_pedido_id' | 'quantidade'>>,
  excluirRetiradaId?: string
): Promise<string | null> {
  const [{ data: itensPedido }, retiradasExistentes] = await Promise.all([
    supabase.from('itens_pedido').select('id, quantidade').eq('pedido_id', pedidoId),
    getRetiradasPorPedido(pedidoId),
  ]);

  const qtdPorItem = new Map<number, number>(
    ((itensPedido ?? []) as Array<{ id: number; quantidade: number }>).map(i => [i.id, i.quantidade])
  );

  const retiradas = retiradasExistentes.filter(r => r.id !== excluirRetiradaId);
  const jaRetirado = new Map<number, number>();
  for (const r of retiradas) {
    for (const ri of r.retiradas_pedido_itens ?? []) {
      jaRetirado.set(ri.item_pedido_id, (jaRetirado.get(ri.item_pedido_id) ?? 0) + ri.quantidade);
    }
  }

  for (const item of itens) {
    const total = qtdPorItem.get(item.item_pedido_id) ?? 0;
    const retirado = jaRetirado.get(item.item_pedido_id) ?? 0;
    const disponivel = total - retirado;
    if (item.quantidade > disponivel) {
      return `Item #${item.item_pedido_id}: solicitado ${item.quantidade} mas disponível ${disponivel}`;
    }
  }
  return null;
}

export async function createRetirada(
  pedidoId: string,
  dados: Omit<RetiradaPedidoInsert, 'pedido_id'>,
  itens: Array<Pick<RetiradaPedidoItemInsert, 'item_pedido_id' | 'quantidade' | 'obs'>>
): Promise<ResultadoRetirada> {
  if (itens.length === 0) return { ok: false, erro: 'Nenhum item informado' };

  // C5: bloqueia retirada que excede saldo disponível
  const erroQtd = await _validarQuantidades(pedidoId, itens);
  if (erroQtd) return { ok: false, erro: erroQtd };

  const { data: retirada, error } = await supabase
    .from('retiradas_pedido')
    .insert([{ ...dados, pedido_id: pedidoId } as never])
    .select()
    .single();

  if (error) { console.error('createRetirada:', error); return { ok: false, erro: error.message }; }

  const itensComRetiradaId = itens.map(i => ({ ...i, retirada_id: (retirada as RetiradaPedido).id }));
  const { data: itensInseridos, error: errItens } = await supabase
    .from('retiradas_pedido_itens')
    .insert(itensComRetiradaId as never)
    .select(`*, itens_pedido ( id, produto_nome, largura, altura, quantidade, vidro_cliente, codigo_adicional, produtos ( unidade ) )`);

  if (errItens) {
    console.error('createRetirada itens:', errItens);
    await supabase.from('retiradas_pedido').delete().eq('id', (retirada as RetiradaPedido).id);
    return { ok: false, erro: errItens.message };
  }

  registrarLog({
    acao: "criou", tabela: "retiradas_pedido", registro_id: (retirada as RetiradaPedido).id,
    descricao: `Registrou retirada de ${itens.length} item(ns) do pedido ${pedidoId}`,
    campos_alterados: { pedido_id: pedidoId, motorista: dados.motorista, qtd_itens: itens.length },
  });

  return { ok: true, retirada: { ...(retirada as RetiradaPedido), retiradas_pedido_itens: itensInseridos as never } };
}

/** Substitui data/motorista/veículo e a lista de itens de uma retirada já registrada. */
export async function updateRetirada(
  retiradaId: string,
  pedidoId: string,
  dados: Omit<RetiradaPedidoInsert, 'pedido_id'>,
  itens: Array<Pick<RetiradaPedidoItemInsert, 'item_pedido_id' | 'quantidade' | 'obs'>>
): Promise<ResultadoRetirada> {
  if (itens.length === 0) return { ok: false, erro: 'Nenhum item informado' };

  // C5: valida quantidade excluindo a retirada que está sendo substituída
  const erroQtd = await _validarQuantidades(pedidoId, itens, retiradaId);
  if (erroQtd) return { ok: false, erro: erroQtd };

  const { error: errUpd } = await supabase.from('retiradas_pedido').update(dados as never).eq('id', retiradaId);
  if (errUpd) { console.error('updateRetirada:', errUpd); return { ok: false, erro: errUpd.message }; }

  const { error: errDel } = await supabase.from('retiradas_pedido_itens').delete().eq('retirada_id', retiradaId);
  if (errDel) { console.error('updateRetirada itens (delete):', errDel); return { ok: false, erro: errDel.message }; }

  const itensComRetiradaId = itens.map(i => ({ ...i, retirada_id: retiradaId }));
  const { data: itensInseridos, error: errIns } = await supabase
    .from('retiradas_pedido_itens')
    .insert(itensComRetiradaId as never)
    .select(`*, itens_pedido ( id, produto_nome, largura, altura, quantidade, vidro_cliente, codigo_adicional, produtos ( unidade ) )`);

  if (errIns) { console.error('updateRetirada itens (insert):', errIns); return { ok: false, erro: errIns.message }; }

  const { data: retiradaAtual } = await supabase.from('retiradas_pedido').select('*').eq('id', retiradaId).single();

  registrarLog({
    acao: "editou", tabela: "retiradas_pedido", registro_id: retiradaId,
    descricao: `Editou retirada do pedido ${pedidoId}`,
    campos_alterados: { motorista: dados.motorista, veiculo: dados.veiculo, qtd_itens: itens.length },
  });

  return { ok: true, retirada: { ...(retiradaAtual as RetiradaPedido), retiradas_pedido_itens: itensInseridos as never } };
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
