import { supabase } from "@/lib/supabase/client";

interface LogParams {
  acao: string;
  tabela: string;
  registro_id?: string;
  descricao: string;
  campos_alterados?: Record<string, unknown>;
}

// Fire-and-forget via API route (service_role_key bypassa RLS)
export function registrarLog(params: LogParams): void {
  supabase.auth.getUser().then(({ data: { user } }) => {
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usuario_id:       user?.id    ?? null,
        usuario_email:    user?.email ?? "sistema",
        acao:             params.acao,
        tabela:           params.tabela,
        registro_id:      params.registro_id ?? null,
        descricao:        params.descricao,
        campos_alterados: params.campos_alterados ?? null,
      }),
    }).catch(err => console.warn("registrarLog:", err));
  });
}
