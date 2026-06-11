import { supabase } from "@/lib/supabase/client";
import type { ChecklistExpedicao, ChecklistDados, StatusChecklist } from "@/types";

export async function getChecklistByPedido(pedidoId: string): Promise<ChecklistExpedicao | null> {
  const { data, error } = await supabase
    .from("checklist_expedicao")
    .select("*")
    .eq("pedido_id", pedidoId)
    .single();
  if (error) return null;
  return data as ChecklistExpedicao;
}

export async function upsertChecklist(
  pedidoId: string,
  dados: ChecklistDados,
  status: StatusChecklist = "em_andamento"
): Promise<ChecklistExpedicao | null> {
  const { data, error } = await supabase
    .from("checklist_expedicao")
    .upsert(
      { pedido_id: pedidoId, dados, status, updated_at: new Date().toISOString() },
      { onConflict: "pedido_id" }
    )
    .select()
    .single();
  if (error) { console.error("checklist upsert:", error); return null; }
  return data as ChecklistExpedicao;
}
