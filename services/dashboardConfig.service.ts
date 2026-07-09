import { supabase } from '@/lib/supabase/client';
import type { DashboardWidgetConfig } from '@/types';

// Preferência pessoal de quais widgets ficam visíveis em cada nível do
// Dashboard Financeiro — por usuário (RLS trava pela própria linha,
// `user_id = auth.uid()`), não é papel/permissão, é só "não quero ver
// isso na minha tela".
export async function getConfigNivel(nivel: string): Promise<DashboardWidgetConfig[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('dashboard_widget_config')
    .select('*')
    .eq('nivel', nivel)
    .eq('user_id', user.id);
  if (error) { console.error('getConfigNivel:', error); return []; }
  return data as DashboardWidgetConfig[];
}

export async function salvarVisibilidade(nivel: string, widgetKey: string, visivel: boolean): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('dashboard_widget_config')
    .upsert([{ user_id: user.id, nivel, widget_key: widgetKey, visivel }] as never[], { onConflict: 'user_id,nivel,widget_key' });
  if (error) { console.error('salvarVisibilidade:', error); return false; }
  return true;
}
