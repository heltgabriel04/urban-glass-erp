import { supabase } from "@/lib/supabase/client";

interface LogParams {
  acao: string;
  tabela: string;
  registro_id?: string;
  descricao: string;
  campos_alterados?: Record<string, unknown>;
}

// Fire-and-forget: nunca bloqueia a operação principal
export function registrarLog(params: LogParams): void {
  supabase.auth.getUser().then(({ data: { user } }) => {
    supabase
      .from("log_atividades")
      .insert({
        usuario_id:       user?.id    ?? null,
        usuario_email:    user?.email ?? "sistema",
        acao:             params.acao,
        tabela:           params.tabela,
        registro_id:      params.registro_id ?? null,
        descricao:        params.descricao,
        campos_alterados: params.campos_alterados ?? null,
      } as never)
      .then(({ error }) => {
        if (error) console.warn("log_atividades:", error.message);
      });
  });
}
