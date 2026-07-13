# Manifest de migrações SQL

Fonte única da verdade de quais migrações existem e em que ordem foram
escritas. Este projeto não usa a CLI do Supabase (`supabase/migrations/`) —
o fluxo real é: Claude escreve o arquivo `.sql` em `sql/` ou `scripts/`,
cola no SQL Editor do Supabase, confirma verbalmente que rodou. Sem este
arquivo, essa confirmação só existia na memória de sessão do Claude — se
uma conversa nova começasse do zero, a informação se perdia.

**Convenção daqui pra frente**: toda vez que um arquivo `.sql` novo for
criado em `sql/` ou `scripts/`, adicionar uma linha nova no fim da tabela
abaixo (data de hoje, caminho, descrição de 1 linha, status `⏳ pendente`
até o usuário confirmar que rodou — só então virar `✅ aplicado`).

Os arquivos não foram renomeados nem reordenados fisicamente — a ordem
abaixo é cronológica pela data do primeiro commit de cada um (`git log`),
que é a ordem real em que foram escritos e (presumivelmente) rodados.

## Status

- ✅ **aplicado** — confirmado rodado (pela conversa em que foi criado) ou
  assumido rodado (sistema em produção, funcionando, sem sinal de que
  ficou pendente).
- ⚠ **pendente de confirmação** — existe indicação explícita de que ainda
  não foi confirmado como rodado.
- 🔧 **utilitário** — script de diagnóstico/consulta, não altera schema,
  não se aplica o conceito de "rodar uma vez".

## Migrações

| Data | Arquivo | Descrição | Status |
|---|---|---|---|
| 2026-06-11 | `scripts/migration-checklist-expedicao.sql` | Checklist de expedição por pedido | ✅ |
| 2026-06-11 | `scripts/migration-config-fiscal-padrao.sql` | Tabela de parâmetros fiscais padrão da empresa | ✅ |
| 2026-06-15 | `scripts/migration-delete-pedido-rpc.sql` | Exclusão de pedido atômica (versão antiga, superada por `seguranca-02-deletar-pedido-atomico.sql`) | ✅ |
| 2026-06-15 | `scripts/migration-estoque-minimo.sql` | Estoque mínimo / ponto de ruptura | ✅ |
| 2026-06-15 | `scripts/migration-fornecedores.sql` | Módulo Fornecedores — cadastro | ✅ |
| 2026-06-15 | `scripts/migration-rls-baseline.sql` | Habilita RLS (Row Level Security) — baseline | ✅ |
| 2026-06-15 | `scripts/migration-rls-roles.sql` | Endurecimento de RLS por perfil (`user_role` no JWT) | ✅ |
| 2026-06-15 | `scripts/migration-user-role-hook.sql` | Custom Access Token Hook — injeta `user_role` no JWT | ✅ |
| 2026-06-15 | `scripts/qualidade_migration.sql` | Módulo de Qualidade e Não Conformidades | ✅ |
| 2026-06-15 | `scripts/qualidade_storage.sql` | Bucket de Storage para Fotos de NCs | ✅ |
| 2026-06-16 | `sql/fix-pos-financeira-rls.sql` | Fix de RLS em posição financeira | ✅ |
| 2026-06-16 | `sql/lancamentos-migrate.sql` | Colunas de Contas a Pagar/Receber em `lancamentos` | ✅ |
| 2026-06-16 | `sql/plano-contas.sql` | Plano de Contas | ✅ |
| 2026-06-19 | `sql/estoque-livro-razao.sql` | Reestruturação de estoque/produção — Fase 1 | ✅ |
| 2026-06-19 | `sql/fase2-vidro-cliente-retalhos.sql` | Reestruturação de estoque/produção — Fase 2 | ✅ |
| 2026-06-19 | `sql/fase4-compras.sql` | Reestruturação de estoque/produção — Fase 4 | ✅ |
| 2026-06-19 | `sql/itens-pedido-codigo-adicional.sql` | Código adicional por peça | ✅ |
| 2026-06-22 | `sql/retiradas-pedido.sql` | Retirada parcial por viagem (cabeçalho + itens) | ✅ |
| 2026-06-23 | `sql/etiqueta-qr-romaneio.sql` | QR estável na etiqueta física | ✅ |
| 2026-06-23 | `sql/log-atividades.sql` | Recria a tabela `log_atividades` | ✅ |
| 2026-06-23 | `sql/orcamento-arquivo-assinado.sql` | Upload do orçamento assinado pelo cliente | ✅ |
| 2026-06-23 | `sql/pedido-romaneio-assinado.sql` | Upload do romaneio assinado | ✅ |
| 2026-06-25 | `sql/retalhos-box-espessura.sql` | Reorganização de retalhos por box/espessura | ✅ |
| 2026-06-25 | `sql/retalhos-observacao.sql` | Campo de observação/cliente nos retalhos | ✅ |
| 2026-06-26 | `sql/add-nfe-boleto-cols.sql` | Colunas de NF-e e boleto em `pedidos` | ✅ |
| 2026-06-26 | `sql/criar-buckets-storage.sql` | Buckets de storage pra NF-e e Boleto | ✅ |
| 2026-06-29 | `sql/fase1-estabilidade.sql` | APS — Fase 1: Estabilidade (calendário, constraint, índice) | ✅ |
| 2026-06-29 | `sql/fase2-melhorias.sql` | APS — Fase 2: Bloqueios de linha, retrabalho, calibração | ✅ |
| 2026-06-29 | `sql/fix-programacao-rls.sql` | Fix: desativa RLS nas tabelas de programação | ✅ |
| 2026-06-29 | `sql/programacao-chapas-retiradas.sql` | Retiradas parciais de produção + linha de Separação | ✅ |
| 2026-06-29 | `sql/programacao-producao.sql` | Módulo de Programação da Produção (APS Simplificado) | ✅ |
| 2026-06-30 | `sql/fase3-itens.sql` | APS — Fase 3: agendamento por item | ✅ |
| 2026-06-30 | `sql/fix-estoque-movimentacoes-rls.sql` | Fix: desativa RLS em `estoque_movimentacoes` | ✅ |
| 2026-06-30 | `sql/p059-codigos-tipo.sql` | Ajuste pontual de dados — pedido P-059 | ✅ |
| 2026-07-01 | `sql/ajuste-p057.sql` | Ajuste pontual de dados — pedido P-057 | ✅ |
| 2026-07-01 | `sql/aps-fase2-travado.sql` | APS — Fase 2: coluna `travado` em `programacao_producao` | ✅ |
| 2026-07-01 | `sql/fix-linhas-duplicadas.sql` | Fix de dados — linhas duplicadas em programação | ✅ |
| 2026-07-02 | `sql/ajuste-p060.sql` | Ajuste pontual de dados — pedido P-060 | ✅ |
| 2026-07-02 | `sql/fase5-permite-sobreposicao.sql` | APS — Fase 5: permite sobrepor pedidos na mesma linha | ✅ |
| 2026-07-02 | `sql/fase6-bloco-finalizado.sql` | APS — Fase 6: bloco "Finalizado" separado de "Separação" | ✅ |
| 2026-07-02 | `sql/fase8-desconto-setup.sql` | APS — Fase 8: desconto de setup economizado | ✅ |
| 2026-07-06 | `sql/ajuste-p061.sql` | Ajuste pontual de dados — pedido P-061 | ✅ |
| 2026-07-06 | `sql/limpar-programacao-producao.sql` | Utilitário: limpa toda a agenda da Programação | 🔧 |
| 2026-07-07 | `sql/pedido-observacoes.sql` | Observações informais do pedido (múltiplas anotações datadas) | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-adiantamentos.sql` | Financeiro Etapa 2 · Lote E — Adiantamento/Reembolso/Devolução | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-bloqueio-credito.sql` | Financeiro Etapa 2 · Lote F — Bloqueio de crédito | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-conciliacao.sql` | Financeiro Etapa 2 · Lote J — Conciliação Bancária | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-formas-pagamento.sql` | Financeiro Etapa 2 · Lote B — Formas de Pagamento | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-historico.sql` | Financeiro Etapa 2 · Lote H — Histórico de versão de lançamento | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-nucleo.sql` | Financeiro Etapa 2 · Lote A — Núcleo de lançamento | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-rateio.sql` | Financeiro Etapa 2 · Lote D — Rateio por Centro de Custo (removido depois, ver `remove-centro-custo.sql`) | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-rbac.sql` | Financeiro Etapa 2 · Lote I — RBAC aditivo (papel "financeiro") | ✅ |
| 2026-07-08 | `sql/financeiro-etapa2-transferencias.sql` | Financeiro Etapa 2 · Lote C — Transferências entre contas | ✅ |
| 2026-07-08 | `sql/financeiro-etapa3-compra-lancamento.sql` | Financeiro Etapa 3 — Compra recebida → conta a pagar automática | ✅ |
| 2026-07-08 | `sql/financeiro-etapa3-filtros-salvos.sql` | Financeiro Etapa 3 — Filtros salvos/favoritos | ✅ |
| 2026-07-08 | `sql/financeiro-fase2.sql` | Financeiro Fase 2 (parte 1) — Fundação financeira + Baixa Parcial | ✅ |
| 2026-07-08 | `sql/financeiro-fase4.sql` | Financeiro Fase 4 — Lançamentos Recorrentes | ✅ |
| 2026-07-09 | `sql/contabilidade-fase1-01-documentos-fiscais.sql` | Contabilidade Fase 1 — Documentos Fiscais | ✅ |
| 2026-07-09 | `sql/contabilidade-fase1-02-checklist.sql` | Contabilidade Fase 1 — Checklist Mensal | ✅ |
| 2026-07-09 | `sql/contabilidade-fase1-03-bucket.sql` | Contabilidade Fase 1 — Bucket de anexos | ✅ |
| 2026-07-09 | `sql/contabilidade-fase2-01-itens-estoque-gerais.sql` | Contabilidade Fase 2 — Itens de estoque geral | ✅ |
| 2026-07-09 | `sql/contabilidade-fase2-02-itens-estoque-movimentacoes.sql` | Contabilidade Fase 2 — Movimentações de estoque geral | ✅ |
| 2026-07-09 | `sql/contabilidade-fase2-03-checklist-ativa-estoque.sql` | Contabilidade Fase 2 — Ativa item de checklist | ✅ |
| 2026-07-09 | `sql/contabilidade-fase2-04-itens-estoque-mov-rls-policies.sql` | Contabilidade Fase 2 — Policies de RLS do ledger | ✅ |
| 2026-07-09 | `sql/contabilidade-fase3-01-ativos-imobilizados.sql` | Contabilidade Fase 3 — Ativo Imobilizado | ✅ |
| 2026-07-09 | `sql/contabilidade-fase3-02-checklist-ativa-ativo-imobilizado.sql` | Contabilidade Fase 3 — Ativa item de checklist | ✅ |
| 2026-07-09 | `sql/diagnostico-migracoes-pendentes.sql` | Utilitário: consulta quais migrações pendentes já rodaram | 🔧 |
| 2026-07-09 | `sql/financeiro-etapa5-metas.sql` | Financeiro Etapa 5.3 — Metas e Acompanhamento | ✅ |
| 2026-07-09 | `sql/financeiro-etapa5-realtime.sql` | Financeiro Etapa 5.5 — Tempo real (Dashboard) | ✅ |
| 2026-07-09 | `sql/financeiro-etapa5-widgets-config.sql` | Financeiro Etapa 5.5 — Widgets configuráveis | ✅ |
| 2026-07-09 | `sql/pedidos-frete.sql` | Campo "Frete" (Retirada/Fretado) em `pedidos` | ✅ |
| 2026-07-09 | `sql/remove-centro-custo.sql` | Remove centro de custo e rateio por completo | ✅ |
| 2026-07-10 | `sql/contabilidade-fase4-01-cartoes.sql` | Contabilidade Fase 4 — Cartões corporativos | ✅ |
| 2026-07-10 | `sql/contabilidade-fase4-02-emprestimos.sql` | Contabilidade Fase 4 — Empréstimos | ✅ |
| 2026-07-10 | `sql/contabilidade-fase4-03-consorcios.sql` | Contabilidade Fase 4 — Consórcios | ✅ |
| 2026-07-10 | `sql/contabilidade-fase4-04-checklist-ativa-cartoes.sql` | Contabilidade Fase 4 — Ativa item "Cartões/Empréstimos/Consórcios" no checklist de fechamentos antigos | ⚠ |
| 2026-07-10 | `sql/contabilidade-fase4-05-cartoes-lancamentos-soft-delete.sql` | Contabilidade Fase 4 — Correção: soft-delete em `cartoes_lancamentos` | ✅ |
| 2026-07-10 | `sql/seguranca-01-reabilita-rls.sql` | Correção de segurança — reabilita RLS em tabelas expostas | ✅ |
| 2026-07-10 | `sql/seguranca-02-deletar-pedido-atomico.sql` | Correção de integridade — `delete_pedido_cascade` atômica | ✅ |
| 2026-07-10 | `sql/seguranca-03-produto-pode-rotacionar.sql` | Correção de risco físico — trava de rotação no otimizador | ✅ |
| 2026-07-10 | `sql/seguranca-04-retrabalho-lancamento.sql` | Correção de integridade — retrabalho gera lançamento financeiro | ✅ |
| 2026-07-13 | `sql/fornecedores-ie-regime.sql` | Fornecedores — Inscrição Estadual + Regime Tributário | ✅ |
| 2026-07-13 | `sql/seguranca-05-restringe-select-financeiro.sql` | Restringe SELECT de 40 tabelas financeiras a admin/financeiro | ✅ |
| 2026-07-13 | `sql/seguranca-06-rpc-cliente-nome-publico.sql` | RPC `get_cliente_nome_publico` (tela de produção) | ✅ |
| 2026-07-13 | `sql/contabilidade-fase6-checklist-ativa-financeiro.sql` | Contabilidade Fase 6 — Ativa item "Financeiro" no checklist de fechamentos antigos | ⏳ |
