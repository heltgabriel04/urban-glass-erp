import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api-guard";

function getBaseUrl(): string {
  return (process.env.FOCUSNFE_AMBIENTE ?? "homologacao") === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function basicAuth(token: string): string {
  return "Basic " + Buffer.from(token + ":").toString("base64");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole(["admin", "financeiro"]);
  if (denied) return denied;

  const { id } = await params;
  const token = process.env.FOCUSNFE_TOKEN ?? "";

  try {
    // id é o "ref" usado na emissão — FocusNFe usa o mesmo para consulta
    const res = await fetch(
      `${getBaseUrl()}/v2/nfe/${encodeURIComponent(id)}?completa=1`,
      { headers: { Authorization: basicAuth(token) } }
    );
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    console.error("api/notas/consultar:", err);
    return NextResponse.json({ message: "Erro de conexão com FocusNFe" }, { status: 500 });
  }
}
