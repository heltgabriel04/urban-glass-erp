import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const { data: itens, error } = await supabase
    .from("itens_pedido")
    .select("id, pedido_id, largura, altura, quantidade")
    .eq("vidro_cliente", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!itens || itens.length === 0) return NextResponse.json({ fixed: 0, pedidos: 0 });

  // Atualiza todos os itens em paralelo
  await Promise.all(
    itens.map(item => {
      const ml = parseFloat((((item.largura / 1000) + (item.altura / 1000)) * item.quantidade).toFixed(4));
      return supabase.from("itens_pedido").update({ m2: ml }).eq("id", item.id);
    })
  );

  // Recalcula m2_total de cada pedido afetado em paralelo
  const pedidosAfetados = [...new Set(itens.map(i => i.pedido_id))];

  const itensPorPedido = await Promise.all(
    pedidosAfetados.map(id =>
      supabase.from("itens_pedido").select("m2").eq("pedido_id", id)
    )
  );

  await Promise.all(
    pedidosAfetados.map((id, idx) => {
      const total = parseFloat(
        ((itensPorPedido[idx].data ?? []).reduce((s, i) => s + Number(i.m2), 0)).toFixed(4)
      );
      return supabase.from("pedidos").update({ m2_total: total }).eq("id", id);
    })
  );

  return NextResponse.json({ fixed: itens.length, pedidos: pedidosAfetados.length });
}
