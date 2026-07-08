import { supabase } from '@/lib/supabase/client';
import type { LancamentoRecorrente, LancamentoRecorrenteInsert, LancamentoRecorrenteUpdate, LancamentoInsert } from '@/types';
import { registrarLog } from './log.service';

export async function getRecorrencias(apenasAtivas = false) {
  let query = supabase.from('lancamentos_recorrentes').select('*').order('descricao');
  if (apenasAtivas) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) { console.error('getRecorrencias:', error); return []; }
  return data as LancamentoRecorrente[];
}

export async function createRecorrencia(regra: LancamentoRecorrenteInsert) {
  const { data, error } = await supabase
    .from('lancamentos_recorrentes')
    .insert([regra as never])
    .select()
    .single();
  if (error) { console.error('createRecorrencia:', error); return null; }
  registrarLog({
    acao: 'criou', tabela: 'lancamentos_recorrentes', registro_id: String((data as LancamentoRecorrente).id),
    descricao: `Criou recorrência ${(data as LancamentoRecorrente).descricao}`,
    campos_alterados: { descricao: (data as LancamentoRecorrente).descricao, valor: (data as LancamentoRecorrente).valor },
  });
  return data as LancamentoRecorrente;
}

export async function updateRecorrencia(id: number, updates: LancamentoRecorrenteUpdate) {
  const { data, error } = await supabase
    .from('lancamentos_recorrentes')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateRecorrencia:', error); return null; }
  registrarLog({
    acao: 'editou', tabela: 'lancamentos_recorrentes', registro_id: String(id),
    descricao: `Editou recorrência ${(data as LancamentoRecorrente).descricao}`,
    campos_alterados: updates as Record<string, unknown>,
  });
  return data as LancamentoRecorrente;
}

export async function deletarRecorrencia(id: number): Promise<boolean> {
  const { error } = await supabase.from('lancamentos_recorrentes').delete().eq('id', id);
  if (error) { console.error('deletarRecorrencia:', error); return false; }
  registrarLog({ acao: 'excluiu', tabela: 'lancamentos_recorrentes', registro_id: String(id), descricao: `Excluiu recorrência #${id}` });
  return true;
}

function fmtData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Gera os próximos N meses de lançamento a partir de uma regra recorrente.
// Continua de onde parou (`gerado_ate`) — chamar de novo não duplica.
export async function gerarProximosMeses(regraId: number, meses = 12): Promise<number> {
  const { data: regraRow, error } = await supabase
    .from('lancamentos_recorrentes')
    .select('*')
    .eq('id', regraId)
    .maybeSingle();
  if (error || !regraRow) { console.error('gerarProximosMeses: regra não encontrada', error); return 0; }
  const regra = regraRow as LancamentoRecorrente;

  let cursor: Date;
  if (regra.gerado_ate) {
    const [y, m] = regra.gerado_ate.split('-').map(Number);
    cursor = new Date(y, m - 1 + 1, 1); // mês seguinte ao último gerado
  } else {
    const hoje = new Date();
    cursor = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  }

  const inserts: LancamentoInsert[] = [];
  let ultimaData = regra.gerado_ate;
  for (let i = 0; i < meses; i++) {
    const vencimento = fmtData(new Date(cursor.getFullYear(), cursor.getMonth(), regra.dia_vencimento));
    inserts.push({
      tipo: regra.tipo,
      descricao: regra.descricao,
      valor: regra.valor,
      status: regra.tipo === 'Entrada' ? 'A Receber' : 'Pendente',
      vencimento,
      pedido_id: null,
      cliente_id: regra.cliente_id,
      plano_contas_id: regra.plano_contas_id,
      centro_custo_id: regra.centro_custo_id,
      conta_id: regra.conta_id,
      fornecedor: regra.fornecedor,
      recorrencia_id: regraId,
    });
    ultimaData = vencimento;
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const { error: errInsert } = await supabase.from('lancamentos').insert(inserts as never[]);
  if (errInsert) { console.error('gerarProximosMeses (insert):', errInsert); return 0; }

  await supabase.from('lancamentos_recorrentes').update({ gerado_ate: ultimaData } as never).eq('id', regraId);

  registrarLog({
    acao: 'gerou', tabela: 'lancamentos_recorrentes', registro_id: String(regraId),
    descricao: `Gerou ${inserts.length} lançamento(s) da recorrência "${regra.descricao}" até ${ultimaData}`,
    campos_alterados: { meses: inserts.length, gerado_ate: ultimaData },
  });

  return inserts.length;
}
