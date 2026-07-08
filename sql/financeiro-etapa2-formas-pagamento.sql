-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote B — Formas de Pagamento (fonte única)
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS formas_pagamento (
  id          serial PRIMARY KEY,
  nome        text NOT NULL UNIQUE,
  ativo       boolean DEFAULT true,
  taxa_pct    numeric(6,3),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE formas_pagamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "formas_pagamento_read"  ON formas_pagamento;
DROP POLICY IF EXISTS "formas_pagamento_write" ON formas_pagamento;
CREATE POLICY "formas_pagamento_read"  ON formas_pagamento FOR SELECT TO authenticated USING (true);
CREATE POLICY "formas_pagamento_write" ON formas_pagamento FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO formas_pagamento (nome) VALUES
  ('Dinheiro'), ('PIX'), ('Boleto'), ('Cartão'), ('Cheque'), ('A Prazo')
ON CONFLICT (nome) DO NOTHING;
