import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKETS = [
  { name: "romaneios-assinados", public: true },
  { name: "nfe-pedidos",         public: true },
  { name: "boletos-pedidos",     public: true },
];

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const results: Record<string, string> = {};

  for (const b of BUCKETS) {
    const { data: existing } = await supabase.storage.getBucket(b.name);
    if (existing) { results[b.name] = "já existe"; continue; }
    const { error } = await supabase.storage.createBucket(b.name, {
      public: b.public,
      fileSizeLimit: 20 * 1024 * 1024,
    });
    results[b.name] = error ? `ERRO: ${error.message}` : "criado ✓";
  }

  return NextResponse.json({ buckets: results });
}
