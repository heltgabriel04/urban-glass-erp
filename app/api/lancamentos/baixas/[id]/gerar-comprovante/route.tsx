import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth } from "@/lib/auth/api-guard";
import { ComprovanteDocument } from "@/lib/pdf/comprovante";
import type { Lancamento, BaixaLancamento } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: baixa, error } = await sb
    .from("baixas_lancamento")
    .select("*, contas_bancarias(id, nome)")
    .eq("id", id)
    .single();

  if (error || !baixa || !(baixa as BaixaLancamento).lancamento_id) {
    return NextResponse.json({ error: "Baixa não encontrada" }, { status: 404 });
  }

  const { data: lancamento, error: errLanc } = await sb
    .from("lancamentos")
    .select("*, clientes(id, nome)")
    .eq("id", (baixa as BaixaLancamento).lancamento_id)
    .single();

  if (errLanc || !lancamento) {
    return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    <ComprovanteDocument lancamento={lancamento as Lancamento} baixa={baixa as BaixaLancamento} />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="comprovante_${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
