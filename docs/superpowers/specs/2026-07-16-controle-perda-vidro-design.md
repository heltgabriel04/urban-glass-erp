# Controle de Perda de Vidro (m²) — Design

## Contexto

O usuário trouxe um documento de schema pronto pra "Controle de Perda de
Vidro (m²)" (balanço de massa por tipo de vidro/mês, separando perda de
otimização vs. incidente, valorado a custo). O documento foi escrito sem
acesso ao schema real do Urban Glass ERP e propunha um modelo por chapa
física individual (`chapas`, `chapas_lote`, `incidentes_corte`,
`produtos_cortados`, `retalhos_salvos`) que não bate com a arquitetura
atual — o estoque de vidro aqui é um livro-razão agregado por
`produto_id` (`estoque_movimentacoes`), não uma linha por chapa cortada.

Investigação no código encontrou que boa parte do que o documento pedia
**já existe**, espalhado em três módulos:

- **Perda por incidente/trinca** → tabela `quebras` (`m2_perdido`,
  `custo_m2`, `valor_perda`, `motivo`, `setor`, `baixa_estoque`,
  `pedido_id`). Grava produto como texto livre (`produto_nome`, via
  datalist) — não tem `produto_id`.
- **Retalho salvo** → tabela `retalhos` (`produto_id`, `m2`,
  `chapa_origem`, `status`). Já completa, nada a mudar.
- **Custo por lote de compra** → já capturado em
  `compras_itens.custo_unitario_m2` / `estoque_movimentacoes.custo_unitario_m2`
  a cada entrada. Não precisa de tabela `chapas_lote` nova.
- **Perda de otimização** → é a lacuna real. `historico_otimizador` guarda
  `perda`/`aproveitamento` por **pedido**, mas uma rodada de otimização
  pode misturar vários tipos de vidro (cada chapa em `chapas_json` tem seu
  próprio campo `prod`).
- **Data de finalização do corte** → não existe em `historico_otimizador`
  (só `dt_otim`, data de *planejamento*). Mas `programacao_producao` já
  tem exatamente isso: `etapa='Corte'`, `status='Concluído'`,
  `dt_fim_real`, ligado por `pedido_id`.

## Objetivo

Uma view `vw_perda_mensal_vidro` que mostra, por tipo de vidro (produto) e
mês (mês real de finalização do corte), quanto m² foi perdido por
otimização vs. por incidente, quanto foi salvo como retalho, e o valor a
custo de cada um — sem criar um modelo paralelo de chapa física.

## Armadilha a evitar (importante pro plano)

`historico_otimizador` grava **uma linha por pedido** dentro de
`handleSalvar` (`app/otimizador/page.tsx:803-818`), mas quando uma
otimização combina vários pedidos (`todosPedidos = [pedidoRef,
...pedidosSelecionados]`), o `chapasJson` de cada linha contém a **mesma
lista de chapas inteira** (mesmas dimensões `W`/`H` em todo pedido) — só o
array `placed` é filtrado por pedido (`chapasComPecasDoPedido`, linha
807-809). Se a tabela de perda por produto for populada uma vez por
pedido a partir dessas linhas, a área bruta de cada chapa física seria
contada uma vez por pedido que a usa — superestimando o m² bruto
consumido em qualquer rodada com mais de um pedido.

**Decisão**: a tabela nova é populada **uma única vez por chamada de
`handleSalvar`** (fora do loop de `todosPedidos`), a partir do
`chapasJson`/`resultado` e `retalhosGerados` **não filtrados** — exatamente
como o código já faz hoje pra `consumoPorProd` (linhas 833-838) e pro
salvamento de retalhos (linhas 820-827), que também são calculados uma vez
só, fora do loop por pedido. A linha resultante é atribuída a
`pedido_id: pedidoRef` (o pedido de referência), o mesmo padrão que
`registrarMovimentacao` já usa pra `origemId` (linha 843).

Consequência aceita: numa rodada combinando vários pedidos, toda a perda
de otimização do lote é atribuída ao mês de finalização do corte do
**pedido de referência**, não dividida entre os pedidos. Isso é uma
simplificação deliberada — dividir a perda proporcionalmente entre
pedidos do mesmo lote é possível depois, se for preciso, mas não é
necessário pro relatório mensal por tipo de vidro (a soma total por mês
não muda, só a atribuição entre pedidos dentro do mesmo mês).

## Mudança 1 — `quebras` ganha `produto_id`

```sql
alter table public.quebras add column if not exists produto_id int references produtos(id);
create index if not exists idx_quebras_produto on public.quebras (produto_id);
```

Em `app/qualidade/quebras/page.tsx`, a função que já resolve o objeto do
produto na seleção do datalist (linha 63: `setForm(f => ({ ...f,
produto_nome: nome, custo_m2: prod?.custo_m2 ?? null }))`) ganha
`produto_id: prod?.id ?? null` no mesmo `setForm`. O tipo `Quebra` e
`QuebraInsert` (`types/index.ts:1186-1213`) ganham o campo
`produto_id: number | null`.

Sem backfill retroativo — quebras antigas ficam com `produto_id: null` e
entram na view por `produto_nome` teria que casar por texto (frágil); a
view trata isso como perda "sem tipo de vidro identificado" nesses casos
antigos, sem tentar adivinhar.

## Mudança 2 — nova tabela `otimizacao_perda_detalhe`

```sql
create table if not exists public.otimizacao_perda_detalhe (
  id                bigserial primary key,
  pedido_id         text not null references pedidos(id) on delete cascade,
  produto_id        int references produtos(id),
  produto_nome      text not null,
  m2_bruta_chapas   numeric not null default 0,
  m2_pecas          numeric not null default 0,
  m2_retalhos       numeric not null default 0,
  m2_perda          numeric not null default 0,  -- bruta - pecas - retalhos
  custo_m2          numeric,                      -- snapshot no momento do salvamento
  dt_otim           date not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_otim_perda_pedido  on public.otimizacao_perda_detalhe (pedido_id);
create index if not exists idx_otim_perda_produto on public.otimizacao_perda_detalhe (produto_id);
```

`custo_m2` é um snapshot gravado na hora (mesmo padrão que `quebras.custo_m2`
já usa) — não recalculado depois, pra não distorcer meses fechados quando
o custo atual mudar.

RLS: mesma baseline das tabelas operacionais (`estoque`,
`historico_otimizador`) — leitura/escrita liberada a autenticado, sem
policy restritiva (não está na lista de `seguranca-05`).

Zerar a otimização (`handleZerar`, linha 778-795) precisa apagar também as
linhas correspondentes: `await supabase.from("otimizacao_perda_detalhe").delete().eq("pedido_id", pid)`
adicionado nos dois pontos do loop de delete (linha 784 e 788).

## Mudança 3 — popular a tabela em `handleSalvar`

Em `app/otimizador/page.tsx`, depois do bloco que calcula `consumoPorProd`
(linhas 833-838) e antes/depois do loop que baixa estoque, adicionar um
agrupamento equivalente por produto usando os mesmos dados **não
filtrados** (`resultado`/`chapasJson`, `retalhosGerados`):

- `m2_bruta_chapas` por produto = soma de `W*H/1e6` de cada chapa cujo
  `prod` bate (usar `resultado`, uma vez por chapa — inclui chapas vindas
  de retalho reaproveitado, `retalhoId` não nulo, porque a chapa física
  foi consumida de qualquer forma).
- `m2_pecas` por produto = soma de `p.l*p.a/1e6` de todas as peças em
  `placed`, agrupado pelo `prod` da chapa onde a peça está.
- `m2_retalhos` por produto = soma de `fr.m2` em `retalhosGerados`
  agrupado por `fr.prod`.
- `m2_perda` = `m2_bruta_chapas - m2_pecas - m2_retalhos` (pode ficar
  levemente negativo por arredondamento de kerf/borda — não tratado como
  erro; se passar de 0.01 m² em módulo, `console.warn` como já é feito
  noutros pontos desta função, ex. linha 847).
- `produto_id`: mesmo lookup que já existe em `produtos.find(pr => pr.nome
  === prodNome)` (linha 840).
- `custo_m2`: **não está disponível hoje nesta página** — o state
  `produtos` (`useState<Produto[]>`, linha 67) não carrega `custo_m2` (o
  tipo `Produto` não tem esse campo; custo vive em `estoque`, por
  `produto_id`). Igual à tela de Qualidade → Quebras (`getEstoque()`,
  `app/qualidade/quebras/page.tsx:51`), precisa buscar `estoque` (via
  `getEstoque()` de `services/estoque.service.ts`) e montar um mapa
  `produto_id → custo_m2` — um `useEffect` novo carregando isso junto dos
  outros dados da página, ou uma busca pontual dentro de `handleSalvar`
  (mais simples, já que só é usado nesse momento).

Um `insert` em lote (`supabase.from("otimizacao_perda_detalhe").insert([...])`)
com uma linha por produto, `pedido_id: pedidoRef`, `dt_otim: hoje`.

## Mudança 4 — view `vw_perda_mensal_vidro`

```sql
create or replace view public.vw_perda_mensal_vidro as
with corte_mes as (
  -- mês real de finalização do corte por pedido; fallback pra data de
  -- planejamento/registro quando não há etapa de corte concluída
  select pedido_id, min(dt_fim_real) as dt_corte
  from programacao_producao
  where etapa = 'Corte' and status = 'Concluído'
  group by pedido_id
),
perda_otim as (
  select
    d.produto_id, d.produto_nome,
    coalesce(date_trunc('month', c.dt_corte), date_trunc('month', d.dt_otim)) as mes_referencia,
    sum(d.m2_perda) as m2_perda_otimizacao,
    sum(d.m2_perda * coalesce(d.custo_m2, 0)) as valor_perda_otimizacao
  from otimizacao_perda_detalhe d
  left join corte_mes c on c.pedido_id = d.pedido_id
  group by d.produto_id, d.produto_nome, 3
),
perda_incidente as (
  select
    q.produto_id, q.produto_nome,
    coalesce(date_trunc('month', c.dt_corte), date_trunc('month', q.dt_quebra)) as mes_referencia,
    sum(q.m2_perdido) as m2_perda_incidente,
    sum(coalesce(q.valor_perda, 0)) as valor_perda_incidente
  from quebras q
  left join corte_mes c on c.pedido_id = q.pedido_id
  group by q.produto_id, q.produto_nome, 3
),
retalho_salvo as (
  select
    r.produto_id, p.nome as produto_nome,
    date_trunc('month', r.dt_gerado) as mes_referencia,
    sum(r.m2) as m2_retalho_salvo
  from retalhos r
  join produtos p on p.id = r.produto_id
  group by r.produto_id, p.nome, 3
)
select
  coalesce(o.produto_id, i.produto_id, s.produto_id)     as produto_id,
  coalesce(o.produto_nome, i.produto_nome, s.produto_nome) as produto_nome,
  coalesce(o.mes_referencia, i.mes_referencia, s.mes_referencia) as mes_referencia,
  coalesce(o.m2_perda_otimizacao, 0)  as m2_perda_otimizacao,
  coalesce(o.valor_perda_otimizacao, 0) as valor_perda_otimizacao,
  coalesce(i.m2_perda_incidente, 0)   as m2_perda_incidente,
  coalesce(i.valor_perda_incidente, 0) as valor_perda_incidente,
  coalesce(o.m2_perda_otimizacao, 0) + coalesce(i.m2_perda_incidente, 0) as m2_perda_total,
  coalesce(o.valor_perda_otimizacao, 0) + coalesce(i.valor_perda_incidente, 0) as valor_perda_total,
  coalesce(s.m2_retalho_salvo, 0)     as m2_retalho_salvo
from perda_otim o
full outer join perda_incidente i
  on i.produto_id is not distinct from o.produto_id and i.mes_referencia = o.mes_referencia
full outer join retalho_salvo s
  on s.produto_id is not distinct from coalesce(o.produto_id, i.produto_id)
 and s.mes_referencia = coalesce(o.mes_referencia, i.mes_referencia);
```

Nota: `full outer join` com 3 fontes fica verboso mas evita perder meses
em que só uma das três fontes teve movimento (ex.: mês com retalho salvo
mas sem quebra registrada). `not distinct from` trata `produto_id null`
(quebras antigas sem produto_id) sem quebrar o join.

## Fora de escopo (YAGNI)

- Nenhuma tabela de chapa física individual, nenhum novo fluxo de "chapa
  trincou" no kanban — `quebras` já cobre isso e é decisão confirmada do
  usuário não automatizar esse fluxo.
- Nenhum backfill retroativo de `historico_otimizador.chapas_json` pra
  popular `otimizacao_perda_detalhe` com dados históricos — a tabela
  nova só passa a existir daqui pra frente. Se precisar de histórico
  anterior a esta mudança, é um projeto separado (parsing de JSON).
- Nenhuma tela/dashboard nova nesta fase — a view fica pronta pra
  consumo, a UI de exibição (se quiser um relatório visual) é decisão
  separada, não pedida ainda.
- Nenhuma mudança em RLS além do baseline padrão pra
  `otimizacao_perda_detalhe` (não é tabela financeira, não entra na
  lista de `seguranca-05`).

## Testes

Sem teste automatizado (mesmo padrão do resto do projeto — tudo aqui
depende de Supabase). Verificação via `tsc --noEmit`. Validação manual do
usuário: rodar uma otimização real (idealmente combinando 2 pedidos, pra
testar o caso da armadilha de dupla-contagem), registrar uma quebra
vinculada a um dos produtos usados, conferir que
`select * from vw_perda_mensal_vidro` mostra os três números (perda
otimização, perda incidente, retalho salvo) coerentes com o que foi
gerado na tela, e que o mês bate com a data em que a etapa "Corte" daquele
pedido foi marcada como Concluída na Programação da Produção (não com a
data em que a otimização foi salva, se forem dias diferentes).
