import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/api-guard";

const BUCKETS = [
  { name: "romaneios-assinados", public: true },
  { name: "nfe-pedidos",         public: true },
  { name: "boletos-pedidos",     public: true },
];

export async function POST() {
  const denied = await requireRole(["admin"]);
  if (denied) return denied;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

    if (!url || !key) {
      return NextResponse.json({ error: `Variáveis ausentes: URL=${!!url} KEY=${!!key}` }, { status: 500 });
    }

    const supabase = createClient(url, key);
    const results: Record<string, string> = {};

    for (const b of BUCKETS) {
      try {
        const { data: existing } = await supabase.storage.getBucket(b.name);
        if (existing) { results[b.name] = "já existe"; continue; }
        const { error } = await supabase.storage.createBucket(b.name, {
          public: b.public,
          fileSizeLimit: 20 * 1024 * 1024,
        });
        results[b.name] = error ? `ERRO: ${error.message}` : "criado ✓";
      } catch (e: unknown) {
        results[b.name] = `exceção: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    return NextResponse.json({ buckets: results });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
