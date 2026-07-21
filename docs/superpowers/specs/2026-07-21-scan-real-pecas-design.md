# Rastreamento por peça física via QR (scan real)

Une dois pendentes já registrados: sub-projeto #2 de
`2026-07-20-fechamento-lote-producao-design.md` (fecha `programacao_producao`
por medição real, não por avanço administrativo de status do pedido) e a
Fase 3 do APS em `docs/modulos/aps.md` (rastreamento por peça, QR
individual). Implementado sem interação com o usuário nesta sessão — decisões
abaixo são chamadas de engenharia feitas com base no que já estava
documentado/decidido em sessões anteriores, não brainstorm novo.

## Schema

`pedido_pecas` (`sql/pedido-pecas-scan.sql`, **pendente rodar no Supabase**):
uma linha por peça física, `qr_token` próprio, `status` em
`pendente → cortada → lapidada → separada`, `item_pedido_id` (nullable —
casamento por dimensão pode falhar em teoria, ver limitação abaixo),
`precisa_lapidacao` copiado do item na geração.

## Geração das peças

`gerarPecasDoPedido()` (`services/pecas.service.ts`), chamada a partir de
`app/otimizador/page.tsx:handleSalvar` logo após `salvarOtimizacao()`, melhor
esforço (não bloqueia o salvamento do plano de corte).

- Pula pedidos "chapa inteira" (`isPedidoSomenteChapas`) — esse fluxo não
  passa por Corte/Lapidação, não precisa de rastreamento por peça.
- Casa cada peça posicionada (`chapas_json.placed`, só tem `l`/`a`/`prod`,
  **não carrega `item_pedido_id`** — limitação do motor do otimizador) com um
  item do pedido via fila por dimensão (`casarPecasComItens`, função pura,
  testada), mesma técnica já usada por
  `app/pedidos/[id]/etiquetas/page.tsx` pra casar `codigo_adicional`. Peças
  de itens com a mesma dimensão são fisicamente intercambiáveis pra fins de
  produção — atribuição gulosa na ordem do plano é uma aproximação aceita,
  consistente com a granularidade real de `programacao_producao` (por item,
  não por peça).
- Segurança: se qualquer peça do pedido já saiu de `pendente` (produção real
  em andamento), a regeneração é recusada — nunca sobrescreve progresso
  físico real com uma reotimização.

## QR na etiqueta

`app/pedidos/[id]/etiquetas/page.tsx`: no branch padrão (otimizador via
`chapas_json`, não `modoCorteCerto`/`modoChapa`/`modoVidroCliente`), busca
`pedido_pecas` ordenado por `ordem` e faz zip por índice com as etiquetas já
construídas (mesma ordem de iteração de `chapas_json`, contando só peças do
próprio pedido — uma otimização combinada pode ter peças de outros pedidos
misturadas). **Fallback de segurança**: se a contagem de `pedido_pecas` não
bater exatamente com o total de peças do próprio pedido no plano atual
(reotimização depois da geração, por exemplo), a etiqueta cai pro QR de
pedido inteiro antigo (`/api/r/[qr_token]`) em vez de arriscar casar peça
errada com etiqueta errada — etiqueta física impressa não se corrige depois.

**Fora de escopo deste corte**: `modoChapa` (chapa inteira), `modoVidroCliente`
e `modoCorteCerto` (plano externo P-058/P-059) continuam com QR de pedido
inteiro — não geram `pedido_pecas`.

## Scan e confirmação

`/pedidos/[id]/producao/peca/[token]` (nova página) — já cai dentro do regex
RBAC existente (`^/pedidos/[^/]+/producao(/.*)?$`, `middleware.ts`) que
restringe o perfil `producao` a essas rotas, então não precisou de mudança
no middleware. Mesmo padrão visual/mobile de `/pedidos/[id]/producao/page.tsx`
(dark, max-width 480px, botão único com passo de confirmação).

`confirmarProximaEtapaPeca()` (`services/pecas.service.ts`):
1. Determina a próxima ação (`proximaAcaoPeca`, função pura) a partir do
   `status` atual da peça — só uma ação possível por vez, sem parâmetro.
2. Grava o timestamp real na peça. Item sem lapidação (`item.lapidacao = 0`)
   pula direto de `pendente` pra `lapidada` no momento da confirmação de
   corte (não existe bloco de Lapidação pra esse item em
   `programacao_producao`, então não haveria etapa de scan pra ela).
3. Reconta quantas peças do mesmo `item_pedido_id` (Corte/Lapidação) ou do
   mesmo `pedido_id` (Separação, que é um bloco por pedido, não por item)
   ainda faltam. Na primeira peça, avança o bloco de `Agendado` pra
   `Em Execução` (marca `dt_inicio_real`); na última, fecha pra `Concluído`
   (marca `dt_fim_real`) — reaproveitando `atualizarStatusProgramacao()` já
   existente (mesma função do clique manual no Gantt), que por sua vez já
   sincroniza `pedidos.status` automaticamente via `mapearStatusPedido`.

Como `reconciliarProgramacaoComPedido()` (avanço administrativo de status do
pedido) só preenche `dt_inicio_real`/`dt_fim_real` quando ainda estão vazios
(`if (!bloco.dt_inicio_real)`/`if (!bloco.dt_fim_real)`), um bloco já fechado
pelo scan real vira no-op nesse caminho — não precisou tocar
`reconciliarProgramacaoComPedido()` pra integrar os dois fluxos.

**Fix colateral** (correção pequena, necessária pra correção do scan):
`atualizarStatusProgramacao()` agora zera `horario_real_estimado` sempre que
grava um `dtReal` — antes, se um bloco já tivesse sido carimbado como
estimado pelo avanço em lote (`horario_real_estimado: true`), uma ação real
posterior (clique no Gantt OU scan de peça) escrevia o timestamp real mas
deixava a flag presa em `true` pra sempre, contaminando a calibração mesmo
depois de uma medição real chegar.

## Limitações conhecidas / não implementado nesta rodada

- `item_pedido_id` pode ficar `null` numa peça se a fila de dimensão
  esgotar (mais peças cortadas do que o total de itens previa — não deveria
  acontecer em uso normal, mas não há validação ativa contra isso). Peça com
  `item_pedido_id = null` ainda pode ser escaneada e seu status avança
  normalmente, só não fecha nenhum bloco de `programacao_producao` (sem como
  saber qual).
- Sem campo "quem escaneou" — qualquer sessão com role `producao` pode
  confirmar qualquer peça. Suficiente pro objetivo (medição real de tempo),
  não é controle de autoria.
- `modoChapa`/`modoVidroCliente`/`modoCorteCerto` não geram `pedido_pecas`
  (ver acima) — continuam no fluxo antigo de fechamento em lote por status
  do pedido.
- % de progresso do pedido por m² (decisão #2 já registrada em
  `docs/modulos/aps.md`) não foi implementado — só o campeamento dos blocos
  de `programacao_producao`, que é o que resolve o bug de calibração.
- Sem UI de acompanhamento agregado (quantas peças faltam por pedido) fora
  da própria tela de scan — poderia entrar no Gantt/Dashboard depois.

## Verificação

`npx tsc --noEmit`, `npm test` (159 passando, 8 novos em
`pecas.service.test.ts`), `npm run build`, `npm run lint` — todos limpos.
Sem smoke test ao vivo no navegador (mesma limitação de sempre: rotas atrás
de auth do Supabase, sem credenciais neste ambiente) — em especial o scan
físico com leitor de QR real da fábrica precisa de validação manual do
usuário, não dá pra simular aqui.
