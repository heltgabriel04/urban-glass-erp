import { NextRequest, NextResponse } from "next/server";

const NF_API = "https://api.nuvemfiscal.com.br";

export async function POST(req: NextRequest) {
  const payload = await req.json();

  const token       = process.env.NUVEM_FISCAL_TOKEN ?? "";
  const ambiente    = process.env.NUVEM_FISCAL_AMBIENTE ?? "homologacao";
  const emitenteCnpj = process.env.EMITENTE_CNPJ ?? "";

  // Injeta server-side: ambiente e emitente nunca vêm do cliente
  const body = { ...payload, ambiente, emitente: { cpf_cnpj: emitenteCnpj } };

  try {
    const res = await fetch(`${NF_API}/nfe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    console.error("api/notas/emitir:", err);
    return NextResponse.json({ message: "Erro de conexão com Nuvem Fiscal" }, { status: 500 });
  }
}
