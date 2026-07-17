# Filtro de Conta na Analítica do Dashboard Financeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o seletor de conta bancária da aba Analítica do Dashboard
Financeiro filtrar de verdade as Despesas exibidas nela (Receita e Metas
continuam sempre "todas as contas").

**Architecture:** `getDespesasPorMes` e `getDRE` ganham um parâmetro
opcional `contaId` que filtra só a perna de despesas de cada consulta
(`conta_id` já existe em `lancamentos`/`baixas_lancamento` — nenhuma
migração de schema é necessária). A página Analítica passa a ler
`useFiltroFinanceiro()` (hoje nem importado ali) e repassa
`filtro.contaId` só pros dois serviços acima.

**Tech Stack:** Next.js (App Router, client components), Supabase-js,
TypeScript.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-17-filtro-analitica-conta-design.md`.
- **Só Despesas respeita o filtro de conta.** `getFaturamentoMensal` e
  `getMetas` NUNCA recebem `contaId` — permanecem sempre "todas as
  contas", em qualquer task deste plano.
- **Período fica fora de escopo** — `FiltroGlobalFinanceiro` continua
  com `mostrarPeriodo={false}` na Analítica; só `mostrarConta` muda pra
  `true`.
- `contaId` é sempre opcional (`number | null | undefined`) em toda
  assinatura nova — os call sites existentes de `getDRE`/
  `getDespesasPorMes` fora da Analítica (`app/dre/page.tsx`,
  `app/dashboard-financeiro/page.tsx`) não são tocados e devem continuar
  compilando e funcionando exatamente como hoje (chamando sem o
  argumento novo).
- No widget "Comparativo por Período", as linhas Resultado e Margem
  Líquida só aparecem quando `filtro.contaId == null` — com uma conta
  filtrada, a tabela mostra só Receita e Despesas.
- Sem teste automatizado — nenhuma função de I/O (`services/`) nem
  nenhuma página deste projeto tem teste, só `lib/` puro tem.
  Verificação via `npx tsc --noEmit` e `npm run build`.
- Commit direto na `main` (workflow padrão deste projeto — sem
  PR/worktree).
- Mensagens de commit em português, no padrão do projeto
  (`git log --oneline`).

---

### Task 1: `getDespesasPorMes` ganha filtro de conta

**Files:**
- Modify: `services/dashboardFinanceiro.service.ts`

**Interfaces:**
- Produces: `getDespesasPorMes(meses?: number, contaId?: number | null): Promise<MesValor[]>`
  (assinatura nova — `contaId` é o 2º parâmetro, opcional).

- [ ] **Step 1: Adicionar o filtro**

Localizar em `services/dashboardFinanceiro.service.ts`:

```ts
export interface MesValor { ano: number; mes: number; valor: number; }

// Despesas (baixas de Saída) somadas por mês, últimos N meses.
export async function getDespesasPorMes(meses = 6): Promise<MesValor[]> {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);

  const { data } = await supabase
    .from('baixas_lancamento')
    .select('valor, data, lancamentos!inner(tipo)')
    .is('estornado_em', null)
    .eq('lancamentos.tipo', 'Saída')
    .gte('data', fmtData(inicio));

  const porMes = new Map<string, number>();
  for (const b of (data ?? []) as unknown as { valor: number; data: string }[]) {
    const key = b.data.slice(0, 7); // YYYY-MM
    porMes.set(key, (porMes.get(key) ?? 0) + Number(b.valor));
  }

  const resultado: MesValor[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    resultado.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, valor: porMes.get(key) ?? 0 });
  }
  return resultado;
}
```

Substituir por:

```ts
export interface MesValor { ano: number; mes: number; valor: number; }

// Despesas (baixas de Saída) somadas por mês, últimos N meses.
// contaId opcional restringe a uma única conta bancária (mesmo padrão
// de getSaldoCaixaTotal/getSaldosPorConta neste arquivo).
export async function getDespesasPorMes(meses = 6, contaId?: number | null): Promise<MesValor[]> {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);

  let query = supabase
    .from('baixas_lancamento')
    .select('valor, data, lancamentos!inner(tipo)')
    .is('estornado_em', null)
    .eq('lancamentos.tipo', 'Saída')
    .gte('data', fmtData(inicio));
  if (contaId) query = query.eq('conta_id', contaId);
  const { data } = await query;

  const porMes = new Map<string, number>();
  for (const b of (data ?? []) as unknown as { valor: number; data: string }[]) {
    const key = b.data.slice(0, 7); // YYYY-MM
    porMes.set(key, (porMes.get(key) ?? 0) + Number(b.valor));
  }

  const resultado: MesValor[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    resultado.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, valor: porMes.get(key) ?? 0 });
  }
  return resultado;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add services/dashboardFinanceiro.service.ts
git commit -m "feat: getDespesasPorMes aceita filtro opcional de conta"
```

---

### Task 2: `getDRE` ganha filtro de conta (só na perna de despesas)

**Files:**
- Modify: `services/dre.service.ts`

**Interfaces:**
- Consumes: nenhuma interface nova de outra task.
- Produces: `getDRE(ano: number, mes: number | null, regime?: RegimeDRE, contaId?: number | null): Promise<DRE>`
  (assinatura nova — `contaId` é o 4º parâmetro, opcional, depois de
  `regime`).

- [ ] **Step 1: Adicionar o filtro nos dois regimes**

Localizar em `services/dre.service.ts`:

```ts
export async function getDRE(ano: number, mes: number | null, regime: RegimeDRE = 'competencia'): Promise<DRE> {
  const { ini, fim } = periodo(ano, mes);

  if (regime === 'caixa') {
    const [entradasRes, saidasRes, devolucoesRes] = await Promise.all([
      supabase.from('baixas_lancamento').select('valor, lancamentos!inner(tipo, natureza)').is('estornado_em', null).eq('lancamentos.tipo', 'Entrada').eq('lancamentos.natureza', 'normal').gte('data', ini).lte('data', fim),
      supabase.from('baixas_lancamento').select('valor, lancamentos!inner(tipo, natureza, plano_contas(descricao))').is('estornado_em', null).eq('lancamentos.tipo', 'Saída').eq('lancamentos.natureza', 'normal').gte('data', ini).lte('data', fim),
      supabase.from('baixas_lancamento').select('valor, lancamentos!inner(natureza)').is('estornado_em', null).eq('lancamentos.natureza', 'devolucao').gte('data', ini).lte('data', fim),
    ]);
```

Substituir por:

```ts
export async function getDRE(ano: number, mes: number | null, regime: RegimeDRE = 'competencia', contaId?: number | null): Promise<DRE> {
  const { ini, fim } = periodo(ano, mes);

  if (regime === 'caixa') {
    let saidasQuery = supabase.from('baixas_lancamento').select('valor, lancamentos!inner(tipo, natureza, plano_contas(descricao))').is('estornado_em', null).eq('lancamentos.tipo', 'Saída').eq('lancamentos.natureza', 'normal').gte('data', ini).lte('data', fim);
    if (contaId) saidasQuery = saidasQuery.eq('conta_id', contaId);

    const [entradasRes, saidasRes, devolucoesRes] = await Promise.all([
      supabase.from('baixas_lancamento').select('valor, lancamentos!inner(tipo, natureza)').is('estornado_em', null).eq('lancamentos.tipo', 'Entrada').eq('lancamentos.natureza', 'normal').gte('data', ini).lte('data', fim),
      saidasQuery,
      supabase.from('baixas_lancamento').select('valor, lancamentos!inner(natureza)').is('estornado_em', null).eq('lancamentos.natureza', 'devolucao').gte('data', ini).lte('data', fim),
    ]);
```

Localizar (perna de competência, logo abaixo no mesmo arquivo):

```ts
  const [pedidosRes, despesasRes, devolucoesRes, cmvPeriodo] = await Promise.all([
    supabase.from('pedidos').select('id, valor_total, valor_ipi').neq('status', 'Cancelado').gte('dt_pedido', ini).lte('dt_pedido', fim),
    supabase.from('lancamentos').select('valor, vencimento, plano_contas(descricao)').eq('tipo', 'Saída').eq('natureza', 'normal').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    supabase.from('lancamentos').select('valor').eq('natureza', 'devolucao').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    getCMVPeriodo(ini, fim),
  ]);
```

Substituir por:

```ts
  let despesasQuery = supabase.from('lancamentos').select('valor, vencimento, plano_contas(descricao)').eq('tipo', 'Saída').eq('natureza', 'normal').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null);
  if (contaId) despesasQuery = despesasQuery.eq('conta_id', contaId);

  const [pedidosRes, despesasRes, devolucoesRes, cmvPeriodo] = await Promise.all([
    supabase.from('pedidos').select('id, valor_total, valor_ipi').neq('status', 'Cancelado').gte('dt_pedido', ini).lte('dt_pedido', fim),
    despesasQuery,
    supabase.from('lancamentos').select('valor').eq('natureza', 'devolucao').gte('vencimento', ini).lte('vencimento', fim).is('deletado_em', null),
    getCMVPeriodo(ini, fim),
  ]);
```

Receita (`pedidosRes`/`entradasRes`), devoluções e CMV não são tocados
por nenhuma das duas substituições — só as queries de despesas
(`saidasQuery`/`despesasQuery`) ganham o `.eq('conta_id', contaId)`
condicional.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Rodar build completo**

Run: `npm run build`
Expected: build completo sem erros (`getDRE` é usado em 3 páginas —
`app/dre/page.tsx`, `app/dashboard-financeiro/page.tsx` e a Analítica —
o build pega qualquer chamada que ficou incompatível com a assinatura
nova; as duas primeiras não são modificadas nesta task e devem
continuar compilando sem passar o 4º argumento).

- [ ] **Step 4: Commit**

```bash
git add services/dre.service.ts
git commit -m "feat: getDRE aceita filtro opcional de conta na perna de despesas"
```

---

### Task 3: Aba Analítica passa a usar o filtro de conta

**Files:**
- Modify: `app/dashboard-financeiro/analitica/page.tsx`

**Interfaces:**
- Consumes: `getDespesasPorMes(meses, contaId)` (Task 1);
  `getDRE(ano, mes, regime, contaId)` (Task 2); `useFiltroFinanceiro()`
  (`components/financeiro/useFiltroFinanceiro.ts`, já existe — retorna
  `{ filtro: { periodo, contaId }, setFiltro }`, mesmo hook já usado em
  `app/dashboard-financeiro/estrategica/page.tsx`).

- [ ] **Step 1: Importar e usar `useFiltroFinanceiro`**

Localizar em `app/dashboard-financeiro/analitica/page.tsx`:

```tsx
import { useWidgetsVisiveis } from "@/components/financeiro/useWidgetsVisiveis";
import { useRealtimeDashboard } from "@/components/financeiro/useRealtimeDashboard";
```

Substituir por:

```tsx
import { useWidgetsVisiveis } from "@/components/financeiro/useWidgetsVisiveis";
import { useRealtimeDashboard } from "@/components/financeiro/useRealtimeDashboard";
import { useFiltroFinanceiro } from "@/components/financeiro/useFiltroFinanceiro";
```

- [ ] **Step 2: Ler o filtro e recarregar quando a conta mudar**

Localizar:

```tsx
function AnaliticaInner() {
  const { visivel, toggle, widgets } = useWidgetsVisiveis("analitica", WIDGETS_ANALITICA);
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const { ativo: aoVivo } = useRealtimeDashboard(() => load());

  useEffect(() => { load(); }, []);
```

Substituir por:

```tsx
function AnaliticaInner() {
  const { filtro } = useFiltroFinanceiro();
  const { visivel, toggle, widgets } = useWidgetsVisiveis("analitica", WIDGETS_ANALITICA);
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const { ativo: aoVivo } = useRealtimeDashboard(() => load());

  useEffect(() => { load(); }, [filtro.contaId]);
```

- [ ] **Step 3: Passar `filtro.contaId` pros serviços de despesa/DRE**

Localizar:

```tsx
    const [
      dreMesAtual, dreMesAnterior, dreAnoAnterior,
      fatAno0, fatAno1, fatAno2,
      despesasPorMes,
      metasAno0, metasAno1,
    ] = await Promise.all([
      getDRE(anoAtual, mesAtual),
      getDRE(mesAnteriorDate.getFullYear(), mesAnteriorDate.getMonth() + 1),
      getDRE(anoAtual - 1, mesAtual),
      getFaturamentoMensal(anoAtual),
      getFaturamentoMensal(anoAtual - 1),
      getFaturamentoMensal(anoAtual - 2),
      getDespesasPorMes(12),
      getMetas(anoAtual),
      getMetas(anoAtual - 1),
    ]);
```

Substituir por:

```tsx
    const [
      dreMesAtual, dreMesAnterior, dreAnoAnterior,
      fatAno0, fatAno1, fatAno2,
      despesasPorMes,
      metasAno0, metasAno1,
    ] = await Promise.all([
      getDRE(anoAtual, mesAtual, 'competencia', filtro.contaId),
      getDRE(mesAnteriorDate.getFullYear(), mesAnteriorDate.getMonth() + 1, 'competencia', filtro.contaId),
      getDRE(anoAtual - 1, mesAtual, 'competencia', filtro.contaId),
      getFaturamentoMensal(anoAtual),
      getFaturamentoMensal(anoAtual - 1),
      getFaturamentoMensal(anoAtual - 2),
      getDespesasPorMes(12, filtro.contaId),
      getMetas(anoAtual),
      getMetas(anoAtual - 1),
    ]);
```

Note que `getFaturamentoMensal`/`getMetas` continuam exatamente como
estavam — sem `contaId`, por decisão do usuário (Receita/Metas sempre
"todas as contas").

- [ ] **Step 4: Mostrar o seletor de conta e o aviso de filtro parcial**

Localizar:

```tsx
      <NivelTabs ativo="analitica" />
      <FiltroGlobalFinanceiro mostrarPeriodo={false} mostrarConta={false} />

      <div className="con">
        {loading || !dados ? <div className="loading">Carregando...</div> : (
```

Substituir por:

```tsx
      <NivelTabs ativo="analitica" />
      <FiltroGlobalFinanceiro mostrarPeriodo={false} mostrarConta={true} />

      <div className="con">
        {filtro.contaId != null && (
          <div style={{ fontSize: 11, color: "var(--t3)", padding: "8px 12px", background: "var(--surf2)", borderRadius: 8, marginBottom: 14 }}>
            Despesas filtradas pela conta selecionada. Receita e metas sempre consideram todas as contas.
          </div>
        )}
        {loading || !dados ? <div className="loading">Carregando...</div> : (
```

- [ ] **Step 5: Esconder Resultado/Margem Líquida no Comparativo quando filtrado**

Localizar:

```tsx
                  <tbody>
                    <LinhaComparativo label="Receita" atual={dados.dreMesAtual.receita} anterior={dados.dreMesAnterior.receita} anoPassado={dados.dreAnoAnterior.receita} />
                    <LinhaComparativo label="Despesas" atual={dados.dreMesAtual.despesasTotal} anterior={dados.dreMesAnterior.despesasTotal} anoPassado={dados.dreAnoAnterior.despesasTotal} inverso />
                    <LinhaComparativo label="Resultado" atual={dados.dreMesAtual.resultado} anterior={dados.dreMesAnterior.resultado} anoPassado={dados.dreAnoAnterior.resultado} />
                    <LinhaComparativo label="Margem Líquida" atual={dados.dreMesAtual.margemLiquidaPct} anterior={dados.dreMesAnterior.margemLiquidaPct} anoPassado={dados.dreAnoAnterior.margemLiquidaPct} percentual />
                  </tbody>
```

Substituir por:

```tsx
                  <tbody>
                    <LinhaComparativo label="Receita" atual={dados.dreMesAtual.receita} anterior={dados.dreMesAnterior.receita} anoPassado={dados.dreAnoAnterior.receita} />
                    <LinhaComparativo label="Despesas" atual={dados.dreMesAtual.despesasTotal} anterior={dados.dreMesAnterior.despesasTotal} anoPassado={dados.dreAnoAnterior.despesasTotal} inverso />
                    {filtro.contaId == null && (
                      <>
                        <LinhaComparativo label="Resultado" atual={dados.dreMesAtual.resultado} anterior={dados.dreMesAnterior.resultado} anoPassado={dados.dreAnoAnterior.resultado} />
                        <LinhaComparativo label="Margem Líquida" atual={dados.dreMesAtual.margemLiquidaPct} anterior={dados.dreMesAnterior.margemLiquidaPct} anoPassado={dados.dreAnoAnterior.margemLiquidaPct} percentual />
                      </>
                    )}
                  </tbody>
```

Evolução e Sazonalidade não precisam de nenhuma mudança de JSX — a
Evolução já plota `receita`/`despesa` como linhas separadas (a despesa
já reflete `filtro.contaId` via `getDespesasPorMes` do Step 3); a
Sazonalidade usa só `getFaturamentoMensal`, então o filtro
legitimamente não tem efeito nela.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Rodar build completo**

Run: `npm run build`
Expected: build completo sem erros.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard-financeiro/analitica/page.tsx
git commit -m "feat: aba Analitica filtra despesas por conta"
```

---

### Task 4: Verificação manual

**Files:** nenhum (só validação)

**Interfaces:** N/A

- [ ] **Step 1: Rodar build completo**

Run: `npx tsc --noEmit && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Conferir a aba Analítica sem filtro**

Subir o dev server, abrir `/dashboard-financeiro/analitica`. Confirmar
que a barra de filtro aparece só com o seletor de conta (sem período),
mostrando "Todas as contas". Os 3 widgets (Comparativo, Evolução,
Sazonalidade) mostram os mesmos números de antes da mudança — nenhum
aviso de filtro aparece, Comparativo mostra as 4 linhas (Receita,
Despesas, Resultado, Margem Líquida).

- [ ] **Step 3: Selecionar uma conta**

Escolher uma conta bancária específica no seletor. Confirmar:
- O aviso "Despesas filtradas pela conta selecionada..." aparece.
- No Comparativo, as linhas Resultado e Margem Líquida somem — só
  Receita e Despesas ficam visíveis, e o valor de Despesas muda
  (normalmente cai, já que reflete só uma conta).
- Na Evolução, a linha de despesa muda de formato/valor; as linhas de
  receita e meta continuam iguais a antes de filtrar.
- Na Sazonalidade, nada muda (é só receita).

- [ ] **Step 4: Voltar pra "Todas as contas"**

Selecionar "Todas as contas" de novo (ou clicar "Limpar" na barra de
filtro). Confirmar que tudo volta exatamente ao estado do Step 2,
incluindo as 4 linhas do Comparativo.

- [ ] **Step 5: Conferir que as outras telas de DRE não mudaram**

Abrir `/dre` e a aba Executiva (`/dashboard-financeiro`) e conferir que
os números de DRE ali continuam iguais a antes desta mudança (nenhuma
delas passa `contaId`, então devem se comportar exatamente como antes).
