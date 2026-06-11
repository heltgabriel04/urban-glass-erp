-- Migration: checklist de expedição por pedido
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS checklist_expedicao (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id  TEXT        NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'em_andamento',  -- 'em_andamento' | 'concluido'
  dados      JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE checklist_expedicao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON checklist_expedicao FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON checklist_expedicao FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update" ON checklist_expedicao FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete" ON checklist_expedicao FOR DELETE USING (auth.role() = 'authenticated');
