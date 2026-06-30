import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { parsePdfOrcamentoText } from "@/lib/importPdfOrcamento";

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || file.type !== "application/pdf") {
    return NextResponse.json({ error: "Envie um arquivo PDF" }, { status: 400 });
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data });
    const result = await parser.getText();
    const items = parsePdfOrcamentoText(result.text);
    return NextResponse.json({ items, total: items.length });
  } catch (e) {
    console.error("import-pdf:", e);
    return NextResponse.json({ error: "Não foi possível processar o PDF" }, { status: 500 });
  }
}
