import { supabase } from '@/lib/supabase/client';
import { registrarLog } from './log.service';
import type { LinhaExtratoImportada } from '@/lib/importExtratoCsv';

export interface ExtratoImportado {
  id: number;
  conta_id: number;
  arquivo_nome: string | null;
  importado_em: string;
  importado_por: string | null;
  contas_bancarias?: { id: number; nome: string } | null;
}

export interface ExtratoLinha {
  id: number;
  extrato_id: number;
  data: string;
  valor: number;
  tipo: 'Entrada' | 'Saída';
  descricao_banco: string | null;
  conciliado: boolean;
  ignorado: boolean;
  baixa_lancamento_id: number | null;
}

export interface BaixaCandidata {
  baixaId: number;
  valor: number;
  data: string;
  lancamentoId: number;
  descricao: string;
}

export async function getExtratos(contaId?: number): Promise<ExtratoImportado[]> {
  let query = supabase.from('extratos_importados').select('*, contas_bancarias(id, nome)').order('importado_em', { ascending: false });
  if (contaId) query = query.eq('conta_id', contaId);
  const { data, error } = await query;
  if (error) { console.error('getExtratos:', error); return []; }
  return data as unknown as ExtratoImportado[];
}

export async function getLinhasExtrato(extratoId: number): Promise<ExtratoLinha[]> {
  const { data, error } = await supabase.from('extrato_linhas').select('*').eq('extrato_id', extratoId).order('data');
  if (error) { console.error('getLinhasExtrato:', error); return []; }
  return data as ExtratoLinha[];
}

// Importa um extrato já parseado (server-side, via /api/bancos-caixa/importar-extrato)
// — cria o cabeçalho + uma linha por item, tudo não conciliado ainda.
export async function criarExtratoComLinhas(contaId: number, arquivoNome: string, linhas: LinhaExtratoImportada[]): Promise<number | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: extrato, error: errExtrato } = await supabase
    .from('extratos_importados')
    .insert([{ conta_id: contaId, arquivo_nome: arquivoNome, importado_por: user?.email ?? null }] as never)
    .select('id')
    .single();
  if (errExtrato || !extrato) { console.error('criarExtratoComLinhas:', errExtrato); return null; }
  const extratoId = (extrato as { id: number }).id;

  if (linhas.length > 0) {
    const { error: errLinhas } = await supabase.from('extrato_linhas').insert(
      linhas.map(l => ({ extrato_id: extratoId, data: l.data, valor: l.valor, tipo: l.tipo, descricao_banco: l.descricao || null })) as never[]
    );
    if (errLinhas) { console.error('criarExtratoComLinhas (linhas):', errLinhas); return null; }
  }

  registrarLog({
    acao: 'importou', tabela: 'extratos_importados', registro_id: String(extratoId),
    descricao: `Importou extrato "${arquivoNome}" com ${linhas.length} linha(s)`,
    campos_alterados: { linhas: linhas.length },
  });
  return extratoId;
}

// Baixas da mesma conta/tipo, ainda não conciliadas com nenhuma linha de
// extrato, com valor igual e data dentro de ±3 dias — sugestão pro
// usuário confirmar, não é match automático cego.
export async function sugerirMatch(linha: ExtratoLinha): Promise<BaixaCandidata[]> {
  const { data: extratoRow } = await supabase.from('extrato_linhas').select('extrato_id').eq('id', linha.id).maybeSingle();
  if (!extratoRow) return [];
  const { data: extrato } = await supabase.from('extratos_importados').select('conta_id').eq('id', (extratoRow as { extrato_id: number }).extrato_id).maybeSingle();
  if (!extrato) return [];
  const contaId = (extrato as { conta_id: number }).conta_id;

  const dataIni = new Date(linha.data); dataIni.setDate(dataIni.getDate() - 3);
  const dataFim = new Date(linha.data); dataFim.setDate(dataFim.getDate() + 3);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const [{ data: baixas }, { data: jaUsadas }] = await Promise.all([
    supabase
      .from('baixas_lancamento')
      .select('id, valor, data, lancamento_id, lancamentos!inner(tipo, descricao)')
      .eq('conta_id', contaId)
      .eq('lancamentos.tipo', linha.tipo)
      .eq('valor', linha.valor)
      .gte('data', fmt(dataIni))
      .lte('data', fmt(dataFim))
      .is('estornado_em', null),
    supabase.from('extrato_linhas').select('baixa_lancamento_id').not('baixa_lancamento_id', 'is', null),
  ]);

  const idsUsados = new Set((jaUsadas ?? []).map(u => (u as { baixa_lancamento_id: number }).baixa_lancamento_id));

  return ((baixas ?? []) as unknown as Array<{ id: number; valor: number; data: string; lancamento_id: number; lancamentos: { descricao: string } }>)
    .filter(b => !idsUsados.has(b.id))
    .map(b => ({ baixaId: b.id, valor: Number(b.valor), data: b.data, lancamentoId: b.lancamento_id, descricao: b.lancamentos.descricao }));
}

export async function confirmarMatch(linhaId: number, baixaLancamentoId: number): Promise<boolean> {
  const { error } = await supabase.from('extrato_linhas').update({ conciliado: true, baixa_lancamento_id: baixaLancamentoId } as never).eq('id', linhaId);
  if (error) { console.error('confirmarMatch:', error); return false; }
  registrarLog({
    acao: 'conciliou', tabela: 'extrato_linhas', registro_id: String(linhaId),
    descricao: `Conciliou linha de extrato #${linhaId} com a baixa #${baixaLancamentoId}`,
  });
  return true;
}

export async function ignorarLinha(linhaId: number): Promise<boolean> {
  const { error } = await supabase.from('extrato_linhas').update({ ignorado: true } as never).eq('id', linhaId);
  if (error) { console.error('ignorarLinha:', error); return false; }
  return true;
}
