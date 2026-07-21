# Módulo: APS / Programação da Produção

Última atualização: 2026-07-21
Status: auditoria concluída; capacidade compartilhada + motor de cotação de
prazo implementados e pushados; rastreamento por peça (QR individual)
implementado, pushado e SQL confirmado rodado 2026-07-21

> Nota desta atualização: as seções abaixo foram corrigidas em relação ao
> documento original entregue em 2026-07-20 — o schema anexo (`pedido_itens`,
> `programacao`, `taxas_producao`, `recursos`, `alocacao_diaria`) duplicava
> tabelas que já existiam e funcionavam (`itens_pedido`,
> `programacao_producao`, `config_tempo_producao`); decidido estender o
> sistema existente em vez de criar um paralelo. A Tarefa 1 (auditoria) e boa
> parte da Tarefa 3 (motor de cálculo) já foram implementadas na mesma sessão
> em que este documento foi escrito — os detalhes completos estão nos specs
> linkados no fim.

---

## Estado atual (o que já funciona)

- Tela `/programacao` com visão "Por Linha" e "Por Pedido", zoom
  Hora/Dia/Semana/Mês, filtros por linha e status, drag-and-drop manual,
  botão "Recalcular Agenda" com preview/confirmação obrigatória.
- Etiqueta com QR code impressa junto ao plano de corte, hoje **por
  pedido inteiro** (não por peça individual). QR (`qr_token` em
  `pedidos`) resolve pra `/api/r/[token]`, que redireciona pra tela de
  produção ou pro romaneio conforme o status do pedido — não registra
  evento de scan hoje.
- Existe leitor de código de barras/QR físico na fábrica (já disponível,
  não precisa comprar equipamento novo).
- Fluxo "chapa inteira" (pula Corte/Lapidação, vai direto pra Separação)
  **já existe** hoje, a nível de pedido inteiro (`isPedidoSomenteChapas`/
  `agendarChapaInteira` em `services/programacao.service.ts`).
- **Novo (2026-07-20)**: capacidade compartilhada das 2 pessoas
  (Corte OU Lapidação por dia inteiro) via `bloqueios_linha` tipo
  `'sem_recurso'` + painel "Alocação diária" em `/programacao`.
- **Novo (2026-07-20)**: `cotarPrazoPedido()` — motor de cotação de
  prazo dry-real (nunca grava no banco), backend only, ainda sem UI de
  vendedor.
- **Novo (2026-07-21)**: rastreamento por peça via QR (`pedido_pecas`) —
  cada peça do plano de corte (exceto chapa inteira/vidro do cliente/plano
  Corte Certo externo) ganha QR próprio na etiqueta, escaneado em
  `/pedidos/[id]/producao/peca/[token]` pra fechar Corte/Lapidação/Separação
  por medição real em vez de avanço em lote do status do pedido — resolve
  pela raiz o sub-projeto #2 de `project-fechamento-lote-producao`. Ver
  `docs/superpowers/specs/2026-07-21-scan-real-pecas-design.md`.

## Dor principal (o que motivou esta análise)

Hoje não há forma de responder um cliente na hora sobre prazo de
entrega de um pedido novo. A resposta dependia de perguntar ao gerente
de produção, que somava as etapas de cabeça, sem base auditável.

**Parcialmente resolvido**: o motor de cálculo (`cotarPrazoPedido`) já
existe e roda a partir da fila real + capacidade projetada — falta
expor isso numa tela pro vendedor usar (decisão deliberada de deixar só
backend até validar os números com dado real) e validar a precisão da
projeção de capacidade contra o uso real do painel de alocação diária.

Com o crescimento esperado da produção no fim do ano, essa forma manual
de estimar tende a piorar (mais pedidos simultâneos = mais difícil
estimar de cabeça com precisão) — reforça a prioridade de validar e
expor o motor novo.

---

## Contexto operacional (fatos levantados, usados como premissas de projeto)

- Produção: 2 pessoas fixas.
- Jornada: 7h às 17h, 1h de almoço = **8h úteis/dia**. Há pausas
  adicionais de verificação (corte, lapidação) já embutidas nessa
  média de 8h.
- **Recurso compartilhado**: as 2 pessoas fazem Corte OU Lapidação no
  mesmo dia — nunca as duas etapas no mesmo dia. A troca entre etapas
  é decisão diária do gerente (não confirmado se pode ser mais granular
  que dia inteiro — assumido dia inteiro por ora, é como o painel de
  alocação diária implementado modela hoje).
- Separação: não consome recurso restrito. Após lapidação, peça vai
  para um carrinho; separação é só retirada/carregamento. Não entra
  no modelo de capacidade como gargalo — no motor de cotação, o tempo
  de Separação é uma constante estimada e documentada
  (`SEPARACAO_MIN_ESTIMADO`), não calculada.
- Lapidação é **obrigatória** para toda peça cortada.
- Existe um segundo fluxo — **"chapa inteira"**: quando a chapa é
  vendida inteira ao cliente. Esse fluxo pula Corte e Lapidação
  inteiramente, vai direto para Separação (só carregamento do
  caminhão). Já existe no código a nível de pedido inteiro.
- Prioridade de fila = data de entrega do pedido. Sem multa por
  atraso — hoje o gerente reordena manualmente conforme necessário.
  O motor real (`calcularPrioridadePedido`) já usa slack real até o
  prazo, não FIFO.
- Um pedido pode ser cortado em mais de uma chapa/lote, conforme o
  plano de corte.
- Taxa de produção (minutos por m² de corte, minutos por m² de
  lapidação): já existe como dado calibrável em `config_tempo_producao`
  (Fase 4 do APS, ver `project-aps-programacao-producao` na memória),
  incluindo um mecanismo de recalibração automática a partir de tempos
  reais — não precisa de tabela nova (`taxas_producao` do schema
  original era duplicata).

## Cenário futuro de negócio (não implementar ainda, mas o modelo precisa suportar)

- Avaliar se compensa contratar freelancer(s) **só para Lapidação**,
  como simulação what-if — comparando data de entrega resultante com
  e sem o freelancer. Não é uma regra permanente, é uma decisão pontual
  de análise. Explicitamente fora de escopo até aqui.

---

## Decisões de modelagem já tomadas

1. **Rastreamento por peça, não por pedido — implementado 2026-07-21.**
   Cada peça física recebe um QR code único, gerado no momento em que o
   plano de corte é salvo (`gerarPecasDoPedido`, chamado logo após
   `salvarOtimizacao`), na sequência do próprio plano de corte. Resolve o
   sub-projeto "scan real" combinado em sessão anterior (ver
   `project-fechamento-lote-producao` na memória) — bug de fechamento em
   lote corrompendo tempos reais de produção.
2. **% de progresso do pedido = m² concluído / m² total planejado**,
   não contagem de peças — ainda não implementado (depende do
   rastreamento por peça acima).
3. **Fluxo por item** (`corte_padrao` vs `chapa_inteira`) — **decisão
   revista**: mantido a nível de PEDIDO inteiro (como já existe hoje via
   `isPedidoSomenteChapas`), não movido para nível de item. Simplicidade
   > flexibilidade teórica de misturar os dois fluxos num mesmo pedido,
   já que essa mistura não é um caso real observado.
4. **Capacidade modelada como pool compartilhado — implementado
   diferente do schema original.** Em vez de tabelas novas
   (`recursos`/`alocacao_diaria`), estendido o mecanismo já existente
   `bloqueios_linha` com um tipo novo (`'sem_recurso'`), que já
   alimentava o motor de agendamento real. Painel "Alocação diária" em
   `/programacao` toggla isso por dia. Projeção de capacidade pra dias
   futuros sem decisão explícita usa a proporção histórica recente
   (`proporcaoHistoricaAberta`/`projetarDiasFechados`), não uma tabela
   de simulação separada.
5. **Ajuste manual na agenda trava contra recálculo automático** — já
   existe hoje (campo `travado` em `programacao_producao`, Fase 2/3 do
   APS), não precisou de campo novo.
6. **Schema original (`schema_aps_urban_glass.sql`) não foi implementado
   como veio.** Auditoria encontrou que ele duplicava `itens_pedido`
   (→ `pedido_itens`), `programacao_producao` (→ `programacao`),
   `config_tempo_producao` (→ `taxas_producao`), e colidia de nome com
   `calendario_producao` já existente (colunas diferentes — rodar como
   veio teria falhado). Decisão: estender o sistema existente. As únicas
   tabelas genuinamente novas do schema original (`pedido_pecas`,
   `cenarios_simulacao`/`cenarios_resultados`, `historico_datas`/
   `estimativas_baseline`) continuam candidatas válidas pras próximas
   fases (rastreamento por peça e simulação de freelancer,
   respectivamente) — só não foram criadas ainda porque essas fases não
   começaram.

## Perguntas em aberto / dados que faltam

- [ ] Confirmar se a troca Corte/Lapidação pode ser mais granular que
      dia inteiro (meio-turno), ou se dia inteiro é realmente como
      funciona sempre. O painel de alocação diária implementado assume
      dia inteiro.
- [x] ~~Levantar taxa de produção real~~ — já existe e é calibrável
      (`config_tempo_producao`, Fase 4), incluindo recalibração
      automática a partir de tempos reais. Precisão depende de dados
      reais não-contaminados por fechamento em lote — ver
      `bug-confirm-resolvia-false-sem-popup` e
      `project-fechamento-lote-producao` na memória pra contexto de um
      bug relacionado já corrigido.
- [x] ~~Confirmar se o QR/etiqueta hoje já é impressa em sequência que
      permitiria virar uma etiqueta por peça~~ — confirmado 2026-07-21,
      era só zipar por índice na mesma ordem de `chapas_json` (ver spec).
- [x] ~~Auditar a lógica atual de "Recalcular Agenda"~~ — feito, ver
      seção de auditoria abaixo.
- [ ] Confirmar com módulo Fiscal se "chapa inteira" tem tratamento de
      CFOP diferente de peça cortada sob medida (ver `ARQUITETURA.md`,
      seção de decisões cruzadas).
- [ ] Confirmar com módulo Financeiro/Precificação se o m² usado para
      custo é o mesmo m² planejado usado aqui, ou se há reconciliação
      contra perda real em algum ponto (ver `ARQUITETURA.md`).
- [ ] Validar o painel de alocação diária e a precisão do motor de
      cotação com uso real no navegador — implementado mas não testado
      com dado real ainda.

## Plano de fases

**Ordem revista em relação ao plano original**: o motor de cálculo
(Fase 1) foi implementado ANTES do rastreamento por peça completo,
porque a dor principal (cotar prazo na hora) não dependia disso — só
de capacidade correta e do motor de simulação, ambos já existentes o
suficiente pra reaproveitar. Rastreamento por peça deixou de ser
pré-requisito transversal a todas as fases.

1. **Fase 1 — Motor de cálculo de data estimada.** ✅ Implementado e
   pushado 2026-07-20 (`cotarPrazoPedido` + capacidade compartilhada).
   Falta: UI de vendedor, validação com dado real.
2. **Fase 2 — Motor de reação a mudanças.** Recálculo automático já
   existe desde antes deste módulo (Fase 3 do APS original); convivência
   ajuste manual vs. recálculo também já existe (`travado`). O que falta
   aqui é específico: tratamento de atraso detectado automaticamente
   informando a cotação — não iniciado.
3. **Fase 3 — Rastreamento por peça (QR individual).** ✅ Implementado,
   pushado e SQL confirmado rodado 2026-07-21 (`pedido_pecas` +
   `/pedidos/[id]/producao/peca/[token]`). Falta: validar scan real com o
   leitor físico da fábrica.
4. **Fase 4 — Visual/UX / simulação de freelancer.** Não iniciado,
   depende das fases anteriores.

## Auditoria do sistema atual (concluída 2026-07-20)

Achados registrados em `sql/aps-auditoria-achados.sql` (rodado e
confirmado), tabela `aps_auditoria_achados`:
- **Duplicação** (severidade média): `getPedidosSemProgramacao()` pula
  o filtro de exclusão de pedidos já agendados quando há mais de 200 —
  acima disso, duplicação volta a ser possível.
- **Sobreposição de capacidade** (severidade alta): `reagendar()` (drag
  manual) não valida expediente/feriado/capacidade — só a constraint de
  banco `no_overlap_linha`, que não cobre esses casos.
- **Extensão indevida** (severidade alta): `alocarBloco()` recursa
  indefinidamente se uma tarefa precisar de mais horas que cabem num
  expediente inteiro — sem limite de tentativas.
- **Recalcular Agenda**: documentado o algoritmo real (greedy + gap-fill
  + refinamento 2-opt, respeita blocos travados/em execução/concluídos,
  preview+confirmação obrigatória antes de gravar).

Os 3 achados de bug (não o de documentação) ainda não foram corrigidos
— ficaram registrados como itens identificados, não corrigidos nesta
rodada (o escopo desta sessão foi capacidade + cotação, não correção de
bugs pré-existentes do motor).

## Documentos relacionados
- `docs/superpowers/specs/2026-07-20-capacidade-compartilhada-cotacao-prazo-design.md`
  — spec da capacidade compartilhada + motor de cotação.
- `docs/superpowers/specs/2026-07-20-fechamento-lote-producao-design.md`
  — spec do bug de fechamento em lote (sub-projeto #1, base do #2 abaixo).
- `docs/superpowers/specs/2026-07-21-scan-real-pecas-design.md` — spec do
  rastreamento por peça (sub-projeto #2 + Fase 3 deste módulo).
- `sql/aps-auditoria-achados.sql`, `sql/bloqueio-linha-sem-recurso.sql`
  — migrations da rodada 2026-07-20, ambas rodadas e confirmadas.
- `sql/pedido-pecas-scan.sql` — migration de 2026-07-21, **confirmada rodada**.
- `schema_aps_urban_glass.sql` (entregue pelo usuário, fora do
  controle de versão do repo) — schema original; ver decisão #6 acima
  sobre por que não foi implementado como veio.

---

> Lembrete: se alguma decisão aqui afetar outro módulo, registrar
> também em `../ARQUITETURA.md`, seção "Decisões cruzadas entre
> módulos" — não duplicar o detalhe completo lá, só o link e o porquê.
