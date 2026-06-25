import { supabase } from '@/lib/supabase/client';
import { criarLancamentosParcelados } from './financeiro.service';
import { registrarLog } from './log.service';

function addMonthsStr(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

export type StatusOrcamento = 'Rascunho' | 'Enviado' | 'Aprovado' | 'Rejeitado';

export interface ItemOrcamentoInsert {
  orcamento_id: string;
  produto_id: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  quantidade: number;
  m2: number;
  valor_m2: number;
  desconto: number;
  lapidacao: number;
  subtotal: number;
}

export interface OrcamentoInsert {
  id: string;
  cliente_id: number;
  dt_orcamento: string;
  dt_validade?: string | null;
  dt_entrega?: string | null;
  forma_pgto?: string;
  conta?: string;
  parcelas?: number;
  frete?: string;
  obs?: string;
  m2_total: number;
  valor_total: number;
  desconto?: number;
  status?: StatusOrcamento;
}

export async function getOrcamentos(filtroStatus?: StatusOrcamento) {
  let query = supabase
    .from('orcamentos')
    .select(`*, clientes ( id, nome, cidade, tel )`)
    .order('created_at', { ascending: false });

  if (filtroStatus) query = query.eq('status', filtroStatus);

  const { data, error } = await query;
  if (error) { console.error('getOrcamentos:', error); return []; }
  return data;
}

export async function getOrcamentoById(id: string) {
  const { data, error } = await supabase
    .from('orcamentos')
    .select(`*, clientes ( * ), itens_orcamento ( *, produtos ( id, unidade ) )`)
    .eq('id', id)
    .single();

  if (error) { console.error('getOrcamentoById:', error); return null; }
  return data;
}

export async function createOrcamento(orcamento: OrcamentoInsert, itens: Omit<ItemOrcamentoInsert, 'orcamento_id'>[] = []) {
  const { data, error } = await supabase
    .from('orcamentos')
    .insert([orcamento as never])
    .select()
    .single();

  if (error) { console.error('createOrcamento:', error); return null; }

  if (itens.length > 0) {
    const itensComId = itens.map(i => ({ ...i, orcamento_id: (data as any).id }));
    const { error: errItens } = await supabase.from('itens_orcamento').insert(itensComId as never);
    if (errItens) console.error('createOrcamento itens:', errItens);
  }

  registrarLog({
    acao: "criou", tabela: "orcamentos", registro_id: (data as any).id,
    descricao: `Criou orçamento ${(data as any).id}`,
    campos_alterados: { cliente_id: orcamento.cliente_id, valor_total: orcamento.valor_total },
  });
  return data;
}

export async function updateOrcamento(id: string, updates: Partial<OrcamentoInsert>) {
  const { data, error } = await supabase
    .from('orcamentos')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select()
    .single();

  if (error) { console.error('updateOrcamento:', error); return null; }
  return data;
}

export async function aprovarOrcamento(orcamentoId: string) {
  const orc = await getOrcamentoById(orcamentoId);
  if (!orc) return null;

  // Se já tem pedido vinculado, só atualiza o status
  if (orc.pedido_id) {
    return updateOrcamento(orcamentoId, { status: 'Aprovado' } as any);
  }

  // Gera novo ID baseado no maior número existente
  const { data: todosPedidos } = await supabase
    .from('pedidos')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  let proximoNum = 1;
  if (todosPedidos && todosPedidos.length > 0) {
    const n = parseInt((todosPedidos[0] as any).id.replace('P-', ''), 10);
    if (!isNaN(n)) proximoNum = n + 1;
  }
  const pedidoId = `P-${String(proximoNum).padStart(3, '0')}`;

  const { data: pedido, error: errPedido } = await supabase
    .from('pedidos')
    .insert([{
      id: pedidoId,
      cliente_id: orc.cliente_id,
      dt_pedido: new Date().toISOString().split('T')[0],
      dt_retirada: orc.dt_entrega || null,
      m2_total: orc.m2_total,
      valor_total: orc.valor_total,
      valor_recebido: 0,
      status: 'Planejamento',
      forma_pgto: orc.forma_pgto || '',
      conta: orc.conta || '',
      parcelas: orc.parcelas || 1,
      obs: orc.obs || '',
    } as never])
    .select()
    .single();

  if (errPedido) { console.error('aprovarOrcamento pedido:', errPedido); return null; }

  if (orc.itens_orcamento?.length > 0) {
    const itensPedido = orc.itens_orcamento.map((i: any) => ({
      pedido_id: pedidoId,
      produto_id: i.produto_id,
      produto_nome: i.produto_nome,
      largura: i.largura,
      altura: i.altura,
      m2: i.m2,
      valor_m2: i.valor_m2,
      lapidacao: i.lapidacao,
      quantidade: i.quantidade,
      subtotal: i.subtotal,
    }));
    const { error: errItens } = await supabase.from('itens_pedido').insert(itensPedido as never);
    if (errItens) console.error('aprovarOrcamento itens_pedido:', errItens);
  }

  // Gerar parcelas com datas (mensal a partir de dt_entrega ou hoje)
  const n = orc.parcelas || 1;
  const valorParcela = parseFloat((orc.valor_total / n).toFixed(2));
  const primeiraData = orc.dt_entrega || new Date().toISOString().split("T")[0];
  const parcelasGeradas = Array.from({ length: n }, (_, i) => ({
    data: i === 0 ? primeiraData : addMonthsStr(primeiraData, i),
    valor: valorParcela,
  }));

  await supabase
    .from('pedidos')
    .update({
      datas_pgto:   parcelasGeradas.map(p => p.data),
      valores_pgto: parcelasGeradas.map(p => p.valor),
    } as never)
    .eq('id', pedidoId);

  await criarLancamentosParcelados({
    pedidoId,
    clienteId: orc.cliente_id,
    parcelas: parcelasGeradas,
  });

  await updateOrcamento(orcamentoId, {
    status: 'Aprovado',
    pedido_id: pedidoId,
  } as any);

  registrarLog({
    acao: "aprovou", tabela: "orcamentos", registro_id: orcamentoId,
    descricao: `Aprovou orçamento ${orcamentoId} → criou pedido ${pedidoId}`,
    campos_alterados: { status: { de: "Pendente/Enviado", para: "Aprovado" }, pedido_gerado: pedidoId },
  });
  return pedido;
}

export async function rejeitarOrcamento(
  orcamentoId: string,
  motivo?: string | null,
  obsRejeicao?: string | null,
) {
  const { data: orc, error } = await supabase
    .from('orcamentos')
    .select('id, pedido_id')
    .eq('id', orcamentoId)
    .single();

  if (error || !orc) { console.error('rejeitarOrcamento:', error); return null; }

  const pedidoId = (orc as any).pedido_id;

  if (pedidoId) {
    await supabase.from('lancamentos').delete().eq('pedido_id', pedidoId);
    await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoId);
    await supabase.from('pedidos').delete().eq('id', pedidoId);
  }

  const updates: Record<string, unknown> = { status: 'Rejeitado', pedido_id: null };
  if (motivo)       updates.motivo_rejeicao = motivo;
  if (obsRejeicao)  updates.obs_rejeicao    = obsRejeicao;

  const res = await updateOrcamento(orcamentoId, updates as any);
  if (res) registrarLog({
    acao: "rejeitou", tabela: "orcamentos", registro_id: orcamentoId,
    descricao: `Rejeitou orçamento ${orcamentoId}${motivo ? ` — ${motivo}` : ""}`,
    campos_alterados: { status: { de: "Pendente/Enviado", para: "Rejeitado" }, motivo },
  });
  return res;
}

export async function deletarOrcamento(orcamentoId: string): Promise<boolean> {
  const { data: orc } = await supabase
    .from('orcamentos')
    .select('id, pedido_id')
    .eq('id', orcamentoId)
    .single();

  const pedidoId = (orc as any)?.pedido_id;

  if (pedidoId) {
    await supabase.from('lancamentos').delete().eq('pedido_id', pedidoId);
    await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoId);
    await supabase.from('pedidos').delete().eq('id', pedidoId);
  }

  await supabase.from('itens_orcamento').delete().eq('orcamento_id', orcamentoId);

  const { error } = await supabase.from('orcamentos').delete().eq('id', orcamentoId);
  if (error) { console.error('deletarOrcamento:', error); return false; }
  registrarLog({ acao: "excluiu", tabela: "orcamentos", registro_id: orcamentoId, descricao: `Excluiu orçamento ${orcamentoId}` });
  return true;
}

// ─── Storage: orçamento assinado pelo cliente ───────────────
const BUCKET_ASSINADO = 'orcamentos-assinados';

export async function uploadArquivoAssinado(orcamentoId: string, file: File): Promise<string | null> {
  const ext  = file.name.split('.').pop() ?? 'pdf';
  const path = `${orcamentoId}/${Date.now()}_assinado.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_ASSINADO).upload(path, file, { upsert: false });
  if (error) { console.error('uploadArquivoAssinado:', error); return null; }
  const { data } = supabase.storage.from(BUCKET_ASSINADO).getPublicUrl(path);

  registrarLog({
    acao: "anexou", tabela: "orcamentos", registro_id: orcamentoId,
    descricao: `Anexou orçamento assinado em ${orcamentoId}`,
  });
  return data.publicUrl;
}

export async function deleteArquivoAssinado(url: string): Promise<boolean> {
  const marker = `/${BUCKET_ASSINADO}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return false;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET_ASSINADO).remove([path]);
  if (error) { console.error('deleteArquivoAssinado:', error); return false; }
  return true;
}

export async function getProximoIdOrcamento(): Promise<string> {
  const { data } = await supabase
    .from('orcamentos')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  let proximoNum = 1;
  if (data && data.length > 0) {
    const n = parseInt((data[0] as any).id.replace('ORC-', ''), 10);
    if (!isNaN(n)) proximoNum = n + 1;
  }
  return `ORC-${String(proximoNum).padStart(3, '0')}`;
}