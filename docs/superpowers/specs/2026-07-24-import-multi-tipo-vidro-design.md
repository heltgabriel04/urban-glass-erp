# Mapear produto por tipo de vidro na importação (planilha/PDF)

**Data:** 2026-07-24

## Contexto

Ao importar medidas via PDF "Relação de Vidros" de terceiro, planilha, ou PDF
já exportado pelo próprio sistema, os modais de importação (`ImportarMedidasModal`,
`ImportarPdfModal`) oferecem um único controle "substituir produto de todos os
itens por X" — um valor aplicado a **todas** as linhas importadas de uma vez.

Quando o arquivo importado tem mais de um tipo de vidro (comum em obras reais:
um pedido do cliente frequentemente mistura, por exemplo, "Laminado Refletivo
8mm" com "Temperado Incolor 10mm" no mesmo arquivo), não existe forma de mapear
cada tipo para o produto correto do sistema — o único controle força o mesmo
produto em tudo, ou nada (deixando o produto em branco em todas as linhas para
ajuste manual depois, um por um, na tabela de itens).

## Objetivo

Quando o arquivo importado contém 2+ tipos de vidro distintos, mostrar um
seletor de produto **por tipo detectado**, não um único seletor global. Quando
há só 1 tipo (ou nenhum foi detectado, caso comum de planilhas sem essa coluna),
mantém o comportamento atual (um seletor único) — sem adicionar seleção por
item individual, que seria inviável para arquivos com dezenas de linhas.

## Extração do "tipo" por fonte

### PDF "Relação de Vidros" (terceiro) — `lib/importPdfRelacaoVidros.ts`

Confirmado empiricamente (célula por célula, PDF real do usuário): a linha de
dados tem sempre `[item, código, largura, altura, quantidade, tipo_de_vidro,
(obs opcional), m²]` — o texto do tipo de vidro vem inteiro numa única célula,
sempre no índice 5 (logo após quantidade), independente de a coluna OBS estar
preenchida ou não (OBS ficaria entre o tipo e o m², nunca antes). `interpretarLinha`
passa a capturar `cells[5]` como `tipo` (`string | undefined` — omitido se a
linha não tiver essa célula, embora isso não deva acontecer no formato real).

### Planilha (.xlsx/.xls/.csv) — `lib/importPlanilhaMedidas.ts`

Detecta uma coluna de cabeçalho contendo "tipo", "produto" ou "vidro" (mesmo
padrão de correspondência por substring já usado para achar "código"/"largura"/
"altura"/"quantidade" — case-insensitive, sem acento). Se a planilha não tiver
essa coluna (caso comum), `tipo` fica `undefined` em todas as linhas — o
comportamento cai automaticamente no caso "1 tipo" (seletor único, como hoje).

### PDF já exportado pelo próprio sistema — `lib/importPdfOrcamento.ts` / `ImportarPdfModal`

Já extrai `produto_nome` por item (usado hoje só para exibir "produto(s)
detectado(s)"). Nenhuma mudança de parser — o `produto_nome` já detectado passa
a ser o "tipo" para fins de agrupamento.

## Novo campo em `MedidaImportada`

```ts
export interface MedidaImportada {
  largura: number;
  altura: number;
  quantidade: number;
  codigo?: string;
  tipo?: string; // NOVO — texto do tipo/produto detectado na origem, quando existir
}
```

`ItemPdfImportado` (`lib/importPdfOrcamento.ts`) já tem `produto_nome: string`
— não precisa de campo novo, só passa a ser tratado como "tipo" para agrupamento
no modal.

## UI dos modais

Em ambos os modais, depois de ler o arquivo:

```ts
const tiposDistintos = [...new Set(itens.map(i => i.tipo /* ou produto_nome */).filter((t): t is string => !!t))];
```

- **`tiposDistintos.length <= 1`**: mantém o seletor único atual, sem nenhuma
  mudança visual (cobre planilha sem coluna de tipo, e PDFs — de terceiro ou do
  próprio sistema — com um só tipo, que é o caso mais comum).
- **`tiposDistintos.length >= 2`**: substitui o seletor único por uma lista de
  seletores, um por tipo detectado, rótulo = o texto exato encontrado (ex.:
  "Laminado Refletivo, 8mm"), cada um com a mesma lista de produtos do sistema
  para escolher. Estado local: `Map<string, number | null>` (tipo → produto
  escolhido), inicializado vazio (nenhuma pré-seleção — força o usuário a
  decidir conscientemente cada tipo, evita repetir o erro atual de "aplicar
  errado pra tudo" por padrão).
- Itens cujo `tipo` não bate com nenhuma chave do mapa (não deve acontecer,
  mas por segurança) usam o mesmo fallback que já existe hoje quando nenhum
  produto foi escolhido (detecção automática por nome, no caso do PDF do
  próprio sistema; produto em branco, no caso de planilha/Relação de Vidros).

## Assinatura do callback `onImportar`

Muda de `(itens, produtoOverride: number | null)` para
`(itens, overridesPorTipo: Map<string, number | null>)` nos dois modais.

Resolução do produto por item, no handler consumidor:
- **Mapa com exatamente 1 entrada** (caso de 0 ou 1 tipo distinto detectado —
  o modal só monta o seletor único nesse caso): aplica o valor dessa única
  entrada a **todos** os itens, igual ao comportamento atual — não depende do
  `tipo` do item bater com a chave (planilha sem coluna de tipo tem todo
  `item.tipo === undefined`, então casar por chave exata não funcionaria).
- **Mapa com 2+ entradas**: busca por `item.tipo` exato no mapa; se não achar
  (não deve acontecer, mas por segurança), cai no mesmo fallback que já existe
  hoje quando nenhum produto foi escolhido (detecção automática por nome no
  caso do PDF do próprio sistema; produto em branco no caso de planilha/Relação
  de Vidros).

## Handlers consumidores (4 pontos, mesma mudança em cada)

- `app/pedidos/novo/page.tsx`: `handleImportarMedidas`, `handleImportarPdf`
- `app/orcamentos/novo/page.tsx`: `handleImportarMedidas`, `handleImportarPdf`

Cada um resolve o `produto_id` por item usando a regra acima em vez do valor
único, mantendo o resto da lógica (auto-detecção por nome no caso do PDF do
sistema, back-cálculo de `valor_m2` pelo total do PDF, etc.) inalterada — só a
origem do `produtoId`/`prodId` por item muda.

## Fora de escopo

- Seleção de produto por item individual (linha a linha) — não pedido, e ruim
  para arquivos com muitas linhas.
- Editar produto em massa na tabela de itens já importada (fluxo já existente,
  não mexido).
- Detecção de tipo em outros formatos de PDF de terceiro além de "Relação de
  Vidros" (não existe outro formato suportado hoje).

## Teste manual

1. Importar o PDF real do usuário (`1000 - L8 - Relação de Vidros_Abrita.pdf`,
   depois do fix de DOMMatrix/worker) — todas as 55 linhas têm o mesmo tipo
   ("Laminado Refletivo, 8mm"), então deve aparecer o seletor único, sem
   mudança visual.
2. Criar uma planilha de teste com 2 tipos diferentes numa coluna "Tipo" —
   confirmar que aparecem 2 seletores, rótulos corretos, e que cada item recebe
   o produto do seletor correspondente ao seu tipo.
3. Testar planilha sem coluna de tipo — confirma que continua com seletor
   único (nada quebrou pro caso comum).
