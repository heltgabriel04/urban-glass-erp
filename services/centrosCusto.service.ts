import { supabase } from '@/lib/supabase/client';
import type { CentroCusto, CentroCustoInsert, CentroCustoUpdate } from '@/types';
import { registrarLog } from './log.service';

export async function getCentrosCusto(apenasAtivos = false) {
  let query = supabase.from('centros_custo').select('*').order('nome');
  if (apenasAtivos) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) { console.error('getCentrosCusto:', error); return []; }
  return data as CentroCusto[];
}

export async function createCentroCusto(centro: CentroCustoInsert) {
  const { data, error } = await supabase
    .from('centros_custo')
    .insert([centro as never])
    .select()
    .single();
  if (error) { console.error('createCentroCusto:', error); return null; }
  registrarLog({
    acao: 'criou', tabela: 'centros_custo', registro_id: String((data as CentroCusto).id),
    descricao: `Criou centro de custo ${(data as CentroCusto).nome}`,
    campos_alterados: { nome: (data as CentroCusto).nome },
  });
  return data as CentroCusto;
}

export async function updateCentroCusto(id: number, updates: CentroCustoUpdate) {
  const { data, error } = await supabase
    .from('centros_custo')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateCentroCusto:', error); return null; }
  registrarLog({
    acao: 'editou', tabela: 'centros_custo', registro_id: String(id),
    descricao: `Editou centro de custo ${(data as CentroCusto).nome}`,
    campos_alterados: updates as Record<string, unknown>,
  });
  return data as CentroCusto;
}

export async function deletarCentroCusto(id: number): Promise<boolean> {
  const { error } = await supabase.from('centros_custo').delete().eq('id', id);
  if (error) { console.error('deletarCentroCusto:', error); return false; }
  registrarLog({ acao: 'excluiu', tabela: 'centros_custo', registro_id: String(id), descricao: `Excluiu centro de custo #${id}` });
  return true;
}
