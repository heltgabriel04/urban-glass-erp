import { supabase } from "@/lib/supabase/client";

export interface FiltroSalvo {
  id: number;
  usuario_email: string;
  tela: string;
  nome: string;
  filtros: Record<string, string>;
  created_at: string;
}

export async function getFiltrosSalvos(tela: string): Promise<FiltroSalvo[]> {
  const { data, error } = await supabase
    .from("filtros_salvos")
    .select("*")
    .eq("tela", tela)
    .order("created_at", { ascending: false });
  if (error) { console.error("getFiltrosSalvos:", error); return []; }
  return data as FiltroSalvo[];
}

export async function salvarFiltro(tela: string, nome: string, filtros: Record<string, string>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("filtros_salvos").insert([{
    usuario_email: user?.email ?? "sistema",
    tela, nome, filtros,
  } as never]);
  if (error) { console.error("salvarFiltro:", error); return false; }
  return true;
}

export async function excluirFiltroSalvo(id: number): Promise<boolean> {
  const { error } = await supabase.from("filtros_salvos").delete().eq("id", id);
  if (error) { console.error("excluirFiltroSalvo:", error); return false; }
  return true;
}
