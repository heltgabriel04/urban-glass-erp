import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/api-guard";

const CANONICO = "Itaú Maxibuild";

export async function POST() {
  const denied = await requireRole(["admin"]);
  if (denied) return denied;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    // Busca todos os registros cujo empresa não é exatamente o nome canônico
    // mas é uma variação (ITAÚ MAXIBUILD, itau maxibuild, Itau Maxibuild, etc.)
    const { data: todos, error: errBusca } = await supabase
      .from("investimentos")
      .select("id, empresa");

    if (errBusca) return NextResponse.json({ error: errBusca.message }, { status: 500 });

    const errados = (todos ?? []).filter(
      r => r.empresa !== CANONICO &&
           r.empresa.toLowerCase().replace(/[^a-z]/g, "").includes("itaumaxibuild")
    );

    let fixedInv = 0;
    for (const r of errados) {
      await supabase.from("investimentos").update({ empresa: CANONICO }).eq("id", r.id);
      fixedInv++;
    }

    // Limpa opções duplicadas em inv_opcoes
    const { data: opcoes } = await supabase
      .from("inv_opcoes")
      .select("id, valor")
      .eq("tipo", "banco");

    let fixedOpts = 0;
    for (const o of opcoes ?? []) {
      if (o.valor !== CANONICO &&
          o.valor.toLowerCase().replace(/[^a-z]/g, "").includes("itaumaxibuild")) {
        await supabase.from("inv_opcoes").delete().eq("id", o.id);
        fixedOpts++;
      }
    }

    return NextResponse.json({ fixedInvestimentos: fixedInv, fixedOpcoes: fixedOpts });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
