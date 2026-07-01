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

// Soma a duração de Corte item a item — cada item paga seu próprio setup,
// que é como criarProgramacaoPedido() realmente grava os blocos no banco
// (um insert por item). Usar calcularTempoEstimado(itens, config) direto
// (setup cobrado uma única vez pro pedido inteiro) sub-estima a duração real
// pra pedidos com mais de um item — usado no motor de recálculo pra a prévia
// não divergir do que fica gravado depois de aplicar.
export function duracaoTotalCorte(
  itens: Pick<ItemPedido, 'm2' | 'quantidade' | 'lapidacao' | 'produto_nome'>[],
  config: ConfigTempoProducao[],
): number {
  return itens.reduce((soma, item) => soma + calcularTempoEstimado([item], config).corte_min, 0);
}

// ─── PRIORIZAÇÃO (APS) ──────────────────────────────────────
// Fase 1 do motor de agendamento: calcula um score de prioridade por pedido
// pendente, combinando prazo de entrega + trabalho restante (folga real,
// não só "dias até o prazo") — ver proposta do módulo de Programação.

export interface PrioridadeInfo {
  score: number;
  folgaHoras: number;          // horas de folga até o prazo, descontado o trabalho restante. Negativo = já atrasado.
  diasParaPrazo: number | null;
  atrasado: boolean;
  emRisco: boolean;            // no prazo, mas com folga menor que 1 dia útil de produção
}

// Núcleo do cálculo de prioridade — separado de calcularPrioridadePedido pra
// poder ser reaproveitado direto com uma duração já conhecida (ex.: um bloco
// já agendado no motor de recálculo, Fase 3), sem precisar forjar uma lista
// de itens só pra chegar num número de minutos.
export function scoreDePrioridade(
  dtRetirada: string | null,
  horasTrabalhoRestante: number,
  agora: Date = new Date(),
): PrioridadeInfo {
  if (!dtRetirada) {
    return { score: 0, folgaHoras: Infinity, diasParaPrazo: null, atrasado: false, emRisco: false };
  }

  const prazo = new Date(dtRetirada);
  const horasAtePrazo = (prazo.getTime() - agora.getTime()) / 3_600_000;
  const folgaHoras = horasAtePrazo - horasTrabalhoRestante;
  const atrasado = folgaHoras < 0;
  const emRisco = !atrasado && folgaHoras < 8; // menos de 1 dia útil de produção sobrando

  // Atrasados sempre ficam acima de qualquer pedido no prazo; entre eles, o
  // mais atrasado (folga mais negativa) vem primeiro. No prazo, quanto menor
  // a folga, maior o score.
  const score = atrasado
    ? 10_000 + Math.abs(folgaHoras)
    : Math.max(0, 1_000 - folgaHoras);

  return { score, folgaHoras, diasParaPrazo: diffDays(prazo, agora), atrasado, emRisco };
}

export function calcularPrioridadePedido(
  pedido: { dt_retirada: string | null },
  itens: Pick<ItemPedido, 'm2' | 'quantidade' | 'lapidacao' | 'produto_nome'>[],
  config: ConfigTempoProducao[],
  agora: Date = new Date(),
): PrioridadeInfo {
  const tempos = calcularTempoEstimado(itens, config);
  return scoreDePrioridade(pedido.dt_retirada, tempos.total_min / 60, agora);
}

// Produto de maior m² dentro do pedido — usado como "assinatura" para o bônus
// de agrupamento (pedidos do mesmo produto na fila reduzem troca de setup).
export function produtoPrincipal(itens: Pick<ItemPedido, 'produto_nome' | 'm2'>[]): string {
  if (itens.length === 0) return '';
  const porProduto = new Map<string, number>();
  for (const i of itens) porProduto.set(i.produto_nome, (porProduto.get(i.produto_nome) ?? 0) + i.m2);
  return [...porProduto.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ─── MOTOR DE CAPACIDADE FINITA (APS · Fase 2) ──────────────
// Substitui o cálculo anterior de "1 tarefa = N dias inteiros" por um
// cursor minuto-a-minuto dentro do expediente de cada linha, permitindo
// que várias tarefas curtas compartilhem o mesmo dia até a capacidade
// disponível. Nunca corta um bloco no meio: se não couber antes do fim
// do expediente, o bloco inteiro vai para o início do próximo dia útil.

function horaParaMinutos(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + (m || 0);
}

function comHorario(base: Date, minutosDoDia: number): Date {
  const d = new Date(base);
  d.setHours(0, minutosDoDia, 0, 0);
  return d;
}

function ehDiaUtil(date: Date, bloqueados: Set<string>): boolean {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6 && !bloqueados.has(date.toISOString().slice(0, 10));
}

export function alocarBloco(
  cursor: Date,
  duracaoMin: number,
  linha: Pick<ProducaoLinha, 'inicio_dia' | 'fim_dia'>,
  bloqueados: Set<string> = new Set(),
): { inicio: Date; fim: Date } {
  const minInicioDia = horaParaMinutos(linha.inicio_dia);
  const minFimDia = horaParaMinutos(linha.fim_dia);

  let inicio = new Date(cursor);
  // avança até cair num dia útil dentro do expediente
  while (true) {
    if (!ehDiaUtil(inicio, bloqueados)) {
      inicio = comHorario(new Date(inicio.getTime() + 86_400_000), minInicioDia);
      continue;
    }
    const minAgora = inicio.getHours() * 60 + inicio.getMinutes();
    if (minAgora < minInicioDia) inicio = comHorario(inicio, minInicioDia);
    else if (minAgora >= minFimDia) { inicio = comHorario(new Date(inicio.getTime() + 86_400_000), minInicioDia); continue; }
    break;
  }

  const fim = new Date(inicio.getTime() + duracaoMin * 60_000);
  const fimExpedienteHoje = comHorario(inicio, minFimDia);
  if (fim > fimExpedienteHoje) {
    // não cabe inteiro antes do fim do expediente — empurra o bloco todo pro próximo dia útil
    return alocarBloco(comHorario(new Date(inicio.getTime() + 86_400_000), minInicioDia), duracaoMin, linha, bloqueados);
  }

  return { inicio, fim };
}

// Combina o calendário global (feriados) com os bloqueios específicos de cada
// linha (manutenção/recesso) num único Set de datas bloqueadas por linha —
// hoje esses bloqueios só eram usados para a hachura visual do Gantt, não
// entravam no cálculo do agendamento.
export function construirDiasBloqueadosPorLinha(
  linhas: Pick<ProducaoLinha, 'id'>[],
  calendario: Set<string>,
  bloqueios: Array<{ linha_id: number | null; dt_inicio: string; dt_fim: string }>,
): Record<number, Set<string>> {
  const porLinha: Record<number, Set<string>> = {};
  for (const l of linhas) porLinha[l.id] = new Set(calendario);

  for (const b of bloqueios) {
    const fim = new Date(b.dt_fim);
    for (let d = new Date(b.dt_inicio); d <= fim; d = new Date(d.getTime() + 86_400_000)) {
      const iso = d.toISOString().slice(0, 10);
      if (b.linha_id === null) { for (const l of linhas) porLinha[l.id]?.add(iso); }
      else porLinha[b.linha_id]?.add(iso);
    }
  }
  return porLinha;
}

// Minutos restantes de expediente na linha, a partir do cursor atual —
// usado para decidir se uma tarefa cabe hoje ou se vai empurrar o dia.
export function minutosRestantesNoDia(cursor: Date, linha: Pick<ProducaoLinha, 'fim_dia'>): number {
  const fimExpedienteHoje = comHorario(cursor, horaParaMinutos(linha.fim_dia));
  return Math.max(0, (fimExpedienteHoje.getTime() - cursor.getTime()) / 60_000);
}

// Escolhe, dentro de uma fila já ordenada por prioridade (score desc), qual
// tarefa agendar a seguir na linha menos ocupada: a de maior prioridade que
// ainda caiba no tempo restante do dia (gap-fill); se nenhuma couber, cai de
// volta pra tarefa mais prioritária mesmo assim (ela só empurra pro próximo
// dia útil — nunca fura a fila além do necessário pra evitar ociosidade).
export function proximaTarefaParaEncaixe<T>(
  pendentesOrdenados: T[],
  minutosDisponiveis: number,
  duracaoMin: (t: T) => number,
): number {
  const idx = pendentesOrdenados.findIndex(t => duracaoMin(t) <= minutosDisponiveis);
  return idx === -1 ? 0 : idx;
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
      item_pedido:itens_pedido!item_pedido_id ( id, produto_nome, largura, altura, m2, quantidade, lapidacao ),
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
  itens: Pick<ItemPedido, 'm2' | 'quantidade' | 'lapidacao' | 'produto_nome' | 'id'>[],
  config: ConfigTempoProducao[],
  linhas: ProducaoLinha[],
  dtInicioCorte: Date,
  linhaCorteId: number,
  linhaLapId?: number,
  diasBloqueados: Set<string> = new Set(),
): Promise<{ ok: boolean; erro?: string; fimCorte?: Date }> {
  const linhaCorte = linhas.find(l => l.id === linhaCorteId);
  const linhaLap   = linhaLapId ? linhas.find(l => l.id === linhaLapId) : undefined;
  if (!linhaCorte) return { ok: false, erro: 'Linha de corte não encontrada.' };

  type RowInsert = ProgramacaoInsert & { id?: string };
  const registros: RowInsert[] = [];

  // Cursores minuto-a-minuto por linha (APS · Fase 2) — várias tarefas
  // curtas agora podem compartilhar o mesmo dia até a capacidade da linha,
  // em vez do antigo "1 tarefa = N dias inteiros".
  let cursorCorte = dtInicioCorte;
  let cursorLap   = dtInicioCorte;

  for (let i = 0; i < itens.length; i++) {
    const item   = itens[i];
    const tempos = calcularTempoEstimado([item], config);
    const corteId = crypto.randomUUID();

    const { inicio: inicioCorte, fim: fimCorte } = alocarBloco(cursorCorte, tempos.corte_min, linhaCorte, diasBloqueados);

    registros.push({
      id: corteId,
      pedido_id: pedidoId,
      item_pedido_id: item.id ?? null,
      predecessor_id: null,
      linha_id: linhaCorteId,
      etapa: 'Corte',
      sequencia: i * 2,
      dt_inicio_previsto: toISOLocal(inicioCorte),
      dt_fim_previsto: toISOLocal(fimCorte),
      duracao_estimada_min: tempos.corte_min,
      responsavel: null,
      obs: null,
    });
    cursorCorte = fimCorte;

    if (tempos.tem_lapidacao && linhaLapId && linhaLap) {
      // mantém a folga mínima de 1 dia útil entre Corte e Lapidação
      // (inspeção/Qualidade (Corte) antes de seguir para o polimento)
      const diaMinimoLap = proximoDiaUtil(addDays(fimCorte, 1), diasBloqueados);
      const inicioCandidato = new Date(Math.max(diaMinimoLap.getTime(), cursorLap.getTime()));
      const { inicio: inicioLap, fim: fimLap } = alocarBloco(inicioCandidato, tempos.lapidacao_min, linhaLap, diasBloqueados);

      registros.push({
        pedido_id: pedidoId,
        item_pedido_id: item.id ?? null,
        predecessor_id: corteId,
        linha_id: linhaLapId,
        etapa: 'Lapidação',
        sequencia: i * 2 + 1,
        dt_inicio_previsto: toISOLocal(inicioLap),
        dt_fim_previsto: toISOLocal(fimLap),
        duracao_estimada_min: tempos.lapidacao_min,
        responsavel: null,
        obs: null,
      });
      cursorLap = fimLap;
    }
  }

  const { error } = await supabase.from('programacao_producao').insert(registros as unknown as ProgramacaoInsert[]);
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

  return { ok: true, fimCorte: cursorCorte };
}

export async function reagendar(
  progId: string,
  novaDtInicio: Date,
  duracaoMin: number,
  novaLinhaId?: number,
  motivo?: string,
  manual: boolean = false,
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

  if (manual) {
    // Marca como travado para que o motor de agendamento automático nunca
    // reposicione este bloco de novo. Best-effort: se a coluna "travado"
    // ainda não existir (sql/aps-fase2-travado.sql não executado), essa
    // chamada falha silenciosamente sem afetar o reagendamento acima.
    await supabase.from('programacao_producao').update({ travado: true } as never).eq('id', progId);
  }

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

// ─── RECÁLCULO AUTOMÁTICO (APS · Fase 3) ────────────────────
// Reflow de blocos de Corte ainda não travados/iniciados + fila de pedidos
// pendentes, tudo replanejado do zero em ordem de prioridade — sempre como
// uma PROPOSTA (gerarPropostaRecalculo, síncrona, sem tocar no banco) que o
// usuário revisa antes de aplicar (aplicarPropostaRecalculo). Blocos com
// status 'Em Execução'/'Concluído' e blocos travados (reposicionados
// manualmente) nunca entram na lista de "móveis" — quem decide isso é quem
// chama esta função (ver app/programacao/page.tsx), que os passa como
// blocosFixos (obstáculos que o reflow precisa desviar).

export interface BlocoMovivel {
  progId: string;
  pedidoId: string;
  linhaId: number;
  dtInicioPrevisto: string; // ISO
  duracaoMin: number;
  dtRetirada: string | null;
}

export interface BlocoFixo {
  linhaId: number;
  inicio: Date;
  fim: Date;
}

export interface PedidoPendenteRecalculo {
  pedidoId: string;
  dtRetirada: string | null;
  itens: Pick<ItemPedido, 'id' | 'm2' | 'quantidade' | 'lapidacao' | 'produto_nome'>[];
}

export interface MudancaProposta {
  tipo: 'mover' | 'inserir';
  pedidoId: string;
  progId?: string;
  linhaAntiga?: number;
  inicioAntigo?: Date;
  linhaNova: number;
  inicioNovo: Date;
  fimNovo: Date;
  duracaoMin: number;
  dtRetirada: string | null;
  temLapidacao?: boolean; // 'inserir' cujos itens precisam de Lapidação — não agendada automaticamente aqui
  itens?: Pick<ItemPedido, 'id' | 'm2' | 'quantidade' | 'lapidacao' | 'produto_nome'>[];
}

export interface PropostaRecalculo {
  mudancas: MudancaProposta[];
  resumo: {
    atrasadosAntes: number;
    atrasadosDepois: number;
    blocosMovidos: number;
    blocosNovos: number;
    novosComLapidacaoPendente: number;
  };
}

// Como alocarBloco, mas desviando de intervalos já ocupados na linha (blocos
// fixos + blocos já posicionados nesta mesma rodada de recálculo) — sem
// isso, o reflow poderia propor um horário que colide com algo imóvel.
export function alocarBlocoEvitandoOcupados(
  cursorInicial: Date,
  duracaoMin: number,
  linha: Pick<ProducaoLinha, 'inicio_dia' | 'fim_dia'>,
  bloqueados: Set<string>,
  ocupados: Array<{ inicio: Date; fim: Date }>,
): { inicio: Date; fim: Date } {
  let cursor = cursorInicial;
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    const { inicio, fim } = alocarBloco(cursor, duracaoMin, linha, bloqueados);
    const conflito = ocupados.find(o => inicio < o.fim && fim > o.inicio);
    if (!conflito) return { inicio, fim };
    cursor = conflito.fim;
  }
  // válvula de segurança — não deveria ser alcançada na prática (exigiria
  // 200+ blocos ocupados fragmentados na mesma linha dentro do horizonte).
  // Não há garantia de que o resultado abaixo não colide com algo em
  // `ocupados`; loga pra não falhar em silêncio total caso aconteça.
  console.warn('[APS] alocarBlocoEvitandoOcupados: excedeu 200 tentativas, resultado pode colidir com um bloco ocupado.');
  return alocarBloco(cursor, duracaoMin, linha, bloqueados);
}

export function gerarPropostaRecalculo(
  blocosMoviveis: BlocoMovivel[],
  blocosFixos: BlocoFixo[],
  pendentes: PedidoPendenteRecalculo[],
  linhasCorte: ProducaoLinha[],
  config: ConfigTempoProducao[],
  bloqueadosPorLinha: Record<number, Set<string>>,
  agora: Date = new Date(),
): PropostaRecalculo {
  type Tarefa = {
    pedidoId: string;
    dtRetirada: string | null;
    duracaoMin: number;
    score: number;
    origem: BlocoMovivel | null; // null = pedido novo (ainda sem programação)
    itensNovo?: Pick<ItemPedido, 'id' | 'm2' | 'quantidade' | 'lapidacao' | 'produto_nome'>[];
    temLapidacao?: boolean;
  };

  const tarefas: Tarefa[] = [
    ...blocosMoviveis.map((b): Tarefa => ({
      pedidoId: b.pedidoId, dtRetirada: b.dtRetirada, duracaoMin: b.duracaoMin,
      score: scoreDePrioridade(b.dtRetirada, b.duracaoMin / 60, agora).score,
      origem: b,
    })),
    ...pendentes.map((p): Tarefa => {
      // Soma item a item (mesma conta que criarProgramacaoPedido usa pra
      // gravar de verdade) — não a estimativa combinada de um pedido só,
      // que sub-estima o setup pra pedidos com vários itens.
      const duracaoMin = duracaoTotalCorte(p.itens, config);
      return {
        pedidoId: p.pedidoId, dtRetirada: p.dtRetirada, duracaoMin,
        score: scoreDePrioridade(p.dtRetirada, duracaoMin / 60, agora).score,
        origem: null, itensNovo: p.itens,
        temLapidacao: p.itens.some(i => i.lapidacao > 0),
      };
    }),
  ].sort((a, b) => b.score - a.score);

  const atrasadosAntes = tarefas.filter(t => {
    if (!t.dtRetirada) return false;
    const fimAtual = t.origem
      ? new Date(new Date(t.origem.dtInicioPrevisto).getTime() + t.duracaoMin * 60_000)
      : null;
    if (!fimAtual) return scoreDePrioridade(t.dtRetirada, t.duracaoMin / 60, agora).atrasado;
    return fimAtual > new Date(t.dtRetirada);
  }).length;

  const cursorPorLinha: Record<number, Date> = {};
  const ocupadosPorLinha: Record<number, Array<{ inicio: Date; fim: Date }>> = {};
  for (const l of linhasCorte) {
    cursorPorLinha[l.id] = agora;
    ocupadosPorLinha[l.id] = blocosFixos.filter(f => f.linhaId === l.id).map(f => ({ inicio: f.inicio, fim: f.fim }));
  }

  const pendentesOrdenados = [...tarefas];
  const mudancasTodas: MudancaProposta[] = [];

  while (pendentesOrdenados.length > 0) {
    const linha = linhasCorte.reduce((best, l) =>
      cursorPorLinha[l.id].getTime() < cursorPorLinha[best.id].getTime() ? l : best
    );
    const minutosLivres = minutosRestantesNoDia(cursorPorLinha[linha.id], linha);
    const idx = proximaTarefaParaEncaixe(pendentesOrdenados, minutosLivres, t => t.duracaoMin);
    const tarefa = pendentesOrdenados[idx];

    const { inicio, fim } = alocarBlocoEvitandoOcupados(
      cursorPorLinha[linha.id], tarefa.duracaoMin, linha,
      bloqueadosPorLinha[linha.id] ?? new Set(),
      ocupadosPorLinha[linha.id] ?? [],
    );

    if (tarefa.origem) {
      mudancasTodas.push({
        tipo: 'mover', pedidoId: tarefa.pedidoId, progId: tarefa.origem.progId,
        linhaAntiga: tarefa.origem.linhaId, inicioAntigo: new Date(tarefa.origem.dtInicioPrevisto),
        linhaNova: linha.id, inicioNovo: inicio, fimNovo: fim, duracaoMin: tarefa.duracaoMin,
        dtRetirada: tarefa.dtRetirada,
      });
    } else {
      mudancasTodas.push({
        tipo: 'inserir', pedidoId: tarefa.pedidoId,
        linhaNova: linha.id, inicioNovo: inicio, fimNovo: fim, duracaoMin: tarefa.duracaoMin,
        dtRetirada: tarefa.dtRetirada, temLapidacao: tarefa.temLapidacao,
        itens: tarefa.itensNovo,
      });
    }

    ocupadosPorLinha[linha.id].push({ inicio, fim });
    cursorPorLinha[linha.id] = fim;
    pendentesOrdenados.splice(idx, 1);
  }

  const atrasadosDepois = mudancasTodas.filter(m => m.dtRetirada && m.fimNovo > new Date(m.dtRetirada)).length;

  // Só reporta mudanças reais — ignora "mover" pro mesmo lugar/linha
  const mudancas = mudancasTodas.filter(m =>
    m.tipo === 'inserir' ||
    m.linhaNova !== m.linhaAntiga ||
    Math.abs(m.inicioNovo.getTime() - (m.inicioAntigo?.getTime() ?? 0)) > 60_000
  );

  return {
    mudancas,
    resumo: {
      atrasadosAntes,
      atrasadosDepois,
      blocosMovidos: mudancas.filter(m => m.tipo === 'mover').length,
      blocosNovos: mudancas.filter(m => m.tipo === 'inserir').length,
      novosComLapidacaoPendente: mudancas.filter(m => m.tipo === 'inserir' && m.temLapidacao).length,
    },
  };
}

export async function aplicarPropostaRecalculo(
  proposta: PropostaRecalculo,
  config: ConfigTempoProducao[],
  linhas: ProducaoLinha[],
  bloqueadosPorLinha: Record<number, Set<string>> = {},
): Promise<{ ok: boolean; erro?: string; ignorados?: number }> {
  // A prévia foi calculada a partir de um snapshot (no clique em "Recalcular
  // Agenda"); entre isso e o clique em "Aplicar" o usuário pode ter revisado
  // por um tempo. Revalida o estado atual de cada bloco que seria movido —
  // se o chão de fábrica já iniciou, ou alguém travou/reagendou manualmente
  // nesse meio-tempo, esse bloco é pulado em vez de sobrescrito às cegas.
  const progIdsMover = proposta.mudancas
    .filter((m): m is MudancaProposta & { progId: string } => m.tipo === 'mover' && !!m.progId)
    .map(m => m.progId);

  const statusAtual = new Map<string, { status: string; travado: boolean }>();
  if (progIdsMover.length > 0) {
    const { data } = await supabase
      .from('programacao_producao')
      .select('id, status, travado')
      .in('id', progIdsMover);
    for (const row of (data ?? []) as Array<{ id: string; status: string; travado: boolean | null }>) {
      statusAtual.set(row.id, { status: row.status, travado: !!row.travado });
    }
  }

  let ignorados = 0;

  for (const m of proposta.mudancas) {
    if (m.tipo === 'mover' && m.progId) {
      const atual = statusAtual.get(m.progId);
      if (!atual || atual.status !== 'Agendado' || atual.travado) { ignorados++; continue; }
      const ok = await reagendar(m.progId, m.inicioNovo, m.duracaoMin, m.linhaNova, 'Recálculo automático (APS)', false);
      if (!ok) return { ok: false, erro: `Falha ao mover o bloco do pedido ${m.pedidoId}.` };
    } else if (m.tipo === 'inserir' && m.itens) {
      const result = await criarProgramacaoPedido(
        m.pedidoId, m.itens, config, linhas, m.inicioNovo, m.linhaNova, undefined,
        bloqueadosPorLinha[m.linhaNova] ?? new Set(),
      );
      if (!result.ok) return { ok: false, erro: `Falha ao agendar ${m.pedidoId}: ${result.erro ?? ''}` };
    }
  }

  const usuario = await getUsuario();
  await supabase.from('programacao_historico').insert({
    pedido_id: null,
    tipo_alteracao: 'recalculo_automatico',
    dados_anteriores: { atrasados: proposta.resumo.atrasadosAntes } as unknown as Record<string, unknown>,
    dados_novos: {
      blocos_movidos: proposta.resumo.blocosMovidos - ignorados,
      blocos_novos: proposta.resumo.blocosNovos,
      atrasados: proposta.resumo.atrasadosDepois,
      ignorados,
    } as unknown as Record<string, unknown>,
    motivo: `Recálculo automático da agenda — ${proposta.resumo.blocosMovidos} movido(s), ${proposta.resumo.blocosNovos} novo(s), atrasados ${proposta.resumo.atrasadosAntes} → ${proposta.resumo.atrasadosDepois}${ignorados > 0 ? `, ${ignorados} ignorado(s) por mudança de estado` : ''}`,
    usuario,
  });

  return { ok: true, ignorados };
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

// ─── BLOQUEIOS DE LINHA ──────────────────────────────────────

export interface BloqueioLinha {
  id: string;
  linha_id: number | null;  // null = todos as linhas
  dt_inicio: string;
  dt_fim: string;
  motivo: string | null;
  tipo: 'manutencao' | 'recesso' | 'outro';
  criado_por: string | null;
  created_at: string;
}

export async function getBloqueiosLinha(dtInicio?: Date, dtFim?: Date): Promise<BloqueioLinha[]> {
  let q = supabase.from('bloqueios_linha').select('*');
  if (dtInicio && dtFim) {
    q = (q as any)
      .lt('dt_inicio', dtFim.toISOString())
      .gt('dt_fim', dtInicio.toISOString());
  }
  const { data } = await (q as any).order('dt_inicio');
  return (data ?? []) as BloqueioLinha[];
}

export async function adicionarBloqueioLinha(
  linhaId: number | null,
  dtInicio: Date,
  dtFim: Date,
  motivo: string,
  tipo: BloqueioLinha['tipo'] = 'manutencao',
): Promise<{ ok: boolean; erro?: string }> {
  const usuario = await getUsuario();
  const { error } = await supabase.from('bloqueios_linha').insert({
    linha_id: linhaId,
    dt_inicio: dtInicio.toISOString(),
    dt_fim: dtFim.toISOString(),
    motivo: motivo || null,
    tipo,
    criado_por: usuario,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

export async function removerBloqueioLinha(id: string): Promise<boolean> {
  const { error } = await supabase.from('bloqueios_linha').delete().eq('id', id);
  return !error;
}

// ─── RETRABALHO / QUEBRA ─────────────────────────────────────

export async function registrarRetrabalho(
  progId: string,
  motivo: string,
  diasAtraso: number = 1,
  diasBloqueados: Set<string> = new Set(),
): Promise<{ ok: boolean; erro?: string }> {
  const { data: prog } = await supabase
    .from('programacao_producao')
    .select('pedido_id, linha_id, etapa, sequencia, duracao_estimada_min')
    .eq('id', progId)
    .single();

  if (!prog) return { ok: false, erro: 'Programação não encontrada.' };

  const dtInicio = proximoDiaUtil(new Date(), diasBloqueados);
  dtInicio.setHours(8, 0, 0, 0);
  const dtFim = addDiasUteis(dtInicio, Math.max(1, diasAtraso), diasBloqueados);

  const { error } = await supabase.from('programacao_producao').insert({
    pedido_id:            prog.pedido_id,
    linha_id:             prog.linha_id,
    etapa:                'Retrabalho',
    sequencia:            (prog.sequencia ?? 0) + 10,
    dt_inicio_previsto:   toISOLocal(dtInicio),
    dt_fim_previsto:      toISOLocal(dtFim),
    duracao_estimada_min: Math.max(1, diasAtraso) * 480,
    responsavel:          null,
    obs:                  motivo,
  });

  if (error) return { ok: false, erro: error.message };

  const usuario = await getUsuario();
  await supabase.from('programacao_historico').insert({
    pedido_id:        prog.pedido_id,
    tipo_alteracao:   'retrabalho',
    dados_anteriores: { prog_id: progId } as Record<string, unknown>,
    dados_novos:      { motivo, dias_atraso: diasAtraso } as Record<string, unknown>,
    motivo,
    usuario,
  });

  return { ok: true };
}

// ─── CALIBRAÇÃO DE TEMPOS ────────────────────────────────────

export interface DadosCalibracao {
  etapa: string;
  count: number;
  media_estimado_min: number;
  media_real_min: number;
  fator_ajuste: number;
}

export async function getCalibracaoTempos(): Promise<DadosCalibracao[]> {
  const { data } = await supabase
    .from('programacao_producao')
    .select('etapa, duracao_estimada_min, dt_inicio_real, dt_fim_real')
    .eq('status', 'Concluído')
    .not('dt_inicio_real', 'is', null)
    .not('dt_fim_real', 'is', null);

  if (!data) return [];

  const porEtapa: Record<string, { estimados: number[]; reais: number[] }> = {};

  for (const row of data as any[]) {
    const estimado = row.duracao_estimada_min as number;
    const real     = (new Date(row.dt_fim_real).getTime() - new Date(row.dt_inicio_real).getTime()) / 60000;
    if (!estimado || estimado <= 0 || real <= 0 || real > 14400) continue; // ignora > 10 dias
    if (!porEtapa[row.etapa]) porEtapa[row.etapa] = { estimados: [], reais: [] };
    porEtapa[row.etapa].estimados.push(estimado);
    porEtapa[row.etapa].reais.push(real);
  }

  return Object.entries(porEtapa)
    .filter(([, d]) => d.estimados.length > 0)
    .map(([etapa, d]) => {
      const n         = d.estimados.length;
      const mediaEst  = d.estimados.reduce((a, b) => a + b, 0) / n;
      const mediaReal = d.reais.reduce((a, b) => a + b, 0) / n;
      return {
        etapa,
        count: n,
        media_estimado_min: Math.round(mediaEst),
        media_real_min:     Math.round(mediaReal),
        fator_ajuste:       Math.round((mediaReal / mediaEst) * 100) / 100,
      };
    })
    .sort((a, b) => a.etapa.localeCompare(b.etapa));
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
