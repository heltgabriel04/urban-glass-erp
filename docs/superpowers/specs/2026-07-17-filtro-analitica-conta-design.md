# Filtro de Conta na Analítica do Dashboard Financeiro — Design

## Contexto

Em 2026-07-15, uma investigação sistemática (ver
[[bug-filtro-dashboard-financeiro-decorativo]] na memória) achou que o
filtro global (período/conta) do Dashboard Financeiro aparecia em todas
as 4 abas mas era decorativo em Analítica e Estratégica — os seletores
não afetavam nenhum dado. Estratégica foi corrigida na hora (a função
que ela usa, `getProjecaoCaixa`, já aceitava um filtro de conta e só
não estava sendo passado). Analítica ficou pendente: nenhum dos 4
serviços que ela consome (`getDRE`, `getFaturamentoMensal`,
`getDespesasPorMes`, `getMetas`) tinha noção de conta bancária, e a
decisão da época foi esconder a barra de filtro inteira
(`mostrarPeriodo={false} mostrarConta={false}`) em vez de fazer o
trabalho de backend.

Esta é essa etapa de backend, agora escopada.

## Achado que define o escopo: receita não tem amarração real com conta

Investigando os 4 serviços:

- **`getDespesasPorMes`** (lê `baixas_lancamento`) e a perna de despesas
  de **`getDRE`** (lê `lancamentos` em competência, `baixas_lancamento`
  em caixa) — ambos já têm uma coluna `conta_id` de verdade (FK pra
  `contas_bancarias`), confirmada em `types/index.ts:528`
  (`Lancamento.conta_id`) e já usada com esse exato padrão
  (`.eq('conta_id', filtro.contaId)`) em várias funções do mesmo arquivo
  `services/dashboardFinanceiro.service.ts` (`getSaldoCaixaTotal`,
  `getSaldosPorConta`, etc.). Filtrar despesas por conta é mecânico.
- **Receita** (`getDRE`'s `receitaBruta`, `getFaturamentoMensal`) vem de
  `pedidos`/da view `faturamento_mensal`. `pedidos.conta`
  (`types/index.ts:281`) é só texto livre (ex. "Itaú"), escolhido num
  select fixo — **não é uma referência real** à `contas_bancarias.id`
  que o filtro usa. Um pedido não "pertence" a uma conta bancária no
  schema atual; o dinheiro só se associa a uma conta quando a parcela
  (lançamento) dele é criada/baixada.
- **Metas** (`metas_financeiras`) não têm nenhuma coluna de conta — são
  metas da empresa inteira, não por conta.

## Decisões confirmadas com o usuário

1. **Só Despesas respeita o filtro de conta.** Receita e Metas sempre
   consideram todas as contas, mesmo com um filtro ativo — redefinir
   "receita" como "soma dos lançamentos de Entrada atrelados a essa
   conta" foi descartado por divergir da metodologia do resto do DRE e
   por um pedido poder ter parcelas em contas diferentes.
2. **Período fica fora de escopo.** A Analítica já é inerentemente
   multi-período por design (mês atual × anterior × mesmo mês ano
   passado no Comparativo; 12 meses na Evolução; 3 anos na
   Sazonalidade) — um seletor de período único não se encaixa em
   nenhum desses três gráficos. O seletor continua escondido
   (`mostrarPeriodo={false}`).
3. **No widget "Comparativo por Período"**, com uma conta filtrada, as
   linhas **Resultado** e **Margem Líquida** somem (ficam só Receita e
   Despesas) — mostrar essas duas misturaria receita da empresa toda
   com despesa só de uma conta, um número que não representa nada de
   real. Sem filtro ("Todas as contas"), a tabela volta a mostrar as 4
   linhas normalmente.

## Arquitetura

### `services/dashboardFinanceiro.service.ts` — `getDespesasPorMes`

Ganha um segundo parâmetro opcional, `contaId?: number | null`.
Quando informado, adiciona `.eq('conta_id', contaId)` na query de
`baixas_lancamento` (mesmo padrão de `.eq('lancamentos.tipo', 'Saída')`
já presente na função). `undefined`/`null` mantém o comportamento atual
(todas as contas), preservando os outros call sites já existentes.

### `services/dre.service.ts` — `getDRE`

Ganha um quarto parâmetro opcional, `contaId?: number | null`, depois
de `regime`. Aplicado **só** na query de despesas de cada regime:
- Competência: `.eq('conta_id', contaId)` na query de `lancamentos`
  (linha `despesasRes`).
- Caixa: `.eq('conta_id', contaId)` na query de `baixas_lancamento` de
  saídas (linha `saidasRes`).

Receita (`pedidosRes`/`entradasRes`), devoluções e CMV (`getCMVPeriodo`)
não recebem o filtro — ficam sempre "todas as contas", por decisão do
usuário. Os dois call sites existentes fora da Analítica (`/dre`,
Executiva em `app/dashboard-financeiro/page.tsx`) continuam chamando
sem o 4º argumento — comportamento deles não muda.

*Achado colateral, fora de escopo*: a Executiva mostra um card de DRE
que também nunca filtrou por conta (só os outros widgets dela —
saldo/aberto — respeitavam o filtro). Não é tocado nesta mudança; se o
usuário quiser, é um ajuste pontual futuro, análogo a este.

### `app/dashboard-financeiro/analitica/page.tsx`

- Importa e chama `useFiltroFinanceiro()` (hoje nem importado nesta
  página) — mesmo padrão já usado em `estrategica/page.tsx`:
  `const { filtro } = useFiltroFinanceiro();` e
  `useEffect(() => { load(); }, [filtro.contaId]);` (substitui o
  `useEffect(() => { load(); }, [])` atual).
- `<FiltroGlobalFinanceiro mostrarPeriodo={false} mostrarConta={true} />`
  (troca só a prop `mostrarConta`, de `false` pra `true`).
- Dentro de `load()`, os 3 `getDRE(...)` e o `getDespesasPorMes(12)`
  passam a receber `filtro.contaId` (o 4º e 2º argumento
  respectivamente); `getFaturamentoMensal`/`getMetas` continuam sem
  nenhum argumento de conta.
- **Aviso quando filtrado**: logo abaixo da barra `FiltroGlobalFinanceiro`,
  quando `filtro.contaId != null`, uma linha curta explicando o
  comportamento misto: *"Despesas filtradas pela conta selecionada.
  Receita e metas sempre consideram todas as contas."* — mesmo padrão
  visual de aviso já usado noutras telas do financeiro (fundo sutil,
  texto pequeno, cor `var(--t3)`).
- **Comparativo por Período**: as duas linhas `<LinhaComparativo label="Resultado" .../>`
  e `<LinhaComparativo label="Margem Líquida" .../>` só renderizam
  quando `filtro.contaId == null`. As duas de cima (Receita, Despesas)
  continuam sempre visíveis.
- **Evolução** e **Sazonalidade**: nenhuma mudança estrutural — a
  Evolução já plota `receita`/`despesa` como linhas separadas, então
  passar `contaId` só pro `getDespesasPorMes` que a alimenta já basta
  pra despesa refletir a conta filtrada, com a receita/meta permanecendo
  cheias. A Sazonalidade usa só `getFaturamentoMensal`, então o filtro
  não tem efeito visível nela — comportamento esperado, sem aviso
  extra necessário ali (o aviso geral da página já cobre o motivo).

## Fora de escopo (YAGNI)

- Filtro de período na Analítica — decisão explícita do usuário.
- Migrar `pedidos.conta` (texto) pra uma FK real
  (`pedidos.conta_id`) — mudança de schema maior, não pedida.
- Card de DRE da Executiva — achado colateral, não pedido.
- Redefinir receita via lançamentos — descartado na decisão 1.

## Testes

Sem teste automatizado pras duas mudanças de `services/` (nenhuma
função de I/O deste projeto tem teste) nem pra página (nenhuma página
tem teste). Verificação via `npx tsc --noEmit` e `npm run build`.

Validação manual do usuário: na aba Analítica, selecionar uma conta no
filtro e conferir que (1) o card "Evolução" muda a linha de despesa mas
não a de receita/meta; (2) "Comparativo" esconde Resultado/Margem
Líquida e mostra o aviso; (3) "Sazonalidade" não muda; (4) voltar pra
"Todas as contas" restaura tudo, incluindo Resultado/Margem no
Comparativo.
