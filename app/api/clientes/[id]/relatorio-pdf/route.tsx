import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth } from "@/lib/auth/api-guard";
import { RelatorioClienteDocument, type RelatorioClienteDados, type PedidoRelatorio } from "@/lib/pdf/relatorioCliente";
import { valorComIpi } from "@/lib/pedidoIpi";
import type { Cliente, Pedido, Lancamento } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now();
  const denied = await requireAuth();
  if (denied) return denied;
  console.log(`[relatorio-pdf] requireAuth: ${Date.now() - t0}ms`);

  const { id } = await params;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const t1 = Date.now();
  const { data: cliente, error: errCliente } = await sb
    .from("clientes")
    .select("*")
    .eq("id", id)
    .single();
  console.log(`[relatorio-pdf] busca cliente: ${Date.now() - t1}ms`);

  if (errCliente || !cliente) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const t2 = Date.now();
  const [{ data: pedidosData }, { data: lancData }] = await Promise.all([
    sb.from("pedidos")
      .select("*, itens_pedido(*, produtos(id, unidade))")
      .eq("cliente_id", id)
      .neq("status", "Cancelado")
      .order("dt_pedido", { ascending: false }),
    sb.from("lancamentos")
      .select("*")
      .eq("cliente_id", id)
      .eq("tipo", "Entrada")
      .eq("status", "A Receber")
      .order("vencimento", { ascending: true }),
  ]);
  console.log(`[relatorio-pdf] busca pedidos+lancamentos: ${Date.now() - t2}ms`);

  const pedidosRows = (pedidosData ?? []) as Pedido[];
  const lancamentos = (lancData ?? []) as Lancamento[];

  const parcelasPorPedido = new Map<string, { vencimento: string | null; valor: number }[]>();
  for (const l of lancamentos) {
    if (!l.pedido_id) continue;
    const lista = parcelasPorPedido.get(l.pedido_id) ?? [];
    lista.push({ vencimento: l.vencimento, valor: l.valor });
    parcelasPorPedido.set(l.pedido_id, lista);
  }

  const pedidos: PedidoRelatorio[] = pedidosRows.map((pedido) => {
    const itens = pedido.itens_pedido ?? [];
    const isML = itens.length > 0 && itens.every(
      (i) => i.produtos?.unidade === "ml"
    );
    const totalComIpi = valorComIpi(pedido);
    return {
      pedido,
      totalComIpi,
      quitado: Number(pedido.valor_recebido) >= totalComIpi - 0.02,
      isML,
      parcelasPendentes: parcelasPorPedido.get(pedido.id) ?? [],
    };
  });

  const totalFaturado = pedidos.reduce((a, p) => a + p.totalComIpi, 0);
  const totalRecebido = pedidosRows.reduce((a, p) => a + Number(p.valor_recebido), 0);
  const totalAberto = totalFaturado - totalRecebido;
  const ticketMedio = pedidos.length > 0 ? totalFaturado / pedidos.length : 0;

  // KPIs refletem o histórico completo do cliente; a listagem detalhada
  // abaixo, por pedido, so pedidos ainda em aberto — pedidos quitados
  // não precisam constar no relatório enviado ao cliente.
  const pedidosEmAberto = pedidos.filter((p) => !p.quitado);

  const dados: RelatorioClienteDados = {
    cliente: cliente as Cliente,
    totalFaturado, totalRecebido, totalAberto, ticketMedio,
    pedidos: pedidosEmAberto,
  };

  const t3 = Date.now();
  const buffer = await renderToBuffer(<RelatorioClienteDocument dados={dados} />);
  console.log(`[relatorio-pdf] renderToBuffer: ${Date.now() - t3}ms | total: ${Date.now() - t0}ms`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-cliente_${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
