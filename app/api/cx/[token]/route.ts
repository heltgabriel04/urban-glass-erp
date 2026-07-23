import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { statusCaixa } from "@/lib/caixaEstoque";

// Rota pública (sem auth) — alvo do QR impresso na etiqueta de caixa
// (sub-projeto 3). Mesmo padrão do QR de romaneio de pedido
// (app/api/r/[token]/route.ts): resolve o destino em tempo de leitura,
// nunca no momento da impressão — se a caixa esvaziar depois de
// impressa, quem escanear vê o saldo atual, não o valor antigo.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: caixa } = await sb
    .from("lotes_estoque")
    .select("codigo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, dt_entrada, dt_entrada_estimada, ativo, produtos ( nome )")
    .eq("qr_token", token)
    .maybeSingle();

  if (!caixa || !caixa.ativo) {
    return new NextResponse("Caixa não encontrada ou inativa.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const status = statusCaixa(caixa.chapas_saldo, caixa.chapas_entrada);
  const produtoNome = (caixa.produtos as unknown as { nome: string } | null)?.nome ?? "—";
  const dataEntrada = caixa.dt_entrada_estimada ? "—" : caixa.dt_entrada;
  const corStatus = status === "fechada" ? "#15803d;background:#dcfce7" : status === "aberta" ? "#b45309;background:#fef3c7" : "#b91c1c;background:#fee2e2";

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(caixa.codigo)}</title>
<style>
  body { font-family: Arial, sans-serif; background: #f4f7fa; color: #1e293b; padding: 24px; margin: 0; }
  .card { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(15,23,42,.08); }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .status { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; margin-bottom: 16px; color: ${corStatus}; }
  .linha { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eef2f7; font-size: 14px; }
  .linha span:first-child { color: #64748b; }
  .linha span:last-child { font-weight: 700; }
</style></head>
<body>
  <div class="card">
    <h1>${escapeHtml(caixa.codigo)}</h1>
    <span class="status">${escapeHtml(status.toUpperCase())}</span>
    <div class="linha"><span>Produto</span><span>${escapeHtml(produtoNome)}</span></div>
    <div class="linha"><span>Medida</span><span>${caixa.chapa_largura_mm ?? "—"} × ${caixa.chapa_altura_mm ?? "—"} mm</span></div>
    <div class="linha"><span>Chapas</span><span>${caixa.chapas_saldo} / ${caixa.chapas_entrada}</span></div>
    <div class="linha"><span>m² saldo</span><span>${Number(caixa.m2_saldo).toFixed(2)} m²</span></div>
    <div class="linha"><span>Data de entrada</span><span>${escapeHtml(dataEntrada)}</span></div>
  </div>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
