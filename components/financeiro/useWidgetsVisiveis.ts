"use client";

import { useEffect, useState } from "react";
import { getConfigNivel, salvarVisibilidade } from "@/services/dashboardConfig.service";

export interface WidgetDef { key: string; label: string; }

// Widgets ficam visíveis por padrão até o usuário esconder algum —
// não precisa de linha na tabela pra "visível", só pra "oculto".
export function useWidgetsVisiveis(nivel: string, widgets: WidgetDef[]) {
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [nivel]);

  async function load() {
    setLoading(true);
    const config = await getConfigNivel(nivel);
    setOcultos(new Set(config.filter(c => !c.visivel).map(c => c.widget_key)));
    setLoading(false);
  }

  function visivel(key: string) {
    return !ocultos.has(key);
  }

  async function toggle(key: string) {
    const proximoVisivel = ocultos.has(key);
    setOcultos(prev => {
      const next = new Set(prev);
      if (proximoVisivel) next.delete(key); else next.add(key);
      return next;
    });
    await salvarVisibilidade(nivel, key, proximoVisivel);
  }

  return { widgets, visivel, toggle, loading };
}
