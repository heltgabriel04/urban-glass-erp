import { supabase } from '@/lib/supabase/client';
import type {
  NaoConformidade, NaoConformidadeInsert, NaoConformidadeUpdate,
  HistoricoNC, HistoricoNCInsert,
  Quebra, QuebraInsert, QuebraUpdate,
  Retrabalho, RetrabalhoInsert, RetrabalhoUpdate,
  IndicadorQualidadeMensal,
  StatusNaoConformidade,
} from '@/types';
import { createLancamento } from './financeiro.service';
import { baixarChapasEstoque } from './estoque.service';
import { registrarLog } from './log.service';

// ─── Sequência de código NC ────────────────────────────────
export async function getProximoCodigoNC(): Promise<string> {
  const { count } = await supabase
    .from('nao_conformidades')
    .select('id', { count: 'exact', head: true });
  const num = ((count ?? 0) + 1).toString().padStart(4, '0');
  return `NC-${num}`;
}

// ─── CRUD Não Conformidades ────────────────────────────────
export async function getNaoConformidades(filtros?: {
  status?: StatusNaoConformidade;
  pedido_id?: string;
  gravidade?: string;
}): Promise<NaoConformidade[]> {
  let q = supabase
    .from('nao_conformidades')
    .select('*, pedidos(id), clientes(id, nome)')
    .order('created_at', { ascending: false });
  if (filtros?.status)    q = q.eq('status', filtros.status);
  if (filtros?.pedido_id) q = q.eq('pedido_id', filtros.pedido_id);
  if (filtros?.gravidade) q = q.eq('gravidade', filtros.gravidade);
  const { data, error } = await q;
  if (error) { console.error('getNaoConformidades:', error); return []; }
  return (data ?? []) as NaoConformidade[];
}

export async function getNaoConformidadeById(id: number): Promise<NaoConformidade | null> {
  const { data, error } = await supabase
    .from('nao_conformidades')
    .select('*, pedidos(id), clientes(id, nome)')
    .eq('id', id)
    .single();
  if (error) { console.error('getNaoConformidadeById:', error); return null; }
  return data as NaoConformidade;
}

export async function getNaoConformidadesPorPedido(pedidoId: string): Promise<NaoConformidade[]> {
  const { data, error } = await supabase
    .from('nao_conformidades')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getNaoConformidadesPorPedido:', error); return []; }
  return (data ?? []) as NaoConformidade[];
}

export async function createNaoConformidade(
  payload: NaoConformidadeInsert
): Promise<NaoConformidade | null> {
  const codigo = await getProximoCodigoNC();
  const { data, error } = await supabase
    .from('nao_conformidades')
    .insert([{ ...payload, codigo } as never])
    .select()
    .single();
  if (error) { console.error('createNaoConformidade:', error); return null; }
  registrarLog({ acao: 'criar_nc', tabela: 'nao_conformidades', descricao: `NC ${codigo} aberta — ${payload.tipo}`, registro_id: String(data.id) });
  return data as NaoConformidade;
}

export async function updateNaoConformidade(
  id: number,
  updates: NaoConformidadeUpdate,
  usuario?: string,
  obs?: string
): Promise<NaoConformidade | null> {
  // Busca o estado anterior para histórico
  const anterior = await getNaoConformidadeById(id);
  const { data, error } = await supabase
    .from('nao_conformidades')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateNaoConformidade:', error); return null; }

  // Grava linha de histórico para cada campo alterado
  if (anterior) {
    const campos = Object.keys(updates) as (keyof NaoConformidadeUpdate)[];
    for (const campo of campos) {
      const vAnterior = String(anterior[campo as keyof NaoConformidade] ?? '');
      const vNovo     = String(updates[campo] ?? '');
      if (vAnterior !== vNovo) {
        await addHistoricoNC({ nc_id: id, usuario: usuario ?? null, campo_alterado: campo, valor_anterior: vAnterior, valor_novo: vNovo, obs: obs ?? null });
      }
    }
  }
  return data as NaoConformidade;
}

// ─── Histórico de NC ───────────────────────────────────────
export async function getHistoricoNC(ncId: number): Promise<HistoricoNC[]> {
  const { data, error } = await supabase
    .from('historico_nc')
    .select('*')
    .eq('nc_id', ncId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getHistoricoNC:', error); return []; }
  return (data ?? []) as HistoricoNC[];
}

export async function addHistoricoNC(payload: HistoricoNCInsert): Promise<boolean> {
  const { error } = await supabase.from('historico_nc').insert([payload as never]);
  if (error) { console.error('addHistoricoNC:', error); return false; }
  return true;
}

// ─── CRUD Quebras ──────────────────────────────────────────
export async function getQuebras(filtros?: {
  pedido_id?: string;
  responsavel?: string;
  setor?: string;
}): Promise<Quebra[]> {
  let q = supabase
    .from('quebras')
    .select('*, pedidos(id), clientes(id, nome)')
    .order('dt_quebra', { ascending: false });
  if (filtros?.pedido_id)   q = q.eq('pedido_id', filtros.pedido_id);
  if (filtros?.responsavel) q = q.eq('responsavel', filtros.responsavel);
  if (filtros?.setor)       q = q.eq('setor', filtros.setor);
  const { data, error } = await q;
  if (error) { console.error('getQuebras:', error); return []; }
  return (data ?? []) as Quebra[];
}

export async function createQuebra(payload: QuebraInsert): Promise<Quebra | null> {
  const { data, error } = await supabase
    .from('quebras')
    .insert([payload as never])
    .select()
    .single();
  if (error) { console.error('createQuebra:', error); return null; }
  registrarLog({ acao: 'criar_quebra', tabela: 'quebras', descricao: `Quebra registrada — ${payload.produto_nome} ${payload.m2_perdido}m²`, registro_id: String(data.id) });
  return data as Quebra;
}

export async function confirmarBaixaEstoqueQuebra(quebraId: number): Promise<boolean> {
  const { data: q, error } = await supabase
    .from('quebras')
    .select('*')
    .eq('id', quebraId)
    .single();
  if (error || !q) return false;
  if (q.baixa_estoque) return true; // já executada

  // Baixa no estoque
  const ok = await baixarChapasEstoque(
    q.produto_nome,
    0,                      // chapas inteiras: não se aplica
    Number(q.m2_perdido),
  );
  if (!ok) return false;

  // Lançamento de saída financeira
  if (q.valor_perda && Number(q.valor_perda) > 0) {
    await createLancamento({
      tipo: 'Saída',
      descricao: `Perda de material — Quebra #${quebraId} — ${q.produto_nome}`,
      valor: Number(q.valor_perda),
      status: 'Pago',
      vencimento: (q.dt_quebra as string).substring(0, 10),
      pedido_id: q.pedido_id ?? null,
      cliente_id: q.cliente_id ?? null,
    });
  }

  // Marca baixa executada
  await supabase.from('quebras').update({ baixa_estoque: true } as never).eq('id', quebraId);
  registrarLog({ acao: 'baixa_estoque_quebra', tabela: 'quebras', descricao: `Baixa estoque executada para Quebra #${quebraId}`, registro_id: String(quebraId) });
  return true;
}

// ─── CRUD Retrabalhos ──────────────────────────────────────
export async function getRetrabalhos(filtros?: {
  pedido_id?: string;
  status?: string;
}): Promise<Retrabalho[]> {
  let q = supabase
    .from('retrabalhos')
    .select('*, pedidos(id), clientes(id, nome)')
    .order('dt_retrabalho', { ascending: false });
  if (filtros?.pedido_id) q = q.eq('pedido_id', filtros.pedido_id);
  if (filtros?.status)    q = q.eq('status', filtros.status);
  const { data, error } = await q;
  if (error) { console.error('getRetrabalhos:', error); return []; }
  return (data ?? []) as Retrabalho[];
}

export async function createRetrabalho(payload: RetrabalhoInsert): Promise<Retrabalho | null> {
  const { data, error } = await supabase
    .from('retrabalhos')
    .insert([payload as never])
    .select()
    .single();
  if (error) { console.error('createRetrabalho:', error); return null; }
  registrarLog({ acao: 'criar_retrabalho', tabela: 'retrabalhos', descricao: `Retrabalho registrado — ${payload.motivo}`, registro_id: String(data.id) });
  return data as Retrabalho;
}

export async function updateRetrabalho(id: number, updates: RetrabalhoUpdate): Promise<Retrabalho | null> {
  const { data, error } = await supabase
    .from('retrabalhos')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateRetrabalho:', error); return null; }
  return data as Retrabalho;
}

// ─── Indicadores ──────────────────────────────────────────
export async function getIndicadoresMensais(): Promise<IndicadorQualidadeMensal[]> {
  const { data, error } = await supabase
    .from('view_indicadores_qualidade_mensal')
    .select('*')
    .order('mes', { ascending: true });
  if (error) { console.error('getIndicadoresMensais:', error); return []; }
  return (data ?? []) as IndicadorQualidadeMensal[];
}

export async function getResumoQualidade(): Promise<{
  ncsAbertas: number;
  ncsCriticas: number;
  m2PerdidoMes: number;
  valorPerdidoMes: number;
  retrabalhosAbertos: number;
}> {
  const mesAtual = new Date().toISOString().substring(0, 7); // 2026-06

  const [{ count: abertas }, { count: criticas }, quebrasRes, { count: retrabAtivos }] =
    await Promise.all([
      supabase.from('nao_conformidades').select('id', { count: 'exact', head: true }).in('status', ['Aberta', 'Em Análise', 'Aguardando Correção']),
      supabase.from('nao_conformidades').select('id', { count: 'exact', head: true }).eq('gravidade', 'Crítica').in('status', ['Aberta', 'Em Análise', 'Aguardando Correção']),
      supabase.from('quebras').select('m2_perdido, valor_perda').gte('dt_quebra', mesAtual + '-01'),
      supabase.from('retrabalhos').select('id', { count: 'exact', head: true }).in('status', ['Pendente', 'Em Execução']),
    ]);

  const m2Mes    = (quebrasRes.data ?? []).reduce((a: number, q: any) => a + Number(q.m2_perdido), 0);
  const valorMes = (quebrasRes.data ?? []).reduce((a: number, q: any) => a + Number(q.valor_perda ?? 0), 0);

  return {
    ncsAbertas:        abertas ?? 0,
    ncsCriticas:       criticas ?? 0,
    m2PerdidoMes:      m2Mes,
    valorPerdidoMes:   valorMes,
    retrabalhosAbertos: retrabAtivos ?? 0,
  };
}

// ─── Storage: fotos de NCs ─────────────────────────────────
const BUCKET = 'nc-fotos';

export async function uploadFotosNC(ncId: number, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${ncId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) { console.error('uploadFotoNC:', error); continue; }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

export async function deleteFotoNC(url: string): Promise<boolean> {
  const marker = `/${BUCKET}/`;
  const idx    = url.indexOf(marker);
  if (idx === -1) return false;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) { console.error('deleteFotoNC:', error); return false; }
  return true;
}
