# Estoque por Caixa — Sub-projeto 2: Carga real do estoque atual

## Contexto

Sub-projeto 2 de 3 (ver [[project-caixa-estoque-modelo]] / `docs/superpowers/specs/2026-07-23-caixa-estoque-modelo-design.md`). O sub-projeto 1 (modelo de dado + resolução de caixa na venda direta) já está implementado e pushado — cada linha de `lotes_estoque` é hoje uma "caixa física" com `codigo`/`qr_token`, e a migração de schema (`sql/lotes-estoque-caixa.sql`) já foi rodada no Supabase pelo usuário.

O usuário forneceu a contagem física real do estoque de vidro atual, organizada por material+medida, em caixas fechadas/abertas:

```
LAMINADO 4+4       — 3660×2140 — 6 caixas fechadas (17 chapas por caixa)
LAMINADO 3+3       — 3300×2250 — 2 caixas fechadas (24/caixa) + 1 caixa aberta (10 chapas)
LAMINADO VERDE 4+4 — 3300×2250 — 1 caixa fechada (18 chapas) + 1 caixa aberta (13 chapas)
LAMINADO 4+4       — 3300×2250 — 1 caixa aberta (16 chapas)
REFLECTA 4+4       — 3660×2140 — 2 caixas fechadas (17/caixa) + 1 caixa aberta (11 chapas)
```

Este é o "estoque oficial" a partir de agora — o que existe hoje no sistema deve ser **substituído**, não somado.

### Estado atual investigado (antes da carga)

Consulta ao banco (só leitura) mapeou os 5 itens aos produtos e lotes/caixas reais:

| Item do usuário | Produto | Caixa/lote atual (a zerar) |
|---|---|---|
| Laminado 4+4, 3660×2140, 6 fechadas×17 | **Laminado 4+4 Incolor** (id 10, VL-001) | lote #6, saldo 81 |
| Laminado 4+4, 3300×2250, 1 aberta×16 | **Laminado 4+4 Incolor** (id 10) | lote #1, saldo 8 |
| Laminado 3+3, 3300×2250, 2×24 + 1×10 | **Laminado 3+3 Incolor** (id 15, VL-003) | lote #3, saldo 33 |
| Laminado Verde 4+4, 3300×2250, 1×18 + 1×13 | **Laminado 4+4 Verde** (id 13, VL-002) | lote #2, saldo 154 |
| Reflecta 4+4, 3660×2140, 2×17 + 1×11 | **Reflecta 4+4 Incolor** (id 17, VR-001) | lote #4, saldo 39, dimensão nunca confirmada |

3 produtos ativos **não aparecem** na lista do usuário e não têm estoque físico hoje: Laminado 4+4 Fumê (id 18), Refletivo 4+4 Fumê (id 20) — nenhum dos dois tem linha na tabela agregada `estoque` hoje — e Refletivo 4+4 sem cor (id 21), que tem 7 chapas na agregada hoje (lote #5, sem dimensão confirmada).

A tabela agregada `estoque` (legada, ainda a única lida por `app/estoque/page.tsx`) tem hoje: produto 10 = 100 chapas/742,5 m², produto 13 = 154/1143,45, produto 15 = 38/282,15, produto 17 = 39/310,443, produto 21 = 7/49,434.

## Decisões tomadas com o usuário

1. **Escopo da zerada**: o estoque **inteiro** do sistema é zerado, não só os 5 produtos da lista — inclui o produto 21 (7 chapas → 0), que não está na lista do usuário.
2. **Custo**: `custo_m2` das caixas novas fica `null` (zerado) por enquanto. O usuário vai importar XML de nota de entrada futuramente pra preencher isso automaticamente — projeto separado, não coberto aqui. **Efeito colateral aceito conscientemente**: CMV/margem de vendas desse estoque vai calcular como custo R$0 até essa importação acontecer.
3. **Datas de entrada**: só as 6 caixas de Laminado 4+4 3660×2140 levam data real (`2026-07-21`, `dt_entrada_estimada = false`). Todas as outras 6 caixas novas levam a data de hoje (`2026-07-23`) com `dt_entrada_estimada = true` (dado incerto, sinalizado como tal — mesma convenção que já existe no schema).
4. **Tamanho original das caixas abertas** (`chapas_entrada`, necessário pra status "aberta" ficar correto): usuário confirmou o padrão real da casa —
   - Laminado 3+3, 3300×2250 → 24 chapas/caixa
   - Laminado 4+4 (incolor ou verde), 3300×2250 → 18 chapas/caixa
   - Qualquer material, 3660×2140 → 17 chapas/caixa
5. **Tabela agregada `estoque`**: atualizada junto com `lotes_estoque` nesta mesma migração, pra `app/estoque/page.tsx` (que ainda lê só a agregada, não lotes) mostrar os números certos imediatamente — sem isso a tela principal de Estoque continuaria mostrando os saldos antigos (100/154/38/39/7) mesmo com as caixas corretas por baixo.
6. **Semântica do reset na agregada**: tratado como um "saldo inicial" novo, não um ajuste incremental — `chapas_entrada`/`m2_entrada` da agregada passam a refletir o novo saldo (não somam ao histórico antigo), e `m2_consumido` zera junto.
7. **Execução**: script SQL único, escrito por mim e rodado manualmente pelo usuário no Supabase SQL Editor — nenhuma execução direta contra o banco de produção por mim.

## Design

### 1. Cálculo de área por chapa

`m2_por_chapa` é coluna gerada (`chapa_largura_mm × chapa_altura_mm / 1e6`), mas `m2_saldo` é uma coluna própria que a migração precisa calcular e inserir:

- 3660×2140mm → 7,8324 m²/chapa
- 3300×2250mm → 7,425 m²/chapa

### 2. Caixas novas (15 linhas em `lotes_estoque`)

| Produto | Medida | Qtd caixas | Entrada/Saldo cada | `dt_entrada` | `dt_entrada_estimada` |
|---|---|---|---|---|---|
| 10 (Lam. 4+4 Incolor) | 3660×2140 | 6 | 17/17 | 2026-07-21 | false |
| 10 (Lam. 4+4 Incolor) | 3300×2250 | 1 | 18/16 | 2026-07-23 | true |
| 15 (Lam. 3+3 Incolor) | 3300×2250 | 2 | 24/24 | 2026-07-23 | true |
| 15 (Lam. 3+3 Incolor) | 3300×2250 | 1 | 24/10 | 2026-07-23 | true |
| 13 (Lam. 4+4 Verde) | 3300×2250 | 1 | 18/18 | 2026-07-23 | true |
| 13 (Lam. 4+4 Verde) | 3300×2250 | 1 | 18/13 | 2026-07-23 | true |
| 17 (Reflecta 4+4 Incolor) | 3660×2140 | 2 | 17/17 | 2026-07-23 | true |
| 17 (Reflecta 4+4 Incolor) | 3660×2140 | 1 | 17/11 | 2026-07-23 | true |

Todas: `custo_m2 = null`, `dimensao_confirmada = true` (medida real, confirmada fisicamente), `ativo = true`, `pode_rotacionar = true` (padrão), `origem_tipo = 'saldo_inicial'`, `origem_id = null`, `origem_mercadoria = null` (desconhecida pra este reset), `estoque_minimo_chapas = 0`.

`m2_saldo` de cada linha = `chapas_saldo × m2_por_chapa` da medida correspondente (calculado explicitamente no INSERT, não depende de trigger).

### 3. Zerar as 6 caixas/lotes atuais

Não deletar (preserva referências de `estoque_movimentacoes.lote_id`) — `UPDATE lotes_estoque SET chapas_saldo = 0, m2_saldo = 0, ativo = false WHERE id IN (1,2,3,4,5,6)`.

### 4. Atualizar a tabela agregada `estoque`

Totais somados das caixas novas por produto:

| Produto | `chapas_saldo` novo | `m2_saldo` novo |
|---|---|---|
| 10 | 118 (6×17 + 16) | 917,7048 |
| 13 | 31 (18 + 13) | 230,175 |
| 15 | 58 (2×24 + 10) | 430,65 |
| 17 | 45 (2×17 + 11) | 352,458 |
| 21 | 0 | 0 |

Para os produtos 10, 13, 15, 17: `chapas_entrada = chapas_saldo` (novo), `m2_entrada = m2_saldo` (novo), `m2_consumido = 0`, `custo_m2 = 0` (compatível com o custo zerado das caixas). Para o produto 21: todas as colunas acima zeradas. Produtos 18/20 não têm linha na agregada hoje — nenhuma ação (ausência já equivale a zero).

### 5. Auditoria (`estoque_movimentacoes`)

Fora de escopo tentar reconstruir o livro-razão via `registrarMovimentacao` (função de aplicação, não pensada para carga em lote via SQL direto). A migração grava, opcionalmente, 1 linha de `tipo = 'saldo_inicial'` por produto afetado em `estoque_movimentacoes` (sem `lote_id`, já que representa o reset agregado, não uma caixa específica), documentando que o saldo mudou por reset manual — não uma reconstrução linha-a-linha de cada caixa.

## Fora de escopo

- Custo (`custo_m2`) real das caixas — depende da futura importação de XML de nota de entrada (projeto separado).
- Reconciliação retroativa de `estoque_movimentacoes` por caixa individual.
- Qualquer mudança de UI — este sub-projeto é 100% dados (arquivo SQL), a UI já existe (sub-projeto 1: `/estoque/caixas`) e vai simplesmente refletir os dados novos assim que o script rodar.
