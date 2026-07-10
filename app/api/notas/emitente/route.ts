import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api-guard";

export async function GET() {
  const denied = await requireRole(["admin", "financeiro"]);
  if (denied) return denied;

  return NextResponse.json({
    nome:       process.env.EMITENTE_NOME              ?? "",
    fantasia:   process.env.EMITENTE_NOME_FANTASIA     ?? process.env.EMITENTE_NOME ?? "",
    cnpj:       process.env.EMITENTE_CNPJ              ?? "",
    ie:         process.env.EMITENTE_IE                ?? "",
    logradouro: process.env.EMITENTE_LOGRADOURO        ?? "",
    numero:     process.env.EMITENTE_NUMERO            ?? "",
    bairro:     process.env.EMITENTE_BAIRRO            ?? "",
    municipio:  process.env.EMITENTE_MUNICIPIO         ?? "",
    uf:         process.env.EMITENTE_UF                ?? "",
    cep:        process.env.EMITENTE_CEP               ?? "",
  });
}
