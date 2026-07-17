# Custo de Importação por Lote (Compras) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir lançar uma compra importada com os dados da DI (câmbio,
FOB, tributos, despesas aduaneiras), calcular o custo real não-recuperável
por m² e preenchê-lo nos itens da compra com um clique — de onde ele já
flui pro estoque/CMV/DRE sem nenhuma mudança downstream.

**Architecture:** Colunas novas opcionais em `compras` (uma compra = um
lote/DI), função pura `calcularCustoImportacao()` em `lib/` (única parte
com teste, TDD), e uma seção "Importação" no formulário de compra
existente com resumo ao vivo + botão "Aplicar aos itens". O service
`createCompra` não muda — ele já repassa o objeto da compra direto pro
insert, então os campos novos fluem pelo tipo.

**Tech Stack:** Next.js (App Router, client components), Supabase-js,
TypeScript, Vitest.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-17-custo-importacao-design.md`.
- **Tributos digitados da DI em R$** — sem cálculo por alíquota, sem
  gross-up de ICMS. O sistema só soma e rateia.
- **"Aplicar aos itens" só via botão** — nunca sobrescrever
  `custo_unitario_m2` automaticamente.
- **Defaults de creditabilidade** (Lucro Real): `ipi_creditavel = false`,
  `pis_cofins_creditavel = true`, `icms_creditavel = true`. II e
  despesas aduaneiras NUNCA são creditáveis (sempre custo).
- **Payload condicional** (lição [[feedback-sql-pendente-quebra-save]]):
  os campos novos só entram no payload do `createCompra` quando o
  checkbox "Compra importada" estiver marcado. Compra nacional salva
  exatamente como hoje, mesmo se a migração SQL ainda não tiver rodado.
- Os campos novos no tipo `Compra` são todos **opcionais** (`?`) — os
  call sites existentes de `createCompra`/`CompraInsert` continuam
  compilando sem alteração.
- Arredondamento: valores em R$ com 2 casas; `custoM2` com 4 casas
  (mesmo padrão dos demais custos/m² do sistema).
- TDD só pra `lib/custoImportacao.ts` (código puro). SQL/tipos/página
  verificados via `npx tsc --noEmit` e `npm run build`.
- Commit direto na `main` (workflow padrão do projeto), mensagens em
  português no padrão do `git log --oneline`.
- Este projeto mistura CRLF/LF; se um "Localizar" não casar byte a byte,
  releia o trecho atual do arquivo e monte o `old_string` a partir dele.

---

### Task 1: SQL da migração + `lib/custoImportacao.ts` (TDD)

**Files:**
- Create: `sql/importacao-compras.sql`
- Modify: `sql/MANIFEST.md` (nova linha na tabela)
- Create: `lib/custoImportacao.ts`
- Test: `lib/custoImportacao.test.ts`

**Interfaces:**
- Produces: `calcularCustoImportacao(d: DadosImportacao, m2Total: number): CustoImportacao`
  e os tipos `DadosImportacao`/`CustoImportacao` — exportados de
  `lib/custoImportacao.ts`. Campos de `DadosImportacao` têm exatamente
  os nomes das colunas SQL (snake_case), pra Task 2 poder passar o
  estado do form direto.

- [ ] **Step 1: SQL da migração**

Criar `sql/importacao-compras.sql`:

```sql
-- ============================================================
-- Custo de Importação por Lote — colunas novas em compras
-- Uma compra = um lote/DI. Tributos digitados da DI em R$.
-- Ver docs/superpowers/specs/2026-07-17-custo-importacao-design.md
--
-- Rodar no SQL Editor do Supabase ANTES de usar a seção
-- "Importação" na tela de Compras (o save com o checkbox marcado
-- depende dessas colunas existirem).
-- ============================================================

alter table public.compras
  add column if not exists eh_importacao             boolean not null default false,
  add column if not exists numero_di                 text,
  add column if not exists valor_fob_usd             numeric not null default 0,
  add column if not exists frete_internacional_usd   numeric not null default 0,
  add column if not exists seguro_internacional_usd  numeric not null default 0,
  add column if not exists cambio_usd                numeric not null default 0,
  add column if not exists ii                        numeric not null default 0,
  add column if not exists ipi_importacao            numeric not null default 0,
  add column if not exists pis_cofins_importacao     numeric not null default 0,
  add column if not exists icms_importacao           numeric not null default 0,
  add column if not exists despesas_aduaneiras       numeric not null default 0,
  add column if not exists ipi_creditavel            boolean not null default false,
  add column if not exists pis_cofins_creditavel     boolean not null default true,
  add column if not exists icms_creditavel           boolean not null default true;

-- ── Verificação ─────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='compras'
--    and column_name in ('eh_importacao','cambio_usd','ii','despesas_aduaneiras');
```

- [ ] **Step 2: Registrar no MANIFEST**

Em `sql/MANIFEST.md`, adicionar ao FINAL da tabela (depois da última
linha `| 2026-07-17 | ... |`):

```markdown
| 2026-07-17 | `sql/importacao-compras.sql` | Custo de Importação — câmbio/tributos da DI por compra (14 colunas em compras) | ⏳ |
```

- [ ] **Step 3: Escrever o teste (vai falhar — módulo ainda não existe)**

Criar `lib/custoImportacao.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calcularCustoImportacao, type DadosImportacao } from "./custoImportacao";

const BASE: DadosImportacao = {
  valor_fob_usd: 10000,
  frete_internacional_usd: 800,
  seguro_internacional_usd: 200,
  cambio_usd: 5,
  ii: 6600,
  ipi_importacao: 3000,
  pis_cofins_importacao: 5000,
  icms_importacao: 12000,
  despesas_aduaneiras: 2400,
  ipi_creditavel: false,
  pis_cofins_creditavel: true,
  icms_creditavel: true,
};

describe("calcularCustoImportacao", () => {
  it("calcula valor aduaneiro em BRL: (FOB + frete + seguro) × câmbio", () => {
    const r = calcularCustoImportacao(BASE, 1000);
    expect(r.valorAduaneiroBrl).toBe(55000); // (10000+800+200) × 5
  });

  it("custo desembolsado soma aduaneiro + todos os tributos + despesas", () => {
    const r = calcularCustoImportacao(BASE, 1000);
    expect(r.custoDesembolsado).toBe(84000); // 55000+6600+3000+5000+12000+2400
  });

  it("com defaults do Lucro Real (IPI não creditável), IPI entra no custo e PIS/COFINS+ICMS viram crédito", () => {
    const r = calcularCustoImportacao(BASE, 1000);
    expect(r.custoNaoRecuperavel).toBe(67000); // 55000+6600+2400+3000(IPI)
    expect(r.creditosTributarios).toBe(17000); // 5000+12000
    // invariante: não-recuperável + créditos = desembolsado
    expect(r.custoNaoRecuperavel + r.creditosTributarios).toBe(r.custoDesembolsado);
  });

  it("todos creditáveis: só aduaneiro + II + despesas viram custo", () => {
    const r = calcularCustoImportacao({ ...BASE, ipi_creditavel: true }, 1000);
    expect(r.custoNaoRecuperavel).toBe(64000); // 55000+6600+2400
    expect(r.creditosTributarios).toBe(20000); // 3000+5000+12000
  });

  it("nenhum creditável: custo não-recuperável = desembolsado, créditos = 0", () => {
    const r = calcularCustoImportacao(
      { ...BASE, pis_cofins_creditavel: false, icms_creditavel: false },
      1000,
    );
    expect(r.custoNaoRecuperavel).toBe(84000);
    expect(r.creditosTributarios).toBe(0);
  });

  it("custo/m² = não-recuperável ÷ m² total, com 4 casas", () => {
    const r = calcularCustoImportacao(BASE, 1000);
    expect(r.custoM2).toBe(67); // 67000 / 1000
    const r2 = calcularCustoImportacao(BASE, 933);
    expect(r2.custoM2).toBe(71.8114); // 67000 / 933 = 71.81136... → 71.8114
  });

  it("m² total zero ou negativo: custoM2 = 0 (sem divisão por zero)", () => {
    expect(calcularCustoImportacao(BASE, 0).custoM2).toBe(0);
    expect(calcularCustoImportacao(BASE, -5).custoM2).toBe(0);
  });

  it("arredonda o valor aduaneiro a 2 casas", () => {
    const r = calcularCustoImportacao(
      { ...BASE, valor_fob_usd: 100.333, frete_internacional_usd: 0, seguro_internacional_usd: 0, cambio_usd: 1, ii: 0, ipi_importacao: 0, pis_cofins_importacao: 0, icms_importacao: 0, despesas_aduaneiras: 0 },
      0,
    );
    expect(r.valorAduaneiroBrl).toBe(100.33);
  });

  it("tudo zerado: todos os resultados 0", () => {
    const r = calcularCustoImportacao(
      { ...BASE, valor_fob_usd: 0, frete_internacional_usd: 0, seguro_internacional_usd: 0, cambio_usd: 0, ii: 0, ipi_importacao: 0, pis_cofins_importacao: 0, icms_importacao: 0, despesas_aduaneiras: 0 },
      100,
    );
    expect(r.valorAduaneiroBrl).toBe(0);
    expect(r.custoDesembolsado).toBe(0);
    expect(r.custoNaoRecuperavel).toBe(0);
    expect(r.creditosTributarios).toBe(0);
    expect(r.custoM2).toBe(0);
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/custoImportacao.test.ts`
Expected: FAIL — `Cannot find module './custoImportacao'`.

- [ ] **Step 5: Implementar `lib/custoImportacao.ts`**

```ts
// Custo real de uma compra importada a partir dos valores da DI.
// Tributos entram digitados em R$ (nunca calculados por alíquota aqui).
// II e despesas aduaneiras nunca são creditáveis; IPI/PIS-COFINS/ICMS
// entram no custo apenas quando a flag correspondente for false.
// Ver docs/superpowers/specs/2026-07-17-custo-importacao-design.md

export interface DadosImportacao {
  valor_fob_usd: number;
  frete_internacional_usd: number;
  seguro_internacional_usd: number;
  cambio_usd: number;
  ii: number;
  ipi_importacao: number;
  pis_cofins_importacao: number;
  icms_importacao: number;
  despesas_aduaneiras: number;
  ipi_creditavel: boolean;
  pis_cofins_creditavel: boolean;
  icms_creditavel: boolean;
}

export interface CustoImportacao {
  valorAduaneiroBrl: number;   // (FOB + frete + seguro) × câmbio
  custoDesembolsado: number;   // aduaneiro + todos os tributos + despesas
  custoNaoRecuperavel: number; // aduaneiro + II + despesas + tributos NÃO creditáveis
  creditosTributarios: number; // soma dos tributos creditáveis
  custoM2: number;             // custoNaoRecuperavel / m2Total (0 se m2Total <= 0)
}

const r2 = (v: number) => parseFloat(v.toFixed(2));
const r4 = (v: number) => parseFloat(v.toFixed(4));

export function calcularCustoImportacao(d: DadosImportacao, m2Total: number): CustoImportacao {
  const valorAduaneiroBrl = r2(
    (d.valor_fob_usd + d.frete_internacional_usd + d.seguro_internacional_usd) * d.cambio_usd
  );
  const custoDesembolsado = r2(
    valorAduaneiroBrl + d.ii + d.ipi_importacao + d.pis_cofins_importacao + d.icms_importacao + d.despesas_aduaneiras
  );
  const custoNaoRecuperavel = r2(
    valorAduaneiroBrl + d.ii + d.despesas_aduaneiras
    + (d.ipi_creditavel ? 0 : d.ipi_importacao)
    + (d.pis_cofins_creditavel ? 0 : d.pis_cofins_importacao)
    + (d.icms_creditavel ? 0 : d.icms_importacao)
  );
  const creditosTributarios = r2(
    (d.ipi_creditavel ? d.ipi_importacao : 0)
    + (d.pis_cofins_creditavel ? d.pis_cofins_importacao : 0)
    + (d.icms_creditavel ? d.icms_importacao : 0)
  );
  const custoM2 = m2Total > 0 ? r4(custoNaoRecuperavel / m2Total) : 0;

  return { valorAduaneiroBrl, custoDesembolsado, custoNaoRecuperavel, creditosTributarios, custoM2 };
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/custoImportacao.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add sql/importacao-compras.sql sql/MANIFEST.md lib/custoImportacao.ts lib/custoImportacao.test.ts
git commit -m "feat: schema e cálculo puro do custo de importação por lote"
```

---

### Task 2: Tipo `Compra` + seção Importação no form de compras

**Files:**
- Modify: `types/index.ts` (interface `Compra`, ~linha 228)
- Modify: `app/compras/page.tsx`

**Interfaces:**
- Consumes: `calcularCustoImportacao`, `DadosImportacao` (Task 1).
- Produces: `Compra` ganha 14 campos opcionais com os mesmos nomes das
  colunas SQL. `services/compras.service.ts` NÃO é modificado —
  `createCompra` repassa o objeto direto pro insert, então os campos
  fluem pelo tipo.

- [ ] **Step 1: Tipo `Compra`**

Em `types/index.ts`, localizar:

```ts
export interface Compra {
  id: string;
  fornecedor_id: number | null;
  nf: string | null;
  dt_compra: string;
  condicao_pgto: string | null;
  status: StatusCompra;
  valor_total: number;
  obs: string | null;
  dt_recebimento: string | null;
  created_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome'>;
  compras_itens?: CompraItem[];
}
```

Substituir por:

```ts
export interface Compra {
  id: string;
  fornecedor_id: number | null;
  nf: string | null;
  dt_compra: string;
  condicao_pgto: string | null;
  status: StatusCompra;
  valor_total: number;
  obs: string | null;
  dt_recebimento: string | null;
  // Importação (opcionais — só preenchidos quando eh_importacao = true;
  // ver docs/superpowers/specs/2026-07-17-custo-importacao-design.md)
  eh_importacao?: boolean;
  numero_di?: string | null;
  valor_fob_usd?: number;
  frete_internacional_usd?: number;
  seguro_internacional_usd?: number;
  cambio_usd?: number;
  ii?: number;
  ipi_importacao?: number;
  pis_cofins_importacao?: number;
  icms_importacao?: number;
  despesas_aduaneiras?: number;
  ipi_creditavel?: boolean;
  pis_cofins_creditavel?: boolean;
  icms_creditavel?: boolean;
  created_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome'>;
  compras_itens?: CompraItem[];
}
```

- [ ] **Step 2: Imports e estado em `app/compras/page.tsx`**

Localizar:

```tsx
import ImportarXmlCompraModal, { type DadosImportadosXml } from "@/components/ui/ImportarXmlCompraModal";
```

Substituir por:

```tsx
import ImportarXmlCompraModal, { type DadosImportadosXml } from "@/components/ui/ImportarXmlCompraModal";
import { calcularCustoImportacao, type DadosImportacao } from "@/lib/custoImportacao";
```

Localizar:

```tsx
const FORM_VAZIO = {
  fornecedor_id: "",
  nf: "",
  dt_compra: hoje(),
  condicao_pgto: "",
  obs: "",
};
```

Substituir por:

```tsx
const FORM_VAZIO = {
  fornecedor_id: "",
  nf: "",
  dt_compra: hoje(),
  condicao_pgto: "",
  obs: "",
};

// Defaults de creditabilidade pro Lucro Real: PIS/COFINS e ICMS
// creditáveis; IPI não, até o contador confirmar o enquadramento.
const IMP_VAZIO: DadosImportacao & { numero_di: string } = {
  numero_di: "",
  valor_fob_usd: 0,
  frete_internacional_usd: 0,
  seguro_internacional_usd: 0,
  cambio_usd: 0,
  ii: 0,
  ipi_importacao: 0,
  pis_cofins_importacao: 0,
  icms_importacao: 0,
  despesas_aduaneiras: 0,
  ipi_creditavel: false,
  pis_cofins_creditavel: true,
  icms_creditavel: true,
};
```

Localizar:

```tsx
  const [modalXmlAberto, setModalXmlAberto] = useState(false);
```

Substituir por:

```tsx
  const [modalXmlAberto, setModalXmlAberto] = useState(false);
  const [ehImportacao, setEhImportacao] = useState(false);
  const [imp, setImp] = useState({ ...IMP_VAZIO });
```

- [ ] **Step 3: Derivados e "Aplicar aos itens"**

Localizar:

```tsx
  const valorTotalForm = itens.reduce((a, it) => a + subtotalItem(it), 0);
```

Substituir por:

```tsx
  const valorTotalForm = itens.reduce((a, it) => a + subtotalItem(it), 0);
  const m2TotalForm = itens.reduce((a, it) => a + (Number(it.chapas) || 0) * (Number(it.m2_por_chapa) || 0), 0);
  const resumoImp = calcularCustoImportacao(imp, m2TotalForm);

  function aplicarCustoImportacaoAosItens() {
    setItens(prev => prev.map(it => ({ ...it, custo_unitario_m2: resumoImp.custoM2 })));
    toast(`Custo de ${formatBRL(resumoImp.custoM2)}/m² aplicado a todos os itens`);
  }
```

- [ ] **Step 4: Reset do form limpa a seção Importação**

Localizar:

```tsx
  function resetForm() {
    setForm(FORM_VAZIO);
    setItens([{ ...ITEM_VAZIO }]);
    setXmlPendente(null);
    setShowForm(false);
  }
```

Substituir por:

```tsx
  function resetForm() {
    setForm(FORM_VAZIO);
    setItens([{ ...ITEM_VAZIO }]);
    setXmlPendente(null);
    setEhImportacao(false);
    setImp({ ...IMP_VAZIO });
    setShowForm(false);
  }
```

- [ ] **Step 5: Payload condicional no salvar**

Localizar (dentro de `handleSalvar`):

```tsx
    const res = await createCompra({
      fornecedor_id: Number(form.fornecedor_id),
      nf: form.nf.trim() || null,
      dt_compra: form.dt_compra || hoje(),
      condicao_pgto: form.condicao_pgto.trim() || null,
      valor_total: parseFloat(valorTotal.toFixed(2)),
      obs: form.obs.trim() || null,
    }, itensPayload);
```

Substituir por:

```tsx
    // Campos de importação só entram no payload com o checkbox marcado —
    // compra nacional salva exatamente como antes, mesmo se a migração
    // sql/importacao-compras.sql ainda não tiver rodado no Supabase.
    const camposImportacao = ehImportacao ? {
      eh_importacao: true,
      numero_di: imp.numero_di.trim() || null,
      valor_fob_usd: imp.valor_fob_usd,
      frete_internacional_usd: imp.frete_internacional_usd,
      seguro_internacional_usd: imp.seguro_internacional_usd,
      cambio_usd: imp.cambio_usd,
      ii: imp.ii,
      ipi_importacao: imp.ipi_importacao,
      pis_cofins_importacao: imp.pis_cofins_importacao,
      icms_importacao: imp.icms_importacao,
      despesas_aduaneiras: imp.despesas_aduaneiras,
      ipi_creditavel: imp.ipi_creditavel,
      pis_cofins_creditavel: imp.pis_cofins_creditavel,
      icms_creditavel: imp.icms_creditavel,
    } : {};

    const res = await createCompra({
      fornecedor_id: Number(form.fornecedor_id),
      nf: form.nf.trim() || null,
      dt_compra: form.dt_compra || hoje(),
      condicao_pgto: form.condicao_pgto.trim() || null,
      valor_total: parseFloat(valorTotal.toFixed(2)),
      obs: form.obs.trim() || null,
      ...camposImportacao,
    }, itensPayload);
```

- [ ] **Step 6: Seção Importação no JSX**

Localizar (fim do primeiro grid do form, antes do cabeçalho ITENS):

```tsx
              <Campo labelStyle={labelStyle} label="Condição de Pagamento">
                <input name="condicao_pgto" style={inputStyle} value={form.condicao_pgto} onChange={e => setForm(f => ({ ...f, condicao_pgto: e.target.value }))} placeholder="30/60/90" />
              </Campo>
            </div>

            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "10px" }}>ITENS</div>
```

Substituir por:

```tsx
              <Campo labelStyle={labelStyle} label="Condição de Pagamento">
                <input name="condicao_pgto" style={inputStyle} value={form.condicao_pgto} onChange={e => setForm(f => ({ ...f, condicao_pgto: e.target.value }))} placeholder="30/60/90" />
              </Campo>
            </div>

            {/* ── IMPORTAÇÃO ── */}
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", fontSize: "13px", color: "var(--t2)", cursor: "pointer" }}>
              <input name="eh_importacao" type="checkbox" checked={ehImportacao} onChange={e => setEhImportacao(e.target.checked)} />
              Compra importada (custo real via DI)
            </label>

            {ehImportacao && (
              <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "8px", padding: "14px 16px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "12px" }}>IMPORTAÇÃO — VALORES DA DI</div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "12px" }}>
                  <Campo labelStyle={labelStyle} label="Nº da DI">
                    <input name="numero_di" style={inputStyle} value={imp.numero_di} onChange={e => setImp(v => ({ ...v, numero_di: e.target.value }))} placeholder="25/1234567-8" />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="FOB (USD)">
                    <CurrencyInput aria-label="FOB (USD)" style={inputStyle} className="" value={imp.valor_fob_usd} onChange={v => setImp(s => ({ ...s, valor_fob_usd: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="Frete intl. (USD)">
                    <CurrencyInput aria-label="Frete internacional (USD)" style={inputStyle} className="" value={imp.frete_internacional_usd} onChange={v => setImp(s => ({ ...s, frete_internacional_usd: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="Seguro intl. (USD)">
                    <CurrencyInput aria-label="Seguro internacional (USD)" style={inputStyle} className="" value={imp.seguro_internacional_usd} onChange={v => setImp(s => ({ ...s, seguro_internacional_usd: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="Câmbio (R$/USD)">
                    <input name="cambio_usd" style={inputStyle} type="number" min="0" step="0.0001" value={imp.cambio_usd || ""} onChange={e => setImp(s => ({ ...s, cambio_usd: parseFloat(e.target.value) || 0 }))} placeholder="5.0000" />
                  </Campo>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "12px" }}>
                  <Campo labelStyle={labelStyle} label="II (R$)">
                    <CurrencyInput aria-label="II (R$)" style={inputStyle} className="" value={imp.ii} onChange={v => setImp(s => ({ ...s, ii: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="IPI (R$)">
                    <CurrencyInput aria-label="IPI importação (R$)" style={inputStyle} className="" value={imp.ipi_importacao} onChange={v => setImp(s => ({ ...s, ipi_importacao: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="PIS/COFINS (R$)">
                    <CurrencyInput aria-label="PIS/COFINS importação (R$)" style={inputStyle} className="" value={imp.pis_cofins_importacao} onChange={v => setImp(s => ({ ...s, pis_cofins_importacao: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="ICMS (R$)">
                    <CurrencyInput aria-label="ICMS importação (R$)" style={inputStyle} className="" value={imp.icms_importacao} onChange={v => setImp(s => ({ ...s, icms_importacao: v }))} />
                  </Campo>
                  <Campo labelStyle={labelStyle} label="Despesas aduaneiras (R$)">
                    <CurrencyInput aria-label="Despesas aduaneiras (R$)" style={inputStyle} className="" value={imp.despesas_aduaneiras} onChange={v => setImp(s => ({ ...s, despesas_aduaneiras: v }))} />
                  </Campo>
                </div>

                <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                    <input name="ipi_creditavel" type="checkbox" checked={imp.ipi_creditavel} onChange={e => setImp(s => ({ ...s, ipi_creditavel: e.target.checked }))} />
                    IPI creditável <span style={{ color: "var(--t3)", fontSize: "11px" }}>(confirmar com contador)</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                    <input name="pis_cofins_creditavel" type="checkbox" checked={imp.pis_cofins_creditavel} onChange={e => setImp(s => ({ ...s, pis_cofins_creditavel: e.target.checked }))} />
                    PIS/COFINS creditável
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--t2)", cursor: "pointer" }}>
                    <input name="icms_creditavel" type="checkbox" checked={imp.icms_creditavel} onChange={e => setImp(s => ({ ...s, icms_creditavel: e.target.checked }))} />
                    ICMS creditável
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", alignItems: "end" }}>
                  {[
                    { label: "Valor Aduaneiro", valor: resumoImp.valorAduaneiroBrl, cor: "var(--t1)" },
                    { label: "Desembolsado", valor: resumoImp.custoDesembolsado, cor: "var(--t1)" },
                    { label: "Não-Recuperável", valor: resumoImp.custoNaoRecuperavel, cor: "var(--acc)" },
                    { label: "Créditos Tributários", valor: resumoImp.creditosTributarios, cor: "var(--ok)" },
                  ].map(box => (
                    <div key={box.label}>
                      <div style={labelStyle}>{box.label}</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: box.cor, fontFamily: "'DM Mono', monospace" }}>{formatBRL(box.valor)}</div>
                    </div>
                  ))}
                  <div>
                    <div style={labelStyle}>Custo real/m² · {m2TotalForm.toFixed(2)} m²</div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>{formatBRL(resumoImp.custoM2)}</span>
                      <button className="btn bp xs" onClick={aplicarCustoImportacaoAosItens} disabled={m2TotalForm <= 0} title={m2TotalForm <= 0 ? "Lance os itens (chapas e m²/chapa) primeiro" : "Preenche o Custo/m² de todos os itens"}>
                        ↵ Aplicar aos itens
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "10px" }}>ITENS</div>
```

- [ ] **Step 7: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros (o tipo `Compra` mudou — o build
completo confirma que nenhum outro consumidor quebrou).

- [ ] **Step 8: Rodar a suíte completa**

Run: `npx vitest run`
Expected: tudo verde (inclui os 9 testes da Task 1).

- [ ] **Step 9: Commit**

```bash
git add types/index.ts app/compras/page.tsx
git commit -m "feat: seção Importação no form de compras com custo real da DI"
```

---

### Task 3: Verificação manual (fluxo completo)

**Files:** nenhum (só validação)

**Interfaces:** N/A

- [ ] **Step 1: Rodar suíte, tipos e build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Confirmar que o SQL rodou ANTES de testar a tela**

Perguntar ao usuário se `sql/importacao-compras.sql` já foi rodado no
Supabase. **Não prosseguir pros passos 4-5 sem essa confirmação** — o
save com o checkbox marcado depende das colunas existirem (lição
registrada em [[feedback-sql-pendente-quebra-save]]). Quando confirmado,
atualizar `sql/MANIFEST.md` de ⏳ pra ✅ e commitar.

- [ ] **Step 3: Regressão — compra nacional continua igual**

Subir o dev server, criar uma compra normal SEM marcar "Compra
importada" (fornecedor, 1 item, custo/m² manual), salvar e confirmar o
recebimento. Conferir que nada mudou no fluxo (compra salva, entra no
estoque, gera conta a pagar).

- [ ] **Step 4: Compra importada de teste**

Criar uma compra marcando "Compra importada" (usar fornecedor/produto
de teste `__teste_*`, nunca registro real — regra do projeto). Preencher
com números redondos conferíveis de cabeça (ex.: FOB 10.000, frete 800,
seguro 200, câmbio 5,00 → aduaneiro 55.000; II 6.600; IPI 3.000;
PIS/COFINS 5.000; ICMS 12.000; despesas 2.400) e itens somando 1.000 m².
Conferir no resumo: Desembolsado 84.000; com os defaults, Não-Recuperável
67.000, Créditos 17.000, Custo real/m² R$ 67,00. Alternar os checkboxes
de creditabilidade e ver os números se moverem na hora.

- [ ] **Step 5: Aplicar, salvar e ver o custo fluir**

Clicar "↵ Aplicar aos itens" (Custo/m² de cada item vira R$ 67,00),
salvar a compra, confirmar o recebimento, e conferir que a movimentação
de estoque gravou `custo_unitario_m2 = 67` (tela de Estoque ou
`select * from estoque_movimentacoes order by id desc limit 5`).
Por fim, excluir a compra de teste (a exclusão reverte a entrada de
estoque) e o fornecedor/produto `__teste_*`.
