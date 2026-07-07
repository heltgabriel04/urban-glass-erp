-- Observações informais do pedido: múltiplas anotações datadas (ex.: "entregador
-- quebrou 4 vidros ontem"), diferente do campo único `pedidos.obs` (nota única,
-- sobrescrita a cada edição) e do módulo formal de Não Conformidade (fluxo de
-- qualidade com gravidade/status). Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS pedido_observacoes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id     TEXT        NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  usuario_email TEXT,
  texto         TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_observacoes_pedido_id ON pedido_observacoes(pedido_id);

ALTER TABLE pedido_observacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON pedido_observacoes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON pedido_observacoes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_delete" ON pedido_observacoes FOR DELETE USING (auth.role() = 'authenticated');
