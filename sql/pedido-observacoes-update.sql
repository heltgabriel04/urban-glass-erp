-- Falta a policy de UPDATE em pedido_observacoes (só existiam SELECT/INSERT/DELETE em
-- sql/pedido-observacoes.sql). Sem ela, editar o texto de uma nota já criada é
-- bloqueado pelo RLS. Execute no SQL Editor do Supabase.

CREATE POLICY "auth_update" ON pedido_observacoes FOR UPDATE USING (auth.role() = 'authenticated');
