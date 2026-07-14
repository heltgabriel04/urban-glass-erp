# Hierarquia Visual — Dashboard Financeiro (MetricCard/Sparkline/EmptyState) — Design

**Origem**: pedido do usuário pra evoluir o dashboard financeiro (e, por extensão, o padrão visual do sistema) pra ter mais hierarquia entre métricas e não parecer um template genérico de admin. Escopo definido via brainstorming em 2026-07-14, na mesma sessão da migração de tema.

## O que muda e onde

Só o dashboard financeiro (`app/dashboard-financeiro/page.tsx`) é tocado nesta leva. Os componentes novos são construídos pra reuso, mas nenhuma outra tela é migrada agora — isso é decisão explícita, não esquecimento.

Zero mudança de lógica de dados/cálculo/fonte de dados — `services/dashboardFinanceiro.service.ts` não é tocado, exceto pra derivar (no cliente, em `page.tsx`) a variação % e a série do sparkline a partir de dados que a página **já busca hoje**.

## Achado de investigação — histórico disponível

`dados.receitaDespesa` (6 meses de `{label, receita, despesa}`) já é buscado hoje pra alimentar o gráfico "Receita × Despesa" — dele dá pra derivar `resultado = receita - despesa` por mês, sem query nova. Isso cobre o card "Resultado do Período" (o hero card).

`saldoCaixa`, `aReceber`, `aPagar` são saldos no instante presente — não existe série histórica pra eles hoje (precisaria de query nova reconstruindo o saldo no fechamento do mês anterior). **Decisão confirmada com o usuário**: só "Resultado do Período" ganha variação%/sparkline nesta leva; os outros 3 cards ficam sem, registrados como pendência de backend pra quando fizer sentido.

## Componentes novos (`components/ui/`)

### 1. `MetricCard.tsx`

```ts
interface MetricCardProps {
  label: string;
  value: string;         // já formatado (ex: formatBRL(x)) — o componente não formata
  sub?: string;
  variant?: "hero" | "default";  // default: "default"
  trend?: { percent: number; label: string };  // ex: { percent: 18, label: "vs. mês anterior" }
  sparkline?: number[];  // série pra desenhar; omitido = sem sparkline
}
```

- `variant="default"`: mesma estrutura visual de hoje (fundo `var(--surf)`, borda `var(--b1)`, sombra `var(--card-shadow, none)` já herdada de `.card`/`.kpi`), só que com CSS próprio (`.metric-card`, não reaproveita `.kpi-v` global) — valor em **20px** (era 22px em `.kpi-v`), reforçando o contraste com o hero.
- `variant="hero"`: fundo `linear-gradient(135deg, var(--accent), var(--accent-strong))`, texto branco fixo (`#fff`, não `var(--t1)` — precisa de contraste garantido em cima do gradiente independente do tema), valor em **32px**.
- `trend`: renderiza `▲ {percent}% {label}` (ou `▼` se negativo) em `var(--positive)`/`var(--negative)` conforme o sinal — só aparece se a prop for passada.
- `sparkline`: renderiza `<Sparkline>` (componente 2) no rodapé do card — só aparece se a prop for passada.

### 2. `Sparkline.tsx`

```ts
interface SparklineProps {
  data: number[];
  tone: "positive" | "negative";
}
```

`recharts` já é dependência do projeto (usado em `dashboard-financeiro`, `dashboard-financeiro/analitica` etc.) — `Sparkline` é um `<LineChart>` de ~24px de altura, sem `XAxis`/`YAxis`/`CartesianGrid`/`Tooltip`, `<Line dataKey="v" stroke={tone === "positive" ? "var(--positive)" : "var(--negative)"} strokeWidth={1.5} dot={false} />`. Reutilizável fora de `MetricCard` — qualquer painel que precise de um mini-gráfico de tendência usa direto.

### 3. `EmptyState.tsx`

```ts
interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;  // default: ícone embutido (círculo tracejado + barras)
}
```

Centralizado vertical e horizontalmente via flexbox (`display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%`) — o componente não define altura própria, herda do container pai (o painel "Despesas por Categoria" continua com a mesma altura de hoje, `EmptyState` só ocupa o espaço que já existia pro texto solto). Ícone default: SVG inline simples (círculo tracejado `stroke="var(--b2)"` + 3 barras minimalistas dentro, `stroke="var(--t3)"`) — sem depender de biblioteca de ícones nova.

## Novo token: `--accent-strong`

Necessário pro gradiente do hero card funcionar nos dois temas (o hero card não é exclusivo do tema claro). Adicionado em `app/globals.css`:
- `:root` (escuro): `--accent-strong: #17a374` (variação mais funda do `--acc` neon `#3dffa0` atual).
- `[data-theme="light"]`: `--accent-strong: #4338CA` (reaproveita o hex já usado no hover do botão primário claro, `.bp:hover`).

Isso é o único ponto que toca no tema escuro nesta leva — é uma adição de token novo, não uma mudança de valor existente (consistente com "não mudar o que já está lá", diferente das leva anteriores que eram só sobre re-hexar tokens já existentes).

## Aplicação no dashboard financeiro

`app/dashboard-financeiro/page.tsx`, bloco das 4 KPIs (linhas ~138-163 hoje) — os 4 `<div className="kpi">` crus viram `<MetricCard>`:
- "Saldo em Caixa", "A Receber", "A Pagar" → `variant="default"` (comportamento de cor condicional que já existe hoje — `var(--ok)`/`var(--err)` no saldo, `var(--acc3)` condicional no A Pagar — precisa ser preservado; `MetricCard` aceita `value` já formatado E poderia precisar de uma prop de cor customizada pro texto do valor nos casos não-hero, já que hoje a cor varia por regra de negócio, não só por variant. Isso entra na Task de implementação: `MetricCard` ganha uma prop opcional `valueColor?: string` que sobrepõe a cor padrão do valor quando fornecida — resolve sem duplicar lógica de negócio dentro do componente visual).
- "Resultado do Período" → `variant="hero"`, com `trend`/`sparkline` calculados a partir de `dados.receitaDespesa` (resultado mês a mês; variação % = resultado do mês mais recente vs. penúltimo).

Painel "Despesas por Categoria" (linhas ~203-207 hoje) — o bloco `{dados.despesasCategoria.length === 0 ? <div>...texto solto...</div> : <BarChart>...}` vira `{dados.despesasCategoria.length === 0 ? <EmptyState title="Nenhuma despesa no período." subtitle="Lançamentos aparecem aqui assim que houver despesas registradas." /> : <BarChart>...}`.

## Fora de escopo

- Variação%/sparkline nos outros 3 cards (Saldo em Caixa, A Receber, A Pagar) — sem histórico disponível, fica pra quando o usuário pedir a query nova.
- Migrar outras telas do sistema pra `MetricCard`/`EmptyState` — componentes ficam prontos, adoção é decisão separada por tela.
- Qualquer mudança em `services/dashboardFinanceiro.service.ts` ou nas fontes de dado.
- Redesenho do painel "Receita × Despesa" ou "Projeção de Caixa" — só as 4 KPIs e o empty state de "Despesas por Categoria" mudam.

## Teste

Sem framework de teste automatizado disponível pra componentes visuais neste projeto (mesma limitação recorrente). Validação via `tsc --noEmit` + `next build` limpos, e conferência visual do usuário no navegador (hero card com gradiente legível nos dois temas, sparkline renderizando, empty state sem alterar a altura do painel) — não há como confirmar isso por terminal.
