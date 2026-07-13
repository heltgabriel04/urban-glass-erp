# Alertas Automáticos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 4 alertas novos (compra parada, NC/retrabalho antigo, cliente estourou crédito, pedido sem programação) reaproveitando os padrões visuais já estabelecidos em cada tela, sem duplicar alertas existentes.

**Architecture:** Cada alerta deriva de dado já buscado (ou de uma chamada de serviço já existente, só não usada ainda nesse contexto) — nenhuma tabela nova, nenhuma migration. Cálculo client-side em cada página/serviço, seguindo o padrão local (chip no Dashboard, banner na Qualidade, item de risco no Radar).

**Tech Stack:** Next.js/TypeScript, Supabase client (browser).

## Global Constraints

- Nenhum alerta novo pode duplicar um já existente (ex.: "pedido sem programação" precisa excluir o status que o chip `aguardandoOtim` já cobre).
- Alerta de crédito só informa — não altera `bloqueado_credito` automaticamente.
- Spec de referência: `docs/superpowers/specs/2026-07-13-alertas-automaticos-design.md`.

---

### Task 1: Dashboard — compra parada + pedido sem programação

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getPedidosSemProgramacao()` de `@/services/programacao.service` (já existe, `Promise<Pedido[]>`).

- [ ] **Step 1: Adicionar o import**

```ts
import { getPedidosSemProgramacao } from "@/services/programacao.service";
```

- [ ] **Step 2: Adicionar a chamada em `load()`**

Trocar:

```ts
  async function load() {
    setLoading(true);
    const [peds, fin, fat, est, qualidade, compras, { data: cp }] = await Promise.all([
      getPedidos(),
      getFinanceiroClientes(),
      getFaturamentoMensal(new Date().getFullYear()),
      getEstoque(),
      getResumoQualidade(),
      getCompras(),
      supabase.from("lancamentos").select("valor, vencimento").eq("tipo", "Saída").neq("status", "Pago").is("deletado_em", null),
    ]);
    setPedidos(peds);
    setFinanceiro(fin);
    setFatMensal(fat);
    setEstoque(est as unknown as EstoqueItem[]);
    setNcsAbertas(qualidade.ncsAbertas);
    setNcsCriticas(qualidade.ncsCriticas);
    setComprasPend(compras.filter(c => c.status !== 'recebido').length);
    setContasPagarAbertas((cp ?? []) as ContaPagarMin[]);
    setLoading(false);
  }
```

por:

```ts
  async function load() {
    setLoading(true);
    const [peds, fin, fat, est, qualidade, compras, { data: cp }, semProgramacao] = await Promise.all([
      getPedidos(),
      getFinanceiroClientes(),
      getFaturamentoMensal(new Date().getFullYear()),
      getEstoque(),
      getResumoQualidade(),
      getCompras(),
      supabase.from("lancamentos").select("valor, vencimento").eq("tipo", "Saída").neq("status", "Pago").is("deletado_em", null),
      getPedidosSemProgramacao(),
    ]);
    setPedidos(peds);
    setFinanceiro(fin);
    setFatMensal(fat);
    setEstoque(est as unknown as EstoqueItem[]);
    setNcsAbertas(qualidade.ncsAbertas);
    setNcsCriticas(qualidade.ncsCriticas);
    setComprasPend(compras.filter(c => c.status !== 'recebido').length);
    setContasPagarAbertas((cp ?? []) as ContaPagarMin[]);
    setCompras(compras);
    setSemProgramacao(semProgramacao);
    setLoading(false);
  }
```

- [ ] **Step 3: Adicionar os states novos**

Trocar:

```ts
  const [contasPagarAbertas, setContasPagarAbertas] = useState<ContaPagarMin[]>([]);
  const [loading, setLoading]       = useState(true);
```

por:

```ts
  const [contasPagarAbertas, setContasPagarAbertas] = useState<ContaPagarMin[]>([]);
  const [compras, setCompras]       = useState<Compra[]>([]);
  const [semProgramacao, setSemProgramacao] = useState<Pedido[]>([]);
  const [loading, setLoading]       = useState(true);
```

Atualizar o import de tipos (linha 12 hoje):

```ts
import type { Pedido, FinanceiroCliente, FaturamentoMensal, EstoqueItem, Compra } from "@/types";
```

- [ ] **Step 4: Derivar os 2 alertas novos**

Logo depois do bloco de `contasPagarVencidas`/`contasPagarVenceHoje` (perto de `const alertTotal = ...`):

```ts
  const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const comprasParadas = compras.filter(c => c.status === "rascunho" && new Date(c.dt_compra) < seteDiasAtras);

  const semProgramacaoReal = semProgramacao.filter(p => p.status !== "Aguardando otimização");
```

Atualizar `alertTotal` pra incluir os 2 novos:

```ts
  const alertTotal = inadimplentes.length + parciais.length + aguardandoOtim.length
    + itensRuptura.length + ncsAbertas + comprasPend + retiradas3d.length
    + contasPagarVencidas.length + contasPagarVenceHoje.length
    + comprasParadas.length + semProgramacaoReal.length;
```

- [ ] **Step 5: Adicionar os 2 chips no strip de alertas**

Logo depois do chip `aguardandoOtim` (último do strip hoje, dentro do bloco "Requer ação"):

```tsx
                  {comprasParadas.length > 0 && (
                    <a href="/compras" style={{ textDecoration: "none" }}>
                      <span className="chip cy" style={{ cursor: "pointer" }}>
                        {comprasParadas.length} compra{comprasParadas.length > 1 ? "s" : ""} parada{comprasParadas.length > 1 ? "s" : ""} há mais de 7 dias
                      </span>
                    </a>
                  )}
                  {semProgramacaoReal.length > 0 && (
                    <a href="/programacao" style={{ textDecoration: "none" }}>
                      <span className="chip cb" style={{ cursor: "pointer" }}>
                        {semProgramacaoReal.length} pedido{semProgramacaoReal.length > 1 ? "s" : ""} sem programação
                      </span>
                    </a>
                  )}
```

- [ ] **Step 6: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 7: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): adiciona alertas de compra parada e pedido sem programacao"
```

---

### Task 2: Qualidade — NC/retrabalho aberto há muito tempo

**Files:**
- Modify: `services/qualidade.service.ts`
- Modify: `app/qualidade/page.tsx`

**Interfaces:**
- Produces: `getResumoQualidade()` ganha `ncsAntigas: number` e `retrabalhosAntigos: number` no retorno. Consumido pela Task 2 Step 4.

- [ ] **Step 1: Atualizar `getResumoQualidade` em `services/qualidade.service.ts`**

Trocar:

```ts
export async function getResumoQualidade(): Promise<{
  ncsAbertas: number;
  ncsCriticas: number;
  m2PerdidoMes: number;
  valorPerdidoMes: number;
  retrabalhosAbertos: number;
}> {
  const mesAtual = new Date().toISOString().substring(0, 7); // 2026-06

  const [{ count: abertas }, { count: criticas }, quebrasRes, { count: retrabAtivos }] =
    await Promise.all([
      supabase.from('nao_conformidades').select('id', { count: 'exact', head: true }).in('status', ['Aberta', 'Em Análise', 'Aguardando Correção']),
      supabase.from('nao_conformidades').select('id', { count: 'exact', head: true }).eq('gravidade', 'Crítica').in('status', ['Aberta', 'Em Análise', 'Aguardando Correção']),
      supabase.from('quebras').select('m2_perdido, valor_perda').gte('dt_quebra', mesAtual + '-01'),
      supabase.from('retrabalhos').select('id', { count: 'exact', head: true }).in('status', ['Pendente', 'Em Execução']),
    ]);

  const m2Mes    = (quebrasRes.data ?? []).reduce((a: number, q: any) => a + Number(q.m2_perdido), 0);
  const valorMes = (quebrasRes.data ?? []).reduce((a: number, q: any) => a + Number(q.valor_perda ?? 0), 0);

  return {
    ncsAbertas:        abertas ?? 0,
    ncsCriticas:       criticas ?? 0,
    m2PerdidoMes:      m2Mes,
    valorPerdidoMes:   valorMes,
```

por:

```ts
export async function getResumoQualidade(): Promise<{
  ncsAbertas: number;
  ncsCriticas: number;
  ncsAntigas: number;
  m2PerdidoMes: number;
  valorPerdidoMes: number;
  retrabalhosAbertos: number;
  retrabalhosAntigos: number;
}> {
  const mesAtual = new Date().toISOString().substring(0, 7); // 2026-06
  const LIMITE_DIAS_ANTIGO = 15;
  const diasAberto = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000;

  const [ncsAbertasRes, ncsCriticasRes, quebrasRes, retrabAtivosRes] =
    await Promise.all([
      supabase.from('nao_conformidades').select('id, dt_ocorrencia').in('status', ['Aberta', 'Em Análise', 'Aguardando Correção']),
      supabase.from('nao_conformidades').select('id', { count: 'exact', head: true }).eq('gravidade', 'Crítica').in('status', ['Aberta', 'Em Análise', 'Aguardando Correção']),
      supabase.from('quebras').select('m2_perdido, valor_perda').gte('dt_quebra', mesAtual + '-01'),
      supabase.from('retrabalhos').select('id, dt_retrabalho').in('status', ['Pendente', 'Em Execução']),
    ]);

  const ncsAbertasRows   = (ncsAbertasRes.data ?? []) as { id: number; dt_ocorrencia: string }[];
  const retrabAtivosRows = (retrabAtivosRes.data ?? []) as { id: number; dt_retrabalho: string }[];
  const m2Mes    = (quebrasRes.data ?? []).reduce((a: number, q: any) => a + Number(q.m2_perdido), 0);
  const valorMes = (quebrasRes.data ?? []).reduce((a: number, q: any) => a + Number(q.valor_perda ?? 0), 0);

  return {
    ncsAbertas:        ncsAbertasRows.length,
    ncsCriticas:       ncsCriticasRes.count ?? 0,
    ncsAntigas:        ncsAbertasRows.filter(n => diasAberto(n.dt_ocorrencia) > LIMITE_DIAS_ANTIGO).length,
    m2PerdidoMes:      m2Mes,
    valorPerdidoMes:   valorMes,
    retrabalhosAntigos: retrabAtivosRows.filter(r => diasAberto(r.dt_retrabalho) > LIMITE_DIAS_ANTIGO).length,
```

- [ ] **Step 2: Confirmar a linha final da função**

Logo abaixo da linha `retrabalhosAntigos: ...` (Step 1), a função hoje termina com uma linha `retrabalhosAbertos: retrabAtivos ?? 0,` seguida de `};` e `}`. Trocar essa linha final:

```ts
    retrabalhosAbertos: retrabAtivos ?? 0,
  };
}
```

por:

```ts
    retrabalhosAbertos: retrabAtivosRows.length,
  };
}
```

- [ ] **Step 3: Rodar typecheck do service isoladamente**

Run: `npx tsc --noEmit`
Expected: erros esperados em `app/qualidade/page.tsx` (state ainda não tem os campos novos — corrigido no próximo passo). Nenhum outro arquivo deve quebrar.

- [ ] **Step 4: Atualizar `app/qualidade/page.tsx`**

Trocar:

```ts
  const [resumo, setResumo]                         = useState({ ncsAbertas: 0, ncsCriticas: 0, m2PerdidoMes: 0, valorPerdidoMes: 0, retrabalhosAbertos: 0 });
```

por:

```ts
  const [resumo, setResumo]                         = useState({ ncsAbertas: 0, ncsCriticas: 0, ncsAntigas: 0, m2PerdidoMes: 0, valorPerdidoMes: 0, retrabalhosAbertos: 0, retrabalhosAntigos: 0 });
```

Adicionar o novo banner logo depois do banner crítico existente (`app/qualidade/page.tsx`, bloco `{resumo.ncsCriticas > 0 && (...)}`):

```tsx
          {(resumo.ncsAntigas > 0 || resumo.retrabalhosAntigos > 0) && (
            <div className="item-card warn" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--warn)" }}>
                    {resumo.ncsAntigas > 0 && `${resumo.ncsAntigas} NC${resumo.ncsAntigas > 1 ? "s" : ""} aberta${resumo.ncsAntigas > 1 ? "s" : ""} há mais de 15 dias`}
                    {resumo.ncsAntigas > 0 && resumo.retrabalhosAntigos > 0 && " · "}
                    {resumo.retrabalhosAntigos > 0 && `${resumo.retrabalhosAntigos} retrabalho${resumo.retrabalhosAntigos > 1 ? "s" : ""} parado${resumo.retrabalhosAntigos > 1 ? "s" : ""} há mais de 15 dias`}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>
                    parado há muito tempo — vale revisar
                  </div>
                </div>
              </div>
            </div>
          )}
```

(Inserir esse bloco logo após o `)}` que fecha o banner crítico existente, antes do comentário `{/* ── NCs ABERTAS (principal) + GRAFICO ── */}`.)

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 6: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 7: Commit**

```bash
git add services/qualidade.service.ts app/qualidade/page.tsx
git commit -m "feat(qualidade): adiciona alerta de NC/retrabalho aberto ha muito tempo"
```

---

### Task 3: Radar de Riscos — cliente estourou limite de crédito

**Files:**
- Modify: `app/dashboard-financeiro/estrategica/page.tsx`

**Interfaces:**
- Consumes: `getFinanceiroClientes()` de `@/services/financeiro.service` (já existe, `Promise<FinanceiroCliente[]>`, campo `a_receber`).

- [ ] **Step 1: Adicionar o import**

```ts
import { getFinanceiroClientes } from "@/services/financeiro.service";
```

- [ ] **Step 2: Atualizar a interface `Dados`**

Trocar:

```ts
interface Dados {
  projecao: ProjecaoHorizonte[];
  concClientes: Concentracao;
  concFornecedores: Concentracao;
  inativos: ClienteInativo[];
  clientesBloqueados: number;
}
```

por:

```ts
interface Dados {
  projecao: ProjecaoHorizonte[];
  concClientes: Concentracao;
  concFornecedores: Concentracao;
  inativos: ClienteInativo[];
  clientesBloqueados: number;
  clientesEstouraramCredito: number;
}
```

- [ ] **Step 3: Atualizar `load()`**

Trocar:

```ts
  async function load() {
    setLoading(true);
    const [projecao, concClientes, concFornecedores, inativos, { data: bloqueados }] = await Promise.all([
      getProjecaoCaixa(undefined, HORIZONTES),
      getConcentracaoClientes(12),
      getConcentracaoFornecedores(12),
      getClientesInativos(60, 3),
      supabase.from("clientes").select("id").eq("bloqueado_credito", true),
    ]);
    setDados({ projecao, concClientes, concFornecedores, inativos, clientesBloqueados: (bloqueados ?? []).length });
    setLoading(false);
  }
```

por:

```ts
  async function load() {
    setLoading(true);
    const [projecao, concClientes, concFornecedores, inativos, { data: clientesData }, financeiroClientes] = await Promise.all([
      getProjecaoCaixa(undefined, HORIZONTES),
      getConcentracaoClientes(12),
      getConcentracaoFornecedores(12),
      getClientesInativos(60, 3),
      supabase.from("clientes").select("id, credito, bloqueado_credito"),
      getFinanceiroClientes(),
    ]);
    const clientes = (clientesData ?? []) as { id: number; credito: number; bloqueado_credito: boolean | null }[];
    const clientesBloqueados = clientes.filter(c => c.bloqueado_credito).length;
    const clientesEstouraramCredito = clientes.filter(c => {
      if (c.bloqueado_credito) return false;
      if (!c.credito || c.credito <= 0) return false;
      const fin = financeiroClientes.find(f => f.cliente_id === c.id);
      return !!fin && Number(fin.a_receber) > c.credito;
    }).length;
    setDados({ projecao, concClientes, concFornecedores, inativos, clientesBloqueados, clientesEstouraramCredito });
    setLoading(false);
  }
```

- [ ] **Step 4: Adicionar o item ao array `riscos`**

Trocar:

```ts
  const riscos: RiscoItem[] = dados ? [
    ...(dados.clientesBloqueados > 0 ? [{ texto: `${dados.clientesBloqueados} cliente(s) bloqueado(s) por crédito`, nivel: "alto" as const }] : []),
```

por:

```ts
  const riscos: RiscoItem[] = dados ? [
    ...(dados.clientesBloqueados > 0 ? [{ texto: `${dados.clientesBloqueados} cliente(s) bloqueado(s) por crédito`, nivel: "alto" as const }] : []),
    ...(dados.clientesEstouraramCredito > 0 ? [{ texto: `${dados.clientesEstouraramCredito} cliente(s) com saldo em aberto acima do limite de crédito`, nivel: "alto" as const }] : []),
```

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 6: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard-financeiro/estrategica/page.tsx
git commit -m "feat(dashboard-financeiro): adiciona alerta de cliente que estourou limite de credito"
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

Sem dados sintéticos fáceis de gerar pra cada cenário nesta sessão (compra parada 8+ dias, NC/retrabalho 16+ dias, cliente estourando crédito) e sem credencial de teste local. Pedir pro usuário:

1. Abrir `/dashboard` e conferir que os alertas antigos continuam aparecendo iguais (nenhuma regressão) — os 2 novos (`compra parada`, `pedido sem programação`) só aparecem se houver dado real que dispare.
2. Abrir `/qualidade` e conferir o mesmo — banner novo só aparece com NC/retrabalho realmente antigo.
3. Abrir `/dashboard-financeiro/estrategica` (Radar de Riscos) e conferir o mesmo pro alerta de crédito.

Isso encerra o sub-projeto 2 de 7 (Alertas). Próximo da fila: Financeiro no pacote de exportação da Contabilidade.
