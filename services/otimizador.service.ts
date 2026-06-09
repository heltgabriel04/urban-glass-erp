import { supabase } from '@/lib/supabase/client';

export interface HistoricoOtimizador {
  id: number;
  pedido_id: string;
  dt_otim: string;
  aproveitamento: number;
  perda: number;
  chapas_usadas: number;
  retalhos_gerados: number;
  pecas_json: any;
  chapas_json: any;
  chapa_w: number;
  chapa_h: number;
  kerf: number;
  borda: number;
  total_pecas: number;
  usuario: string | null;
  created_at: string;
}

export async function salvarOtimizacao(payload: Omit<HistoricoOtimizador, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('historico_otimizador')
    .insert([payload as never])
    .select()
    .single();
  if (error) { console.error('salvarOtimizacao:', error); return null; }
  return data as HistoricoOtimizador;
}

export async function getOtimizacoesPorPedido(pedidoId: string) {
  const { data, error } = await supabase
    .from('historico_otimizador')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getOtimizacoesPorPedido:', error); return []; }
  return data as HistoricoOtimizador[];
}

export async function getAllHistoricoOtimizador() {
  const { data, error } = await supabase
    .from('historico_otimizador')
    .select('id, pedido_id, dt_otim, aproveitamento, perda, chapas_usadas, retalhos_gerados, total_pecas')
    .order('dt_otim', { ascending: true });
  if (error) { console.error('getAllHistoricoOtimizador:', error); return []; }
  return (data ?? []) as Array<{
    id: number; pedido_id: string; dt_otim: string;
    aproveitamento: number; perda: number;
    chapas_usadas: number; retalhos_gerados: number; total_pecas: number;
  }>;
}

export async function pedidoTemOtimizacao(pedidoId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('historico_otimizador')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', pedidoId);
  if (error) return false;
  return (count ?? 0) > 0;
}