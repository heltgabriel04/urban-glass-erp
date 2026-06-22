import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, requireRole } from "@/lib/auth/api-guard";
import { logEntrySchema } from "@/lib/validation/api";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const denied = await requireRole(["admin"]);
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

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = logEntrySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", detalhes: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await adminClient()
    .from("log_atividades")
    .insert(parsed.data as never);

  if (error) {
    console.error("POST /api/logs:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
