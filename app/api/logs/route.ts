import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/auth/api-guard";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  // TODO: restringir a "admin" quando o claim de perfil estiver configurado.
  const denied = await requireAuth();
  if (denied) return denied;

  const { data, error } = await adminClient()
    .from("log_atividades")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("GET /api/logs:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const { error } = await adminClient()
    .from("log_atividades")
    .insert(body as never);

  if (error) {
    console.error("POST /api/logs:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
