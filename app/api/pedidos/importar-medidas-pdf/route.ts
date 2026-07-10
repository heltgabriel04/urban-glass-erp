import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api-guard";
import { parseRelacaoVidrosPdf } from "@/lib/importPdfRelacaoVidros";

// Roda no servidor porque o pdfjs (usado pra extrair o texto posicionado do
// PDF) depende de um worker mais simples de rodar em Node do que empacotado
// no bundle do navegador.
export async function POST(req: NextRequest) {
  const denied = await requireRole(["admin", "financeiro"]);
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const medidas = await parseRelacaoVidrosPdf(buffer);
    return NextResponse.json({ medidas });
  } catch (err: any) {
    console.error("POST /api/pedidos/importar-medidas-pdf:", err);
    return NextResponse.json({ error: "Não foi possível ler o PDF" }, { status: 500 });
  }
}
