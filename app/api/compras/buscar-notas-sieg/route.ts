import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";

export interface NotaSieg {
  chaveAcesso: string;
  numeroNF: string | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  dataEmissao: string | null;
  xml: string;
}

// Chamada real à API da SIEG — DETALHES AINDA NÃO CONFIRMADOS pelo
// usuário (endpoint, forma de autenticação, formato de resposta, se
// cobre NF-e de entrada sem certificado digital A1 cadastrado no
// painel deles). Ver
// docs/superpowers/specs/2026-07-20-captacao-nfe-entrada-sieg-design.md.
// Isolada nesta única função — quando o contrato real for confirmado,
// só ela precisa mudar; nada na rota, no service client-side nem nos
// componentes depende de como essa chamada é feita por dentro.
async function chamarSiegApi(apiKey: string, inicio: string, fim: string): Promise<NotaSieg[]> {
  throw new Error(
    "Integração com a SIEG ainda não confirmada — endpoint, autenticação e formato de resposta pendentes de confirmação com o suporte deles. Ver docs/superpowers/specs/2026-07-20-captacao-nfe-entrada-sieg-design.md."
  );
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const apiKey = process.env.SIEG_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "SIEG_API_KEY não configurada" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  if (!inicio || !fim) {
    return NextResponse.json({ error: "Parâmetros 'inicio' e 'fim' são obrigatórios" }, { status: 400 });
  }

  try {
    const notas = await chamarSiegApi(apiKey, inicio, fim);
    return NextResponse.json({ notas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro de conexão com a SIEG";
    console.error("api/compras/buscar-notas-sieg:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
