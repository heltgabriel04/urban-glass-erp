-- Corrige RLS da pos_financeira para liberar acesso a todos os usuários autenticados
-- Os dados desta tabela são compartilhados (posição financeira global da empresa)

-- Remove políticas existentes
DROP POLICY IF EXISTS "pos_financeira_select" ON pos_financeira;
DROP POLICY IF EXISTS "pos_financeira_insert" ON pos_financeira;
DROP POLICY IF EXISTS "pos_financeira_update" ON pos_financeira;
DROP POLICY IF EXISTS "pos_financeira_delete" ON pos_financeira;
DROP POLICY IF EXISTS "Allow all" ON pos_financeira;
DROP POLICY IF EXISTS "Enable read access for all users" ON pos_financeira;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON pos_financeira;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON pos_financeira;

-- Garante que RLS está ativo
ALTER TABLE pos_financeira ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado
CREATE POLICY "pos_financeira_select"
  ON pos_financeira FOR SELECT
  TO authenticated
  USING (true);

-- Inserção: qualquer usuário autenticado
CREATE POLICY "pos_financeira_insert"
  ON pos_financeira FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Atualização: qualquer usuário autenticado
CREATE POLICY "pos_financeira_update"
  ON pos_financeira FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Exclusão: qualquer usuário autenticado
CREATE POLICY "pos_financeira_delete"
  ON pos_financeira FOR DELETE
  TO authenticated
  USING (true);
