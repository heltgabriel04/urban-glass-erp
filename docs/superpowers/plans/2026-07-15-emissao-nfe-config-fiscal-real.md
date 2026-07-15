# Emissão de NF-e — Ler Configuração Fiscal Real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer os 3 lugares que emitem/pré-calculam NF-e (`emitirNFe`, `emitirNFeCompleta` e a tela "Nova Nota") lerem NCM/CFOP/CST/alíquotas de `config_fiscal_produtos`/`config_fiscal_padrao` em vez de valores fixos no código.

**Architecture:** Um helper puro novo (`lib/fiscal.ts`, sem dependência de Supabase) resolve classificação fiscal (NCM/CFOP/CST, por produto com fallback pro padrão) e tributos (ICMS/PIS/COFINS/IPI, sempre do padrão) a partir de dados já buscados. Uma função nova de acesso a dado (`getConfigFiscalProdutos`) busca só as linhas de produto relevantes pra nota atual. Os 3 call sites passam a buscar a config e chamar o helper em vez de hardcodar.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Supabase / vitest.

## Global Constraints

- Regime tributário da empresa é Lucro Real (confirmado pelo usuário) — não implementar branch de Simples Nacional/CSOSN.
- Não mudar `registrarBaixa`, lógica de pagamento, nem qualquer coisa fora da emissão/pré-cálculo de NF-e.
- Não adicionar campos de IBS/CBS nesta leva (passo futuro, depende de resposta da Focus NFe).
- Não mudar o hardcode de `"MG"` que decide dentro/fora do estado.
- Todo arquivo `.sql` novo — não se aplica aqui, esta leva não muda schema.
- `tsc --noEmit` e `npm run test` devem passar limpos ao final de cada task.

---

### Task 1: `lib/fiscal.ts` — helper de resolução fiscal

**Files:**
- Create: `lib/fiscal.ts`
- Test: `lib/fiscal.test.ts`

**Interfaces:**
- Consumes: `ConfigFiscalPadrao`, `ConfigFiscalProduto` de `@/types` (já existem, sem mudança).
- Produces:
  - `resolverClassificacaoFiscal(produtoId: number | null, dentroEstado: boolean, configProdutos: Map<number, ConfigFiscalProduto>, configPadrao: ConfigFiscalPadrao): { ncm: string; cfop: string; cst: string }`
  - `calcularTributosItem(valorBruto: number, ipiPct: number, dentroEstado: boolean, configPadrao: ConfigFiscalPadrao): { aliq_icms: number; valor_icms: number; aliq_pis: number; valor_pis: number; aliq_cofins: number; valor_cofins: number; aliq_ipi: number; valor_ipi: number }`
  - `resolverFiscalItem(params: { produtoId: number | null; valorBruto: number; dentroEstado: boolean; ipiPctManual?: number; configProdutos: Map<number, ConfigFiscalProduto>; configPadrao: ConfigFiscalPadrao }): ResolucaoFiscalItem` (união dos dois retornos acima) — usado por Task 3 e Task 5.

- [ ] **Step 1: Escrever os testes que devem falhar**

Criar `lib/fiscal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolverClassificacaoFiscal, calcularTributosItem, resolverFiscalItem } from "./fiscal";
import type { ConfigFiscalPadrao, ConfigFiscalProduto } from "@/types";

const PADRAO: ConfigFiscalPadrao = {
  id: 1, regime: "normal",
  aliq_icms_dentro: 18, aliq_icms_fora: 12,
  aliq_pis: 1.65, aliq_cofins: 7.6, aliq_ipi: 0,
  cst_icms_padrao: "00",
  cfop_dentro_padrao: "5102", cfop_fora_padrao: "6102",
  ncm_padrao: "70031200",
  updated_at: "",
};

const PRODUTO_VIDRO_TEMPERADO: ConfigFiscalProduto = {
  produto_id: 42,
  ncm: "70071900",
  cfop_dentro: "5101", cfop_fora: "6101",
  cst_icms: "40",
  aliq_icms: 18, aliq_pis: 1.65, aliq_cofins: 7.6, aliq_ipi: 0,
  updated_at: "",
};

describe("resolverClassificacaoFiscal", () => {
  it("usa a config do produto quando existe override, CFOP dentro do estado", () => {
    const map = new Map([[42, PRODUTO_VIDRO_TEMPERADO]]);
    expect(resolverClassificacaoFiscal(42, true, map, PADRAO)).toEqual({
      ncm: "70071900", cfop: "5101", cst: "40",
    });
  });

  it("usa a config do produto quando existe override, CFOP fora do estado", () => {
    const map = new Map([[42, PRODUTO_VIDRO_TEMPERADO]]);
    expect(resolverClassificacaoFiscal(42, false, map, PADRAO)).toEqual({
      ncm: "70071900", cfop: "6101", cst: "40",
    });
  });

  it("cai pro padrão quando o produto não tem override", () => {
    const map = new Map<number, ConfigFiscalProduto>();
    expect(resolverClassificacaoFiscal(99, true, map, PADRAO)).toEqual({
      ncm: "70031200", cfop: "5102", cst: "00",
    });
  });

  it("cai pro padrão quando o item não tem produto vinculado (avulso)", () => {
    const map = new Map([[42, PRODUTO_VIDRO_TEMPERADO]]);
    expect(resolverClassificacaoFiscal(null, true, map, PADRAO)).toEqual({
      ncm: "70031200", cfop: "5102", cst: "00",
    });
  });
});

describe("calcularTributosItem", () => {
  it("calcula ICMS/PIS/COFINS com as alíquotas do padrão, dentro do estado", () => {
    const r = calcularTributosItem(1000, 0, true, PADRAO);
    expect(r.aliq_icms).toBe(18);
    expect(r.valor_icms).toBeCloseTo(180, 2);
    expect(r.aliq_pis).toBe(1.65);
    expect(r.valor_pis).toBeCloseTo(16.5, 2);
    expect(r.aliq_cofins).toBe(7.6);
    expect(r.valor_cofins).toBeCloseTo(76, 2);
    expect(r.valor_ipi).toBe(0);
  });

  it("usa a alíquota de ICMS de fora do estado quando dentroEstado é false", () => {
    const r = calcularTributosItem(1000, 0, false, PADRAO);
    expect(r.aliq_icms).toBe(12);
    expect(r.valor_icms).toBeCloseTo(120, 2);
  });

  it("calcula IPI a partir do percentual manual informado", () => {
    const r = calcularTributosItem(1000, 5, true, PADRAO);
    expect(r.aliq_ipi).toBe(5);
    expect(r.valor_ipi).toBeCloseTo(50, 2);
  });
});

describe("resolverFiscalItem", () => {
  it("combina classificação e tributos num único resultado", () => {
    const map = new Map([[42, PRODUTO_VIDRO_TEMPERADO]]);
    const r = resolverFiscalItem({
      produtoId: 42, valorBruto: 1000, dentroEstado: true,
      configProdutos: map, configPadrao: PADRAO,
    });
    expect(r.ncm).toBe("70071900");
    expect(r.cfop).toBe("5101");
    expect(r.cst).toBe("40");
    expect(r.valor_icms).toBeCloseTo(180, 2);
    expect(r.valor_ipi).toBe(0);
  });

  it("assume ipiPctManual = 0 quando omitido", () => {
    const map = new Map<number, ConfigFiscalProduto>();
    const r = resolverFiscalItem({
      produtoId: null, valorBruto: 500, dentroEstado: true,
      configProdutos: map, configPadrao: PADRAO,
    });
    expect(r.valor_ipi).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/fiscal.test.ts`
Expected: FAIL — `Cannot find module './fiscal'` (o arquivo `lib/fiscal.ts` ainda não existe).

- [ ] **Step 3: Criar `lib/fiscal.ts`**

```ts
import type { ConfigFiscalPadrao, ConfigFiscalProduto } from "@/types";

export interface ClassificacaoFiscal {
  ncm: string;
  cfop: string;
  cst: string;
}

export function resolverClassificacaoFiscal(
  produtoId: number | null,
  dentroEstado: boolean,
  configProdutos: Map<number, ConfigFiscalProduto>,
  configPadrao: ConfigFiscalPadrao
): ClassificacaoFiscal {
  const config = produtoId != null ? configProdutos.get(produtoId) : undefined;
  if (config) {
    return {
      ncm: config.ncm,
      cfop: dentroEstado ? config.cfop_dentro : config.cfop_fora,
      cst: config.cst_icms,
    };
  }
  return {
    ncm: configPadrao.ncm_padrao,
    cfop: dentroEstado ? configPadrao.cfop_dentro_padrao : configPadrao.cfop_fora_padrao,
    cst: configPadrao.cst_icms_padrao,
  };
}

export interface TributosItem {
  aliq_icms: number; valor_icms: number;
  aliq_pis: number; valor_pis: number;
  aliq_cofins: number; valor_cofins: number;
  aliq_ipi: number; valor_ipi: number;
}

export function calcularTributosItem(
  valorBruto: number,
  ipiPct: number,
  dentroEstado: boolean,
  configPadrao: ConfigFiscalPadrao
): TributosItem {
  const aliqIcms = dentroEstado ? configPadrao.aliq_icms_dentro : configPadrao.aliq_icms_fora;
  return {
    aliq_icms: aliqIcms,
    valor_icms: valorBruto * (aliqIcms / 100),
    aliq_pis: configPadrao.aliq_pis,
    valor_pis: valorBruto * (configPadrao.aliq_pis / 100),
    aliq_cofins: configPadrao.aliq_cofins,
    valor_cofins: valorBruto * (configPadrao.aliq_cofins / 100),
    aliq_ipi: ipiPct,
    valor_ipi: valorBruto * (ipiPct / 100),
  };
}

export interface ResolucaoFiscalItem extends ClassificacaoFiscal, TributosItem {}

export function resolverFiscalItem(params: {
  produtoId: number | null;
  valorBruto: number;
  dentroEstado: boolean;
  ipiPctManual?: number;
  configProdutos: Map<number, ConfigFiscalProduto>;
  configPadrao: ConfigFiscalPadrao;
}): ResolucaoFiscalItem {
  const classificacao = resolverClassificacaoFiscal(
    params.produtoId, params.dentroEstado, params.configProdutos, params.configPadrao
  );
  const tributos = calcularTributosItem(
    params.valorBruto, params.ipiPctManual ?? 0, params.dentroEstado, params.configPadrao
  );
  return { ...classificacao, ...tributos };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/fiscal.test.ts`
Expected: PASS — 9 testes verdes.

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add lib/fiscal.ts lib/fiscal.test.ts
git commit -m "feat: helper de resolução fiscal por item (NCM/CFOP/CST/tributos)"
```

---

### Task 2: `getConfigFiscalProdutos` em `services/contabilidade.service.ts`

**Files:**
- Modify: `services/contabilidade.service.ts:60` (logo após `getProdutosComConfigFiscal`, antes da interface `ConfigFiscalProdutoInput`)

**Interfaces:**
- Consumes: nada novo (usa `supabase` já importado no arquivo, tabela `config_fiscal_produtos` já existente).
- Produces: `getConfigFiscalProdutos(produtoIds: number[]): Promise<Map<number, ConfigFiscalProduto>>` — usado por Task 3 e Task 5.

- [ ] **Step 1: Adicionar a função**

Inserir depois da linha 60 (`return (prods ?? []).map(...)`, fechamento de `getProdutosComConfigFiscal`) e antes de `export interface ConfigFiscalProdutoInput`:

```ts
export async function getConfigFiscalProdutos(
  produtoIds: number[]
): Promise<Map<number, ConfigFiscalProduto>> {
  if (produtoIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("config_fiscal_produtos")
    .select("*")
    .in("produto_id", produtoIds);
  if (error) { console.error("getConfigFiscalProdutos:", error); return new Map(); }
  return new Map((data ?? []).map((c) => [c.produto_id, c as ConfigFiscalProduto]));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros. (Sem teste automatizado aqui — é acesso direto a Supabase, mesmo padrão das outras funções deste arquivo, nenhuma delas tem teste unitário hoje.)

- [ ] **Step 3: Commit**

```bash
git add services/contabilidade.service.ts
git commit -m "feat: busca config fiscal de produtos específicos por id"
```

---

### Task 3: `emitirNFe` lê a config real

**Files:**
- Modify: `services/notas.service.ts:1-3` (imports), `services/notas.service.ts:302-391` (`emitirNFe`)

**Interfaces:**
- Consumes: `getConfigPadrao` (já existe em `services/contabilidade.service.ts`), `getConfigFiscalProdutos` (Task 2), `resolverFiscalItem` (Task 1).
- Produces: `emitirNFe` mantém a mesma assinatura pública (`(notaId: number, pedido: Pedido) => Promise<{ ok: boolean; mensagem: string }>`) — nenhum consumidor (`app/notas/page.tsx`) precisa mudar.

- [ ] **Step 1: Atualizar imports no topo do arquivo**

Em `services/notas.service.ts`, linha 1-3, trocar:

```ts
import { supabase } from '@/lib/supabase/client';
import type { NotaFiscal, NotaFiscalInsert, Pedido, Cliente } from "@/types";
import { registrarLog } from './log.service';
```

por:

```ts
import { supabase } from '@/lib/supabase/client';
import type { NotaFiscal, NotaFiscalInsert, Pedido, Cliente } from "@/types";
import { registrarLog } from './log.service';
import { getConfigPadrao, getConfigFiscalProdutos } from './contabilidade.service';
import { resolverFiscalItem } from '@/lib/fiscal';
```

- [ ] **Step 2: Reescrever `emitirNFe` (linhas 302-391)**

Substituir a função inteira por:

```ts
export async function emitirNFe(notaId: number, pedido: Pedido): Promise<{ ok: boolean; mensagem: string }> {
  const [nota, cliente] = await Promise.all([getNotaById(notaId), getClienteCompleto(pedido.cliente_id)]);
  if (!nota)    return { ok:false, mensagem:"Nota não encontrada." };
  if (!cliente) return { ok:false, mensagem:"Cliente não encontrado." };
  const erroValidacao = validarCliente(cliente);
  if (erroValidacao) return { ok:false, mensagem:erroValidacao };

  let pedidoCompleto = pedido;
  if (!pedido.itens_pedido?.length) {
    const { data } = await supabase.from("pedidos").select("*, itens_pedido(*)").eq("id", pedido.id).single();
    if (data) pedidoCompleto = data as Pedido;
  }

  const ref          = `UG-${pedido.id}-${notaId}`;
  const dentroEstado = nota.cfop.startsWith("5");
  const dtEmissao    = dtBrasilia();
  const itensPedido  = pedidoCompleto.itens_pedido ?? [];
  const produtoIds   = Array.from(new Set(
    itensPedido.map(item => item.produto_id).filter((id): id is number => id != null)
  ));
  const [configPadrao, configProdutos] = await Promise.all([
    getConfigPadrao(),
    getConfigFiscalProdutos(produtoIds),
  ]);

  const payload: Record<string, unknown> = {
    natureza_operacao:  nota.natureza_op,
    data_emissao:       dtEmissao,
    tipo_documento:     "1",
    finalidade_emissao: "1",
    // Destinatário
    ...montarCamposDestFlat(cliente),
    // Itens
    items: itensPedido.map((item, i) => {
      const vItem  = Number(item.subtotal);
      const qtd    = Number(item.m2) * item.quantidade;
      const vUnit  = qtd > 0 ? vItem / qtd : Number(item.valor_m2);
      const fiscal = resolverFiscalItem({
        produtoId: item.produto_id, valorBruto: vItem, dentroEstado,
        configProdutos, configPadrao,
      });
      return {
        numero_item:                  String(i + 1),
        codigo_produto:               item.produto_id?.toString() ?? `ITEM-${String(i+1).padStart(3,"0")}`,
        descricao:                    item.produto_nome,
        codigo_ncm:                   fiscal.ncm,
        cfop:                         fiscal.cfop.replace(".", ""),
        unidade_comercial:            "M2",
        quantidade_comercial:         String(Number(qtd.toFixed(4))),
        valor_unitario_comercial:     String(Number(vUnit.toFixed(4))),
        valor_unitario_tributavel:    String(Number(vUnit.toFixed(4))),
        unidade_tributavel:           "M2",
        quantidade_tributavel:        String(Number(qtd.toFixed(4))),
        valor_bruto:                  String(Number(vItem.toFixed(2))),
        ...(item.lapidacao > 0 ? { outras_despesas: String(Number(item.lapidacao.toFixed(2))) } : {}),
        icms_situacao_tributaria:     fiscal.cst,
        icms_origem:                  "0",
        icms_modalidade_base_calculo: "3",
        icms_base_calculo:            String(Number(vItem.toFixed(2))),
        icms_aliquota:                String(fiscal.aliq_icms),
        icms_valor:                   String(Number(fiscal.valor_icms.toFixed(2))),
        pis_situacao_tributaria:      "01",
        pis_base_calculo:             String(Number(vItem.toFixed(2))),
        pis_aliquota_porcentual:      String(fiscal.aliq_pis),
        pis_valor:                    String(Number(fiscal.valor_pis.toFixed(2))),
        cofins_situacao_tributaria:   "01",
        cofins_base_calculo:          String(Number(vItem.toFixed(2))),
        cofins_aliquota_porcentual:   String(fiscal.aliq_cofins),
        cofins_valor:                 String(Number(fiscal.valor_cofins.toFixed(2))),
      };
    }),
    // Totais
    valor_produtos:  String(Number(nota.valor_produtos.toFixed(2))),
    valor_desconto:  "0.00",
    valor_frete:     "0.00",
    valor_seguro:    "0.00",
    outras_despesas: "0.00",
    valor_total:     String(Number(nota.valor_total.toFixed(2))),
    modalidade_frete: "9",
    forma_pagamento:  "01",
    ...(cliente.obs_nfe ? { informacoes_adicionais: cliente.obs_nfe } : {}),
  };

  try {
    const res  = await chamarEmitirNFe(ref, payload);
    const json = await res.json();
    if (!res.ok) {
      const motivo = json.mensagem_sefaz ?? json.mensagens_erro?.[0]?.mensagem ?? JSON.stringify(json);
      await supabase.from("notas_fiscais").update({ status: "rejeitada", motivo_rejeicao: motivo } as never).eq("id", notaId);
      return { ok: false, mensagem: json.mensagem_sefaz ?? "Erro no FocusNFe" };
    }
    await supabase.from("notas_fiscais").update({ status: "enviando", nuvem_fiscal_id: ref } as never).eq("id", notaId);
    registrarLog({
      acao: "emitiu", tabela: "notas_fiscais", registro_id: String(notaId),
      descricao: `Emitiu NF-e #${notaId} para pedido ${pedido.id}`,
      campos_alterados: { ref, pedido_id: pedido.id },
    });
    return { ok: true, mensagem: "NF-e enviada para processamento." };
  } catch(err) { console.error("emitirNFe:", err); return { ok: false, mensagem: "Erro de conexão." }; }
}
```

Nota: `cfopNum`, `aliqPct` e `aliqIcms` da versão antiga saem — não são mais usados (o CFOP e a alíquota de ICMS agora vêm de `fiscal.cfop`/`fiscal.aliq_icms`, por item).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add services/notas.service.ts
git commit -m "fix: emitirNFe lê NCM/CFOP/CST/alíquotas da config fiscal real"
```

---

### Task 4: `emitirNFeCompleta` usa a classificação já resolvida no item

**Files:**
- Modify: `services/notas.service.ts:73-88` (`interface PayloadNota`)
- Modify: `services/notas.service.ts:189-300` (`emitirNFeCompleta`)

**Interfaces:**
- Consumes: `getConfigPadrao` (já importado na Task 3), tipo `PayloadNota` (modificado neste task).
- Produces: `PayloadNota.form.itens[]` ganha o campo `cst: string` — Task 5 (a tela que monta esse objeto) depende deste campo existir no tipo.

- [ ] **Step 1: Adicionar `cst` ao tipo do item em `PayloadNota`**

Em `services/notas.service.ts`, linha 73-88, trocar:

```ts
interface PayloadNota {
  form: {
    pedido_id: string; cliente_id: number | null;
    natureza_op: string; finalidade: string; tipo: string; serie: string; cfop_padrao: string;
    itens: { produto_nome: string; ncm: string; cfop: string; unidade: string; quantidade: number;
      valor_unitario: number; valor_bruto: number; ipi_pct: number; icms_pct: number;
      valor_ipi: number; valor_icms: number; valor_pis: number; valor_cofins: number; lapidacao: number; }[];
```

por:

```ts
interface PayloadNota {
  form: {
    pedido_id: string; cliente_id: number | null;
    natureza_op: string; finalidade: string; tipo: string; serie: string; cfop_padrao: string;
    itens: { produto_nome: string; ncm: string; cfop: string; cst: string; unidade: string; quantidade: number;
      valor_unitario: number; valor_bruto: number; ipi_pct: number; icms_pct: number;
      valor_ipi: number; valor_icms: number; valor_pis: number; valor_cofins: number; lapidacao: number; }[];
```

(resto da interface sem mudança)

- [ ] **Step 2: Buscar `configPadrao` e usar `item.cst`/`item.icms_pct` no payload**

Em `emitirNFeCompleta` (linha 189 em diante), logo depois da validação do cliente (depois de `if (erroValidacao) return { ok: false, mensagem: erroValidacao };`, antes de `// Salva rascunho primeiro`), adicionar:

```ts
  const configPadrao = await getConfigPadrao();
```

Depois, dentro do `items: form.itens.map((item, i) => ({ ... }))`, trocar:

```ts
      icms_situacao_tributaria:     "00",
      icms_origem:                  "0",
      icms_modalidade_base_calculo: "3",
      icms_base_calculo:            String(Number(item.valor_bruto.toFixed(2))),
      icms_aliquota:                String(aliqPct),
      icms_valor:                   String(Number(item.valor_icms.toFixed(2))),
      pis_situacao_tributaria:      "01",
      pis_base_calculo:             String(Number(item.valor_bruto.toFixed(2))),
      pis_aliquota_porcentual:      "1.65",
      pis_valor:                    String(Number(item.valor_pis.toFixed(2))),
      cofins_situacao_tributaria:   "01",
      cofins_base_calculo:          String(Number(item.valor_bruto.toFixed(2))),
      cofins_aliquota_porcentual:   "7.60",
      cofins_valor:                 String(Number(item.valor_cofins.toFixed(2))),
```

por:

```ts
      icms_situacao_tributaria:     item.cst,
      icms_origem:                  "0",
      icms_modalidade_base_calculo: "3",
      icms_base_calculo:            String(Number(item.valor_bruto.toFixed(2))),
      icms_aliquota:                String(item.icms_pct),
      icms_valor:                   String(Number(item.valor_icms.toFixed(2))),
      pis_situacao_tributaria:      "01",
      pis_base_calculo:             String(Number(item.valor_bruto.toFixed(2))),
      pis_aliquota_porcentual:      String(configPadrao.aliq_pis),
      pis_valor:                    String(Number(item.valor_pis.toFixed(2))),
      cofins_situacao_tributaria:   "01",
      cofins_base_calculo:          String(Number(item.valor_bruto.toFixed(2))),
      cofins_aliquota_porcentual:   String(configPadrao.aliq_cofins),
      cofins_valor:                 String(Number(item.valor_cofins.toFixed(2))),
```

E remover a linha `const aliqPct = form.cfop_padrao.startsWith("5") ? 18 : 12;` (não é mais usada — o CFOP dentro/fora que ela representava já está embutido em `item.icms_pct`, calculado na tela). A linha `const cfopNum = form.cfop_padrao.replace(".", "");` **continua** — ainda é usada como fallback em `cfop: (item.cfop || cfopNum).replace(".", "")`.

`icms_situacao_tributaria`/`pis_situacao_tributaria`/`cofins_situacao_tributaria` de PIS e COFINS continuam `"01"` fixo — não fazem parte do escopo combinado (só CST-**ICMS** foi pedido, ver spec).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: erro esperado até a Task 5 — `form.itens` ainda não tem `cst` na página que monta o objeto (`app/notas/nova/page.tsx`). Confirmar que o erro aponta exatamente pra isso (não algo inesperado) antes de seguir pra Task 5.

- [ ] **Step 4: Commit**

```bash
git add services/notas.service.ts
git commit -m "fix: emitirNFeCompleta usa CST/alíquotas resolvidos por item, não fixos"
```

---

### Task 5: Tela "Nova Nota" resolve a classificação fiscal ao carregar o pedido

**Files:**
- Modify: `app/notas/nova/page.tsx`

**Interfaces:**
- Consumes: `resolverFiscalItem`, `calcularTributosItem` (Task 1); `getConfigPadrao`, `getConfigFiscalProdutos`, `PADRAO_FALLBACK` (Task 2 / já existentes); `PayloadNota.form.itens[].cst` (Task 4).
- Produces: nenhuma interface nova consumida por outro arquivo — mudança fica contida na tela.

- [ ] **Step 1: Atualizar imports (topo do arquivo)**

Trocar:

```ts
import { salvarNotaCompleta, emitirNFeCompleta } from "@/services/notas.service";
```

por:

```ts
import { salvarNotaCompleta, emitirNFeCompleta } from "@/services/notas.service";
import { getConfigPadrao, getConfigFiscalProdutos, PADRAO_FALLBACK } from "@/services/contabilidade.service";
import { resolverFiscalItem, calcularTributosItem } from "@/lib/fiscal";
```

E trocar:

```ts
import type { Pedido, Cliente } from "@/types";
```

por:

```ts
import type { Pedido, Cliente, ConfigFiscalPadrao } from "@/types";
```

- [ ] **Step 2: Adicionar `cst` à interface `ItemNota`**

Trocar (linha 33-38):

```ts
interface ItemNota {
  produto_nome:string; ncm:string; cfop:string; unidade:string;
  quantidade:number; valor_unitario:number; valor_bruto:number;
  ipi_pct:number; icms_pct:number; valor_ipi:number;
  valor_icms:number; valor_pis:number; valor_cofins:number; lapidacao:number;
}
```

por:

```ts
interface ItemNota {
  produto_nome:string; ncm:string; cfop:string; cst:string; unidade:string;
  quantidade:number; valor_unitario:number; valor_bruto:number;
  ipi_pct:number; icms_pct:number; valor_ipi:number;
  valor_icms:number; valor_pis:number; valor_cofins:number; lapidacao:number;
}
```

- [ ] **Step 3: Reescrever `calcItem` (função de módulo, linhas 63-70) pra receber `configPadrao`**

Trocar:

```ts
function calcItem(item: ItemNota, cfop: string): ItemNota {
  const aliqIcms = cfop.startsWith("5") ? 18 : 12;
  const vIpi    = item.valor_bruto * (item.ipi_pct / 100);
  const vIcms   = item.valor_bruto * (aliqIcms / 100);
  const vPis    = item.valor_bruto * 0.0165;
  const vCofins = item.valor_bruto * 0.076;
  return { ...item, icms_pct:aliqIcms, valor_ipi:vIpi, valor_icms:vIcms, valor_pis:vPis, valor_cofins:vCofins };
}
```

por:

```ts
function calcItem(item: ItemNota, cfop: string, configPadrao: ConfigFiscalPadrao): ItemNota {
  const dentroEstado = cfop.startsWith("5");
  const t = calcularTributosItem(item.valor_bruto, item.ipi_pct, dentroEstado, configPadrao);
  return { ...item, icms_pct:t.aliq_icms, valor_ipi:t.valor_ipi, valor_icms:t.valor_icms, valor_pis:t.valor_pis, valor_cofins:t.valor_cofins };
}
```

- [ ] **Step 4: Adicionar estado de `configPadrao` no componente**

Dentro de `NovaNFeInner`, junto aos outros `useState` (logo após `const [espelho, setEspelho] = useState(false);`), adicionar:

```ts
  const [configPadrao, setConfigPadrao] = useState<ConfigFiscalPadrao>(PADRAO_FALLBACK);
```

- [ ] **Step 5: Reescrever `preencherDoPedido` pra buscar config e resolver classificação por item**

Trocar (linhas 99-124):

```ts
 async function preencherDoPedido(p: Pedido) {
    const [{ data: cliData }, { data: pedData }] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", p.cliente_id).single(),
      supabase.from("pedidos").select("*, itens_pedido(*)").eq("id", p.id).single(),
    ]);
    const cli = cliData as Cliente|null;
    const pedCompleto = (pedData as Pedido|null) ?? p;
    setCliente(cli);
    const cfop = cli?.uf && cli.uf.toUpperCase() !== "MG" ? "6.101" : "5.101";
    const itens: ItemNota[] = (pedCompleto.itens_pedido ?? []).map(item => {
      const qtd    = Number(item.m2) * item.quantidade;
      const vBruto = Number(item.subtotal);
      return calcItem({
        produto_nome:item.produto_nome, ncm:"70031200", cfop:cfop.replace(".",""),
        unidade:"M2", quantidade:Number(qtd.toFixed(4)),
        valor_unitario: qtd > 0 ? vBruto / qtd : Number(item.valor_m2),
        valor_bruto:vBruto, ipi_pct:0, icms_pct:0,
        valor_ipi:0, valor_icms:0, valor_pis:0, valor_cofins:0, lapidacao:Number(item.lapidacao),
      }, cfop);
    });
    setForm(f => ({
      ...f, pedido_id:p.id, cliente_id:p.cliente_id, cfop_padrao:cfop,
      forma_pgto:pgtoFromStr(p.forma_pgto ?? ""), parcelas:p.parcelas ?? 1,
      obs_contribuinte:cli?.obs_nfe ?? "", itens,
    }));
  }
```

por:

```ts
 async function preencherDoPedido(p: Pedido) {
    const [{ data: cliData }, { data: pedData }] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", p.cliente_id).single(),
      supabase.from("pedidos").select("*, itens_pedido(*)").eq("id", p.id).single(),
    ]);
    const cli = cliData as Cliente|null;
    const pedCompleto = (pedData as Pedido|null) ?? p;
    setCliente(cli);
    const cfop = cli?.uf && cli.uf.toUpperCase() !== "MG" ? "6.101" : "5.101";
    const dentroEstado = cfop.startsWith("5");

    const itensPedido = pedCompleto.itens_pedido ?? [];
    const produtoIds  = Array.from(new Set(
      itensPedido.map(item => item.produto_id).filter((id): id is number => id != null)
    ));
    const [padrao, configProdutos] = await Promise.all([
      getConfigPadrao(),
      getConfigFiscalProdutos(produtoIds),
    ]);
    setConfigPadrao(padrao);

    const itens: ItemNota[] = itensPedido.map(item => {
      const qtd    = Number(item.m2) * item.quantidade;
      const vBruto = Number(item.subtotal);
      const fiscal = resolverFiscalItem({
        produtoId: item.produto_id, valorBruto: vBruto, dentroEstado,
        configProdutos, configPadrao: padrao,
      });
      return {
        produto_nome:item.produto_nome, ncm:fiscal.ncm, cfop:fiscal.cfop, cst:fiscal.cst,
        unidade:"M2", quantidade:Number(qtd.toFixed(4)),
        valor_unitario: qtd > 0 ? vBruto / qtd : Number(item.valor_m2),
        valor_bruto:vBruto, ipi_pct:0, icms_pct:fiscal.aliq_icms,
        valor_ipi:fiscal.valor_ipi, valor_icms:fiscal.valor_icms,
        valor_pis:fiscal.valor_pis, valor_cofins:fiscal.valor_cofins,
        lapidacao:Number(item.lapidacao),
      };
    });
    setForm(f => ({
      ...f, pedido_id:p.id, cliente_id:p.cliente_id, cfop_padrao:cfop,
      forma_pgto:pgtoFromStr(p.forma_pgto ?? ""), parcelas:p.parcelas ?? 1,
      obs_contribuinte:cli?.obs_nfe ?? "", itens,
    }));
  }
```

- [ ] **Step 6: Passar `configPadrao` pra `calcItem` dentro de `atualizarItem`**

Trocar (linha 134-141):

```ts
  function atualizarItem(idx: number, campo: keyof ItemNota, valor: number|string) {
    setForm(f => {
      const itens = [...f.itens];
      const item  = { ...itens[idx], [campo]:valor };
      itens[idx]  = (campo === "valor_bruto" || campo === "ipi_pct") ? calcItem(item, f.cfop_padrao) : item;
      return { ...f, itens };
    });
  }
```

por:

```ts
  function atualizarItem(idx: number, campo: keyof ItemNota, valor: number|string) {
    setForm(f => {
      const itens = [...f.itens];
      const item  = { ...itens[idx], [campo]:valor };
      itens[idx]  = (campo === "valor_bruto" || campo === "ipi_pct") ? calcItem(item, f.cfop_padrao, configPadrao) : item;
      return { ...f, itens };
    });
  }
```

- [ ] **Step 7: Adicionar campo de CST editável na aba "Produtos / Itens"**

Trocar (linha 277-290, o grid de campos de cada item):

```tsx
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:"8px" }}>
                      <Campo label="NCM"><input className="fc" value={item.ncm} onChange={e => atualizarItem(i,"ncm",e.target.value)} maxLength={8} /></Campo>
                      <Campo label="CFOP"><input className="fc" value={item.cfop} onChange={e => atualizarItem(i,"cfop",e.target.value)} maxLength={5} /></Campo>
                      <Campo label="Unidade"><input className="fc" value={item.unidade} onChange={e => atualizarItem(i,"unidade",e.target.value)} maxLength={6} /></Campo>
```

por:

```tsx
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:"8px" }}>
                      <Campo label="NCM"><input className="fc" value={item.ncm} onChange={e => atualizarItem(i,"ncm",e.target.value)} maxLength={8} /></Campo>
                      <Campo label="CFOP"><input className="fc" value={item.cfop} onChange={e => atualizarItem(i,"cfop",e.target.value)} maxLength={5} /></Campo>
                      <Campo label="CST ICMS"><input className="fc" value={item.cst} onChange={e => atualizarItem(i,"cst",e.target.value)} maxLength={2} /></Campo>
                      <Campo label="Unidade"><input className="fc" value={item.unidade} onChange={e => atualizarItem(i,"unidade",e.target.value)} maxLength={6} /></Campo>
```

(resto do grid sem mudança — `EspelhoModal.tsx` tem seu próprio tipo `ItemNota` local, mais estreito; passar um objeto com o campo `cst` a mais não quebra o typecheck por tipagem estrutural, então não precisa mudar esse arquivo.)

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros — inclusive o erro esperado da Task 4 (Step 3) deve ter sumido, porque `form.itens` agora carrega `cst`.

- [ ] **Step 9: Commit**

```bash
git add app/notas/nova/page.tsx
git commit -m "fix: tela Nova Nota resolve NCM/CFOP/CST/tributos da config fiscal real"
```

---

### Task 6: Verificação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `npm run test`
Expected: todos os testes verdes, incluindo os 9 novos de `lib/fiscal.test.ts`.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build limpo, sem erros de tipo nem de bundling.

- [ ] **Step 4: Push**

```bash
git push
```

- [ ] **Step 5: Anotar validação manual pendente pro usuário**

Sem Supabase real disponível nesta sessão (mesma limitação recorrente do projeto) — pedir pro usuário, em ambiente de homologação:
1. Configurar um produto de teste em `/contabilidade/fiscal-produtos` com NCM/CFOP/CST diferentes do padrão da empresa.
2. Criar um pedido de teste com esse produto e um item sem produto vinculado (avulso, se possível).
3. Em "Nova Nota", carregar esse pedido e conferir que o item do produto de teste mostra o NCM/CFOP/CST configurados (não `70031200`/CST `00` fixo) e que o item avulso cai no padrão da empresa.
4. Emitir a nota em homologação (via "Salvar e Emitir" e também via "Salvar Rascunho" + emitir depois pela lista `/notas`) e conferir, pelo XML/DANFE retornado, que o NCM/CFOP/CST/alíquotas batem com o que foi configurado.
