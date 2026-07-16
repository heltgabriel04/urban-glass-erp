# Relatório Completo do Cliente (PDF) — Design

## Contexto

O usuário precisa enviar pra cada cliente um relatório profissional e
completo: dados cadastrais, todo o histórico de pedidos (com produtos,
medidas, valor unitário e valor total de cada item) e a situação
financeira (o que já foi quitado, o que está em aberto, com parcelas e
vencimentos). É um documento pra ser lido pelo cliente, então o layout
precisa ser limpo e profissional — não uma tela do sistema exportada.

O projeto já tem infraestrutura pronta pra isso: `@react-pdf/renderer`,
com três documentos já existentes seguindo a mesma identidade visual
(`lib/pdf/romaneio.tsx`, `lib/pdf/comprovante.tsx`,
`lib/pdf/relatorioExecutivo.tsx` — cabeçalho com logo/CNPJ/endereço,
blocos coloridos, tabelas com cabeçalho azul, rodapé fixo) e rotas de
API que renderizam e devolvem o PDF pra download
(`app/api/dashboard-financeiro/relatorio-pdf/route.tsx`,
`app/api/lancamentos/baixas/[id]/gerar-comprovante/route.tsx`). Este
documento novo segue exatamente esse padrão — nenhuma biblioteca nova,
nenhuma decisão de arquitetura nova, só mais um documento no mesmo
molde.

## Decisões confirmadas com o usuário

1. **Sempre todo o histórico** do cliente (sem seletor de período) —
   um botão único "Relatório do Cliente" na tela `/clientes/[id]`.
2. **Itens completos em todo pedido** — cada pedido no relatório traz
   sua própria tabela de itens (produto, dimensões, valor unitário,
   subtotal), não só um resumo.
3. **Parcelas/vencimentos detalhados** — pedidos em aberto mostram cada
   parcela pendente com vencimento e valor, não só o total em aberto.
4. Pedidos **cancelados são excluídos** do relatório (mesmo filtro já
   usado pela view `financeiro_clientes` e por
   `services/dashboardFinanceiro.service.ts`: `status <> 'Cancelado'`).
5. Pedidos ordenados do **mais recente pro mais antigo** (mesma
   convenção do resto do sistema, ex. `clientes/[id]/page.tsx:73`).

## Nota sobre IPI (feature em andamento em paralelo)

O relatório usa `valorComIpi(pedido)` de `lib/pedidoIpi.ts` (criado na
feature de IPI, já mergeado) pra calcular o total real de cada pedido —
não a view `financeiro_clientes`, que ainda não foi ajustada pra somar
IPI. Isso deixa o relatório correto desde já, independente de quando a
etapa de ajuste das views agregadas for concluída.

## Arquitetura

**Rota nova**: `app/api/clientes/[id]/relatorio-pdf/route.tsx` — mesmo
padrão de `gerar-comprovante/route.tsx` (GET, `requireAuth`, client
Supabase com `SUPABASE_SERVICE_ROLE_KEY`, busca os dados, renderiza com
`renderToBuffer`, devolve o PDF com `Content-Disposition: attachment`).

**Documento novo**: `lib/pdf/relatorioCliente.tsx`, exportando
`RelatorioClienteDocument` — reaproveita as cores (`AZUL = "#2d5fa6"`,
`VERDE = "#3d8c5c"`, `VERMELHO = "#b23b3b"`) e os estilos de bloco/tabela
já estabelecidos nos três documentos existentes.

**Botão novo**: em `app/clientes/[id]/page.tsx`, um link
`<a href="/api/clientes/{id}/relatorio-pdf" target="_blank">📄 Relatório
do Cliente</a>` na topbar, ao lado do botão "Editar Cliente" já
existente.

## Dados que a rota busca

Tudo com o client de service role (mesma justificativa dos outros
endpoints: sem sessão de browser no servidor):

1. `clientes` — `select("*")`, pelo `id`.
2. `pedidos` — `select("*, itens_pedido(*)")`, `eq("cliente_id", id)`,
   `neq("status", "Cancelado")`, `order("dt_pedido", { ascending: false })`.
3. `lancamentos` — `select("*")`, `eq("cliente_id", id)`,
   `eq("tipo", "Entrada")`, `eq("status", "A Receber")`,
   `order("vencimento", { ascending: true })` — usado só pra montar a
   lista de parcelas pendentes por pedido (agrupadas por
   `pedido_id` depois, em memória).

Não usa `financeiro_clientes` nem nenhuma outra view — todos os totais
são recalculados a partir de `pedidos`/`itens_pedido`/`lancamentos`,
igual ao que `services/margem.service.ts` e o DRE já fazem (ler
`pedidos` direto, não a view).

## Cálculos (todos em `lib/pdf/relatorioCliente.tsx` ou na própria rota, sem novo `lib/` de cálculo — é a mesma lógica simples já usada em vários lugares)

Por pedido:
- `totalPedido = valorComIpi(pedido)` (produto + IPI, se houver)
- `quitado = pedido.valor_recebido >= totalPedido - 0.02`
- `parcelasPendentes = lancamentosPorPedido[pedido.id] ?? []` (já
  vem ordenado por vencimento)
- `isML = itens.every(i => i.produtos?.unidade === "ml" || i.vidro_cliente)`
  (mesmo teste do `romaneio.tsx:52`)

Agregado (topo do relatório):
- `totalFaturado = soma de totalPedido de todos os pedidos`
- `totalRecebido = soma de pedido.valor_recebido`
- `totalAberto = totalFaturado - totalRecebido`
- `ticketMedio = totalFaturado / pedidos.length` (0 se não houver pedidos)

## Layout do PDF

Um único `<Document>`/`<Page size="A4">` — o react-pdf pagina
automaticamente quando o conteúdo excede uma página física, sem
lógica manual de quebra (mesmo comportamento default de todos os
documentos já existentes, só que estes nunca precisaram testar isso
por serem sempre curtos).

1. **Cabeçalho** (idêntico aos outros 3 documentos): logo/nome da
   empresa/CNPJ/endereço à esquerda; "Relatório do Cliente" +
   nome do cliente + "Emitido em {data}" à direita.

2. **Bloco "Dados do Cliente"**: nome, CPF ou CNPJ (conforme
   `tipo_pessoa`), telefone, e-mail, endereço completo (mesma
   composição de `clientes/[id]/page.tsx:124-132`).

3. **KPIs** (4 caixas, estilo `relatorioExecutivo.tsx`): Total
   Faturado, Recebido, Em Aberto (cor de alerta se > 0), Ticket Médio.

4. **Por pedido**, um bloco pra cada (mais recente primeiro):
   - Linha de cabeçalho do pedido: ID, data, status do pedido
     (`Aguardando otimização`/`Entregue`/etc.), data de retirada.
   - Tabela de itens: `#` · Produto · Dimensões (mm) · Medida (m²/ml)
     · Valor Unit. (R$/m² ou R$/ml) · Subtotal — mesmas colunas de
     `romaneio.tsx`, acrescidas de Valor Unit./Subtotal.
   - Linha de totais do pedido: m² (ou ml) total; se `tem_ipi`, uma
     linha "IPI (6,5%)" + uma linha "Total (com IPI)"; senão, só
     "Valor Total".
   - Situação financeira do pedido: "✓ Quitado" (verde) se
     `quitado`; senão "Em aberto: {formatBRL(aberto)}" (vermelho/alerta)
     seguido da lista de parcelas pendentes (`Parcela — vence
     {data} — {valor}`, ou "Vencimento não definido" se
     `vencimento` for null).

5. **Rodapé** (idêntico aos outros documentos): nome da empresa, CNPJ,
   endereço.

## Fora de escopo (YAGNI)

- Seletor de período — sempre todo o histórico, por decisão do usuário.
- Envio automático (e-mail) do relatório — o usuário baixa o PDF e
  envia manualmente, mesmo fluxo dos outros documentos do sistema.
- Repetir o cabeçalho da tabela de itens em toda página nova (recurso
  do react-pdf pra tabelas que atravessam página) — não é crítico pro
  uso pretendido e adiciona complexidade; se o usuário sentir falta
  depois de usar, é um ajuste pontual.
- Orçamentos (`orcamentos`) — o pedido explicitamente citou "pedidos",
  não orçamentos; a tela `/clientes/[id]` já trata os dois como coisas
  separadas.

## Testes

Sem teste automatizado (mesmo padrão dos outros geradores de PDF do
projeto — nenhum tem teste, são rotas de I/O + renderização visual).
Verificação via `npx tsc --noEmit` e `npm run build`.

Validação manual do usuário: abrir um cliente com pedidos variados
(alguns quitados, algum em aberto com parcelas pendentes, algum com
IPI se já estiver testando essa feature em paralelo, algum sem
pedidos) e conferir visualmente o PDF gerado.
