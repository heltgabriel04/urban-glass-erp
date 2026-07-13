-- RPC minúscula pra telas do perfil `producao` mostrarem o nome do
-- cliente sem precisar de SELECT na tabela `clientes` inteira (que
-- passou a ser restrita a admin/financeiro em
-- seguranca-05-restringe-select-financeiro.sql). Só devolve `nome` —
-- nenhum outro campo (CPF/CNPJ/crédito/endereço ficam fora).

create or replace function get_cliente_nome_publico(p_cliente_id integer)
returns text
language sql
security definer
set search_path = public
as $$
  select nome from clientes where id = p_cliente_id;
$$;

revoke all on function get_cliente_nome_publico(integer) from public, anon;
grant execute on function get_cliente_nome_publico(integer) to authenticated;
