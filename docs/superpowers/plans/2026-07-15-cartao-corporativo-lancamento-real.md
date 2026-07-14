# Cartão Corporativo — Ponte com Lançamentos Reais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gasto no cartão corporativo (crédito: fatura fechada; débito: compra imediata) passa a gerar um lançamento de verdade em `lancamentos`, aparecendo em Contas a Pagar/Fluxo de Caixa/DRE — hoje fica invisível, só dentro do módulo Cartões.

**Architecture:** 2 colunas novas (`lancamento_id` em `cartoes_faturas` e `cartoes_lancamentos`, ambas apontando pra `lancamentos.id`). `services/cartoes.service.ts` ganha os pontos de criação (fatura fecha → 1 lançamento; débito sem fatura → 1 lançamento por compra) e sincronização de leitura (ao buscar faturas, confere se o lançamento vinculado já foi pago e atualiza o status do cartão de volta). Zero mudança em `registrarBaixa`/`editarLancamento` — a ponte é sempre de dentro do módulo Cartões pro `lancamentos`, nunca o contrário em tempo de escrita.

**Tech Stack:** Next.js/TypeScript, Supabase JS v2.

## Global Constraints

- Sem retroativo — só faturas/lançamentos criados a partir desta mudança geram lançamento em `lancamentos`.
- Sem mudança em `registrarBaixa`/`editarLancamento` (lógica de pagamento genérica usada por todo o sistema).
- `CartaoLancamento` não tem campo de status de pagamento próprio (só `conciliado: boolean`, que significa "confirmado no extrato bancário" — conceito diferente) — a sincronização de leitura só se aplica ao lado da fatura de crédito, não a lançamentos de débito individuais.
- Sem teste automatizado disponível pra fluxo com Supabase real — validar via `tsc --noEmit` + `next build`; validação manual fica por conta do usuário.
- Spec de referência: `docs/superpowers/specs/2026-07-15-cartao-corporativo-lancamento-real-design.md`.

---

### Task 1: SQL — colunas `lancamento_id`

**Files:**
- Create: `sql/cartoes-lancamento-id.sql`
- Modify: `sql/MANIFEST.md`

- [ ] **Step 1: Criar o arquivo SQL**

```sql
-- Cartões Corporativos — ponte com lancamentos reais
-- Fatura de crédito fechada e compra de débito sem fatura passam a gerar
-- um lançamento de verdade em `lancamentos` (hoje o gasto no cartão
-- corporativo é invisível pro DRE/Contas a Pagar/Fluxo de Caixa — existe
-- só dentro do módulo Cartões). Colunas aditivas, sem retroativo.
-- Rodar no Supabase → SQL Editor.

ALTER TABLE cartoes_faturas ADD COLUMN IF NOT EXISTS lancamento_id int REFERENCES lancamentos(id);
ALTER TABLE cartoes_lancamentos ADD COLUMN IF NOT EXISTS lancamento_id int REFERENCES lancamentos(id);
```

- [ ] **Step 2: Adicionar linha ao manifesto**, no fim da tabela de `sql/MANIFEST.md`:

```
| 2026-07-15 | `sql/cartoes-lancamento-id.sql` | Cartões Corporativos — ponte com lancamentos reais (fatura/débito) | ⏳ |
```

- [ ] **Step 3: Commit**

```bash
git add sql/cartoes-lancamento-id.sql sql/MANIFEST.md
git commit -m "docs: adiciona SQL de lancamento_id em cartoes_faturas/cartoes_lancamentos"
```

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Adicionar `lancamento_id` em `CartaoFatura`**

De:

```ts
export interface CartaoFatura {
  id: number;
  cartao_id: number;
  competencia_ano: number;
  competencia_mes: number;
  valor_total: number;
  status: 'aberta' | 'fechada' | 'paga';
  data_fechamento: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  pdf_url: string | null;
  comprovante_pagamento_url: string | null;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  cartoes?: Pick<Cartao, 'id' | 'nome' | 'tipo'>;
}
```

Para:

```ts
export interface CartaoFatura {
  id: number;
  cartao_id: number;
  competencia_ano: number;
  competencia_mes: number;
  valor_total: number;
  status: 'aberta' | 'fechada' | 'paga';
  data_fechamento: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  pdf_url: string | null;
  comprovante_pagamento_url: string | null;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  lancamento_id: number | null;
  cartoes?: Pick<Cartao, 'id' | 'nome' | 'tipo'>;
}
```

- [ ] **Step 2: Adicionar `lancamento_id` em `CartaoLancamento`**

De:

```ts
export interface CartaoLancamento {
  id: number;
  cartao_id: number;
  fatura_id: number | null;
  data: string;
  descricao: string;
  plano_contas_id: number | null;
  fornecedor_id: number | null;
  valor: number;
  parcela_atual: number | null;
  parcela_total: number | null;
  comprovante_url: string | null;
  conciliado: boolean;
  observacoes: string | null;
  criado_por: string | null;
  deletado_em: string | null;
  deletado_por: string | null;
  motivo_exclusao: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome'>;
}
```

Para (adiciona `lancamento_id` logo depois de `fatura_id`):

```ts
export interface CartaoLancamento {
  id: number;
  cartao_id: number;
  fatura_id: number | null;
  lancamento_id: number | null;
  data: string;
  descricao: string;
  plano_contas_id: number | null;
  fornecedor_id: number | null;
  valor: number;
  parcela_atual: number | null;
  parcela_total: number | null;
  comprovante_url: string | null;
  conciliado: boolean;
  observacoes: string | null;
  criado_por: string | null;
  deletado_em: string | null;
  deletado_por: string | null;
  motivo_exclusao: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome'>;
}
```

**Nota**: `CartaoLancamentoInsert`/`CartaoFaturaInsert` são derivados via `Omit<...>` no mesmo arquivo (ex.: `Omit<CartaoLancamento, 'id'|...>`) — como `lancamento_id` é preenchido pelo próprio serviço (não pelo formulário), confirme se o `Omit` existente já exclui campos gerenciados pelo servidor; se `lancamento_id` aparecer no tipo Insert por engano, adicione-o à lista de campos omitidos igual os demais campos gerenciados (`deletado_em`, `created_at` etc já seguem esse padrão).

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: podem aparecer erros nos objetos literais que constroem `CartaoFaturaInsert`/`CartaoLancamentoInsert` em `app/contabilidade/cartoes/page.tsx` (`CARTAO_VAZIO`/`LANC_VAZIO`) se `lancamento_id` não estiver corretamente excluído do tipo Insert — se isso acontecer, ajuste o `Omit<...>` do tipo Insert correspondente pra incluir `'lancamento_id'` na lista de campos omitidos, e rode de novo até PASS.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): adiciona lancamento_id em CartaoFatura/CartaoLancamento"
```

---

### Task 3: `services/cartoes.service.ts` — geração dos lançamentos

**Files:**
- Modify: `services/cartoes.service.ts`

**Interfaces:**
- Consumes: `lancamento_id` novo em `CartaoFatura`/`CartaoLancamento` (Task 2).

- [ ] **Step 1: `atualizarFatura` gera o lançamento quando a fatura fecha**

De:

```ts
export async function atualizarFatura(id: number, patch: CartaoFaturaUpdate): Promise<boolean> {
  const { error } = await supabase.from("cartoes_faturas").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarFatura:", error); return false; }
  registrarLog({ acao: "atualizou", tabela: "cartoes_faturas", registro_id: String(id), descricao: `Atualizou fatura #${id}`, campos_alterados: patch as Record<string, unknown> });
  return true;
}
```

Para:

```ts
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/** Cria o lançamento único da fatura fechada em `lancamentos` — o cartão
 *  corporativo debita a conta numa parcela só, na data de vencimento da
 *  fatura, independente de quantas compras aconteceram dentro dela. O
 *  detalhamento por compra continua vivo em cartoes_lancamentos, não se
 *  perde. Idempotente: só roda se a fatura ainda não tiver lancamento_id. */
async function gerarLancamentoDaFatura(faturaId: number): Promise<void> {
  const { data: faturaRow } = await supabase
    .from("cartoes_faturas")
    .select("id, valor_total, data_vencimento, competencia_ano, competencia_mes, lancamento_id, cartoes ( nome )")
    .eq("id", faturaId)
    .maybeSingle();
  if (!faturaRow) return;
  const fatura = faturaRow as unknown as {
    id: number; valor_total: number; data_vencimento: string | null;
    competencia_ano: number; competencia_mes: number; lancamento_id: number | null;
    cartoes: { nome: string } | null;
  };
  if (fatura.lancamento_id) return; // já gerado antes, não duplica

  const nomeCartao = fatura.cartoes?.nome ?? "cartão";
  const mesLabel = MESES_ABREV[fatura.competencia_mes - 1] ?? String(fatura.competencia_mes);

  const { data: lancamento, error } = await supabase
    .from("lancamentos")
    .insert([{
      tipo: "Saída",
      descricao: `Fatura cartão ${nomeCartao} — ${mesLabel}/${fatura.competencia_ano}`,
      valor: fatura.valor_total,
      status: "Pendente",
      vencimento: fatura.data_vencimento,
      plano_contas_id: null,
      fornecedor_id: null,
      pedido_id: null,
      cliente_id: null,
    } as never])
    .select("id")
    .single();
  if (error || !lancamento) { console.error("gerarLancamentoDaFatura:", error); return; }

  await supabase.from("cartoes_faturas").update({ lancamento_id: (lancamento as { id: number }).id } as never).eq("id", faturaId);
}

export async function atualizarFatura(id: number, patch: CartaoFaturaUpdate): Promise<boolean> {
  const { error } = await supabase.from("cartoes_faturas").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) { console.error("atualizarFatura:", error); return false; }
  if (patch.status === "fechada") await gerarLancamentoDaFatura(id);
  registrarLog({ acao: "atualizou", tabela: "cartoes_faturas", registro_id: String(id), descricao: `Atualizou fatura #${id}`, campos_alterados: patch as Record<string, unknown> });
  return true;
}
```

- [ ] **Step 2: `criarLancamentoCartao` gera lançamento imediato pra débito sem fatura**

De:

```ts
export async function criarLancamentoCartao(input: CartaoLancamentoInsert): Promise<CartaoLancamento | null> {
  const { data, error } = await supabase.from("cartoes_lancamentos").insert([input as never]).select().single();
  if (error) { console.error("criarLancamentoCartao:", error); return null; }
  const lanc = data as CartaoLancamento;
  if (lanc.fatura_id) await recalcularValorTotalFatura(lanc.fatura_id);
  registrarLog({ acao: "criou", tabela: "cartoes_lancamentos", registro_id: String(lanc.id), descricao: `Criou lançamento de cartão: ${lanc.descricao} (${lanc.valor})` });
  return lanc;
}
```

Para:

```ts
export async function criarLancamentoCartao(input: CartaoLancamentoInsert): Promise<CartaoLancamento | null> {
  const { data, error } = await supabase.from("cartoes_lancamentos").insert([input as never]).select().single();
  if (error) { console.error("criarLancamentoCartao:", error); return null; }
  const lanc = data as CartaoLancamento;
  if (lanc.fatura_id) await recalcularValorTotalFatura(lanc.fatura_id);

  // Débito sem fatura debita a conta na hora — gera o lançamento já aqui,
  // um por compra (diferente do crédito, que agrega tudo na fatura).
  if (!lanc.fatura_id) {
    const { data: cartaoRow } = await supabase.from("cartoes").select("tipo").eq("id", lanc.cartao_id).maybeSingle();
    const tipoCartao = (cartaoRow as { tipo: "credito" | "debito" } | null)?.tipo;
    if (tipoCartao === "debito") {
      const { data: lancamento, error: errLanc } = await supabase
        .from("lancamentos")
        .insert([{
          tipo: "Saída",
          descricao: lanc.descricao,
          valor: lanc.valor,
          status: "Pendente",
          vencimento: lanc.data,
          plano_contas_id: lanc.plano_contas_id,
          fornecedor_id: lanc.fornecedor_id,
          pedido_id: null,
          cliente_id: null,
        } as never])
        .select("id")
        .single();
      if (!errLanc && lancamento) {
        await supabase.from("cartoes_lancamentos").update({ lancamento_id: (lancamento as { id: number }).id } as never).eq("id", lanc.id);
        lanc.lancamento_id = (lancamento as { id: number }).id;
      } else {
        console.error("criarLancamentoCartao (lancamento débito):", errLanc);
      }
    }
  }

  registrarLog({ acao: "criou", tabela: "cartoes_lancamentos", registro_id: String(lanc.id), descricao: `Criou lançamento de cartão: ${lanc.descricao} (${lanc.valor})` });
  return lanc;
}
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Commit**

```bash
git add services/cartoes.service.ts
git commit -m "feat(cartoes): fatura fechada e compra de debito sem fatura geram lancamento real"
```

---

### Task 4: Sincronização de leitura (fatura paga)

**Files:**
- Modify: `services/cartoes.service.ts`

**Interfaces:**
- Consumes: `gerarLancamentoDaFatura` já existe (Task 3), não é reaproveitado aqui — este passo é separado (leitura, não escrita de criação).

- [ ] **Step 1: `getFaturas` embute o status do lançamento vinculado e sincroniza `status`/`data_pagamento` quando ele já foi pago**

De:

```ts
export async function getFaturas(filtro: FiltroFaturas = {}): Promise<CartaoFatura[]> {
  let query = supabase.from("cartoes_faturas").select("*, cartoes ( id, nome, tipo )").order("competencia_ano", { ascending: false }).order("competencia_mes", { ascending: false });
  if (filtro.cartaoId) query = query.eq("cartao_id", filtro.cartaoId);
  if (filtro.status) query = query.eq("status", filtro.status);
  if (filtro.competenciaAno) query = query.eq("competencia_ano", filtro.competenciaAno);
  if (filtro.competenciaMes) query = query.eq("competencia_mes", filtro.competenciaMes);
  const { data, error } = await query;
  if (error) { console.error("getFaturas:", error); return []; }
  return data as CartaoFatura[];
}
```

Para:

```ts
interface FaturaComLancamento extends CartaoFatura {
  lancamentos?: { status: string; dt_pagamento: string | null } | null;
}

export async function getFaturas(filtro: FiltroFaturas = {}): Promise<CartaoFatura[]> {
  let query = supabase
    .from("cartoes_faturas")
    .select("*, cartoes ( id, nome, tipo ), lancamentos ( status, dt_pagamento )")
    .order("competencia_ano", { ascending: false })
    .order("competencia_mes", { ascending: false });
  if (filtro.cartaoId) query = query.eq("cartao_id", filtro.cartaoId);
  if (filtro.status) query = query.eq("status", filtro.status);
  if (filtro.competenciaAno) query = query.eq("competencia_ano", filtro.competenciaAno);
  if (filtro.competenciaMes) query = query.eq("competencia_mes", filtro.competenciaMes);
  const { data, error } = await query;
  if (error) { console.error("getFaturas:", error); return []; }

  const faturas = (data ?? []) as unknown as FaturaComLancamento[];
  for (const f of faturas) {
    if (f.lancamentos?.status === "Pago" && f.status !== "paga") {
      const dataPagamento = f.lancamentos.dt_pagamento ?? new Date().toISOString().split("T")[0];
      await supabase.from("cartoes_faturas").update({ status: "paga", data_pagamento: dataPagamento } as never).eq("id", f.id);
      f.status = "paga";
      f.data_pagamento = dataPagamento;
    }
    delete f.lancamentos;
  }
  return faturas as CartaoFatura[];
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add services/cartoes.service.ts
git commit -m "feat(cartoes): sincroniza status da fatura ao ler, quando o lancamento vinculado ja foi pago"
```

---

### Task 5: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário**

**Rodar o SQL `sql/cartoes-lancamento-id.sql` no Supabase antes de testar.** Pedir pro usuário:
- Fechar uma fatura de cartão de crédito de teste (mudar status pra "fechada") e conferir que aparece um novo lançamento em Contas a Pagar com o valor total da fatura e vencimento correto.
- Lançar uma compra de cartão de débito sem vincular a nenhuma fatura, e conferir que já aparece em Contas a Pagar imediatamente, com o vencimento igual à data da compra.
- Pagar (dar baixa) o lançamento gerado pela fatura em Contas a Pagar, depois reabrir a tela de Cartões e confirmar que a fatura aparece como "paga" sozinha, sem precisar marcar manualmente.
- Confirmar que abrir a fatura de novo continua mostrando o detalhamento por compra normalmente (isso não muda).

Isso encerra o item de maior escopo da auditoria fiscal/contábil. Fica registrado como pendência separada, não resolvida: o assunto original de débito/crédito/MDR/prazo de repasse pra venda no cartão pro CLIENTE (Contas a Receber) — se o usuário quiser atacar isso depois, é um brainstorm novo.
