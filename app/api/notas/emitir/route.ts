import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { emitirNotaSchema } from "@/lib/validation/api";

function getBaseUrl(): string {
  return (process.env.FOCUSNFE_AMBIENTE ?? "homologacao") === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function basicAuth(token: string): string {
  return "Basic " + Buffer.from(token + ":").toString("base64");
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ message: "JSON inválido" }, { status: 400 }); }

  const parsed = emitirNotaSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Payload inválido", detalhes: parsed.error.flatten() }, { status: 400 });
  }
  const { ref, payload } = parsed.data;

  const token = process.env.FOCUSNFE_TOKEN ?? "";

  // Injeta todos os dados do emitente server-side
  const body = {
    ...payload,
    cnpj_emitente:               process.env.EMITENTE_CNPJ              ?? "",
    nome_emitente:               process.env.EMITENTE_NOME              ?? "",
    nome_fantasia_emitente:      process.env.EMITENTE_NOME_FANTASIA     ?? process.env.EMITENTE_NOME ?? "",
    logradouro_emitente:         process.env.EMITENTE_LOGRADOURO        ?? "",
    numero_emitente:             process.env.EMITENTE_NUMERO            ?? "S/N",
    bairro_emitente:             process.env.EMITENTE_BAIRRO            ?? "",
    municipio_emitente:          process.env.EMITENTE_MUNICIPIO         ?? "",
    uf_emitente:                 process.env.EMITENTE_UF                ?? "",
    cep_emitente:                process.env.EMITENTE_CEP               ?? "",
    inscricao_estadual_emitente: process.env.EMITENTE_IE                ?? "",
  };

  try {
    const res = await fetch(
      `${getBaseUrl()}/v2/nfe?ref=${encodeURIComponent(ref)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: basicAuth(token),
        },
        body: JSON.stringify(body),
      }
    );
    const json = await res.json();
    // Devolve o ref junto para o service poder armazenar
    return NextResponse.json({ ...json, ref }, { status: res.status });
  } catch (err) {
    console.error("api/notas/emitir:", err);
    return NextResponse.json({ message: "Erro de conexão com FocusNFe" }, { status: 500 });
  }
}
