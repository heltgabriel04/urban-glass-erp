-- Módulo Contabilidade — Fase 2
-- O SQL 02 (itens-estoque-movimentacoes.sql) foi escrito prevendo RLS
-- DESABILITADO nesta tabela (mesmo padrão do ledger de vidro,
-- estoque_movimentacoes) — mas foi rodado com RLS habilitado. Sem
-- policies, RLS habilitado nega TODO acesso (select/insert/delete) pra
-- quem usa a chave autenticada normal, que é como o app acessa — sem
-- isso, a Fase 2 inteira (cadastro de item funciona, mas nenhuma
-- movimentação consegue ser lida, criada ou revertida) fica quebrada.
--
-- Este SQL cria as policies necessárias mantendo RLS habilitado (mais
-- seguro que desabilitar, é a escolha do usuário — respeitada aqui).
-- Precisa de policy de DELETE (diferente de documentos_fiscais, que só
-- usa soft-delete) porque reverterMovimentacaoItem() faz DELETE físico
-- de verdade nas linhas revertidas.
-- Rodar no Supabase → SQL Editor.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'itens_estoque_movimentacoes') THEN
    CREATE POLICY "auth_select" ON itens_estoque_movimentacoes FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'itens_estoque_movimentacoes') THEN
    CREATE POLICY "auth_insert" ON itens_estoque_movimentacoes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete' AND tablename = 'itens_estoque_movimentacoes') THEN
    CREATE POLICY "auth_delete" ON itens_estoque_movimentacoes FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Verificação: confirma que RLS está habilitado e as 3 policies existem
SELECT relrowsecurity FROM pg_class WHERE relname = 'itens_estoque_movimentacoes';
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'itens_estoque_movimentacoes';
