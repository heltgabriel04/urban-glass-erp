import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  // Busca todas as opções de banco cadastradas
  const { data: opcoes } = await supabase
    .from("inv_opcoes")
    .select("id, valor")
    .eq("tipo", "banco");

  // Agrupa opções pelo nome normalizado (sem acento, lowercase)
  // e mantém como canônico o que tiver acento / maiúsculas corretas
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const grupos: Record<string, { canonico: string; duplicados: number[] }> = {};

  for (const o of opcoes ?? []) {
    const key = normalize(o.valor);
    if (!grupos[key]) {
      grupos[key] = { canonico: o.valor, duplicados: [] };
    } else {
      // Prefere o que tem acento (mais caracteres especiais = mais "completo")
      if (o.valor.length > grupos[key].canonico.length) {
        grupos[key].duplicados.push(
          ...opcoes!.filter(x => normalize(x.valor) === key && x.valor !== o.valor).map(x => x.id)
        );
        grupos[key].canonico = o.valor;
      } else {
        grupos[key].duplicados.push(o.id);
      }
    }
  }

  let fixedInv = 0;
  let fixedOpts = 0;

  for (const { canonico, duplicados } of Object.values(grupos)) {
    if (duplicados.length === 0) continue;

    // Atualiza investimentos que usavam nomes duplicados
    const { data: dupsOpts } = await supabase
      .from("inv_opcoes")
      .select("valor")
      .in("id", duplicados);

    const nomesDup = (dupsOpts ?? []).map(o => o.valor);

    for (const nome of nomesDup) {
      const { data: atualizados } = await supabase
        .from("investimentos")
        .update({ empresa: canonico })
        .eq("empresa", nome)
        .select("id");
      fixedInv += (atualizados ?? []).length;
    }

    // Remove as opções duplicadas
    for (const id of duplicados) {
      await supabase.from("inv_opcoes").delete().eq("id", id);
      fixedOpts++;
    }
  }

  return NextResponse.json({ fixedInvestimentos: fixedInv, fixedOpcoes: fixedOpts });
}
