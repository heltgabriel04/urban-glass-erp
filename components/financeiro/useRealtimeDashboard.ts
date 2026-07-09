"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

// Escuta mudanças em lancamentos/baixas_lancamento e chama `onChange`
// (debounced) pra recarregar o dashboard sem precisar de F5. Degrada bem:
// se o Realtime não estiver habilitado no projeto Supabase (Database →
// Replication), o canal simplesmente nunca conecta — sem erro, sem
// travar, o dashboard continua funcionando normalmente, só sem o "ao
// vivo". `onChange` é sempre a versão mais recente (via ref) — evita
// recarregar com um `filtro` desatualizado de quando o hook montou.
export function useRealtimeDashboard(onChange: () => void) {
  const [ativo, setAtivo] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function disparar() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChangeRef.current(), 800);
    }

    const nomeCanal = `dashboard-financeiro-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(nomeCanal)
      .on("postgres_changes", { event: "*", schema: "public", table: "lancamentos" }, disparar)
      .on("postgres_changes", { event: "*", schema: "public", table: "baixas_lancamento" }, disparar)
      .subscribe(status => setAtivo(status === "SUBSCRIBED"));

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  return { ativo };
}
