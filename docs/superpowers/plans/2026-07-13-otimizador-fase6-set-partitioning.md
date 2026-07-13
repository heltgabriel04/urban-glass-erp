# Otimizador Fase 6 — Set-Partitioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a última chapa do gap vs Corte Certo (34 → 33 no benchmark real P-058/P-059) adicionando uma fase de atribuição global ao motor: seleção de padrões de chapa de alto fill acumulados num pool durante as fases 1-5.

**Architecture:** Três componentes dentro de `lib/otimizador.ts`: (1) o pool de padrões já esboçado (hoje código morto) passa a ser alimentado por `avaliar()` — toda chapa ≥85% de fill vista em qualquer fase vira um padrão dedupado por composição canônica; (2) helpers puros exportados (`tipoCanonico`, `selecionarCobertura`, `materializarPadrao`) fazem a seleção gulosa randomizada e o re-mapeamento de índices — testáveis no vitest; (3) a fase 6 roda depois do GRASP (que encolhe de 95%→80% do budget), faz restarts de seleção até o deadline, fecha o resíduo com `hffGreedyBestSheet` e entrega o resultado a `avaliar()` — nunca piora o melhor das fases 1-5.

**Tech Stack:** TypeScript puro (sem dependência nova), Vitest (environment node, já configurado).

## Global Constraints

- Determinismo: seeds LCG fixas (mesmo padrão das fases 2 e 5), zero `Math.random`.
- A fase 6 só pode melhorar: o resultado entra pelo `avaliar()` existente, que mantém o melhor global.
- Trava de regressão: `lib/otimizador.bench.test.ts` mantém `expect(chapas.length).toBeLessThanOrEqual(34)`; só aperta pra `≤33` se o alvo for atingido.
- Todos os testes existentes (`npm test`, 111 testes) continuam passando — em particular a guilhotinabilidade de toda chapa no bench.
- `npx tsc --noEmit` antes de cada commit; commit direto em `main` com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; push ao final de cada task.

## File Structure

- Modify: `lib/otimizador.ts` — helpers exportados no nível do módulo + realocação do bloco do pool + fase 6 dentro de `empacotarTodas`.
- Create: `lib/otimizador.fase6.test.ts` — testes unitários dos helpers puros.
- (Task 3) Modify: `lib/otimizador.bench.test.ts` — só se o alvo de 33 for atingido.

---

### Task 1: Helpers puros de set-partitioning (TDD)

**Files:**
- Modify: `lib/otimizador.ts` (adicionar exports no final do arquivo, depois de `ehGuilhotinavel`, antes de `calcAproveitamento`)
- Test: `lib/otimizador.fase6.test.ts`

**Interfaces:**
- Consumes: tipos já exportados `PecaPlacada`, `EspacoLivre`.
- Produces (Task 2 consome): `tipoCanonico(l, a, podeRotacionar?): string`; `interface PadraoCobertura { counts: Map<string, number>; areaUtil: number }`; `selecionarCobertura<T extends PadraoCobertura>(padroes: T[], demanda: Map<string, number>, rnd?: (() => number) | null, pSkip?: number, pStop?: number): { selecionados: T[]; restante: Map<string, number> }`; `interface LayoutChapa { placed: PecaPlacada[]; freeRects: EspacoLivre[] }`; `materializarPadrao(layout: LayoutChapa, idxPorTipo: Map<string, number[]>, pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string; podeRotacionar?: boolean }>): LayoutChapa | null`.

- [ ] **Step 1: Escrever os testes (vão falhar)**

Criar `lib/otimizador.fase6.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tipoCanonico, selecionarCobertura, materializarPadrao, type PecaPlacada } from "./otimizador";

describe("tipoCanonico", () => {
  it("normaliza peças rotacionáveis pra min×max (intercambiáveis em qualquer orientação)", () => {
    expect(tipoCanonico(1200, 400)).toBe("400x1200");
    expect(tipoCanonico(400, 1200)).toBe("400x1200");
  });

  it("peça travada preserva a orientação natural e nunca casa com a versão livre", () => {
    expect(tipoCanonico(1200, 400, false)).toBe("1200x400|F");
    expect(tipoCanonico(400, 1200, false)).toBe("400x1200|F");
    expect(tipoCanonico(1200, 400, false)).not.toBe(tipoCanonico(400, 1200, false));
    expect(tipoCanonico(1200, 400, false)).not.toBe(tipoCanonico(1200, 400));
  });
});

describe("selecionarCobertura", () => {
  const A = { counts: new Map([["400x1200", 4]]), areaUtil: 100 };
  const B = { counts: new Map([["400x1200", 2], ["500x500", 1]]), areaUtil: 90 };

  it("guloso puro: aplica padrões na ordem enquanto couberem na demanda", () => {
    const demanda = new Map([["400x1200", 6], ["500x500", 1]]);
    const { selecionados, restante } = selecionarCobertura([A, B], demanda);
    expect(selecionados).toEqual([A, B]);
    expect(restante.size).toBe(0);
  });

  it("padrão que não cabe na demanda restante é pulado", () => {
    const demanda = new Map([["400x1200", 3]]);
    const { selecionados, restante } = selecionarCobertura([A, B], demanda);
    expect(selecionados).toEqual([]); // A precisa de 4; B precisa de 500x500 que não existe
    expect(restante.get("400x1200")).toBe(3);
  });

  it("repete o mesmo padrão enquanto a demanda comportar", () => {
    const demanda = new Map([["400x1200", 9]]);
    const { selecionados, restante } = selecionarCobertura([A, B], demanda);
    expect(selecionados).toEqual([A, A]);
    expect(restante.get("400x1200")).toBe(1);
  });

  it("não muta a demanda de entrada", () => {
    const demanda = new Map([["400x1200", 9]]);
    selecionarCobertura([A], demanda);
    expect(demanda.get("400x1200")).toBe(9);
  });
});

describe("materializarPadrao", () => {
  const pecas = [
    /* 0 */ { l: 400, a: 1200, prod: "Lam", pedidoId: "P-1" },
    /* 1 */ { l: 1200, a: 400, prod: "Lam", pedidoId: "P-2" },
    /* 2 */ { l: 400, a: 1200, prod: "Lam", pedidoId: "P-3" },
  ];
  // Layout com 2 slots do tipo 400x1200: um deitado (1200×400) e um em pé (400×1200)
  const layout = {
    placed: [
      { x: 0, y: 0, l: 1200, a: 400, idx: 99, prod: "Lam", rot: true },
      { x: 0, y: 404, l: 400, a: 1200, idx: 98, prod: "Lam", rot: false },
    ] as PecaPlacada[],
    freeRects: [{ x: 404, y: 404, l: 2896, a: 1846 }],
  };

  it("consome índices únicos e recalcula rot pela orientação natural da peça atribuída", () => {
    const idxPorTipo = new Map([["400x1200", [0, 1]]]);
    const r = materializarPadrao(layout, idxPorTipo, pecas);
    expect(r).not.toBeNull();
    const idxs = r!.placed.map(p => p.idx).sort();
    expect(idxs).toEqual([0, 1]);
    for (const p of r!.placed) {
      const nat = pecas[p.idx];
      const natural = p.rot ? { l: p.a, a: p.l } : { l: p.l, a: p.a };
      expect(natural.l).toBe(nat.l);
      expect(natural.a).toBe(nat.a);
      expect(p.pedidoId).toBe(nat.pedidoId);
    }
    expect(idxPorTipo.get("400x1200")).toEqual([]); // consumiu os dois
  });

  it("retorna null se faltar peça de algum tipo", () => {
    const idxPorTipo = new Map([["400x1200", [2]]]);
    expect(materializarPadrao(layout, idxPorTipo, pecas)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/otimizador.fase6.test.ts`
Expected: FAIL — `tipoCanonico`/`selecionarCobertura`/`materializarPadrao` não são exportados.

- [ ] **Step 3: Implementar os helpers**

Em `lib/otimizador.ts`, depois de `ehGuilhotinavel` (linha ~1331) e antes do comentário de `calcAproveitamento`, adicionar:

```ts
// ── Fase 6 — helpers puros de set-partitioning (exportados p/ teste) ──────────

/** Chave canônica de tipo de peça. Rotacionáveis de dimensões iguais são
 *  intercambiáveis em qualquer orientação → chave normalizada min×max. Peças
 *  travadas (vidro direcional) só ocupam slot na orientação natural → a chave
 *  preserva a ordem natural e ganha sufixo |F pra nunca casar com slot livre. */
export function tipoCanonico(l: number, a: number, podeRotacionar?: boolean): string {
  if (podeRotacionar === false) return `${l}x${a}|F`;
  return l <= a ? `${l}x${a}` : `${a}x${l}`;
}

export interface PadraoCobertura { counts: Map<string, number>; areaUtil: number; }

/** Seleção gulosa (opcionalmente randomizada) de padrões que cobrem a demanda:
 *  percorre `padroes` na ordem dada e aplica cada um enquanto couber na demanda
 *  restante. `rnd` injeta perturbação GRASP: pSkip = chance de pular o padrão,
 *  pStop = chance de parar de repeti-lo. Retorna a demanda não coberta. */
export function selecionarCobertura<T extends PadraoCobertura>(
  padroes: T[],
  demanda: Map<string, number>,
  rnd: (() => number) | null = null,
  pSkip = 0.15,
  pStop = 0.25
): { selecionados: T[]; restante: Map<string, number> } {
  const restante = new Map(demanda);
  const selecionados: T[] = [];
  const cabe = (p: T) => {
    for (const [t, n] of p.counts) if ((restante.get(t) ?? 0) < n) return false;
    return true;
  };
  for (const p of padroes) {
    if (rnd && rnd() < pSkip) continue;
    while (cabe(p)) {
      selecionados.push(p);
      for (const [t, n] of p.counts) restante.set(t, restante.get(t)! - n);
      if (rnd && rnd() < pStop) break;
    }
  }
  for (const [t, n] of restante) if (n === 0) restante.delete(t);
  return { selecionados, restante };
}

export interface LayoutChapa { placed: PecaPlacada[]; freeRects: EspacoLivre[]; }

/** Materializa o layout de um padrão com peças reais: cada slot consome um
 *  índice livre do mesmo tipo canônico (idxPorTipo é MUTADO). Retorna null se
 *  faltar peça de algum tipo — defensivo, não ocorre se a seleção respeitou a
 *  demanda. */
export function materializarPadrao(
  layout: LayoutChapa,
  idxPorTipo: Map<string, number[]>,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string; podeRotacionar?: boolean }>
): LayoutChapa | null {
  const placed: PecaPlacada[] = [];
  for (const slot of layout.placed) {
    const lNat = slot.rot ? slot.a : slot.l;
    const aNat = slot.rot ? slot.l : slot.a;
    const tipo = tipoCanonico(lNat, aNat, slot.podeRotacionar);
    const livres = idxPorTipo.get(tipo);
    const idx = livres?.pop();
    if (idx === undefined) return null;
    const p = pecas[idx];
    const rot = !(slot.l === p.l && slot.a === p.a);
    placed.push({
      x: slot.x, y: slot.y, l: slot.l, a: slot.a,
      idx, prod: p.prod, rot, pedidoId: p.pedidoId, podeRotacionar: p.podeRotacionar,
    });
  }
  return { placed, freeRects: layout.freeRects.map(r => ({ ...r })) };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/otimizador.fase6.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Type-check + suíte inteira (garantir que nada quebrou)**

Run: `npx tsc --noEmit && npx vitest run lib/otimizador.test.ts`
Expected: sem erros; testes do motor passam.

- [ ] **Step 6: Commit**

```bash
git add lib/otimizador.ts lib/otimizador.fase6.test.ts
git commit -m "feat(otimizador): helpers puros de set-partitioning (fase 6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Ligar o pool e a fase 6 em `empacotarTodas`

**Files:**
- Modify: `lib/otimizador.ts` (dentro de `empacotarTodas`)

**Interfaces:**
- Consumes: `tipoCanonico`, `selecionarCobertura`, `materializarPadrao` (Task 1); `hffGreedyBestSheet`, `avaliar`, `poolPadroes`/`poolAdd`/`PadraoChapa` (já existentes no arquivo).
- Produces: nada novo exportado — mudança interna ao motor.

- [ ] **Step 1: Mover o bloco do pool pra antes de `avaliar` e trocar a chave de tipo**

O bloco atual (entre as fases 4 e 5, linhas ~1120-1140, começando em `// ── Pool de padrões de chapa (alimenta a fase 6)` e terminando no fechamento de `poolAdd`) sai de onde está e é reinserido **imediatamente antes** de `function avaliar(sheets: SheetState[]) {` (linha ~980). Na realocação, o corpo de `poolAdd` muda a construção de `counts` pra usar a chave canônica com dimensões naturais (a linha `const tipoDe = ...` é removida):

```ts
  // ── Pool de padrões de chapa (alimenta a fase 6) ──────────────────────────────
  // Cada chapa de alto aproveitamento vista em QUALQUER fase vira um "padrão":
  // um multiconjunto canônico de tipos de peça (peças de dimensões iguais são
  // intercambiáveis) + um layout concreto que o realiza. A fase 6 escolhe a
  // melhor combinação de padrões deste pool.
  interface PadraoChapa { counts: Map<string, number>; layout: SheetState; areaUtil: number; }
  const poolPadroes = new Map<string, PadraoChapa>();
  const POOL_MIN_FILL = W * H * 0.85;
  function poolAdd(sheets: SheetState[]) {
    for (const sh of sheets) {
      let fill = 0;
      for (const p of sh.placed) fill += p.l * p.a;
      if (fill < POOL_MIN_FILL) continue;
      const counts = new Map<string, number>();
      for (const p of sh.placed) {
        const lNat = p.rot ? p.a : p.l, aNat = p.rot ? p.l : p.a;
        const t = tipoCanonico(lNat, aNat, p.podeRotacionar);
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      const key = [...counts.keys()].sort().map(t => `${t}*${counts.get(t)}`).join("|");
      if (!poolPadroes.has(key) && poolPadroes.size < 8000) {
        poolPadroes.set(key, { counts, layout: sh, areaUtil: fill });
      }
    }
  }
```

- [ ] **Step 2: Alimentar o pool dentro de `avaliar`**

```ts
  function avaliar(sheets: SheetState[]) {
    const n = sheets.length;
    if (n === 0) return;
    poolAdd(sheets);
    const usedArea = sheets.reduce((s, sh) => s + sh.placed.reduce((a, p) => a + p.l * p.a, 0), 0);
    const aprov = usedArea / (n * W * H);
    if (n < melhorN || (n === melhorN && aprov > melhorAprov)) {
      melhorN = n; melhorAprov = aprov; melhorSheets = sheets;
    }
  }
```

- [ ] **Step 3: Encolher o orçamento do GRASP de 95% → 80%**

Na fase 5, trocar:

```ts
    const deadlineGrasp = tStart + Math.floor(tTotal * 0.95);
```

por:

```ts
    const deadlineGrasp = tStart + Math.floor(tTotal * 0.80); // fase 6 fica com a janela final
```

- [ ] **Step 4: Adicionar a fase 6**

Depois do fechamento do bloco da fase 5 (a chave que fecha após o `[fase5-hff-kelim]`) e antes de `const sheets: SheetState[] = melhorSheets ?? [];`, inserir:

```ts
  // ── Fase 6: set-partitioning sobre o pool de padrões ──────────────────────────
  // Atribuição global: as fases 1-5 produzem soluções inteiras, mas chapas
  // individuais excelentes de rodadas DIFERENTES nunca aparecem juntas. Aqui
  // escolhemos a melhor combinação de padrões do pool (guloso randomizado com
  // restarts) e fechamos o resíduo com o construtor mais forte (hffGreedy).
  if (melhorN > 1 && poolPadroes.size > 0) {
    const deadline6 = tStart + Math.floor(tTotal * 0.97);

    const demanda = new Map<string, number>();
    const idxPorTipo = new Map<string, number[]>();
    for (const i of base) {
      const p = pecas[i];
      const t = tipoCanonico(p.l, p.a, p.podeRotacionar);
      demanda.set(t, (demanda.get(t) ?? 0) + 1);
      const arr = idxPorTipo.get(t);
      if (arr) arr.push(i); else idxPorTipo.set(t, [i]);
    }

    const padroes = [...poolPadroes.values()].sort((a, b) => b.areaUtil - a.areaUtil);

    let seed6 = (0x2545f491 ^ (W * 13) ^ H ^ Math.imul(pecas.length, 0x9e3779b9)) >>> 0;
    function lcg6() {
      seed6 = Math.imul(seed6 ^ (seed6 >>> 16), 0x45d9f3b);
      seed6 = Math.imul(seed6 ^ (seed6 >>> 16), 0x45d9f3b);
      return ((seed6 ^ (seed6 >>> 16)) >>> 0) / 0x100000000;
    }

    let melhorSel: { selecionados: PadraoChapa[]; total: number } | null = null;
    let n6 = 0;
    let primeiro = true;
    while (primeiro || Date.now() < deadline6) {
      let sel: { selecionados: PadraoChapa[]; restante: Map<string, number> };
      if (primeiro) {
        sel = selecionarCobertura(padroes, demanda, null); // 1º restart: guloso puro
      } else {
        const pSkip = 0.02 + lcg6() * 0.28;
        const pStop = lcg6() * 0.4;
        sel = selecionarCobertura(padroes, demanda, lcg6, pSkip, pStop);
      }
      primeiro = false;

      // Resíduo: pra CONTAR chapas basta qualquer peça de cada tipo restante —
      // o empacotamento só olha dimensões/trava, não identidade.
      const idxResto: number[] = [];
      for (const [t, nn] of sel.restante) {
        const arr = idxPorTipo.get(t)!;
        for (let k = 0; k < nn; k++) idxResto.push(arr[k]);
      }
      const pecasResto = idxResto.map(i => pecas[i]);
      const resSheets = pecasResto.length > 0 ? hffGreedyBestSheet(W, H, pecasResto, kerf) : [];
      const total = sel.selecionados.length + resSheets.length;
      n6++;
      if (!melhorSel || total < melhorSel.total) melhorSel = { selecionados: sel.selecionados, total };
    }

    // Materializa só a melhor combinação (se tiver chance de melhorar/empatar)
    if (melhorSel && melhorSel.total <= melhorN) {
      const livres = new Map<string, number[]>();
      idxPorTipo.forEach((arr, t) => livres.set(t, [...arr]));
      const materializadas: SheetState[] = [];
      let ok = true;
      for (const pat of melhorSel.selecionados) {
        const m = materializarPadrao(pat.layout, livres, pecas);
        if (!m) { ok = false; break; }
        materializadas.push({ placed: m.placed, freeRects: m.freeRects });
      }
      if (ok) {
        const idxResto: number[] = [];
        livres.forEach(arr => idxResto.push(...arr));
        const pecasResto = idxResto.map(i => pecas[i]);
        const resSheets = pecasResto.length > 0 ? hffGreedyBestSheet(W, H, pecasResto, kerf) : [];
        const resRemap: SheetState[] = resSheets.map(sh => ({
          freeRects: sh.freeRects,
          placed: sh.placed.map(p => ({ ...p, idx: idxResto[p.idx] })),
        }));
        avaliar([...materializadas, ...resRemap]);
      }
    }
    if (process.env.OTIM_DEBUG) console.log(`[fase6] pool=${poolPadroes.size} restarts=${n6} melhorSel=${melhorSel?.total ?? "-"} melhorN=${melhorN} aprov=${(melhorAprov*100).toFixed(2)}%`);
  }
```

Nota sobre o remap do resíduo: `hffGreedyBestSheet` recebe o sub-array `pecasResto`, então os `placed.idx` que ele devolve são posições do sub-array — `idxResto[p.idx]` converte de volta pro índice real. `prod`/`pedidoId`/`podeRotacionar` já vêm certos porque os elementos do sub-array são os mesmos objetos.

- [ ] **Step 5: Type-check + suíte completa (inclui bench com trava ≤34)**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros de tipo; todos os testes passam, incluindo guilhotinabilidade de toda chapa e `chapas.length ≤ 34` no bench.

- [ ] **Step 6: Rodar o bench com debug e registrar o resultado**

Run (Bash): `OTIM_DEBUG=1 npx vitest run lib/otimizador.bench.test.ts 2>&1 | grep -E "fase|REAL"`
Expected: linha `[fase6] pool=... restarts=... melhorSel=...` aparece; anotar `chapas=` do log `REAL P-058/P-059`.

- [ ] **Step 7: Commit**

```bash
git add lib/otimizador.ts
git commit -m "feat(otimizador): fase 6 — set-partitioning sobre pool de padroes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Medir, iterar na seleção (timeboxed) e fechar

**Files:**
- Modify: `lib/otimizador.ts` (só se alguma iteração de score for necessária)
- Modify: `lib/otimizador.bench.test.ts` (só se o alvo de 33 for atingido)

- [ ] **Step 1: Medir**

Rodar o bench 3 vezes e anotar `chapas=` de cada rodada:

Run: `npx vitest run lib/otimizador.bench.test.ts 2>&1 | grep "REAL"` (×3)

- [ ] **Step 2 (condicional): Se atingiu 33 — apertar a trava do bench**

Em `lib/otimizador.bench.test.ts`, trocar `expect(chapas.length).toBeLessThanOrEqual(34);` por `expect(chapas.length).toBeLessThanOrEqual(33);` e atualizar o comentário do cabeçalho pra registrar o empate com o Corte Certo. Rodar `npm test`, commitar (`test(otimizador): trava do bench aperta pra 33 chapas (empate com Corte Certo)`) e pular pro Step 4.

- [ ] **Step 3 (condicional): Se continuou em 34 — iterar nos botões da seleção, nesta ordem, medindo o bench após cada um e mantendo só o que melhora**

1. **Diversidade de ordenação do pool**: além de `areaUtil desc`, alternar entre restarts uma segunda ordenação que prioriza padrões que usam menos peças "curtas" (complementos escassos — mesmo insight do `lambdaCurtas` da fase 5): score de ordenação = `areaUtil - 0.3 × áreaDasCurtasNoPadrão`, onde curta = tipo com `max(dim) < (H - kerf) / 2`.
2. **Faixa de perturbação mais agressiva**: ampliar `pSkip` até 0.45 e `pStop` até 0.6 nos restarts pares (mantém os ímpares na faixa atual) — explora seleções mais distantes do guloso.
3. **Resíduo com kEliminate**: aplicar `kEliminate(W, H, resSheets, kerf, Date.now() + 200)` no resíduo da MELHOR combinação antes do `avaliar` final (só na materialização, não nos restarts de contagem).

Cada tentativa: implementar → `npx vitest run lib/otimizador.bench.test.ts` → manter se `chapas` caiu, reverter se não. Parar quando fechar 33 ou quando as 3 tentativas se esgotarem — e nesse caso reportar honestamente o resultado ao usuário (a trava fica em ≤34).

- [ ] **Step 4: Verificação final e push**

```bash
npx tsc --noEmit && npm test && npm run build
git add -A && git commit -m "..." && git push   # se houver mudança pendente das iterações
```

- [ ] **Step 5: Reportar ao usuário**

Reportar: resultado final do bench (33 ou 34, aproveitamento, tempo), o que cada iteração mudou, e o lembrete de que a validação prática na bancada com o vidraceiro continua sendo o critério pra aposentar o Corte Certo. Atualizar a memória do projeto (`project-otimizador-guilhotina.md`) com o desfecho da fase 6.
