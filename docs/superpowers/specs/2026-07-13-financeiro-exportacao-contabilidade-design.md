# Financeiro no Pacote de Exportação da Contabilidade

**Origem**: item "Financeiro nunca integrado ao pacote de exportação da Contabilidade" do backlog da auditoria. Sub-projeto 3 de 7 da segunda leva (migrations → alertas → **financeiro na exportação** → acessibilidade → cotação de compras → CRM → SIEG).

## Levantamento

`lib/exportacaoContabilidade.ts` gera o zip mensal com pastas `00-Fechamento` a `04-Cartões/Empréstimos/Consórcios`, todas seguindo o mesmo padrão: planilha xlsx (`construirPlanilha`) + anexos baixados do storage (`anexarArquivo`). `lib/contabilidadeChecklist.ts` tem o catálogo fixo dos itens do checklist mensal (`CHECKLIST_ITENS`, `FASE_ATUAL = 4`) — 100% genérico, a página `/contabilidade/checklist` não precisa de nenhuma mudança pra reconhecer um item novo. `services/contabilidadeDashboard.service.ts` (`getStatusAreas`) calcula o semáforo por área, uma função por área, retornando um array que `/contabilidade` (`app/contabilidade/page.tsx`) renderiza via `.map()` num grid hoje fixo em 4 colunas.

Nenhum dos 3 lugares tem qualquer referência a Financeiro hoje.

## Decisões (confirmadas com o usuário)

- Escopo do pacote: Contas a Pagar do período, Contas a Receber do período, extrato de baixas do período, saldo por conta bancária no fim do mês — 4 planilhas novas.
- Fora de escopo (explicitamente): transferências entre contas, conciliação bancária/extratos importados, lançamentos recorrentes, metas financeiras, DRE/relatório analítico já calculado.
- Novo item no checklist (`financeiro`), fase 6 — mesmo padrão de ativação em fechamentos antigos já usado nas fases 2/3/4 (SQL de migração dedicado).
- Novo semáforo "Financeiro" no dashboard — mesma lógica das outras 4 áreas (vermelho/amarelo/verde), sem regra automática de conclusão do item do checklist (fica manual, igual aos outros).

## 1. Pacote de exportação — `lib/exportacaoContabilidade.ts`

Nova seção `05-Financeiro`, inserida depois da seção `04-Cartões/Empréstimos/Consórcios` e antes do manifest final:

- **Contas a Pagar do período**: `lancamentos` tipo `Saída`, `vencimento` entre `primeiroDia` e `ultimoDia`, `deletado_em is null`.
- **Contas a Receber do período**: mesmo, tipo `Entrada`.
- **Extrato de baixas do período**: `baixas_lancamento` com `data` entre `primeiroDia` e `ultimoDia`, `estornado_em is null`, joined com `lancamentos(descricao, tipo)`.
- **Saldo por conta bancária no fim do mês**: **não** reaproveita `getSaldosPorConta()` (que calcula saldo *atual*, incorreto pra fechamento de mês passado) — query própria em `exportacaoContabilidade.ts`, mesmo cálculo (`saldo_inicial` + baixas creditadas/debitadas), mas filtrando baixas com `data <= ultimoDia` em vez de todas.

## 2. Checklist — `lib/contabilidadeChecklist.ts`

```ts
{ key: "financeiro", label: "Financeiro (Contas a Pagar/Receber)", area: "financeiro", faseDisponivel: 6 },
```

`FASE_ATUAL` sobe de `4` pra `6` (não `5` — Fase 5 já foi usada pra "exportação client-side" do roadmap original, não redefinir seu significado). `ChecklistItemDef.area` ganha `"financeiro"` na união de tipos.

Migration nova `sql/contabilidade-fase6-checklist-ativa-financeiro.sql`, mesmo padrão de `contabilidade-fase4-04-checklist-ativa-cartoes.sql`: ativa o item nos fechamentos que já existiam antes (nasceram `nao_aplicavel`), só em fechamentos ainda `aberto`.

## 3. Semáforo — `services/contabilidadeDashboard.service.ts` + `app/contabilidade/page.tsx`

Novo `StatusArea` "Financeiro" em `getStatusAreas`, mesma estrutura das outras 4:
- Vermelho: alguma conta a pagar/receber vencida sem pagamento (`vencimento < hoje`, `status != 'Pago'`).
- Amarelo: item do checklist ainda pendente/em andamento.
- Verde: completo.

`app/contabilidade/page.tsx`: grid do semáforo (`gridTemplateColumns: "repeat(4, 1fr)"`) vira `repeat(5, 1fr)`.

## Teste

Sem framework de teste automatizado nem service role key local. Validação via:
- `tsc --noEmit` + `next build` limpos.
- Usuário roda a migration, depois testa: abrir `/contabilidade/checklist`, conferir que "Financeiro" aparece como item pendente; abrir `/contabilidade`, conferir o 5º card de semáforo; exportar o pacote mensal de um mês com movimentação real e conferir que `05-Financeiro/` aparece no zip com as 4 planilhas preenchidas.
