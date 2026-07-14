# Unificação do CMV entre DRE e Estoque/CMV (Design)

## Contexto

Uma auditoria (2026-07-15) encontrada durante o levantamento de relatórios
pro contador identificou que o sistema calcula CMV (Custo das Mercadorias
Vendidas) de duas formas diferentes, em dois lugares:

- **`services/dre.service.ts`** (`getDRE`, regime `'competencia'`): CMV =
  só o custo da chapa de vidro, usando `estoque.custo_m2` **atual** — o
  mesmo custo de hoje é aplicado a todo pedido do período, não importa
  quando foi produzido. Não inclui nenhum custo de itens gerais
  (ferragens, perfis, insumos).
- **`services/contabilidadeEstoqueCmv.service.ts`** (`getCMVPeriodo`,
  usado na tela Contabilidade → Estoque, aba CMV, e no export do pacote
  mensal): CMV = Vidro (via `margem.service.ts`, custo **histórico** —
  gravado no momento da baixa daquele item específico, com fallback pro
  atual só quando não existe histórico) **+** Itens Gerais (fórmula
  clássica Estoque Inicial + Compras − Estoque Final).

O usuário confirmou que a página `/dre` também é documento oficial que
vai pro contador (não é só aproximação interna) — os dois números
precisam bater, não só conviver documentados como diferentes.

## Objetivo

`getDRE` (regime `'competencia'`) passa a usar `getCMVPeriodo` como
única fonte de verdade pro CMV, e a tela `/dre` passa a mostrar a mesma
quebra Vidro / Itens Gerais (com Estoque Inicial/Compras/Estoque Final)
que já existe na tela de Estoque/CMV.

## Decisão de performance

`getCMVPeriodo` é mais pesado que o cálculo atual do DRE — reconstrói o
livro-razão de itens gerais no início e fim do período via
`getInventarioEm` (lê `itens_estoque_movimentacoes` inteiro até a data de
corte). Decisão explícita do usuário: **priorizar correção sobre
velocidade agora** — se isso virar um problema de performance real no
futuro (histórico crescendo), é um projeto de otimização separado, fora
de escopo aqui.

## O que NÃO muda

- Regime `'caixa'` continua com `cmv = 0` e `cmvDetalhe: null` — a
  justificativa já documentada no código (`dre.service.ts:51-55`, sem
  correspondência confiável entre dinheiro recebido e peça entregue no
  mesmo período) continua válida e não é escopo desta mudança.
- `dashboard-financeiro/page.tsx` e `dashboard-financeiro/analitica/page.tsx`
  chamam `getDRE` mas só leem `.resultado`/`.receita`/`.despesasTotal`/
  `.despesas` — nunca `.cmv` diretamente (confirmado via grep). Não
  precisam de nenhuma alteração.
- `services/margem.service.ts` e `services/contabilidadeEstoqueCmv.service.ts`
  não mudam — são a fonte de verdade que o DRE passa a consumir, já
  estão corretos.

## Armadilha a evitar (importante pro plano)

`getCMVPeriodo` calcula seu próprio `receita`/`lucroBruto`/`margemBrutaPct`
internamente (via `margem.service.ts`), **mas esse `receita` não desconta
devoluções** — `getDRE` já desconta (`receita = receitaBruta − devolucoes`,
`dre.service.ts:69,95`). A troca deve extrair **só** `cmvTotal`, `vidro` e
`itensGerais` do retorno de `getCMVPeriodo` — `lucroBruto`,
`margemBrutaPct` e `resultado` continuam sendo calculados a partir do
`receita` que o próprio `getDRE` já calcula hoje (pós-devolução), exatamente
como já funciona, só trocando o valor de `cmv` que entra na conta.

## Mudança 1 — `services/dre.service.ts`

Import novo: `getCMVPeriodo` e o tipo `CMVPeriodo` de
`./contabilidadeEstoqueCmv.service`.

Tipo `DRE` ganha um campo novo:

```ts
export type DRECmvDetalhe = Pick<CMVPeriodo, 'vidro' | 'itensGerais'>;

export interface DRE {
  // ...campos existentes sem mudança...
  cmv: number;
  cmvDetalhe: DRECmvDetalhe | null;  // null no regime 'caixa'
  // ...resto sem mudança...
}
```

No branch `regime === 'caixa'` (`dre.service.ts:60-82`), o objeto de
retorno ganha `cmvDetalhe: null` (único campo novo ali — `cmv` continua
`0` como já é hoje).

No branch de competência (`dre.service.ts:85-131`):

- O `Promise.all` de `dre.service.ts:85-90` perde a query de
  `estoque.select('produto_id, custo_m2')` (não é mais usada — o custo
  do vidro agora vem de dentro de `getCMVPeriodo`) e ganha
  `getCMVPeriodo(ini, fim)` no lugar:

```ts
  const [pedidosRes, despesasRes, devolucoesRes, cmvPeriodo] = await Promise.all([
    supabase.from('pedidos').select('id, valor_total').neq('status', 'Cancelado').gte('dt_pedido', ini).lte('dt_pedido', fim),
    supabase.from('lancamentos').select('valor, vencimento, plano_contas(descricao)').eq('tipo', 'Saída').eq('natureza', 'normal').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    supabase.from('lancamentos').select('valor').eq('natureza', 'devolucao').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    getCMVPeriodo(ini, fim),
  ]);
```

- Todo o bloco atual de cálculo de CMV (`dre.service.ts:97-115`: a
  variável `let cmv = 0`, o loop de `custoM2`, a query de `itens_pedido`,
  o loop de `cmv += ...`) é **removido inteiro** e substituído por:

```ts
  const cmv = cmvPeriodo.cmvTotal;
  const cmvDetalhe: DRECmvDetalhe = { vidro: cmvPeriodo.vidro, itensGerais: cmvPeriodo.itensGerais };
```

- O resto do branch (`lucroBruto`, `despesas`, `resultado`,
  `margemBrutaPct`, `margemLiquidaPct`) fica **exatamente como está**
  — continuam usando o `receita`/`receitaBruta`/`devolucoes` já
  calculados pelo próprio `getDRE`, não os de `cmvPeriodo`.
- O objeto de retorno ganha `cmvDetalhe` junto dos campos existentes.

No JSDoc do topo do arquivo (`dre.service.ts:43-56`), a linha
` *   (−) CMV (custo das chapas; custo_m2 atual, sem lapidação)` vira:

```
 *   (−) CMV (mesmo cálculo rigoroso da tela Contabilidade → Estoque →
 *       CMV: vidro por custo histórico + itens gerais por EI+Compras−EF)
```

## Mudança 2 — `app/dre/page.tsx`

`Linha` (`app/dre/page.tsx:104-124`) tem seu prop `indent?: boolean`
trocado por `indent?: 1 | 2`, com o `paddingLeft` calculado por nível
(`indent === 2 ? "52px" : indent === 1 ? "36px" : "20px"`). Todo uso
existente de `indent` (hoje só `indent` booleano na linha de despesas,
`app/dre/page.tsx:84`) passa a usar `indent={1}` — comportamento visual
idêntico ao de hoje pra esse caso, só a assinatura do prop muda.

Logo depois da linha `"(−) CMV"` (`app/dre/page.tsx:74`), quando
`regime === 'competencia'` e `dre.cmvDetalhe` não é `null`:

```tsx
<Linha label="(−) CMV" valor={-dre.cmv} cor="var(--warn)" />
{regime === "competencia" && dre.cmvDetalhe && (
  <>
    <Linha label="Vidro" valor={-dre.cmvDetalhe.vidro.cmv} indent={1} pequeno />
    <Linha label="Itens Gerais" valor={-dre.cmvDetalhe.itensGerais.cmv} indent={1} pequeno />
    <Linha label="Estoque Inicial" valor={dre.cmvDetalhe.itensGerais.estoqueInicial} indent={2} pequeno />
    <Linha label="Compras" valor={dre.cmvDetalhe.itensGerais.compras} indent={2} pequeno />
    <Linha label="Estoque Final" valor={-dre.cmvDetalhe.itensGerais.estoqueFinal} indent={2} pequeno />
  </>
)}
```

(Estoque Inicial e Compras entram positivos, Estoque Final negativo —
mesma convenção que o resto da página já usa pra "linhas que reduzem o
total", como `-dre.cmv` e `-d.valor` nas despesas.)

O export Excel (`app/dre/page.tsx:44-55`) ganha as mesmas linhas, só
quando `regime === 'competencia'` e `dre.cmvDetalhe` existe:

```ts
["(-) CMV", -dre.cmv],
...(regime === "competencia" && dre.cmvDetalhe ? [
  ["   Vidro", -dre.cmvDetalhe.vidro.cmv],
  ["   Itens Gerais", -dre.cmvDetalhe.itensGerais.cmv],
  ["      Estoque Inicial", dre.cmvDetalhe.itensGerais.estoqueInicial],
  ["      Compras", dre.cmvDetalhe.itensGerais.compras],
  ["      Estoque Final", -dre.cmvDetalhe.itensGerais.estoqueFinal],
] as (string | number)[][] : []),
```

No texto de contexto acima da tabela (`app/dre/page.tsx:62-63`, regime
competência), a frase `CMV usa o custo/m² atual do estoque (sem
lapidação).` vira `CMV é o mesmo cálculo rigoroso da tela Contabilidade
→ Estoque → CMV (custo histórico do vidro + itens gerais).`

## Fora de escopo (YAGNI)

- Nenhuma mudança em `getCMVPeriodo`, `getInventarioEm` ou
  `margem.service.ts` — já estão corretos, só passam a ser consumidos
  por mais um lugar.
- Nenhuma otimização de performance (caching, memoização) — decisão
  explícita do usuário de priorizar correção agora.
- Nenhuma mudança no regime `'caixa'`.
- Nenhuma mudança em `dashboard-financeiro/page.tsx` ou `analitica/page.tsx`.

## Testes

Nenhum dos dois arquivos (`dre.service.ts`, `contabilidadeEstoqueCmv.service.ts`)
tem teste automatizado hoje — ambos são inteiramente dependentes de
Supabase, consistente com o resto do projeto nesse ponto. Esta mudança
não adiciona teste automatizado novo (não há lógica pura nova a testar
— é só troca de fonte de dado + exibição). Verificação via
`tsc --noEmit` + `next build`. Validação manual do usuário: comparar o
CMV mostrado em `/dre` (regime competência, um mês fechado) com o CMV
da mesma competência na tela Contabilidade → Estoque → aba CMV — os
dois totais devem bater exatamente agora.
