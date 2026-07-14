# Migração do Tema Claro — Paleta Neutra e Semântica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O tema claro (`[data-theme="light"]` em `app/globals.css`) troca o bege/areia atual por uma paleta neutra e semântica, separando de vez a cor de "ação" (indigo) da cor de "positivo" (verde) — hoje colapsadas no mesmo hex — e corrige 3 lugares onde uma cor de alerta era aplicada a um estado neutro/zerado.

**Architecture:** Nenhuma CSS custom property é renomeada e nenhum dos ~56 arquivos que consomem `var(--acc)`/`var(--ok)`/etc. é tocado — só os *valores* dentro do bloco `[data-theme="light"]` mudam. Isso entrega a paleta pedida com risco zero pro resto do app e sem violar "só cores, não estrutura". Separado disso: 2 correções de bug (KPI zerado pintando alerta) e 3 trocas de `className` (chip de categoria neutra que hoje usa a cor de alerta por engano).

**Tech Stack:** CSS custom properties, Next.js/TypeScript.

## Global Constraints

- Só `[data-theme="light"]` — o bloco `:root` (tema escuro) não é tocado em nenhuma task.
- Nenhuma CSS custom property é renomeada; nenhum arquivo fora dos listados abaixo é modificado.
- Sem teste automatizado disponível (mudança 100% visual) — validar via `tsc --noEmit` + `next build`, validação visual real fica por conta do usuário depois.
- Spec de referência: `docs/superpowers/specs/2026-07-14-tema-claro-neutro-semantico-design.md`.

---

### Task 1: Novo bloco de cores do tema claro em `app/globals.css`

**Files:**
- Modify: `app/globals.css:801-874`

- [ ] **Step 1: Substituir o bloco inteiro do tema claro**

De (texto exato hoje, linhas 801-874):

```css
/* ─── TEMA CLARO ─────────────────────────────────────────── */
[data-theme="light"] {
  --bg:    #e3d5cc;
  --surf:  #ffffff;
  --surf1: #ffffff;
  --surf2: #e8edf7;
  --surf3: #dce4f2;
  --surf4: #d0daea;

  --b1: #bcc8da;
  --b2: #a4b4c8;
  --b3: #849ab2;

  --acc:  #0d9668;
  --acc2: #0369a1;
  --acc3: #c2410c;
  --acc4: #6d28d9;
  --acc5: #b45309;

  --ok:   #0d9668;
  --warn: #b45309;
  --err:  #be123c;

  --t1: #111827;
  --t2: #374151;
  --t3: #6b7280;
  --t4: #9ca3af;

  --sh: 0 4px 32px rgba(0,0,0,.1);
}

/* Ajustes de componentes para tema claro */
[data-theme="light"] .bp { color: #fff; }
[data-theme="light"] .bp:hover { background: #0a7a54; box-shadow: 0 0 18px rgba(13,150,104,.25); }
[data-theme="light"] .bs { color: #fff; }
[data-theme="light"] .bs:hover { background: #025a8c; }

[data-theme="light"] .ni.active { background: rgba(13,150,104,.09); }
[data-theme="light"] .sb-logo-wrap:hover { background: rgba(13,150,104,.06) !important; }
[data-theme="light"] .sb:hover { box-shadow: 4px 0 24px rgba(0,0,0,.12) !important; }

[data-theme="light"] tbody tr:hover td { background: rgba(0,0,0,.025); }

[data-theme="light"] .cg { color: #065f46; border-color: rgba(16,185,129,.4); }
[data-theme="light"] .cy { color: #78350f; border-color: rgba(245,158,11,.4); }
[data-theme="light"] .cr { color: #881337; border-color: rgba(244,63,94,.4); }
[data-theme="light"] .cb { color: #0c4a6e; border-color: rgba(0,200,255,.4); }
[data-theme="light"] .cp { color: #4c1d95; border-color: rgba(167,139,250,.4); }
[data-theme="light"] .co { color: #7c2d12; border-color: rgba(255,107,53,.4); }
[data-theme="light"] .cgr { background: rgba(0,0,0,.05); color: var(--t3); }

[data-theme="light"] .nbdg.blue { color: #fff; }

[data-theme="light"] .add-il:hover { background: rgba(13,150,104,.07); }

[data-theme="light"] .mov { background: rgba(0,0,0,.45); }

[data-theme="light"] .rtag {
  background: rgba(3,105,161,.08);
  border-color: rgba(3,105,161,.25);
  color: var(--acc2);
}

[data-theme="light"] .tab.on { box-shadow: 0 1px 4px rgba(0,0,0,.1); }
[data-theme="light"] .kbcard:hover { transform: translateY(-1px); }

[data-theme="light"] ::-webkit-scrollbar-thumb { background: var(--b2); }

/* Separação de linhas em listas/tabelas */
[data-theme="light"] .tw { border-color: var(--b2); }
[data-theme="light"] thead th { background: var(--surf3); border-bottom-color: var(--b2); }
[data-theme="light"] tbody td { border-bottom-color: var(--b2); }
[data-theme="light"] tbody tr:nth-child(even) td { background: rgba(0,0,0,.03); }
[data-theme="light"] tbody tr:hover td { background: rgba(13,150,104,.08) !important; }
```

Para:

```css
/* ─── TEMA CLARO ─────────────────────────────────────────── */
/* Paleta neutra e semântica (migração 2026-07-14) — --acc (ação) e
   --ok (positivo) finalmente têm hues diferentes (indigo vs. verde);
   antes colapsavam no mesmo #0d9668. Ver docs/superpowers/specs/
   2026-07-14-tema-claro-neutro-semantico-design.md pro mapeamento
   completo e o porquê de cada valor. */
[data-theme="light"] {
  --bg:    #FAFAFA;
  --surf:  #FFFFFF;
  --surf1: #FFFFFF;
  --surf2: #F4F4F5;
  --surf3: #EFEFF1;
  --surf4: #E4E4E7;

  --b1: #E4E4E7;
  --b2: #D4D4D8;
  --b3: #A1A1AA;

  --acc:  #4F46E5;
  --acc2: #2563EB;
  --acc3: #C2410C;
  --acc4: #7C3AED;
  --acc5: #D97706;

  --ok:   #16A34A;
  --warn: #D97706;
  --err:  #DC2626;

  --t1: #18181B;
  --t2: #71717A;
  --t3: #A1A1AA;
  --t4: #D4D4D8;

  --sh: 0 4px 32px rgba(0,0,0,.1);
}

/* Ajustes de componentes para tema claro */
[data-theme="light"] .bp { color: #fff; }
[data-theme="light"] .bp:hover { background: #4338CA; box-shadow: 0 0 18px rgba(79,70,229,.25); }
[data-theme="light"] .bs { color: #fff; }
[data-theme="light"] .bs:hover { background: #1D4ED8; }

[data-theme="light"] .ni.active { background: rgba(79,70,229,.09); }
[data-theme="light"] .sb-logo-wrap:hover { background: rgba(79,70,229,.06) !important; }
[data-theme="light"] .sb:hover { box-shadow: 4px 0 24px rgba(0,0,0,.12) !important; }

[data-theme="light"] tbody tr:hover td { background: rgba(0,0,0,.025); }

[data-theme="light"] .cg { background: rgba(22,163,74,.12);  color: #15803D; border-color: rgba(22,163,74,.35); }
[data-theme="light"] .cy { background: rgba(217,119,6,.12);  color: #B45309; border-color: rgba(217,119,6,.35); }
[data-theme="light"] .cr { background: rgba(220,38,38,.12);  color: #B91C1C; border-color: rgba(220,38,38,.35); }
[data-theme="light"] .cb { background: rgba(37,99,235,.12);  color: #1D4ED8; border-color: rgba(37,99,235,.35); }
[data-theme="light"] .cp { background: rgba(124,58,237,.12); color: #6D28D9; border-color: rgba(124,58,237,.35); }
[data-theme="light"] .co { background: rgba(194,65,12,.12);  color: #9A3412; border-color: rgba(194,65,12,.35); }
[data-theme="light"] .cgr { background: rgba(0,0,0,.05); color: var(--t3); }

[data-theme="light"] .nbdg.blue { color: #fff; }

[data-theme="light"] .add-il:hover { background: rgba(79,70,229,.07); }

[data-theme="light"] .mov { background: rgba(0,0,0,.45); }

[data-theme="light"] .rtag {
  background: rgba(37,99,235,.08);
  border-color: rgba(37,99,235,.25);
  color: var(--acc2);
}

[data-theme="light"] .tab.on { box-shadow: 0 1px 4px rgba(0,0,0,.1); }
[data-theme="light"] .kbcard:hover { transform: translateY(-1px); }

[data-theme="light"] ::-webkit-scrollbar-thumb { background: var(--b2); }

/* Separação de linhas em listas/tabelas */
[data-theme="light"] .tw { border-color: var(--b2); }
[data-theme="light"] thead th { background: var(--surf3); border-bottom-color: var(--b2); }
[data-theme="light"] tbody td { border-bottom-color: var(--b2); }
[data-theme="light"] tbody tr:nth-child(even) td { background: rgba(0,0,0,.03); }
[data-theme="light"] tbody tr:hover td { background: rgba(79,70,229,.08) !important; }
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (CSS não é verificado pelo tsc, mas confirma que nada mais quebrou no mesmo passo).

- [ ] **Step 3: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(tema): migra paleta do tema claro para sistema neutro e semantico"
```

---

### Task 2: Corrigir os 2 falsos-positivos de KPI zerado

**Files:**
- Modify: `app/vendedores/page.tsx:134`
- Modify: `app/compras/page.tsx:284`

- [ ] **Step 1: Corrigir o card "A Pagar" em `app/vendedores/page.tsx`**

De (linha 134):

```tsx
            { label: "A Pagar",         value: formatBRL(totalPendente),                                color: "var(--warn)", sub: "comissões pendentes" },
```

Para:

```tsx
            { label: "A Pagar",         value: formatBRL(totalPendente),                                color: totalPendente > 0 ? "var(--warn)" : "var(--t2)", sub: "comissões pendentes" },
```

- [ ] **Step 2: Corrigir o card "Pendentes de Recebimento" em `app/compras/page.tsx`**

De (linha 284):

```tsx
            { label: "Pendentes de Recebimento", value: String(pendentes.length),          color: "var(--warn)", sub: "ainda em rascunho" },
```

Para:

```tsx
            { label: "Pendentes de Recebimento", value: String(pendentes.length),          color: pendentes.length > 0 ? "var(--warn)" : "var(--t2)", sub: "ainda em rascunho" },
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Commit**

```bash
git add app/vendedores/page.tsx app/compras/page.tsx
git commit -m "fix(kpi): nao usa cor de alerta quando o valor pendente e zero"
```

---

### Task 3: 3 chips de categoria neutra deixam de usar a cor de alerta

**Files:**
- Modify: `app/contabilidade/estoque/page.tsx:37`
- Modify: `app/contabilidade/consorcios/page.tsx:365-366`
- Modify: `app/retalhos/page.tsx:18,611`

- [ ] **Step 1: `app/contabilidade/estoque/page.tsx` — tipo de movimentação "saída" é categórico, não alerta**

De (linha 36-39):

```tsx
const TIPO_CHIP: Record<TipoMovimentacaoItemEstoque, string> = {
  entrada: "chip cg", saida: "chip cy", ajuste: "chip cb", perda: "chip cr",
  transferencia: "chip cp", saldo_inicial: "chip cgr",
};
```

Para:

```tsx
const TIPO_CHIP: Record<TipoMovimentacaoItemEstoque, string> = {
  entrada: "chip cg", saida: "chip cgr", ajuste: "chip cb", perda: "chip cr",
  transferencia: "chip cp", saldo_inicial: "chip cgr",
};
```

- [ ] **Step 2: `app/contabilidade/consorcios/page.tsx` — status "Encerrado" é fim de ciclo, não pendência**

De (linhas 365-366):

```tsx
                      <span className={c.status === "contemplado" ? "chip cg" : c.status === "encerrado" ? "chip cy" : "chip cgr"} style={{ fontSize: "11px" }}>
                        {c.status === "contemplado" ? "Contemplado" : c.status === "encerrado" ? "Encerrado" : "Ativo"}
```

Para:

```tsx
                      <span className={c.status === "contemplado" ? "chip cg" : "chip cgr"} style={{ fontSize: "11px" }}>
                        {c.status === "contemplado" ? "Contemplado" : c.status === "encerrado" ? "Encerrado" : "Ativo"}
```

(Simplificado: "encerrado" e "ativo" já viravam a mesma classe `chip cgr` — a condição extra ficou redundante.)

- [ ] **Step 3: `app/retalhos/page.tsx` — status "Reservado" é estado de ciclo de vida, não alerta (chip da tabela)**

De (linhas 16-21):

```tsx
const CHIP: Record<StatusRetalho, string> = {
  "Disponível": "chip cg",
  "Reservado":  "chip cy",
  "Em uso":     "chip cb",
  "Descartado": "chip cr",
};
```

Para:

```tsx
const CHIP: Record<StatusRetalho, string> = {
  "Disponível": "chip cg",
  "Reservado":  "chip cgr",
  "Em uso":     "chip cb",
  "Descartado": "chip cr",
};
```

- [ ] **Step 4: `app/retalhos/page.tsx` — botão de ação "Reservado" (linha 611) também usava a cor de alerta direto, sem passar pelo chip**

De (linhas 608-613):

```tsx
                          <div style={{ display:"flex", gap:"4px", alignItems:"center" }}>
                            {r.status !== "Disponível" && btnStatus("Disponível", "var(--ok)",   "rgba(16,185,129,.15)", () => mudarStatus(r.id, "Disponível"))}
                            {r.status !== "Reservado"  && btnStatus("Reservado",  "var(--warn)", "rgba(245,158,11,.15)", () => mudarStatus(r.id, "Reservado"))}
                            {r.status !== "Em uso"     && btnStatus("Em uso",     "var(--acc2)", "rgba(99,179,237,.15)", () => mudarStatus(r.id, "Em uso"))}
                          </div>
```

Para:

```tsx
                          <div style={{ display:"flex", gap:"4px", alignItems:"center" }}>
                            {r.status !== "Disponível" && btnStatus("Disponível", "var(--ok)", "rgba(16,185,129,.15)", () => mudarStatus(r.id, "Disponível"))}
                            {r.status !== "Reservado"  && btnStatus("Reservado",  "var(--t2)", "rgba(113,113,122,.15)", () => mudarStatus(r.id, "Reservado"))}
                            {r.status !== "Em uso"     && btnStatus("Em uso",     "var(--acc2)", "rgba(99,179,237,.15)", () => mudarStatus(r.id, "Em uso"))}
                          </div>
```

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 6: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 7: Commit**

```bash
git add "app/contabilidade/estoque/page.tsx" "app/contabilidade/consorcios/page.tsx" "app/retalhos/page.tsx"
git commit -m "fix(chips): categorias neutras (saida/encerrado/reservado) nao usam mais cor de alerta"
```

---

### Task 4: Busca de remanescentes hardcoded (só relatório — passo 4 do pedido original)

**Files:**
- Nenhum arquivo modificado — task de levantamento.

- [ ] **Step 1: Rodar as buscas**

```bash
grep -rc "rgba(16,185,129" app components --include=*.tsx | grep -v ":0"
grep -rc "rgba(245,158,11" app components --include=*.tsx | grep -v ":0"
grep -rc "rgba(244,63,94" app components --include=*.tsx | grep -v ":0"
grep -rc "#f59e0b\|#f43f5e\|#10b981\|#3dffa0" app components --include=*.tsx | grep -v ":0"
```

Expected: listas de arquivos com contagem — mesmo resultado (~220 ocorrências, ~30 arquivos) já mapeado na spec, usado só pra confirmar que nada mudou desde a auditoria.

- [ ] **Step 2: Reportar ao usuário**

Apresentar a lista de arquivos/contagens como relatório de remanescentes — deixar claro que é só o passo 4 do pedido original (levantamento), migração desses casos fica fora de escopo desta leva (decisão já confirmada). Nenhum commit nesta task.

Isso encerra a migração do tema claro. Pedir pro usuário testar visualmente no navegador (claro/escuro, toggle incluso) antes de considerar validado — mudança 100% visual, sem forma de confirmar via terminal.
