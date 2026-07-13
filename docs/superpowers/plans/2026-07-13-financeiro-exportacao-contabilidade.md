# Financeiro no Pacote de Exportação da Contabilidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Financeiro passa a fazer parte do pacote de exportação mensal (4 planilhas novas), do checklist mensal (item novo) e do semáforo do Dashboard de Contabilidade (5º card).

**Architecture:** Reaproveita os padrões já estabelecidos em cada um dos 3 lugares (planilha xlsx no zip, catálogo fixo de checklist, função de semáforo por área) — nenhum deles precisa de refactor, só extensão.

**Tech Stack:** Next.js/TypeScript, Supabase client (browser), `xlsx`/`jszip` (já usados em `lib/exportacaoContabilidade.ts`).

## Global Constraints

- Saldo por conta bancária no pacote tem que refletir o fim do mês exportado, não o saldo atual — não reaproveitar `getSaldosPorConta()` (calcula saldo atual).
- Não redefinir o significado de "Fase 5" (já usado pro roadmap de exportação) — o item novo do checklist é fase 6.
- Spec de referência: `docs/superpowers/specs/2026-07-13-financeiro-exportacao-contabilidade-design.md`.

---

### Task 1: Pacote de exportação — 4 planilhas novas

**Files:**
- Modify: `lib/exportacaoContabilidade.ts`

**Interfaces:**
- Produces: nenhuma nova — só adiciona conteúdo ao zip já gerado por `exportarPacoteMensal`.

- [ ] **Step 1: Adicionar a seção `05-Financeiro` antes do manifest**

Trocar:

```ts
    const bufConsLances = await construirPlanilha(
      ["Consórcio", "Data", "Valor", "Tipo", "Resultado"],
      lancesCons.map((l) => [l.consorcios?.descricao ?? "", l.data, l.valor, l.tipo, l.resultado])
    );
    zip.file("04-Cartoes-Emprestimos-Consorcios/consorcios/resumo-lances.xlsx", bufConsLances);

    // ── Manifest (por último — já sabe quais anexos falharam) ───
```

por:

```ts
    const bufConsLances = await construirPlanilha(
      ["Consórcio", "Data", "Valor", "Tipo", "Resultado"],
      lancesCons.map((l) => [l.consorcios?.descricao ?? "", l.data, l.valor, l.tipo, l.resultado])
    );
    zip.file("04-Cartoes-Emprestimos-Consorcios/consorcios/resumo-lances.xlsx", bufConsLances);

    // ── 05-Financeiro ───────────────────────────────────────────
    const { data: contasPagarData } = await supabase
      .from("lancamentos").select("descricao, valor, vencimento, status, fornecedor")
      .eq("tipo", "Saída").gte("vencimento", primeiroDia).lte("vencimento", ultimoDia).is("deletado_em", null)
      .order("vencimento");
    const bufContasPagar = await construirPlanilha(
      ["Descrição", "Fornecedor", "Vencimento", "Valor", "Status"],
      (contasPagarData ?? []).map((l: any) => [l.descricao, l.fornecedor ?? "", l.vencimento, Number(l.valor), l.status])
    );
    zip.file("05-Financeiro/contas-a-pagar.xlsx", bufContasPagar);

    const { data: contasReceberData } = await supabase
      .from("lancamentos").select("descricao, valor, vencimento, status, cliente_id, clientes(nome)")
      .eq("tipo", "Entrada").gte("vencimento", primeiroDia).lte("vencimento", ultimoDia).is("deletado_em", null)
      .order("vencimento");
    const bufContasReceber = await construirPlanilha(
      ["Descrição", "Cliente", "Vencimento", "Valor", "Status"],
      (contasReceberData ?? []).map((l: any) => [l.descricao, l.clientes?.nome ?? "", l.vencimento, Number(l.valor), l.status])
    );
    zip.file("05-Financeiro/contas-a-receber.xlsx", bufContasReceber);

    const { data: baixasData } = await supabase
      .from("baixas_lancamento").select("data, valor, lancamentos(descricao, tipo)")
      .gte("data", primeiroDia).lte("data", ultimoDia).is("estornado_em", null)
      .order("data");
    const bufBaixas = await construirPlanilha(
      ["Data", "Descrição", "Tipo", "Valor"],
      (baixasData ?? []).map((b: any) => [b.data, b.lancamentos?.descricao ?? "", b.lancamentos?.tipo ?? "", Number(b.valor)])
    );
    zip.file("05-Financeiro/extrato-baixas.xlsx", bufBaixas);

    const { data: contasBancData } = await supabase
      .from("contas_bancarias").select("id, nome, tipo, saldo_inicial").eq("ativo", true).order("nome");
    const { data: baixasAteFimData } = await supabase
      .from("baixas_lancamento").select("conta_id, valor, lancamentos(tipo)")
      .is("estornado_em", null).not("conta_id", "is", null).lte("data", ultimoDia);
    const saldoPorConta = new Map<number, number>();
    for (const b of (baixasAteFimData ?? []) as unknown as { conta_id: number; valor: number; lancamentos: { tipo: string } | null }[]) {
      if (!b.lancamentos) continue;
      const delta = b.lancamentos.tipo === "Entrada" ? Number(b.valor) : -Number(b.valor);
      saldoPorConta.set(b.conta_id, (saldoPorConta.get(b.conta_id) ?? 0) + delta);
    }
    const bufSaldos = await construirPlanilha(
      ["Conta", "Tipo", `Saldo em ${ultimoDia}`],
      ((contasBancData ?? []) as { id: number; nome: string; tipo: string; saldo_inicial: number }[]).map((c) => [
        c.nome, c.tipo, Number(c.saldo_inicial) + (saldoPorConta.get(c.id) ?? 0),
      ])
    );
    zip.file("05-Financeiro/saldo-contas-bancarias.xlsx", bufSaldos);

    // ── Manifest (por último — já sabe quais anexos falharam) ───
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add lib/exportacaoContabilidade.ts
git commit -m "feat(contabilidade): adiciona secao Financeiro ao pacote de exportacao mensal"
```

---

### Task 2: Item novo no checklist + migration

**Files:**
- Modify: `lib/contabilidadeChecklist.ts`
- Create: `sql/contabilidade-fase6-checklist-ativa-financeiro.sql`

**Interfaces:**
- Produces: item `financeiro` reconhecido por `getChecklistItemDef`/`itemDisponivel` — consumido automaticamente por `getOrCreateFechamento` (sem mudança nela) e pela Task 3.

- [ ] **Step 1: Atualizar `lib/contabilidadeChecklist.ts`**

Trocar:

```ts
export interface ChecklistItemDef {
  key: string;
  label: string;
  area: "documentos_fiscais" | "estoque" | "ativo_imobilizado" | "cartoes";
  faseDisponivel: 1 | 2 | 3 | 4;
}

export const CHECKLIST_ITENS: ChecklistItemDef[] = [
  { key: "nf_compra",          label: "NF Compra",                          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_entrada",         label: "NF Entrada",                         area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_saida",           label: "NF Saída",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_perda",           label: "NF Perda",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_cancelada",       label: "NF Canceladas",                      area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "carta_correcao",     label: "Carta de Correção",                  area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "inutilizacao",       label: "Inutilização de Numeração",          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "estoque",            label: "Estoque / CMV",                      area: "estoque",            faseDisponivel: 2 },
  { key: "ativo_imobilizado",  label: "Ativo Imobilizado",                  area: "ativo_imobilizado",  faseDisponivel: 3 },
  { key: "cartoes_emprestimos", label: "Cartões / Empréstimos / Consórcios", area: "cartoes",           faseDisponivel: 4 },
];

export const FASE_ATUAL = 4;
```

por:

```ts
export interface ChecklistItemDef {
  key: string;
  label: string;
  area: "documentos_fiscais" | "estoque" | "ativo_imobilizado" | "cartoes" | "financeiro";
  faseDisponivel: 1 | 2 | 3 | 4 | 6;
}

export const CHECKLIST_ITENS: ChecklistItemDef[] = [
  { key: "nf_compra",          label: "NF Compra",                          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_entrada",         label: "NF Entrada",                         area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_saida",           label: "NF Saída",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_perda",           label: "NF Perda",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_cancelada",       label: "NF Canceladas",                      area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "carta_correcao",     label: "Carta de Correção",                  area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "inutilizacao",       label: "Inutilização de Numeração",          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "estoque",            label: "Estoque / CMV",                      area: "estoque",            faseDisponivel: 2 },
  { key: "ativo_imobilizado",  label: "Ativo Imobilizado",                  area: "ativo_imobilizado",  faseDisponivel: 3 },
  { key: "cartoes_emprestimos", label: "Cartões / Empréstimos / Consórcios", area: "cartoes",           faseDisponivel: 4 },
  { key: "financeiro",         label: "Financeiro (Contas a Pagar/Receber)", area: "financeiro",        faseDisponivel: 6 },
];

export const FASE_ATUAL = 6;
```

(Nota: pular de 4 pra 6 é intencional — Fase 5 já foi usada pro roadmap de exportação client-side, não é reaproveitada aqui.)

- [ ] **Step 2: Escrever a migration**

```sql
-- Módulo Contabilidade — Fase 6
-- Ativa o item "Financeiro (Contas a Pagar/Receber)" do checklist nos
-- fechamentos que já existiam ANTES da Fase 6 (nasceram como
-- 'nao_aplicavel'). Fechamentos NOVOS já nascem com o item correto —
-- isso só corrige o passado. Só mexe em fechamentos ainda 'aberto' (não
-- reabre pendência num mês já concluído).
--
-- IMPORTANTE: rodar DEPOIS do deploy do código que muda FASE_ATUAL para 6
-- em lib/contabilidadeChecklist.ts — ordem importa.
-- Idempotente — rodar de novo não faz nada na segunda vez.

UPDATE contabilidade_checklist_itens ci
SET status = 'pendente', updated_at = now()
FROM contabilidade_fechamentos f
WHERE ci.fechamento_id = f.id
  AND ci.item_key = 'financeiro'
  AND ci.status = 'nao_aplicavel'
  AND f.status = 'aberto';
```

- [ ] **Step 3: Registrar no manifest de migrations**

Adicionar uma linha no fim da tabela de `sql/MANIFEST.md` (data de hoje, caminho do arquivo, descrição, status `⏳ pendente` — vira `✅` só quando o usuário confirmar que rodou).

- [ ] **Step 4: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: erros esperados em `services/contabilidadeDashboard.service.ts` (ainda não usa a área nova — corrigido na Task 3). Nenhum outro arquivo deve quebrar.

- [ ] **Step 5: Commit**

```bash
git add lib/contabilidadeChecklist.ts sql/contabilidade-fase6-checklist-ativa-financeiro.sql sql/MANIFEST.md
git commit -m "feat(contabilidade): adiciona item Financeiro ao checklist mensal (fase 6)"
```

---

### Task 3: Semáforo "Financeiro" no Dashboard de Contabilidade

**Files:**
- Modify: `services/contabilidadeDashboard.service.ts`
- Modify: `app/contabilidade/page.tsx`

**Interfaces:**
- Consumes: item `financeiro` do checklist (Task 2).
- Produces: 5º `StatusArea` no array retornado por `getStatusAreas`.

- [ ] **Step 1: Adicionar a área "Financeiro" em `getStatusAreas`**

Trocar:

```ts
  return [
    documentosFiscais,
    estoque,
    ativoImobilizado,
    cartoesArea,
  ];
}
```

por:

```ts
  const hojeStrFin = new Date().toISOString().split("T")[0];
  const [{ count: pagarVencidas }, { count: receberVencidas }] = await Promise.all([
    supabase.from("lancamentos").select("id", { count: "exact", head: true }).eq("tipo", "Saída").neq("status", "Pago").lt("vencimento", hojeStrFin).is("deletado_em", null),
    supabase.from("lancamentos").select("id", { count: "exact", head: true }).eq("tipo", "Entrada").neq("status", "Pago").lt("vencimento", hojeStrFin).is("deletado_em", null),
  ]);
  const totalVencidasFin = (pagarVencidas ?? 0) + (receberVencidas ?? 0);
  const itemChecklistFinanceiro = itens.find((i) => i.item_key === "financeiro");
  const checklistFinanceiroPendente = itemChecklistFinanceiro?.status === "pendente" || itemChecklistFinanceiro?.status === "em_andamento";

  const financeiroArea: StatusArea =
    totalVencidasFin > 0
      ? { area: "financeiro", label: "Financeiro", semaforo: "vermelho", detalhe: `${totalVencidasFin} conta(s) vencida(s) sem pagamento` }
      : checklistFinanceiroPendente
      ? { area: "financeiro", label: "Financeiro", semaforo: "amarelo", detalhe: "Checklist financeiro ainda pendente" }
      : { area: "financeiro", label: "Financeiro", semaforo: "verde", detalhe: "Completo" };

  return [
    documentosFiscais,
    estoque,
    ativoImobilizado,
    cartoesArea,
    financeiroArea,
  ];
}
```

- [ ] **Step 2: Ajustar o grid em `app/contabilidade/page.tsx`**

Trocar:

```tsx
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
```

(no bloco do "Semáforo por área") por:

```tsx
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "24px" }}>
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add services/contabilidadeDashboard.service.ts app/contabilidade/page.tsx
git commit -m "feat(contabilidade): adiciona semaforo Financeiro ao dashboard"
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

Sem service role key local nem dados de teste fáceis de gerar. Pedir pro usuário:

1. Rodar `sql/contabilidade-fase6-checklist-ativa-financeiro.sql` no Supabase.
2. Abrir `/contabilidade/checklist` e conferir que "Financeiro (Contas a Pagar/Receber)" aparece como item pendente nos fechamentos abertos.
3. Abrir `/contabilidade` e conferir o 5º card de semáforo ("Financeiro").
4. Exportar o pacote mensal de um mês com movimentação financeira real (botão "Exportar Pacote Mensal") e conferir que `05-Financeiro/` aparece no zip com as 4 planilhas preenchidas corretamente.

Isso encerra o sub-projeto 3 de 7 (Financeiro na exportação). Próximo da fila: Acessibilidade (htmlFor).
