import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/auth/api-guard";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;

  const { data, error } = await adminClient()
    .from("log_atividades")
    .select("id, created_at, usuario_email, acao, descricao")
    .eq("registro_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("GET /api/logs/pedido/[id]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
