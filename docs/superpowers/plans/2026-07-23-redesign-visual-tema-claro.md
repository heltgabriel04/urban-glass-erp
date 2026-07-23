# Redesign Visual — Fundação + Tela de Pedido (Tema Claro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar visualmente o tema claro do ERP (paleta, tipografia, componentes globais) e aplicar tudo na tela de detalhe do Pedido, sem alterar nenhuma regra de negócio.

**Architecture:** Extensão do design system existente (`app/globals.css`, tokens CSS custom properties consumidos por classes utilitárias e componentes React) — não é uma reescrita. Cor/tipografia/raio mudam de *valor* dentro de `[data-theme="light"]`; o tema escuro (`:root`) e os ~56 arquivos que consomem `var(--acc)`/`var(--ok)`/etc. não são tocados, exceto onde marcado explicitamente.

**Tech Stack:** Next.js (App Router), React, CSS puro com custom properties (sem Tailwind/CSS-in-JS), Vitest para testes de lógica pura.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-23-redesign-visual-tema-claro-design.md` — qualquer dúvida de "por que esse valor" está lá.
- **Só o tema claro** (`[data-theme="light"]`). Nenhuma regra dentro de `:root` (tema escuro) muda de valor. Onde um componente compartilhado (ex.: Sidebar) precisa mudar só no claro, use uma regra `[data-theme="light"] .classe { ... }` nova, ou uma CSS variable com fallback (`var(--nova-var, var(--valor-atual))`) — nunca edite a regra base se ela também renderiza o tema escuro.
- **Nenhuma mudança de regra de negócio.** Se uma task parecer exigir dado novo, lógica nova ou comportamento novo (não só cor/layout), pare e não implemente — está fora de escopo (ver seção "Fora de escopo" da spec).
- Fonte Inter **já está carregada** em `app/layout.tsx:26` (Google Fonts, pesos 400–900) — nenhuma task precisa adicionar carregamento de fonte.
- Depois de cada task: `npx tsc --noEmit` limpo e `npx vitest run` com os 199 testes existentes (mais os novos desta leva) passando. Antes do commit final (última task), rodar também `npx next build`.
- Commits em português, seguindo o estilo do histórico do repo (`git log --oneline -10` pra referência de tom).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `app/globals.css` | modificar | tokens de cor/raio/sombra, tipografia, botões, tabelas, chips, tooltip utilitário |
| `components/ui/Icon.tsx` | criar | componente SVG genérico extraído de `Sidebar.tsx` (renderer, sem os paths) |
| `components/layout/Sidebar.tsx` | modificar | usa `Icon` importado, ícones maiores, cor de hover/ativo no tema claro |
| `lib/formatters.ts` | modificar | nova função pura `pctConcluido` |
| `lib/formatters.test.ts` | modificar | teste da `pctConcluido` |
| `app/pedidos/[id]/page.tsx` | modificar | mapa de ícones `PEDIDO_IC`, faixa de indicadores, timeline, card de plano de corte, tabela de resumo, headers de acordeão |

---

### Task 1: Extrair componente `Icon` compartilhado

**Files:**
- Create: `components/ui/Icon.tsx`
- Modify: `components/layout/Sidebar.tsx:11-24` (remove a função local, importa a nova)

**Interfaces:**
- Produces: `Icon({ d, size }: { d: string | string[]; size?: number })` — componente React, default export de `components/ui/Icon.tsx`. `d` aceita um path SVG único ou um array de paths (cada um vira um `<path>`). `size` default `15`.

- [ ] **Step 1: Criar `components/ui/Icon.tsx` com o conteúdo extraído**

```tsx
export default function Icon({ d, size = 15 }: { d: string | string[]; size?: number }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
```

- [ ] **Step 2: Remover a função local de `Sidebar.tsx` e importar a nova**

Em `components/layout/Sidebar.tsx`, remover as linhas 9-24 (comentário + função `Icon`) e adicionar o import no topo do arquivo, junto aos demais imports:

```tsx
import Icon from "@/components/ui/Icon";
```

- [ ] **Step 3: Verificar que não sobrou nenhum outro uso de `Icon` quebrado**

Run: `npx tsc --noEmit`
Expected: nenhum erro (Sidebar.tsx é o único consumidor de `Icon` hoje).

- [ ] **Step 4: Rodar suite de testes (sem mudança de comportamento esperada)**

Run: `npx vitest run`
Expected: 199 testes passando (nenhum teste cobre Sidebar hoje — é refactor puro).

- [ ] **Step 5: Commit**

```bash
git add components/ui/Icon.tsx components/layout/Sidebar.tsx
git commit -m "refactor: extrai Icon (SVG generico) da Sidebar pra components/ui, reuso na tela de Pedido"
```

---

### Task 2: Tokens de cor, raio e sombra (`app/globals.css`)

**Files:**
- Modify: `app/globals.css:836-876` (bloco `[data-theme="light"]`)

**Interfaces:**
- Consumes: nenhuma (task de fundação, primeira a mexer em cor).
- Produces: os valores de `--bg`, `--surf2`, `--surf3`, `--surf4`, `--b1`, `--b2`, `--b3`, `--acc`, `--acc-strong`, `--acc2`, `--t1`, `--t2`, `--t3`, `--t4`, `--r2`, `--card-shadow` dentro de `[data-theme="light"]`, mais os 2 tokens novos `--sb-bg`/`--sb-hover` (só existem no bloco light, de propósito — ver Task 7).

- [ ] **Step 1: Substituir o bloco de valores dentro de `[data-theme="light"]`**

Em `app/globals.css`, dentro do bloco que começa em `[data-theme="light"] {` (linha 836), substituir os valores conforme a tabela abaixo (mantém todos os comentários existentes do bloco, só troca os valores das linhas indicadas):

```css
  --bg:    #F4F7FA;
  --surf:  #FFFFFF;
  --surf1: #FFFFFF;
  --surf2: #EEF2F7;
  --surf3: #E6ECF3;
  --surf4: #DCE4EE;

  --b1: #CBD5E1;
  --b2: #94A3B8;
  --b3: #64748B;
  --card-shadow: 0 1px 2px rgba(15,23,42,.04), 0 2px 8px rgba(15,23,42,.06);

  --acc:  #2563EB;
  --acc2: #0EA5E9;
  --acc3: #C2410C;
  --acc4: #7C3AED;
  --acc5: #D97706;
  --acc-strong: #1D4ED8;

  --ok:   #16A34A;
  --warn: #D97706;
  --err:  #DC2626;

  --t1: #1E293B;
  --t2: #475569;
  --t3: #64748B;
  --t4: #CBD5E1;

  --sb-bg: #1E293B;
  --sb-hover: #334155;

  --sh: 0 4px 32px rgba(0,0,0,.1);
```

(`--acc3`, `--acc5`, `--ok`, `--err`, `--warn`, `--sh` ficam com o mesmo valor que já tinham — reafirmados aqui só pra deixar claro que foram revisados e mantidos, não esquecidos.)

- [ ] **Step 2: Atualizar `--r2` (raio de card), fora do bloco de tema (afeta os 2 temas — raio não é decisão de cor)**

Em `app/globals.css:36` (bloco `:root`), trocar:

```css
  --r2: 14px; /* hero cards, modais grandes */
```

por:

```css
  --r2: 12px;
```

- [ ] **Step 3: Recolorir os rgba hardcoded que ainda referenciam o índigo antigo (`79,70,229` = `#4F46E5`)**

Buscar por `79,70,229` dentro do bloco `[data-theme="light"]` (linhas ~884-920) e trocar cada ocorrência pelo rgb do novo `--acc` (`37,99,235` = `#2563EB`):

- `[data-theme="light"] .ni.active { background: rgba(79,70,229,.09); }` → `rgba(37,99,235,.09)`
- `[data-theme="light"] .sb-logo-wrap:hover { background: rgba(79,70,229,.06) !important; }` → `rgba(37,99,235,.06) !important`
- `[data-theme="light"] .add-il:hover { background: rgba(79,70,229,.07); }` → `rgba(37,99,235,.07)`
- `[data-theme="light"] .rtag { ... color: var(--acc2); }` (linha ~904-908) já usa a variável, não hardcoded — conferir que `background: rgba(37,99,235,.08)` e `border-color: rgba(37,99,235,.25)` (hoje já com esses números, coincidência de já usarem 37,99,235) continuam corretos — não precisa mudar, só confirmar visualmente depois.

**Não mexer em `tbody tr:hover td` aqui** — essa linha é reescrita inteira na Task 5 (Tabelas), que substitui o bloco inteiro; mudar aqui também faria a Task 5 procurar um texto que já não existe mais (conflito de edição em sequência).

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo (CSS não afeta typecheck, mas confirma que nada quebrou author-side).
Run: `npx vitest run` — Expected: 199 testes passando (mudança 100% visual).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat: nova paleta do tema claro (fundacao do redesign visual) - cores, raio de card, sombra"
```

---

### Task 3: Tipografia (`app/globals.css`)

**Files:**
- Modify: `app/globals.css:45-52` (`body`), e as classes que hoje usam `'Syne', sans-serif`: `.tb-title` (198-204), `.logo-name` (113-118), `.mtit` (657), `.sv` (680), `.tv` (696), `.rsv` (802), `.ct` (315-324)
- Modify: `app/globals.css` — adicionar 6 classes utilitárias novas no fim do arquivo

**Interfaces:**
- Produces: `.tx-h1`, `.tx-h2`, `.tx-sub`, `.tx-body`, `.tx-sec`, `.tx-aux` (classes CSS, sem props — puro utilitário de `font-size`/`font-weight`/`font-family`).

- [ ] **Step 1: Trocar a fonte do `body` (corpo geral) de DM Mono pra Inter**

Em `app/globals.css:45-52`:

```css
body {
  background: var(--bg);
  color: var(--t1);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 400;
  overflow: hidden;
}
```

(peso sai de 500 pra 400 — "texto padrão 14px" do brief é peso 400; os textos que precisam de mais peso já têm `font-weight` inline nos próprios elementos.)

- [ ] **Step 2: Trocar `'Syne', sans-serif` por `'Inter', sans-serif` em cada classe que hoje usa Syne**

Substituir literalmente `font-family: 'Syne', sans-serif;` por `font-family: 'Inter', sans-serif;` nas 7 ocorrências: `.logo-name` (118), `.tb-title` (199), `.ct` (316), `.mtit` (657), `.sv` (680), `.tv` (696), `.rsv` (802). Não mudar `font-weight` de nenhuma delas — só a família da fonte.

- [ ] **Step 3: Adicionar as classes utilitárias de escala tipográfica no fim de `app/globals.css`**

```css
/* ─── ESCALA TIPOGRÁFICA (redesign 2026-07-23) ──────────────
   Inter pra tudo que não é número; DM Mono continua reservado
   pra valores monetários/quantidade/data (ver .mono, .kpi-v etc). */
.tx-h1   { font-family: 'Inter', sans-serif; font-size: 32px; font-weight: 600; color: var(--t1); }
.tx-h2   { font-family: 'Inter', sans-serif; font-size: 22px; font-weight: 600; color: var(--t1); }
.tx-sub  { font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 600; color: var(--t1); }
.tx-body { font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 400; color: var(--t1); }
.tx-sec  { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 400; color: var(--t2); }
.tx-aux  { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 500; color: var(--t3); }
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 199 testes passando.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat: Inter substitui Syne/DM Mono nos titulos e corpo (DM Mono fica so pra numeros)"
```

---

### Task 4: Botões (`app/globals.css`)

**Files:**
- Modify: `app/globals.css:267-302` (`.btn`, `.bg`, `.sm`, `.xs`), e o bloco `[data-theme="light"]` (linhas ~878-883)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `.btn` com `height: 40px`; `.sm`/`.xs` com altura menor explícita; `[data-theme="light"] .bg` sólido.

- [ ] **Step 1: Adicionar altura fixa em `.btn`, `.sm`, `.xs`**

Em `app/globals.css:267-282` (`.btn`), acrescentar `height: 40px;`:

```css
.btn {
  height: 40px;
  padding: 8px 16px;
  border-radius: var(--r);
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  transition: all 0.12s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  user-select: none;
  text-decoration: none;
}
```

(nota: `font-family` do botão também migra pra Inter aqui, já que é texto de UI, não número.)

Em `app/globals.css:301-302` (`.sm`, `.xs`), acrescentar altura menor pra não herdar os 40px do `.btn` base:

```css
.sm { height: 32px; padding: 5px 12px;  font-size: 12px; }
.xs { height: 26px; padding: 3px 9px;   font-size: 11px; }
```

- [ ] **Step 2: Tornar `.bg` um botão secundário sólido, só no tema claro**

Não mexer na regra base de `.bg` (linhas 293-294) — ela também renderiza o tema escuro. Em vez disso, adicionar uma nova regra logo depois do bloco `[data-theme="light"] .bs:hover` (linha ~882), respeitando a constraint de só tocar tema claro:

```css
[data-theme="light"] .bg { background: var(--surf); color: var(--t1); border-color: var(--b1); }
[data-theme="light"] .bg:hover { border-color: var(--b2); background: var(--surf2); }
```

- [ ] **Step 3: Corrigir hover de `.bp`/`.bs` — hoje hardcoded com hex/rgba do índigo antigo**

`app/globals.css:880` e `:882` (dentro de `[data-theme="light"]`) fixam cor de hover em hex/rgba literais, não em `var()` — não seguem o token automaticamente. Sem esse ajuste, o botão primário e o `.bs` continuariam mostrando o hover roxo antigo mesmo depois da Task 2 trocar os tokens. Trocar:

```css
[data-theme="light"] .bp:hover { background: #4338CA; box-shadow: 0 0 18px rgba(79,70,229,.25); }
[data-theme="light"] .bs { color: #fff; }
[data-theme="light"] .bs:hover { background: #1D4ED8; }
```

por:

```css
[data-theme="light"] .bp:hover { background: var(--acc-strong); box-shadow: 0 0 18px rgba(37,99,235,.25); }
[data-theme="light"] .bs { color: #fff; }
[data-theme="light"] .bs:hover { background: #0284C7; }
```

(`.bp:hover` passa a usar a variável em vez de hex fixo, então acompanha qualquer ajuste futuro de `--acc-strong` automaticamente. `.bs:hover` vira `#0284C7`, sky-600 — um tom mais escuro dentro da mesma família do novo `--acc2` `#0EA5E9`, já que o `#1D4ED8` antigo era índigo, uma família de cor diferente da nova.)

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 199 testes passando.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat: botoes ganham altura padrao 40px, secundario (.bg) vira solido, hover de .bp/.bs acompanha os novos tokens"
```

---

### Task 5: Tabelas (`app/globals.css`)

**Files:**
- Modify: `app/globals.css:518-550` (`.tw`, `table`, `thead th`, `tbody td`), e `[data-theme="light"]` linhas ~916-920

**Interfaces:**
- Consumes: `--acc` novo (Task 2).
- Produces: `thead th` sticky; header/zebra/hover recoloridos.

- [ ] **Step 1: Cabeçalho fixo (sticky) — regra base, afeta os 2 temas (comportamento de scroll, não cor)**

Em `app/globals.css:523`, a classe `.tw` já tem `overflow-y: hidden` — trocar pra permitir sticky funcionar dentro do container de scroll:

```css
.tw { border-radius: var(--r2); border: 1px solid var(--b1); overflow-x: auto; overflow-y: auto; max-height: inherit; -webkit-overflow-scrolling: touch; }
```

Em `app/globals.css:527-539` (`thead th`), adicionar `position: sticky; top: 0; z-index: 1;`:

```css
thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surf2);
  color: var(--t3);
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 600;
  padding: 10px 14px;
  text-align: left;
  font-family: 'Inter', sans-serif;
  border-bottom: 1px solid var(--b1);
  white-space: nowrap;
}
```

(`font-family` migra pra Inter — é label de cabeçalho, não número.)

- [ ] **Step 2: Cabeçalho azul-claro real, zebra e hover recoloridos — só no tema claro**

Em `app/globals.css`, dentro do bloco `[data-theme="light"]`, substituir as 2 linhas existentes (~916-920):

```css
[data-theme="light"] .tw { border-color: var(--b1); }
[data-theme="light"] thead th { background: rgba(37,99,235,.05); border-bottom-color: var(--b1); }
[data-theme="light"] tbody td { border-bottom-color: var(--b1); }
[data-theme="light"] tbody tr:nth-child(even) td { background: rgba(15,23,42,.025); }
[data-theme="light"] tbody tr:hover td { background: rgba(37,99,235,.08) !important; }
```

(troquei as referências de `var(--b2)` por `var(--b1)` pra usar a borda já aliviada da Task 2 — o `--b2` ficaria forte demais numa tabela densa; e o zebra usa `rgba(15,23,42,...)`, tingido de slate em vez de preto puro, coerente com `--card-shadow` da Task 2.)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 199 testes passando.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat: tabelas ganham cabecalho fixo, tom azul-claro real, zebra/hover recoloridos"
```

---

### Task 6: Chips (`app/globals.css`)

**Files:**
- Modify: `app/globals.css:890-896` (bloco `[data-theme="light"]`, chips `.cb`)

**Interfaces:**
- Consumes: `--acc-strong` novo (`#1D4ED8`, Task 2).

- [ ] **Step 1: Alinhar o chip azul (`.cb`) ao novo `--acc-strong` exato**

Em `app/globals.css:893`:

```css
[data-theme="light"] .cb { background: rgba(37,99,235,.12);  color: #1D4ED8;  border-color: rgba(37,99,235,.35); }
```

(era `color: #1D4ED8` já — na prática só confirma que bate com `--acc-strong`; os demais chips `.cg`/`.cy`/`.cr`/`.cp`/`.co`/`.cgr` não referenciam a paleta azul e ficam como estão.)

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 199 testes passando.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "chore: alinha chip azul ao acc-strong exato do novo primary"
```

---

### Task 7: Sidebar — visual (`app/globals.css` + `components/layout/Sidebar.tsx`)

**Files:**
- Modify: `app/globals.css:82-89` (`.sb`), `:156` (`.ni:hover`), `:884` (`[data-theme="light"] .ni.active`)
- Modify: `components/layout/Sidebar.tsx:324` (`size={15}` → `size={18}`)

**Interfaces:**
- Consumes: `Icon` (Task 1), `--sb-bg`/`--sb-hover` (definidos só em `[data-theme="light"]`, Task 2).

- [ ] **Step 1: Fundo da sidebar fixo e escuro, com fallback pro tema escuro atual**

Em `app/globals.css:82-89` (`.sb`), trocar `background: var(--surf);` por uma variável com fallback — assim o tema claro usa o novo `--sb-bg` (`#1E293B`) e o tema escuro (onde `--sb-bg` não existe) continua exatamente como está hoje:

```css
.sb {
  background: var(--sb-bg, var(--surf));
  border-right: 1px solid var(--b1);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  z-index: 20;
}
```

- [ ] **Step 2: Hover de item de navegação — cor de fundo com o mesmo fallback**

Em `app/globals.css:156` (`.ni:hover`), trocar:

```css
.ni:hover { color: var(--t1); background: var(--sb-hover, var(--surf2)); border-left-color: var(--b2); }
```

- [ ] **Step 3: Indicador de item ativo — azul só no tema claro**

Em `app/globals.css:884` (`[data-theme="light"] .ni.active`), a regra já existe e só precisa do valor recolorido (feito na Task 2, Step 3) — conferir que ficou:

```css
[data-theme="light"] .ni.active { background: rgba(37,99,235,.09); }
```

Adicionar, logo abaixo dessa linha, a borda esquerda azul (hoje `.ni.active` base usa `border-left-color: var(--acc)`, que já vira azul automaticamente com o token da Task 2 — não precisa de regra nova aqui, só confirmar visualmente no browser depois).

- [ ] **Step 4: Ícones maiores**

Em `components/layout/Sidebar.tsx:324`, trocar:

```tsx
<Icon d={item.icon} size={18} />
```

(era `size={15}`.)

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 199 testes passando.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/layout/Sidebar.tsx
git commit -m "feat: sidebar fica escura fixa (independente do tema), icones maiores, hover/ativo azul no claro"
```

---

### Task 8: Helper `pctConcluido` (TDD) — `lib/formatters.ts`

**Files:**
- Modify: `lib/formatters.ts` (nova função, no fim do arquivo)
- Test: `lib/formatters.test.ts` (novo `describe`)

**Interfaces:**
- Produces: `pctConcluido(concluido: number, total: number): number` — retorna um inteiro 0–100. `total <= 0` retorna `0` (evita `NaN`/`Infinity`). Resultado sempre limitado a `[0, 100]` mesmo se `concluido > total` (dado inconsistente não deve estourar a barra visualmente).

- [ ] **Step 1: Escrever o teste (vai falhar — função não existe ainda)**

Em `lib/formatters.test.ts`, adicionar no fim do arquivo:

```ts
import { pctConcluido } from "@/lib/formatters";

describe("pctConcluido", () => {
  it("calcula percentual arredondado", () => {
    expect(pctConcluido(5, 10)).toBe(50);
    expect(pctConcluido(1, 3)).toBe(33);
  });
  it("total zero ou negativo retorna 0 (evita NaN/Infinity)", () => {
    expect(pctConcluido(5, 0)).toBe(0);
    expect(pctConcluido(0, 0)).toBe(0);
    expect(pctConcluido(5, -1)).toBe(0);
  });
  it("nunca passa de 100, mesmo com dado inconsistente", () => {
    expect(pctConcluido(15, 10)).toBe(100);
  });
});
```

(o import de `pctConcluido` some da linha 2 existente — ajustar a linha 2 do arquivo, que já importa várias funções de `@/lib/formatters`, acrescentando `pctConcluido` na lista em vez de duplicar o import.)

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/formatters.test.ts`
Expected: FAIL — `pctConcluido is not a function` (ou erro de import).

- [ ] **Step 3: Implementar a função**

Em `lib/formatters.ts`, adicionar no fim do arquivo:

```ts
/** Percentual concluído (0–100), sem NaN/Infinity quando total <= 0 */
export function pctConcluido(concluido: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((concluido / total) * 100));
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/formatters.test.ts`
Expected: PASS — 3 novos testes + os já existentes do arquivo.

- [ ] **Step 5: Rodar a suite inteira**

Run: `npx vitest run`
Expected: 202 testes passando (199 + 3 novos).

- [ ] **Step 6: Commit**

```bash
git add lib/formatters.ts lib/formatters.test.ts
git commit -m "feat: adiciona pctConcluido (helper puro pra barra de progresso do resumo de vidros)"
```

---

### Task 9: Tela de Pedido — Faixa de indicadores (Visão Geral)

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:895-906` (substitui a segunda barra `.tb`)

**Interfaces:**
- Consumes: `MetricCard` (`components/ui/MetricCard.tsx`, já existe — `{ label, value, valueColor?, variant? }`).
- Produces: nenhuma interface nova (é o fim da cadeia de consumo desta task).

- [ ] **Step 1: Importar `MetricCard` no topo do arquivo**

Em `app/pedidos/[id]/page.tsx`, junto aos demais imports de componentes (perto da linha 21, depois de `CurrencyInput`):

```tsx
import MetricCard from "@/components/ui/MetricCard";
```

- [ ] **Step 2: Substituir a segunda barra `.tb` (linhas 895-906) pela faixa de indicadores**

Trocar o bloco:

```tsx
        <div className="tb no-print" style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center", paddingTop:"18px", paddingBottom:"18px", rowGap:"10px", background:"var(--surf2)" }}>
          <div style={{ fontSize:"16px", color:"var(--t1)", fontWeight:800 }}>{pedido.clientes?.nome ?? "—"}</div>
          <div style={{ display:"flex", gap:"18px", fontSize:"12px", fontFamily:"'DM Mono', monospace", justifySelf:"center" }}>
            <span style={{ color:"var(--t2)" }}>Total <strong style={{ color:"var(--t1)" }}>{formatBRL(totalComIpi)}</strong></span>
            <span style={{ color:"var(--t2)" }}>Recebido <strong style={{ color: pedido.valor_recebido > 0 ? "var(--ok)" : "var(--t2)" }}>{formatBRL(pedido.valor_recebido)}</strong></span>
            <span style={{ color:"var(--t2)" }}>{quitado ? "Quitado ✓" : "Em aberto"} <strong style={{ color: quitado ? "var(--ok)" : "var(--warn)" }}>{formatBRL(Math.max(0, aberto))}</strong></span>
            {temItens && (
              <span style={{ color:"var(--t2)" }}>Retirada <strong style={{ color: totalPecasRetirado >= totalPecasPedido ? "var(--ok)" : "var(--warn)" }}>{totalPecasRetirado}/{totalPecasPedido} peças</strong></span>
            )}
          </div>
          <div />
        </div>
```

por:

```tsx
        <div className="con no-print" style={{ display:"flex", gap:"16px", flexWrap:"wrap", padding:"16px 26px", background:"var(--surf2)", borderBottom:"1px solid var(--b1)" }}>
          <MetricCard label="Pedido" value={String(pedido.id)} />
          <MetricCard label="Cliente" value={pedido.clientes?.nome ?? "—"} />
          <MetricCard label="Valor" value={formatBRL(totalComIpi)} valueColor="var(--acc)" />
          <MetricCard label="Recebido" value={formatBRL(pedido.valor_recebido)} valueColor={pedido.valor_recebido > 0 ? "var(--ok)" : undefined} />
          <MetricCard label={quitado ? "Quitado" : "Saldo"} value={formatBRL(Math.max(0, aberto))} valueColor={quitado ? "var(--ok)" : "var(--warn)"} />
          {temItens && (
            <MetricCard label="Peças" value={`${totalPecasRetirado}/${totalPecasPedido}`} valueColor="var(--acc4)" />
          )}
        </div>
```

(o card "Cliente" fica com o tamanho hero (22px) automaticamente — `.mc-value` de `MetricCard` já usa 20px por padrão, próximo o bastante do `.tx-h2`; não precisa de variante nova pra isso, ajuste fino de tamanho fica pra quando o componente for reusado em outras telas.)

- [ ] **Step 3: Verificar que `pedido.id`, `totalComIpi`, `quitado`, `aberto`, `totalPecasRetirado`, `totalPecasPedido`, `temItens` continuam usados (nenhum ficou órfão)**

Run: `npx tsc --noEmit`
Expected: limpo — se sobrar alguma variável não usada (ex. `temItens` só era usado aqui), o TypeScript com `noUnusedLocals` acusaria; conferir o `tsconfig.json` antes de assumir erro como bug (essas variáveis são usadas em outros pontos do arquivo, então não devem sobrar órfãs).

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run`
Expected: 202 testes passando (rota de Pedido não tem teste dedicado — mudança 100% visual).

- [ ] **Step 5: `next build` (confere que a rota compila)**

Run: `npx next build`
Expected: build conclui sem erro, rota `/pedidos/[id]` lista normalmente no output.

- [ ] **Step 6: Commit**

```bash
git add app/pedidos/\[id\]/page.tsx
git commit -m "feat: faixa de indicadores (Visao Geral do Pedido) substitui a barra de texto corrido"
```

---

### Task 10: Tela de Pedido — Ícone + contador nos 3 acordeões

**Files:**
- Modify: `app/pedidos/[id]/page.tsx` — novo const `PEDIDO_IC` (perto de `CHIP`, linha ~41), e os 3 headers de acordeão (Informações+Financeiro ~1030-1034, Itens ~1379-1384, Documentos ~1422-1426)

**Interfaces:**
- Consumes: `Icon` de `components/ui/Icon.tsx` (Task 1).
- Produces: `PEDIDO_IC` (objeto local, chaves `documento`/`caixa`/`clipe` nesta task; outras tasks acrescentam chaves ao mesmo objeto).

- [ ] **Step 1: Importar `Icon` e criar `PEDIDO_IC` com os 3 ícones dos acordeões**

Em `app/pedidos/[id]/page.tsx`, adicionar o import (junto aos demais componentes, perto da linha 21):

```tsx
import Icon from "@/components/ui/Icon";
```

Logo depois da constante `CHIP` (linha ~51, antes da declaração de `TIPOS_NC` ou logo após `CHIP`), adicionar:

```tsx
const PEDIDO_IC = {
  documento: ["M10 1.5H3.5a.5.5 0 00-.5.5v12a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V5.5L10 1.5z", "M10 1.5v4h4", "M5.5 8h5", "M5.5 10.5h5", "M5.5 13h2.5"],
  caixa:     ["M2 2h4v4H2z", "M10 2h4v4h-4z", "M2 10h4v4H2z", "M10 10h4v4h-4z"],
  clipe:     ["M5 9V4.8a2.3 2.3 0 114.6 0v6.4a3.8 3.8 0 11-7.6 0V6"],
};
```

- [ ] **Step 2: Adicionar o ícone + badge de contador no header "Informações do Pedido e Financeiro"**

Em `app/pedidos/[id]/page.tsx:1031-1033`, trocar:

```tsx
            <button style={{ width:"100%", display:"flex", alignItems:"center", gap:"8px", marginBottom: abrirInformacoes ? "16px" : 0, background:"none", border:"none", cursor:"pointer", padding:0 }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>INFORMAÇÕES DO PEDIDO E FINANCEIRO</div>
              <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirInformacoes ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
            </button>
```

por:

```tsx
            <button style={{ width:"100%", display:"flex", alignItems:"center", gap:"8px", marginBottom: abrirInformacoes ? "16px" : 0, background:"none", border:"none", cursor:"pointer", padding:0, color:"var(--t3)" }}>
              <Icon d={PEDIDO_IC.documento} size={15} />
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>INFORMAÇÕES DO PEDIDO E FINANCEIRO</div>
              <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirInformacoes ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s", marginLeft:"auto" }}>▾</span>
            </button>
```

- [ ] **Step 3: Adicionar ícone + badge de contador no header "Itens do Pedido"**

Em `app/pedidos/[id]/page.tsx:1381-1384`, trocar:

```tsx
              <button style={{ display:"flex", alignItems:"center", gap:"10px", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ITENS DO PEDIDO ({pedido.itens_pedido?.length ?? 0})</div>
                <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirItens ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
              </button>
```

por:

```tsx
              <button style={{ display:"flex", alignItems:"center", gap:"10px", background:"none", border:"none", cursor:"pointer", padding:0, color:"var(--t3)" }}>
                <Icon d={PEDIDO_IC.caixa} size={15} />
                <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ITENS DO PEDIDO</div>
                <span className="nbdg blue">{pedido.itens_pedido?.length ?? 0}</span>
                <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirItens ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
              </button>
```

(o contador sai de dentro do título — "(N)" — e vira um badge próprio, reaproveitando a classe `.nbdg blue` que já existe em `globals.css:161-171` pra outros badges do app.)

- [ ] **Step 4: Adicionar ícone no header "Documentos"**

Em `app/pedidos/[id]/page.tsx:1423-1425`, trocar:

```tsx
            <button style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>DOCUMENTOS</div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirDocumentos ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
```

por:

```tsx
            <button style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px", color:"var(--t3)" }}>
                <Icon d={PEDIDO_IC.clipe} size={15} />
                <div style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>DOCUMENTOS</div>
              </div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirDocumentos ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 202 testes passando.

- [ ] **Step 6: Commit**

```bash
git add app/pedidos/\[id\]/page.tsx
git commit -m "feat: acordeoes (Informacoes+Financeiro, Itens, Documentos) ganham icone e contador no header"
```

---

### Task 11: Tela de Pedido — Timeline de produção compacta + ícones

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:85-91` (nova função `dataEtapa`, ao lado de `duracaoEtapa`)
- Modify: `app/pedidos/[id]/page.tsx` — `PEDIDO_IC` (acrescenta 7 chaves)
- Modify: `app/pedidos/[id]/page.tsx:910-943` (bloco "Progresso")
- Modify: `app/globals.css` — novo par de classes utilitárias `.tt-wrap`/`.tt-pop`

**Interfaces:**
- Consumes: `PEDIDO_IC` (Task 10), `duracaoEtapa` (já existe, linha 85).
- Produces: `dataEtapa(history, step): string | null` — data formatada (`formatDate`) de quando a etapa começou, ou `null` se a etapa ainda não foi alcançada.

- [ ] **Step 1: Adicionar `.tt-wrap`/`.tt-pop` em `app/globals.css` (tooltip genérico, reusável em qualquer tela)**

No fim de `app/globals.css`:

```css
/* ─── TOOLTIP GENÉRICO (hover) ───────────────────────────────
   Mesmo padrão visual do tooltip da Sidebar (.ni[data-tip]),
   só que como par de classes reutilizável em qualquer tela. */
.tt-wrap { position: relative; display: inline-flex; }
.tt-pop {
  position: absolute; bottom: 100%; left: 50%;
  transform: translateX(-50%) translateY(-4px);
  background: var(--t1); color: var(--surf);
  font-size: 11px; padding: 5px 9px; border-radius: 6px;
  white-space: nowrap; opacity: 0; pointer-events: none;
  transition: opacity .2s; z-index: 20;
  font-family: 'Inter', sans-serif;
}
.tt-wrap:hover .tt-pop { opacity: 1; }
```

- [ ] **Step 2: Adicionar `dataEtapa`, ao lado de `duracaoEtapa` em `app/pedidos/[id]/page.tsx`**

Logo depois da função `duracaoEtapa` (linha 91), antes de `addMeses`:

```tsx
function dataEtapa(history: { status: string; desde: string }[], step: string): string | null {
  const found = history.find(h => h.status === step);
  return found ? formatDate(found.desde) : null;
}
```

- [ ] **Step 3: Acrescentar os 7 ícones de etapa em `PEDIDO_IC`**

Em `PEDIDO_IC` (criado na Task 10), acrescentar as chaves:

```tsx
const PEDIDO_IC = {
  documento: ["M10 1.5H3.5a.5.5 0 00-.5.5v12a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V5.5L10 1.5z", "M10 1.5v4h4", "M5.5 8h5", "M5.5 10.5h5", "M5.5 13h2.5"],
  caixa:     ["M2 2h4v4H2z", "M10 2h4v4h-4z", "M2 10h4v4H2z", "M10 10h4v4h-4z"],
  clipe:     ["M5 9V4.8a2.3 2.3 0 114.6 0v6.4a3.8 3.8 0 11-7.6 0V6"],
  otimizacao:["M5.5 3.5a2 2 0 100 3 2 2 0 000-3z", "M5.5 9.5a2 2 0 100 3 2 2 0 000-3z", "M7.5 5l7 6", "M7.5 11l7-6"],
  corte:     ["M3.5 3.5l9 9", "M12.5 3.5l-9 9", "M3.5 3.5a1 1 0 102 0 1 1 0 00-2 0z", "M3.5 12.5a1 1 0 102 0 1 1 0 00-2 0z"],
  qualidade: ["M8 1.5L2 4.5v4c0 3 2.5 5.5 6 6 3.5-.5 6-3 6-6v-4L8 1.5z", "M5.5 8l2 2 3-3"],
  lapidacao: ["M8 1.5l1 4 4 1-4 1-1 4-1-4-4-1 4-1 1-4z"],
  separacao: ["M2 8h4.5", "M4.5 5.5L2 8l2.5 2.5", "M14 8H9.5", "M11.5 5.5L14 8l-2.5 2.5"],
  finalizado:["M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z", "M5.2 8.2l2 2 3.6-4"],
  entregue:  ["M1.5 4.5h7v6h-7z", "M8.5 7h3l2 2.5v1.5h-5z", "M4 13a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6z", "M11.5 13a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6z"],
  olho:      ["M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z", "M8 6.3a1.7 1.7 0 100 3.4 1.7 1.7 0 000-3.4z"],
  etiqueta:  ["M2 2h6l6 6-6 6-6-6z", "M5.5 5.5a1.1 1.1 0 102.2 0 1.1 1.1 0 00-2.2 0z"],
};

const ETAPA_IC: Record<string, string | string[]> = {
  "Aguardando otimização":   PEDIDO_IC.otimizacao,
  "Em Produção – Corte":     PEDIDO_IC.corte,
  "Qualidade (Corte)":       PEDIDO_IC.qualidade,
  "Em Produção – Lapidação": PEDIDO_IC.lapidacao,
  "Qualidade (Lapidação)":   PEDIDO_IC.qualidade,
  "Separação":               PEDIDO_IC.separacao,
  "Finalizado":              PEDIDO_IC.finalizado,
  "Entregue":                PEDIDO_IC.entregue,
};
```

(`olho`/`etiqueta` são usados na Task 12, não nesta.)

- [ ] **Step 4: Comprimir e adicionar ícone no bloco "Progresso" (linhas 910-943)**

Trocar o card inteiro:

```tsx
          {/* Progresso */}
          <div className="card" style={{ padding:"20px 24px" }}>
            {(() => {
              const history = (pedido.status_history ?? []) as { status: string; desde: string }[];
              return (
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"center", width:"100%" }}>
                  {FLUXO.map((step, i) => {
                    const done    = i < statusIdx;
                    const current = i === statusIdx;
                    const last    = i === FLUXO.length - 1;
                    const dur     = duracaoEtapa(history, step);
                    return (
                      <div key={step} style={{ display:"flex", alignItems:"flex-start", flex: last ? "0 0 auto" : "1 1 0", minWidth:0 }}>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"5px", width:"84px", flexShrink:0 }}>
                          <div style={{ width:"26px", height:"26px", borderRadius:"50%", background: done ? "var(--ok)" : current ? "var(--acc)" : "var(--surf3)", border: current ? "2px solid var(--acc)" : "2px solid transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontWeight:700, color: done || current ? "#000" : "var(--t3)", flexShrink:0 }}>
                            {done ? "✓" : i + 1}
                          </div>
                          <div style={{ fontSize:"9px", textAlign:"center", lineHeight:1.3, color: current ? "var(--acc)" : done ? "var(--ok)" : "var(--t3)", fontWeight: current ? 700 : 500, fontFamily:"'DM Mono', monospace", wordBreak:"break-word" }}>
                            {step}
                          </div>
                          {dur && (
                            <div style={{ fontSize:"8px", color: current ? "var(--acc)" : "var(--t3)", fontFamily:"'DM Mono', monospace", background: current ? "rgba(99,102,241,.1)" : "var(--surf3)", borderRadius:"4px", padding:"1px 5px", whiteSpace:"nowrap" }}>
                              {current ? "⏱ " : ""}{dur}
                            </div>
                          )}
                        </div>
                        {!last && <div style={{ flex:"1 1 auto", height:"2px", marginTop:"12px", background: done ? "var(--ok)" : "var(--surf3)", minWidth:"8px", transition:"background 0.2s" }} />}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
```

por:

```tsx
          {/* Progresso */}
          <div className="card" style={{ padding:"16px 24px" }}>
            {(() => {
              const history = (pedido.status_history ?? []) as { status: string; desde: string }[];
              return (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:"100%" }}>
                  {FLUXO.map((step, i) => {
                    const done    = i < statusIdx;
                    const current = i === statusIdx;
                    const last    = i === FLUXO.length - 1;
                    const dur     = duracaoEtapa(history, step);
                    const dataIni = dataEtapa(history, step);
                    return (
                      <div key={step} style={{ display:"flex", alignItems:"center", flex: last ? "0 0 auto" : "1 1 0", minWidth:0 }}>
                        <div className="tt-wrap" style={{ flexDirection:"column", alignItems:"center", gap:"4px", width:"76px", flexShrink:0 }}>
                          <div style={{ width:"28px", height:"28px", borderRadius:"50%", background: done ? "var(--ok)" : current ? "var(--acc)" : "var(--surf3)", border: current ? "2px solid var(--acc)" : "2px solid transparent", display:"flex", alignItems:"center", justifyContent:"center", color: done || current ? "#fff" : "var(--t3)", flexShrink:0, transition:"background 0.2s, border-color 0.2s" }}>
                            <Icon d={ETAPA_IC[step] ?? PEDIDO_IC.otimizacao} size={14} />
                          </div>
                          <div className="tx-aux" style={{ textAlign:"center", lineHeight:1.25, color: current ? "var(--acc)" : done ? "var(--ok)" : "var(--t3)", fontWeight: current ? 700 : 500, wordBreak:"break-word" }}>
                            {step}
                          </div>
                          {(dataIni || dur) && (
                            <div className="tt-pop">
                              {dataIni ?? "—"}{dur ? ` · ${dur}` : ""}
                            </div>
                          )}
                        </div>
                        {!last && <div style={{ flex:"1 1 auto", height:"2px", marginTop:"14px", background: done ? "var(--ok)" : "var(--surf3)", minWidth:"8px", transition:"background 0.2s" }} />}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
```

(altura do card cai de `20px 24px` de padding + círculo 26px + 2 linhas de texto + badge sempre visível, pra `16px 24px` + círculo 28px + 1 linha de texto + tooltip só on-hover — a redução real de altura fica em torno de 35-40%, consistente com o pedido do brief. "Responsável" por etapa não entra, conforme combinado no spec.)

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo (conferir que `ETAPA_IC[step]` tipa certo contra `PEDIDO_IC`'s union de `string | string[]`).
Run: `npx vitest run` — Expected: 202 testes passando.
Run: `npx next build` — Expected: compila.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/pedidos/\[id\]/page.tsx
git commit -m "feat: timeline de producao fica mais compacta, ganha icone por etapa e tooltip com data/duracao"
```

---

### Task 12: Tela de Pedido — Card premium do Plano de Corte

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:975-993` (bloco "Plano de Corte")

**Interfaces:**
- Consumes: `PEDIDO_IC.olho`/`PEDIDO_IC.etiqueta` (Task 11), `ultimaOtim.retalhos_gerados` (campo já existe em `HistoricoOtimizador`, `types/index.ts:677`).

- [ ] **Step 1: Substituir a faixa horizontal por um card premium com 4 métricas**

Trocar o bloco:

```tsx
          {temOtimizacao && ultimaOtim && (
            <div style={{ background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.3)", borderRadius:"10px", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
              <div style={{ display:"flex", gap:"24px", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"2px" }}>PLANO DE CORTE</div>
                  <div style={{ fontSize:"13px", color:"var(--ok)", fontWeight:700 }}>✓ Otimização gerada</div>
                </div>
                <div style={{ fontSize:"12px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", display:"flex", gap:"16px" }}>
                  <span>Aproveitamento: <strong style={{ color:"var(--ok)" }}>{ultimaOtim.aproveitamento}%</strong></span>
                  <span>Chapas: <strong style={{ color:"var(--t1)" }}>{ultimaOtim.chapas_usadas}</strong></span>
                  <span>Data: <strong style={{ color:"var(--t1)" }}>{formatDate(ultimaOtim.dt_otim)}</strong></span>
                </div>
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <a href={"/pedidos/" + pedido.id + "/plano"} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>◈ Ver Plano</a>
                <a href={"/pedidos/" + pedido.id + "/etiquetas"} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>🏷 Etiquetas</a>
              </div>
            </div>
          )}
```

por:

```tsx
          {temOtimizacao && ultimaOtim && (
            <div className="card" style={{ padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"16px", flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:"32px", alignItems:"center", flexWrap:"wrap" }}>
                <div>
                  <div className="tx-sub" style={{ marginBottom:"2px" }}>Plano de Corte</div>
                  <div style={{ fontSize:"13px", color:"var(--ok)", fontWeight:600 }}>✓ Otimização concluída</div>
                </div>
                <div className="met">
                  <div className="met-l">Aproveitamento</div>
                  <div className="met-v" style={{ color:"var(--ok)" }}>{ultimaOtim.aproveitamento}%</div>
                </div>
                <div className="met">
                  <div className="met-l">Chapas</div>
                  <div className="met-v">{ultimaOtim.chapas_usadas}</div>
                </div>
                <div className="met">
                  <div className="met-l">Retalhos</div>
                  <div className="met-v">{ultimaOtim.retalhos_gerados}</div>
                </div>
                <div className="met">
                  <div className="met-l">Data</div>
                  <div className="met-v">{formatDate(ultimaOtim.dt_otim)}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <a href={"/pedidos/" + pedido.id + "/plano"} className="btn bp sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}><Icon d={PEDIDO_IC.olho} size={13} /> Visualizar Plano</a>
                <a href={"/pedidos/" + pedido.id + "/etiquetas"} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}><Icon d={PEDIDO_IC.etiqueta} size={13} /> Etiquetas</a>
              </div>
            </div>
          )}
```

(`.met`/`.met-l`/`.met-v` já existem em `globals.css:514-516` — reaproveitados em vez de criar classes novas. "Visualizar Plano" vira o botão primário (`.bp`, azul) por ser a ação de destaque pedida no brief; "Etiquetas" continua secundário.)

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 202 testes passando.
Run: `npx next build` — Expected: compila.

- [ ] **Step 3: Commit**

```bash
git add app/pedidos/\[id\]/page.tsx
git commit -m "feat: Plano de Corte vira card premium com 4 metricas (aproveitamento/chapas/retalhos/data)"
```

---

### Task 13: Tela de Pedido — Barra de progresso no Resumo de Vidros

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:995-1027` (tabela "Resumo por Vidro — Retirada")

**Interfaces:**
- Consumes: `pctConcluido` (Task 8, `lib/formatters.ts`), classes `.prg`/`.prg-f` (já existem em `globals.css:672-673`).

- [ ] **Step 1: Importar `pctConcluido`**

Em `app/pedidos/[id]/page.tsx:12`, o import de `lib/formatters` já existe — acrescentar `pctConcluido` na lista:

```tsx
import { formatBRL, formatDate, formatDuracao, formatM2, medidaReal, pctConcluido } from "@/lib/formatters";
```

- [ ] **Step 2: Adicionar coluna "Progresso" com barra**

Em `app/pedidos/[id]/page.tsx:1000-1021`, trocar:

```tsx
                <table>
                  <thead>
                    <tr>
                      <th>Vidro</th>
                      <th>m² Total</th>
                      <th>Vidros Total</th>
                      <th>m² Retirado</th>
                      <th>Vidros Retirado</th>
                      <th>m² Pendente</th>
                      <th>Vidros Pendente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoRetiradaPorProduto.map(r => (
                      <tr key={r.produto_nome}>
                        <td style={{ fontWeight: 600 }}>{r.produto_nome}</td>
                        <td className="mono">{formatM2(r.m2Total)}</td>
                        <td className="mono">{r.qtdTotal}</td>
                        <td className="mono" style={{ color: "var(--ok)" }}>{formatM2(r.m2Retirado)}</td>
                        <td className="mono" style={{ color: "var(--ok)" }}>{r.qtdRetirada}</td>
                        <td className="mono" style={{ color: r.m2Pendente > 0 ? "var(--warn)" : "var(--ok)" }}>{formatM2(r.m2Pendente)}</td>
                        <td className="mono" style={{ color: r.qtdPendente > 0 ? "var(--warn)" : "var(--ok)" }}>{r.qtdPendente}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
```

por:

```tsx
                <table>
                  <thead>
                    <tr>
                      <th>Vidro</th>
                      <th>Progresso</th>
                      <th>m² Total</th>
                      <th>Vidros Total</th>
                      <th>m² Retirado</th>
                      <th>Vidros Retirado</th>
                      <th>m² Pendente</th>
                      <th>Vidros Pendente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoRetiradaPorProduto.map(r => {
                      const pct = pctConcluido(r.qtdRetirada, r.qtdTotal);
                      return (
                      <tr key={r.produto_nome}>
                        <td style={{ fontWeight: 600 }}>{r.produto_nome}</td>
                        <td style={{ minWidth:"120px" }}>
                          <div className="prg" style={{ height:"6px", marginBottom:"3px" }}>
                            <div className="prg-f" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--ok)" : "var(--acc)" }} />
                          </div>
                          <span className="tx-aux">{pct}%</span>
                        </td>
                        <td className="mono">{formatM2(r.m2Total)}</td>
                        <td className="mono">{r.qtdTotal}</td>
                        <td className="mono" style={{ color: "var(--ok)" }}>{formatM2(r.m2Retirado)}</td>
                        <td className="mono" style={{ color: "var(--ok)" }}>{r.qtdRetirada}</td>
                        <td className="mono" style={{ color: r.m2Pendente > 0 ? "var(--warn)" : "var(--ok)" }}>{formatM2(r.m2Pendente)}</td>
                        <td className="mono" style={{ color: r.qtdPendente > 0 ? "var(--warn)" : "var(--ok)" }}>{r.qtdPendente}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
```

(`pct` usa quantidade de vidros retirados/total, não m² — é a mesma unidade que já aparece nas outras colunas de contagem; `.prg`/`.prg-f` já existem prontas em `globals.css`, só precisam de `height`/`width`/`background` inline por instância, igual a outros usos no app.)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` — Expected: limpo.
Run: `npx vitest run` — Expected: 202 testes passando.
Run: `npx next build` — Expected: compila.

- [ ] **Step 4: Commit**

```bash
git add app/pedidos/\[id\]/page.tsx
git commit -m "feat: Resumo por Vidro ganha coluna de progresso visual (barra), mantem numeros exatos"
```

---

### Task 14: Verificação final e checklist manual

**Files:** nenhum (task só de verificação).

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: limpo, zero erros.

- [ ] **Step 2: Suite de testes completa**

Run: `npx vitest run`
Expected: todos os testes passando (199 originais + 3 novos de `pctConcluido` = 202).

- [ ] **Step 3: Build de produção**

Run: `npx next build`
Expected: compila sem erro; a rota `/pedidos/[id]` aparece no output.

- [ ] **Step 4: Checklist manual no navegador (tema claro)**

Abrir `/pedidos/[id]` de um pedido real com otimização gerada e itens registrados, com o toggle de tema em "claro", e conferir:

- [ ] Sidebar aparece escura (slate `#1E293B`), ícones maiores, hover/item ativo em azul.
- [ ] Faixa de indicadores (Pedido/Cliente/Valor/Recebido/Saldo/Peças) aparece logo abaixo do topo, com as cores certas (azul/verde/laranja-ou-verde/roxo).
- [ ] Timeline de produção está visivelmente mais baixa que antes, cada etapa com ícone, e passar o mouse sobre uma etapa mostra data/duração em tooltip.
- [ ] Card "Plano de Corte" aparece como card com 4 métricas (Aproveitamento/Chapas/Retalhos/Data) e botão "Visualizar Plano" em azul de destaque.
- [ ] Tabela "Resumo por Vidro" tem a coluna de barra de progresso, e os números continuam batendo com antes.
- [ ] Os 3 acordeões (Informações+Financeiro, Itens, Documentos) mostram ícone antes do título; "Itens" mostra o contador como badge separado.
- [ ] Nenhum dado sumiu ou mudou de valor comparado à versão anterior (é redesign visual, não mudança de cálculo).
- [ ] Alternar pro tema escuro e conferir que nada mudou nele (sidebar continua com a cor de sempre, cores gerais intactas).

- [ ] **Step 5: Commit final (se sobrar algum ajuste do checklist manual)**

Se o checklist manual encontrar qualquer ajuste necessário, fazer o ajuste pontual e commitar separadamente, descrevendo o que foi corrigido. Se tudo passar, nenhum commit adicional é necessário aqui.
