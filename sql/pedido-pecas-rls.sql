-- pedido_pecas foi criada em sql/pedido-pecas-scan.sql sem nenhum
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY nem CREATE POLICY. Teste com a
-- anon key (sem sessão) confirmou que ler por qr_token retorna vazio sem
-- erro — assinatura de RLS bloqueando silenciosamente por falta de policy.
-- Sem isso, a tela de scan (/pedidos/[id]/producao/peca/[token]) não
-- consegue ler a peça mesmo com o operador logado.
-- Execute no SQL Editor do Supabase.

ALTER TABLE pedido_pecas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select" ON pedido_pecas;
CREATE POLICY "auth_select" ON pedido_pecas FOR SELECT USING (auth.role() = 'authenticated');

-- Verificação — cole o resultado desta query de volta: ela mostra TODAS as
-- policies existentes na tabela agora, incluindo qualquer uma manual que já
-- existisse antes desta migration (o que eu não consigo enxergar sozinho).
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'pedido_pecas';
