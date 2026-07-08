import { supabase } from '@/lib/supabase/client';
import type { FormaPagamento, FormaPagamentoInsert, FormaPagamentoUpdate } from '@/types';
import { registrarLog } from './log.service';

export async function getFormasPagamento(apenasAtivas = false) {
  let query = supabase.from('formas_pagamento').select('*').order('nome');
  if (apenasAtivas) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) { console.error('getFormasPagamento:', error); return []; }
  return data as FormaPagamento[];
}

export async function createFormaPagamento(forma: FormaPagamentoInsert) {
  const { data, error } = await supabase
    .from('formas_pagamento')
    .insert([forma as never])
    .select()
    .single();
  if (error) { console.error('createFormaPagamento:', error); return null; }
  registrarLog({
    acao: 'criou', tabela: 'formas_pagamento', registro_id: String((data as FormaPagamento).id),
    descricao: `Criou forma de pagamento ${(data as FormaPagamento).nome}`,
    campos_alterados: { nome: (data as FormaPagamento).nome },
  });
  return data as FormaPagamento;
}

export async function updateFormaPagamento(id: number, updates: FormaPagamentoUpdate) {
  const { data, error } = await supabase
    .from('formas_pagamento')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateFormaPagamento:', error); return null; }
  registrarLog({
    acao: 'editou', tabela: 'formas_pagamento', registro_id: String(id),
    descricao: `Editou forma de pagamento ${(data as FormaPagamento).nome}`,
    campos_alterados: updates as Record<string, unknown>,
  });
  return data as FormaPagamento;
}

export async function deletarFormaPagamento(id: number): Promise<boolean> {
  const { error } = await supabase.from('formas_pagamento').delete().eq('id', id);
  if (error) { console.error('deletarFormaPagamento:', error); return false; }
  registrarLog({ acao: 'excluiu', tabela: 'formas_pagamento', registro_id: String(id), descricao: `Excluiu forma de pagamento #${id}` });
  return true;
}
