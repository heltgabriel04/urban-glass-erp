-- Correção de integridade — deletarPedido vira uma transação atômica
--
-- Achado da auditoria crítica de 2026-07-10: services/pedidos.service.ts
-- (deletarPedido) fazia 12+ deletes/updates sequenciais direto do
-- client, sem transação (uma falha no meio deixa o pedido parcialmente
-- excluído), e apagava fisicamente TODOS os lançamentos do pedido —
-- inclusive os que já tinham baixa/pagamento registrado, destruindo
-- histórico financeiro. Substitui por uma função Postgres (roda numa
-- transação só) que replica exatamente a mesma cascata que já existia
-- em JS, corrigindo só a regra de lançamentos: sem baixa -> apaga de
-- verdade; com baixa (mesmo estornada) -> soft-delete, mesmo critério
-- já usado em excluirLancamento (services/lancamentos.service.ts).
--
-- Existe um rascunho antigo e nunca adotado dessa função em
-- scripts/migration-delete-pedido-rpc.sql — está desatualizado (não
-- inclui retrabalhos/quebras/não-conformidades/retiradas/checklist,
-- e apaga retalhos em vez de só desvincular). Esta versão substitui
-- por completo, mesmo nome de função.
--
-- Rodar no Supabase → SQL Editor. Idempotente (create or replace).

-- Assinatura antiga (scripts/migration-delete-pedido-rpc.sql), se chegou
-- a ser criada — remove pra não coexistir com a nova como um overload morto.
drop function if exists delete_pedido_cascade(text, jsonb);

create or replace function delete_pedido_cascade(p_pedido_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov record;
  v_estoque record;
  v_item record;
  v_lanc record;
  v_novo_saldo_chapas numeric;
  v_novo_saldo_m2 numeric;
  v_novo_consumido numeric;
  v_tem_baixa boolean;
begin
  -- 1) Reverte estoque consumido pelo plano de otimização do pedido
  for v_mov in
    select id, produto_id, chapas, m2 from estoque_movimentacoes
    where origem_tipo = 'otimizacao' and origem_id = p_pedido_id
  loop
    select id, chapas_saldo, m2_saldo, m2_consumido into v_estoque
      from estoque where produto_id = v_mov.produto_id limit 1;

    if found then
      v_novo_saldo_chapas := greatest(0, v_estoque.chapas_saldo - v_mov.chapas);
      v_novo_saldo_m2     := greatest(0, round((v_estoque.m2_saldo - v_mov.m2)::numeric, 4));
      if v_mov.m2 < 0 then
        v_novo_consumido := greatest(0, round((v_estoque.m2_consumido + v_mov.m2)::numeric, 4));
      else
        v_novo_consumido := v_estoque.m2_consumido;
      end if;

      update estoque set
        chapas_saldo = v_novo_saldo_chapas,
        m2_saldo = v_novo_saldo_m2,
        m2_consumido = v_novo_consumido,
        updated_at = now()
      where id = v_estoque.id;
    end if;

    delete from estoque_movimentacoes where id = v_mov.id;
  end loop;

  -- 2) Reverte estoque consumido por chapa avulsa vendida item a item
  for v_item in select id from itens_pedido where pedido_id = p_pedido_id loop
    for v_mov in
      select id, produto_id, chapas, m2 from estoque_movimentacoes
      where origem_tipo = 'pedido_chapa' and origem_id = v_item.id::text
    loop
      select id, chapas_saldo, m2_saldo, m2_consumido into v_estoque
        from estoque where produto_id = v_mov.produto_id limit 1;

      if found then
        v_novo_saldo_chapas := greatest(0, v_estoque.chapas_saldo - v_mov.chapas);
        v_novo_saldo_m2     := greatest(0, round((v_estoque.m2_saldo - v_mov.m2)::numeric, 4));
        if v_mov.m2 < 0 then
          v_novo_consumido := greatest(0, round((v_estoque.m2_consumido + v_mov.m2)::numeric, 4));
        else
          v_novo_consumido := v_estoque.m2_consumido;
        end if;

        update estoque set
          chapas_saldo = v_novo_saldo_chapas,
          m2_saldo = v_novo_saldo_m2,
          m2_consumido = v_novo_consumido,
          updated_at = now()
        where id = v_estoque.id;
      end if;

      delete from estoque_movimentacoes where id = v_mov.id;
    end loop;
  end loop;

  -- 3) Material do cliente vinculado ao pedido
  delete from material_cliente_mov where pedido_id = p_pedido_id;

  -- 4) Lançamentos: sem baixa (nem estornada) -> apaga de verdade;
  --    com baixa -> soft-delete (preserva histórico financeiro)
  for v_lanc in select id from lancamentos where pedido_id = p_pedido_id loop
    select exists(select 1 from baixas_lancamento where lancamento_id = v_lanc.id) into v_tem_baixa;
    if v_tem_baixa then
      update lancamentos set
        deletado_em = now(),
        deletado_por = null,
        deletado_motivo = 'Exclusão do pedido ' || p_pedido_id
      where id = v_lanc.id;
    else
      delete from lancamentos where id = v_lanc.id;
    end if;
  end loop;

  -- 5) Demais registros filhos
  delete from retrabalhos where pedido_id = p_pedido_id;
  delete from quebras where pedido_id = p_pedido_id;
  delete from nao_conformidades where pedido_id = p_pedido_id;
  delete from retalhos_uso where pedido_id = p_pedido_id;
  -- retalhos são inventário físico real — desvincula, não apaga
  update retalhos set pedido_origem = null where pedido_origem = p_pedido_id;
  delete from retiradas_pedido where pedido_id = p_pedido_id;
  delete from itens_pedido where pedido_id = p_pedido_id;
  delete from historico_otimizador where pedido_id = p_pedido_id;
  delete from checklist_expedicao where pedido_id = p_pedido_id;
  -- nota fiscal pode precisar persistir mesmo sem o pedido
  update notas_fiscais set pedido_id = null where pedido_id = p_pedido_id;

  -- 6) O pedido em si
  delete from pedidos where id = p_pedido_id;
end;
$$;

revoke all on function delete_pedido_cascade(text) from public, anon;
grant execute on function delete_pedido_cascade(text) to authenticated;
