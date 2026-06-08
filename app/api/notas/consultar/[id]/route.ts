import { NextRequest, NextResponse } from "next/server";

const NF_API = "https://api.nuvemfiscal.com.br";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = process.env.NUVEM_FISCAL_TOKEN ?? "";

  try {
    const res = await fetch(`${NF_API}/nfe/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    console.error("api/notas/consultar:", err);
    return NextResponse.json({ message: "Erro de conexão com Nuvem Fiscal" }, { status: 500 });
  }
}
