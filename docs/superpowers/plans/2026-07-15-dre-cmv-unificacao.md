# Unificação do CMV entre DRE e Estoque/CMV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `getDRE` (regime de competência) usar o mesmo CMV rigoroso da tela Contabilidade → Estoque → CMV, em vez do cálculo simplificado atual, e mostrar a quebra Vidro/Itens Gerais na tela `/dre`.

**Architecture:** `services/dre.service.ts` para de calcular CMV sozinho e passa a chamar `getCMVPeriodo` de `services/contabilidadeEstoqueCmv.service.ts` — a mesma função que a tela de Estoque/CMV já usa. `app/dre/page.tsx` exibe a quebra retornada, reutilizando o componente `Linha` já existente (só ganha um nível extra de indentação).

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase.

## Global Constraints

- `lucroBruto`/`margemBrutaPct`/`resultado` do DRE continuam calculados a partir do `receita` que o próprio `getDRE` já calcula (pós-devolução) — NUNCA usar `cmvPeriodo.receita`/`.lucroBruto`, que não descontam devolução (spec, seção "Armadilha a evitar").
- Regime `'caixa'` não muda: `cmv` continua `0`, ganha só `cmvDetalhe: null`.
- `dre.cmvDetalhe.vidro` é um objeto `{ cmv: number }`, não um número — sempre acessar `.vidro.cmv`.
- Sem teste automatizado novo — nenhum dos dois arquivos tem teste hoje (ambos 100% dependentes de Supabase). Verificação via `npx tsc --noEmit` + `npm run build`.
- Convenção da sessão: commit e push imediatamente após cada task concluída.

---

### Task 1: `services/dre.service.ts` — usar `getCMVPeriodo`

**Files:**
- Modify: `services/dre.service.ts`

**Interfaces:**
- Consumes: `getCMVPeriodo(inicio: string, fim: string): Promise<CMVPeriodo>` e o tipo `CMVPeriodo` (ambos já existem em `services/contabilidadeEstoqueCmv.service.ts`, exportados).
- Produces: `export type DRECmvDetalhe = Pick<CMVPeriodo, 'vidro' | 'itensGerais'>;` e `DRE.cmvDetalhe: DRECmvDetalhe | null` — consumido pela Task 2.

- [ ] **Step 1: Import `getCMVPeriodo` e o tipo `CMVPeriodo`**

Em `services/dre.service.ts:1`, hoje:

```ts
import { supabase } from '@/lib/supabase/client';
```

Troca por:

```ts
import { supabase } from '@/lib/supabase/client';
import { getCMVPeriodo, type CMVPeriodo } from './contabilidadeEstoqueCmv.service';
```

- [ ] **Step 2: Adicionar `DRECmvDetalhe` e o campo `cmvDetalhe` na interface `DRE`**

Em `services/dre.service.ts:7-19`, hoje:

```ts
export interface DRE {
  regime: RegimeDRE;
  receitaBruta: number;     // competência: Σ valor_total dos pedidos · caixa: Σ baixas de Entrada
  devolucoes: number;       // lançamentos natureza='devolucao' no período
  receita: number;          // receitaBruta − devolucoes
  cmv: number;              // custo das chapas (aprox., custo_m2 atual) — só calculado em competência
  lucroBruto: number;       // receita − cmv
  despesas: DRELinhaDespesa[];
  despesasTotal: number;
  resultado: number;        // lucroBruto − despesas
  margemBrutaPct: number;
  margemLiquidaPct: number;
}
```

Troca por:

```ts
export type DRECmvDetalhe = Pick<CMVPeriodo, 'vidro' | 'itensGerais'>;

export interface DRE {
  regime: RegimeDRE;
  receitaBruta: number;     // competência: Σ valor_total dos pedidos · caixa: Σ baixas de Entrada
  devolucoes: number;       // lançamentos natureza='devolucao' no período
  receita: number;          // receitaBruta − devolucoes
  cmv: number;              // mesmo CMV rigoroso da tela Estoque/CMV — só calculado em competência
  cmvDetalhe: DRECmvDetalhe | null;  // quebra vidro/itens gerais — null no regime 'caixa'
  lucroBruto: number;       // receita − cmv
  despesas: DRELinhaDespesa[];
  despesasTotal: number;
  resultado: number;        // lucroBruto − despesas
  margemBrutaPct: number;
  margemLiquidaPct: number;
}
```

- [ ] **Step 3: Atualizar o JSDoc do topo do arquivo**

Em `services/dre.service.ts:43-56`, dentro do comentário, hoje tem a linha:

```
 *   (−) CMV (custo das chapas; custo_m2 atual, sem lapidação)
```

Troca por:

```
 *   (−) CMV (mesmo cálculo rigoroso da tela Contabilidade → Estoque →
 *       CMV: vidro por custo histórico + itens gerais por EI+Compras−EF)
```

- [ ] **Step 4: `cmvDetalhe: null` no branch `'caixa'`**

Em `services/dre.service.ts:78-82`, hoje:

```ts
    return {
      regime, receitaBruta, devolucoes, receita, cmv, lucroBruto, despesas, despesasTotal, resultado,
      margemBrutaPct:   receita > 0 ? (lucroBruto / receita) * 100 : 0,
      margemLiquidaPct: receita > 0 ? (resultado / receita) * 100 : 0,
    };
  }
```

Troca por:

```ts
    return {
      regime, receitaBruta, devolucoes, receita, cmv, cmvDetalhe: null, lucroBruto, despesas, despesasTotal, resultado,
      margemBrutaPct:   receita > 0 ? (lucroBruto / receita) * 100 : 0,
      margemLiquidaPct: receita > 0 ? (resultado / receita) * 100 : 0,
    };
  }
```

- [ ] **Step 5: Trocar a query de `estoque` por `getCMVPeriodo` no `Promise.all`**

Em `services/dre.service.ts:85-90`, hoje:

```ts
  const [pedidosRes, estoqueRes, despesasRes, devolucoesRes] = await Promise.all([
    supabase.from('pedidos').select('id, valor_total').neq('status', 'Cancelado').gte('dt_pedido', ini).lte('dt_pedido', fim),
    supabase.from('estoque').select('produto_id, custo_m2'),
    supabase.from('lancamentos').select('valor, vencimento, plano_contas(descricao)').eq('tipo', 'Saída').eq('natureza', 'normal').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    supabase.from('lancamentos').select('valor').eq('natureza', 'devolucao').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
  ]);
```

Troca por:

```ts
  const [pedidosRes, despesasRes, devolucoesRes, cmvPeriodo] = await Promise.all([
    supabase.from('pedidos').select('id, valor_total').neq('status', 'Cancelado').gte('dt_pedido', ini).lte('dt_pedido', fim),
    supabase.from('lancamentos').select('valor, vencimento, plano_contas(descricao)').eq('tipo', 'Saída').eq('natureza', 'normal').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    supabase.from('lancamentos').select('valor').eq('natureza', 'devolucao').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    getCMVPeriodo(ini, fim),
  ]);
```

- [ ] **Step 6: Substituir o cálculo antigo de CMV pelo resultado de `getCMVPeriodo`**

Em `services/dre.service.ts:97-115`, hoje:

```ts
  // CMV dos pedidos do período
  let cmv = 0;
  const pedidoIds = pedidos.map(p => p.id);
  if (pedidoIds.length) {
    const custoM2 = new Map<number, number>();
    for (const e of (estoqueRes.data ?? []) as Array<{ produto_id: number | null; custo_m2: number }>) {
      if (e.produto_id != null) custoM2.set(e.produto_id, Number(e.custo_m2) || 0);
    }
    const { data: itens } = await supabase
      .from('itens_pedido')
      .select('produto_id, m2, vidro_cliente')
      .in('pedido_id', pedidoIds);
    for (const it of (itens ?? []) as Array<{ produto_id: number | null; m2: number; vidro_cliente: boolean }>) {
      if (it.vidro_cliente) continue;
      const c = it.produto_id != null ? (custoM2.get(it.produto_id) ?? 0) : 0;
      cmv += Number(it.m2) * c;
    }
    cmv = parseFloat(cmv.toFixed(2));
  }
```

Troca por:

```ts
  // CMV dos pedidos do período — mesmo cálculo rigoroso da tela Estoque/CMV
  const cmv = cmvPeriodo.cmvTotal;
  const cmvDetalhe: DRECmvDetalhe = { vidro: cmvPeriodo.vidro, itensGerais: cmvPeriodo.itensGerais };
```

**Atenção:** `receita`/`receitaBruta`/`devolucoes`, calculados nas linhas logo acima (`dre.service.ts:92-95`), NÃO mudam — continuam vindos de `pedidosRes`/`devolucoesRes`, não de `cmvPeriodo`. `lucroBruto` (linha seguinte, `parseFloat((receita - cmv).toFixed(2))`) também não muda de fórmula, só o valor de `cmv` que entra nela já vem correto agora.

- [ ] **Step 7: Adicionar `cmvDetalhe` no retorno final**

Em `services/dre.service.ts:125-130` (numeração original — pode ter shiftado ~2 linhas pra cima depois do Step 6 remover código; localizar pelo conteúdo, não pela linha), hoje:

```ts
  return {
    regime, receitaBruta, devolucoes, receita, cmv, lucroBruto, despesas, despesasTotal, resultado,
    margemBrutaPct:   receita > 0 ? (lucroBruto / receita) * 100 : 0,
    margemLiquidaPct: receita > 0 ? (resultado / receita) * 100 : 0,
  };
}
```

Troca por:

```ts
  return {
    regime, receitaBruta, devolucoes, receita, cmv, cmvDetalhe, lucroBruto, despesas, despesasTotal, resultado,
    margemBrutaPct:   receita > 0 ? (lucroBruto / receita) * 100 : 0,
    margemLiquidaPct: receita > 0 ? (resultado / receita) * 100 : 0,
  };
}
```

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 9: Commit e push**

```bash
git add services/dre.service.ts
git commit -m "feat: DRE usa o mesmo CMV rigoroso da tela Estoque/CMV

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 2: `app/dre/page.tsx` — exibir a quebra Vidro/Itens Gerais

**Files:**
- Modify: `app/dre/page.tsx`

**Interfaces:**
- Consumes: `DRE.cmvDetalhe: DRECmvDetalhe | null` (Task 1), onde `DRECmvDetalhe = { vidro: { cmv: number }, itensGerais: { estoqueInicial: number; compras: number; estoqueFinal: number; cmv: number } }`.

- [ ] **Step 1: `Linha` ganha indentação em 2 níveis**

Em `app/dre/page.tsx:104-114`, hoje:

```tsx
function Linha({ label, valor, forte, cor, sub, indent, pequeno, divisor }: {
  label: string; valor: number; forte?: boolean; cor?: string; sub?: string;
  indent?: boolean; pequeno?: boolean; divisor?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: pequeno ? "6px 20px" : "12px 20px",
      paddingLeft: indent ? "36px" : "20px",
      borderTop: divisor ? "1px solid var(--b1)" : undefined,
    }}>
```

Troca por:

```tsx
function Linha({ label, valor, forte, cor, sub, indent, pequeno, divisor }: {
  label: string; valor: number; forte?: boolean; cor?: string; sub?: string;
  indent?: 1 | 2; pequeno?: boolean; divisor?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: pequeno ? "6px 20px" : "12px 20px",
      paddingLeft: indent === 2 ? "52px" : indent === 1 ? "36px" : "20px",
      borderTop: divisor ? "1px solid var(--b1)" : undefined,
    }}>
```

- [ ] **Step 2: Atualizar o único uso existente de `indent` (linha de despesas)**

Em `app/dre/page.tsx:83-85`, hoje:

```tsx
            {dre.despesas.map(d => (
              <Linha key={d.categoria} label={d.categoria} valor={-d.valor} indent pequeno />
            ))}
```

Troca por:

```tsx
            {dre.despesas.map(d => (
              <Linha key={d.categoria} label={d.categoria} valor={-d.valor} indent={1} pequeno />
            ))}
```

- [ ] **Step 3: Adicionar as 5 sub-linhas de CMV**

Em `app/dre/page.tsx:74-75`, hoje:

```tsx
            <Linha label="(−) CMV" valor={-dre.cmv} cor="var(--warn)" />
            <Linha label="= Lucro Bruto" valor={dre.lucroBruto} forte sub={formatPercent(dre.margemBrutaPct, 1) + " da receita"} divisor />
```

Troca por:

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
            <Linha label="= Lucro Bruto" valor={dre.lucroBruto} forte sub={formatPercent(dre.margemBrutaPct, 1) + " da receita"} divisor />
```

- [ ] **Step 4: Atualizar o export Excel**

Em `app/dre/page.tsx:46-54`, hoje:

```tsx
            [
              ["Receita Bruta", dre.receitaBruta],
              ...(dre.devolucoes > 0 ? [["(-) Devoluções", -dre.devolucoes]] : []),
              ["(-) CMV", -dre.cmv],
              ["= Lucro Bruto", dre.lucroBruto],
              ...dre.despesas.map(d => [`(-) ${d.categoria}`, -d.valor]),
              ["(-) Total de Despesas", -dre.despesasTotal],
              ["= Resultado", dre.resultado],
            ] as (string | number)[][]
```

Troca por:

```tsx
            [
              ["Receita Bruta", dre.receitaBruta],
              ...(dre.devolucoes > 0 ? [["(-) Devoluções", -dre.devolucoes]] : []),
              ["(-) CMV", -dre.cmv],
              ...(regime === "competencia" && dre.cmvDetalhe ? [
                ["   Vidro", -dre.cmvDetalhe.vidro.cmv],
                ["   Itens Gerais", -dre.cmvDetalhe.itensGerais.cmv],
                ["      Estoque Inicial", dre.cmvDetalhe.itensGerais.estoqueInicial],
                ["      Compras", dre.cmvDetalhe.itensGerais.compras],
                ["      Estoque Final", -dre.cmvDetalhe.itensGerais.estoqueFinal],
              ] as (string | number)[][] : []),
              ["= Lucro Bruto", dre.lucroBruto],
              ...dre.despesas.map(d => [`(-) ${d.categoria}`, -d.valor]),
              ["(-) Total de Despesas", -dre.despesasTotal],
              ["= Resultado", dre.resultado],
            ] as (string | number)[][]
```

- [ ] **Step 5: Atualizar o texto de contexto**

Em `app/dre/page.tsx:61-63`, hoje:

```tsx
          {regime === "competencia" ? (
            <>DRE por competência ({periodoLabel}). Receita = faturamento (pedidos por data). CMV usa o custo/m² atual
            do estoque (sem lapidação). Despesas = lançamentos de saída agrupados pelo Plano de Contas.</>
          ) : (
```

Troca por:

```tsx
          {regime === "competencia" ? (
            <>DRE por competência ({periodoLabel}). Receita = faturamento (pedidos por data). CMV é o mesmo cálculo
            rigoroso da tela Contabilidade → Estoque → CMV (custo histórico do vidro + itens gerais). Despesas = lançamentos de saída agrupados pelo Plano de Contas.</>
          ) : (
```

- [ ] **Step 6: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 7: Commit e push**

```bash
git add app/dre/page.tsx
git commit -m "feat: tela DRE mostra quebra Vidro/Itens Gerais do CMV

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Verificação final e memória

**Files:**
- Modify: `C:\Users\ADM 01\.claude\projects\C--Users-ADM-01-urban-glass-erp\memory\MEMORY.md`
- Create: `C:\Users\ADM 01\.claude\projects\C--Users-ADM-01-urban-glass-erp\memory\project-dre-cmv-unificacao.md`

**Interfaces:**
- Consumes: nada de código — só documentação/memória.

- [ ] **Step 1: Rodar `tsc` e `build` uma última vez no HEAD final**

Run: `npx tsc --noEmit && npm run build`
Expected: ambos limpos.

- [ ] **Step 2: Criar a memória do projeto**

Criar `C:\Users\ADM 01\.claude\projects\C--Users-ADM-01-urban-glass-erp\memory\project-dre-cmv-unificacao.md`:

```markdown
---
name: project-dre-cmv-unificacao
description: DRE e tela Estoque/CMV calculavam CMV de dois jeitos diferentes (divergência real) — unificados 2026-07-15, DRE agora usa getCMVPeriodo
metadata:
  node_type: memory
  type: project
---

Auditoria de relatórios pro contador (Amplifique, 2026-07-15) encontrou
que `services/dre.service.ts` (página `/dre`) calculava CMV só com custo
de vidro ATUAL (sem itens gerais), enquanto
`services/contabilidadeEstoqueCmv.service.ts` (tela Contabilidade →
Estoque → CMV) usava custo histórico + itens gerais (EI+Compras−EF) —
os dois números podiam divergir de verdade quando mostrados ao
contador. Usuário confirmou que o /dre também é documento oficial, não
só aproximação interna — corrigido pra unificar, não só documentar a
diferença.

Solução: `getDRE` (regime competência) passou a chamar `getCMVPeriodo`
como única fonte de CMV. Tela `/dre` ganhou a mesma quebra
Vidro/Itens Gerais (com Estoque Inicial/Compras/Estoque Final) que já
existia na tela de Estoque. Regime caixa não muda (CMV continua não
calculado ali, por desenho já documentado). Decisão explícita do
usuário: priorizar correção sobre performance (getCMVPeriodo é mais
pesado — reconstrói o livro-razão de itens gerais no início/fim do
período).

Spec `docs/superpowers/specs/2026-07-15-dre-cmv-unificacao-design.md`,
plano `docs/superpowers/plans/2026-07-15-dre-cmv-unificacao.md`.
Validação manual do usuário ainda pendente: comparar o CMV de um mês
fechado no `/dre` com o mesmo mês na tela Estoque/CMV — devem bater
exatamente agora.

Veio da auditoria maior de relatórios pro contador (10 itens
verificados item a item — fiscal de entrada/NCM, sequência de notas de
saída, XML de saída, notas de perda, estoque mensal, CMV, CMP,
conciliação bancária, extrato de cartão, ativo imobilizado) — essa
divergência de CMV foi o único item classificado como risco silencioso
(os outros ou já funcionavam, ou visivelmente não existiam ainda).
```

- [ ] **Step 3: Atualizar `MEMORY.md`**

Adicionar uma linha nova ao índice (não editar as existentes):

```
- [DRE × Estoque/CMV unificados](project-dre-cmv-unificacao.md) — 2026-07-15, DRE usava CMV simplificado (só vidro atual) e divergia do CMV oficial da tela de Estoque; agora os dois batem
```

- [ ] **Step 4: Conferir que o repositório do ERP está limpo**

O diretório de memória fica fora do repositório do ERP — os Steps 2-3
não geram commit nesse repositório.

Run: `git status`
Expected: working tree limpo (tudo já commitado/pushado nas Tasks 1-2).
