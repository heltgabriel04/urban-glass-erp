-- Retirada parcial por viagem (cabeçalho + itens), motivado pelo pedido P-057:
-- clientes buscam os vidros em várias viagens conforme as peças ficam prontas.
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS retiradas_pedido (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id   TEXT        NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  dt_retirada DATE        NOT NULL DEFAULT CURRENT_DATE,
  motorista   TEXT,
  veiculo     TEXT,
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retiradas_pedido_pedido_id ON retiradas_pedido(pedido_id);

CREATE TABLE IF NOT EXISTS retiradas_pedido_itens (
  id             BIGSERIAL   PRIMARY KEY,
  retirada_id    UUID        NOT NULL REFERENCES retiradas_pedido(id) ON DELETE CASCADE,
  item_pedido_id BIGINT      NOT NULL REFERENCES itens_pedido(id) ON DELETE CASCADE,
  quantidade     INTEGER     NOT NULL CHECK (quantidade > 0),
  obs            TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retiradas_pedido_itens_retirada_id    ON retiradas_pedido_itens(retirada_id);
CREATE INDEX IF NOT EXISTS idx_retiradas_pedido_itens_item_pedido_id ON retiradas_pedido_itens(item_pedido_id);

ALTER TABLE retiradas_pedido       ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiradas_pedido_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON retiradas_pedido FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON retiradas_pedido FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update" ON retiradas_pedido FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete" ON retiradas_pedido FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "auth_select" ON retiradas_pedido_itens FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON retiradas_pedido_itens FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update" ON retiradas_pedido_itens FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete" ON retiradas_pedido_itens FOR DELETE USING (auth.role() = 'authenticated');
