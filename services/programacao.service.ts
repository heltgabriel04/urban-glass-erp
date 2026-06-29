import { supabase } from '@/lib/supabase/client';
import type {
  ProducaoLinha, ConfigTempoProducao, ProgramacaoProducao,
  ProgramacaoInsert, TempoEstimado, ItemPedido, Pedido, StatusPedido,
} from '@/types';

// ─── UTILITÁRIOS DE DATA ────────────────────────────────────

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Avança N dias úteis, pulando fins de semana e datas bloqueadas (feriados/manutenções)
export function addDiasUteis(date: Date, dias: number, bloqueados: Set<string> = new Set()): Date {
  let d = new Date(date);
  let restante = dias;
  while (restante > 0) {
    d = new Date(d.getTime() + 86400000);
    const dow = d.getDay();
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !bloqueados.has(iso)) restante--;
  }
  return d;
}

// Próximo dia útil a partir de uma data (pode ser a própria data se já for útil)
export function proximoDiaUtil(date: Date, bloqueados: Set<string> = new Set()): Date {
  let d = new Date(date);
  while (true) {
    const dow = d.getDay();
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !bloqueados.has(iso)) return d;
    d = new Date(d.getTime() + 86400000);
  }
}

export async function getCalendario(): Promise<Set<string>> {
  const ano = new Date().getFullYear();
  const { data } = await supabase
    .from('calendario_producao')
    .select('data')
    .gte('data', `${ano}-01-01`)
    .lte('data', `${ano + 1}-12-31`);
  return new Set((data ?? []).map((r: { data: string }) => r.data));
}

async function getUsuario(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? user?.id ?? 'sistema';
}

export function toISOLocal(date: Date): string {
  return date.toISOString();
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(8, 0, 0, 0);
  return d;
}

// Compara apenas a parte da data, ignorando horas — evita off-by-one por fuso
export function diffDays(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── ESTIMATIVA DE TEMPO ────────────────────────────────────

function isVidroEspecial(nome: string): boolean {
  return /laminado/i.test(nome);
}

export function calcularTempoEstimado(
  itens: Pick<ItemPedido, 'm2' | 'quantidade' | 'lapidacao' | 'produto_nome'>[],
  config: ConfigTempoProducao[],
): TempoEstimado {
  const cfgCorte = config.find(c => c.etapa === 'Corte');
  const cfgLap   = config.find(c => c.etapa === 'Lapidação');

  let corte_min = 0;
  let lapidacao_min = 0;
  let tem_lapidacao = false;

  for (const item of itens) {
    const especial = isVidroEspecial(item.produto_nome);

    if (cfgCorte) {
      const fator = especial ? cfgCorte.fator_vidro_especial : 1.0;
      corte_min += (item.m2 * cfgCorte.min_por_m2 + item.quantidade * cfgCorte.min_por_peca) * fator;
    }

    if (cfgLap && item.lapidacao > 0) {
      tem_lapidacao = true;
      const fator = especial ? cfgLap.fator_vidro_especial : 1.0;
      lapidacao_min += (item.m2 * cfgLap.min_por_m2 + item.quantidade * cfgLap.min_por_lapidacao) * fator;
    }
  }

  if (cfgCorte) corte_min = Math.max(cfgCorte.setup_pedido_min, corte_min + cfgCorte.setup_pedido_min);
  if (cfgLap && tem_lapidacao) lapidacao_min = lapidacao_min + cfgLap.setup_pedido_min;

  return {
    corte_min: Math.round(corte_min),
    lapidacao_min: Math.round(lapidacao_min),
    total_min: Math.round(corte_min + lapidacao_min),
    tem_lapidacao,
  };
}

export function formatarDuracao(min: number): string {
  if (min <= 0) return '—';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ─── CHAPA INTEIRA — DETECÇÃO AUTOMÁTICA ────────────────────

type ItemComDimensoes = {
  quantidade: number; lapidacao: number; produto_nome: string; m2: number;
  largura?: number; altura?: number;
  produtos?: { chapa_largura_mm: number | null; chapa_altura_mm: number | null } | null;
};

function isItemChapaInteira(item: ItemComDimensoes): boolean {
  const cw = item.produtos?.chapa_largura_mm;
  const ch = item.produtos?.chapa_altura_mm;
  if (!cw || !ch || !item.largura || !item.altura) return false;
  const tol = 0.05;
  const norm = (v: number, ref: number) => Math.abs(v - ref) / ref < tol;
  return (norm(item.largura, cw) && norm(item.altura, ch))
      || (norm(item.largura, ch) && norm(item.altura, cw));
}

export function isPedidoSomenteChapas(pedido: { itens_pedido?: unknown[] }): boolean {
  const itens = (pedido.itens_pedido ?? []) as ItemComDimensoes[];
  return itens.length > 0 && itens.every(isItemChapaInteira);
}

// ─── LINHAS DE PRODUÇÃO ─────────────────────────────────────

export async function getLinhas(): Promise<ProducaoLinha[]> {
  const { data, error } = await supabase
    .from('producao_linhas')
    .select('*')
    .eq('ativo', true)
    .order('id');
  if (error) {
    console.error('[APS] getLinhas erro:', error.code, error.message, error.hint ?? '');
    return [];
  }
  return data as ProducaoLinha[];
}

export async function getConfigTempo(): Promise<ConfigTempoProducao[]> {
  const { data, error } = await supabase.from('config_tempo_producao').select('*');
  if (error) { console.error('getConfigTempo:', error); return []; }
  return data as ConfigTempoProducao[];
}

export async function salvarConfigTempo(etapa: string, updates: Partial<ConfigTempoProducao>): Promise<boolean> {
  const { error } = await supabase
    .from('config_tempo_producao')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('etapa', etapa);
  return !error;
}

// ─── PROGRAMAÇÃO ────────────────────────────────────────────

export async function getProgramacao(from: Date, to: Date): Promise<ProgramacaoProducao[]> {
  const { data, error } = await supabase
    .from('programacao_producao')
    .select(`
      *,
      producao_linhas ( nome, cor, tipo ),
      pedidos (
        id, dt_retirada, m2_total, status, obs,
        clientes ( nome, cidade ),
        itens_pedido ( id, quantidade, lapidacao, produto_nome, m2 )
      )
    `)
    .gte('dt_inicio_previsto', from.toISOString())
    .lte('dt_inicio_previsto', to.toISOString())
    .neq('status', 'Cancelado')
    .order('dt_inicio_previsto');
  if (error) { console.error('getProgramacao:', error); return []; }
  return data as ProgramacaoProducao[];
}

export async function getPedidosSemProgramacao(): Promise<Pedido[]> {
  const STATUS_ATIVOS: StatusPedido[] = [
    'Aguardando otimização',
    'Em Produção – Corte',
    'Qualidade (Corte)',
    'Em Produção – Lapidação',
    'Qualidade (Lapidação)',
    'Separação',
  ];

  const { data: jaProgIds } = await supabase
    .from('programacao_producao')
    .select('pedido_id')
    .not('status', 'eq', 'Cancelado');

  const idsJaProg = [...new Set((jaProgIds ?? []).map((r: { pedido_id: string }) => r.pedido_id))];

  let query = supabase
    .from('pedidos')
    .select(`id, dt_pedido, dt_retirada, m2_total, valor_total, status, obs,
      clientes ( nome, cidade ),
      itens_pedido ( id, quantidade, lapidacao, produto_nome, m2, largura, altura, produtos ( chapa_largura_mm, chapa_altura_mm ) )
    `)
    .in('status', STATUS_ATIVOS)
    .order('dt_retirada', { ascending: true, nullsFirst: false });

  if (idsJaProg.length > 0 && idsJaProg.length <= 200) {
    query = query.not('id', 'in', `(${idsJaProg.join(',')})`);
  }

  const { data, error } = await query;
  if (error) { console.error('getPedidosSemProgramacao:', error); return []; }

  const todos = (data as unknown as Pedido[]) ?? [];
  // Filtragem local como fallback para >200 IDs
  if (idsJaProg.length > 200) {
    const progSet = new Set(idsJaProg);
    return todos.filter(p => !progSet.has(p.id));
  }
  return todos;
}

// Retorna pedidos com entrega nos próximos N dias para a visão de expedição
export async function getPedidosExpedicao(dias = 7): Promise<Pedido[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ate = addDays(hoje, dias);

  const { data, error } = await supabase
    .from('pedidos')
    .select(`id, dt_pedido, dt_retirada, m2_total, valor_total, status, obs,
      clientes ( nome, cidade ),
      itens_pedido ( id, quantidade, lapidacao, produto_nome, m2 )
    `)
    .gte('dt_retirada', hoje.toISOString())
    .lte('dt_retirada', ate.toISOString())
    .not('status', 'in', '("Cancelado","Finalizado")')
    .order('dt_retirada', { ascending: true });

  if (error) { console.error('getPedidosExpedicao:', error); return []; }
  return data as unknown as Pedido[];
}

// Retorna o atual e o próximo pedido por linha para o modo TV
export async function getProgramacaoTV(): Promise<
  Record<number, { linha: ProducaoLinha; atual: ProgramacaoProducao | null; proximo: ProgramacaoProducao | null }>
> {
  const linhas = await getLinhas();
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to   = addDays(from, 3);
  const progs = await getProgramacao(from, to);

  const result: Record<number, { linha: ProducaoLinha; atual: ProgramacaoProducao | null; proximo: ProgramacaoProducao | null }> = {};

  for (const linha of linhas) {
    const blocos = progs
      .filter(p => p.linha_id === linha.id && p.status !== 'Cancelado' && p.status !== 'Concluído')
      .sort((a, b) => new Date(a.dt_inicio_previsto!).getTime() - new Date(b.dt_inicio_previsto!).getTime());

    const emExecucao = blocos.find(p => p.status === 'Em Execução');
    const agendados  = blocos.filter(p => p.status === 'Agendado');

    result[linha.id] = {
      linha,
      atual:   emExecucao ?? agendados[0] ?? null,
      proximo: emExecucao ? agendados[0] ?? null : agendados[1] ?? null,
    };
  }

  return result;
}

// Verifica se existe sobreposição de horário na linha antes de inserir
export async function verificarConflito(
  linhaId: number,
  dtInicio: Date,
  dtFim: Date,
  excluirId?: string,
): Promise<{ conflito: boolean; pedidoConflitante?: string }> {
  let q = supabase
    .from('programacao_producao')
    .select('id, pedido_id')
    .eq('linha_id', linhaId)
    .neq('status', 'Cancelado')
    .neq('status', 'Concluído')
    .lt('dt_inicio_previsto', dtFim.toISOString())
    .gt('dt_fim_previsto', dtInicio.toISOString());

  if (excluirId) q = (q as any).neq('id', excluirId);

  const { data } = await q;
  if (!data || data.length === 0) return { conflito: false };
  return { conflito: true, pedidoConflitante: (data[0] as any).pedido_id };
}

export async function criarProgramacaoPedido(
  pedidoId: string,
  itens: Pick<ItemPedido, 'm2' | 'quantidade' | 'lapidacao' | 'produto_nome'>[],
  config: ConfigTempoProducao[],
  linhas: ProducaoLinha[],
  dtInicioCorte: Date,
  linhaCorteId: number,
  linhaLapId?: number,
  diasBloqueados: Set<string> = new Set(),
): Promise<{ ok: boolean; erro?: string }> {
  const tempos = calcularTempoEstimado(itens, config);

  const dtInicioUtil = proximoDiaUtil(dtInicioCorte, diasBloqueados);
  const linhaCorte   = linhas.find(l => l.id === linhaCorteId);
  const minsDia      = (linhaCorte?.capacidade_horas_dia ?? 8) * 60;
  const diasCorte    = Math.ceil(tempos.corte_min / minsDia);
  const dtFimCorte   = addDiasUteis(dtInicioUtil, Math.max(1, diasCorte), diasBloqueados);

  // Detecta conflito antes de inserir
  const confCorte = await verificarConflito(linhaCorteId, dtInicioUtil, dtFimCorte);
  if (confCorte.conflito) {
    return { ok: false, erro: `Linha de corte já possui o pedido ${confCorte.pedidoConflitante} neste período.` };
  }

  const registros: ProgramacaoInsert[] = [{
    pedido_id: pedidoId,
    linha_id: linhaCorteId,
    etapa: 'Corte',
    sequencia: 0,
    dt_inicio_previsto: toISOLocal(dtInicioUtil),
    dt_fim_previsto: toISOLocal(dtFimCorte),
    duracao_estimada_min: tempos.corte_min,
    responsavel: null,
    obs: null,
  }];

  if (tempos.tem_lapidacao && linhaLapId) {
    const dtInicioLap = proximoDiaUtil(addDays(dtFimCorte, 1), diasBloqueados);
    const linhaLap    = linhas.find(l => l.id === linhaLapId);
    const diasLap     = Math.ceil(tempos.lapidacao_min / ((linhaLap?.capacidade_horas_dia ?? 8) * 60));
    const dtFimLap    = addDiasUteis(dtInicioLap, Math.max(1, diasLap), diasBloqueados);

    const confLap = await verificarConflito(linhaLapId, dtInicioLap, dtFimLap);
    if (confLap.conflito) {
      return { ok: false, erro: `Linha de lapidação já possui o pedido ${confLap.pedidoConflitante} neste período.` };
    }

    registros.push({
      pedido_id: pedidoId,
      linha_id: linhaLapId,
      etapa: 'Lapidação',
      sequencia: 1,
      dt_inicio_previsto: toISOLocal(dtInicioLap),
      dt_fim_previsto: toISOLocal(dtFimLap),
      duracao_estimada_min: tempos.lapidacao_min,
      responsavel: null,
      obs: null,
    });
  }

  const { error } = await supabase.from('programacao_producao').insert(registros);
  if (error) { console.error('criarProgramacaoPedido:', error); return { ok: false, erro: error.message }; }

  const usuario = await getUsuario();
  await supabase.from('programacao_historico').insert(
    registros.map(r => ({
      pedido_id: pedidoId,
      tipo_alteracao: 'agendamento',
      dados_anteriores: null,
      dados_novos: r as unknown as Record<string, unknown>,
      motivo: null,
      usuario,
    }))
  );

  return { ok: true };
}

export async function reagendar(
  progId: string,
  novaDtInicio: Date,
  duracaoMin: number,
  novaLinhaId?: number,
  motivo?: string,
): Promise<boolean> {
  const novaDtFim = new Date(novaDtInicio.getTime() + duracaoMin * 60000);

  const { data: antes } = await supabase
    .from('programacao_producao')
    .select('dt_inicio_previsto, dt_fim_previsto, linha_id')
    .eq('id', progId)
    .single();

  const updates: Partial<ProgramacaoProducao> = {
    dt_inicio_previsto: toISOLocal(novaDtInicio),
    dt_fim_previsto: toISOLocal(novaDtFim),
    duracao_estimada_min: duracaoMin,
  };
  if (novaLinhaId !== undefined) updates.linha_id = novaLinhaId;

  const { error } = await supabase
    .from('programacao_producao')
    .update(updates)
    .eq('id', progId);

  if (error) { console.error('reagendar:', error); return false; }

  const usuario = await getUsuario();
  await supabase.from('programacao_historico').insert({
    programacao_id: progId,
    pedido_id: null,
    tipo_alteracao: 'reagendamento',
    dados_anteriores: antes as unknown as Record<string, unknown>,
    dados_novos: updates as unknown as Record<string, unknown>,
    motivo: motivo ?? null,
    usuario,
  });

  return true;
}

// Mapeamento: (etapa, novoStatusProg) → novo status do pedido
function mapearStatusPedido(
  etapa: string,
  novoStatus: ProgramacaoProducao['status'],
): StatusPedido | null {
  if (novoStatus === 'Em Execução') {
    if (etapa === 'Corte')              return 'Em Produção – Corte';
    if (etapa === 'Lapidação')          return 'Em Produção – Lapidação';
    if (etapa === 'Retirada de Chapa')  return 'Separação';
  }
  if (novoStatus === 'Concluído') {
    if (etapa === 'Corte')              return 'Qualidade (Corte)';
    if (etapa === 'Lapidação')          return 'Qualidade (Lapidação)';
    if (etapa === 'Retirada de Chapa')  return 'Finalizado';
    if (etapa === 'Separação')          return 'Finalizado';
  }
  return null;
}

export async function atualizarStatusProgramacao(
  progId: string,
  status: ProgramacaoProducao['status'],
  dtReal?: Date,
): Promise<boolean> {
  // Busca a prog atual para saber etapa e pedido_id
  const { data: prog } = await supabase
    .from('programacao_producao')
    .select('pedido_id, etapa')
    .eq('id', progId)
    .single();

  const updates: Partial<ProgramacaoProducao> = { status };
  if (status === 'Em Execução' && dtReal) updates.dt_inicio_real = toISOLocal(dtReal);
  if (status === 'Concluído'   && dtReal) updates.dt_fim_real    = toISOLocal(dtReal);

  const { error } = await supabase
    .from('programacao_producao')
    .update(updates)
    .eq('id', progId);

  if (error) return false;

  // Sincroniza pedidos.status automaticamente
  if (prog) {
    const novoStatusPedido = mapearStatusPedido(prog.etapa, status);
    if (novoStatusPedido) {
      await supabase
        .from('pedidos')
        .update({ status: novoStatusPedido })
        .eq('id', prog.pedido_id);
    }
  }

  return true;
}

export async function deletarProgramacao(progId: string): Promise<boolean> {
  const { error } = await supabase.from('programacao_producao').delete().eq('id', progId);
  return !error;
}

// ─── CHAPA INTEIRA — AGENDAMENTO ────────────────────────────

export async function agendarChapaInteira(
  pedidoId: string,
  pecasTotal: number,
  linhas: ProducaoLinha[],
  dtRetirada: Date,
  diasBloqueados: Set<string> = new Set(),
): Promise<{ ok: boolean; erro?: string }> {
  const linhaSep = linhas.find(l => l.tipo === 'Separação');
  if (!linhaSep) return { ok: false, erro: 'Linha de Separação não encontrada. Execute o script SQL.' };

  const dtInicio = proximoDiaUtil(dtRetirada, diasBloqueados);
  const duracao  = Math.max(30, pecasTotal * 5);
  const dtFim    = new Date(dtInicio.getTime() + duracao * 60000);

  const { error } = await supabase.from('programacao_producao').insert({
    pedido_id: pedidoId,
    linha_id: linhaSep.id,
    etapa: 'Retirada de Chapa',
    sequencia: 0,
    dt_inicio_previsto: toISOLocal(dtInicio),
    dt_fim_previsto: toISOLocal(dtFim),
    duracao_estimada_min: duracao,
    responsavel: null,
    obs: null,
  });

  if (error) { console.error('agendarChapaInteira:', error); return { ok: false, erro: error.message }; }
  return { ok: true };
}

// ─── RETIRADAS PARCIAIS ──────────────────────────────────────

export interface RetiradaParcial {
  id: string;
  programacao_id: string;
  pedido_id: string;
  dt_retirada: string;
  pecas_retiradas: number;
  obs: string | null;
  created_at: string;
}

export async function registrarRetiradaParcial(
  programacaoId: string,
  pedidoId: string,
  pecasRetiradas: number,
  obs?: string,
): Promise<boolean> {
  const { error } = await supabase.from('programacao_retiradas').insert({
    programacao_id: programacaoId,
    pedido_id: pedidoId,
    dt_retirada: new Date().toISOString().slice(0, 10),
    pecas_retiradas: pecasRetiradas,
    obs: obs ?? null,
  });
  if (error) { console.error('registrarRetiradaParcial:', error); return false; }
  return true;
}

export async function getRetiradas(programacaoId: string): Promise<RetiradaParcial[]> {
  const { data, error } = await supabase
    .from('programacao_retiradas')
    .select('*')
    .eq('programacao_id', programacaoId)
    .order('dt_retirada', { ascending: true });
  if (error) { console.error('getRetiradas:', error); return []; }
  return data as RetiradaParcial[];
}

// ─── MÉTRICAS PARA DASHBOARD ────────────────────────────────

export interface MetricasProducao {
  totalProgramados: number;
  emExecucao: number;
  concluidos: number;
  atrasados: number;
  emRisco: number;
  noTempo: number;
  m2Programado: number;
  m2Concluido: number;
  pecasProgramadas: number;
  taxaAtraso: number;
  tempoMedioCorte: number;
  tempoMedioLapidacao: number;
  capacidadePorLinha: Array<{ nome: string; horasOcupadas: number; horasDisponiveis: number; pct: number; cor: string; }>;
  vencemHoje: number;
  vencemSemana: number;
  histReprogramacoes: number;
}

export async function getMetricasProducao(from: Date, to: Date): Promise<MetricasProducao> {
  const progs = await getProgramacao(from, to);
  const hoje  = new Date(); hoje.setHours(23, 59, 59, 0);
  const semana = addDays(hoje, 7);

  let atrasados = 0, emRisco = 0, noTempo = 0;
  let m2Prog = 0, m2Conc = 0, pecas = 0;
  let somaCorte = 0, qtdCorte = 0, somaLap = 0, qtdLap = 0;
  let vencemHoje = 0, vencemSemana = 0;

  for (const p of progs) {
    const prazo = p.pedidos?.dt_retirada ? new Date(p.pedidos.dt_retirada) : null;
    const fim   = p.dt_fim_previsto      ? new Date(p.dt_fim_previsto)     : null;
    m2Prog += p.pedidos?.m2_total ?? 0;
    pecas  += (p.pedidos?.itens_pedido ?? []).reduce((s, i) => s + i.quantidade, 0);

    if (p.status === 'Concluído') m2Conc += p.pedidos?.m2_total ?? 0;

    if (prazo && fim) {
      const diff = diffDays(prazo, fim);
      if (diff < 0) atrasados++;
      else if (diff <= 2) emRisco++;
      else noTempo++;
      if (prazo <= hoje)  vencemHoje++;
      else if (prazo <= semana) vencemSemana++;
    }

    if (p.etapa === 'Corte'     && p.duracao_estimada_min) { somaCorte += p.duracao_estimada_min; qtdCorte++; }
    if (p.etapa === 'Lapidação' && p.duracao_estimada_min) { somaLap   += p.duracao_estimada_min; qtdLap++;   }
  }

  const { count: histReprog } = await supabase
    .from('programacao_historico')
    .select('*', { count: 'exact', head: true })
    .eq('tipo_alteracao', 'reagendamento')
    .gte('created_at', from.toISOString());

  const linhas = await getLinhas();
  const diasPeriodo = Math.max(1, diffDays(to, from));
  const capacidadePorLinha = linhas.map(l => {
    const horasDisponiveis = l.capacidade_horas_dia * diasPeriodo;
    const minOcupados = progs
      .filter(p => p.linha_id === l.id && p.status !== 'Cancelado')
      .reduce((s, p) => s + (p.duracao_estimada_min ?? 0), 0);
    const horasOcupadas = Math.round(minOcupados / 60 * 10) / 10;
    return {
      nome: l.nome,
      cor: l.cor,
      horasOcupadas,
      horasDisponiveis,
      pct: Math.min(100, Math.round((horasOcupadas / horasDisponiveis) * 100)),
    };
  });

  return {
    totalProgramados: progs.length,
    emExecucao: progs.filter(p => p.status === 'Em Execução').length,
    concluidos:  progs.filter(p => p.status === 'Concluído').length,
    atrasados, emRisco, noTempo,
    m2Programado: Math.round(m2Prog * 100) / 100,
    m2Concluido:  Math.round(m2Conc * 100) / 100,
    pecasProgramadas: pecas,
    taxaAtraso: progs.length > 0 ? Math.round((atrasados / progs.length) * 100) : 0,
    tempoMedioCorte: qtdCorte > 0 ? Math.round(somaCorte / qtdCorte) : 0,
    tempoMedioLapidacao: qtdLap > 0 ? Math.round(somaLap   / qtdLap)   : 0,
    capacidadePorLinha,
    vencemHoje,
    vencemSemana,
    histReprogramacoes: histReprog ?? 0,
  };
}
