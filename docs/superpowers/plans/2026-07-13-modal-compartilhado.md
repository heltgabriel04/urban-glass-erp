# Modal Compartilhado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 3 is intentionally NOT written as 26 fully-spelled-out sub-tasks** — see the note at the top of Task 3 for why, and read it before starting that task.

**Goal:** Extrair a moldura de modal duplicada (52 instâncias, 28 arquivos) num componente `<Modal>` compartilhado, sem mudar aparência nem comportamento de corpo/footer.

**Architecture:** Um componente novo `components/ui/Modal.tsx` (moldura `mov`/`mod`/`mhd`/`mtit`/`mcl` + backdrop-click + Esc-to-close). Cada um dos 28 arquivos troca seu wrapper manual pelo componente, mantendo o corpo/footer (JSX de campos e botões) idêntico ao que já tem hoje.

**Tech Stack:** Next.js (App Router), TypeScript, CSS global existente (`app/globals.css`), sem framework de teste automatizado nessas telas (padrão do repo).

## Global Constraints

- Largura de cada modal preservada exatamente como está hoje (sem sistema sm/md/lg).
- Corpo e footer de cada modal não mudam — só a moldura em volta.
- `useEscToClose` fica embutido no `Modal` — remover a chamada manual em arquivos que já tinham (evitar duplicar).
- Não mexer no CSS global (`.mov`/`.mod`/`.mhd`/`.mtit`/`.mcl` continuam como estão).
- Spec de referência: `docs/superpowers/specs/2026-07-13-modal-compartilhado-design.md`.

---

### Task 1: Componente `Modal`

**Files:**
- Create: `components/ui/Modal.tsx`

**Interfaces:**
- Consumes: `useEscToClose(active: boolean, onClose: () => void)` de `components/ui/useEscToClose.ts` (já existe, assinatura confirmada pelo uso em `components/ui/confirm.tsx:38`).
- Produces: `Modal({ open, onClose, title, width, style?, children })` — usado por todas as Tasks seguintes.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { useEscToClose } from "./useEscToClose";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width: number | string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, width, style, children }: ModalProps) {
  useEscToClose(open, onClose);
  if (!open) return null;
  return (
    <div className="mov open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mod" style={{ width, ...style }}>
        <div className="mhd">
          <span className="mtit">{title}</span>
          <button className="mcl" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros (arquivo novo isolado, nada mais importa ele ainda).

- [ ] **Step 3: Commit**

```bash
git add components/ui/Modal.tsx
git commit -m "feat(ui): adiciona componente Modal compartilhado"
```

---

### Task 2: Migrar `confirm.tsx` e `prompt.tsx` (estabelece a receita)

**Files:**
- Modify: `components/ui/confirm.tsx`
- Modify: `components/ui/prompt.tsx`

**Interfaces:**
- Consumes: `Modal` (Task 1).
- Produces: nenhuma nova — mas o diff aqui é a receita exata que a Task 3 replica nos outros 26 arquivos (ler antes de fazer a Task 3).

- [ ] **Step 1: Ler o estado atual de `confirm.tsx`**

Conteúdo de referência (linhas 1-69, pode ter mudado — reconferir antes de editar):

```tsx
"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useEscToClose } from "./useEscToClose";

interface ConfirmOptions {
  titulo?: string;
  confirmarLabel?: string;
  cancelarLabel?: string;
  perigo?: boolean; // true = ação destrutiva (botão vermelho)
}

interface ConfirmState extends ConfirmOptions {
  mensagem: string;
  resolve: (v: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (mensagem: string, opts?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({ confirm: async () => false });

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((mensagem: string, opts?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ mensagem, resolve, ...opts });
    });
  }, []);

  function responder(v: boolean) {
    state?.resolve(v);
    setState(null);
  }

  useEscToClose(!!state, () => responder(false));

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <div
        className={`mov ${state ? "open" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) responder(false); }}
      >
        {state && (
          <div className="mod" style={{ width: 380 }}>
            <div className="mhd">
              <span className="mtit">{state.titulo ?? "Confirmar"}</span>
              <button className="mcl" aria-label="Fechar" onClick={() => responder(false)}>✕</button>
            </div>
            <p style={{ color: "var(--t2)", fontSize: "13.5px", lineHeight: 1.5, whiteSpace: "pre-line", margin: "0 0 20px" }}>
              {state.mensagem}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="btn bg sm" onClick={() => responder(false)}>
                {state.cancelarLabel ?? "Cancelar"}
              </button>
              <button className={`btn sm ${state.perigo ? "bw" : "bp"}`} onClick={() => responder(true)}>
                {state.confirmarLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}
```

- [ ] **Step 2: Reescrever `confirm.tsx` usando `Modal`**

```tsx
"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Modal } from "./Modal";

interface ConfirmOptions {
  titulo?: string;
  confirmarLabel?: string;
  cancelarLabel?: string;
  perigo?: boolean; // true = ação destrutiva (botão vermelho)
}

interface ConfirmState extends ConfirmOptions {
  mensagem: string;
  resolve: (v: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (mensagem: string, opts?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({ confirm: async () => false });

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((mensagem: string, opts?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ mensagem, resolve, ...opts });
    });
  }, []);

  function responder(v: boolean) {
    state?.resolve(v);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal open={!!state} onClose={() => responder(false)} title={state?.titulo ?? "Confirmar"} width={380}>
        {state && (
          <>
            <p style={{ color: "var(--t2)", fontSize: "13.5px", lineHeight: 1.5, whiteSpace: "pre-line", margin: "0 0 20px" }}>
              {state.mensagem}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="btn bg sm" onClick={() => responder(false)}>
                {state.cancelarLabel ?? "Cancelar"}
              </button>
              <button className={`btn sm ${state.perigo ? "bw" : "bp"}`} onClick={() => responder(true)}>
                {state.confirmarLabel ?? "Confirmar"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}
```

Nota da receita: `useEscToClose` e o import correspondente saíram (o `Modal` já cuida). O `state && (...)` interno virou fragment (`<>...</>`) porque `Modal` já decide se renderiza ou não via `open`; sem isso, `state?.titulo` no `title` teria que lidar com `undefined` de qualquer forma, e o corpo continua condicional só por segurança de tipo (`state.mensagem` etc. exigem `state` non-null).

- [ ] **Step 3: Ler o estado atual de `prompt.tsx` e aplicar a mesma receita**

Abrir `components/ui/prompt.tsx`, comparar a estrutura com o `confirm.tsx` original (Step 1) — é o mesmo padrão (`PromptProvider`/`usePrompt`, Context+Promise, `mov`/`mod` manual). Aplicar exatamente a mesma transformação do Step 2: trocar o wrapper `mov`/`mod`/`mhd`/`mtit`/`mcl` por `<Modal open={...} onClose={...} title={...} width={...}>`, remover `useEscToClose` manual e seu import, manter 100% do corpo (inputs, validação `matchExato`/`obrigatorio`, botões) sem alteração.

- [ ] **Step 4: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros em `confirm.tsx`/`prompt.tsx` nem em quem os consome (`ConfirmProvider`/`PromptProvider` são usados em `components/layout/AppLayout.tsx` — a interface pública `useConfirm()`/`usePrompt()` não muda, só a implementação interna).

- [ ] **Step 5: Commit**

```bash
git add components/ui/confirm.tsx components/ui/prompt.tsx
git commit -m "refactor(ui): migra confirm/prompt para o componente Modal compartilhado"
```

---

### Task 3: Migrar os 26 arquivos restantes

**Por que esta task não tem 26 sub-blocos de código completo, ao contrário do resto do plano:** os arquivos ainda não foram lidos um a um neste plano (só via grep de contagem) — congelar aqui o "antes/depois" de cada um arriscaria ficar desatualizado no momento de executar (o mesmo tipo de desencontro que já aconteceu na Task 2 do sub-projeto anterior, onde o formato real de `types/index.ts` divergia do assumido). Em vez disso, esta task é executada **inline, na mesma sessão que escreveu este plano**, com o executor lendo cada arquivo imediatamente antes de editar e aplicando a receita exata estabelecida na Task 2. Não delegar essa migração a subagentes que só veem esta task isolada — eles não teriam a receita completa nem o contexto de por que ela é assim.

**Files (todos em `Modify`, um por vez, cada um vira um commit próprio):**
- `app/produtos/page.tsx`
- `app/fornecedores/page.tsx` *(atenção: sub-projeto 1 acabou de adicionar campos aqui — reconferir que o modal migrado continua com os campos de IE/regime intactos)*
- `app/clientes/page.tsx`
- `app/contas-pagar/page.tsx` (7 modais)
- `app/contas-receber/page.tsx` (7 modais)
- `app/programacao/page.tsx` (6 modais)
- `app/pedidos/[id]/page.tsx`
- `app/orcamentos/page.tsx`
- `app/vendedores/page.tsx`
- `app/recorrencias/page.tsx`
- `app/bancos-caixa/page.tsx`
- `app/formas-pagamento/page.tsx`
- `app/investimentos/page.tsx`
- `app/plano-contas/page.tsx`
- `app/contabilidade/documentos/page.tsx`
- `app/contabilidade/cartoes/page.tsx`
- `app/contabilidade/fiscal-produtos/page.tsx`
- `app/contabilidade/consorcios/page.tsx`
- `app/contabilidade/estoque/page.tsx`
- `app/contabilidade/ativo-imobilizado/page.tsx`
- `app/contabilidade/emprestimos/page.tsx`
- `components/ui/ImportarMedidasModal.tsx`
- `components/ui/ImportarPdfModal.tsx`
- `components/ui/ImportarRetalhosModal.tsx`
- `components/ui/DatePromptModal.tsx`
- `components/ui/CommandPalette.tsx`

**Interfaces:**
- Consumes: `Modal` (Task 1), receita exata da Task 2.
- Produces: nenhuma — folhas da árvore.

**Receita a aplicar em CADA instância de modal de CADA arquivo acima** (repetir por arquivo):

- [ ] **Passo A: Ler o arquivo** e localizar cada bloco `{algumEstado && (<div className="mov open" onClick={e => e.target === e.currentTarget && fecharAlgo()}> <div className="mod" style={{width: ...}}> <div className="mhd">...título/mcl...</div> CORPO </div></div>)}`.
- [ ] **Passo B: Trocar** esse bloco por `<Modal open={algumEstado} onClose={fecharAlgo} title="Título extraído do mtit original" width={mesmoValorDeWidth}> CORPO </Modal>` (se o `mod` original tinha estilo extra além de `width`, ex. `maxHeight`/`display:flex`/`flexDirection:column`, passar via prop `style={{...}}` do `Modal`, preservando os mesmos valores). CORPO é colado sem nenhuma alteração de lógica/JSX interna.
- [ ] **Passo C: Importar `Modal`** (`import { Modal } from "@/components/ui/Modal";` ou caminho relativo se o arquivo já usa relativo pra outros componentes de `components/ui/` — seguir o padrão de import já usado no próprio arquivo).
- [ ] **Passo D: Se o arquivo importava/chamava `useEscToClose` manualmente pra esse mesmo modal**, remover a chamada e, se não sobrar nenhum outro uso no arquivo, remover o import também.
- [ ] **Passo E: Repetir os passos A-D para cada modal adicional no mesmo arquivo** (ex.: `contas-pagar/page.tsx` tem 7 — todos migram na mesma edição do arquivo).
- [ ] **Passo F: Rodar typecheck só deste arquivo** — `npx tsc --noEmit` (roda o projeto inteiro, mas a cada arquivo migrado o conjunto de erros deve encolher; se aparecer erro NOVO fora do arquivo que acabou de mexer, parar e investigar antes de continuar).

Expected: PASS depois de cada arquivo, sem erros novos.

- [ ] **Passo G: Commit por arquivo**

```bash
git add <arquivo>
git commit -m "refactor(ui): migra modal de <nome-da-tela> para o componente Modal"
```

- [ ] **Step final da Task 3: Build completo**

Run: `npm run build`
Expected: build limpo, sem warnings novos, depois que os 26 arquivos estiverem migrados.

---

### Task 4: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário**

Confirmar por grep que zero arquivos ainda usam `mov`/`mod` cru fora de `Modal.tsx` (o próprio componente é o único lugar que deve conter essas classes agora):

Run: `grep -rl 'className="mov' app components --include='*.tsx'` (ou Grep tool equivalente)
Expected: nenhum resultado (todos migrados) — se sobrar algum, é um arquivo que a Task 3 não cobriu, investigar antes de reportar concluído.

Informar ao usuário: sem credencial de teste automatizada local (mesma limitação do sub-projeto 1), pedir pra ele abrir algumas telas (Fornecedores, Contas a Pagar, Programação) e testar abrir/fechar modal, clicar fora, Esc — antes de considerar validado de verdade.

Isso encerra o sub-projeto 2 de 4 (Modal). Próximo da fila: RLS SELECT restrito.
