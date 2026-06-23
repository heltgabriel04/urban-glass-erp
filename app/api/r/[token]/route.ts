import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Rota pública (sem auth) — alvo estável do QR impresso nas etiquetas.
// Decide o destino em tempo de leitura a partir do status atual do pedido,
// já que o conteúdo do QR físico não pode mais mudar depois de impresso.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: pedido } = await sb
    .from("pedidos")
    .select("id, status, romaneio_pdf_url")
    .eq("qr_token", token)
    .maybeSingle();

  if (!pedido) {
    return new NextResponse("Etiqueta não encontrada.", { status: 404 });
  }

  if (pedido.status !== "Entregue") {
    return NextResponse.redirect(new URL(`/pedidos/${pedido.id}/producao`, req.url), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (pedido.romaneio_pdf_url) {
    return NextResponse.redirect(pedido.romaneio_pdf_url, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new NextResponse("Romaneio sendo gerado. Tente novamente em alguns instantes.", {
    status: 202,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
