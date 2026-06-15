-- ============================================================
-- Item 3 — Exclusão de pedido atômica
-- Substitui as 7 chamadas sequenciais do client por UMA transação.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create or replace function delete_pedido_cascade(
  p_pedido_id      text,
  p_estoque_revert jsonb default '[]'::jsonb  -- [{ "prod": "...", "chapas": 2, "m2": 14.85 }]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb;
begin
  -- 1) Devolve estoque (por nome de produto, como na lógica atual)
  for item in select * from jsonb_array_elements(p_estoque_revert)
  loop
    update estoque e
       set chapas_saldo = e.chapas_saldo + (item->>'chapas')::numeric,
           m2_saldo     = e.m2_saldo     + (item->>'m2')::numeric,
           m2_consumido = greatest(0, e.m2_consumido - (item->>'m2')::numeric),
           updated_at   = now()
      from produtos p
     where e.produto_id = p.id
       and p.nome = item->>'prod';
  end loop;

  -- 2) Cascata de exclusão (tudo na mesma transação)
  delete from retalhos             where pedido_origem = p_pedido_id;
  delete from historico_otimizador where pedido_id     = p_pedido_id;
  -- `otimizacoes` não existe em todos os ambientes — só apaga se existir
  if to_regclass('public.otimizacoes') is not null then
    execute format('delete from public.otimizacoes where pedido_id = %L', p_pedido_id);
  end if;
  delete from lancamentos          where pedido_id     = p_pedido_id;
  delete from itens_pedido         where pedido_id     = p_pedido_id;
  update orcamentos set pedido_id = null where pedido_id = p_pedido_id;
  delete from pedidos              where id            = p_pedido_id;
end;
$$;

-- A função roda como SECURITY DEFINER; só usuários autenticados podem chamá-la.
revoke all on function delete_pedido_cascade(text, jsonb) from public, anon;
grant execute on function delete_pedido_cascade(text, jsonb) to authenticated;
