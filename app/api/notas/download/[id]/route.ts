import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/auth/api-guard";

function getBaseUrl(): string {
  return (process.env.FOCUSNFE_AMBIENTE ?? "homologacao") === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function basicAuth(token: string): string {
  return "Basic " + Buffer.from(token + ":").toString("base64");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const tipo = req.nextUrl.searchParams.get("tipo") ?? "danfe";

  const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: nota } = await sb
    .from("notas_fiscais")
    .select("nuvem_fiscal_id, danfe_url, xml_url, numero")
    .eq("id", id)
    .single();

  if (!nota?.nuvem_fiscal_id) {
    return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
  }

  const token = process.env.FOCUSNFE_TOKEN ?? "";
  const base  = getBaseUrl();
  const ref   = nota.nuvem_fiscal_id;

  // Monta URL: usa o caminho armazenado se disponível, senão constrói
  let url: string;
  let filename: string;
  let contentType: string;

  if (tipo === "xml") {
    const path = nota.xml_url && !nota.xml_url.startsWith("http")
      ? nota.xml_url
      : `/v2/nfe/${encodeURIComponent(ref)}/download_xml`;
    url         = `${base}${path}`;
    filename    = `nfe_${nota.numero ?? ref}.xml`;
    contentType = "application/xml";
  } else {
    const path = nota.danfe_url && !nota.danfe_url.startsWith("http")
      ? nota.danfe_url
      : `/v2/nfe/${encodeURIComponent(ref)}/danfe`;
    url         = `${base}${path}`;
    filename    = `danfe_${nota.numero ?? ref}.pdf`;
    contentType = "application/pdf";
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: basicAuth(token) },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("download FocusNFe:", res.status, text);
      return NextResponse.json({ error: "Erro ao baixar arquivo no FocusNFe" }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":        contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (err) {
    console.error("api/notas/download:", err);
    return NextResponse.json({ error: "Erro de conexão com FocusNFe" }, { status: 500 });
  }
}
