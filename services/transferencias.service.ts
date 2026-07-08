import { supabase } from '@/lib/supabase/client';
import { registrarLog } from './log.service';

export interface Transferencia {
  id: number;
  conta_origem_id: number;
  conta_destino_id: number;
  valor: number;
  data: string;
  obs: string | null;
  created_at: string;
  origem?: { id: number; nome: string } | null;
  destino?: { id: number; nome: string } | null;
}

export async function getTransferencias(limite = 50) {
  const { data, error } = await supabase
    .from('transferencias_bancarias')
    .select('*, origem:contas_bancarias!transferencias_bancarias_conta_origem_id_fkey(id, nome), destino:contas_bancarias!transferencias_bancarias_conta_destino_id_fkey(id, nome)')
    .order('data', { ascending: false })
    .limit(limite);
  if (error) { console.error('getTransferencias:', error); return []; }
  return data as unknown as Transferencia[];
}

export interface RegistrarTransferenciaParams {
  contaOrigemId: number;
  contaDestinoId: number;
  valor: number;
  data: string;
  obs?: string | null;
}

// Uma transferência = uma linha em transferencias_bancarias + 2 baixas
// espelho (saída na origem, entrada no destino). Não gera lançamento em
// `lancamentos` — não é receita nem despesa, não deve aparecer em Contas a
// Pagar/Receber nem no DRE.
export async function registrarTransferencia(params: RegistrarTransferenciaParams): Promise<boolean> {
  if (params.contaOrigemId === params.contaDestinoId) { console.error('registrarTransferencia: contas de origem e destino iguais'); return false; }
  if (!(params.valor > 0)) { console.error('registrarTransferencia: valor precisa ser maior que zero'); return false; }

  const { data: transf, error: errTransf } = await supabase
    .from('transferencias_bancarias')
    .insert([{
      conta_origem_id: params.contaOrigemId,
      conta_destino_id: params.contaDestinoId,
      valor: params.valor,
      data: params.data,
      obs: params.obs ?? null,
    } as never])
    .select('id')
    .single();
  if (errTransf || !transf) { console.error('registrarTransferencia (insert):', errTransf); return false; }
  const transferenciaId = (transf as { id: number }).id;

  const { error: errBaixas } = await supabase.from('baixas_lancamento').insert([
    { transferencia_id: transferenciaId, conta_id: params.contaOrigemId, valor: params.valor, data: params.data, obs: 'Transferência (saída)' },
    { transferencia_id: transferenciaId, conta_id: params.contaDestinoId, valor: params.valor, data: params.data, obs: 'Transferência (entrada)' },
  ] as never[]);
  if (errBaixas) { console.error('registrarTransferencia (baixas):', errBaixas); return false; }

  registrarLog({
    acao: 'transferiu', tabela: 'transferencias_bancarias', registro_id: String(transferenciaId),
    descricao: `Transferiu R$ ${params.valor.toFixed(2)} entre contas bancárias`,
    campos_alterados: { valor: params.valor, data: params.data },
  });
  return true;
}
