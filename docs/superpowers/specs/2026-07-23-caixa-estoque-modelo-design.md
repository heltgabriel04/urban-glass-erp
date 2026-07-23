# Estoque por Caixa — Sub-projeto 1: Modelo de dado + consumo

## Contexto

O usuário pediu duas melhorias no módulo de Estoque: (1) substituir o estoque
atual pelos números de uma contagem física real, organizada em caixas
fechadas/abertas por material+medida; (2) um sistema de etiquetas por caixa
(1 ID único por caixa, reimprimível, com dados de rastreabilidade), no mesmo
padrão das etiquetas de retalho que já existem.

O projeto foi decomposto em 3 sub-projetos, cada um com seu próprio ciclo
spec → plano → implementação, nesta ordem:

1. **Modelo de dado "Caixa de Estoque"** (este spec) — fundação: schema +
   resolução de consumo por caixa.
2. **Carga real do estoque atual** — usa o modelo do item 1 para lançar os 5
   materiais informados pelo usuário, substituindo o que existe hoje.
3. **Etiquetas de caixa** — layout de impressão e fluxo de seleção/impressão,
   no padrão visual das etiquetas de retalho.

Este spec cobre só o item 1. Itens 2 e 3 dependem dele e ganham spec próprio
depois que este for implementado.

### Por que essa ordem, e não "estoque primeiro, etiqueta depois" como pedido originalmente

O usuário quer que cada caixa tenha ID único e que toda movimentação
(entrada/venda/consumo) aconteça por caixa, com reimpressão de etiqueta sem
perder rastreabilidade. Isso só é possível se o modelo de caixa já existir
antes da carga de dados — senão os números entrariam do jeito antigo (por
lote/produto agregado, sem caixa) e precisariam ser refeitos depois. O
usuário concordou com a reordenação.

### Estado atual do sistema (investigado antes de desenhar)

- Existem hoje **dois modelos de estoque coexistindo**: a tabela agregada
  legada `estoque` (1 linha por produto, sem noção de lote/dimensão) e a
  tabela `lotes_estoque` (criada 2026-07-21, múltiplos lotes por produto,
  cada um com sua própria dimensão de chapa/custo/data). A migração para
  `lotes_estoque` está parcial: só a baixa por Otimizador já resolve lote
  específico; venda direta de chapa cheia, compra e ajuste manual ainda
  escrevem só no agregado.
- **Não existe conceito de "caixa" em lugar nenhum hoje.** O mais próximo é
  `produtos.chapas_por_colar`, um número fixo por tipo de produto usado só
  para exibição (não é uma entidade rastreável com ID próprio).
- `lotes_estoque` já tem, por linha: dimensão de chapa (`chapa_largura_mm`/
  `chapa_altura_mm`, nullable), `chapas_entrada`/`chapas_saldo`, `m2_saldo`,
  `custo_m2`, `dt_entrada`/`dt_entrada_estimada`, `dimensao_confirmada`,
  `ativo`. Na prática, cada linha de lote já é "uma entrada de N chapas da
  mesma dimensão/custo/data" — quase a definição de uma caixa física.
- **Achado durante a investigação — lacuna real no fluxo de venda direta**:
  quando um item de pedido bate com a medida de uma chapa cheia
  (`isChapaInteira`), o sistema já debita estoque na criação do pedido
  (`services/pedidos.service.ts:158-190`), mas essa baixa **nunca resolve
  lote** — cai sempre no agregado `estoque`, nunca em `lotes_estoque`. Isso é
  diferente do Otimizador, que já resolve lote na baixa por corte. Sem
  corrigir isso, a integração caixa↔pedido não teria efeito nenhum no
  caminho mais relevante pro caso do usuário (materiais vendidos como chapa
  cheia, não cortados).
- **Achado lateral — bug de divergência**: `app/pedidos/novo/page.tsx` usa
  uma cópia própria e desatualizada de `isChapaInteira` (lista fixa de 6
  medidas hardcoded, linhas 58-68), diferente da versão dinâmica em
  `lib/chapas.ts` (lê `lotes_estoque` de verdade) que `pedidos.service.ts`
  usa para decidir a baixa real. Isso já é reconhecido no próprio código como
  um problema recorrente (`lib/movimentacaoEstoque.ts:1-6`: "3 implementações
  divergentes de isChapaInteira já causaram bug"). Corrigido neste
  sub-projeto, já que a integração caixa↔pedido depende da detecção estar
  certa nos dois lugares.

## Decisões tomadas com o usuário

1. **Arquitetura**: opção A — estender `lotes_estoque` em vez de criar uma
   tabela filha nova. Cada linha de lote passa a representar exatamente 1
   caixa física. Reaproveita toda a infraestrutura existente (PEPS por
   `dt_entrada`, resolução de dimensão, `registrarMovimentacao` com
   `lote_id`, leitura no Otimizador e nas Etiquetas de pedido) sem duplicar
   lógica de saldo/agregação.
2. **Escolha de caixa quando há ambiguidade** (2+ caixas do mesmo
   produto+medida disponíveis): usuário escolhe manualmente — sem
   auto-seleção quando há mais de uma candidata.
3. **Consumo maior que o saldo de uma única caixa**: bloqueia e pede pra
   dividir a operação manualmente por caixa. Sem cascata automática entre
   caixas.
4. **QR na etiqueta**: real e escaneável (token único por caixa, rota
   pública), não só texto/visual como a etiqueta de retalho hoje.
5. **Local da UI**: dentro do módulo Estoque (não Produtos) — é dado físico
   de saldo, não cadastro/preço.
6. **Escopo explicitamente fora desta leva**: o Otimizador já resolve lote na
   baixa por corte, mas não bloqueia se o plano de corte consumir mais
   chapas do que a caixa escolhida tem de saldo. Esse é um comportamento
   pré-existente, não introduzido por esta feature — fica como está. Só a
   baixa nova (venda direta de chapa cheia) ganha o bloqueio da decisão 3.

## Design

### 1. Schema — `lotes_estoque` ganha 2 colunas

```sql
ALTER TABLE lotes_estoque
  ADD COLUMN codigo    text GENERATED ALWAYS AS ('CX-' || lpad(id::text, 6, '0')) STORED,
  ADD COLUMN qr_token   uuid UNIQUE NOT NULL DEFAULT gen_random_uuid();
```

- `codigo`: gerado automaticamente a partir do `id` (bigserial já existente),
  nunca preenchido manualmente, sempre único. Exemplo: lote/caixa `id=123`
  vira `CX-000123`.
- `qr_token`: alvo do QR impresso na etiqueta (sub-projeto 3). Mesmo padrão
  já usado no QR do romaneio de pedido (`sql/etiqueta-qr-romaneio.sql`,
  `app/api/r/[token]/route.ts`) — token opaco separado do `id` sequencial,
  pra não expor contagem interna de caixas em URL pública.

Nenhuma coluna nova para "fechada"/"aberta" — é derivado em tempo de leitura,
nunca armazenado:

```ts
function statusCaixa(chapas_saldo: number, chapas_entrada: number): "fechada" | "aberta" | "esgotada" {
  if (chapas_saldo <= 0) return "esgotada";
  if (chapas_saldo === chapas_entrada) return "fechada";
  return "aberta";
}
```

(`esgotada` mantém `ativo=true` — não é desativação, só significa que a
caixa não aparece mais em `getLotesUtilizaveis()` porque esse filtro já
exige `chapas_saldo > 0`.)

### 2. Rota pública do QR

Novo `app/api/cx/[token]/route.ts`, mesmo padrão do `app/api/r/[token]`:
busca `lotes_estoque` por `qr_token`, resolve o destino em tempo de leitura
(não no momento da impressão) e redireciona para `/estoque/caixas/[id]/publico`
— página sem autenticação mostrando produto, medida, chapas saldo/entrada,
m², código e data de entrada (omitida se `dt_entrada_estimada=true`).

Casos de borda:
- `qr_token` não encontrado ou `ativo=false` → `404` com texto simples
  ("Caixa não encontrada ou inativa"), igual ao padrão já usado no QR de
  pedido.
- Caixa esgotada (`chapas_saldo=0`) → página carrega normalmente, mas exibe
  destaque visual "ESGOTADA" — não é erro, é rastreabilidade histórica
  (permite reimprimir/consultar uma caixa zerada).

### 3. Resolução de caixa na venda direta de chapa cheia

Em `services/pedidos.service.ts`, dentro de `createPedido`, o trecho que já
detecta chapa cheia (linhas 158-190) ganha resolução de caixa antes de
chamar `registrarMovimentacao`:

```ts
const candidatas = await getLotesUtilizaveis(item.produto_id)
  .then(lotes => lotes.filter(l => isChapaInteira(item.largura, item.altura, [{ w: l.chapa_largura_mm!, h: l.chapa_altura_mm! }])));
```

Função pura nova (testável sem Supabase), separada do service:

```ts
type ResolucaoCaixa =
  | { ok: true; caixaId: number }
  | { ok: false; motivo: "nenhuma_candidata" }
  | { ok: false; motivo: "multiplas_candidatas"; candidatas: LoteEstoque[] }
  | { ok: false; motivo: "saldo_insuficiente"; caixaId: number; saldo: number; necessario: number };

function resolverCaixaParaVenda(
  candidatas: LoteEstoque[],
  caixaEscolhidaId: number | undefined,
  quantidadeNecessaria: number,
): ResolucaoCaixa {
  if (candidatas.length === 0) return { ok: false, motivo: "nenhuma_candidata" };
  if (candidatas.length > 1 && !caixaEscolhidaId) {
    return { ok: false, motivo: "multiplas_candidatas", candidatas };
  }
  const caixa = candidatas.length === 1 ? candidatas[0] : candidatas.find(c => c.id === caixaEscolhidaId)!;
  if (caixa.chapas_saldo < quantidadeNecessaria) {
    return { ok: false, motivo: "saldo_insuficiente", caixaId: caixa.id, saldo: caixa.chapas_saldo, necessario: quantidadeNecessaria };
  }
  return { ok: true, caixaId: caixa.id };
}
```

Comportamento em `app/pedidos/novo/page.tsx` (onde o pedido é montado antes
do POST):
- 1 candidata → segue direto, sem perguntar nada ao usuário (caso comum,
  sem fricção adicional).
- 2+ candidatas → mostra um seletor (mesmo padrão visual do seletor de lote
  que o Otimizador já tem) para o usuário escolher qual caixa abater.
- Candidata escolhida com saldo insuficiente → bloqueia o envio do pedido
  com mensagem clara (ex.: "Caixa CX-000123 só tem 12 chapas, este item
  precisa de 20 — divida em mais de um item ou escolha outra caixa") — não
  completa puxando de outra caixa automaticamente.

`registrarMovimentacao` (já aceita `loteId` opcional, `services/estoqueMovimentacoes.service.ts:77-117`)
passa a receber esse `caixaId` como `loteId` sempre que a resolução for `ok`.
Nenhuma mudança na assinatura desse service — ele já sabe decrementar
`chapas_saldo`/`m2_saldo` do lote quando `loteId` é informado.

### 4. Correção do bug lateral — `isChapaInteira` divergente

`app/pedidos/novo/page.tsx:58-68` troca a lista hardcoded `CHAPAS_DIMS` pela
função dinâmica de `lib/chapas.ts` (mesma que `pedidos.service.ts` já usa),
alimentada pelas mesmas dimensões de `lotes_estoque` via `getLotesUtilizaveis`.
Elimina a divergência que hoje pode marcar um pedido como "Aguardando
otimização" enquanto o backend já debitou estoque como venda direta por trás.

### 5. UI — lista de caixas dentro de Estoque

Nova rota `/estoque/caixas`: lista todas as caixas (toda linha de
`lotes_estoque` — lote e caixa são a mesma coisa agora), com filtro por
produto e por status (fechada/aberta/esgotada/todas). Cada linha mostra
`codigo`, produto, medida, saldo/entrada, data de entrada (ou "estimada" se
`dt_entrada_estimada=true`), e um botão de reimpressão individual.
Checkboxes de seleção múltipla + "Imprimir selecionadas" no topo — grava IDs
selecionados em `sessionStorage` e abre a página de impressão (layout e
campos da etiqueta em si são escopo do sub-projeto 3, não deste).

Entra como um link/aba a partir da tela `/estoque` já existente — não cria
seção nova no menu lateral.

### 6. Testes

Cobertura Vitest para a lógica pura nova, sem mockar Supabase (mesmo padrão
de `pctConcluido` e outros helpers já testados):
- `statusCaixa(saldo, entrada)` — os 3 casos (fechada/aberta/esgotada) +
  bordas (saldo negativo não deveria ocorrer, mas não deve quebrar: trata
  como esgotada).
- `resolverCaixaParaVenda(candidatas, caixaEscolhidaId, quantidade)` — os 5
  ramos: nenhuma candidata, 1 candidata (auto-resolve), múltiplas sem
  escolha, múltiplas com escolha válida, saldo insuficiente.

## Fora de escopo (explícito)

- Layout/campos/impressão da etiqueta de caixa em si — sub-projeto 3.
- Carga dos dados reais do usuário (5 materiais) — sub-projeto 2.
- Bloqueio de saldo insuficiente no Otimizador (corte) — comportamento
  pré-existente, não alterado aqui (ver decisão 6).
- Custo (`custo_m2`) de caixas novas — tratado no sub-projeto 2 (usuário
  decidiu deixar zerado por enquanto; futura importação de XML de nota de
  entrada preenche isso automaticamente, projeto separado, não coberto
  aqui).
- Migração de compra/recebimento e ajuste manual em `/estoque` para
  resolver lote (hoje também só escrevem no agregado) — fora de escopo,
  só o caminho de venda direta de chapa cheia é corrigido aqui, por ser o
  caminho relevante pro caso do usuário.
