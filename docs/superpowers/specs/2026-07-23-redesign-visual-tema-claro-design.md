# Redesign visual — fundação de design system (tema claro) + tela de Pedido

## Contexto

O usuário (Product Designer Senior, hipoteticamente) pediu um redesign visual
completo do ERP, com o objetivo de transmitir precisão/tecnologia/organização/
alto padrão (referência: SaaS como Linear/Monday/Notion, indústrias como
Guardian Glass/Cebrace/Blindex). Trouxe um brief extremamente prescritivo:
paleta de cor, tipografia (Inter/Plus Jakarta Sans), espaçamento em múltiplos
de 8, e mockups textuais de 5 seções específicas da tela de detalhe do pedido
(indicadores, timeline de produção, plano de corte, resumo de vidros,
acordeões).

Explicitamente: **não é pra mudar regra de negócio**, só layout/UX/UI/
hierarquia/espaçamento/cor/tipografia/contraste/organização.

O projeto é grande demais pra uma única leva (~40 telas do ERP usam o design
system central em `app/globals.css`). Decisões de escopo tomadas com o
usuário antes de desenhar:

1. **Tema**: só o tema claro (`[data-theme="light"]`) — é o que o usuário usa
   no dia a dia. O tema escuro (`:root`, default técnico) fica intocado; seu
   redesign já era um pedido pendente separado (ver
   `docs/superpowers/specs/2026-07-14-tema-claro-neutro-semantico-design.md`
   e a memória `project-tema-claro-neutro`).
2. **Fonte**: híbrida — Inter para título/label/corpo/botões, mantém uma
   fonte monoespaçada (DM Mono, já usada) só pra valores numéricos (R$, m²,
   datas, quantidades). Reforça a identidade de "precisão/engenharia" em vez
   de virar um SaaS genérico; é o padrão usado por Stripe/Linear.
3. **Entrega desta leva**: fundação de tokens/componentes globais (cor,
   tipografia, raio, botões, cards, tabelas, chips, sidebar, acordeões) +
   aplicação completa na tela de detalhe do Pedido (`app/pedidos/[id]/page.tsx`),
   que vira a referência visual pra replicar no resto do app depois (fora
   desta leva).

### Duas tensões resolvidas com o usuário

O brief pede valores de cor que, aplicados ao pé da letra, desfariam duas
correções de contraste que o próprio usuário já validou (2026-07-14 e
2026-07-22, ver memória `project-tema-claro-neutro`):

- **Borda** (`--b1`): brief pede `#E2E8F0` (slate-200), mas o usuário já
  escureceu a borda 2x porque ficava "sutil demais"/"apagada". Resolvido:
  como `--bg` vai ficar mais distinto de `--surf` (branco) do que está hoje
  (`#F4F7FA` vs `#FFFFFF`, ao contrário do atual `#FAFAFA` quase idêntico ao
  branco), o cartão passa a se separar do fundo pela própria cor de fundo,
  não só pela borda — então a borda pode aliviar sem repetir o problema.
  Usuário escolheu aliviar: `--b1` vai pra `#CBD5E1` (slate-300, um degrau
  mais escuro que o pedido literal do brief).
- **Texto secundário** (`--t2`): brief pede exatamente o valor (slate-500)
  que o usuário já tinha abandonado por "apagado". Mesma lógica: cada tom de
  texto do brief entra um degrau mais escuro na escala Slate.

## Design

### 1. Fundação — cores

Toda a paleta abaixo é escala **Slate** do Tailwind (o brief é literalmente
essa escala). Só dentro de `[data-theme="light"]` em `app/globals.css` — o
tema escuro (`:root`) não é tocado, nem os ~56 arquivos `.tsx` que consomem
`var(--acc)`/`var(--ok)`/etc. (mesmo princípio da migração de 2026-07-14: só
os *valores* dentro do bloco light mudam).

| Token | Papel | Valor atual | Valor novo | Origem |
|---|---|---|---|---|
| `--bg` | fundo da página | `#FAFAFA` | `#F4F7FA` | brief, exato |
| `--surf` / `--surf1` | fundo do card | `#FFFFFF` | `#FFFFFF` | sem mudança |
| `--surf2` | header de tabela / hover / painel aninhado | `#F4F4F5` | `#EEF2F7` | ajuste pra família azulada |
| `--surf3` | trilho de progress bar, tabs | `#EFEFF1` | `#E6ECF3` | idem |
| `--surf4` | fundo mais escuro (raro) | `#E4E4E7` | `#DCE4EE` | idem |
| `--b1` | borda de card | `#C4C4CC` | `#CBD5E1` (slate-300) | aliviada (ver tensão acima) |
| `--b2` | borda hover/ativa | `#A1A1AA` | `#94A3B8` (slate-400) | escala Slate |
| `--b3` | borda forte (raro) | `#71717A` | `#64748B` (slate-500) | escala Slate |
| `--acc` | Primary / ação | `#4F46E5` (índigo) | `#2563EB` | brief, exato |
| `--acc-strong` | hover do Primary / stop escuro do gradiente hero | `#4338CA` | `#1D4ED8` | = "Primary Hover" do brief |
| `--acc2` | Info / chip azul secundário | `#2563EB` | `#0EA5E9` | brief ("Info") |
| `--acc3` | categoria "Em Produção" (chip `.co`) | `#C2410C` | sem mudança | fora do escopo do brief (token próprio, decisão de 2026-07-14) |
| `--acc4` | categoria roxa (ex.: indicador "Peças/Retirada") | `#7C3AED` | sem mudança | já bate com a sugestão do próprio usuário ("Retirada = roxo") |
| `--ok` | Success | `#16A34A` | sem mudança | já idêntico ao brief |
| `--err` | Danger | `#DC2626` | sem mudança | já idêntico ao brief |
| `--warn` | Warning | `#D97706` | **sem mudança** | brief pede `#F59E0B`, mas esse tom já é usado como cor de *texto*; mais claro reprova contraste AA em fundo claro. `#F59E0B` do brief entra só em preenchimento/ícone (mesmo padrão que os chips já usam: fundo claro + texto escuro) |
| `--t1` | texto principal | `#18181B` | `#1E293B` (slate-800) | brief, exato (mesma escuridão, família neutra→slate) |
| `--t2` | texto secundário | `#52525B` | `#475569` (slate-600) | um degrau mais escuro que o slate-500 do brief (ver tensão acima) |
| `--t3` | texto auxiliar | `#71717A` | `#64748B` (slate-500) | reaproveita o valor "secundário" do brief, um degrau abaixo |
| `--t4` | texto/borda mais clara (raro) | `#D4D4D8` | `#CBD5E1` (slate-300) | escala Slate |
| `--r2` | raio de card | `14px` | **`12px`** | brief, exato |
| `--r` | raio de botão/input | `10px` | sem mudança | já bate com o brief |
| `--card-shadow` | sombra de card | `0 2px 6px rgba(0,0,0,.08), 0 1px 3px rgba(0,0,0,.06)` | `0 1px 2px rgba(15,23,42,.04), 0 2px 8px rgba(15,23,42,.06)` | mesma leveza, tingida de slate em vez de preto puro (mais coerente com a identidade "vidro/alumínio") |

Tokens novos (não existiam antes), fixos e **independentes de
`[data-theme]`** — a sidebar deve ficar escura tanto no tema claro quanto no
escuro:

| Token novo | Valor | Papel |
|---|---|---|
| `--sb-bg` | `#1E293B` | fundo da sidebar |
| `--sb-hover` | `#334155` | hover de item da sidebar |

Zebra/hover de tabela e o fundo do `.ni.active` da sidebar (hoje hardcoded
com rgba do índigo antigo, ex. `rgba(79,70,229,.09)`) recalculam pra rgba do
novo `--acc` (`37,99,235`).

### 2. Fundação — tipografia

- **Inter** (via `next/font/google`, sem dependência de CDN) substitui
  **Syne** (títulos) e o **DM Mono** do corpo/labels. Escolhida sobre Plus
  Jakarta Sans por manter nitidez em tamanhos pequenos (11–13px, maioria dos
  textos deste ERP: labels de tabela, chips, KPIs) — Plus Jakarta Sans é mais
  "display", perde definição nesses tamanhos.
- **DM Mono continua**, restrito a valores numéricos: `.mono`, `.kpi-v`,
  `.hero-value`, `.mc-value`, `.stat-value`, `.met-v`, `.tv`, `.sv`, `.rsv`,
  células de tabela com quantidade/m²/R$/data. Reforça "precisão/engenharia"
  em vez de apagar essa identidade.
- Escala do brief (32/22/16/14/13/12px, pesos 600/500/400) vira classes
  utilitárias novas: `.tx-h1` (32/600 — headline de página, tipo listagem),
  `.tx-h2` (22/600 — nome de cliente, valor hero), `.tx-sub` (16/600 —
  subtítulo de seção), `.tx-body` (14/400), `.tx-sec` (13/400), `.tx-aux`
  (12/500).
- **Não** aplica 32px na barra de topo fixa (`.tb`) da tela de Pedido — ela é
  uma barra utilitária compacta, e o usuário confirmou que o "momento hero"
  dessa tela é o indicador de Cliente (22px, `.tx-h2`), não um título de
  página. `.tx-h1` fica disponível pra headlines de outras telas (fora
  desta leva).

### 3. Fundação — espaçamento

Sem variáveis CSS de espaçamento (o código usa `px` direto em `style={{}}`
inline; criar um sistema de tokens de espaçamento seria refatoração à parte,
não pedida). O grid 8/16/24/32 vira **convenção** aplicada só nos arquivos
tocados nesta leva (`app/globals.css` + `app/pedidos/[id]/page.tsx`):
todo padding/gap/margin arredonda pra um desses 4 valores, e os espaços
verticais identificados como excessivos (card da timeline de produção)
encolhem. O resto do app mantém o espaçamento atual até uma fase de rollout
futura.

### 4. Componentes globais (`app/globals.css`)

**Ícones**: sem adicionar a dependência `lucide-react`. Reaproveita o padrão
que a Sidebar já usa (`Icon()` em `components/layout/Sidebar.tsx` — SVG
16×16, stroke-based, já com cara de Lucide) e estende pros ícones novos
necessários nos botões/headers de acordeão da tela de Pedido — substitui os
emojis usados hoje (◈ 🏷 ⚑ 📎 🧾 💳 📦 🪟) por esse mesmo padrão de ícone SVG.
Zero dependência nova, zero inconsistência de renderização entre SO/navegador.

**Botões** (`.btn` e variantes):
- `.bp` (primário) já fica azul/branco automaticamente com a troca de token.
- `.bw` (perigo) já é vermelho — sem mudança de token necessária.
- `.bg` (hoje "fantasma", fundo transparente) vira secundário de verdade:
  fundo branco (`var(--surf)`) + borda `var(--b1)` + texto `var(--t1)`.
- Altura 40px aplicada só no `.btn` base (ações de formulário/primárias).
  `.sm`/`.xs` (toolbars densos: topo do Pedido, ações de linha de tabela)
  continuam menores de propósito — 40px ali contradiz o próprio pedido de
  "tela mais compacta".
- Ícone sempre à esquerda: já é o padrão em quase todo lugar (`display:
  inline-flex; gap:6px` + ordem do JSX); os emojis trocam por SVG conforme
  acima.

**Sidebar** (`components/layout/Sidebar.tsx` + regras em `globals.css`):
- Fundo passa a usar `var(--sb-bg)` (fixo, não `var(--surf)` que muda com o
  tema) — corrige o fato de que hoje, no tema claro, a sidebar renderiza
  branca em vez de escura.
- Hover de item usa `var(--sb-hover)`.
- Ícones de 15px → 18px.
- Hover do item (`.ni:hover`) e indicador do item ativo (`.ni.active`,
  border-left + fundo) passam a usar `var(--acc)` (azul) em vez do cinza
  atual (`var(--b3)`).

**Tabelas**: cabeçalho ganha tom azul-claro real (`rgba(37,99,235,.05)`,
ligado ao `--acc` novo, não só reaproveitando `--surf2`); zebra e hover
recolorem pro azul novo (hoje ainda têm rgba fixo do índigo antigo);
`thead th` ganha `position: sticky; top: 0` (cabeçalho fixo, CSS puro).
**Fora de escopo**: colunas redimensionáveis e filtro por coluna — são
funcionalidade nova (estado por coluna, JS de interação, em ~40 telas), não
redesign visual, e o pedido original foi explícito em não mexer em
funcionalidade. Fica registrado como possível projeto futuro à parte.

**Chips**: já usam tons de azul próximos do `--acc` novo (`.cb` já é
`rgb(37,99,235)`); só alinha os valores finais pra bater exatamente com os
tokens acima.

**Acordeões** (as 3 seções mexidas nesta semana: Informações+Financeiro,
Itens, Documentos, em `app/pedidos/[id]/page.tsx`): cada header ganha um
ícone SVG (documento / caixa / clipe, no padrão da Sidebar) antes do título,
mais um contador em pill (reaproveitando o visual de `.nbdg`/chip) — ex.
"Itens do Pedido" já mostra a contagem no título hoje, migra pro badge.
Nenhuma mudança na lógica de abrir/fechar feita nesta semana.

### 5. Tela de Pedido — as 4 peças do brief

**Faixa de indicadores (Visão Geral)**: reaproveita `components/ui/
MetricCard.tsx` (já existe, usado hoje só no Dashboard Financeiro) — 6
`MetricCard` em linha (Pedido, Cliente, Valor, Recebido, Saldo, Peças),
substituindo a barra secundária atual (linhas ~895–906 de
`app/pedidos/[id]/page.tsx`, hoje texto corrido "Total/Recebido/Em
aberto/Retirada"). Cores por indicador seguem a sugestão do próprio usuário:
Valor = azul (`--acc`), Recebido = verde (`--ok`), Saldo = laranja
(`--warn`) ou verde se quitado (mesma regra condicional que já existe hoje),
Peças = roxo (`--acc4`, já existente). "Cliente" usa `.tx-h2` (22px) — é o
item hero da faixa.

**Timeline de Produção**: reduz altura tirando o badge de duração do lugar
fixo (vira tooltip on-hover) e comprimindo o padding do card; adiciona um
ícone SVG por etapa, usando os nomes reais do `FLUXO` do sistema
(`Aguardando otimização` / `Em Produção – Corte` / `Qualidade (Corte)` /
`Em Produção – Lapidação` / `Qualidade (Lapidação)` / `Separação` /
`Finalizado` / `Entregue`) — ligeiramente diferentes do exemplo do brief.
Transições de 200ms na cor do círculo/linha ao avançar de etapa.
**Confirmado fora de escopo com o usuário**: "responsável" por etapa não
entra — `status_history` hoje só guarda `{status, desde}`, sem usuário;
adicionar isso seria rastrear um campo novo (funcionalidade), não estilo.

**Plano de Corte**: vira card premium — título, "✓ Otimização concluída", 4
blocos de métrica (Aproveitamento, Chapas, **Retalhos** — campo
`retalhos_gerados` já existe em `HistoricoOtimizador`, só não é mostrado
nesta tela hoje —, Data), botão "Visualizar Plano" em destaque. O botão
"Etiquetas" já existente continua como ação secundária (nenhuma ação
removida).

**Resumo de Vidros** (tabela "Resumo por Vidro — Retirada", linhas
~995–1027): mantém as colunas numéricas atuais (m²/quantidade Total/
Retirado/Pendente — precisão importa neste domínio, número não some) e
acrescenta uma coluna de barra de progresso reaproveitando as classes
`.prg`/`.prg-f` já existentes em `globals.css` — preenchimento verde
proporcional ao retirado, resto em cinza.

## Fora de escopo (explícito)

- Redesign do tema escuro (`:root`) — pedido pendente separado, já
  registrado.
- Rollout pras outras ~40 telas do app — herdam automaticamente o que usa
  classes/tokens globais (`.btn`, `.card`, `.chip`, tabela, sidebar), mas
  qualquer layout bespoke (como os 4 itens da seção anterior) fica pra uma
  fase de rollout futura, tela por tela.
- Colunas redimensionáveis / filtro por coluna em tabelas — funcionalidade
  nova, não redesign visual.
- "Responsável" por etapa na timeline — dado não existe hoje; adicionar
  seria funcionalidade nova.
- Qualquer mudança de regra de negócio, cálculo, ou comportamento — este
  redesign é 100% casca visual sobre lógica que já existe e já funciona.

## Testes

Sem lógica nova a testar isoladamente — mudança de cor/tipografia/espaçamento/
JSX em cima de dados e cálculos que já existem. Verificação: `tsc --noEmit`
limpo, suite de testes existente (199 testes) continua passando sem
alteração de comportamento, `next build` compila todas as rotas, e
verificação manual no navegador (abrir uma tela de Pedido no tema claro,
conferir a faixa de indicadores, timeline, card de plano de corte e tabela
de resumo — os 4 itens não têm cobertura automatizada por serem 100%
visuais).

## Migração

Nenhuma mudança de schema ou dado. Arquivos tocados: `app/globals.css`
(tokens + componentes), `components/layout/Sidebar.tsx` (fundo fixo, ícones,
hover), `app/pedidos/[id]/page.tsx` (as 4 peças específicas + acordeões já
existentes ganhando ícone/contador), e possivelmente um novo arquivo de
fonte (`next/font/google` para Inter, registrado no layout raiz).
