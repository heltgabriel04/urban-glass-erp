# Controle de Perda de Vidro (m²) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a base de dados e a captura de dados necessárias pra um relatório mensal de perda de vidro por tipo (m² e valor), separando perda de otimização de perda por incidente, sem criar um modelo de chapa física — reaproveitando `quebras`, `retalhos` e `historico_otimizador`.

**Architecture:** `quebras` ganha `produto_id` (hoje só tem nome em texto livre). Nova tabela `otimizacao_perda_detalhe` guarda, por produto e por rodada de otimização, o balanço bruto/peças/retalho/perda — populada uma única vez por chamada de `handleSalvar` no Otimizador (não por pedido, pra não contar a mesma chapa em dobro quando uma rodada combina vários pedidos). Uma view `vw_perda_mensal_vidro` une as três fontes, cortando o mês pela data real de finalização da etapa "Corte" em `programacao_producao` (fallback pra data de registro quando não houver).

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase (Postgres + RLS).

## Global Constraints

- Sem tabela de chapa física individual, sem novo fluxo de "chapa trincou" no kanban — decisão confirmada (spec, seção "Fora de escopo").
- `otimizacao_perda_detalhe` é populada **uma vez por chamada de `handleSalvar`**, fora do loop `for (const pid of todosPedidos)` — nunca uma vez por pedido (spec, seção "Armadilha a evitar"; contaria a área de cada chapa em dobro quando a rodada combina pedidos).
- `custo_m2` em `otimizacao_perda_detalhe` é um snapshot gravado no momento do salvamento — nunca recalculado depois.
- Sem backfill retroativo de `historico_otimizador.chapas_json` — a tabela nova só tem dados a partir desta mudança em diante.
- Sem teste automatizado novo — nenhuma tela/serviço tocado aqui tem teste hoje (tudo depende de Supabase). Verificação via `npx tsc --noEmit`.
- Convenção da sessão: commit e push imediatamente após cada task concluída.
- Todo SQL vai em `sql/` (não `scripts/`) e precisa de uma linha nova em `sql/MANIFEST.md`, status `⏳ pendente de confirmação` até o usuário confirmar que rodou.

---

### Task 1: SQL — coluna `quebras.produto_id`, tabela `otimizacao_perda_detalhe`, view `vw_perda_mensal_vidro`

**Files:**
- Create: `sql/controle-perda-vidro.sql`
- Modify: `sql/MANIFEST.md`

**Interfaces:**
- Produces: coluna `public.quebras.produto_id int` (nullable, FK `produtos(id)`); tabela `public.otimizacao_perda_detalhe` com colunas `id, pedido_id, produto_id, produto_nome, m2_bruta_chapas, m2_pecas, m2_retalhos, m2_perda, custo_m2, dt_otim, created_at`; view `public.vw_perda_mensal_vidro` com colunas `produto_id, produto_nome, mes_referencia, m2_perda_otimizacao, valor_perda_otimizacao, m2_perda_incidente, valor_perda_incidente, m2_perda_total, valor_perda_total, m2_retalho_salvo`. Consumido pelas Tasks 2-5.

- [ ] **Step 1: Criar o arquivo SQL completo**

Criar `sql/controle-perda-vidro.sql`:

```sql
-- ============================================================
-- Controle de Perda de Vidro (m²) — base de dados
-- Une quebras + retalhos + historico_otimizador num relatório mensal
-- de perda por tipo de vidro, sem modelo de chapa física individual.
-- Ver docs/superpowers/specs/2026-07-16-controle-perda-vidro-design.md
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

-- 1. quebras ganha produto_id (hoje só tem produto_nome em texto livre)
alter table public.quebras add column if not exists produto_id int references produtos(id);
create index if not exists idx_quebras_produto on public.quebras (produto_id);

-- 2. Detalhe de perda de otimização por produto, por rodada
create table if not exists public.otimizacao_perda_detalhe (
  id                bigserial primary key,
  pedido_id         text not null references pedidos(id) on delete cascade,
  produto_id        int references produtos(id),
  produto_nome      text not null,
  m2_bruta_chapas   numeric not null default 0,
  m2_pecas          numeric not null default 0,
  m2_retalhos       numeric not null default 0,
  m2_perda          numeric not null default 0,
  custo_m2          numeric,
  dt_otim           date not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_otim_perda_pedido  on public.otimizacao_perda_detalhe (pedido_id);
create index if not exists idx_otim_perda_produto on public.otimizacao_perda_detalhe (produto_id);

alter table public.otimizacao_perda_detalhe enable row level security;

drop policy if exists "auth_full_access" on public.otimizacao_perda_detalhe;
create policy "auth_full_access" on public.otimizacao_perda_detalhe
  for all to authenticated using (true) with check (true);

-- 3. View mensal por tipo de vidro
create or replace view public.vw_perda_mensal_vidro as
with corte_mes as (
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

-- ── Verificação ─────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='quebras' and column_name='produto_id';
-- select * from public.otimizacao_perda_detalhe limit 1;
-- select * from public.vw_perda_mensal_vidro order by mes_referencia desc limit 20;
```

- [ ] **Step 2: Adicionar entrada no manifesto**

Em `sql/MANIFEST.md`, na última linha da tabela (depois de `sql/rbac-comercial-operacional.sql`), adicionar:

```
| 2026-07-16 | `sql/controle-perda-vidro.sql` | Controle de Perda de Vidro — quebras.produto_id, otimizacao_perda_detalhe, vw_perda_mensal_vidro | ⏳ |
```

- [ ] **Step 3: Commit e push**

```bash
git add sql/controle-perda-vidro.sql sql/MANIFEST.md
git commit -m "feat: schema de Controle de Perda de Vidro (quebras.produto_id, otimizacao_perda_detalhe, vw_perda_mensal_vidro)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

Depois de pushar, avisar o usuário que `sql/controle-perda-vidro.sql` precisa ser rodado no SQL Editor do Supabase antes das Tasks 3-4 funcionarem de ponta a ponta (o `tsc` das próximas tasks passa sem o SQL rodado, mas o app quebraria em runtime).

---

### Task 2: Tipos TypeScript — `Quebra.produto_id` e `OtimizacaoPerdaDetalhe`

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `Quebra.produto_id: number | null` (consumido pela Task 3); `export interface OtimizacaoPerdaDetalhe { ... }` e `export type OtimizacaoPerdaDetalheInsert = Omit<OtimizacaoPerdaDetalhe, 'id' | 'created_at'>;` (consumidos pela Task 4).

- [ ] **Step 1: Adicionar `produto_id` na interface `Quebra`**

Em `types/index.ts:1186-1210`, hoje:

```ts
export interface Quebra {
  id: number;
  nc_id: number | null;
  pedido_id: string | null;
  cliente_id: number | null;
  produto_nome: string;
  espessura: string | null;
```

Troca por:

```ts
export interface Quebra {
  id: number;
  nc_id: number | null;
  pedido_id: string | null;
  cliente_id: number | null;
  produto_id: number | null;
  produto_nome: string;
  espessura: string | null;
```

(`QuebraInsert`, logo abaixo em `types/index.ts:1212`, é `Omit<Quebra, 'id' | 'created_at' | 'valor_perda' | 'pedidos' | 'clientes'>` — já inclui `produto_id` automaticamente, nenhuma mudança necessária ali.)

- [ ] **Step 2: Adicionar a interface `OtimizacaoPerdaDetalhe`**

Em `types/index.ts`, logo depois do fim da interface `HistoricoOtimizador` (linha 663, `}`), adicionar:

```ts

export interface OtimizacaoPerdaDetalhe {
  id: number;
  pedido_id: string;
  produto_id: number | null;
  produto_nome: string;
  m2_bruta_chapas: number;
  m2_pecas: number;
  m2_retalhos: number;
  m2_perda: number;
  custo_m2: number | null;
  dt_otim: string;
  created_at: string;
}

export type OtimizacaoPerdaDetalheInsert = Omit<OtimizacaoPerdaDetalhe, 'id' | 'created_at'>;
```

- [ ] **Step 3: Registrar a tabela no mapa `Database`**

Em `types/index.ts:1376`, hoje:

```ts
      historico_otimizador:    { Row: HistoricoOtimizador                                                     };
```

Troca por:

```ts
      historico_otimizador:    { Row: HistoricoOtimizador                                                     };
      otimizacao_perda_detalhe: { Row: OtimizacaoPerdaDetalhe; Insert: OtimizacaoPerdaDetalheInsert            };
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos (o `produto_id` novo em `Quebra` é opcional-compatível — nenhum código existente que constrói um `Quebra` sem esse campo deveria quebrar, já que só é consumido, nunca construído literal fora do Supabase; confirmar isso é justamente o propósito deste passo).

- [ ] **Step 5: Commit e push**

```bash
git add types/index.ts
git commit -m "feat: tipos para Quebra.produto_id e OtimizacaoPerdaDetalhe

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 3: `app/qualidade/quebras/page.tsx` — persistir `produto_id` na Quebra

**Files:**
- Modify: `app/qualidade/quebras/page.tsx`

**Interfaces:**
- Consumes: `Quebra.produto_id: number | null` (Task 2).

- [ ] **Step 1: Ler o estado atual de `produtos` e o form**

Em `app/qualidade/quebras/page.tsx:42`, hoje:

```tsx
  const [produtos, setProdutos] = useState<{ nome: string; custo_m2: number }[]>([]);
```

Troca por (o form precisa do `id` do produto pra persistir, não só nome/custo):

```tsx
  const [produtos, setProdutos] = useState<{ id: number | null; nome: string; custo_m2: number }[]>([]);
```

- [ ] **Step 2: Incluir `id` na carga de `produtos`**

Em `app/qualidade/quebras/page.tsx:51`, hoje:

```tsx
    getEstoque().then(est => setProdutos(est.map((e: any) => ({ nome: e.cod ?? e.produtos?.nome ?? "—", custo_m2: Number(e.custo_m2) }))));
```

Troca por:

```tsx
    getEstoque().then(est => setProdutos(est.map((e: any) => ({ id: e.produto_id ?? null, nome: e.cod ?? e.produtos?.nome ?? "—", custo_m2: Number(e.custo_m2) }))));
```

- [ ] **Step 3: Persistir `produto_id` no form ao selecionar o produto**

Em `app/qualidade/quebras/page.tsx:63`, hoje:

```tsx
    setForm(f => ({ ...f, produto_nome: nome, custo_m2: prod?.custo_m2 ?? null }));
```

Troca por:

```tsx
    setForm(f => ({ ...f, produto_nome: nome, produto_id: prod?.id ?? null, custo_m2: prod?.custo_m2 ?? null }));
```

- [ ] **Step 4: Incluir `produto_id: null` no estado inicial do form**

Em `app/qualidade/quebras/page.tsx:25`, hoje:

```tsx
  produto_nome: "", espessura: null, cor: null, chapa_referencia: null,
```

Troca por:

```tsx
  produto_nome: "", produto_id: null, espessura: null, cor: null, chapa_referencia: null,
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit e push**

```bash
git add app/qualidade/quebras/page.tsx
git commit -m "feat: tela de Quebras persiste produto_id (não só o nome)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 4: `app/otimizador/page.tsx` — popular `otimizacao_perda_detalhe`

**Files:**
- Modify: `app/otimizador/page.tsx`

**Interfaces:**
- Consumes: `OtimizacaoPerdaDetalheInsert` (Task 2); `getEstoque(): Promise<EstoqueItem[]>` de `services/estoque.service.ts` (já existe, já importado em outras telas — ver `app/qualidade/quebras/page.tsx:51`); `resultado: ResultadoChapa[]` e `retalhosGerados` (já existem no componente, tipos inferidos do arquivo).

- [ ] **Step 1: Importar `getEstoque`**

Em `app/otimizador/page.tsx:14`, hoje:

```tsx
import { salvarRetalhos } from "@/services/estoque.service";
```

Troca por:

```tsx
import { getEstoque, salvarRetalhos } from "@/services/estoque.service";
```

- [ ] **Step 2: Importar o tipo `OtimizacaoPerdaDetalheInsert`**

Em `app/otimizador/page.tsx:16`, hoje:

```tsx
import type { Produto, Retalho } from "@/types";
```

Troca por:

```tsx
import type { Produto, Retalho, OtimizacaoPerdaDetalheInsert } from "@/types";
```

- [ ] **Step 3: Calcular e inserir o detalhe de perda por produto, uma vez por `handleSalvar`**

Em `app/otimizador/page.tsx`, dentro de `handleSalvar`, logo depois do bloco que calcula `consumoPorProd` e baixa o estoque (linhas 833-850, terminando no `for (const [prodNome, consumo] of consumoPorProd.entries()) { ... }`), adicionar um novo bloco (antes do fechamento da função — localizar pelo conteúdo: é o trecho logo após o loop de `registrarMovimentacao`, ainda dentro de `handleSalvar`):

```tsx
    // Detalhe de perda de otimização por produto — uma vez por rodada, não
    // por pedido (rodada pode combinar vários pedidos; chapas_json duplica
    // as mesmas chapas em cada linha de historico_otimizador por pedido).
    const estoqueAtual = await getEstoque();
    const custoPorProdId = new Map<number, number>();
    for (const e of estoqueAtual) {
      if (e.produto_id != null) custoPorProdId.set(e.produto_id, Number(e.custo_m2) || 0);
    }

    const perdaPorProd = new Map<string, { bruta: number; pecas: number; retalhos: number }>();
    resultado.forEach(r => {
      const prev = perdaPorProd.get(r.prod) ?? { bruta: 0, pecas: 0, retalhos: 0 };
      prev.bruta += (r.W * r.H) / 1e6;
      prev.pecas += r.placed.reduce((a: number, p: any) => a + (p.l * p.a) / 1e6, 0);
      perdaPorProd.set(r.prod, prev);
    });
    retalhosGerados.forEach(fr => {
      const prev = perdaPorProd.get(fr.prod) ?? { bruta: 0, pecas: 0, retalhos: 0 };
      prev.retalhos += fr.m2;
      perdaPorProd.set(fr.prod, prev);
    });

    const perdaDetalhe: OtimizacaoPerdaDetalheInsert[] = Array.from(perdaPorProd.entries()).map(([prodNome, v]) => {
      const produtoId = produtos.find(pr => pr.nome === prodNome)?.id ?? null;
      const m2Perda = parseFloat((v.bruta - v.pecas - v.retalhos).toFixed(4));
      if (Math.abs(m2Perda) > 0.01 && v.bruta === 0) {
        console.warn(`Perda de otimização suspeita para "${prodNome}": bruta=0 mas pecas/retalhos > 0.`);
      }
      return {
        pedido_id: pedidoRef,
        produto_id: produtoId,
        produto_nome: prodNome,
        m2_bruta_chapas: parseFloat(v.bruta.toFixed(4)),
        m2_pecas: parseFloat(v.pecas.toFixed(4)),
        m2_retalhos: parseFloat(v.retalhos.toFixed(4)),
        m2_perda: m2Perda,
        custo_m2: produtoId != null ? (custoPorProdId.get(produtoId) ?? null) : null,
        dt_otim: hoje,
      };
    });
    if (perdaDetalhe.length > 0) {
      await supabase.from("otimizacao_perda_detalhe").insert(perdaDetalhe as never);
    }
```

**Atenção:** este bloco usa `resultado` (não `chapasJson`/`chapasComPecasDoPedido`, que são cópias filtradas por pedido) e `retalhosGerados` sem filtro — os mesmos dados-fonte que `consumoPorProd` já usa hoje (linhas 833-838), garantindo que cada chapa física é contada uma única vez mesmo quando a rodada combina vários pedidos.

- [ ] **Step 4: Apagar as linhas de perda ao zerar a otimização**

Em `app/otimizador/page.tsx:784`, hoje:

```tsx
    await supabase.from("historico_otimizador").delete().eq("pedido_id", pedidoRef);
    await reverterMovimentacao("otimizacao", pedidoRef);
    await updatePedido(pedidoRef, { status: "Aguardando otimização" });
    for (const pid of pedidosSelecionados) {
      await supabase.from("historico_otimizador").delete().eq("pedido_id", pid);
      await reverterMovimentacao("otimizacao", pid);
      await updatePedido(pid, { status: "Aguardando otimização" });
    }
```

Troca por:

```tsx
    await supabase.from("historico_otimizador").delete().eq("pedido_id", pedidoRef);
    await supabase.from("otimizacao_perda_detalhe").delete().eq("pedido_id", pedidoRef);
    await reverterMovimentacao("otimizacao", pedidoRef);
    await updatePedido(pedidoRef, { status: "Aguardando otimização" });
    for (const pid of pedidosSelecionados) {
      await supabase.from("historico_otimizador").delete().eq("pedido_id", pid);
      await supabase.from("otimizacao_perda_detalhe").delete().eq("pedido_id", pid);
      await reverterMovimentacao("otimizacao", pid);
      await updatePedido(pid, { status: "Aguardando otimização" });
    }
```

(`otimizacao_perda_detalhe` só é gravada com `pedido_id: pedidoRef` — o delete dentro do loop de `pedidosSelecionados` é inofensivo/no-op pra essa tabela nesses casos, mas mantém o padrão simétrico com `historico_otimizador` e cobre o caso de zerar a partir de qualquer um dos pedidos combinados.)

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. Se `OtimizacaoPerdaDetalheInsert` não for encontrado, confirmar que a Task 2 foi commitada antes desta.

- [ ] **Step 6: Commit e push**

```bash
git add app/otimizador/page.tsx
git commit -m "feat: Otimizador registra perda de otimização por tipo de vidro

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 5: Verificação final e memória

**Files:**
- Modify: `C:\Users\ADM 01\.claude\projects\C--Users-ADM-01-urban-glass-erp\memory\MEMORY.md`
- Modify: `C:\Users\ADM 01\.claude\projects\C--Users-ADM-01-urban-glass-erp\memory\project-controle-perda-vidro.md`

**Interfaces:**
- Consumes: nada de código — só documentação/memória.

- [ ] **Step 1: Rodar `tsc` uma última vez no HEAD final**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 2: Atualizar a memória do projeto**

`project-controle-perda-vidro.md` já existe (criado quando o design foi guardado, 2026-07-16) com `description: "... guardado para sessão futura, adaptado ao schema real, não implementado ainda"`. Atualizar:

- O campo `description` no frontmatter, removendo "não implementado ainda" e trocando por algo como: `implementado 2026-07-16 (código pushado), SQL pendente de confirmação`.
- Adicionar uma seção nova no fim do corpo do arquivo:

```markdown

## Implementação (2026-07-16)

Código pushado. Spec: `docs/superpowers/specs/2026-07-16-controle-perda-vidro-design.md`.
Plano: `docs/superpowers/plans/2026-07-16-controle-perda-vidro.md`.

**⏳ Pendente de confirmação**: `sql/controle-perda-vidro.sql` ainda não
confirmado como rodado no Supabase — sem ele, `quebras.produto_id` não
existe, `otimizacao_perda_detalhe` não existe, e tanto a tela de Quebras
quanto o Otimizador vão logar erro no `insert`/`select` desses campos em
runtime (o `tsc` passa porque os tipos são só do lado do app).

Validação manual pendente do usuário, depois do SQL confirmado: rodar uma
otimização real combinando 2 pedidos (testa a armadilha de dupla-contagem
documentada na spec), registrar uma quebra vinculada a um dos produtos, e
conferir `select * from vw_perda_mensal_vidro` — os três números (perda
otimização, perda incidente, retalho salvo) devem bater com o que foi
gerado nas telas, no mês da finalização real do corte (não da data em que
a otimização foi salva).
```

- [ ] **Step 3: Atualizar `MEMORY.md`**

Em `C:\Users\ADM 01\.claude\projects\C--Users-ADM-01-urban-glass-erp\memory\MEMORY.md`, a linha existente:

```
- [Controle de Perda de Vidro](project-controle-perda-vidro.md) — guardado 2026-07-16, design adaptado ao schema real (não implementado); quebras+retalhos já cobrem incidente/retalho, falta só perda de otimização por tipo de vidro
```

Troca por:

```
- [Controle de Perda de Vidro](project-controle-perda-vidro.md) — implementado 2026-07-16 (código pushado), SQL ⏳ pendente de confirmação; ver seção "Implementação" no arquivo pra validação manual pendente
```

- [ ] **Step 4: Conferir que o repositório do ERP está limpo**

O diretório de memória fica fora do repositório do ERP — o Step 2-3 não gera commit nesse repositório.

Run: `git status`
Expected: working tree limpo (tudo já commitado/pushado nas Tasks 1-4).
