# Migração do Tema Claro — Paleta Neutra e Semântica — Design

**Origem**: pedido explícito do usuário pra migrar o tema claro do ERP (hoje bege/areia) pra uma paleta neutra e semântica, com regra crítica de não usar `--warning`/`--negative` em estados neutros/zerados. Processo formal de brainstorming não repetido aqui (o usuário já brainstormou e deu os tokens exatos, mais uma auditoria + rodadas de confirmação feitas direto na conversa) — este documento só registra as decisões já fechadas, pro histórico do projeto.

## Escopo confirmado

- **Só `[data-theme="light"]`** em `app/globals.css`. O `:root` (tema escuro) fica intocado.
- Só cores — sem mudança de layout/espaçamento/estrutura de componente (exceto os 2 bugs de falso-positivo e as 3 trocas de classe de chip abaixo, que são consequência direta da regra semântica pedida).

## Auditoria (resumo — mapeamento completo no artifact publicado durante a sessão)

Fonte única: `app/globals.css`, CSS custom properties. `tailwind.config.js` não define cor nenhuma. Achado principal: `--acc` (ação) e `--ok` (positivo) colapsavam no mesmo hex `#0d9668` no tema claro atual — a nova paleta separa os dois de propósito (indigo vs. verde).

## Mapeamento: tokens novos → variáveis existentes

Decisão de arquitetura: **não renomear as CSS custom properties** (`--acc`, `--ok`, `--warn`, `--err`, `--t1` etc.) nem os ~56 arquivos `.tsx` que já consomem `var(--acc)` etc. — só trocar os *valores* dentro do bloco `[data-theme="light"]`. Isso entrega exatamente a paleta pedida com risco zero pros outros arquivos (que continuam funcionando sem tocar) e sem violar a regra "só cores, não estrutura".

| Token do pedido | Valor | Mapeia pra | Observação |
|---|---|---|---|
| `--bg` | `#FAFAFA` | `--bg` | |
| `--card-bg` | `#FFFFFF` | `--surf`, `--surf1` | |
| `--card-border` | `#E4E4E7` | `--b1` | `--b2`/`--b3` derivados como passos mais fortes da mesma escala neutra (não pedidos explicitamente, mas `--b2`/`--b3` são usados em ~40 arquivos pra hover/foco — precisam de valor) |
| `--text-primary` | `#18181B` | `--t1` | |
| `--text-secondary` | `#71717A` | `--t2` | `--t3`/`--t4` derivados como passos mais claros da mesma escala (mesma razão de `--b2`/`--b3`) |
| `--accent` | `#4F46E5` | `--acc` | Ações, links, filtros ativos, nav ativa, foco — resolve a sobreposição com `--ok` |
| `--positive` | `#16A34A` | `--ok` | Só valor positivo/receita/saldo positivo |
| `--negative` | `#DC2626` | `--err` | Só despesa/negativo/pendência real |
| `--warning` | `#D97706` | `--warn` | Só quando exige ação do usuário |

`--surf2/3/4` (usadas pra fundo de input, cabeçalho de tabela, hover de linha) e `--acc2` (azul, usado em "info"/badges), `--acc4` (roxo, chip `.cp`) recebem valores neutros/coerentes com a nova paleta — não estavam no pedido original mas são consumidas em dezenas de arquivos e ficariam quebradas (sem valor) se eu não desse um.

## `--acc3` (laranja) — decisão confirmada: token extra separado

Chip `.co` ("Em Produção – Lapidação") não é sinônimo de warning — é uma categoria de etapa de produção própria. Mantém `--acc3` como token à parte, recalibrado pra um laranja que combine com a paleta nova (`#C2410C`), sem forçar dentro de accent/positive/negative/warning.

## Correções aplicadas junto (decisão confirmada)

**2 falsos-positivos de `--warning` em valor zero** (bug pré-existente, não é regressão da migração — a migração só tornaria o bug mais visível porque o novo âmbar é mais saturado que o bege atual):
- `app/vendedores/page.tsx` — KPI "A Pagar" pinta âmbar mesmo com `R$ 0,00`. Falta o `> 0 ?` que a linha da tabela (mesma página) já usa corretamente.
- `app/compras/page.tsx` — KPI "Pendentes de Recebimento" mesmo problema com contagem zero.

**3 chips `.cy` (âmbar) reclassificados pra `.cgr` (cinza neutro já existente)** — não representam pendência, são rótulo de categoria/estado de ciclo de vida:
- `app/contabilidade/estoque/page.tsx` — tipo de movimentação "saída" (categórico, mesmo grupo de "entrada"/"ajuste"/"transferência", nenhum dos quais é alerta).
- `app/contabilidade/consorcios/page.tsx` — status "Encerrado" (fim natural do ciclo, não pendência).
- `app/retalhos/page.tsx` — status "Reservado" (estado do ciclo de vida do retalho, não alerta).

**Casos que ficam âmbar de propósito** (pendência real confirmada, não mexe):
- Orçamentos "Enviado", Compras "rascunho", Cartões "Fechada" — aguardando ação de terceiro/usuário.
- Pedidos "Aguardando otimização" — confirmado no código (`app/pedidos/page.tsx:342`) que esse status **bloqueia** o avanço do pedido até alguém rodar o otimizador. É pendência real.
- Alertas do Dashboard (inadimplentes, compras paradas, NCs em aberto etc.).
- Estoque "Médio" (`app/estoque/page.tsx`) — não é rótulo solto, é um gradiente de saúde de 3 níveis (Alto=verde/Médio=âmbar/Baixo=vermelho); âmbar aqui cumpre função de alerta gradual real.

## Fora de escopo (decisão confirmada)

- **220+ cores hardcoded** (rgba/hex soltos fora das variáveis CSS, ~30 arquivos) — não migradas nesta leva. Passo 4 do pedido original (rodar busca de remanescentes) roda DEPOIS da migração das variáveis, como o usuário descreveu — não junto.
- Tema escuro (`:root`) — intocado.

## Teste

Sem framework de teste automatizado disponível (mesma limitação recorrente do projeto). Validação via `tsc --noEmit` + `next build` limpos, e depois passo 4 do pedido original (busca de remanescentes hardcoded) como conferência final antes de considerar a migração completa.
