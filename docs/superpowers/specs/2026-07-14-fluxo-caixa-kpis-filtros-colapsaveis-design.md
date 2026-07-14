# Fluxo de Caixa — KPIs em Primeiro Plano + Filtros Colapsáveis — Design

**Origem**: usuário reclamou que o card de "filtros extras" (Tipo/Situação/Plano de Contas/Busca) na página `/fluxo` ocupa espaço grande demais parado no estado padrão ("Todos os tipos, todas as situações"), e que por causa disso os KPIs de valor (Caixa Atual, Menor Saldo, Entradas, Saídas) ficam visualmente "deixados de lado", empurrados pra baixo. Escopo definido via brainstorming em 2026-07-14.

## Estrutura atual (pra referência)

`app/fluxo/page.tsx`, nesta ordem: topbar → filtro de período (atalhos + De/Até, sempre visível, compacto) → filtros extras (Tipo/Situação/Plano de Contas/Busca, 4 campos numa linha) → 4 KPIs (`.g4`) → tabela → legenda de situação.

## O que muda

**1. Reordenação** — os 4 KPIs sobem pra logo depois da topbar, antes de qualquer filtro. É a primeira coisa visível na página agora. Nenhum KPI muda de conteúdo/cálculo, só de posição.

**2. Filtro de período continua igual e visível sempre** — atalhos ("Este mês", "Mês passado" etc.) + campos "De"/"Até" seguem exatamente como hoje, mesma barra, mesmo lugar (agora logo abaixo dos KPIs em vez de acima).

**3. Filtros extras viram colapsáveis** — um botão novo `⚙ Filtros` entra na ponta direita da barra de período (depois do campo "Até"). Estado novo `filtrosAbertos: boolean` (default `false`). O botão mostra a contagem de filtros ativos entre parênteses quando `filtrosAtivos > 0` (ex: `⚙ Filtros (2)`), calculada a partir dos mesmos 4 estados que já existem (`filtroTipo !== "Todos"`, `filtroSituacao !== "Todos"`, `filtroPlano !== ""`, `busca !== ""`). Clicar alterna `filtrosAbertos`. O painel com os 4 campos (Tipo/Situação/Plano de Contas/Busca) + botão "✕ Limpar" é renderizado condicionalmente (`{filtrosAbertos && (...)}`) — mesmo HTML/estilo de hoje, só que escondido por padrão.

Nenhum campo, comportamento de filtro, cálculo ou fonte de dado muda — os `useMemo`/`useEffect` que já filtram `visiveis`/persistem período na URL continuam idênticos. É reordenação + visibilidade condicional, nada mais.

## Fora de escopo

- Persistir `filtrosAbertos` ou os valores dos filtros extras na URL (hoje só `de`/`ate`/`tudo` persistem — continua assim).
- Fechar o painel automaticamente ao clicar "Limpar" (fica aberto, usuário fecha se quiser — evita comportamento surpresa).
- Qualquer mudança na barra de período em si (atalhos, "Ver tudo", De/Até).
- Redesenho da tabela, da linha de edição inline, ou da legenda de situação no rodapé.
- O teste visual hardcoded `#eef1f6` (fundo do tema claro nesta página, já mapeado em memória anterior) — não é tocado aqui.

## Teste

Sem framework de teste automatizado disponível pra mudança visual/estrutural neste projeto (mesma limitação recorrente). Validação via `tsc --noEmit` + `next build` limpos, e conferência do usuário no navegador: KPIs aparecendo antes dos filtros, botão "Filtros" abrindo/fechando o painel, contador batendo com os filtros realmente ativos, e o filtro em si continuando a funcionar igual (mesmos resultados na tabela) depois da reorganização.
