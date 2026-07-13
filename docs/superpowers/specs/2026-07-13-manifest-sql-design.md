# Manifest de Migrações SQL

**Origem**: item "Migrations sem versionamento" do backlog da auditoria geral do ERP. Sub-projeto 1 de 7 de uma segunda leva sobre o backlog (migrations → alertas → financeiro na exportação → acessibilidade → cotação de compras → CRM → SIEG).

## Problema

85 arquivos `.sql` (74 em `sql/`, 11 em `scripts/`), sem CLI do Supabase configurada. O controle de "o que já rodou" vivia só na memória de sessão do Claude — perdido entre conversas.

## Decisões (confirmadas com o usuário)

- Solução: um `sql/MANIFEST.md` único, sem tocar nos 85 arquivos existentes (nem renomear, nem reordenar fisicamente).
- Ordem: cronológica pela data do primeiro commit no git de cada arquivo (proxy real de quando foi escrito/rodado).
- Sem tabela de controle no banco (`schema_migrations`) — descartado por adicionar fricção ao fluxo real (colar no SQL Editor) sem ganho proporcional.
- Convenção daí pra frente: todo `.sql` novo ganha uma linha no manifest no momento em que é criado.

## Conteúdo

Tabela com 84 linhas (data | arquivo | descrição de 1 linha extraída do primeiro comentário útil do próprio arquivo | status). Status `✅ aplicado` (assumido pra tudo que já está em produção funcionando), exceto:
- `sql/contabilidade-fase4-04-checklist-ativa-cartoes.sql` → `⚠ pendente de confirmação` (usuário selecionou esse arquivo na conversa, sinal de que pode não ter rodado ainda).
- `sql/limpar-programacao-producao.sql` e `sql/diagnostico-migracoes-pendentes.sql` → `🔧 utilitário` (não são migrations de schema, são scripts de manutenção/diagnóstico).

## Fora de escopo

- Renomear/reordenar os 85 arquivos fisicamente.
- Adotar a CLI do Supabase (`supabase/migrations/`) — mudança de fluxo maior, não pedida.
- Tabela de controle programática no banco.

## Teste

Não aplicável — arquivo de documentação, não altera schema nem código executável.
