# Estoque por Caixa — Sub-projeto 2: Carga real do estoque atual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o estoque atual (lotes_estoque + agregado `estoque`) pela contagem física real informada pelo usuário, organizada em caixas rastreáveis.

**Architecture:** Um único script SQL (`sql/carga-estoque-caixas-2026-07-23.sql`), rodado manualmente pelo usuário no Supabase SQL Editor — nenhuma execução automática contra o banco. Sem mudança de código de aplicação; a UI (`/estoque`, `/estoque/caixas`) já existe (sub-projeto 1) e reflete os dados novos assim que o script rodar.

**Tech Stack:** SQL puro (PostgreSQL / Supabase).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-23-carga-estoque-caixas-design.md`.
- O script é escrito e commitado, **nunca executado diretamente contra o banco de produção** por quem implementa este plano — é o usuário quem roda no Supabase SQL Editor.
- Zerar (via `UPDATE ... SET ativo=false`), nunca deletar linhas de `lotes_estoque` — preserva referências de `estoque_movimentacoes.lote_id`.
- Todos os valores numéricos (chapas, m², datas) vêm exatamente da spec — sem arredondamento além do já especificado (4 casas decimais em m²).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `sql/carga-estoque-caixas-2026-07-23.sql` | criar | migração de dados única: zera caixas antigas, insere 15 caixas novas, atualiza agregado `estoque`, registra ajuste na auditoria |

---

### Task 1: Script SQL de carga do estoque

**Files:**
- Create: `sql/carga-estoque-caixas-2026-07-23.sql`

**Interfaces:** nenhuma (script de dados, sem código de aplicação consumindo/produzindo interface).

- [ ] **Step 1: Escrever o script completo**

```sql
-- ============================================================
-- Carga real do estoque de vidro (2026-07-23) — substitui o
-- estoque atual (lotes_estoque + agregado estoque) pela contagem
-- física real informada pelo usuário, organizada em caixas.
-- Sub-projeto 2 de 3 (ver docs/superpowers/specs/2026-07-23-carga-estoque-caixas-design.md).
-- Execute no Supabase SQL Editor.
-- ============================================================

-- ── 1. Zera as 6 caixas/lotes atuais (não deleta — preserva
--       referências de estoque_movimentacoes.lote_id) ──────────
UPDATE lotes_estoque
SET chapas_saldo = 0, m2_saldo = 0, ativo = false
WHERE id IN (1, 2, 3, 4, 5, 6);

-- ── 2. Insere as 15 caixas novas ────────────────────────────
-- Laminado 4+4 Incolor (produto 10) — 3660×2140, 6 caixas fechadas
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
SELECT 10, 'saldo_inicial', 3660, 2140, 17, 17, 17 * 7.8324, NULL, '2026-07-21', false, true, true
FROM generate_series(1, 6);

-- Laminado 4+4 Incolor (produto 10) — 3300×2250, 1 caixa aberta (16/18)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (10, 'saldo_inicial', 3300, 2250, 18, 16, 16 * 7.425, NULL, CURRENT_DATE, true, true, true);

-- Laminado 3+3 Incolor (produto 15) — 3300×2250, 2 caixas fechadas
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
SELECT 15, 'saldo_inicial', 3300, 2250, 24, 24, 24 * 7.425, NULL, CURRENT_DATE, true, true, true
FROM generate_series(1, 2);

-- Laminado 3+3 Incolor (produto 15) — 3300×2250, 1 caixa aberta (10/24)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (15, 'saldo_inicial', 3300, 2250, 24, 10, 10 * 7.425, NULL, CURRENT_DATE, true, true, true);

-- Laminado 4+4 Verde (produto 13) — 3300×2250, 1 caixa fechada
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (13, 'saldo_inicial', 3300, 2250, 18, 18, 18 * 7.425, NULL, CURRENT_DATE, true, true, true);

-- Laminado 4+4 Verde (produto 13) — 3300×2250, 1 caixa aberta (13/18)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (13, 'saldo_inicial', 3300, 2250, 18, 13, 13 * 7.425, NULL, CURRENT_DATE, true, true, true);

-- Reflecta 4+4 Incolor (produto 17) — 3660×2140, 2 caixas fechadas
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
SELECT 17, 'saldo_inicial', 3660, 2140, 17, 17, 17 * 7.8324, NULL, CURRENT_DATE, true, true, true
FROM generate_series(1, 2);

-- Reflecta 4+4 Incolor (produto 17) — 3660×2140, 1 caixa aberta (11/17)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (17, 'saldo_inicial', 3660, 2140, 17, 11, 11 * 7.8324, NULL, CURRENT_DATE, true, true, true);

-- ── 3. Atualiza a tabela agregada `estoque` (ainda lida por
--       app/estoque/page.tsx) — trata como saldo inicial novo,
--       não soma ao histórico antigo ───────────────────────────
UPDATE estoque SET
  chapas_entrada = 118, m2_entrada = 917.7048,
  chapas_saldo   = 118, m2_saldo   = 917.7048,
  m2_consumido   = 0,   custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 10;

UPDATE estoque SET
  chapas_entrada = 31, m2_entrada = 230.175,
  chapas_saldo   = 31, m2_saldo   = 230.175,
  m2_consumido   = 0,  custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 13;

UPDATE estoque SET
  chapas_entrada = 58, m2_entrada = 430.65,
  chapas_saldo   = 58, m2_saldo   = 430.65,
  m2_consumido   = 0,  custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 15;

UPDATE estoque SET
  chapas_entrada = 45, m2_entrada = 352.458,
  chapas_saldo   = 45, m2_saldo   = 352.458,
  m2_consumido   = 0,  custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 17;

UPDATE estoque SET
  chapas_entrada = 0, m2_entrada = 0,
  chapas_saldo   = 0, m2_saldo   = 0,
  m2_consumido   = 0, custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 21;

-- ── 4. Auditoria — 1 linha por produto afetado em
--       estoque_movimentacoes, registrando o delta do reset
--       (positivo = estoque novo maior que o antigo) ───────────
INSERT INTO estoque_movimentacoes
  (produto_id, tipo, origem_tipo, chapas, m2, saldo_chapas_apos, saldo_m2_apos, obs)
VALUES
  (10, 'saldo_inicial', 'saldo_inicial',  18,  175.2048, 118, 917.7048, 'Recontagem física do estoque — 2026-07-23'),
  (13, 'saldo_inicial', 'saldo_inicial', -123, -913.275,  31, 230.175,  'Recontagem física do estoque — 2026-07-23'),
  (15, 'saldo_inicial', 'saldo_inicial',  20,  148.5,     58, 430.65,   'Recontagem física do estoque — 2026-07-23'),
  (17, 'saldo_inicial', 'saldo_inicial',   6,   42.015,   45, 352.458,  'Recontagem física do estoque — 2026-07-23'),
  (21, 'saldo_inicial', 'saldo_inicial',  -7,  -49.434,    0,   0,      'Recontagem física do estoque — 2026-07-23');

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, codigo, produto_id, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, ativo, dt_entrada, dt_entrada_estimada
--   FROM lotes_estoque WHERE produto_id IN (10,13,15,17) ORDER BY produto_id, id;
-- SELECT produto_id, chapas_saldo, m2_saldo FROM estoque WHERE produto_id IN (10,13,15,17,21) ORDER BY produto_id;
-- SELECT produto_id, tipo, chapas, m2, saldo_chapas_apos, saldo_m2_apos FROM estoque_movimentacoes WHERE origem_tipo = 'saldo_inicial' ORDER BY produto_id;
```

- [ ] **Step 2: Conferir a aritmética do script contra a spec (verificação manual, sem rodar nada)**

Conferir, lendo o próprio arquivo escrito no Step 1, que cada `m2_saldo` bate com `chapas_saldo × m2_por_chapa` da medida:
- 3660×2140 → 7,8324 m²/chapa (17×7,8324=133,1508; 11×7,8324=86,1564)
- 3300×2250 → 7,425 m²/chapa (16×7,425=118,8; 24×7,425=178,2; 10×7,425=74,25; 18×7,425=133,65; 13×7,425=96,525)

E que os totais da Step 3 (agregado) batem com a soma das caixas do mesmo produto na Step 2:
- Produto 10: 6×17 + 16 = 118 chapas; 6×133,1508 + 118,8 = 917,7048 m²
- Produto 13: 18 + 13 = 31 chapas; 133,65 + 96,525 = 230,175 m²
- Produto 15: 2×24 + 10 = 58 chapas; 2×178,2 + 74,25 = 430,65 m²
- Produto 17: 2×17 + 11 = 45 chapas; 2×133,1508 + 86,1564 = 352,458 m²

Expected: todos os valores no arquivo batem com essas contas (já verificado ao escrever este plano — esta é uma conferência de não-regressão, não uma primeira checagem).

- [ ] **Step 3: Commit**

```bash
git add sql/carga-estoque-caixas-2026-07-23.sql
git commit -m "docs: script de carga real do estoque atual (sub-projeto 2 de 3, aguardando execucao manual)"
```

---

### Task 2: Lembrete de execução manual

**Files:** nenhum (task de comunicação, não de código).

- [ ] **Step 1: Avisar o usuário**

Este script precisa ser copiado e executado manualmente pelo usuário no Supabase SQL Editor. Depois de rodar, conferir visualmente em `/estoque` (produto 10 deve mostrar 118 chapas / ~917,70 m², produto 13 = 31/230,18, produto 15 = 58/430,65, produto 17 = 45/352,46, produto 21 = 0) e em `/estoque/caixas` (15 caixas novas ativas, as 6 antigas devem sumir da lista — ficaram `ativo=false`, e a tela hoje não filtra por inativo, então **conferir se `/estoque/caixas` deveria excluir `ativo=false`** — ver nota abaixo).

**Nota de acompanhamento (não é uma task nova, é uma observação a resolver na hora da verificação manual)**: `app/estoque/caixas/page.tsx` (sub-projeto 1) usa `getTodasCaixas()`, que traz **todas** as linhas de `lotes_estoque` sem filtrar `ativo` — então as 6 caixas antigas zeradas (`ativo=false`, saldo 0) vão aparecer na lista como "esgotada" junto com as 15 novas, em vez de somem da tela. Isso é esperado do jeito que a Task 6 do sub-projeto 1 foi implementada (ela não distingue `ativo`) — não é um bug desta migração, mas vale confirmar com o usuário, depois de rodar o SQL, se ele quer que caixas `ativo=false` fiquem ocultas por padrão nessa lista (ajuste pequeno, fora do escopo deste plano).
