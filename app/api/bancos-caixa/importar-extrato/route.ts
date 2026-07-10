import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api-guard";
import { parseExtratoCsvBuffer } from "@/lib/importExtratoCsv";

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
    const linhas = await parseExtratoCsvBuffer(buffer);
    return NextResponse.json({ linhas });
  } catch (err: unknown) {
    console.error("POST /api/bancos-caixa/importar-extrato:", err);
    return NextResponse.json({ error: "Não foi possível ler o extrato" }, { status: 500 });
  }
}
