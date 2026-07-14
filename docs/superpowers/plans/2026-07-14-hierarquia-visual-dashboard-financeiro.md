# Hierarquia Visual — Dashboard Financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dashboard financeiro ganha um "hero card" pra "Resultado do Período" (com variação % + sparkline) e um empty state melhorado em "Despesas por Categoria", através de 3 componentes novos reutilizáveis (`MetricCard`, `Sparkline`, `EmptyState`) que outras telas podem adotar depois.

**Architecture:** 3 componentes novos em `components/ui/`, CSS centralizado em `app/globals.css` (mesmo padrão do resto do projeto — sem CSS modules/styled-components). Zero mudança em `services/dashboardFinanceiro.service.ts`: a variação %/sparkline do hero card são derivadas no cliente a partir de `dados.receitaDespesa`, que a página já busca hoje.

**Tech Stack:** Next.js/TypeScript, `recharts` (já é dependência do projeto), CSS custom properties.

## Global Constraints

- Nomenclatura das CSS custom properties já existentes no projeto: o accent é `--acc` (não `--accent`), positivo/negativo são `--ok`/`--err` (não `--positive`/`--negative`) — usar os nomes reais em todo código, nunca os nomes conceituais que apareceram no pedido original do usuário.
- Token novo `--acc-strong` segue a mesma convenção abreviada.
- Zero mudança em `services/dashboardFinanceiro.service.ts` ou em qualquer fonte de dado.
- Sem teste automatizado disponível — validar via `tsc --noEmit` + `next build`; validação visual (gradiente legível nos 2 temas, sparkline renderizando, empty state sem esticar o painel) fica por conta do usuário.
- Spec de referência: `docs/superpowers/specs/2026-07-14-hierarquia-visual-dashboard-financeiro-design.md`.

---

### Task 1: Token `--acc-strong` em `app/globals.css`

**Files:**
- Modify: `app/globals.css` (bloco `:root`, linhas 16-20) e bloco `[data-theme="light"]` (linhas 828-832)

- [ ] **Step 1: Adicionar no `:root` (tema escuro)**

De:

```css
  --acc:  #3dffa0;
  --acc2: #00c8ff;
  --acc3: #ff6b35;
  --acc4: #a78bfa;
  --acc5: #f59e0b;

  --ok:   #10b981;
```

Para:

```css
  --acc:  #3dffa0;
  --acc2: #00c8ff;
  --acc3: #ff6b35;
  --acc4: #a78bfa;
  --acc5: #f59e0b;
  --acc-strong: #17a374; /* variação mais funda do --acc — gradiente do MetricCard hero */

  --ok:   #10b981;
```

- [ ] **Step 2: Adicionar no `[data-theme="light"]`**

De:

```css
  --acc:  #4F46E5;
  --acc2: #2563EB;
  --acc3: #C2410C;
  --acc4: #7C3AED;
  --acc5: #D97706;

  --ok:   #16A34A;
```

Para:

```css
  --acc:  #4F46E5;
  --acc2: #2563EB;
  --acc3: #C2410C;
  --acc4: #7C3AED;
  --acc5: #D97706;
  --acc-strong: #4338CA; /* variação mais funda do --acc — gradiente do MetricCard hero */

  --ok:   #16A34A;
```

- [ ] **Step 3: Adicionar as classes CSS do `MetricCard`**, logo depois do bloco `.hero-bar { ... }` (linhas 422-429) e antes do comentário `/* ─── STAT INLINE`

De:

```css
.hero-bar {
  height: 5px;
  background: var(--surf3);
  border-radius: 99px;
  overflow: hidden;
  display: flex;
  margin: 18px 0 14px;
}

/* ─── STAT INLINE (linha de métricas secundárias) ─────────── */
```

Para:

```css
.hero-bar {
  height: 5px;
  background: var(--surf3);
  border-radius: 99px;
  overflow: hidden;
  display: flex;
  margin: 18px 0 14px;
}

/* ─── METRIC CARD (label + valor + sub, com variante hero) ─── */
.metric-card {
  background: var(--surf);
  border: 1px solid var(--b1);
  border-radius: var(--r2);
  padding: 18px 20px;
  box-shadow: var(--card-shadow, none);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metric-card.hero {
  background: linear-gradient(135deg, var(--acc), var(--acc-strong));
  border: none;
}
.mc-label { font-size: 11px; color: var(--t3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.metric-card.hero .mc-label { color: rgba(255,255,255,.8); }
.mc-value { font-family: 'DM Mono', monospace; font-weight: 700; font-size: 20px; line-height: 1.2; }
.metric-card.hero .mc-value { font-size: 32px; color: #fff; }
.mc-sub { font-size: 11px; color: var(--t3); }
.metric-card.hero .mc-sub { color: rgba(255,255,255,.65); }
.mc-trend { font-size: 12px; font-weight: 600; }
.mc-sparkline { margin-top: 6px; height: 24px; }

/* ─── STAT INLINE (linha de métricas secundárias) ─────────── */
```

- [ ] **Step 4: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (CSS puro, mas confirma que nada mais quebrou).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(tema): adiciona token --acc-strong e classes CSS do MetricCard"
```

---

### Task 2: `components/ui/Sparkline.tsx`

**Files:**
- Create: `components/ui/Sparkline.tsx`

**Interfaces:**
- Produces: `Sparkline({ data: number[], tone: "positive" | "negative" })` — consumido pela Task 4.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  tone: "positive" | "negative";
}

export default function Sparkline({ data, tone }: SparklineProps) {
  const chartData = data.map((v, i) => ({ i, v }));
  const stroke = tone === "positive" ? "var(--ok)" : "var(--err)";
  return (
    <div style={{ width: "100%", height: 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Sparkline.tsx
git commit -m "feat(ui): adiciona componente Sparkline"
```

---

### Task 3: `components/ui/EmptyState.tsx`

**Files:**
- Create: `components/ui/EmptyState.tsx`

**Interfaces:**
- Produces: `EmptyState({ title: string, subtitle?: string, icon?: React.ReactNode })` — consumido pela Task 5.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

function DefaultIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="20" stroke="var(--b2)" strokeWidth="2" strokeDasharray="4 4" />
      <rect x="16" y="26" width="4" height="8" rx="1" fill="var(--t3)" />
      <rect x="22" y="20" width="4" height="14" rx="1" fill="var(--t3)" />
      <rect x="28" y="16" width="4" height="18" rx="1" fill="var(--t3)" />
    </svg>
  );
}

export default function EmptyState({ title, subtitle, icon }: EmptyStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, padding: "24px 0" }}>
      {icon ?? <DefaultIcon />}
      <div style={{ fontSize: 13, color: "var(--t2)", fontWeight: 600, textAlign: "center" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: "var(--t3)", textAlign: "center", maxWidth: 260 }}>{subtitle}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Commit**

```bash
git add components/ui/EmptyState.tsx
git commit -m "feat(ui): adiciona componente EmptyState"
```

---

### Task 4: `components/ui/MetricCard.tsx`

**Files:**
- Create: `components/ui/MetricCard.tsx`

**Interfaces:**
- Consumes: `Sparkline` (Task 2).
- Produces: `MetricCard({ label, value, sub?, variant?, trend?, sparkline?, valueColor? })` — consumido pela Task 5.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import Sparkline from "./Sparkline";

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  variant?: "hero" | "default";
  trend?: { percent: number; label: string };
  sparkline?: number[];
  valueColor?: string;
}

export default function MetricCard({ label, value, sub, variant = "default", trend, sparkline, valueColor }: MetricCardProps) {
  const isHero = variant === "hero";
  const trendPositivo = trend ? trend.percent >= 0 : true;

  return (
    <div className={`metric-card${isHero ? " hero" : ""}`}>
      <div className="mc-label">{label}</div>
      <div className="mc-value" style={!isHero && valueColor ? { color: valueColor } : undefined}>{value}</div>
      {sub && <div className="mc-sub">{sub}</div>}
      {trend && (
        <div className="mc-trend" style={{ color: trendPositivo ? "var(--ok)" : "var(--err)" }}>
          {trendPositivo ? "▲" : "▼"} {Math.abs(trend.percent).toFixed(0)}% {trend.label}
        </div>
      )}
      {sparkline && sparkline.length > 1 && (
        <div className="mc-sparkline">
          <Sparkline data={sparkline} tone={trendPositivo ? "positive" : "negative"} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros (componente novo isolado, ainda não usado em nenhuma tela).

- [ ] **Step 3: Commit**

```bash
git add components/ui/MetricCard.tsx
git commit -m "feat(ui): adiciona componente MetricCard (variantes hero/default)"
```

---

### Task 5: Integração em `app/dashboard-financeiro/page.tsx`

**Files:**
- Modify: `app/dashboard-financeiro/page.tsx`

**Interfaces:**
- Consumes: `MetricCard` (Task 4), `EmptyState` (Task 3).

- [ ] **Step 1: Adicionar os imports**, junto dos outros imports de `@/components/*`

De:

```tsx
import NivelTabs from "@/components/financeiro/NivelTabs";
```

Para:

```tsx
import MetricCard from "@/components/ui/MetricCard";
import EmptyState from "@/components/ui/EmptyState";
import NivelTabs from "@/components/financeiro/NivelTabs";
```

- [ ] **Step 2: Computar a série/variação do "Resultado do Período"**, logo depois do fechamento da função de carregamento (`setLoading(false); }`) e antes do `return (`

De:

```tsx
    setLoading(false);
  }

  return (
```

Para:

```tsx
    setLoading(false);
  }

  const resultadoSerie = dados ? dados.receitaDespesa.map(d => d.receita - d.despesa) : [];
  const resultadoAtual = resultadoSerie.length > 0 ? resultadoSerie[resultadoSerie.length - 1] : 0;
  const resultadoAnterior = resultadoSerie.length > 1 ? resultadoSerie[resultadoSerie.length - 2] : 0;
  const trendResultado = resultadoAnterior !== 0 ? ((resultadoAtual - resultadoAnterior) / Math.abs(resultadoAnterior)) * 100 : 0;

  return (
```

- [ ] **Step 3: Trocar os 4 `<div className="kpi">` crus por `<MetricCard>`**

De:

```tsx
            <div className="g4" style={{ marginBottom: 16 }}>
              <div className="kpi">
                <div className="kpi-l">Saldo em Caixa</div>
                <div className="kpi-v" style={{ color: dados.saldoCaixa >= 0 ? "var(--ok)" : "var(--err)" }}>
                  {formatBRL(dados.saldoCaixa)}
                </div>
                <div className="kpi-s">{filtro.contaId ? "Conta selecionada" : "Contas bancárias ativas"}</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">A Receber</div>
                <div className="kpi-v" style={{ color: "var(--acc2)" }}>{formatBRL(dados.aReceber)}</div>
                <div className="kpi-s">Títulos em aberto</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">A Pagar</div>
                <div className="kpi-v" style={{ color: dados.aPagar > 0 ? "var(--acc3)" : "var(--t1)" }}>{formatBRL(dados.aPagar)}</div>
                <div className="kpi-s">Títulos em aberto</div>
              </div>
              <div className="kpi">
                <div className="kpi-l">Resultado do Período</div>
                <div className="kpi-v" style={{ color: dados.dre.resultado >= 0 ? "var(--ok)" : "var(--err)" }}>
                  {formatBRL(dados.dre.resultado)}
                </div>
                <div className="kpi-s">DRE · {PERIODO_LABEL[filtro.periodo].toLowerCase()}</div>
              </div>
            </div>
            )}
```

Para:

```tsx
            <div className="g4" style={{ marginBottom: 16 }}>
              <MetricCard
                label="Saldo em Caixa"
                value={formatBRL(dados.saldoCaixa)}
                sub={filtro.contaId ? "Conta selecionada" : "Contas bancárias ativas"}
                valueColor={dados.saldoCaixa >= 0 ? "var(--ok)" : "var(--err)"}
              />
              <MetricCard
                label="A Receber"
                value={formatBRL(dados.aReceber)}
                sub="Títulos em aberto"
                valueColor="var(--acc2)"
              />
              <MetricCard
                label="A Pagar"
                value={formatBRL(dados.aPagar)}
                sub="Títulos em aberto"
                valueColor={dados.aPagar > 0 ? "var(--acc3)" : "var(--t1)"}
              />
              <MetricCard
                label="Resultado do Período"
                value={formatBRL(dados.dre.resultado)}
                sub={`DRE · ${PERIODO_LABEL[filtro.periodo].toLowerCase()}`}
                variant="hero"
                trend={resultadoSerie.length > 1 ? { percent: trendResultado, label: "vs. mês anterior" } : undefined}
                sparkline={resultadoSerie.length > 1 ? resultadoSerie : undefined}
              />
            </div>
            )}
```

- [ ] **Step 4: Trocar o empty state de "Despesas por Categoria"**

De:

```tsx
                {dados.despesasCategoria.length === 0 ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>
                    Nenhuma despesa no período.
                  </div>
                ) : (
```

Para:

```tsx
                {dados.despesasCategoria.length === 0 ? (
                  <EmptyState
                    title="Nenhuma despesa no período."
                    subtitle="Lançamentos aparecem aqui assim que houver despesas registradas."
                  />
                ) : (
```

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 6: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 7: Commit**

```bash
git add "app/dashboard-financeiro/page.tsx"
git commit -m "feat(dashboard-financeiro): adota MetricCard (hero em Resultado do Periodo) e EmptyState"
```

---

### Task 6: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário**

Sem ambiente de teste visual automatizado nesta sessão. Pedir pro usuário:
- Abrir `/dashboard-financeiro`, conferir o card "Resultado do Período" com gradiente + texto branco legível, variação % e sparkline aparecendo (se houver ao menos 2 meses de dados).
- Conferir os outros 3 cards com fonte menor que o hero, cores condicionais preservadas (Saldo em Caixa verde/vermelho, A Pagar cinza quando zerado).
- Trocar pro tema escuro e conferir que o gradiente do hero também fica legível ali (`--acc-strong` novo).
- Forçar o painel "Despesas por Categoria" a ficar vazio (ex: filtrar um período sem despesas) e conferir o empty state novo, sem o painel esticar/encolher de forma estranha.

Isso encerra a Hierarquia Visual do Dashboard Financeiro. Componentes `MetricCard`/`Sparkline`/`EmptyState` ficam disponíveis em `components/ui/` pra outras telas adotarem quando o usuário pedir — não é migração automática do resto do sistema.
