# Otimizador — Fase 6: Set-Partitioning sobre Pool de Padrões — Design

## Contexto

Continuação do projeto do motor guilhotina (ver memória `project-otimizador-guilhotina`): no benchmark real P-058+P-059 (417 peças, 226.324 m², Laminado 4+4, chapa 3300×2250), o motor atual fecha em **34 chapas / 89.65%** contra **33 / 92.4%** do Corte Certo. O gap de 1 chapa é estrutural: todas as variantes de racionamento/perturbação convergem pra soluções com um "rabo" de chapas a 82-84% no final. Esta melhoria foi encomendada pelo usuário em 2026-07-07 ("possivelmente vou querer essa melhoria mais para frente") e agora foi pedida explicitamente.

**Por que heurística construtiva não fecha:** cada rodada do GRASP (fase 5) produz uma solução inteira, e rodadas diferentes produzem chapas individuais excelentes que nunca aparecem juntas. Fechar a última chapa exige **atribuição global** — escolher a melhor combinação de padrões de chapa vindos de rodadas diferentes.

**Ponto de partida no código:** `lib/otimizador.ts` já tem o esqueleto do pool de padrões (linhas ~1120-1140: `PadraoChapa`, `tipoDe`, `poolPadroes`, `poolAdd`, `POOL_MIN_FILL = 85%`), escrito numa sessão anterior, mas é **código morto** — `poolAdd` nunca é chamado e a fase 6 não existe.

## Arquitetura (3 componentes)

### 1. Alimentar o pool

Mover o bloco do pool para antes da definição de `avaliar()` (hoje está entre as fases 4 e 5) e chamar `poolAdd(sheets)` dentro de `avaliar()`. Efeito: todas as fases (1-5, incluindo cada iteração do GRASP) depositam automaticamente no pool cada chapa com fill ≥ 85%, deduplicada pela composição canônica (multiconjunto de medidas `min×max` — peças de dimensões iguais são geometricamente intercambiáveis). Num run de 10s (`TEMPO_CALCULO_MS`), o pool acumula milhares de padrões distintos sem custo relevante (hash + insert).

Ajuste na chave de tipo: incluir a trava de rotação (`podeRotacionar === false` → sufixo na chave), para que uma peça direcional nunca seja atribuída a um slot que o layout usa rotacionado.

### 2. Seleção por cobertura (fase 6 propriamente dita)

Nova fase depois do bloco do GRASP, com orçamento próprio: o GRASP encolhe de 95% → 80% do tempo total; a fase 6 fica com a janela 80% → ~97%.

Algoritmo — guloso randomizado com restarts:
1. **Demanda**: contagem das peças reais por tipo canônico.
2. Cada restart percorre os padrões do pool (ordenados por área útil desc) e aplica um padrão enquanto a composição dele couber na demanda restante (`counts ≤ remaining` para todos os tipos). Perturbação aleatória (LCG com seed determinística, mesmo padrão das fases 2 e 5) decide ocasionalmente pular um padrão ou parar de repeti-lo — cada restart explora uma mistura diferente.
3. **Resíduo**: as peças que sobraram são empacotadas com `hffGreedyBestSheet` com parâmetros default (o construtor mais forte; rápido o suficiente pra rodar a cada restart).
4. Total do restart = padrões selecionados + chapas do resíduo. Guarda a melhor combinação entre todos os restarts; no final, `avaliar()` compara com o melhor das fases 1-5 — a fase 6 **nunca piora** o resultado.

### 3. Materialização

Cada padrão selecionado carrega um layout concreto (`SheetState` de quando foi visto). Materializar = re-mapear cada peça do layout para um índice real ainda não usado do mesmo tipo canônico (o `pedidoId` da etiqueta segue a peça atribuída — peças de mesmas dimensões de pedidos diferentes são intercambiáveis, e a etiqueta sai certa porque segue o índice atribuído). Layouts vêm de construções guilhotina das fases 1-5, então a garantia de guilhotinabilidade se preserva por construção; `derivarCortes` continua validando no app.

## Testabilidade

Os helpers da fase 6 viram funções puras exportadas de `lib/otimizador.ts` (testáveis no vitest, environment node):
- chave canônica de tipo (dimensões + trava de rotação);
- seleção gulosa de cobertura (pool + demanda → padrões selecionados + resíduo);
- materialização (padrões + peças reais → chapas com índices reais, sem reuso de índice).

O benchmark existente (`lib/otimizador.bench.test.ts`, fixture com as 417 peças reais) é o critério de aceitação.

## Critério de sucesso

- **Alvo:** 33 chapas no benchmark (empate com o Corte Certo).
- **Trava de regressão:** o bench mantém `expect(chapas.length).toBeLessThanOrEqual(34)`; só aperta pra `≤33` se o alvo for alcançado.
- Honestidade sobre o risco: o platô é estrutural e não há garantia de fechar a 33ª chapa na primeira versão do guloso. Se não fechar, os botões de iteração ficam na função de score da seleção (ex.: privilegiar padrões que preservam complementos escassos — o mesmo insight do `lambdaCurtas` da fase 5). A decisão de até onde iterar é tomada olhando o resultado do bench.
- Determinismo preservado: mesma entrada → mesmo plano (seeds fixas, sem `Math.random`).

## Fora de escopo

- LP relaxado / geração de colunas formal — overkill pra v1; o guloso randomizado sobre um pool grande é a versão pragmática do mesmo princípio.
- As outras pendências do otimizador (Web Worker, borda lembrada, chapa por produto do cadastro) — o usuário escolheu explicitamente só o set-partitioning nesta rodada.
- Mudanças de UI — a fase 6 é interna ao motor; a tela do otimizador não muda.
