# Acessibilidade — htmlFor em Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 4 é intencionalmente NÃO detalhada campo a campo** (361 ocorrências) — mesmo motivo documentado na Task 3 do plano do Modal compartilhado: congelar 361 diffs aqui arriscaria ficar desatualizado no momento de executar. Lida com a receita da Task 3 (estabelecida com exemplos reais) + leitura ao vivo de cada arquivo.

**Goal:** Todo campo de formulário do sistema ganha `id`/`htmlFor` associando label e input — sem mudar nenhuma aparência visual.

**Architecture:** Um componente novo `components/ui/Campo.tsx` (usa `React.useId()` pra gerar um id único e estável por instância, resolvendo de graça o risco de colisão em campos reusados em lista) substitui o padrão `<div className="fg"><label className="fl">...</label>...</div>` cru nos 33 arquivos que o usam. 3 componentes de input customizado ganham suporte a `id`. Os 3 arquivos com `Campo` local ganham `htmlFor` na própria função, sem trocar de componente.

**Tech Stack:** Next.js/TypeScript, React `useId()`.

## Global Constraints

- Zero mudança visual — só a associação label/input.
- Não forçar `htmlFor` nos poucos casos onde o filho direto do `.fg` não é o campo em si (ex.: `<div>` de posicionamento em volta do input) — deixar sem, não reestruturar o JSX pra caber.
- Spec de referência: `docs/superpowers/specs/2026-07-13-acessibilidade-htmlfor-design.md`.

---

### Task 1: Componente `Campo`

**Files:**
- Create: `components/ui/Campo.tsx`

**Interfaces:**
- Produces: `Campo({ label, children, span2?, style? })` — usado pela Task 3.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { useId, cloneElement, isValidElement, type ReactElement, type CSSProperties } from "react";

interface CampoProps {
  label: string;
  children: ReactElement;
  span2?: boolean;
  style?: CSSProperties;
}

export function Campo({ label, children, span2, style }: CampoProps) {
  const id = useId();
  const campo = isValidElement(children) ? cloneElement(children, { id } as Record<string, unknown>) : children;
  return (
    <div className="fg" style={{ gridColumn: span2 ? "1 / -1" : undefined, ...style }}>
      <label className="fl" htmlFor={id}>{label}</label>
      {campo}
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros (arquivo novo isolado).

- [ ] **Step 3: Commit**

```bash
git add components/ui/Campo.tsx
git commit -m "feat(ui): adiciona componente Campo com htmlFor/id automatico via useId"
```

---

### Task 2: Componentes de input customizado ganham `id`

**Files:**
- Modify: `components/ui/CurrencyInput.tsx`
- Modify: `components/ui/DateInput.tsx`
- Modify: `components/ui/AutocompleteInput.tsx`

**Interfaces:**
- Produces: prop `id?: string` em cada um, repassada pro `<input>` interno. Task 4 depende disso pra `Campo` funcionar em campos que usam esses componentes.

- [ ] **Step 1: Ler cada arquivo e localizar a interface de props + o `<input>` interno**

- [ ] **Step 2: Adicionar `id?: string` na interface de props de cada um, e `id={id}` no `<input>` interno correspondente** (sem mudar mais nada — mudança aditiva).

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add components/ui/CurrencyInput.tsx components/ui/DateInput.tsx components/ui/AutocompleteInput.tsx
git commit -m "feat(ui): adiciona suporte a prop id em CurrencyInput/DateInput/AutocompleteInput"
```

---

### Task 3: Os 3 arquivos com `Campo` local ganham htmlFor

**Files:**
- Modify: `app/bancos-caixa/page.tsx`
- Modify: `app/fornecedores/page.tsx`
- Modify: `app/recorrencias/page.tsx`

**Interfaces:**
- Produces: nenhuma nova — a função `Campo` local de cada arquivo (usada só internamente) ganha `htmlFor`/`id`.

- [ ] **Step 1: Em cada arquivo, localizar a função `Campo` local** (formato hoje, confirmar antes de editar):

```tsx
function Campo({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: span2 ? "1 / -1" : undefined }}>
      <label style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Trocar por (adiciona `useId` + `htmlFor`/`id`, mesmo estilo visual)**

```tsx
function Campo({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactElement }) {
  const id = useId();
  const campo = isValidElement(children) ? cloneElement(children, { id } as Record<string, unknown>) : children;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: span2 ? "1 / -1" : undefined }}>
      <label style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 600 }} htmlFor={id}>{label}</label>
      {campo}
    </div>
  );
}
```

Adicionar o import necessário no topo do arquivo: `import { useId, cloneElement, isValidElement } from "react";` (mesclar com o import de `react` já existente no arquivo, não duplicar).

- [ ] **Step 3: Rodar typecheck após os 3 arquivos**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add app/bancos-caixa/page.tsx app/fornecedores/page.tsx app/recorrencias/page.tsx
git commit -m "fix(a11y): adiciona htmlFor/id ao componente Campo local (bancos-caixa, fornecedores, recorrencias)"
```

---

### Task 4: Migrar os 33 arquivos com `.fg`/`.fl` cru

**Por que esta task não lista os 361 campos individualmente**: mesmo raciocínio já usado na Task 3 do plano do Modal compartilhado — congelar aqui o antes/depois de cada um dos 361 arriscaria ficar desatualizado no momento de executar. Executada inline, na mesma sessão que escreveu este plano, lendo cada arquivo imediatamente antes de editar.

**Files (todos em `Modify`, um por vez, cada um vira 1+ commits):**
`app/clientes/page.tsx`, `app/conciliacao/page.tsx`, `app/contabilidade/ativo-imobilizado/page.tsx`, `app/contabilidade/cartoes/page.tsx`, `app/contabilidade/checklist/page.tsx`, `app/contabilidade/consorcios/page.tsx`, `app/contabilidade/documentos/page.tsx`, `app/contabilidade/emprestimos/page.tsx`, `app/contabilidade/estoque/page.tsx`, `app/contabilidade/fiscal-produtos/page.tsx`, `app/contas-pagar/page.tsx`, `app/contas-receber/page.tsx`, `app/formas-pagamento/page.tsx`, `app/logs/page.tsx`, `app/notas/nova/page.tsx`, `app/orcamentos/novo/page.tsx`, `app/otimizador/page.tsx`, `app/pedidos/novo/page.tsx`, `app/pedidos/[id]/editar/page.tsx`, `app/pedidos/[id]/page.tsx`, `app/pedidos/[id]/retiradas/page.tsx`, `app/plano-contas/page.tsx`, `app/produtos/page.tsx`, `app/programacao/page.tsx`, `app/qualidade/nao-conformidades/page.tsx`, `app/qualidade/quebras/page.tsx`, `app/qualidade/retrabalhos/page.tsx`, `app/vendedores/page.tsx`, `components/produtos/ModalClassificacaoFiscal.tsx`, `components/ui/DatePromptModal.tsx`, `components/ui/ImportarMedidasModal.tsx`, `components/ui/ImportarPdfModal.tsx`, `components/ui/ImportarRetalhosModal.tsx`.

**Interfaces:**
- Consumes: `Campo` (Task 1), `id` em `CurrencyInput`/`DateInput`/`AutocompleteInput` (Task 2).

**Receita a aplicar em CADA bloco `.fg` de CADA arquivo acima:**

- [ ] **Passo A: Ler o arquivo** e localizar cada `<div className="fg"[ style={{...}}]?><label className="fl">Texto[ *]?</label> CAMPO [conteúdo extra]? </div>`.
- [ ] **Passo B: Trocar** por `<Campo label="Texto[ *]?"[ span2][ style={{...}}]>CAMPO[ conteúdo extra]?</Campo>` — `span2` quando o `.fg` original tinha `gridColumn:"1 / -1"` (direto ou via classe que já cubra 2 colunas); `style` só com o que sobrar do `style` original além de `gridColumn` (que o `Campo` já assume). CAMPO e conteúdo extra colados sem alteração de lógica.
- [ ] **Passo C: Importar `Campo`** (`import { Campo } from "@/components/ui/Campo";`) — **se o arquivo já tem uma função local `Campo` própria** (ex.: pode ter sobrado alguma além das 3 da Task 3 — conferir), NÃO duplicar: nesse caso aplicar a mesma correção da Task 3 na função local em vez de importar a nova.
- [ ] **Passo D: Repetir A-C pra cada bloco `.fg` do mesmo arquivo** antes de passar pro próximo.
- [ ] **Passo E: Rodar typecheck só deste arquivo** — `npx tsc --noEmit`. Se aparecer erro fora do arquivo que acabou de mexer, parar e investigar antes de continuar.

Expected: PASS depois de cada arquivo, sem erros novos.

- [ ] **Passo F: Commit por arquivo**

```bash
git add <arquivo>
git commit -m "fix(a11y): adiciona htmlFor/id nos campos de <nome-da-tela>"
```

- [ ] **Step final da Task 4: Build completo + grep de confirmação**

Run: `npm run build`
Expected: build limpo.

Run: `grep -rn 'className="fg"><label className="fl"' app components --include="*.tsx"` (ou variação — objetivo é achar `.fg` que sobrou sem virar `Campo`)
Expected: idealmente zero, ou só os casos documentados como exceção aceita (filho direto não é o campo em si).

---

### Task 5: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário**

Sem leitor de tela disponível pra testar de verdade nesta sessão. Pedir pro usuário: abrir algumas telas com formulário grande (Pedidos, Produtos, Contas a Pagar) e confirmar visualmente que nada mudou de aparência — a mudança é só no HTML gerado (inspecionar via DevTools, `label[for]` batendo com o `id` do campo, se quiser confirmar tecnicamente).

Isso encerra o sub-projeto 4 de 7 (Acessibilidade). Próximo da fila: Cotação de compras (módulo novo, vai exigir brainstorm do zero).
