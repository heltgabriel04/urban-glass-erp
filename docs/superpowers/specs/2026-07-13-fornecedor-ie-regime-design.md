# Fornecedor: IE + Regime Tributário

**Origem**: item "Fornecedor sem IE/regime tributário" do backlog da auditoria geral do ERP (2026-07-10, ver memória `project-auditoria-erp-completa`). Sub-projeto 1 de 4 de uma leva combinada com o usuário (Fornecedor → Modal → RLS → Fiscal).

## Problema

O cadastro de Fornecedor (`app/fornecedores/page.tsx`, tabela `fornecedores`) não tem Inscrição Estadual nem Regime Tributário. Clientes já tem `ie` + `ind_ie` (indicador de contribuinte ICMS); Fornecedores não tem nada equivalente, nem nunca teve conceito de regime tributário em lugar nenhum do sistema (só existe como config global em `config_fiscal_padrao.regime`, que não é por parceiro).

## Decisões (confirmadas com o usuário)

- IE segue o mesmo padrão de Clientes: campo IE + indicador (Contribuinte ICMS / Isento / Não Contribuinte), não só texto livre.
- Regime Tributário com 4 opções: MEI, Simples Nacional, Lucro Presumido, Lucro Real.
- Todos os campos são **opcionais** — não bloqueiam salvar fornecedor (nem os existentes nem cadastros novos).

## Schema

Nova migration `sql/fornecedores-ie-regime.sql`, aditiva, sem impacto nos 28 fornecedores existentes:

```sql
alter table fornecedores
  add column if not exists ie text default '',
  add column if not exists ind_ie text default '9' check (ind_ie in ('1','2','9')),
  add column if not exists regime_tributario text check (regime_tributario in ('mei','simples','presumido','real'));
```

`regime_tributario` fica `null` por padrão (sem valor "desconhecido" forçado); `ind_ie` usa o mesmo default `'9'` (Não Contribuinte) que Clientes usa.

## Types (`types/index.ts`)

Adicionar à interface `Fornecedor`:

```ts
ie: string;
ind_ie: IndIE; // já existe, reaproveitado de Clientes
regime_tributario: '' | 'mei' | 'simples' | 'presumido' | 'real';
```

`FornecedorInsert` (`Omit<Fornecedor,'id'|'created_at'>`) e `FornecedorUpdate` (`Partial<FornecedorInsert>`) herdam automaticamente, sem mudança própria.

## UI (`app/fornecedores/page.tsx`)

Três campos novos na grade 2 colunas do modal de cadastro/edição (mesmo padrão `Campo`/`fc` já usado):

1. **IE** — `input` com máscara, reaproveitando a mesma regex de `maskIE` de `app/clientes/page.tsx:49-54` (copiada localmente — em Clientes também é uma função não-exportada; não existe módulo compartilhado de máscaras hoje, não é escopo deste sub-projeto criar um).
2. **Indicador IE** — `select` com as mesmas 3 opções de Clientes (1 — Contribuinte ICMS / 2 — Contribuinte Isento / 9 — Não Contribuinte).
3. **Regime Tributário** — `select` com 4 opções (MEI / Simples Nacional / Lucro Presumido / Lucro Real) + opção vazia "Não informado".

`VAZIO` (linha 11-14) ganha os 3 defaults (`ie:"", ind_ie:"9", regime_tributario:""`). `abrirEdicao` (linha 41-48) passa os valores do registro (`f.ie ?? "", f.ind_ie ?? "9", f.regime_tributario ?? ""`).

## Fora de escopo

- `services/fornecedores.service.ts` — não muda, é passthrough genérico (`insert`/`update` recebem o objeto inteiro).
- Validação de salvar — continua só nome obrigatório.
- RLS/policies de `fornecedores` — não muda.
- Extrair `maskIE` para um módulo compartilhado — os campos são pequenos o suficiente pra duplicar 1x, sem justificar abstração nova agora.
- Exibir IE/regime na listagem/tabela de fornecedores — só no formulário de cadastro/edição, igual ao pedido original (não foi pedido chip/coluna na lista).

## Teste

Sem infraestrutura de teste automatizado nas telas de cadastro hoje (padrão do resto do sistema). Validação via:
- `tsc --noEmit` limpo.
- Smoke test direto no Supabase com fornecedor sintético (`__teste_*`), exercitando `createFornecedor`/`updateFornecedor` com os novos campos, depois apagado.
