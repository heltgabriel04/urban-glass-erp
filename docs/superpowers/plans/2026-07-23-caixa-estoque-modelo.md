# Estoque por Caixa — Sub-projeto 1: Modelo de dado + consumo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer de cada linha de `lotes_estoque` uma "caixa física" rastreável (código único + QR), e corrigir a baixa de venda direta de chapa cheia pra resolver e debitar a caixa certa — em vez do agregado antigo.

**Architecture:** Extensão de `lotes_estoque` (2 colunas novas: `codigo` gerado, `qr_token`), sem tabela nova. Lógica de resolução de caixa (qual caixa usar, bloqueio por saldo insuficiente) vive em funções puras testáveis (`lib/caixaEstoque.ts`), consumidas tanto pelo service de pedidos quanto pela UI de novo pedido. Nenhuma mudança na assinatura pública de `registrarMovimentacao` (já aceita `loteId`).

**Tech Stack:** Next.js (App Router), React, Supabase (Postgres + supabase-js), Vitest.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-23-caixa-estoque-modelo-design.md`.
- Migração SQL vai em `sql/` e é executada manualmente pelo usuário no Supabase SQL Editor — nenhuma task deste plano executa DDL contra o banco diretamente.
- Depois de cada task: `npx tsc --noEmit` limpo e `npx vitest run` com os 202 testes existentes (mais os novos desta leva) passando.
- Antes do commit final (última task), rodar também `npx next build`.
- Commits em português, seguindo o estilo do histórico do repo.
- Escopo desta leva: modelo de dado + resolução de caixa na venda direta de chapa cheia + correção do bug de `isChapaInteira` divergente + lista de caixas em `/estoque/caixas`. **Não** inclui: layout/impressão da etiqueta em si (sub-projeto 3), carga dos dados reais do usuário (sub-projeto 2), bloqueio de saldo no Otimizador (fora de escopo, decisão do usuário).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `sql/lotes-estoque-caixa.sql` | criar | migração: colunas `codigo` (gerada) e `qr_token` em `lotes_estoque` |
| `types/index.ts` | modificar | `LoteEstoque` ganha `codigo`, `qr_token` |
| `lib/caixaEstoque.ts` | criar | `statusCaixa`, `filtrarCaixasCandidatas`, `resolverCaixaParaVenda` (lógica pura, sem Supabase) |
| `lib/caixaEstoque.test.ts` | criar | testes das 3 funções acima |
| `app/api/cx/[token]/route.ts` | criar | rota pública do QR — resolve `qr_token` → HTML com dados da caixa |
| `services/pedidos.service.ts` | modificar | `createPedido` resolve caixa (não só agregado) na baixa de chapa cheia |
| `app/pedidos/novo/page.tsx` | modificar | remove `isChapaInteira` hardcoded; adiciona seletor de caixa quando ambíguo; bloqueia salvar se saldo insuficiente |
| `services/lotes.service.ts` | modificar | nova `getTodasCaixas()` (sem os filtros de `getLotesUtilizaveis`) |
| `app/estoque/caixas/page.tsx` | criar | lista de caixas com filtro por produto/status |
| `app/estoque/page.tsx` | modificar | link "Ver Caixas" na topbar |

---

### Task 1: Migração SQL + tipo `LoteEstoque`

**Files:**
- Create: `sql/lotes-estoque-caixa.sql`
- Modify: `types/index.ts:1412-1433` (`LoteEstoque`)

**Interfaces:**
- Produces: `LoteEstoque.codigo: string`, `LoteEstoque.qr_token: string` — consumidos por todas as tasks seguintes.

- [ ] **Step 1: Criar a migração**

```sql
-- ============================================================
-- lotes_estoque ganha 2 colunas pra virar "caixa física"
-- rastreável: código legível (derivado do id, nunca digitado
-- manualmente) e token opaco pro QR da etiqueta (sub-projeto 3).
-- Execute no Supabase SQL Editor.
-- ============================================================

ALTER TABLE lotes_estoque
  ADD COLUMN IF NOT EXISTS codigo text GENERATED ALWAYS AS ('CX-' || lpad(id::text, 6, '0')) STORED,
  ADD COLUMN IF NOT EXISTS qr_token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid();

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, codigo, qr_token FROM lotes_estoque ORDER BY id LIMIT 10;
```

- [ ] **Step 2: Atualizar `LoteEstoque` em `types/index.ts`**

Em `types/index.ts:1412-1433`, acrescentar as 2 propriedades (depois de `created_at`, antes de `produtos?`):

```ts
export interface LoteEstoque {
  id: number;
  produto_id: number;
  origem_tipo: string;
  origem_id: string | null;
  origem_mercadoria: '0' | '2' | null;
  chapa_largura_mm: number | null;
  chapa_altura_mm: number | null;
  pode_rotacionar: boolean;
  chapas_entrada: number;
  chapas_saldo: number;
  m2_por_chapa: number | null;
  m2_saldo: number;
  custo_m2: number | null;
  dt_entrada: string;
  dt_entrada_estimada: boolean;
  estoque_minimo_chapas: number;
  ativo: boolean;
  dimensao_confirmada: boolean;
  created_at: string;
  codigo: string;
  qr_token: string;
  produtos?: { nome: string } | null;
}
```

- [ ] **Step 3: Avisar o usuário pra rodar a migração**

Este step não tem comando — só um lembrete: a migração do Step 1 precisa ser colada e executada manualmente no Supabase SQL Editor antes de qualquer task seguinte que leia `codigo`/`qr_token` funcionar contra o banco real. `tsc`/`vitest` das próximas tasks passam mesmo sem a migração rodada (são só tipos/lógica pura), mas a rota da Task 3 e a UI da Task 6/7 precisam da coluna existir de verdade pra funcionar em runtime.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: limpo (nenhum consumidor de `LoteEstoque` quebra por 2 campos novos opcionais-em-uso-real — TypeScript não reclama de propriedade adicional em objetos vindos de `as LoteEstoque[]`).

- [ ] **Step 5: Commit**

```bash
git add sql/lotes-estoque-caixa.sql types/index.ts
git commit -m "feat(estoque): lotes_estoque ganha codigo e qr_token (caixa fisica rastreavel)"
```

---

### Task 2: Lógica pura de resolução de caixa (TDD)

**Files:**
- Create: `lib/caixaEstoque.ts`
- Test: `lib/caixaEstoque.test.ts`

**Interfaces:**
- Consumes: `LoteEstoque` (Task 1), `isChapaInteira`/`DimensaoChapa` de `lib/chapas.ts` (já existe).
- Produces: `statusCaixa(chapasSaldo, chapasEntrada): "fechada" | "aberta" | "esgotada"`; `filtrarCaixasCandidatas(lotes, produtoId, largura, altura): LoteEstoque[]`; `resolverCaixaParaVenda(candidatas, caixaEscolhidaId, quantidadeNecessaria): ResolucaoCaixa`; tipo `ResolucaoCaixa`. Consumidos por `services/pedidos.service.ts` (Task 4) e `app/pedidos/novo/page.tsx` (Task 5).

- [ ] **Step 1: Escrever os testes (vão falhar — arquivo não existe ainda)**

Criar `lib/caixaEstoque.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { statusCaixa, filtrarCaixasCandidatas, resolverCaixaParaVenda } from "@/lib/caixaEstoque";
import type { LoteEstoque } from "@/types";

function loteFake(overrides: Partial<LoteEstoque>): LoteEstoque {
  return {
    id: 1, produto_id: 10, origem_tipo: "compra", origem_id: null, origem_mercadoria: null,
    chapa_largura_mm: 3300, chapa_altura_mm: 2250, pode_rotacionar: true,
    chapas_entrada: 18, chapas_saldo: 18, m2_por_chapa: 7.425, m2_saldo: 133.65,
    custo_m2: null, dt_entrada: "2026-07-21", dt_entrada_estimada: false,
    estoque_minimo_chapas: 0, ativo: true, dimensao_confirmada: true,
    created_at: "2026-07-21T00:00:00Z", codigo: "CX-000001", qr_token: "aaa",
    ...overrides,
  };
}

describe("statusCaixa", () => {
  it("fechada quando saldo == entrada", () => {
    expect(statusCaixa(18, 18)).toBe("fechada");
  });
  it("aberta quando 0 < saldo < entrada", () => {
    expect(statusCaixa(11, 18)).toBe("aberta");
  });
  it("esgotada quando saldo == 0", () => {
    expect(statusCaixa(0, 18)).toBe("esgotada");
  });
  it("esgotada quando saldo negativo (não deveria ocorrer, mas não quebra)", () => {
    expect(statusCaixa(-1, 18)).toBe("esgotada");
  });
});

describe("filtrarCaixasCandidatas", () => {
  const lotes = [
    loteFake({ id: 1, produto_id: 10, chapa_largura_mm: 3300, chapa_altura_mm: 2250 }),
    loteFake({ id: 2, produto_id: 10, chapa_largura_mm: 3660, chapa_altura_mm: 2140 }),
    loteFake({ id: 3, produto_id: 99, chapa_largura_mm: 3300, chapa_altura_mm: 2250 }),
  ];
  it("filtra por produto e medida (com tolerância de rotação)", () => {
    const r = filtrarCaixasCandidatas(lotes, 10, 2250, 3300);
    expect(r.map(l => l.id)).toEqual([1]);
  });
  it("retorna vazio se produtoId for null", () => {
    expect(filtrarCaixasCandidatas(lotes, null, 3300, 2250)).toEqual([]);
  });
  it("retorna vazio se largura/altura forem 0", () => {
    expect(filtrarCaixasCandidatas(lotes, 10, 0, 0)).toEqual([]);
  });
  it("ignora lotes sem dimensão confirmada (chapa_largura_mm null)", () => {
    const comNull = [...lotes, loteFake({ id: 4, produto_id: 10, chapa_largura_mm: null, chapa_altura_mm: null })];
    const r = filtrarCaixasCandidatas(comNull, 10, 3300, 2250);
    expect(r.map(l => l.id)).toEqual([1]);
  });
});

describe("resolverCaixaParaVenda", () => {
  it("nenhuma candidata", () => {
    expect(resolverCaixaParaVenda([], undefined, 5)).toEqual({ ok: false, motivo: "nenhuma_candidata" });
  });
  it("1 candidata com saldo suficiente — auto-resolve sem precisar de escolha", () => {
    const c = loteFake({ id: 7, chapas_saldo: 10 });
    expect(resolverCaixaParaVenda([c], undefined, 5)).toEqual({ ok: true, caixaId: 7 });
  });
  it("1 candidata com saldo insuficiente", () => {
    const c = loteFake({ id: 7, chapas_saldo: 3 });
    expect(resolverCaixaParaVenda([c], undefined, 5)).toEqual({ ok: false, motivo: "saldo_insuficiente", caixaId: 7, saldo: 3, necessario: 5 });
  });
  it("múltiplas candidatas sem escolha — bloqueia pedindo escolha", () => {
    const candidatas = [loteFake({ id: 1 }), loteFake({ id: 2 })];
    expect(resolverCaixaParaVenda(candidatas, undefined, 5)).toEqual({ ok: false, motivo: "multiplas_candidatas", candidatas });
  });
  it("múltiplas candidatas com escolha válida e saldo suficiente", () => {
    const candidatas = [loteFake({ id: 1, chapas_saldo: 10 }), loteFake({ id: 2, chapas_saldo: 20 })];
    expect(resolverCaixaParaVenda(candidatas, 2, 15)).toEqual({ ok: true, caixaId: 2 });
  });
  it("múltiplas candidatas com escolha inválida (id não está entre as candidatas) — trata como sem escolha", () => {
    const candidatas = [loteFake({ id: 1 }), loteFake({ id: 2 })];
    expect(resolverCaixaParaVenda(candidatas, 999, 5)).toEqual({ ok: false, motivo: "multiplas_candidatas", candidatas });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/caixaEstoque.test.ts`
Expected: FAIL — `Cannot find module '@/lib/caixaEstoque'`.

- [ ] **Step 3: Implementar `lib/caixaEstoque.ts`**

```ts
import { isChapaInteira } from "@/lib/chapas";
import type { LoteEstoque } from "@/types";

/** Deriva o status da caixa a partir do saldo — nunca é uma coluna própria. */
export function statusCaixa(chapasSaldo: number, chapasEntrada: number): "fechada" | "aberta" | "esgotada" {
  if (chapasSaldo <= 0) return "esgotada";
  if (chapasSaldo === chapasEntrada) return "fechada";
  return "aberta";
}

/** Caixas do produto+medida informados, entre as já confirmadas/ativas (lotes recebidos de getLotesUtilizaveis). */
export function filtrarCaixasCandidatas(
  lotes: LoteEstoque[],
  produtoId: number | null,
  largura: number,
  altura: number,
): LoteEstoque[] {
  if (!produtoId || largura <= 0 || altura <= 0) return [];
  return lotes.filter(l =>
    l.produto_id === produtoId &&
    l.chapa_largura_mm != null && l.chapa_altura_mm != null &&
    isChapaInteira(largura, altura, [{ w: l.chapa_largura_mm, h: l.chapa_altura_mm }])
  );
}

export type ResolucaoCaixa =
  | { ok: true; caixaId: number }
  | { ok: false; motivo: "nenhuma_candidata" }
  | { ok: false; motivo: "multiplas_candidatas"; candidatas: LoteEstoque[] }
  | { ok: false; motivo: "saldo_insuficiente"; caixaId: number; saldo: number; necessario: number };

/**
 * Decide de qual caixa debitar. 1 candidata resolve sozinha; 2+ exigem
 * `caixaEscolhidaId` (decisão do usuário, nunca automática); saldo menor
 * que o necessário bloqueia (decisão do usuário: sem cascata automática
 * entre caixas — quem chama deve orientar a dividir a operação).
 */
export function resolverCaixaParaVenda(
  candidatas: LoteEstoque[],
  caixaEscolhidaId: number | undefined,
  quantidadeNecessaria: number,
): ResolucaoCaixa {
  if (candidatas.length === 0) return { ok: false, motivo: "nenhuma_candidata" };

  let caixa: LoteEstoque | undefined;
  if (candidatas.length === 1) {
    caixa = candidatas[0];
  } else {
    caixa = caixaEscolhidaId !== undefined ? candidatas.find(c => c.id === caixaEscolhidaId) : undefined;
    if (!caixa) return { ok: false, motivo: "multiplas_candidatas", candidatas };
  }

  if (caixa.chapas_saldo < quantidadeNecessaria) {
    return { ok: false, motivo: "saldo_insuficiente", caixaId: caixa.id, saldo: caixa.chapas_saldo, necessario: quantidadeNecessaria };
  }
  return { ok: true, caixaId: caixa.id };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/caixaEstoque.test.ts`
Expected: PASS — 13 testes.

- [ ] **Step 5: Rodar a suite inteira**

Run: `npx vitest run`
Expected: 215 testes passando (202 + 13 novos).

- [ ] **Step 6: Commit**

```bash
git add lib/caixaEstoque.ts lib/caixaEstoque.test.ts
git commit -m "feat(estoque): logica pura de resolucao de caixa (status, candidatas, escolha)"
```

---

### Task 3: Rota pública do QR de caixa

**Files:**
- Create: `app/api/cx/[token]/route.ts`

**Interfaces:**
- Consumes: `statusCaixa` (Task 2).
- Produces: nenhuma (endpoint terminal).

- [ ] **Step 1: Criar a rota**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { statusCaixa } from "@/lib/caixaEstoque";

// Rota pública (sem auth) — alvo do QR impresso na etiqueta de caixa
// (sub-projeto 3). Mesmo padrão do QR de romaneio de pedido
// (app/api/r/[token]/route.ts): resolve o destino em tempo de leitura,
// nunca no momento da impressão — se a caixa esvaziar depois de
// impressa, quem escanear vê o saldo atual, não o valor antigo.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: caixa } = await sb
    .from("lotes_estoque")
    .select("codigo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, dt_entrada, dt_entrada_estimada, ativo, produtos ( nome )")
    .eq("qr_token", token)
    .maybeSingle();

  if (!caixa || !caixa.ativo) {
    return new NextResponse("Caixa não encontrada ou inativa.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const status = statusCaixa(caixa.chapas_saldo, caixa.chapas_entrada);
  const produtoNome = (caixa.produtos as unknown as { nome: string } | null)?.nome ?? "—";
  const dataEntrada = caixa.dt_entrada_estimada ? "—" : caixa.dt_entrada;
  const corStatus = status === "fechada" ? "#15803d;background:#dcfce7" : status === "aberta" ? "#b45309;background:#fef3c7" : "#b91c1c;background:#fee2e2";

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${caixa.codigo}</title>
<style>
  body { font-family: Arial, sans-serif; background: #f4f7fa; color: #1e293b; padding: 24px; margin: 0; }
  .card { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(15,23,42,.08); }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .status { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; margin-bottom: 16px; color: ${corStatus}; }
  .linha { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eef2f7; font-size: 14px; }
  .linha span:first-child { color: #64748b; }
  .linha span:last-child { font-weight: 700; }
</style></head>
<body>
  <div class="card">
    <h1>${caixa.codigo}</h1>
    <span class="status">${status.toUpperCase()}</span>
    <div class="linha"><span>Produto</span><span>${produtoNome}</span></div>
    <div class="linha"><span>Medida</span><span>${caixa.chapa_largura_mm ?? "—"} × ${caixa.chapa_altura_mm ?? "—"} mm</span></div>
    <div class="linha"><span>Chapas</span><span>${caixa.chapas_saldo} / ${caixa.chapas_entrada}</span></div>
    <div class="linha"><span>m² saldo</span><span>${Number(caixa.m2_saldo).toFixed(2)} m²</span></div>
    <div class="linha"><span>Data de entrada</span><span>${dataEntrada}</span></div>
  </div>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Rodar testes**

Run: `npx vitest run`
Expected: 215 testes passando (rota nova não tem teste unitário — igual ao padrão de `app/api/r/[token]/route.ts`, que também não tem).

- [ ] **Step 4: Commit**

```bash
git add app/api/cx/\[token\]/route.ts
git commit -m "feat(estoque): rota publica do QR de caixa (app/api/cx/[token])"
```

---

### Task 4: `createPedido` resolve caixa na venda direta de chapa cheia

**Files:**
- Modify: `services/pedidos.service.ts:1-10` (imports), `:130-194` (`createPedido`)

**Interfaces:**
- Consumes: `filtrarCaixasCandidatas`, `resolverCaixaParaVenda` (Task 2).
- Produces: `createPedido(pedido, itens, caixaEscolhidaPorItem?)` — 3º parâmetro novo, opcional, `Map<number, number>` (índice do item no array `itens` → id da caixa escolhida). Consumido por `app/pedidos/novo/page.tsx` (Task 5).

- [ ] **Step 1: Trocar o import de `isChapaInteira` pelos helpers de caixa**

Em `services/pedidos.service.ts:5`, trocar:

```ts
import { isChapaInteira } from '@/lib/chapas';
```

por:

```ts
import { filtrarCaixasCandidatas, resolverCaixaParaVenda } from '@/lib/caixaEstoque';
```

- [ ] **Step 2: Adicionar o parâmetro novo à assinatura de `createPedido`**

Em `services/pedidos.service.ts:130`, trocar:

```ts
export async function createPedido(pedido: PedidoInsert, itens: ItemPedidoInsert[] = []) {
```

por:

```ts
export async function createPedido(
  pedido: PedidoInsert,
  itens: ItemPedidoInsert[] = [],
  caixaEscolhidaPorItem: Map<number, number> = new Map(),
) {
```

- [ ] **Step 3: Substituir o bloco de baixa de chapa cheia (linhas 158-190)**

Trocar o bloco inteiro:

```ts
    // Dimensões confirmadas por produto (lotes_estoque) — busca uma vez pra
    // todos os itens do pedido, não por item (evita N+1).
    const lotes = await getLotesUtilizaveis();
    const chapasPorProduto = new Map<number, { w: number; h: number }[]>();
    lotes.forEach(l => {
      if (!l.chapa_largura_mm || !l.chapa_altura_mm) return;
      const arr = chapasPorProduto.get(l.produto_id) ?? [];
      arr.push({ w: l.chapa_largura_mm, h: l.chapa_altura_mm });
      chapasPorProduto.set(l.produto_id, arr);
    });

    for (const item of (itensInseridos ?? []) as ItemPedido[]) {
      if (item.vidro_cliente) {
        const res = await registrarMovimentoCliente({
          pedido_id: (data as Pedido).id, cliente_id: pedido.cliente_id, item_pedido_id: item.id,
          tipo: 'entrada', descricao: item.produto_nome,
          largura: item.largura, altura: item.altura, quantidade: item.quantidade,
          nc_id: null, obs: null,
        });
        if (!res.ok && !res.jaExistia) console.error('createPedido entrada vidro cliente:', res.motivo);
        continue;
      }
      const chapasDoProduto = item.produto_id ? (chapasPorProduto.get(item.produto_id) ?? []) : [];
      if (!isChapaInteira(item.largura, item.altura, chapasDoProduto)) continue;
      const m2 = (item.largura * item.altura / 1e6) * item.quantidade;
      const res = await registrarMovimentacao({
        produtoId: item.produto_id ?? undefined,
        produtoNome: item.produto_nome,
        tipo: 'saida_producao', origemTipo: 'pedido_chapa', origemId: String(item.id),
        chapas: -item.quantidade, m2: -parseFloat(m2.toFixed(4)),
      });
      if (!res.ok && !res.jaExistia) console.error('createPedido baixa chapa inteira:', res.motivo);
    }
  }
```

por:

```ts
    // Lotes ativos/confirmados de todos os produtos — busca uma vez pra
    // todos os itens do pedido, não por item (evita N+1).
    const lotes = await getLotesUtilizaveis();

    const itensParaBaixa = (itensInseridos ?? []) as ItemPedido[];
    for (let i = 0; i < itensParaBaixa.length; i++) {
      const item = itensParaBaixa[i];
      if (item.vidro_cliente) {
        const res = await registrarMovimentoCliente({
          pedido_id: (data as Pedido).id, cliente_id: pedido.cliente_id, item_pedido_id: item.id,
          tipo: 'entrada', descricao: item.produto_nome,
          largura: item.largura, altura: item.altura, quantidade: item.quantidade,
          nc_id: null, obs: null,
        });
        if (!res.ok && !res.jaExistia) console.error('createPedido entrada vidro cliente:', res.motivo);
        continue;
      }

      const candidatas = filtrarCaixasCandidatas(lotes, item.produto_id, item.largura, item.altura);
      if (candidatas.length === 0) continue; // não é chapa inteira — nada a debitar de caixa

      const resolucao = resolverCaixaParaVenda(candidatas, caixaEscolhidaPorItem.get(i), item.quantidade);
      if (!resolucao.ok) {
        // Já validado no preflight de app/pedidos/novo/page.tsx antes do
        // submit — só chega aqui se o estoque mudou entre a validação e o
        // envio (corrida rara). Não bloqueia o pedido já criado: loga e
        // segue, mesmo comportamento de erro de movimentação já existente
        // logo abaixo.
        console.error('createPedido resolução de caixa falhou:', resolucao);
        continue;
      }

      const m2 = (item.largura * item.altura / 1e6) * item.quantidade;
      const res = await registrarMovimentacao({
        produtoId: item.produto_id ?? undefined,
        produtoNome: item.produto_nome,
        loteId: resolucao.caixaId,
        tipo: 'saida_producao', origemTipo: 'pedido_chapa', origemId: String(item.id),
        chapas: -item.quantidade, m2: -parseFloat(m2.toFixed(4)),
      });
      if (!res.ok && !res.jaExistia) console.error('createPedido baixa chapa inteira:', res.motivo);
    }
  }
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: limpo. Se `getLotesUtilizaveis` não estiver mais importado noutro lugar do arquivo por engano, conferir que o import de `services/lotes.service.ts` na linha 9 continua presente (ele já existia antes desta task e continua sendo usado).

- [ ] **Step 5: Rodar testes**

Run: `npx vitest run`
Expected: 215 testes passando (mudança sem teste dedicado neste arquivo — `pedidos.service.ts` não tem suite própria hoje; a lógica nova que importa está coberta em `lib/caixaEstoque.test.ts`, Task 2).

- [ ] **Step 6: Commit**

```bash
git add services/pedidos.service.ts
git commit -m "fix(estoque): venda direta de chapa cheia resolve e debita a caixa certa, nao so o agregado"
```

---

### Task 5: `app/pedidos/novo/page.tsx` — corrige detecção + seletor de caixa

**Files:**
- Modify: `app/pedidos/novo/page.tsx:6-20` (imports), `:58-68` (remove hardcoded), `:120-165` (fetch de lotes), `:417-485` (`salvar`), `:745-835` (linha do item — seletor de caixa)

**Interfaces:**
- Consumes: `filtrarCaixasCandidatas`, `resolverCaixaParaVenda`, `ResolucaoCaixa` (Task 2); `isChapaInteira` (`lib/chapas.ts`, já existe); `createPedido` com o novo 3º parâmetro (Task 4).

- [ ] **Step 1: Trocar imports**

Em `app/pedidos/novo/page.tsx:1-20`, adicionar (junto aos imports existentes):

```tsx
import { isChapaInteira } from "@/lib/chapas";
import { getLotesUtilizaveis } from "@/services/lotes.service";
import { filtrarCaixasCandidatas, resolverCaixaParaVenda, type ResolucaoCaixa } from "@/lib/caixaEstoque";
import type { LoteEstoque } from "@/types";
```

(o `import type { ... } from "@/types"` já existe na linha 20 — acrescentar `LoteEstoque` na lista existente em vez de duplicar o import.)

- [ ] **Step 2: Remover `CHAPAS_DIMS`/`isChapaInteira` hardcoded**

Em `app/pedidos/novo/page.tsx:58-68`, deletar por completo:

```tsx
const CHAPAS_DIMS = [
  { w: 3300, h: 2250 }, { w: 2250, h: 3300 },
  { w: 3660, h: 2140 }, { w: 2140, h: 3660 },
  { w: 2150, h: 3660 }, { w: 3660, h: 2150 },
];

function isChapaInteira(largura: number, altura: number): boolean {
  return CHAPAS_DIMS.some(c =>
    Math.abs(largura - c.w) < 50 && Math.abs(altura - c.h) < 50
  );
}
```

(a função `isChapaInteira` importada no Step 1 tem assinatura diferente — recebe uma lista de dimensões como 3º argumento — os usos serão ajustados nos steps seguintes.)

- [ ] **Step 3: Buscar lotes no `load()` e guardar em state**

Em `app/pedidos/novo/page.tsx`, adicionar o state (junto aos outros `useState` da linha ~140):

```tsx
const [lotesEstoque, setLotesEstoque] = useState<LoteEstoque[]>([]);
const [caixaEscolhida, setCaixaEscolhida] = useState<Record<number, number>>({});
```

Em `load()` (linha 148-157), trocar:

```tsx
    const [clis, prods, tabs, itens, pid, vends, formasPg] = await Promise.all([
      getClientes(true),
      supabase.from("produtos").select("*").eq("ativo", true).then(r => r.data as Produto[]),
      supabase.from("tabelas_preco").select("*").eq("ativo", true).then(r => r.data as TabelaPreco[]),
      supabase.from("tabela_preco_itens").select("*").then(r => r.data as TabelaPrecoItem[] || []),
      getProximoIdPedido(),
      supabase.from("vendedores").select("id, nome, comissao_pct").eq("ativo", true).order("nome").then(r => r.data ?? []),
      getFormasPagamento(true),
    ]);
```

por:

```tsx
    const [clis, prods, tabs, itens, pid, vends, formasPg, lotes] = await Promise.all([
      getClientes(true),
      supabase.from("produtos").select("*").eq("ativo", true).then(r => r.data as Produto[]),
      supabase.from("tabelas_preco").select("*").eq("ativo", true).then(r => r.data as TabelaPreco[]),
      supabase.from("tabela_preco_itens").select("*").then(r => r.data as TabelaPrecoItem[] || []),
      getProximoIdPedido(),
      supabase.from("vendedores").select("id, nome, comissao_pct").eq("ativo", true).order("nome").then(r => r.data ?? []),
      getFormasPagamento(true),
      getLotesUtilizaveis(),
    ]);
```

E logo abaixo, junto aos outros `set...` (linha 158-165), acrescentar:

```tsx
    setLotesEstoque(lotes);
```

- [ ] **Step 4: Helper de resolução por item (evita duplicar a lógica entre render e `salvar`)**

Logo depois da função `redistribuirParcelas` (linha ~117, antes da declaração do componente `export default function`), adicionar:

```tsx
function resolverCaixaDoItem(
  lotesEstoque: LoteEstoque[],
  caixaEscolhida: Record<number, number>,
  indice: number,
  produtoId: number | null,
  largura: number,
  altura: number,
  quantidade: number,
): ResolucaoCaixa | null {
  const candidatas = filtrarCaixasCandidatas(lotesEstoque, produtoId, largura, altura);
  if (candidatas.length === 0) return null;
  return resolverCaixaParaVenda(candidatas, caixaEscolhida[indice], quantidade);
}
```

(função de módulo, fora do componente — recebe tudo por parâmetro pra não depender de closure, mais fácil de raciocinar e reaproveitar dentro do componente sem duplicar a filtragem.)

- [ ] **Step 5: Corrigir `todosChapa` em `salvar()` pra usar a detecção dinâmica**

Em `app/pedidos/novo/page.tsx:424`, trocar:

```tsx
      const todosChapa = itens.every(i => isChapaInteira(i.largura, i.altura));
```

por:

```tsx
      const todosChapa = itens.every(i => {
        if (!i.produto_id) return false;
        const dims = lotesEstoque
          .filter(l => l.produto_id === i.produto_id && l.chapa_largura_mm != null && l.chapa_altura_mm != null)
          .map(l => ({ w: l.chapa_largura_mm!, h: l.chapa_altura_mm! }));
        return isChapaInteira(i.largura, i.altura, dims);
      });
```

- [ ] **Step 6: Bloquear `salvar()` antes de inserir o pedido se alguma caixa não resolver**

Em `app/pedidos/novo/page.tsx:417-422` (início de `salvar()`, depois das validações já existentes de cliente/dimensões/parcelas), adicionar mais uma validação, e montar o `Map` de caixas escolhidas a passar pra `createPedido`:

```tsx
  async function salvar() {
    if (!clienteId) { toast("Selecione um cliente", "err"); return; }
    if (itens.some(i => i.largura === 0 || i.altura === 0)) { toast("Preencha as dimensões de todos os itens", "err"); return; }
    if (!parcelasOk) { toast(`Soma das parcelas (${formatBRL(somaParcelas)}) difere do total (${formatBRL(valorComIpiCalc)})`, "err"); return; }

    const caixaEscolhidaPorItem = new Map<number, number>();
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      if (item.vidro_cliente) continue;
      const resolucao = resolverCaixaDoItem(lotesEstoque, caixaEscolhida, i, item.produto_id, item.largura, item.altura, item.quantidade);
      if (!resolucao) continue; // não é chapa inteira — sem caixa envolvida
      if (!resolucao.ok) {
        if (resolucao.motivo === "multiplas_candidatas") {
          toast(`Item ${i + 1}: escolha de qual caixa retirar antes de salvar`, "err");
        } else if (resolucao.motivo === "saldo_insuficiente") {
          toast(`Item ${i + 1}: a caixa escolhida só tem ${resolucao.saldo} chapas, o item precisa de ${resolucao.necessario} — divida em mais de um item ou escolha outra caixa`, "err");
        }
        return;
      }
      caixaEscolhidaPorItem.set(i, resolucao.caixaId);
    }

    setSalvando(true);
```

- [ ] **Step 7: Passar o `Map` pro `createPedido`**

Em `app/pedidos/novo/page.tsx:460`, trocar:

```tsx
      const result = await createPedido(pedido, itensInsert);
```

por:

```tsx
      const result = await createPedido(pedido, itensInsert, caixaEscolhidaPorItem);
```

- [ ] **Step 8: Seletor de caixa e aviso de saldo insuficiente na linha do item**

Em `app/pedidos/novo/page.tsx`, dentro do `itens.map((item, i) => { ... })` (linha 711), logo depois da declaração de `avisoMarjem` (linha ~743, antes do `return (`), adicionar:

```tsx
            const resolucaoCaixa = resolverCaixaDoItem(lotesEstoque, caixaEscolhida, i, item.produto_id, item.largura, item.altura, item.quantidade);

            const seletorCaixa = resolucaoCaixa && !resolucaoCaixa.ok && resolucaoCaixa.motivo === "multiplas_candidatas" ? (
              <div style={{ marginTop: "4px", paddingLeft: "2px" }}>
                <select
                  className="fc"
                  style={{ fontSize: "11px", height: "24px", width: "auto" }}
                  value={caixaEscolhida[i] ?? ""}
                  onChange={e => setCaixaEscolhida(prev => ({ ...prev, [i]: Number(e.target.value) }))}
                >
                  <option value="" disabled>Escolha a caixa ({resolucaoCaixa.candidatas.length} disponíveis)</option>
                  {resolucaoCaixa.candidatas.map(c => (
                    <option key={c.id} value={c.id}>{c.codigo} · saldo {c.chapas_saldo} chapas</option>
                  ))}
                </select>
              </div>
            ) : null;

            const avisoSaldoCaixa = resolucaoCaixa && !resolucaoCaixa.ok && resolucaoCaixa.motivo === "saldo_insuficiente" ? (
              <div style={{ fontSize: "11px", color: "var(--err)", fontFamily: "'DM Mono',monospace", padding: "3px 4px", marginTop: "2px" }}>
                ⚠ Caixa selecionada só tem {resolucaoCaixa.saldo} chapas — item precisa de {resolucaoCaixa.necessario}
              </div>
            ) : null;
```

E, no JSX do branch `m2` (não-`ml`, linha ~798-834), logo depois de `{avisoMarjem}` (linha 824), adicionar:

```tsx
                    {avisoMarjem}
                    {seletorCaixa}
                    {avisoSaldoCaixa}
```

(o branch `ml` — linha 785 — não ganha o seletor: venda de chapa cheia usa o modo m², consistente com o resto da lógica de `isChapaInteira` já existente na tela.)

- [ ] **Step 9: Verificar**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 10: Rodar testes**

Run: `npx vitest run`
Expected: 215 testes passando (mudança de UI sem teste dedicado, mesmo padrão de outras telas do app).

- [ ] **Step 11: `next build`**

Run: `npx next build`
Expected: compila sem erro, rota `/pedidos/novo` lista normalmente no output.

- [ ] **Step 12: Commit**

```bash
git add app/pedidos/novo/page.tsx
git commit -m "fix(pedidos): corrige isChapaInteira desatualizado e adiciona escolha de caixa na venda direta"
```

---

### Task 6: Lista de caixas em `/estoque/caixas`

**Files:**
- Modify: `services/lotes.service.ts` (nova `getTodasCaixas`)
- Create: `app/estoque/caixas/page.tsx`

**Interfaces:**
- Consumes: `statusCaixa` (Task 2), `LoteEstoque` (Task 1).
- Produces: `getTodasCaixas(): Promise<LoteEstoque[]>`.

- [ ] **Step 1: Adicionar `getTodasCaixas` em `services/lotes.service.ts`**

No fim do arquivo (depois de `calcularCustoPepsProduto`, linha 133):

```ts
// ─── LISTA DE CAIXAS (Estoque > Caixas) ──────────────────────
//
// Diferente de getLotesUtilizaveis (que só traz ativo+dimensão
// confirmada+saldo>0, pro Otimizador/venda direta), esta traz TODAS as
// linhas — inclusive esgotadas e com dimensão pendente — pra tela de
// gestão de caixas poder mostrar/filtrar por qualquer status.
export async function getTodasCaixas(): Promise<LoteEstoque[]> {
  const { data, error } = await supabase
    .from('lotes_estoque')
    .select('*, produtos(nome)')
    .order('produto_id', { ascending: true })
    .order('dt_entrada', { ascending: true });
  if (error) { console.error('getTodasCaixas:', error); return []; }
  return data as LoteEstoque[];
}
```

- [ ] **Step 2: Criar a página `app/estoque/caixas/page.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getTodasCaixas } from "@/services/lotes.service";
import { statusCaixa } from "@/lib/caixaEstoque";
import { formatDate, formatM2 } from "@/lib/formatters";
import type { LoteEstoque } from "@/types";

type FiltroStatus = "todas" | "fechada" | "aberta" | "esgotada";

const CHIP_STATUS: Record<"fechada" | "aberta" | "esgotada", string> = {
  fechada:  "chip cg",
  aberta:   "chip cy",
  esgotada: "chip cr",
};

export default function CaixasEstoquePage() {
  const [caixas, setCaixas]   = useState<LoteEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProduto, setFiltroProduto] = useState<number | "todas">("todas");
  const [filtroStatus, setFiltroStatus]   = useState<FiltroStatus>("todas");

  useEffect(() => {
    getTodasCaixas().then(c => { setCaixas(c); setLoading(false); });
  }, []);

  const produtosOpts = useMemo(() => {
    const porId = new Map<number, string>();
    caixas.forEach(c => porId.set(c.produto_id, c.produtos?.nome ?? `#${c.produto_id}`));
    return Array.from(porId.entries());
  }, [caixas]);

  const caixasFiltradas = caixas.filter(c => {
    if (filtroProduto !== "todas" && c.produto_id !== filtroProduto) return false;
    if (filtroStatus !== "todas" && statusCaixa(c.chapas_saldo, c.chapas_entrada) !== filtroStatus) return false;
    return true;
  });

  if (loading) return <AppLayout><div className="con">Carregando…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="tb">
        <div>
          <div className="tb-title">Estoque · Caixas</div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>
            {caixasFiltradas.length} caixa{caixasFiltradas.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="fc sm" value={filtroProduto} onChange={e => setFiltroProduto(e.target.value === "todas" ? "todas" : Number(e.target.value))}>
            <option value="todas">Todos os produtos</option>
            {produtosOpts.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <select className="fc sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as FiltroStatus)}>
            <option value="todas">Todos os status</option>
            <option value="fechada">Fechada</option>
            <option value="aberta">Aberta</option>
            <option value="esgotada">Esgotada</option>
          </select>
        </div>
      </div>

      <div className="con">
        <div className="tw" style={{ maxHeight: "calc(100vh - 160px)" }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th>Medida</th>
                <th>Status</th>
                <th>Chapas (saldo/entrada)</th>
                <th>m² saldo</th>
                <th>Data de entrada</th>
              </tr>
            </thead>
            <tbody>
              {caixasFiltradas.map(c => {
                const status = statusCaixa(c.chapas_saldo, c.chapas_entrada);
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{c.codigo}</td>
                    <td>{c.produtos?.nome ?? `#${c.produto_id}`}</td>
                    <td className="mono">{c.chapa_largura_mm ?? "—"} × {c.chapa_altura_mm ?? "—"} mm</td>
                    <td><span className={CHIP_STATUS[status]}>{status}</span></td>
                    <td className="mono">{c.chapas_saldo} / {c.chapas_entrada}</td>
                    <td className="mono">{formatM2(Number(c.m2_saldo))}</td>
                    <td className="mono">{c.dt_entrada_estimada ? "estimada" : formatDate(c.dt_entrada)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
```

(sem checkbox de seleção nem botão de impressão nesta task — essa interação só faz sentido junto com a página de etiqueta que o sub-projeto 3 ainda vai criar; construir a seleção agora sem destino pra imprimir seria trabalho descartável.)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run`
Expected: 215 testes passando.

- [ ] **Step 5: `next build`**

Run: `npx next build`
Expected: compila, rota `/estoque/caixas` aparece no output.

- [ ] **Step 6: Commit**

```bash
git add services/lotes.service.ts app/estoque/caixas/page.tsx
git commit -m "feat(estoque): tela de lista de caixas com filtro por produto/status"
```

---

### Task 7: Link "Ver Caixas" na tela de Estoque

**Files:**
- Modify: `app/estoque/page.tsx:346-354` (topbar)

**Interfaces:**
- Consumes: rota `/estoque/caixas` (Task 6).

- [ ] **Step 1: Adicionar o link na topbar**

Em `app/estoque/page.tsx:346-354`, trocar:

```tsx
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn bg sm" onClick={handleSincronizarBaixas} disabled={sincronizando}
            title="A baixa por otimização já é automática. Use apenas se suspeitar de pendências — é idempotente.">
            {sincronizando ? "↺ Reconciliando…" : "↺ Reconciliar"}
          </button>
          <button className="btn bp sm" onClick={() => { if (showForm) { setShowForm(false); resetForm(); } else abrirNovo(); }}>
            {showForm ? "✕ Cancelar" : "+ Entrada de Estoque"}
          </button>
        </div>
```

por:

```tsx
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/estoque/caixas" className="btn bg sm" style={{ textDecoration: "none" }}>🗃 Ver Caixas</a>
          <button className="btn bg sm" onClick={handleSincronizarBaixas} disabled={sincronizando}
            title="A baixa por otimização já é automática. Use apenas se suspeitar de pendências — é idempotente.">
            {sincronizando ? "↺ Reconciliando…" : "↺ Reconciliar"}
          </button>
          <button className="btn bp sm" onClick={() => { if (showForm) { setShowForm(false); resetForm(); } else abrirNovo(); }}>
            {showForm ? "✕ Cancelar" : "+ Entrada de Estoque"}
          </button>
        </div>
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add app/estoque/page.tsx
git commit -m "feat(estoque): link Ver Caixas na topbar de Estoque"
```

---

### Task 8: Verificação final

**Files:** nenhum (task só de verificação).

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: limpo, zero erros.

- [ ] **Step 2: Suite de testes completa**

Run: `npx vitest run`
Expected: 215 testes passando (202 originais + 13 novos de `lib/caixaEstoque.test.ts`).

- [ ] **Step 3: Build de produção**

Run: `npx next build`
Expected: compila sem erro; `/estoque/caixas`, `/pedidos/novo` e `/api/cx/[token]` aparecem no output.

- [ ] **Step 4: Lembrete da migração pendente**

A migração `sql/lotes-estoque-caixa.sql` (Task 1) precisa ser executada manualmente pelo usuário no Supabase SQL Editor antes desta feature funcionar em produção — nenhuma task deste plano faz isso automaticamente. Sem ela: `codigo`/`qr_token` não existem de verdade no banco, a rota `/api/cx/[token]` sempre retorna 404, e a lista `/estoque/caixas` quebra ao tentar ler colunas inexistentes.

- [ ] **Step 5: Commit final (se sobrar algum ajuste)**

Se algum dos steps acima encontrar um problema, corrigir e commitar separadamente, descrevendo o que foi corrigido. Se tudo passar, nenhum commit adicional é necessário aqui.
