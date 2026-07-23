# Estoque por Caixa — Sub-projeto 3: Etiquetas de caixa

## Contexto

Sub-projeto 3 de 3 (ver [[project-caixa-estoque-modelo]] / `docs/superpowers/specs/2026-07-23-caixa-estoque-modelo-design.md`). Os sub-projetos 1 (modelo de dado + resolução de caixa) e 2 (carga real do estoque) já estão implementados e pushados. Cada linha de `lotes_estoque` já é uma "caixa física" rastreável, com `codigo` (`CX-000123`) e `qr_token` (usado pela rota pública `app/api/cx/[token]/route.ts`, já existe e funciona).

O pedido original do usuário (verbatim, do briefing que deu origem a todo o projeto):

> Quero implementar um sistema de etiquetas para caixas de vidro, semelhante ao funcionamento atual das etiquetas de retalhos. Permitir gerar etiquetas individualmente (avulsas). Permitir imprimir novamente uma etiqueta sempre que necessário. Cada caixa deverá possuir sua própria etiqueta. A etiqueta deve conter: tipo do vidro, espessura, cor, medida da chapa, quantidade de chapas na caixa, área total da caixa em m² (calculada automaticamente), código/identificação única da caixa, data de entrada (se disponível).

Este sub-projeto entrega exatamente isso, reaproveitando ao máximo o padrão já existente em `app/retalhos/etiquetas/page.tsx` (etiqueta térmica 100×50mm, fluxo de seleção via `sessionStorage`), com uma diferença central: a etiqueta de caixa leva um **QR real e escaneável** (a etiqueta de retalho não tem — é só texto), apontando para a rota pública já construída no sub-projeto 1.

### Estado atual investigado

- `app/estoque/caixas/page.tsx` (sub-projeto 1): lista somente-leitura de todas as caixas, com filtro por produto/status. **Não tem** checkboxes de seleção nem botão de impressão — foi deliberadamente deixado assim, porque a página de etiqueta (este sub-projeto) ainda não existia.
- `app/retalhos/page.tsx` + `app/retalhos/etiquetas/page.tsx`: padrão de referência. A lista tem checkboxes de seleção múltipla; `imprimirSelecionados()` grava os IDs selecionados em `sessionStorage.setItem("retalhos_etiquetas_ids", JSON.stringify(ids))` e navega para a página de impressão, que lê os IDs, busca os registros (`supabase.from("retalhos").select("*").in("id", ids)`, preservando a ordem original de seleção), e renderiza um card por retalho com CSS de impressão térmica (`@page { size: 100mm 50mm landscape; margin: 0 }`, um card por página, cores trocadas por `!important` no `@media print`).
- `Produto` (`types/index.ts`): já tem `tipo`, `espessura`, `cor` como campos de texto livre (ex.: tipo="Laminado", espessura="4+4", cor="Incolor") — usados no cadastro de produto (`app/produtos/page.tsx`).
- `LoteEstoque.produtos` (tipo atual): só tem `{ nome: string } | null` — precisa ser ampliado pra incluir `tipo`/`espessura`/`cor` opcionais, já que a etiqueta precisa desses 3 campos separadamente.
- `app/api/cx/[token]/route.ts` (sub-projeto 1): rota pública já funcional, resolve `qr_token` → HTML com os dados da caixa em tempo real. É o alvo do QR desta etiqueta.

## Decisões de design

1. **Onde entra a seleção**: dentro da própria `/estoque/caixas` (não uma tela nova) — checkboxes por linha + "Selecionar todas"/"Limpar seleção" + "Imprimir selecionadas (N)" no topo, exatamente como `/retalhos` já faz. Além disso, cada linha ganha um botão 🖨 individual — clique único gera a etiqueta só daquela caixa (satisfaz "gerar individualmente/avulsa" sem precisar mexer em checkbox).
2. **Reimpressão**: não existe flag de "já impresa" — mesma filosofia do retalho. Reimprimir é simplesmente repetir a seleção (via checkbox ou o botão 🖨 da linha) e clicar em imprimir de novo, a qualquer momento.
3. **Mapeamento de campos** (pedido → schema real):
   - Tipo do vidro → `produtos.nome` (ex.: "Laminado 4+4 Incolor" — é a string mais parecida com os exemplos que o usuário deu, "Laminado 4+4"/"Laminado Verde 4+4")
   - Espessura → `produtos.espessura` (ex.: "4+4")
   - Cor → `produtos.cor` (ex.: "Incolor")
   - Medida da chapa → `chapa_largura_mm × chapa_altura_mm`
   - Quantidade de chapas na caixa → `chapas_saldo` (quantas **ainda existem**, não quantas entraram — é o número que muda conforme a caixa é consumida)
   - Área total → `m2_saldo` (já é `chapas_saldo × m² por chapa`, não precisa recalcular)
   - Código único → `codigo`
   - Data de entrada → `dt_entrada`, omitida (mostra "—") quando `dt_entrada_estimada = true` (dado incerto não devia parecer um fato na etiqueta impressa)
4. **QR**: real, `qrData = https://urbanglasserp.vercel.app/api/cx/{qr_token}` (mesmo domínio hardcoded que as etiquetas de pedido já usam pro QR de romaneio) — decisão já tomada no sub-projeto 1, este sub-projeto só a implementa na etiqueta em si.
5. **Layout de impressão**: cópia do padrão de `app/retalhos/etiquetas/page.tsx` (100×50mm landscape, toolbar escura com "← Voltar"/filtro/"Imprimir selecionadas", `EtiquetaCard` com QR real em vez do texto "ÁREA").

## Design

### 1. Tipo `LoteEstoque.produtos` ampliado

`types/index.ts` — `produtos?: { nome: string } | null` vira `produtos?: { nome: string; tipo?: string; espessura?: string; cor?: string } | null`. Consumidores existentes (`app/estoque/caixas/page.tsx`, que só lê `.nome`) continuam funcionando sem mudança — é uma ampliação, não uma quebra.

### 2. Nova função de serviço — busca por IDs

`services/lotes.service.ts` ganha `getCaixasPorIds(ids: number[]): Promise<LoteEstoque[]>`, mesmo padrão de `app/retalhos/etiquetas/page.tsx` (busca direta por IDs, sem os filtros de `getLotesUtilizaveis`/`getTodasCaixas`), com `select` incluindo `produtos(nome, tipo, espessura, cor)`.

### 3. `/estoque/caixas` ganha seleção

Checkboxes por linha (estado `Set<number>` de IDs selecionados, todas começam selecionadas — mesmo comportamento de `app/pedidos/[id]/etiquetas/page.tsx`, que já usa exatamente esse padrão: "1 clique em Imprimir continua imprimindo tudo, a seleção só serve pra excluir"), botões "Selecionar todas"/"Limpar seleção" restritos às linhas visíveis (respeitando os filtros de produto/status já existentes), botão "Imprimir selecionadas (N)" que grava os IDs em `sessionStorage.setItem("caixas_etiquetas_ids", ...)` e navega pra `/estoque/caixas/etiquetas`. Botão 🖨 por linha grava só aquele 1 ID e navega igual.

### 4. Nova página de impressão `/estoque/caixas/etiquetas`

Estrutura idêntica a `app/retalhos/etiquetas/page.tsx` (toolbar, CSS de impressão térmica, grid de cards), com o card (`EtiquetaCaixaCard`) mostrando os 8 campos do item "Decisões de design #3" acima e um QR real (`QRCodeSVG`, mesma biblioteca `qrcode.react` já usada em `app/pedidos/[id]/etiquetas/page.tsx`) apontando pra `/api/cx/{qr_token}`.

### 5. Testes

Sem lógica pura nova além do que já existe (`statusCaixa` não é usado aqui). Nenhum teste Vitest novo é esperado — mesmo padrão de `app/retalhos/etiquetas/page.tsx` e `app/pedidos/[id]/etiquetas/page.tsx`, que também não têm suíte dedicada (páginas 100% de apresentação/impressão).

## Fora de escopo

- Qualquer mudança no modelo de dado ou na rota pública do QR (sub-projeto 1, já pronto).
- Impressão em lote automática (ex.: gerar etiqueta sozinha ao criar uma caixa nova) — sempre uma ação explícita do usuário na tela de caixas.
- Código de barras (só QR, como decidido no sub-projeto 1).
