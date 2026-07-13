# Classificação Fiscal Obrigatória Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produto novo criado em `/produtos` exige classificação fiscal completa antes de existir de fato (cancelar = exclui o produto); produtos existentes e a tela de Contabilidade não mudam de comportamento.

**Architecture:** Extrair o modal de classificação fiscal (hoje local em `app/contabilidade/fiscal-produtos/page.tsx`) pra um componente compartilhado com um modo `obrigatorio`. `Modal` ganha `dismissible` pra suportar esse modo (sem X/Esc/clique-fora). `/produtos` passa a criar o produto, abrir esse modal em modo obrigatório, e só then. `/contabilidade/fiscal-produtos` importa o componente extraído, sem mudar de comportamento.

**Tech Stack:** Next.js/TypeScript, Supabase client (browser).

## Global Constraints

- Produtos **existentes** nunca ficam bloqueados — só produtos criados a partir de agora.
- O componente extraído não pode mudar o comportamento de `/contabilidade/fiscal-produtos` (Cancelar normal, Remover exceção disponível).
- Spec de referência: `docs/superpowers/specs/2026-07-13-classificacao-fiscal-obrigatoria-design.md`.

---

### Task 1: `Modal` ganha `dismissible`

**Files:**
- Modify: `components/ui/Modal.tsx`

**Interfaces:**
- Produces: prop `dismissible?: boolean` (default `true`) em `Modal`. Task 3 consome.

- [ ] **Step 1: Ler o estado atual**

```tsx
"use client";

import { useEscToClose } from "./useEscToClose";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  width: number | string;
  style?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  backdropStyle?: React.CSSProperties;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, width, style, headerStyle, backdropStyle, children }: ModalProps) {
  useEscToClose(open, onClose);
  if (!open) return null;
  return (
    <div className="mov open" onClick={e => e.target === e.currentTarget && onClose()} style={backdropStyle}>
      <div className="mod" style={{ width, ...style }}>
        {title !== undefined && (
          <div className="mhd" style={headerStyle}>
            <span className="mtit">{title}</span>
            <button className="mcl" aria-label="Fechar" onClick={onClose}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar `dismissible`**

```tsx
"use client";

import { useEscToClose } from "./useEscToClose";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  width: number | string;
  style?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  backdropStyle?: React.CSSProperties;
  dismissible?: boolean;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, width, style, headerStyle, backdropStyle, dismissible, children }: ModalProps) {
  const podeFechar = dismissible !== false;
  useEscToClose(open && podeFechar, onClose);
  if (!open) return null;
  return (
    <div className="mov open" onClick={e => podeFechar && e.target === e.currentTarget && onClose()} style={backdropStyle}>
      <div className="mod" style={{ width, ...style }}>
        {title !== undefined && (
          <div className="mhd" style={headerStyle}>
            <span className="mtit">{title}</span>
            {podeFechar && <button className="mcl" aria-label="Fechar" onClick={onClose}>✕</button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros (prop opcional, nenhum uso existente passa `dismissible`, todos continuam com o default `true`).

- [ ] **Step 4: Commit**

```bash
git add components/ui/Modal.tsx
git commit -m "feat(ui): adiciona prop dismissible ao componente Modal"
```

---

### Task 2: Extrair `ModalClassificacaoFiscal`

**Files:**
- Create: `components/produtos/ModalClassificacaoFiscal.tsx`
- Modify: `app/contabilidade/fiscal-produtos/page.tsx`

**Interfaces:**
- Consumes: `Modal` com `dismissible` (Task 1).
- Produces: `ModalClassificacaoFiscal` (default export) + `CFOP_DENTRO`, `CFOP_FORA`, `CST_NORMAL`, `CSOSN` (named exports) de `components/produtos/ModalClassificacaoFiscal.tsx`. Task 4 consome o componente.

- [ ] **Step 1: Criar o componente extraído**

```tsx
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { ConfigFiscalPadrao } from "@/types";
import type { ProdutoComConfig, ConfigFiscalProdutoInput } from "@/services/contabilidade.service";

export const CFOP_DENTRO = [
  { value: "5101", label: "5.101 — Venda produção própria" },
  { value: "5102", label: "5.102 — Venda de mercadoria de terceiros" },
  { value: "5405", label: "5.405 — Venda com substituição tributária" },
];
export const CFOP_FORA = [
  { value: "6101", label: "6.101 — Venda produção própria" },
  { value: "6102", label: "6.102 — Venda de mercadoria de terceiros" },
  { value: "6405", label: "6.405 — Venda com substituição tributária" },
];
export const CST_NORMAL = [
  { value: "00", label: "00 — Tributada integralmente" },
  { value: "10", label: "10 — Tributada com cobrança por ST" },
  { value: "20", label: "20 — Com redução de BC" },
  { value: "40", label: "40 — Isenta" },
  { value: "41", label: "41 — Não tributada" },
  { value: "50", label: "50 — Suspensão" },
  { value: "51", label: "51 — Diferimento" },
  { value: "60", label: "60 — ICMS cobrado anteriormente por ST" },
  { value: "90", label: "90 — Outros" },
];
export const CSOSN = [
  { value: "101", label: "101 — Tributada pelo Simples com crédito" },
  { value: "102", label: "102 — Tributada pelo Simples sem crédito" },
  { value: "103", label: "103 — Isenção para faixa de receita" },
  { value: "300", label: "300 — Imune" },
  { value: "400", label: "400 — Não tributada pelo Simples" },
  { value: "500", label: "500 — ICMS cobrado anteriormente por ST" },
  { value: "900", label: "900 — Outros" },
];

interface ModalClassificacaoFiscalProps {
  item: ProdutoComConfig;
  padrao: ConfigFiscalPadrao;
  onSalvar: (input: ConfigFiscalProdutoInput) => Promise<void>;
  onRemover?: () => Promise<void>;
  onFechar: () => void;
  obrigatorio?: boolean;
  onCancelarObrigatorio?: () => Promise<void>;
  salvando: boolean;
}

export default function ModalClassificacaoFiscal({
  item, padrao, onSalvar, onRemover, onFechar, obrigatorio, onCancelarObrigatorio, salvando,
}: ModalClassificacaoFiscalProps) {
  const { produto, config } = item;
  const cstOpcoes = padrao.regime === "simples" ? CSOSN : CST_NORMAL;

  const [ncm, setNcm]     = useState(config?.ncm         ?? padrao.ncm_padrao);
  const [cfopD, setCfopD] = useState(config?.cfop_dentro ?? padrao.cfop_dentro_padrao);
  const [cfopF, setCfopF] = useState(config?.cfop_fora   ?? padrao.cfop_fora_padrao);
  const [cst, setCst]     = useState(config?.cst_icms    ?? padrao.cst_icms_padrao);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSalvar({
      produto_id: produto.id,
      ncm,
      cfop_dentro: cfopD,
      cfop_fora:   cfopF,
      cst_icms:    cst,
      aliq_icms:   padrao.aliq_icms_dentro,
      aliq_pis:    padrao.aliq_pis,
      aliq_cofins: padrao.aliq_cofins,
      aliq_ipi:    padrao.aliq_ipi,
    });
  }

  return (
    <Modal
      open onClose={onFechar} width="560px" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      dismissible={!obrigatorio}
      title={<>
        Classificação Fiscal
        <div style={{ fontSize: "12px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginTop: "2px", fontWeight: 400 }}>
          {produto.cod} · {produto.nome}
        </div>
      </>}
    >
        {obrigatorio && (
          <div style={{ margin: "16px 20px 0", padding: "10px 14px", background: "rgba(245,158,11,.1)", border: "1px solid var(--warn)", borderRadius: "8px", fontSize: "12px", color: "var(--warn)" }}>
            ⚠ Produto criado — a classificação fiscal é obrigatória pra continuar. Cancelar aqui exclui o produto.
          </div>
        )}
        <form
          id="form-fiscal-produto"
          onSubmit={handleSubmit}
          style={{ overflowY: "auto", padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}
        >

          {/* NCM */}
          <div className="fg">
            <label className="fl">NCM *</label>
            <input
              className="fc"
              value={ncm}
              onChange={(e) => setNcm(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="00000000"
              maxLength={8}
              required
              style={{ fontFamily: "'DM Mono', monospace", letterSpacing: "2px" }}
            />
            <span style={{ fontSize: "10px", color: "var(--t3)", marginTop: "3px", display: "block" }}>
              8 dígitos — vidro laminado: 7003.12.00
            </span>
          </div>

          {/* CFOP */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">CFOP Dentro do Estado (MG)</label>
              <select className="fc" value={cfopD} onChange={(e) => setCfopD(e.target.value)} required>
                {CFOP_DENTRO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">CFOP Fora do Estado</label>
              <select className="fc" value={cfopF} onChange={(e) => setCfopF(e.target.value)} required>
                {CFOP_FORA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* CST */}
          <div className="fg">
            <label className="fl">{padrao.regime === "simples" ? "CSOSN" : "CST ICMS"}</label>
            <select className="fc" value={cst} onChange={(e) => setCst(e.target.value)} required>
              {cstOpcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Info alíquotas */}
          <div style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "8px" }}>
              ALÍQUOTAS (herdadas dos Parâmetros Padrão)
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {[
                { label: "ICMS (MG)",   val: padrao.aliq_icms_dentro },
                { label: "ICMS (fora)", val: padrao.aliq_icms_fora },
                { label: "PIS",         val: padrao.aliq_pis },
                { label: "COFINS",      val: padrao.aliq_cofins },
                { label: "IPI",         val: padrao.aliq_ipi },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, fontFamily: "'DM Mono', monospace", color: val > 0 ? "var(--warn)" : "var(--t3)" }}>
                    {val.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
          <div>
            {!obrigatorio && config && onRemover && (
              <button
                type="button"
                className="btn bg sm"
                style={{ color: "var(--err)", borderColor: "var(--err)" }}
                onClick={onRemover}
                disabled={salvando}
              >
                Remover exceção
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="btn bg"
              onClick={obrigatorio ? onCancelarObrigatorio : onFechar}
              disabled={salvando}
              style={obrigatorio ? { color: "var(--err)", borderColor: "var(--err)" } : undefined}
            >
              {obrigatorio ? "Cancelar e excluir produto" : "Cancelar"}
            </button>
            <button type="submit" form="form-fiscal-produto" className="btn bp" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

    </Modal>
  );
}
```

- [ ] **Step 2: Atualizar `app/contabilidade/fiscal-produtos/page.tsx`**

Remover a definição local de `ModalProduto` e das constantes `CFOP_DENTRO`/`CFOP_FORA`/`CST_NORMAL`/`CSOSN` (linhas 23-53 e 55-196 hoje — reconferir range exato antes de apagar, cortar exatamente da linha do comentário `// ─── Constantes ───` até o fechamento de `ModalProduto`, sem tocar em `SecaoPadrao` logo depois).

Adicionar o import:

```ts
import ModalClassificacaoFiscal, { CFOP_DENTRO, CFOP_FORA, CST_NORMAL, CSOSN } from "@/components/produtos/ModalClassificacaoFiscal";
```

Trocar o uso (`app/contabilidade/fiscal-produtos/page.tsx:504-513` hoje):

```tsx
      {editando && (
        <ModalProduto
          item={editando}
          padrao={padrao}
          onSalvar={handleSalvarProduto}
          onRemover={handleRemoverProduto}
          onFechar={() => setEditando(null)}
          salvando={salvandoProduto}
        />
      )}
```

por:

```tsx
      {editando && (
        <ModalClassificacaoFiscal
          item={editando}
          padrao={padrao}
          onSalvar={handleSalvarProduto}
          onRemover={handleRemoverProduto}
          onFechar={() => setEditando(null)}
          salvando={salvandoProduto}
        />
      )}
```

(`obrigatorio`/`onCancelarObrigatorio` ficam omitidos aqui — comportamento idêntico ao de hoje.)

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Se `SecaoPadrao` (que continua em `fiscal-produtos/page.tsx`) usar `CFOP_DENTRO`/`CFOP_FORA`/`CST_NORMAL`/`CSOSN`, confirmar que o import novo cobre esse uso (mesmos nomes, mesma forma).

- [ ] **Step 4: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add components/produtos/ModalClassificacaoFiscal.tsx app/contabilidade/fiscal-produtos/page.tsx
git commit -m "refactor(fiscal): extrai ModalClassificacaoFiscal para componente compartilhado"
```

---

### Task 3: Fluxo obrigatório em `/produtos`

**Files:**
- Modify: `app/produtos/page.tsx`

**Interfaces:**
- Consumes: `ModalClassificacaoFiscal`, `getConfigPadrao`, `salvarConfigFiscalProduto`, `PADRAO_FALLBACK` de `@/services/contabilidade.service` (Task 2 + serviço já existente).

- [ ] **Step 1: Adicionar imports**

```ts
import ModalClassificacaoFiscal from "@/components/produtos/ModalClassificacaoFiscal";
import { getConfigPadrao, salvarConfigFiscalProduto, PADRAO_FALLBACK } from "@/services/contabilidade.service";
import type { ConfigFiscalPadrao } from "@/types";
import type { ConfigFiscalProdutoInput } from "@/services/contabilidade.service";
```

- [ ] **Step 2: Adicionar states novos**

Logo abaixo de `const [comConfigFiscal, setComConfigFiscal] = useState<Set<number>>(new Set());`:

```ts
  const [padrao, setPadrao] = useState<ConfigFiscalPadrao>({ ...PADRAO_FALLBACK });
  const [produtoPendenteFiscal, setProdutoPendenteFiscal] = useState<Produto | null>(null);
  const [salvandoFiscal, setSalvandoFiscal] = useState(false);
```

- [ ] **Step 3: Carregar `padrao` no mount**

Trocar:

```ts
  useEffect(() => { load(); }, []);
```

por:

```ts
  useEffect(() => { load(); getConfigPadrao().then(setPadrao); }, []);
```

- [ ] **Step 4: Alterar `salvar()` — caminho de criação abre o modal fiscal**

Trocar:

```ts
  async function salvar() {
    if (!form.cod || !form.nome) return;
    setSalvando(true);
    if (editId) {
      await supabase.from("produtos").update(form as never).eq("id", editId);
    } else {
      await supabase.from("produtos").insert([form as never]);
    }
    setSalvando(false);
    setModal(false);
    load();
  }
```

por:

```ts
  async function salvar() {
    if (!form.cod || !form.nome) return;
    setSalvando(true);
    if (editId) {
      await supabase.from("produtos").update(form as never).eq("id", editId);
      setSalvando(false);
      setModal(false);
      load();
      return;
    }
    const { data, error } = await supabase.from("produtos").insert([form as never]).select().single();
    setSalvando(false);
    setModal(false);
    if (error || !data) { load(); return; }
    setProdutoPendenteFiscal(data as Produto);
    load();
  }
```

- [ ] **Step 5: Handlers de salvar/cancelar a classificação obrigatória**

Adicionar logo depois de `salvar()`:

```ts
  async function handleSalvarFiscalObrigatoria(input: ConfigFiscalProdutoInput) {
    setSalvandoFiscal(true);
    const ok = await salvarConfigFiscalProduto(input);
    setSalvandoFiscal(false);
    if (!ok) return;
    setProdutoPendenteFiscal(null);
    load();
  }

  async function handleCancelarFiscalObrigatoria() {
    if (!produtoPendenteFiscal) return;
    if (!(await confirm(`Excluir o produto "${produtoPendenteFiscal.nome}"? A classificação fiscal é obrigatória para produtos novos.`, { perigo: true }))) return;
    setSalvandoFiscal(true);
    await supabase.from("produtos").delete().eq("id", produtoPendenteFiscal.id);
    setSalvandoFiscal(false);
    setProdutoPendenteFiscal(null);
    load();
  }
```

- [ ] **Step 6: Renderizar o modal obrigatório**

Logo depois do `</Modal>` de cadastro (antes de `</AppLayout>`):

```tsx
      {produtoPendenteFiscal && (
        <ModalClassificacaoFiscal
          item={{ produto: produtoPendenteFiscal, config: null }}
          padrao={padrao}
          onSalvar={handleSalvarFiscalObrigatoria}
          onFechar={() => {}}
          obrigatorio
          onCancelarObrigatorio={handleCancelarFiscalObrigatoria}
          salvando={salvandoFiscal}
        />
      )}
```

- [ ] **Step 7: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 8: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 9: Commit**

```bash
git add app/produtos/page.tsx
git commit -m "feat(produtos): exige classificacao fiscal ao criar produto novo"
```

---

### Task 4: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário**

Sem browser automation nem credencial de teste disponível nesta sessão. Pedir pro usuário testar manualmente:

1. Criar um produto sintético novo em `/produtos` (nome `__teste_fiscal_obrigatorio`) — confirmar que o modal de Classificação Fiscal abre sozinho logo depois, sem X, sem fechar no Esc, sem fechar clicando fora.
2. Testar "Cancelar e excluir produto" — confirmar que o produto some da lista.
3. Criar de novo e completar a classificação (NCM/CFOP/CST) — confirmar que salva e o produto aparece em `/contabilidade/fiscal-produtos` já como "Específico".
4. Editar um produto **já existente** — confirmar que não pede classificação fiscal (comportamento igual ao de antes).
5. Em `/contabilidade/fiscal-produtos`, abrir "Personalizar"/"Editar" em qualquer produto — confirmar que o modal continua com Cancelar normal e Remover exceção quando aplicável (comportamento idêntico ao de antes da extração).

Isso encerra o sub-projeto 4 de 4 (Fiscal) — última leva combinada com o usuário sobre o backlog da auditoria.
