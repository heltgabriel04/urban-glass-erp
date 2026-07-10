import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { pathToFileURL } from "url";
import { requireRole } from "@/lib/auth/api-guard";
import { parsePdfOrcamentoText } from "@/lib/importPdfOrcamento";

async function extractTextFromPdf(data: Uint8Array): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as never) as typeof import("pdfjs-dist");
  const workerSrc = pathToFileURL(
    path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const doc = await pdfjsLib.getDocument({ data }).promise;
  let text = "";

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | undefined;
    for (const item of content.items) {
      const i = item as { str: string; transform: number[] };
      if (lastY !== i.transform[5]) {
        lines.push("");
        lastY = i.transform[5];
      }
      lines[lines.length - 1] += i.str;
    }
    text += lines.join("\n") + "\n";
  }

  return text;
}

export async function POST(req: NextRequest) {
  const denied = await requireRole(["admin", "financeiro"]);
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const name = file.name?.toLowerCase() ?? "";
  if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Envie um arquivo PDF" }, { status: 400 });
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const text = await extractTextFromPdf(buffer);
    const items = parsePdfOrcamentoText(text);
    return NextResponse.json({ items, total: items.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("import-pdf:", msg);
    return NextResponse.json(
      { error: "Não foi possível processar o PDF", detail: msg },
      { status: 500 }
    );
  }
}
