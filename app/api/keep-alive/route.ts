import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Chamada pelo Vercel Cron (vercel.json) a cada poucos dias. O plano gratuito do
// Supabase pausa o projeto após 7 dias sem atividade; esta consulta leve conta
// como atividade e evita a pausa.
export async function GET(req: NextRequest) {
  // Se CRON_SECRET estiver definido na Vercel, ela envia esse header no cron.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await sb.from("pedidos").select("id").limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, em: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
