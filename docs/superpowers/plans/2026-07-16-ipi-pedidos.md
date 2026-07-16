# IPI nos Pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um checkbox "Tem IPI (6,5%)" ao pedido (criar e
editar) que calcula e soma automaticamente 6,5% ao valor a receber do
cliente, refletindo esse total em toda tela/relatório que hoje trata
`pedidos.valor_total` como "quanto o cliente deve".

**Architecture:** `pedidos.valor_total` continua sendo só o valor do
produto (nunca muda de significado — protege margem/CMV/comissão, que
já dependem dele). Dois campos novos, `tem_ipi`/`valor_ipi`, guardam o
IPI separadamente. Uma função pura única, `valorComIpi()`, calcula "o
que o cliente deve" em todo lugar que precisa desse número — evitando
duas fórmulas divergentes espalhadas pelo código.

**Tech Stack:** Next.js (App Router, client components), Supabase-js,
TypeScript, Vitest.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-16-ipi-pedidos-design.md`.
- `valor_total` NUNCA muda de significado — continua só o valor do
  produto/vidro. `services/margem.service.ts` e o cálculo de comissão
  do vendedor (em `novo/page.tsx` e `editar/page.tsx`) NÃO são tocados
  por este plano — continuam somando/multiplicando `valor_total` puro,
  deliberadamente.
- Alíquota de IPI é fixa em código: `ALIQ_IPI_PEDIDO = 6.5`, sem tela
  de configuração.
- **Nenhuma task pode deixar o build quebrado entre commits.** Quando o
  tipo `Pedido` ganha campos obrigatórios novos (Task 2), o único call
  site que monta um `PedidoInsert` completo precisa ser atualizado na
  MESMA task/commit — ver [[feedback-nao-pushar-estado-quebrado]] (um
  build quebrado assim já aconteceu nesta base de código e já foi
  visto pelo usuário no Vercel).
- Sem teste automatizado para código que só faz I/O de Supabase ou UI
  (nenhuma função equivalente no projeto tem teste). Lógica pura fica
  em `lib/`, testada com Vitest.
- Verificação de tipos via `npx tsc --noEmit` ao final de cada task, e
  `npm run build` completo nas tasks que tocam o tipo `Pedido` (Tasks
  2-6), já que o `next build` pega problemas que `tsc --noEmit`
  isoladamente não pega (foi exatamente esse passo que falhou no
  Vercel numa sessão anterior).
- **Alguns arquivos deste plano usam CRLF, não LF** (`app/pedidos/[id]/page.tsx`,
  `services/dre.service.ts`, `services/pedidos.service.ts`,
  `app/relatorios/page.tsx`, `app/pedidos/page.tsx`,
  `app/clientes/[id]/page.tsx`, `app/producao/page.tsx` — confirmado
  via `file`). Os blocos "Localizar/Substituir" deste documento foram
  escritos em LF; se a ferramenta de edição não achar o texto exato
  num desses arquivos, releia o trecho atual do arquivo (Read) e monte
  o `old_string` a partir do que está lá, em vez de assumir que o
  bloco do plano é byte-exato — o conteúdo lógico está certo, só a
  quebra de linha pode divergir.

---

### Task 1: SQL (`pedidos.tem_ipi`/`valor_ipi`) + `lib/pedidoIpi.ts` (TDD)

**Files:**
- Create: `sql/ipi-pedidos.sql`
- Create: `lib/pedidoIpi.ts`
- Test: `lib/pedidoIpi.test.ts`

**Interfaces:**
- Produces: `ALIQ_IPI_PEDIDO: number`; `calcularValorIpi(valorTotal: number): number`; `valorComIpi(pedido: { valor_total: number; valor_ipi?: number | null }): number` — todos exportados de `lib/pedidoIpi.ts`

- [ ] **Step 1: SQL da migração**

Criar `sql/ipi-pedidos.sql`:

```sql
-- ============================================================
-- IPI nos Pedidos — 6,5% fixo, opcional por pedido
-- Ver docs/superpowers/specs/2026-07-16-ipi-pedidos-design.md
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.pedidos
  add column if not exists tem_ipi boolean not null default false,
  add column if not exists valor_ipi numeric not null default 0;

-- ── Verificação ─────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='pedidos' and column_name in ('tem_ipi','valor_ipi');
```

- [ ] **Step 2: Escrever o teste (vai falhar — módulo ainda não existe)**

Criar `lib/pedidoIpi.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ALIQ_IPI_PEDIDO, calcularValorIpi, valorComIpi } from "./pedidoIpi";

describe("ALIQ_IPI_PEDIDO", () => {
  it("é 6.5", () => {
    expect(ALIQ_IPI_PEDIDO).toBe(6.5);
  });
});

describe("calcularValorIpi", () => {
  it("calcula 6,5% do valor total, com 2 casas decimais", () => {
    expect(calcularValorIpi(1000)).toBe(65);
    expect(calcularValorIpi(123.45)).toBe(8.02); // 123.45 * 0.065 = 8.02425 → 8.02
  });

  it("retorna 0 pra valor total 0", () => {
    expect(calcularValorIpi(0)).toBe(0);
  });
});

describe("valorComIpi", () => {
  it("soma valor_total e valor_ipi", () => {
    expect(valorComIpi({ valor_total: 1000, valor_ipi: 65 })).toBe(1065);
  });

  it("trata valor_ipi ausente ou null como 0", () => {
    expect(valorComIpi({ valor_total: 1000 })).toBe(1000);
    expect(valorComIpi({ valor_total: 1000, valor_ipi: null })).toBe(1000);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/pedidoIpi.test.ts`
Expected: FAIL — `Cannot find module './pedidoIpi'`.

- [ ] **Step 4: Implementar `lib/pedidoIpi.ts`**

```ts
export const ALIQ_IPI_PEDIDO = 6.5;

export function calcularValorIpi(valorTotal: number): number {
  return parseFloat((valorTotal * ALIQ_IPI_PEDIDO / 100).toFixed(2));
}

export function valorComIpi(pedido: { valor_total: number; valor_ipi?: number | null }): number {
  return Number(pedido.valor_total) + Number(pedido.valor_ipi ?? 0);
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/pedidoIpi.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add sql/ipi-pedidos.sql lib/pedidoIpi.ts lib/pedidoIpi.test.ts
git commit -m "feat: schema e lógica pura do IPI nos pedidos"
```

---

### Task 2: Tipo `Pedido` + Criar pedido (`app/pedidos/novo/page.tsx`)

**Files:**
- Modify: `types/index.ts`
- Modify: `app/pedidos/novo/page.tsx`

**Interfaces:**
- Consumes: `ALIQ_IPI_PEDIDO`, `calcularValorIpi` (Task 1)
- Produces: `Pedido`/`PedidoInsert`/`PedidoUpdate` ganham `tem_ipi: boolean` e `valor_ipi: number`

Esta task muda o tipo `Pedido` (campos obrigatórios novos) E atualiza o
único call site que monta um `PedidoInsert` completo, na mesma task —
ver Global Constraints (nenhum build quebrado entre commits).

- [ ] **Step 1: Tipo `Pedido`**

Em `types/index.ts`, localizar (linha 274-276):

```ts
  m2_total: number;
  valor_total: number;
  valor_recebido: number;
```

Substituir por:

```ts
  m2_total: number;
  valor_total: number;
  tem_ipi: boolean;
  valor_ipi: number;
  valor_recebido: number;
```

- [ ] **Step 2: Import em `app/pedidos/novo/page.tsx`**

Localizar (linha 11):

```ts
import { formatBRL, formatM2 } from "@/lib/formatters";
```

Substituir por:

```ts
import { formatBRL, formatM2 } from "@/lib/formatters";
import { ALIQ_IPI_PEDIDO, calcularValorIpi } from "@/lib/pedidoIpi";
```

- [ ] **Step 3: Estado e derivados**

Localizar (linhas 226-229):

```ts
  const m2Total    = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const valorTotal = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const todosVidroCliente = itens.length > 0 && itens.every(i => i.vidro_cliente);
  const algumVidroCliente = itens.some(i => i.vidro_cliente);
```

Substituir por:

```ts
  const m2Total    = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const valorTotal = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const valorIpi   = temIpi ? calcularValorIpi(valorTotal) : 0;
  const valorComIpiCalc = valorTotal + valorIpi;
  const todosVidroCliente = itens.length > 0 && itens.every(i => i.vidro_cliente);
  const algumVidroCliente = itens.some(i => i.vidro_cliente);
```

Localizar (linha 134):

```ts
  const [obs, setObs]               = useState("");
```

Substituir por:

```ts
  const [obs, setObs]               = useState("");
  const [temIpi, setTemIpi]         = useState(false);
```

- [ ] **Step 4: Parcelas usam o total com IPI**

Localizar (linhas 231-248):

```ts
  useEffect(() => {
    setParcelasForm(prev => {
      const novaPrimeira   = prev[0]?.data      || "";
      const defaultConta   = prev[0]?.conta     ?? "";
      const defaultForma   = prev[0]?.formaPgto ?? "";
      const novas: ParcelaForm[] = Array.from({ length: parcelas }, (_, i) => ({
        data:      novaPrimeira ? (i === 0 ? novaPrimeira : addMeses(novaPrimeira, i)) : "",
        valor: 0, editado: false,
        conta:     prev[i]?.conta     ?? defaultConta,
        formaPgto: prev[i]?.formaPgto ?? defaultForma,
      }));
      return redistribuirParcelas(novas, valorTotal);
    });
  }, [parcelas]);

  useEffect(() => {
    setParcelasForm(prev => redistribuirParcelas(prev, valorTotal));
  }, [valorTotal]);
```

Substituir por:

```ts
  useEffect(() => {
    setParcelasForm(prev => {
      const novaPrimeira   = prev[0]?.data      || "";
      const defaultConta   = prev[0]?.conta     ?? "";
      const defaultForma   = prev[0]?.formaPgto ?? "";
      const novas: ParcelaForm[] = Array.from({ length: parcelas }, (_, i) => ({
        data:      novaPrimeira ? (i === 0 ? novaPrimeira : addMeses(novaPrimeira, i)) : "",
        valor: 0, editado: false,
        conta:     prev[i]?.conta     ?? defaultConta,
        formaPgto: prev[i]?.formaPgto ?? defaultForma,
      }));
      return redistribuirParcelas(novas, valorComIpiCalc);
    });
  }, [parcelas]);

  useEffect(() => {
    setParcelasForm(prev => redistribuirParcelas(prev, valorComIpiCalc));
  }, [valorComIpiCalc]);
```

Localizar (linhas 260-265):

```ts
  function handleValorParcela(idx: number, valor: number) {
    setParcelasForm(prev => {
      const atualizado = prev.map((p, i) => i === idx ? { ...p, valor, editado: true } : p);
      return redistribuirParcelas(atualizado, valorTotal, idx);
    });
  }
```

Substituir por:

```ts
  function handleValorParcela(idx: number, valor: number) {
    setParcelasForm(prev => {
      const atualizado = prev.map((p, i) => i === idx ? { ...p, valor, editado: true } : p);
      return redistribuirParcelas(atualizado, valorComIpiCalc, idx);
    });
  }
```

- [ ] **Step 5: Validação de parcelas e mensagem de erro**

Localizar (linhas 409-411):

```ts
  const somaParcelas = parcelasForm.reduce((a, p) => a + p.valor, 0);
  const difParcelas  = Math.abs(somaParcelas - valorTotal);
  const parcelasOk   = difParcelas < 0.02;
```

Substituir por:

```ts
  const somaParcelas = parcelasForm.reduce((a, p) => a + p.valor, 0);
  const difParcelas  = Math.abs(somaParcelas - valorComIpiCalc);
  const parcelasOk   = difParcelas < 0.02;
```

Localizar (linha 416):

```ts
    if (!parcelasOk) { toast(`Soma das parcelas (${formatBRL(somaParcelas)}) difere do total (${formatBRL(valorTotal)})`, "err"); return; }
```

Substituir por:

```ts
    if (!parcelasOk) { toast(`Soma das parcelas (${formatBRL(somaParcelas)}) difere do total (${formatBRL(valorComIpiCalc)})`, "err"); return; }
```

- [ ] **Step 6: Insert do pedido**

Localizar (linhas 422-437):

```ts
      const pedido: PedidoInsert = {
        id: proximoId,
        cliente_id: clienteId,
        vendedor_id: vendedorId,
        dt_pedido: dtPedido,
        dt_retirada: dtRetirada || null,
        datas_pgto:   parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.data),
        valores_pgto: parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.valor),
        m2_total: m2Total,
        valor_total: valorTotal,
        valor_recebido: 0,
        status: todosChapa ? "Em Produção – Corte" : "Aguardando otimização",
        forma_pgto: parcelasForm[0]?.formaPgto || formaPgto,
        conta: parcelasForm[0]?.conta || conta,
        parcelas, frete, obs,
      };
```

Substituir por:

```ts
      const pedido: PedidoInsert = {
        id: proximoId,
        cliente_id: clienteId,
        vendedor_id: vendedorId,
        dt_pedido: dtPedido,
        dt_retirada: dtRetirada || null,
        datas_pgto:   parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.data),
        valores_pgto: parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.valor),
        m2_total: m2Total,
        valor_total: valorTotal,
        tem_ipi: temIpi,
        valor_ipi: valorIpi,
        valor_recebido: 0,
        status: todosChapa ? "Em Produção – Corte" : "Aguardando otimização",
        forma_pgto: parcelasForm[0]?.formaPgto || formaPgto,
        conta: parcelasForm[0]?.conta || conta,
        parcelas, frete, obs,
      };
```

**Não mexer** no cálculo de comissão (poucas linhas abaixo, usa
`valorTotal * vendedor.comissao_pct / 100`) — continua sobre o valor
puro, sem IPI.

- [ ] **Step 7: Checkbox e displays na seção FINANCEIRO**

Localizar (linhas 551-553):

```tsx
            {/* ── FINANCEIRO ── */}
            <div style={{ marginTop: "14px", borderTop: "1px solid var(--b1)", paddingTop: "14px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "12px", letterSpacing: ".06em" }}>FINANCEIRO</div>
```

Substituir por:

```tsx
            {/* ── FINANCEIRO ── */}
            <div style={{ marginTop: "14px", borderTop: "1px solid var(--b1)", paddingTop: "14px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "12px", letterSpacing: ".06em" }}>FINANCEIRO</div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                <input name="tem_ipi" type="checkbox" checked={temIpi} onChange={e => setTemIpi(e.target.checked)} />
                Tem IPI ({ALIQ_IPI_PEDIDO}%)
                {temIpi && <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--warn)", marginLeft: "4px" }}>— {formatBRL(valorIpi)}</span>}
              </label>
```

Localizar (linha 559, dentro do box "Total"):

```tsx
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--acc)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(valorTotal)}</div>
                </div>
                <div style={{ background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--b2)" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "4px" }}>m² Total</div>
```

Substituir por:

```tsx
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--acc)", fontFamily: "'DM Mono',monospace" }}>{formatBRL(valorComIpiCalc)}</div>
                </div>
                <div style={{ background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--b2)" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "4px" }}>m² Total</div>
```

Localizar (linha 570):

```tsx
                    {parcelas > 1 ? formatBRL(valorTotal / parcelas) : (parcelasForm[0]?.formaPgto || formaPgto || "—")}
```

Substituir por:

```tsx
                    {parcelas > 1 ? formatBRL(valorComIpiCalc / parcelas) : (parcelasForm[0]?.formaPgto || formaPgto || "—")}
```

Localizar (linhas 619-623):

```tsx
                {valorTotal > 0 && !parcelasOk && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono',monospace", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", borderRadius: "6px", padding: "6px 10px" }}>
                    ⚠ Soma das parcelas ({formatBRL(somaParcelas)}) difere do total ({formatBRL(valorTotal)})
                  </div>
                )}
```

Substituir por:

```tsx
                {valorComIpiCalc > 0 && !parcelasOk && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono',monospace", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", borderRadius: "6px", padding: "6px 10px" }}>
                    ⚠ Soma das parcelas ({formatBRL(somaParcelas)}) difere do total ({formatBRL(valorComIpiCalc)})
                  </div>
                )}
```

Localizar (linhas 651-653):

```tsx
            <div className="sr"><div className="sl">Valor Total</div><div className="sv" style={{ color: "var(--acc)", fontSize: "18px" }}>{formatBRL(valorTotal)}</div></div>
            {parcelas > 1 && <div className="sr"><div className="sl">Por Parcela</div><div className="sv">{formatBRL(valorTotal / parcelas)}</div></div>}
            {clienteId && tab && tab.min > 0 && valorTotal < tab.min && (
```

Substituir por:

```tsx
            <div className="sr"><div className="sl">Valor Total</div><div className="sv" style={{ color: "var(--acc)", fontSize: "18px" }}>{formatBRL(valorComIpiCalc)}</div></div>
            {parcelas > 1 && <div className="sr"><div className="sl">Por Parcela</div><div className="sv">{formatBRL(valorComIpiCalc / parcelas)}</div></div>}
            {clienteId && tab && tab.min > 0 && valorTotal < tab.min && (
```

(O comparativo com `tab.min`, linha 653, continua em `valorTotal` puro
de propósito — é um mínimo de pedido por valor de produto, não precisa
mudar; se ficar ambíguo na revisão, é um ponto pra confirmar, não pra
"corrigir" silenciosamente.)

Há ainda uma terceira exibição — a "totbar" fixa embaixo da lista de
itens. Localizar (linha 849):

```tsx
            <div className="ti"><div className="tl">Valor Total</div><div className="tv" style={{ color: "var(--acc)" }}>{formatBRL(valorTotal)}</div></div>
```

Substituir por:

```tsx
            <div className="ti"><div className="tl">Valor Total</div><div className="tv" style={{ color: "var(--acc)" }}>{formatBRL(valorComIpiCalc)}</div></div>
```

- [ ] **Step 8: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros (esse é o passo que falharia no
Vercel se o tipo `Pedido` e o insert não estivessem sincronizados).

- [ ] **Step 9: Commit**

```bash
git add types/index.ts app/pedidos/novo/page.tsx
git commit -m "feat: checkbox de IPI no pedido novo"
```

---

### Task 3: Editar pedido (`app/pedidos/[id]/editar/page.tsx`)

**Files:**
- Modify: `app/pedidos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `ALIQ_IPI_PEDIDO`, `calcularValorIpi`, `valorComIpi` (Task 1); `Pedido.tem_ipi`/`valor_ipi` (Task 2)

- [ ] **Step 1: Import**

Localizar (linha 9):

```ts
import { formatBRL, formatM2 } from "@/lib/formatters";
```

Substituir por:

```ts
import { formatBRL, formatM2 } from "@/lib/formatters";
import { ALIQ_IPI_PEDIDO, calcularValorIpi, valorComIpi } from "@/lib/pedidoIpi";
```

- [ ] **Step 2: Estado**

Localizar (linha 113):

```ts
  const [obs, setObs]               = useState("");
```

Substituir por:

```ts
  const [obs, setObs]               = useState("");
  const [temIpi, setTemIpi]         = useState(false);
```

- [ ] **Step 3: Carregar `tem_ipi` em `load()`**

Localizar (linha 155):

```ts
    setObs(pedido.obs ?? "");
```

Substituir por:

```ts
    setObs(pedido.obs ?? "");
    setTemIpi(pedido.tem_ipi ?? false);
```

- [ ] **Step 4: Fallback de parcela inicial usa o total com IPI**

Localizar (linhas 190-197):

```ts
    } else {
      const n = pedido.parcelas ?? 1;
      const datas = pedido.datas_pgto ?? [];
      const vals  = pedido.valores_pgto ?? [];
      setParcelasForm(Array.from({ length: n }, (_, i) => ({
        data: datas[i] ?? "", valor: vals[i] ?? parseFloat((pedido.valor_total / n).toFixed(2)), editado: false,
      })));
    }
```

Substituir por:

```ts
    } else {
      const n = pedido.parcelas ?? 1;
      const datas = pedido.datas_pgto ?? [];
      const vals  = pedido.valores_pgto ?? [];
      setParcelasForm(Array.from({ length: n }, (_, i) => ({
        data: datas[i] ?? "", valor: vals[i] ?? parseFloat((valorComIpi(pedido) / n).toFixed(2)), editado: false,
      })));
    }
```

- [ ] **Step 5: Derivados**

Localizar (linhas 219-222):

```ts
  const m2Total    = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const valorTotal = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const todosVC    = itens.length > 0 && itens.every(i => i.vidro_cliente);
  const algumVC    = itens.some(i => i.vidro_cliente);
```

Substituir por:

```ts
  const m2Total    = itens.reduce((a, i) => a + calcM2Item(i), 0);
  const valorTotal = itens.reduce((a, i) => a + calcSubtotal(i), 0);
  const valorIpi   = temIpi ? calcularValorIpi(valorTotal) : 0;
  const valorComIpiCalc = valorTotal + valorIpi;
  const todosVC    = itens.length > 0 && itens.every(i => i.vidro_cliente);
  const algumVC    = itens.some(i => i.vidro_cliente);
```

- [ ] **Step 6: Redistribuição de parcelas usa o total com IPI**

Localizar (linhas 224-227):

```ts
  // Redistribuir parcelas quando total muda
  useEffect(() => {
    setParcelasForm(prev => redistribuirParcelas(prev, valorTotal));
  }, [valorTotal]);
```

Substituir por:

```ts
  // Redistribuir parcelas quando total muda
  useEffect(() => {
    setParcelasForm(prev => redistribuirParcelas(prev, valorComIpiCalc));
  }, [valorComIpiCalc]);
```

Localizar (linhas 229-231):

```ts
  const somaParcelas = parcelasForm.reduce((a, p) => a + p.valor, 0);
  const difParcelas  = Math.abs(somaParcelas - valorTotal);
  const parcelasOk   = difParcelas < 0.02;
```

Substituir por:

```ts
  const somaParcelas = parcelasForm.reduce((a, p) => a + p.valor, 0);
  const difParcelas  = Math.abs(somaParcelas - valorComIpiCalc);
  const parcelasOk   = difParcelas < 0.02;
```

Localizar (linhas 343-353):

```ts
  function handleNParcelas(n: number) {
    setParcelas(n);
    const primeiraData = parcelasForm[0]?.data ?? "";
    setParcelasForm(redistribuirParcelas(
      Array.from({ length: n }, (_, i) => ({
        data: primeiraData ? (i === 0 ? primeiraData : addMeses(primeiraData, i)) : "",
        valor: 0, editado: false,
      })),
      valorTotal,
    ));
  }
```

Substituir por:

```ts
  function handleNParcelas(n: number) {
    setParcelas(n);
    const primeiraData = parcelasForm[0]?.data ?? "";
    setParcelasForm(redistribuirParcelas(
      Array.from({ length: n }, (_, i) => ({
        data: primeiraData ? (i === 0 ? primeiraData : addMeses(primeiraData, i)) : "",
        valor: 0, editado: false,
      })),
      valorComIpiCalc,
    ));
  }
```

Localizar (linhas 365-370):

```ts
  function handleValorParcela(idx: number, valor: number) {
    setParcelasForm(prev => {
      const atualizado = prev.map((p, i) => i === idx ? { ...p, valor, editado: true } : p);
      return redistribuirParcelas(atualizado, valorTotal, idx);
    });
  }
```

Substituir por:

```ts
  function handleValorParcela(idx: number, valor: number) {
    setParcelasForm(prev => {
      const atualizado = prev.map((p, i) => i === idx ? { ...p, valor, editado: true } : p);
      return redistribuirParcelas(atualizado, valorComIpiCalc, idx);
    });
  }
```

- [ ] **Step 7: Validação e mensagens de erro/aviso**

Localizar (linha 377, dentro de `salvar()`):

```ts
    if (!parcelasOk) { toast(`Soma das parcelas (${formatBRL(somaParcelas)}) difere do total (${formatBRL(valorTotal)})`, "err"); return; }
```

Substituir por:

```ts
    if (!parcelasOk) { toast(`Soma das parcelas (${formatBRL(somaParcelas)}) difere do total (${formatBRL(valorComIpiCalc)})`, "err"); return; }
```

Localizar também (linhas 604-608, o aviso inline embaixo da lista de
parcelas — ponto separado do toast acima, mesma checagem duplicada na
UI):

```tsx
              {valorTotal > 0 && !parcelasOk && (
                <div style={{ marginTop:"8px", fontSize:"11px", color:"var(--warn, #f59e0b)", fontFamily:"'DM Mono',monospace" }}>
                  ⚠ Soma das parcelas ({formatBRL(somaParcelas)}) difere do total ({formatBRL(valorTotal)})
                </div>
              )}
```

Substituir por:

```tsx
              {valorComIpiCalc > 0 && !parcelasOk && (
                <div style={{ marginTop:"8px", fontSize:"11px", color:"var(--warn, #f59e0b)", fontFamily:"'DM Mono',monospace" }}>
                  ⚠ Soma das parcelas ({formatBRL(somaParcelas)}) difere do total ({formatBRL(valorComIpiCalc)})
                </div>
              )}
```

- [ ] **Step 8: Payload do `updatePedido`**

Localizar (linhas 381-395):

```ts
    const result = await updatePedido(id, {
      cliente_id:   clienteId,
      vendedor_id:  vendedorId,
      dt_pedido:    dtPedido,
      dt_retirada:  dtRetirada || null,
      frete,
      forma_pgto:   formaPgto,
      conta,
      parcelas,
      obs,
      datas_pgto:   parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.data),
      valores_pgto: parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.valor),
      valor_total:  parseFloat(valorTotal.toFixed(2)),
      m2_total:     parseFloat(m2Total.toFixed(4)),
    });
```

Substituir por:

```ts
    const result = await updatePedido(id, {
      cliente_id:   clienteId,
      vendedor_id:  vendedorId,
      dt_pedido:    dtPedido,
      dt_retirada:  dtRetirada || null,
      frete,
      forma_pgto:   formaPgto,
      conta,
      parcelas,
      obs,
      datas_pgto:   parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.data),
      valores_pgto: parcelasForm.filter(p => p.data && p.valor > 0).map(p => p.valor),
      valor_total:  parseFloat(valorTotal.toFixed(2)),
      tem_ipi:      temIpi,
      valor_ipi:    valorIpi,
      m2_total:     parseFloat(m2Total.toFixed(4)),
    });
```

- [ ] **Step 9: `saldoPendente` (decide se reconcilia lançamentos)**

Localizar (linha 441):

```ts
    const saldoPendente = parseFloat((valorTotal - valorRecebidoOriginal).toFixed(2));
```

Substituir por:

```ts
    const saldoPendente = parseFloat((valorComIpiCalc - valorRecebidoOriginal).toFixed(2));
```

**Não mexer** no cálculo de comissão logo abaixo (`valorTotal *
vendedor.comissao_pct / 100`, por volta da linha 467) — continua sobre
o valor puro.

- [ ] **Step 10: Checkbox na seção de parcelas/pagamento**

Esta página não tem uma seção "FINANCEIRO" com cabeçalho como a de
criar pedido — as informações financeiras ficam num box mais simples
em torno da lista de parcelas. Localizar (linhas 591-594):

```tsx
            <div style={{ marginTop:"10px", padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"10px", textTransform:"uppercase" }}>
                {parcelas === 1 ? "Pagamento" : `Parcelas (${parcelas}x)`}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
```

Substituir por:

```tsx
            <div style={{ marginTop:"10px", padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"10px", textTransform:"uppercase" }}>
                {parcelas === 1 ? "Pagamento" : `Parcelas (${parcelas}x)`}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                <input name="tem_ipi" type="checkbox" checked={temIpi} onChange={e => setTemIpi(e.target.checked)} />
                Tem IPI ({ALIQ_IPI_PEDIDO}%)
                {temIpi && <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--warn)", marginLeft: "4px" }}>— {formatBRL(valorIpi)}</span>}
              </label>
              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
```

Há dois displays de "Valor Total" nesta página — a sidebar "Resumo" e
uma "totbar" fixa embaixo da lista de itens. Localizar o primeiro
(linhas 640-641, sidebar):

```tsx
            <div className="sr"><div className="sl">Valor Total</div><div className="sv" style={{ color:"var(--acc)", fontSize:"18px" }}>{formatBRL(valorTotal)}</div></div>
            {parcelas > 1 && <div className="sr"><div className="sl">Por Parcela</div><div className="sv">{formatBRL(valorTotal / parcelas)}</div></div>}
```

Substituir por:

```tsx
            <div className="sr"><div className="sl">Valor Total</div><div className="sv" style={{ color:"var(--acc)", fontSize:"18px" }}>{formatBRL(valorComIpiCalc)}</div></div>
            {parcelas > 1 && <div className="sr"><div className="sl">Por Parcela</div><div className="sv">{formatBRL(valorComIpiCalc / parcelas)}</div></div>}
```

(A linha seguinte, `valorTotal < tab.min`, continua em `valorTotal`
puro de propósito — mesmo padrão do Step 7 da Task 2.)

Localizar o segundo (linha 815, totbar):

```tsx
            <div className="ti"><div className="tl">Valor Total</div><div className="tv" style={{ color:"var(--acc)" }}>{formatBRL(valorTotal)}</div></div>
```

Substituir por:

```tsx
            <div className="ti"><div className="tl">Valor Total</div><div className="tv" style={{ color:"var(--acc)" }}>{formatBRL(valorComIpiCalc)}</div></div>
```

Localizar (linha 646, mensagem do botão salvar):

```tsx
              {salvando ? "Salvando..." : `✓ Salvar Alterações · ${formatBRL(valorTotal)}`}
```

Substituir por:

```tsx
              {salvando ? "Salvando..." : `✓ Salvar Alterações · ${formatBRL(valorComIpiCalc)}`}
```

- [ ] **Step 11: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros.

- [ ] **Step 12: Commit**

```bash
git add app/pedidos/[id]/editar/page.tsx
git commit -m "feat: checkbox de IPI na edição de pedido"
```

---

### Task 4: Tela de visualização (`app/pedidos/[id]/page.tsx`)

**Files:**
- Modify: `app/pedidos/[id]/page.tsx`

**Interfaces:**
- Consumes: `ALIQ_IPI_PEDIDO`, `valorComIpi` (Task 1); `Pedido.tem_ipi`/`valor_ipi` (Task 2)

- [ ] **Step 1: Import**

Localizar (linha 12):

```ts
import { formatBRL, formatDate, formatDuracao, medidaReal } from "@/lib/formatters";
```

Substituir por:

```ts
import { formatBRL, formatDate, formatDuracao, medidaReal } from "@/lib/formatters";
import { ALIQ_IPI_PEDIDO, valorComIpi } from "@/lib/pedidoIpi";
```

- [ ] **Step 2: `aberto`/`quitado`/`pctRec`**

Localizar (linhas 776-778):

```ts
  const aberto       = Number(pedido.valor_total) - Number(pedido.valor_recebido);
  const quitado      = aberto <= 0;
  const pctRec       = pedido.valor_total > 0 ? Math.min(100, (Number(pedido.valor_recebido) / Number(pedido.valor_total)) * 100) : 0;
```

Substituir por:

```ts
  const totalComIpi  = valorComIpi(pedido);
  const aberto       = totalComIpi - Number(pedido.valor_recebido);
  const quitado      = aberto <= 0;
  const pctRec       = totalComIpi > 0 ? Math.min(100, (Number(pedido.valor_recebido) / totalComIpi) * 100) : 0;
```

- [ ] **Step 3: Card FINANCEIRO — tile "Total" + linha de IPI**

Localizar (linhas 1038-1042):

```tsx
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", marginBottom:"14px" }}>
                <div style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", marginBottom:"4px" }}>Total</div>
                  <div style={{ fontSize:"14px", fontWeight:800, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(pedido.valor_total)}</div>
                </div>
```

Substituir por:

```tsx
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", marginBottom:"14px" }}>
                <div style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", marginBottom:"4px" }}>Total</div>
                  <div style={{ fontSize:"14px", fontWeight:800, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(totalComIpi)}</div>
                </div>
```

Localizar (fecha o grid dos 3 tiles, logo antes de "Barra de
progresso" — linhas 1051-1053):

```tsx
              </div>

              {/* Barra de progresso */}
```

Substituir por:

```tsx
              </div>

              {pedido.tem_ipi && (
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginBottom:"10px" }}>
                  <span>IPI ({ALIQ_IPI_PEDIDO}% sobre {formatBRL(pedido.valor_total)})</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", color:"var(--warn)" }}>{formatBRL(pedido.valor_ipi)}</span>
                </div>
              )}

              {/* Barra de progresso */}
```

- [ ] **Step 4: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/pedidos/[id]/page.tsx
git commit -m "feat: card financeiro do pedido mostra IPI e total com imposto"
```

---

### Task 5: Serviços agregados (`dre.service.ts` + `pedidos.service.ts`)

**Files:**
- Modify: `services/dre.service.ts`
- Modify: `services/pedidos.service.ts`

**Interfaces:**
- Consumes: `valorComIpi` (Task 1); `Pedido.valor_ipi` (Task 2)

- [ ] **Step 1: `services/dre.service.ts` — Receita Bruta**

Localizar (linhas 90-98):

```ts
  const [pedidosRes, despesasRes, devolucoesRes, cmvPeriodo] = await Promise.all([
    supabase.from('pedidos').select('id, valor_total').neq('status', 'Cancelado').gte('dt_pedido', ini).lte('dt_pedido', fim),
    supabase.from('lancamentos').select('valor, vencimento, plano_contas(descricao)').eq('tipo', 'Saída').eq('natureza', 'normal').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    supabase.from('lancamentos').select('valor').eq('natureza', 'devolucao').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    getCMVPeriodo(ini, fim),
  ]);

  const pedidos = (pedidosRes.data ?? []) as Array<{ id: string; valor_total: number }>;
  const receitaBruta = parseFloat(pedidos.reduce((a, p) => a + (Number(p.valor_total) || 0), 0).toFixed(2));
```

Substituir por:

```ts
  const [pedidosRes, despesasRes, devolucoesRes, cmvPeriodo] = await Promise.all([
    supabase.from('pedidos').select('id, valor_total, valor_ipi').neq('status', 'Cancelado').gte('dt_pedido', ini).lte('dt_pedido', fim),
    supabase.from('lancamentos').select('valor, vencimento, plano_contas(descricao)').eq('tipo', 'Saída').eq('natureza', 'normal').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    supabase.from('lancamentos').select('valor').eq('natureza', 'devolucao').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    getCMVPeriodo(ini, fim),
  ]);

  const pedidos = (pedidosRes.data ?? []) as Array<{ id: string; valor_total: number; valor_ipi: number }>;
  const receitaBruta = parseFloat(pedidos.reduce((a, p) => a + (Number(p.valor_total) || 0) + (Number(p.valor_ipi) || 0), 0).toFixed(2));
```

(`cmv`, calculado logo abaixo via `getCMVPeriodo`, não é tocado — CMV
é custo do produto, sem relação com IPI.)

- [ ] **Step 2: `services/pedidos.service.ts` — imports**

Localizar (linha 1-2):

```ts
import { supabase } from '@/lib/supabase/client';
import type { Pedido, PedidoInsert, PedidoUpdate, ItemPedido, ItemPedidoInsert, StatusPedido } from '@/types';
```

Substituir por:

```ts
import { supabase } from '@/lib/supabase/client';
import type { Pedido, PedidoInsert, PedidoUpdate, ItemPedido, ItemPedidoInsert, StatusPedido } from '@/types';
import { valorComIpi } from '@/lib/pedidoIpi';
```

- [ ] **Step 3: `getPedidosPaginado` — abas Aberto/Quitado**

Localizar (linhas 44-52):

```ts
  let financialIds: string[] | null = null;
  if (tab === 'aberto' || tab === 'quitado') {
    const { data: all } = await supabase.from('pedidos').select('id, valor_total, valor_recebido');
    financialIds = ((all ?? []) as Array<{ id: string; valor_total: number; valor_recebido: number }>)
      .filter(r => tab === 'aberto'
        ? Number(r.valor_recebido) < Number(r.valor_total)
        : Number(r.valor_recebido) >= Number(r.valor_total))
      .map(r => r.id);
  }
```

Substituir por:

```ts
  let financialIds: string[] | null = null;
  if (tab === 'aberto' || tab === 'quitado') {
    const { data: all } = await supabase.from('pedidos').select('id, valor_total, valor_ipi, valor_recebido');
    financialIds = ((all ?? []) as Array<{ id: string; valor_total: number; valor_ipi: number; valor_recebido: number }>)
      .filter(r => tab === 'aberto'
        ? Number(r.valor_recebido) < valorComIpi(r)
        : Number(r.valor_recebido) >= valorComIpi(r))
      .map(r => r.id);
  }
```

- [ ] **Step 4: `getPedidosTotais`**

Localizar (linhas 90-104):

```ts
export async function getPedidosTotais(busca?: string): Promise<PedidosTotais> {
  let query = supabase.from('pedidos').select('valor_total, valor_recebido, status');
  const termo = busca?.trim();
  if (termo) query = query.or(await buildFiltroBuscaOr(termo));

  const { data, error } = await query;
  if (error) { console.error('getPedidosTotais:', error); return { count: 0, valorTotal: 0, recebido: 0, emProducao: 0, aguardandoOtim: 0 }; }
  const rows = (data ?? []) as Array<{ valor_total: number; valor_recebido: number; status: string }>;
  return {
    count:          rows.length,
    valorTotal:     rows.reduce((a, r) => a + Number(r.valor_total), 0),
    recebido:       rows.reduce((a, r) => a + Number(r.valor_recebido), 0),
    emProducao:     rows.filter(r => r.status.startsWith('Em Produção')).length,
    aguardandoOtim: rows.filter(r => r.status === 'Aguardando otimização').length,
  };
}
```

Substituir por:

```ts
export async function getPedidosTotais(busca?: string): Promise<PedidosTotais> {
  let query = supabase.from('pedidos').select('valor_total, valor_ipi, valor_recebido, status');
  const termo = busca?.trim();
  if (termo) query = query.or(await buildFiltroBuscaOr(termo));

  const { data, error } = await query;
  if (error) { console.error('getPedidosTotais:', error); return { count: 0, valorTotal: 0, recebido: 0, emProducao: 0, aguardandoOtim: 0 }; }
  const rows = (data ?? []) as Array<{ valor_total: number; valor_ipi: number; valor_recebido: number; status: string }>;
  return {
    count:          rows.length,
    valorTotal:     rows.reduce((a, r) => a + valorComIpi(r), 0),
    recebido:       rows.reduce((a, r) => a + Number(r.valor_recebido), 0),
    emProducao:     rows.filter(r => r.status.startsWith('Em Produção')).length,
    aguardandoOtim: rows.filter(r => r.status === 'Aguardando otimização').length,
  };
}
```

- [ ] **Step 5: `registrarRecebimento`**

Localizar (linha 393-394):

```ts
  const aberto    = Number(pedido.valor_total) - Number(pedido.valor_recebido);
  const aplicado  = Math.min(valor, aberto);
```

Substituir por:

```ts
  const aberto    = valorComIpi(pedido) - Number(pedido.valor_recebido);
  const aplicado  = Math.min(valor, aberto);
```

- [ ] **Step 6: `utilizarCreditoEmPedido`**

Localizar (linha 468):

```ts
  const aberto        = Number(pedido.valor_total) - Number(pedido.valor_recebido);
```

Substituir por:

```ts
  const aberto        = valorComIpi(pedido) - Number(pedido.valor_recebido);
```

- [ ] **Step 7: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros.

- [ ] **Step 8: Commit**

```bash
git add services/dre.service.ts services/pedidos.service.ts
git commit -m "feat: DRE e serviços de pedido consideram IPI no valor a receber"
```

---

### Task 6: Telas agregadas (Dashboard, Relatórios, listas, Produção)

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/relatorios/page.tsx`
- Modify: `app/pedidos/page.tsx`
- Modify: `app/clientes/[id]/page.tsx`
- Modify: `app/producao/page.tsx`

**Interfaces:**
- Consumes: `valorComIpi` (Task 1); `Pedido.valor_ipi` (Task 2)

- [ ] **Step 1: `app/dashboard/page.tsx` — Top Clientes**

Localizar (linha 12):

```ts
import { formatBRL, formatPercent } from "@/lib/formatters";
```

Substituir por:

```ts
import { formatBRL, formatPercent } from "@/lib/formatters";
import { valorComIpi } from "@/lib/pedidoIpi";
```

Localizar (linha 150):

```ts
      entry.total    += Number(p.valor_total);
```

Substituir por:

```ts
      entry.total    += valorComIpi(p);
```

- [ ] **Step 2: `app/relatorios/page.tsx` — 3 pontos**

Localizar (linha 11):

```ts
import { formatBRL, formatPercent, formatDuracao } from "@/lib/formatters";
```

Substituir por:

```ts
import { formatBRL, formatPercent, formatDuracao } from "@/lib/formatters";
import { valorComIpi } from "@/lib/pedidoIpi";
```

Localizar (linha 1401):

```ts
                const valAtivos = pedAtivos.reduce((a, p) => a + Number(p.valor_total), 0);
```

Substituir por:

```ts
                const valAtivos = pedAtivos.reduce((a, p) => a + valorComIpi(p), 0);
```

Localizar (linha 1539):

```ts
                const valAtiv = ativos.reduce((a, p) => a + Number(p.valor_total), 0);
```

Substituir por:

```ts
                const valAtiv = ativos.reduce((a, p) => a + valorComIpi(p), 0);
```

Localizar (linha 1562):

```ts
                    const vTotal = grupo.reduce((a, p) => a + Number(p.valor_total), 0);
```

Substituir por:

```ts
                    const vTotal = grupo.reduce((a, p) => a + valorComIpi(p), 0);
```

- [ ] **Step 3: `app/pedidos/page.tsx` — coluna "Valor" e aberto/quitado**

Localizar (linha 8):

```ts
import { formatBRL, formatDate } from "@/lib/formatters";
```

Substituir por:

```ts
import { formatBRL, formatDate } from "@/lib/formatters";
import { valorComIpi } from "@/lib/pedidoIpi";
```

Localizar (linha 333):

```ts
                  const aberto        = p.valor_total - p.valor_recebido;
```

Substituir por:

```ts
                  const aberto        = valorComIpi(p) - p.valor_recebido;
```

Localizar (linha 383):

```tsx
                      <td className="mono">{formatBRL(p.valor_total)}</td>
```

Substituir por:

```tsx
                      <td className="mono">{formatBRL(valorComIpi(p))}</td>
```

- [ ] **Step 4: `app/clientes/[id]/page.tsx` — histórico de pedidos**

Localizar (linha 7):

```ts
import { formatBRL, formatDate, formatPercent } from "@/lib/formatters";
```

Substituir por:

```ts
import { formatBRL, formatDate, formatPercent } from "@/lib/formatters";
import { valorComIpi } from "@/lib/pedidoIpi";
```

Localizar (linhas 361-366):

```tsx
                  {pedidos.map(p => {
                    const aberto  = Number(p.valor_total) - Number(p.valor_recebido);
                    const quitado = aberto <= 0;
                    return (
                      <tr key={p.id}>
                        <td><span className="mono" style={{ color:"var(--acc)" }}>{p.id}</span></td>
                        <td className="mono">{formatDate(p.dt_pedido)}</td>
                        <td className="mono">{formatDate(p.dt_retirada)}</td>
                        <td className="mono">{Number(p.m2_total).toFixed(2)} m²</td>
                        <td className="mono">{formatBRL(p.valor_total)}</td>
```

Substituir por:

```tsx
                  {pedidos.map(p => {
                    const aberto  = valorComIpi(p) - Number(p.valor_recebido);
                    const quitado = aberto <= 0;
                    return (
                      <tr key={p.id}>
                        <td><span className="mono" style={{ color:"var(--acc)" }}>{p.id}</span></td>
                        <td className="mono">{formatDate(p.dt_pedido)}</td>
                        <td className="mono">{formatDate(p.dt_retirada)}</td>
                        <td className="mono">{Number(p.m2_total).toFixed(2)} m²</td>
                        <td className="mono">{formatBRL(valorComIpi(p))}</td>
```

- [ ] **Step 5: `app/producao/page.tsx` — valor total do kanban**

Localizar (linha 7):

```ts
import { formatBRL, formatDate, formatM2, formatDuracao } from "@/lib/formatters";
```

Substituir por:

```ts
import { formatBRL, formatDate, formatM2, formatDuracao } from "@/lib/formatters";
import { valorComIpi } from "@/lib/pedidoIpi";
```

Localizar (linha 99):

```ts
  const totalVal = pedidos.reduce((a, p) => a + Number(p.valor_total), 0);
```

Substituir por:

```ts
  const totalVal = pedidos.reduce((a, p) => a + valorComIpi(p), 0);
```

- [ ] **Step 6: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/page.tsx app/relatorios/page.tsx app/pedidos/page.tsx app/clientes/[id]/page.tsx app/producao/page.tsx
git commit -m "feat: Dashboard, Relatorios, listas e Producao somam IPI no valor do pedido"
```

---

### Task 7: SQL das views (`financeiro_clientes`, `faturamento_mensal`)

**Files:**
- Create: `sql/ipi-pedidos-views.sql`

**Interfaces:** N/A (SQL puro, sem código TypeScript)

- [ ] **Step 1: Escrever o SQL**

Criar `sql/ipi-pedidos-views.sql`:

```sql
-- ============================================================
-- IPI nos Pedidos — ajusta views de faturamento pra somar o IPI
-- Views não estavam versionadas no repo; definições atuais obtidas
-- via pg_get_viewdef() e coladas pelo usuário em 2026-07-16.
-- Ver docs/superpowers/specs/2026-07-16-ipi-pedidos-design.md
--
-- Rodar no SQL Editor do Supabase, DEPOIS de sql/ipi-pedidos.sql
-- (precisa que pedidos.valor_ipi já exista).
-- ============================================================

create or replace view public.financeiro_clientes as
 SELECT c.id AS cliente_id,
    c.nome AS cliente_nome,
    c.cidade,
    COALESCE(sum(p.valor_total + p.valor_ipi), 0::numeric) AS faturado,
    COALESCE(sum(p.valor_recebido), 0::numeric) AS recebido,
    COALESCE(sum(p.valor_total + p.valor_ipi - p.valor_recebido), 0::numeric) AS a_receber,
    count(p.id) AS total_pedidos,
        CASE
            WHEN COALESCE(sum(p.valor_total + p.valor_ipi), 0::numeric) = 0::numeric THEN 0::numeric
            ELSE round(COALESCE(sum(p.valor_recebido), 0::numeric) / COALESCE(sum(p.valor_total + p.valor_ipi), 1::numeric) * 100::numeric, 2)
        END AS pct_recebido
   FROM clientes c
     LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.status <> 'Cancelado'::text
  GROUP BY c.id, c.nome, c.cidade;

create or replace view public.faturamento_mensal as
 SELECT EXTRACT(year FROM dt_pedido)::integer AS ano,
    EXTRACT(month FROM dt_pedido)::integer AS mes,
    sum(valor_total + valor_ipi) AS faturado,
    sum(valor_recebido) AS recebido,
    count(*) AS total_pedidos
   FROM pedidos
  WHERE status <> 'Cancelado'::text
  GROUP BY (EXTRACT(year FROM dt_pedido)::integer), (EXTRACT(month FROM dt_pedido)::integer)
  ORDER BY (EXTRACT(year FROM dt_pedido)::integer), (EXTRACT(month FROM dt_pedido)::integer);

-- ── Verificação ─────────────────────────────────────────────
-- select * from public.financeiro_clientes order by faturado desc limit 5;
-- select * from public.faturamento_mensal order by ano desc, mes desc limit 5;
```

- [ ] **Step 2: Commit**

```bash
git add sql/ipi-pedidos-views.sql
git commit -m "docs: SQL das views financeiro_clientes/faturamento_mensal com IPI"
```

(Este SQL só tem efeito quando o usuário rodar manualmente no
Supabase — mesmo padrão de todo `sql/*.sql` deste projeto.)

---

### Task 8: Verificação manual (fluxo completo)

**Files:** nenhum (só validação)

**Interfaces:** N/A

- [ ] **Step 1: Rodar suíte completa e build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Confirmar que o SQL rodou**

Perguntar ao usuário se `sql/ipi-pedidos.sql` e
`sql/ipi-pedidos-views.sql` já foram rodados no Supabase antes de
prosseguir com testes que dependem de `pedidos.valor_ipi` existir.

- [ ] **Step 3: Criar um pedido novo com IPI**

Subir o dev server, criar um pedido de teste, marcar "Tem IPI", conferir:
- Box "Total" e sidebar mostram produto + 6,5%
- Parcelas somam esse total (se ajustar manualmente uma parcela, o
  aviso de "soma difere do total" compara com o valor certo)
- Salvar e abrir a tela de visualização: linha "IPI" aparece no card
  FINANCEIRO, "Total"/"Aberto"/barra de recebimento batem com produto+IPI

- [ ] **Step 4: Editar um pedido já lançado (retroativo)**

Abrir um pedido existente já quitado (sem IPI), ir em editar, marcar
"Tem IPI", salvar. Conferir:
- Volta pra "Em aberto" com o valor do IPI faltando (não mexeu nas
  parcelas já pagas — só criou um saldo novo do tamanho do IPI)
- Comissão do vendedor (se houver) não mudou

- [ ] **Step 5: Conferir relatórios agregados**

No mês desse pedido de teste, conferir que Dashboard (Top Clientes),
DRE (Receita Bruta), Relatórios (pipeline/ticket médio), lista de
Pedidos e tela do Cliente mostram o valor somado com IPI. Conferir que
Fluxo de Caixa e Contas a Receber também refletem o valor certo (via
lançamentos, sem mudança de código).
