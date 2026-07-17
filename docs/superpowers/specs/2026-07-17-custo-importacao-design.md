# Custo de Importação por Lote (Compras) — Design

## Contexto

O usuário colou um documento externo, "Módulo de Precificação e Custeio
de Vidros" (5 camadas: catálogo, lote de importação, consumo, venda,
apuração fiscal), escrito **sem acesso ao schema real** do ERP — usa
uuid em tudo, `pedidos(id)` como uuid (aqui é texto `P-XXX`), propõe
`tipos_vidro` (aqui é `produtos`) e um modelo de consumo/CMV paralelo
ao que já existe. A análise (2026-07-17) mapeou camada por camada:

- **Catálogo** → já existe (`produtos`, com NCM no cadastro).
- **Consumo/CMV** → já existe e é robusto: `estoque_movimentacoes`
  grava `custo_unitario_m2` congelado no momento da baixa (o "snapshot"
  que o documento pede), `otimizacao_perda_detalhe` dá perda por
  produto/rodada, `retalhos` já existe, e o CMV oficial (unificado com
  o DRE em 2026-07-15) já usa custo histórico por movimento.
- **Lote de importação** → **lacuna real**: `compras`/`compras_itens`
  capturam custo/m² e NF, mas não existe noção de câmbio, tributos de
  importação nem creditabilidade. Hoje o usuário digita o
  `custo_unitario_m2` na mão, sem apoio pra chegar no número certo de
  uma importação.
- **Venda (ICMS-ST/DIFAL + meio de pagamento)** → parcial; cruza com a
  Reforma Tributária IBS/CBS em andamento e com a pendência do cartão
  do cliente (MDR/D+1). Fora deste projeto.
- **Apuração IRPJ/CSLL** → fora deste projeto.

**Decisão do usuário**: atacar só a lacuna do lote de importação agora,
como primeiro sub-projeto. Ledger de créditos tributários fica pra uma
fase 2, depois que esta base existir.

## Decisões confirmadas com o usuário

1. **Tributos digitados da DI** — o usuário digita cada tributo em R$
   exatamente como aparece na Declaração de Importação. O sistema só
   soma e rateia; não calcula por alíquota (sem gross-up automático de
   ICMS — se um dia quiser, é uma calculadora auxiliar futura).
2. **Botão "Aplicar aos itens"** — o custo real/m² calculado preenche o
   `custo_unitario_m2` dos itens só quando o usuário clica; ajuste
   manual continua possível depois. Nada é sobrescrito automaticamente.
3. **Defaults de creditabilidade** (regime Lucro Real, confirmado em
   projeto anterior): `pis_cofins_creditavel = true`,
   `icms_creditavel = true`, `ipi_creditavel = false` até o contador
   confirmar o enquadramento (industrial/equiparado). Os três são
   editáveis por compra.

## Ponto de integração (por que isso é pequeno e seguro)

O fluxo downstream já está pronto: `confirmarRecebimento()`
(`services/compras.service.ts`) lê o `custo_unitario_m2` de cada item e
o grava via `registrarMovimentacao()` no ledger de estoque — de onde
CMV, DRE e margem já leem. Esta feature só melhora **como esse número é
produzido** antes do recebimento; nenhum serviço downstream muda.

## Arquitetura

### Schema — `sql/importacao-compras.sql`

Colunas novas em `compras` (todas opcionais/nullable — compras
nacionais não são afetadas), sem nenhuma tabela nova:

```sql
alter table public.compras
  add column if not exists eh_importacao             boolean not null default false,
  add column if not exists numero_di                 text,
  add column if not exists valor_fob_usd             numeric not null default 0,
  add column if not exists frete_internacional_usd   numeric not null default 0,
  add column if not exists seguro_internacional_usd  numeric not null default 0,
  add column if not exists cambio_usd                numeric not null default 0,
  add column if not exists ii                        numeric not null default 0,
  add column if not exists ipi_importacao            numeric not null default 0,
  add column if not exists pis_cofins_importacao     numeric not null default 0,
  add column if not exists icms_importacao           numeric not null default 0,
  add column if not exists despesas_aduaneiras       numeric not null default 0,
  add column if not exists ipi_creditavel            boolean not null default false,
  add column if not exists pis_cofins_creditavel     boolean not null default true,
  add column if not exists icms_creditavel           boolean not null default true;
```

`cambio_usd` é o câmbio daquela compra (PTAX do desembaraço), nunca uma
cotação global do sistema. Uma compra = um lote/DI — mesmo mapeamento
do fluxo atual (`C-XXX` com NF e itens).

**Atenção operacional** (lição de [[feedback-sql-pendente-quebra-save]]):
o save da compra só pode incluir os campos novos quando a seção
Importação estiver em uso ou de forma que não quebre se a migração não
tiver rodado — na prática, rodar o SQL antes de usar a tela, como
sempre; a UI trata os campos como opcionais.

### Cálculo puro — `lib/custoImportacao.ts` (com teste, TDD)

```ts
export interface DadosImportacao {
  valor_fob_usd: number;
  frete_internacional_usd: number;
  seguro_internacional_usd: number;
  cambio_usd: number;
  ii: number;
  ipi_importacao: number;
  pis_cofins_importacao: number;
  icms_importacao: number;
  despesas_aduaneiras: number;
  ipi_creditavel: boolean;
  pis_cofins_creditavel: boolean;
  icms_creditavel: boolean;
}

export interface CustoImportacao {
  valorAduaneiroBrl: number;   // (FOB + frete + seguro) × câmbio
  custoDesembolsado: number;   // aduaneiro + todos os tributos + despesas
  custoNaoRecuperavel: number; // aduaneiro + II + despesas + tributos NÃO creditáveis
  creditosTributarios: number; // soma dos tributos creditáveis
  custoM2: number;             // custoNaoRecuperavel / m2Total (0 se m2Total <= 0)
}

export function calcularCustoImportacao(d: DadosImportacao, m2Total: number): CustoImportacao;
```

II e despesas aduaneiras nunca são creditáveis (sempre entram no custo).
IPI/PIS-COFINS/ICMS entram no custo apenas quando a flag de
creditabilidade correspondente for `false`. Todos os valores
arredondados a 2 casas (`custoM2` a 4, como os demais custos/m² do
sistema).

### Tipos — `types/index.ts`

`Compra` (e por consequência `CompraInsert`) ganha os 14 campos novos,
todos com os mesmos nomes das colunas.

### UI — `app/compras/page.tsx`

No formulário de compra (novo/edição), um checkbox **"Compra
importada"** (`eh_importacao`). Marcado, abre a seção "Importação":

- Campos: nº da DI, FOB (USD), frete internacional (USD), seguro (USD),
  câmbio, II, IPI, PIS/COFINS, ICMS, despesas aduaneiras (R$), e os 3
  checkboxes de creditabilidade (com os defaults da decisão 3).
- Resumo calculado ao vivo (via `calcularCustoImportacao` com o m²
  total dos itens já lançados): Valor Aduaneiro, Custo Desembolsado,
  Custo Não-Recuperável, Créditos Tributários, **Custo real/m²**.
- Botão **"Aplicar aos itens"**: seta `custo_unitario_m2 = custoM2` em
  todos os itens da compra (e recalcula `subtotal` de cada um, mesmo
  padrão do form atual). Desabilitado se m² total = 0.
- Os campos novos entram no payload de `createCompra`/update da compra.

O restante do fluxo (recebimento, conta a pagar, ledger de estoque,
CMV, DRE, margem) não muda em nada.

## Limitação conhecida (documentada de propósito)

O rateio "Aplicar aos itens" usa o **mesmo custo/m² pra todos os
itens** da compra. Se uma compra misturar vidros de valores FOB muito
diferentes, o rateio ideal seria proporcional ao valor de cada item —
mas `compras_itens` não tem FOB por item, e pra chapas do mesmo padrão
o rateio por m² é fiel. Se isso um dia doer na prática, a evolução é
FOB por item (mudança de schema própria, fora deste escopo).

## Fora de escopo (YAGNI)

- Ledger de créditos tributários (`creditos_tributarios_ledger` do
  documento) — fase 2, depois desta base.
- PEPS/custo médio formal pra vidro — o sistema já usa custo histórico
  por movimento; mudar método de custeio é decisão do contador, não
  desta feature.
- Cálculo de tributos por alíquota (gross-up de ICMS) — decisão 1.
- Tributos de venda por pedido (ICMS-ST/DIFAL) e custo do meio de
  pagamento — projetos separados; o primeiro cruza com a Reforma
  Tributária IBS/CBS.
- Apuração IRPJ/CSLL nível empresa.
- Recálculo retroativo de compras antigas — snapshots já gravados no
  ledger de estoque não mudam.
- Import automático do XML da DI.

## Testes

`lib/custoImportacao.ts` com teste Vitest (TDD — único código puro da
feature): casos cobrindo creditabilidade ligada/desligada, m² zero,
câmbio zero, arredondamento. Schema/UI verificados via
`npx tsc --noEmit` + `npm run build` (padrão do projeto — páginas e
SQL não têm teste automatizado).

Validação manual do usuário: criar uma compra de teste marcada como
importada, preencher com números reais de uma DI antiga, conferir que o
custo/m² bate com o que a empresa calculava fora do sistema, aplicar
aos itens, confirmar recebimento e ver o custo fluir pro estoque.
