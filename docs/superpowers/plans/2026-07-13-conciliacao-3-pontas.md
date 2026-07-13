# Conciliação 3 Pontas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar duas checagens de integridade (documento fiscal de compra sem vínculo, compra recebida sem lançamento) à função de alertas já existente do Dashboard da Contabilidade, sem criar tela nova.

**Architecture:** Extensão de `getAlertas(ano, mes)` em `services/contabilidadeDashboard.service.ts`. Reaproveita o `docsCompra` que a função já busca (checagem 1) e adiciona uma consulta nova de `compras` × `lancamentos` por competência (checagem 2). A lista de alertas já é renderizada em `app/contabilidade/page.tsx` — nenhuma mudança de UI necessária.

**Tech Stack:** Next.js + TypeScript + Supabase. Sem teste automatizado nesta task — `getAlertas` não é uma função pura (faz queries diretas ao Supabase), e o padrão já estabelecido no projeto (ver `services/programacao.service.test.ts`) só cobre com Vitest as funções puras dos services, não as que tocam banco. Verificação por `tsc --noEmit` + validação manual no navegador.

## Global Constraints

- Sem tabela nova, sem coluna nova, sem SQL — os dados já existem (`documento_fiscal.compra_id`, `compras.status`/`dt_recebimento`, `lancamentos.compra_id`).
- Severidade `"atencao"` nos dois alertas novos (não `"critico"`) — combinado no spec.
- `npx tsc --noEmit` antes de commitar. Commit direto em `main`, push ao final.

---

### Task 1: Duas checagens novas em `getAlertas`

**Files:**
- Modify: `services/contabilidadeDashboard.service.ts`

**Interfaces:**
- Consumes: `docsCompra` (já buscado dentro de `getAlertas`), tabelas `compras` e `lancamentos` via `supabase` (já importado no arquivo).
- Produces: nada novo exportado — só mais itens no array `Alerta[]` que `getAlertas` já retorna. Nenhum outro arquivo precisa saber da mudança.

- [ ] **Step 1: Adicionar as duas checagens**

Em `services/contabilidadeDashboard.service.ts`, dentro de `getAlertas`, logo antes do `return alertas;` (depois do bloco do checklist de fechamento, que é o último `if` antes do return), adicionar:

```ts
  const compraSemVinculo = docsCompra.filter((d) => d.entrada && !d.compra_id).length;
  if (compraSemVinculo > 0) {
    alertas.push({ severidade: "atencao", mensagem: "Documento de compra sem vínculo com registro de Compra", quantidade: compraSemVinculo });
  }

  const dtIniMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dtFimMes = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}T23:59:59`;
  const { data: comprasRecebidas } = await supabase
    .from("compras")
    .select("id")
    .eq("status", "recebido")
    .gte("dt_recebimento", dtIniMes)
    .lte("dt_recebimento", dtFimMes);
  const idsRecebidas = ((comprasRecebidas ?? []) as { id: string }[]).map((c) => c.id);
  if (idsRecebidas.length > 0) {
    const { data: comLancamento } = await supabase
      .from("lancamentos")
      .select("compra_id")
      .in("compra_id", idsRecebidas)
      .is("deletado_em", null);
    const idsComLancamento = new Set(((comLancamento ?? []) as { compra_id: string }[]).map((l) => l.compra_id));
    const semLancamento = idsRecebidas.filter((id) => !idsComLancamento.has(id)).length;
    if (semLancamento > 0) {
      alertas.push({ severidade: "atencao", mensagem: "Compra recebida sem conta a pagar gerada", quantidade: semLancamento });
    }
  }

```

O trecho existente logo depois (bloco do checklist de fechamento, que usa `ehCompetenciaAtual`/`getOrCreateFechamento`) continua igual, só que agora vem depois desse novo trecho em vez de vir logo antes do `return alertas;` — a ordem entre os dois blocos não importa (nenhum depende do outro), mas para a edição ficar mecânica, inserir o trecho acima **imediatamente antes** do bloco `const agora = new Date();` já existente.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `services/contabilidadeDashboard.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add services/contabilidadeDashboard.service.ts
git commit -m "feat: alertas de conciliacao (documento sem vinculo, compra sem lancamento)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 4: Build completo**

Run: `npm run build`
Expected: build passa sem erros.

- [ ] **Step 5: Checklist de validação manual (reportar ao usuário)**

- Abrir `/contabilidade` (Dashboard), selecionar um mês onde exista pelo menos uma compra `recebido`.
- Se não houver nenhuma pendência real, os dois alertas simplesmente não aparecem (comportamento esperado — só aparecem quando há algo fora do padrão).
- Para validar de verdade que a checagem funciona: pegar uma compra existente já recebida, ir em `lancamentos` (via SQL Editor do Supabase) e apagar/marcar como deletado o lançamento gerado por ela — ou usar um dado sintético `__teste_*` pra isso, nunca um registro real — e conferir que o alerta "Compra recebida sem conta a pagar gerada" aparece pra competência daquela compra.
