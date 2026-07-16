# IPI nos Pedidos — Design

## Contexto

A Urban Glass agora cobra IPI de 6,5% sobre alguns pedidos — um valor
fixo e padrão, não configurável por pedido (não é "6,5% às vezes 8%
dependendo do produto"; é "esse pedido tem IPI ou não tem"). O pedido
já existe hoje sem esse conceito: `pedidos.valor_total` é somado a partir
dos itens do pedido (vidro/produto), sem nenhum imposto embutido.

Pedido do usuário: um checkbox "Tem IPI" no pedido que, quando marcado,
calcula sozinho os 6,5% em cima do valor do pedido e soma ao que o
cliente deve pagar. Precisa valer tanto pra pedidos novos quanto pra
pedidos já lançados (editando o pedido existente), e o checkbox precisa
ficar junto das informações financeiras.

## Decisões confirmadas com o usuário

1. **IPI aumenta o total a receber do cliente** (não é só informativo).
   Um pedido de R$1.000 com IPI marcado passa a ter R$1.065 a receber.
2. **Comissão do vendedor continua calculada só sobre o valor do
   produto** (sem IPI) — o vendedor não ganha em cima de imposto
   repassado ao governo.
3. **Checkbox só em Criar e Editar pedido** (não na tela de
   visualização `/pedidos/[id]`, que hoje só mostra financeiro/parcelas,
   não edita o pedido em si). Pra marcar IPI num pedido já lançado, o
   fluxo é: abrir editar → marcar → salvar (mesmo padrão de editar
   qualquer outro dado do pedido).
4. **Escopo inclui os relatórios agregados** (DRE, Dashboard,
   Relatórios, listas de Pedidos/Clientes, Produção) — não só o pedido
   individual.
5. **`app/producao/page.tsx`** (valor total do kanban) inclui IPI, por
   consistência com os outros números agregados.

## Decisão de arquitetura: `valor_total` não muda de significado

`pedidos.valor_total` continua sendo **só o valor do produto/vidro**,
exatamente como hoje — usado por `services/margem.service.ts` (margem
bruta) e pelo cálculo de comissão. Isso evita qualquer risco de
distorcer margem/CMV/comissão, que já são calculados em cima desse
campo em vários lugares do sistema.

Dois campos novos guardam o IPI separadamente:

- `pedidos.tem_ipi` (boolean, default `false`)
- `pedidos.valor_ipi` (numeric, default `0`) — valor já calculado e
  congelado no momento do save (não recalculado dinamicamente depois,
  mesmo padrão de outros valores "snapshot" do sistema, ex.
  `quebras.custo_m2`)

O **valor que o cliente efetivamente deve pagar** é sempre
`valor_total + valor_ipi` — nunca um campo armazenado à parte, sempre
calculado on-the-fly por uma função helper única (`valorComIpi`), pra
evitar duas fontes de verdade divergindo.

### Por que não reaproveitar `config_fiscal_padrao.aliq_ipi`

Já existe uma alíquota de IPI em `config_fiscal_padrao` (usada na
emissão de NF-e, por produto/NCM, hoje configurada como 0% pra maioria
dos produtos). É um conceito relacionado mas **diferente**: aquele é
"IPI de emissão fiscal, por classificação de produto"; este é "IPI do
pedido comercial, sempre 6,5% quando marcado". Acoplar os dois faria
uma mudança na config fiscal (pra fins de NF-e) alterar silenciosamente
o cálculo comercial do pedido. A alíquota do pedido fica numa constante
dedicada, `ALIQ_IPI_PEDIDO = 6.5`, em `lib/pedidoIpi.ts`.

## Mudança 1 — Migração SQL

```sql
alter table public.pedidos
  add column if not exists tem_ipi boolean not null default false,
  add column if not exists valor_ipi numeric not null default 0;
```

Sem RLS nova (segue o baseline já existente da tabela `pedidos`).

## Mudança 2 — `lib/pedidoIpi.ts` (lógica pura, testada)

```ts
export const ALIQ_IPI_PEDIDO = 6.5;

export function calcularValorIpi(valorTotal: number): number {
  return parseFloat((valorTotal * ALIQ_IPI_PEDIDO / 100).toFixed(2));
}

export function valorComIpi(pedido: { valor_total: number; valor_ipi?: number | null }): number {
  return Number(pedido.valor_total) + Number(pedido.valor_ipi ?? 0);
}
```

`valorComIpi` aceita um objeto parcial (não o `Pedido` inteiro) porque
é chamado tanto com registros completos vindos do Supabase quanto com
os selects parciais (`select('valor_total, valor_ipi, ...')`) usados
nos relatórios agregados.

## Mudança 3 — Tipo `Pedido`

Em `types/index.ts`, `Pedido` ganha os dois campos logo após
`valor_total`:

```ts
valor_total: number;
tem_ipi: boolean;
valor_ipi: number;
```

`PedidoInsert`/`PedidoUpdate` (derivados via `Omit`/`Partial`) herdam os
campos automaticamente. **Importante**: como `Pedido` (não `Partial`)
ganha campos obrigatórios, o único call site que monta um `PedidoInsert`
completo (`app/pedidos/novo/page.tsx`) precisa ser atualizado **na mesma
task** que muda o tipo — não deixar o tipo mudar sozinho num commit e
o call site noutro (isso já causou um build quebrado no Vercel numa
sessão anterior, ver [[feedback-nao-pushar-estado-quebrado]]).

## Mudança 4 — Criar pedido (`app/pedidos/novo/page.tsx`)

Estado novo: `const [temIpi, setTemIpi] = useState(false);`

Derivados (ao lado de `valorTotal`, linha 227):
```ts
const valorIpi    = temIpi ? calcularValorIpi(valorTotal) : 0;
const valorComIpiCalc = valorTotal + valorIpi;
```

Checkbox logo abaixo do cabeçalho "FINANCEIRO" (linha 553), acima do
grid de 3 boxes:
```tsx
<label style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"10px", fontSize:"12px", color:"var(--t2)", cursor:"pointer" }}>
  <input name="tem_ipi" type="checkbox" checked={temIpi} onChange={e => setTemIpi(e.target.checked)} />
  Tem IPI ({ALIQ_IPI_PEDIDO}%){temIpi && <span style={{ fontFamily:"'DM Mono',monospace", color:"var(--warn)", marginLeft:"4px" }}>— {formatBRL(valorIpi)}</span>}
</label>
```

Todo lugar que hoje usa `valorTotal` para **parcelas** (redistribuição,
validação de soma, texto de aviso) e para os **displays de total**
(box "Total", box "Parcelas", sidebar "Resumo do Pedido") passa a usar
`valorComIpiCalc`:
- Efeitos de redistribuição (linhas 231-244, 246-248) — trocar
  `valorTotal` por `valorComIpiCalc` nas chamadas de
  `redistribuirParcelas` e nas dependências dos `useEffect`.
- `handleValorParcela` (linha 263) — mesma troca.
- `difParcelas`/`parcelasOk` (linhas 409-411) e a mensagem de erro no
  `salvar()` (linha 416) — mesma troca.
- Box "Total" (linha 559) e o aviso de soma (linhas 619-622) — mostrar
  `valorComIpiCalc`.
- Box "Parcelas"/"Pagamento" (linha 570) e sidebar "Valor Total"/"Por
  Parcela" (linhas 651-652) — mesma troca.

**Não mudam** (continuam em `valorTotal` puro):
- `pedido.valor_total` salvo no insert (linha 431) — continua o valor
  do produto.
- Cálculo de comissão do vendedor (linha 458) — continua sobre
  `valorTotal` puro.

O insert (`pedido: PedidoInsert`, linha 422) ganha:
```ts
tem_ipi: temIpi,
valor_ipi: valorIpi,
```

## Mudança 5 — Editar pedido (`app/pedidos/[id]/editar/page.tsx`)

Estado novo: `const [temIpi, setTemIpi] = useState(false);`, carregado
em `load()` a partir de `pedido.tem_ipi` (junto dos outros `set*` da
linha 147-155).

Derivados ao lado de `valorTotal` (linha 220):
```ts
const valorIpi        = temIpi ? calcularValorIpi(valorTotal) : 0;
const valorComIpiCalc  = valorTotal + valorIpi;
```

Mesmo checkbox da tela de criar, na mesma posição relativa (seção
FINANCEIRO desta página).

Troca `valorTotal` → `valorComIpiCalc` em:
- `useEffect` de redistribuição (linha 225-227)
- `handleNParcelas` (linha 351), `handleValorParcela` (linha 368)
- `difParcelas`/`parcelasOk` (linha 230) e mensagem de erro em
  `salvar()` (linha 377)
- `saldoPendente` (linha 441) — **este é o gatilho que decide se
  reconcilia lançamentos**; precisa usar o total com IPI pra detectar
  corretamente quando marcar IPI num pedido já quitado cria um saldo
  novo a receber (o IPI que faltava).
- Fallback de parcela inicial quando não há "A Receber" (linha 195,
  dentro de `load()`) — `pedido.valor_total / n` vira
  `valorComIpi(pedido) / n`.
- Displays de total na UI (linhas 640-641, equivalentes aos boxes da
  tela de criar).

**Não mudam**: `updatePedido` grava `valor_total: valorTotal` puro
(linha 393, sem alteração) — só ganha `tem_ipi: temIpi, valor_ipi:
valorIpi` no mesmo payload. Cálculo de comissão (linha 467) continua
sobre `valorTotal` puro.

A reconciliação de lançamentos "A Receber" (linhas 439-457) **não
precisa de lógica nova** — já é segura contra sobrescrever parcelas
pagas (guarda documentada nas linhas 432-438, resultado da correção
anterior [[bug-pedido-quitado-aparece-contas-receber]]) e passa a
operar sobre o total certo automaticamente assim que
`saldoPendente`/`parcelasForm` usarem `valorComIpiCalc`.

## Mudança 6 — Tela de visualização (`app/pedidos/[id]/page.tsx`)

`aberto`/`quitado`/`pctRec` (linhas 776-778) passam a usar
`valorComIpi(pedido)` no lugar de `Number(pedido.valor_total)`.

Card FINANCEIRO (linha 1033+): o tile "Total" (linha 1041) mostra
`formatBRL(valorComIpi(pedido))`. Uma linha nova aparece logo abaixo do
grid de 3 tiles quando `pedido.tem_ipi`:
```tsx
{pedido.tem_ipi && (
  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginBottom:"10px" }}>
    <span>IPI ({ALIQ_IPI_PEDIDO}% sobre {formatBRL(pedido.valor_total)})</span>
    <span style={{ fontFamily:"'DM Mono',monospace", color:"var(--warn)" }}>{formatBRL(pedido.valor_ipi)}</span>
  </div>
)}
```

## Mudança 7 — Serviços agregados

**`services/dre.service.ts`** (linha 91, 97-98): select ganha
`valor_ipi`; `receitaBruta` soma `Number(p.valor_total) +
Number(p.valor_ipi ?? 0)`.

**`services/pedidos.service.ts`**:
- `getPedidosPaginado` (linha 46-51): select ganha `valor_ipi`; o
  filtro `aberto`/`quitado` compara `valor_recebido` contra
  `valor_total + valor_ipi`.
- `getPedidosTotais` (linha 91, 97-100): select ganha `valor_ipi`;
  `valorTotal` (o campo do retorno, não renomear — é a soma exibida
  como "Valor Total" na tela de lista) soma `valor_total + valor_ipi`
  de cada linha.
- `registrarRecebimento` (linha 393): `aberto` usa `valorComIpi(pedido)`
  no lugar de `Number(pedido.valor_total)`.
- `utilizarCreditoEmPedido` (linha 468): mesma troca.

## Mudança 8 — Telas agregadas

- **`app/dashboard/page.tsx`** (linha 150): `entry.total +=` soma
  `Number(p.valor_total) + Number(p.valor_ipi ?? 0)`.
- **`app/relatorios/page.tsx`** (linhas 1401, 1539, 1562): os três
  `reduce` de `valor_total` somam `Number(p.valor_total) +
  Number(p.valor_ipi ?? 0)`.
- **`app/pedidos/page.tsx`** (linhas 333, 383): `aberto` usa
  `valorComIpi(p)`; a célula "Valor" da tabela mostra
  `formatBRL(valorComIpi(p))`.
- **`app/clientes/[id]/page.tsx`** (linhas 361-366): mesma troca —
  `aberto` e a célula "Valor" usam `valorComIpi(p)`.
- **`app/producao/page.tsx`** (linha 99): `totalVal` soma
  `Number(p.valor_total) + Number(p.valor_ipi ?? 0)`.

**Sem alteração** (confirmado por investigação de código, não é
suposição):
- `services/margem.service.ts` — continua só `valor_total` (margem não
  inclui imposto repassado). Vale um comentário no código explicando a
  omissão deliberada, pra um dev futuro não "corrigir" isso sem saber.
- `app/fluxo/page.tsx` e `services/dashboardFinanceiro.service.ts` —
  100% baseados em `lancamentos`/`baixas_lancamento`, corrigem sozinhos
  assim que os lançamentos passam a somar o valor certo (Mudanças 4-5).
- `app/contas-receber/page.tsx` — mesma razão, 100% `lancamentos`.
- `services/programacao.service.ts` — mostra `valor_total` por pedido
  individual (não agregado), fora do escopo de "relatório financeiro".

## Mudança 9 — Views do Supabase

Duas views existem no banco mas não são versionadas no repositório.
Definições atuais (obtidas via `pg_get_viewdef`) e as versões
corrigidas:

```sql
create or replace view public.financeiro_clientes as
 SELECT c.id AS cliente_id,
    c.nome AS cliente_nome,
    c.cidade,
    COALESCE(sum(p.valor_total + p.valor_ipi), 0::numeric) AS faturado,
    COALESCE(sum(p.valor_recebido), 0::numeric) AS recebido,
    COALESCE(sum(p.valor_total + p.valor_ipi - p.valor_recebido), 0::numeric) AS a_receber,
    count(p.id) AS total_pedidos,
        CASE
            WHEN COALESCE(sum(p.valor_total + p.valor_ipi), 0::numeric) = 0::numeric THEN 0::numeric
            ELSE round(COALESCE(sum(p.valor_recebido), 0::numeric) / COALESCE(sum(p.valor_total + p.valor_ipi), 1::numeric) * 100::numeric, 2)
        END AS pct_recebido
   FROM clientes c
     LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.status <> 'Cancelado'::text
  GROUP BY c.id, c.nome, c.cidade;

create or replace view public.faturamento_mensal as
 SELECT EXTRACT(year FROM dt_pedido)::integer AS ano,
    EXTRACT(month FROM dt_pedido)::integer AS mes,
    sum(valor_total + valor_ipi) AS faturado,
    sum(valor_recebido) AS recebido,
    count(*) AS total_pedidos
   FROM pedidos
  WHERE status <> 'Cancelado'::text
  GROUP BY (EXTRACT(year FROM dt_pedido)::integer), (EXTRACT(month FROM dt_pedido)::integer)
  ORDER BY (EXTRACT(year FROM dt_pedido)::integer), (EXTRACT(month FROM dt_pedido)::integer);
```

Como `valor_ipi` tem `default 0` e `not null`, a soma nunca vira `null`
pra pedidos sem IPI — seguro rodar a qualquer momento após a Mudança 1.

## Fora de escopo (YAGNI)

- Alíquota de IPI configurável por tela/produto — é sempre 6,5% fixo,
  constante no código (`lib/pedidoIpi.ts`). Se um dia precisar mudar,
  é uma linha de código, não uma tela de configuração.
- Qualquer vínculo entre este IPI comercial e o módulo de emissão de
  NF-e (`lib/fiscal.ts`, `config_fiscal_padrao`) — são conceitos
  paralelos, não integrados nesta mudança.
- Recalcular `valor_ipi` retroativamente se `ALIQ_IPI_PEDIDO` mudar no
  futuro — é um valor congelado no momento do save, como outros
  valores snapshot do sistema.

## Testes

`lib/pedidoIpi.ts` ganha teste unitário (Vitest) cobrindo
`calcularValorIpi` e `valorComIpi`, seguindo o padrão de
`lib/formatters.test.ts`. O resto é I/O de Supabase ou UI sem infra de
teste no projeto — verificação via `npx tsc --noEmit` e `npm run build`
(lição de [[feedback-nao-pushar-estado-quebrado]]: nenhuma task deve
ficar com o build quebrado entre commits).

Validação manual do usuário: criar um pedido novo com IPI marcado e
conferir que parcelas/total batem com produto+6,5%; editar um pedido
já lançado e quitado, marcar IPI, e conferir que aparece um novo saldo
a receber do valor do IPI (sem mexer nas parcelas já pagas); conferir
que a comissão do vendedor não mudou; conferir Dashboard, Relatórios e
DRE do mês desse pedido somando o valor com IPI.
