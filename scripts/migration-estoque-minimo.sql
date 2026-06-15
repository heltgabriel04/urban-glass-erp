-- ============================================================
-- Estoque mínimo / ponto de ruptura — KPI de estoque ausente na auditoria.
-- Rodar no SQL Editor do Supabase.
-- ============================================================
alter table public.estoque
  add column if not exists estoque_minimo_chapas numeric not null default 0;

-- Um item está "em ruptura" quando chapas_saldo <= estoque_minimo_chapas
-- (com mínimo > 0). O cálculo é feito no app.
