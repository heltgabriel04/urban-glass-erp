# Análise de Importações (Contabilidade) — Design

## Contexto

A feature "Custo de Importação por Lote" (2026-07-17,
[[project-custo-importacao-compras]]) deixou o cálculo do custo real de
uma compra importada (câmbio, tributos da DI, creditabilidade) só
visível dentro do formulário "Nova Compra", no momento da criação. Não
existe hoje nenhum lugar pra revisar depois: comparar câmbios usados ao
longo do tempo, ver o total desembolsado/não-recuperável/creditado num
mês, ou conferir uma importação antiga sem abrir a compra e reler os
números um por um.

O usuário pediu uma tela própria de análise. O padrão certo já existe
no sistema: `/contabilidade/estoque` ("Estoque / CMV") é exatamente
esse tipo de tela — análise derivada de dados já lançados noutro
módulo, com seletor de mês/ano, dentro do Contabilidade em vez do
módulo operacional (Compras) onde os dados nascem.

## Achado técnico que molda o design

Os valores calculados (`valorAduaneiroBrl`, `custoDesembolsado`,
`custoNaoRecuperavel`, `creditosTributarios`, `custoM2`) **não são
persistidos** — só os 14 campos brutos da DI ficam em `compras`. Essa
tela recalcula tudo na hora, chamando `calcularCustoImportacao()`
(`lib/custoImportacao.ts`, já existe, com teste) — não duplica lógica,
não inventa uma segunda fórmula.

Como `compras` não tem fluxo de edição (só criar/receber/excluir), o
`custo_unitario_m2` gravado em `compras_itens` no momento do save é
definitivo — pode ter vindo do botão "Aplicar aos itens" (bate com o
calculado) ou de edição manual item a item antes de salvar (pode não
bater). A tela mostra os dois lado a lado.

## Decisões confirmadas com o usuário

1. **Local**: nova aba "Importações" em Contabilidade
   (`/contabilidade/importacoes`), ao lado de "Estoque / CMV" — não em
   Compras.
2. **Conteúdo**: KPIs do período (cards) + lista de compras importadas
   do mês + detalhe expansível por linha. Sem gráfico de câmbio ao
   longo do tempo (fora de escopo, não pedido).
3. **Custo/m² — os dois números lado a lado**: "da DI" (recalculado
   agora) e "aplicado nos itens" (média ponderada do que está de fato
   gravado em `compras_itens.custo_unitario_m2`). Divergência
   sinalizada visualmente — é o tipo de coisa que essa tela existe pra
   pegar, não pra esconder.

## Arquitetura

### Nova função de leitura — `services/compras.service.ts`

```ts
export interface ComprasImportadasFiltro { ano: number; mes: number; }

export async function getComprasImportadas(
  filtro: ComprasImportadasFiltro
): Promise<Compra[]>
```

Busca `compras` com `eh_importacao = true`, `dt_compra` dentro do
mês/ano do filtro (mesmo par `inicioMes`/`fimMes` já usado em
`app/contabilidade/estoque/page.tsx`), `select('*, fornecedores(id,
nome), compras_itens(*)')`, ordenado por `dt_compra desc`. Todos os
status (Rascunho e Recebida) entram — a análise é sobre a DI lançada,
não sobre o recebimento físico.

### Cálculo por linha — feito na própria página (sem novo `lib/`)

Pra cada `Compra` retornada:
- `dadosImportacao: DadosImportacao` — os 11 campos numéricos/boolean
  extraídos direto da `Compra` (já tipados desde a feature anterior).
- `m2Total = compra.compras_itens.reduce((a, i) => a + Number(i.m2), 0)`
- `resumo = calcularCustoImportacao(dadosImportacao, m2Total)`
- `custoAplicado` = média ponderada por m²:
  `compra.compras_itens.reduce((a, i) => a + Number(i.custo_unitario_m2) * Number(i.m2), 0) / m2Total`
  (0 se `m2Total` for 0 — mesma guarda de divisão por zero do resto do
  sistema)
- `diverge = Math.abs(resumo.custoM2 - custoAplicado) > 0.01` (1 centavo
  de tolerância — arredondamento de ponto flutuante não deve acender o
  aviso à toa)

### Página — `app/contabilidade/importacoes/page.tsx`

Estrutura igual à de `app/contabilidade/estoque/page.tsx`: `"use
client"`, `AppLayout` + `ContabilidadeTabs ativo="importacoes"`,
seletor mês/ano no topo (mesmo componente/estilo), `useEffect` recarrega
ao mudar mês/ano.

**KPIs** (3 cards, mesmo estilo dos cards de `/compras`): Desembolsado
Total, Não-Recuperável Total, Créditos Tributários Total — cada um a
soma do respectivo campo de `resumo` em todas as compras do período.

**Lista** (tabela, mais recente primeiro): Data · Fornecedor · Nº DI ·
Status (chip, mesmo `CHIP` de `/compras`) · Câmbio · Valor Aduaneiro ·
Desembolsado · Não-Recuperável · Créditos · Custo/m² (DI) · Custo/m²
(Aplicado) — as duas últimas colunas lado a lado, com destaque visual
(cor de alerta) quando `diverge`.

**Detalhe expansível** (clique na linha, mesmo padrão `Fragment`/linha
expandida de `/compras`): todos os 14 campos de DI — FOB/frete/seguro
USD, câmbio, II/IPI/PIS-COFINS/ICMS/despesas em R$, e as 3 flags de
creditabilidade (como chips "✓ Creditável"/"— Não creditável").

**Vazio**: se não houver compra importada no mês, `EmptyState` (mesmo
componente já usado em `app/dashboard-financeiro/page.tsx`) — "Nenhuma
compra importada neste período."

### `components/contabilidade/ContabilidadeTabs.tsx`

Adiciona `{ label: "Importações", slug: "importacoes" }` ao array
`ABAS`, na posição logo depois de "Estoque / CMV" (mesmo agrupamento
temático — análise de custo). O union type da prop `ativo` ganha
`"importacoes"`.

## Fora de escopo (YAGNI)

- Gráfico de câmbio ao longo do tempo — não pedido.
- Qualquer edição nesta tela — é só leitura; editar uma importação
  continua sendo recriar a compra (limitação já existente, não desta
  feature).
- Ledger de créditos tributários (consumo/compensação) — fase 2 do
  [[project-custeio-precificacao-vidros]], esta tela só soma o bruto
  gerado no período, não controla o que já foi usado.
- Filtro por fornecedor/status — só mês/ano por enquanto, mesmo escopo
  de `/contabilidade/estoque`.

## Testes

Sem teste automatizado pra página nem pro novo `getComprasImportadas`
(nenhuma página nem service de I/O deste projeto tem teste — só
`lib/custoImportacao.ts`, que já está coberto e não muda aqui).
Verificação via `npx tsc --noEmit` e `npm run build`.

Validação manual do usuário: no mês da compra `__teste_*` importada
criada na validação da feature anterior, abrir `/contabilidade/importacoes`
e conferir que os números batem com o que apareceu no formulário de
criação; expandir a linha e conferir os 14 campos; se possível, testar
o caso de divergência (criar uma compra importada onde o custo/m² dos
itens foi editado manualmente depois de "Aplicar aos itens", diferente
do calculado) e confirmar que o aviso visual aparece.
