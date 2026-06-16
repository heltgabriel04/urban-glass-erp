-- PASSO 1: confirma que os dados ainda existem (rode primeiro, deve mostrar linhas)
SELECT chave, jsonb_typeof(valor::jsonb) as tipo FROM pos_financeira;

-- PASSO 2: desativa RLS temporariamente para restaurar acesso imediato
ALTER TABLE pos_financeira DISABLE ROW LEVEL SECURITY;
