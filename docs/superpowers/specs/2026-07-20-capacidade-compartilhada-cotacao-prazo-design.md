# Capacidade compartilhada (2 pessoas) + motor de cotação de prazo

## Contexto

Prompt externo trouxe um schema completo pra evoluir o APS (rastreamento por
peça com QR, modelo de capacidade compartilhada, motor de cálculo de prazo,
simulação de freelancer). Investigação encontrou que o schema recria, com
nomes novos, conceitos que já existem e funcionam hoje (`itens_pedido` ↔
`pedido_itens`, `programacao_producao` ↔ `programacao`, `config_tempo_producao`
↔ `taxas_producao`, e uma colisão direta de nome em `calendario_producao`, já
existente com colunas diferentes desde `sql/fase1-estabilidade.sql`). Decisão
tomada: estender o sistema existente em vez de duplicar.

Também: a dor principal do negócio (cotar prazo de entrega na hora pra um
pedido novo) não depende do rastreamento por peça completo — só precisa de
um modelo de capacidade correto e um motor de simulação. Essa é a parte
implementada agora; o rastreamento por peça com QR fica pra depois (junto do
sub-projeto "scan real", já combinado antes nesta sessão em
[[project-fechamento-lote-producao]]).

## Problema de capacidade

Hoje `alocarBloco()` (`services/programacao.service.ts:303`) empacota tarefas
dentro da janela `inicio_dia`–`fim_dia` de cada `producao_linha`,
implicitamente assumindo que TODAS as linhas (Corte e Lapidação) têm gente
trabalhando nelas todo santo dia. Na realidade só existem 2 pessoas, e elas
alternam — um dia inteiro as duas em Corte, outro dia inteiro as duas em
Lapidação (decisão do gerente, dia a dia). O modelo atual não tem como
representar "essa linha não tem ninguém hoje".

## Solução — Parte A: capacidade via `bloqueios_linha` (extensão, não tabela nova)

`bloqueios_linha` (`services/programacao.service.ts:1372`) já é um bloqueio
de intervalo de datas por linha (`linha_id`, `dt_inicio`, `dt_fim`, `tipo`),
já flui pro motor via `construirDiasBloqueadosPorLinha` →
`diasBloqueados` → `alocarBloco` (`ehDiaUtil`), e já tem UI de toggle
(botão de cadeado por linha) na Fase 5/7. É exatamente o mecanismo certo pra
representar "linha sem pessoa alocada hoje" — só falta:

1. **Migration pequena**: adicionar `'sem_recurso'` ao CHECK de
   `bloqueios_linha.tipo` (distinto de `'manutencao'`/`'recesso'` — aparece
   diferente na legenda/hachura do Gantt, já que "sem gente" e "máquina
   quebrada" são informações diferentes pro gerente).
2. **Painel de alocação diária** em `/programacao`: faixa de 7-14 dias à
   frente, um toggle Corte/Lapidação por dia. Cada toggle chama
   `adicionarBloqueioLinha(linhaId, dia, dia, 'Sem pessoa alocada', 'sem_recurso')`
   / `removerBloqueioLinha` — sem tabela nova, sem lógica nova de
   persistência.
3. **Projeção pra dias futuros sem decisão** (usada só pelo motor de
   cotação, nunca grava): `capacidadeEsperada(linhaId, data, bloqueiosReais,
   janelaHistorico)` — pura, olha a proporção de dias explicitamente
   decididos nos últimos N dias corridos (ex: últimos 20 dias úteis) pra
   cada linha e aplica essa mesma proporção nos dias futuros sem decisão
   ainda. Se não houver histórico suficiente (fábrica nova, poucos dias
   decididos), cai num default documentado como estimativa (ambas linhas
   abertas, 1 pessoa cada — o split mais neutro possível) até haver dado
   real.

## Solução — Parte B: motor de cotação (`cotarPrazoPedido`)

Função pura nova em `services/programacao.service.ts`, no mesmo espírito de
`gerarPropostaRecalculo()` (simula, nunca grava):

- **Entrada**: itens do pedido hipotético (mesmo shape de
  `criarProgramacaoPedido`: m², quantidade, produto, flag chapa-inteira),
  `config_tempo_producao`, linhas, calendário, `bloqueios_linha` reais +
  `capacidadeEsperada` pros dias futuros sem decisão.
- **Ponto de partida**: próximo slot livre real de cada linha — reaproveita
  a mesma leitura que hoje já existe pra saber onde a fila termina (MAX
  `dt_fim_previsto` das linhas ativas por `linha_id`), não uma suposição nova.
- **Simulação**: mesmo `alocarBloco()`/`calcularTempoEstimado()` já usados em
  produção, aplicados aos itens do pedido hipotético a partir desse ponto de
  partida. Chapa inteira reaproveita a mesma checagem de
  `isPedidoSomenteChapas()` — pula Corte/Lapidação, vai direto pra Separação.
- **Saída**: `fimCorte`, `fimLapidacao`, `fimSeparacao` (soma de uma
  constante pequena e documentada como estimativa, já que Separação não
  consome recurso restrito), `dtFinal` — expostos separadamente, não só a
  data final, pra dar pra auditar cada camada.
- **Nunca grava no banco.** Não substitui `criarProgramacaoPedido` (que
  continua sendo o commit real quando o pedido é de fato agendado).

## Taxas de produção

`config_tempo_producao` já existe e já é exatamente o que a Tarefa 3 pedia
(`taxas_producao`) — usa os valores já calibráveis (Fase 4) em vez de
inventar constante nova. Nenhuma mudança necessária aqui.

## Fora de escopo desta parte (fica pra depois)

- Reordenação automática de fila, resolução de conflito ajuste manual vs
  recálculo, simulação de contratação de freelancer — explicitamente adiado
  pelo próprio prompt original.
- Rastreamento por peça com QR individual (`pedido_pecas`) — sub-projeto
  separado, ver [[project-fechamento-lote-producao]].
- UI de cotação pro vendedor (botão em Orçamentos/Pedidos) — por decisão do
  usuário, fica só backend por enquanto; a superfície de UI vem depois de
  validar os números.
