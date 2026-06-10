import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  // Busca todos os itens com vidro_cliente = true
  const { data: itens, error } = await supabase
    .from("itens_pedido")
    .select("id, pedido_id, largura, altura, quantidade, valor_m2")
    .eq("vidro_cliente", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!itens || itens.length === 0) return NextResponse.json({ fixed: 0 });

  // Atualiza m2 de cada item para o valor em ml
  for (const item of itens) {
    const ml = ((item.largura / 1000) + (item.altura / 1000)) * item.quantidade;
    await supabase
      .from("itens_pedido")
      .update({ m2: parseFloat(ml.toFixed(4)) })
      .eq("id", item.id);
  }

  // Recalcula m2_total de cada pedido afetado
  const pedidosAfetados = [...new Set(itens.map(i => i.pedido_id))];
  for (const pedidoId of pedidosAfetados) {
    const { data: todosItens } = await supabase
      .from("itens_pedido")
      .select("m2")
      .eq("pedido_id", pedidoId);

    const novoTotal = (todosItens ?? []).reduce((s, i) => s + Number(i.m2), 0);
    await supabase
      .from("pedidos")
      .update({ m2_total: parseFloat(novoTotal.toFixed(4)) })
      .eq("id", pedidoId);
  }

  return NextResponse.json({ fixed: itens.length, pedidos: pedidosAfetados.length });
}
