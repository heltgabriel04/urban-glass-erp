# RLS SELECT Restrito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restringir o SELECT de 40 tabelas do módulo financeiro/contábil a `admin`+`financeiro`, sem quebrar a única dependência real do perfil `producao` (nome do cliente na tela de produção).

**Architecture:** Uma migration SQL nova (loop `do $$` sobre array de tabelas, mesmo padrão já usado no repo) substitui as policies de SELECT permissivas por uma restrita a `(auth.jwt()->>'user_role') IN ('admin','financeiro')`. Uma RPC `security definer` minúscula (`get_cliente_nome_publico`) mantém a tela de produção funcionando sem reabrir a tabela `clientes` inteira.

**Tech Stack:** Supabase (Postgres, RLS, RPC `security definer`), Next.js/TypeScript no client.

## Global Constraints

- Não tocar em nenhuma policy de escrita (INSERT/UPDATE/DELETE) — só SELECT.
- Não tocar em `filtros_salvos` nem em tabelas operacionais (`pedidos`, `itens_pedido`, `programacao_*`, `estoque`, `retalhos`, `compras`, `qualidade_*`, `fornecedores`, `log_atividades`, `checklist_expedicao`).
- A RPC só pode devolver o campo `nome` de `clientes` — nenhum outro campo.
- Spec de referência: `docs/superpowers/specs/2026-07-13-rls-select-restrito-design.md`.

---

### Task 1: Migration SQL — restringe SELECT nas 40 tabelas

**Files:**
- Create: `sql/seguranca-05-restringe-select-financeiro.sql`

**Interfaces:**
- Produces: policy `"select_admin_financeiro"` (FOR SELECT) em cada uma das 40 tabelas listadas, substituindo `"auth_read"`/`"auth_select"`/`"<tabela>_read"` (quaisquer que existam).

- [ ] **Step 1: Escrever a migration**

```sql
-- Restringe SELECT de 40 tabelas do módulo financeiro/contábil a
-- admin+financeiro (achado "RLS SELECT liberado geral" da auditoria).
-- Não mexe em nenhuma policy de escrita. Idempotente.

do $$
declare
  t text;
  tabelas_financeiras text[] := array[
    'lancamentos','financeiro','notas_fiscais',
    'config_fiscal_produtos','config_fiscal_padrao',
    'tabelas_preco','tabela_preco_itens',
    'investimentos','inv_opcoes','clientes','produtos',
    'orcamentos','itens_orcamento',
    'contas_bancarias','centros_custo','baixas_lancamento',
    'lancamentos_recorrentes','extratos_importados','extrato_linhas',
    'lancamentos_historico','transferencias_bancarias','lancamento_rateio',
    'formas_pagamento','metas_financeiras','pc_categorias','plano_contas',
    'cartoes','cartoes_faturas','cartoes_lancamentos',
    'emprestimos','emprestimos_parcelas',
    'consorcios','consorcios_parcelas','consorcios_lances',
    'ativos_imobilizados','itens_estoque_gerais','itens_estoque_movimentacoes',
    'documentos_fiscais','contabilidade_fechamentos','contabilidade_checklist_itens'
  ];
begin
  foreach t in array tabelas_financeiras loop
    if exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      execute format('drop policy if exists "auth_read" on public.%I;', t);
      execute format('drop policy if exists "auth_select" on public.%I;', t);
      execute format('drop policy if exists "%s_read" on public.%I;', t, t);
      execute format($p$
        create policy "select_admin_financeiro" on public.%I
          for select to authenticated
          using ((auth.jwt() ->> 'user_role') in ('admin','financeiro'));
      $p$, t);
    end if;
  end loop;
end $$;

-- ── VERIFICAÇÃO ────────────────────────────────────────────
-- select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and policyname = 'select_admin_financeiro'
--   order by tablename;
-- Deve listar as 40 tabelas (ou menos, se alguma ainda não existir no banco).
```

- [ ] **Step 2: Confirmar o arquivo está no lugar certo**

Run: `ls "sql/seguranca-05-restringe-select-financeiro.sql"` (Bash/PowerShell)
Expected: caminho listado, sem erro.

- [ ] **Step 3: Commit**

```bash
git add sql/seguranca-05-restringe-select-financeiro.sql
git commit -m "feat(seguranca): restringe SELECT de 40 tabelas financeiras a admin/financeiro"
```

---

### Task 2: RPC `get_cliente_nome_publico`

**Files:**
- Create: `sql/seguranca-06-rpc-cliente-nome-publico.sql`

**Interfaces:**
- Produces: função Postgres `get_cliente_nome_publico(p_cliente_id integer) returns text`, chamável via `supabase.rpc('get_cliente_nome_publico', { p_cliente_id })`. Task 3 consome essa RPC.

- [ ] **Step 1: Escrever a migration da RPC**

```sql
-- RPC minúscula pra telas do perfil `producao` mostrarem o nome do
-- cliente sem precisar de SELECT na tabela `clientes` inteira (que
-- passou a ser restrita a admin/financeiro em
-- seguranca-05-restringe-select-financeiro.sql). Só devolve `nome` —
-- nenhum outro campo (CPF/CNPJ/crédito/endereço ficam fora).

create or replace function get_cliente_nome_publico(p_cliente_id integer)
returns text
language sql
security definer
set search_path = public
as $$
  select nome from clientes where id = p_cliente_id;
$$;

revoke all on function get_cliente_nome_publico(integer) from public, anon;
grant execute on function get_cliente_nome_publico(integer) to authenticated;
```

- [ ] **Step 2: Confirmar o arquivo está no lugar certo**

Run: `ls "sql/seguranca-06-rpc-cliente-nome-publico.sql"`
Expected: caminho listado, sem erro.

- [ ] **Step 3: Commit**

```bash
git add sql/seguranca-06-rpc-cliente-nome-publico.sql
git commit -m "feat(seguranca): adiciona RPC get_cliente_nome_publico"
```

---

### Task 3: Ajustar tela de produção

**Files:**
- Modify: `services/pedidos.service.ts` (adicionar função nova, não mexer em `getPedidoById`)
- Modify: `app/pedidos/[id]/producao/page.tsx`

**Interfaces:**
- Consumes: RPC `get_cliente_nome_publico` (Task 2).
- Produces: `getClienteNomePublico(clienteId: number): Promise<string | null>` em `services/pedidos.service.ts`.

- [ ] **Step 1: Adicionar a função no service**

Em `services/pedidos.service.ts`, logo depois de `getPedidoById` (linha ~116 hoje — reconferir antes de editar):

```ts
export async function getClienteNomePublico(clienteId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_cliente_nome_publico', { p_cliente_id: clienteId });
  if (error) { console.error('getClienteNomePublico:', error); return null; }
  return data as string | null;
}
```

- [ ] **Step 2: Ler o estado atual de `app/pedidos/[id]/producao/page.tsx`**

Conteúdo de referência (pode ter mudado — reconferir antes de editar):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPedidoById, avancarStatusPedido } from "@/services/pedidos.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import type { Pedido } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";

// ... (FLUXO, STATUS_COLOR, PROXIMA — não mudam)

export default function ProducaoView() {
  const { id } = useParams<{ id: string }>();

  const [pedido, setPedido]         = useState<Pedido | null>(null);
  const [otims, setOtims]           = useState<HistoricoOtimizador[]>([]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [feedback, setFeedback]     = useState<{ msg: string; tipo: "ok" | "err" | "warn" } | null>(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [data, o] = await Promise.all([
      getPedidoById(id),
      getOtimizacoesPorPedido(id),
    ]);
    setPedido(data);
    setOtims(o);
    setLoading(false);
  }
```

E no JSX (linha ~150 hoje):

```tsx
          <div style={styles.clienteNome}>{pedido.clientes?.nome ?? "—"}</div>
```

- [ ] **Step 3: Adicionar estado + carregar o nome via RPC**

Trocar o import:

```ts
import { getPedidoById, getClienteNomePublico, avancarStatusPedido } from "@/services/pedidos.service";
```

Adicionar um state novo (junto aos outros `useState`):

```ts
  const [clienteNome, setClienteNome] = useState<string | null>(null);
```

Atualizar `load()`:

```ts
  async function load() {
    setLoading(true);
    const [data, o] = await Promise.all([
      getPedidoById(id),
      getOtimizacoesPorPedido(id),
    ]);
    setPedido(data);
    setOtims(o);
    if (data?.cliente_id) setClienteNome(await getClienteNomePublico(data.cliente_id));
    setLoading(false);
  }
```

- [ ] **Step 4: Trocar o JSX pra usar o novo state**

```tsx
          <div style={styles.clienteNome}>{clienteNome ?? "—"}</div>
```

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros. Confirmar que `Pedido.cliente_id` existe no tipo (grep `cliente_id` em `types/index.ts` se der erro de tipo).

- [ ] **Step 6: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 7: Commit**

```bash
git add services/pedidos.service.ts "app/pedidos/[id]/producao/page.tsx"
git commit -m "fix(producao): usa RPC get_cliente_nome_publico em vez do embed clientes"
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

Sem service role key local nem usuário de teste `producao`/`visitante` disponível nesta sessão — pedir pro usuário, depois de rodar as 2 migrations (`seguranca-05-...` e `seguranca-06-...`) no Supabase:

1. Rodar `select tablename, policyname from pg_policies where policyname = 'select_admin_financeiro' order by tablename;` no SQL Editor e conferir que as 40 tabelas aparecem.
2. Logado como `producao` (ou testar via um pedido real, sem mutar dados — só abrir a tela), abrir `/pedidos/[id]/producao` e confirmar que o nome do cliente aparece no header.
3. Logado como `admin`/`financeiro`, confirmar que Contas a Pagar/Receber, Contabilidade, Investimentos etc. continuam carregando normalmente (nada deveria mudar pra esses perfis).

Isso encerra o sub-projeto 3 de 4 (RLS). Próximo e último da fila: Classificação fiscal obrigatória.
