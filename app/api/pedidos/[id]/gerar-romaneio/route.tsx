import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth } from "@/lib/auth/api-guard";
import { RomaneioDocument } from "@/lib/pdf/romaneio";
import type { Pedido } from "@/types";

const BUCKET = "romaneios";

export async function POST(
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

  const { data: pedido, error } = await sb
    .from("pedidos")
    .select(`*, clientes ( * ), itens_pedido ( *, produtos ( id, unidade ) )`)
    .eq("id", id)
    .single();

  if (error || !pedido) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  const buffer = await renderToBuffer(<RomaneioDocument pedido={pedido as Pedido} />);

  const path = `${id}/${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
  const { error: uploadError } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("gerar-romaneio upload:", uploadError);
    return NextResponse.json({ error: "Erro ao subir romaneio" }, { status: 500 });
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateError } = await sb
    .from("pedidos")
    .update({ romaneio_pdf_url: pub.publicUrl })
    .eq("id", id);

  if (updateError) {
    console.error("gerar-romaneio update:", updateError);
    return NextResponse.json({ error: "Erro ao salvar URL" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
