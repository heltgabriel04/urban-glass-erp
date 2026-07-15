# Emissão de NF-e — Ler Configuração Fiscal Real — Design

**Origem**: passo 3 do plano do diagnóstico de Reforma Tributária (IBS/CBS)
(artifact `6e93663f-2e88-4632-980e-beb2586cfadd`, 2026-07-15) — pré-requisito
antes de adicionar os campos novos de IBS/CBS, pra não empilhar tributo novo
em cima de uma base que já ignora a configuração fiscal existente. Escopo
definido via brainstorming.

## O achado real

O cadastro de classificação fiscal por produto (`config_fiscal_produtos`,
obrigatório em produtos novos desde a Leva 1 da auditoria ERP) e os
parâmetros da empresa (`config_fiscal_padrao`) **nunca são lidos na hora de
emitir uma NF-e**. Confirmado por busca no código: zero referências a
`ConfigFiscalProduto` dentro de `app/notas`. Existem **3 lugares** com os
mesmos 7 valores fiscais fixos no código (NCM, CFOP dentro/fora, CST-ICMS,
alíquota ICMS dentro/fora, PIS, COFINS):

1. `services/notas.service.ts → emitirNFe` — usada por `app/notas/page.tsx`
   (emissão a partir de um pedido já existente). `codigo_ncm: "70031200"`
   fixo, sempre NCM de vidro laminado, mesmo se o item não for vidro.
2. `services/notas.service.ts → emitirNFeCompleta` — usada por
   `app/notas/nova/page.tsx` (nota manual). Recebe os itens já calculados
   da tela, não recalcula nada sozinha.
3. `app/notas/nova/page.tsx → calcItem` / `preencherDoPedido` — achado
   durante o brainstorm, não estava no diagnóstico original: essa função
   local recalcula ICMS/PIS/COFINS com os mesmos percentuais fixos só pra
   mostrar os valores na tela **antes** de emitir. Ou seja, o que o usuário
   vê pra conferir já está errado, não só o que é enviado pro Focus NFe.

Mudar os parâmetros em `/contabilidade/fiscal-produtos` hoje não afeta a
nota emitida. **Regime tributário confirmado pelo usuário: Lucro Real** —
as alíquotas de PIS/COFINS fixas hoje (1,65%/7,60%, regime não-cumulativo)
já são as corretas pro regime da empresa; o problema é só estarem fixas no
código em vez de configuráveis.

## Decisões confirmadas com o usuário

- Corrigir os **3 lugares juntos** nesta leva (não faseado por tela).
- Corrigir os **7 campos juntos**: NCM/CFOP/CST (têm override real por
  produto) **e** as alíquotas ICMS/PIS/COFINS/IPI (não têm override por
  produto hoje — a tela de produto só exibe o valor herdado do padrão da
  empresa, nunca editável — mas ainda assim estão fixas no código em vez
  de vir de `config_fiscal_padrao`, mesmo bug estrutural).
- Abordagem: **função compartilhada** (`lib/fiscal.ts`), não corrigir cada
  lugar isoladamente nem mover o cálculo pro servidor agora — as duas
  alternativas foram descartadas (a primeira mantém a duplicação que causou
  o bug atual; a segunda exige repensar a tela de revisão e o contrato da
  API, escopo grande demais pra esta leva).

## Arquitetura

Helper novo e puro, `lib/fiscal.ts`:

```ts
export interface ResolucaoFiscalItem {
  ncm: string; cfop: string; cst: string;
  aliq_icms: number; valor_icms: number;
  aliq_pis: number; valor_pis: number;
  aliq_cofins: number; valor_cofins: number;
  aliq_ipi: number; valor_ipi: number;
}

export function resolverFiscalItem(params: {
  produtoId: number | null;
  valorBruto: number;
  dentroEstado: boolean;                          // UF cliente === UF emitente
  ipiPctManual?: number;                           // só emitirNFeCompleta tem IPI por item hoje
  configProdutos: Map<number, ConfigFiscalProduto>; // já buscado, indexado por produto_id
  configPadrao: ConfigFiscalPadrao;
}): ResolucaoFiscalItem
```

**Regra de resolução**: se `produtoId` existir e tiver linha em
`configProdutos`, usa `ncm`/`cfop_dentro ou cfop_fora`/`cst_icms` dessa
linha. Senão, cai pro `configPadrao` (`ncm_padrao`,
`cfop_dentro_padrao`/`cfop_fora_padrao`, `cst_icms_padrao`) — mesmo
comportamento de fallback que a tela de cadastro já usa hoje. Alíquotas
(ICMS/PIS/COFINS/IPI) sempre vêm do `configPadrao`, nunca do produto (não
existe override real de alíquota por produto, ver decisões acima). CFOP
escolhe `cfop_dentro`/`cfop_fora` pelo `dentroEstado`, mesma lógica de UF
que já existe nos 3 lugares hoje (`cliente.uf === UF do emitente`).

`ipiPctManual` cobre o caso de `emitirNFeCompleta`, que hoje permite editar
IPI por item na tela manualmente — não existe fonte de IPI por produto no
cadastro fiscal, então esse valor continua vindo do formulário, não do
`resolverFiscalItem`. Quando omitido (fluxo de `emitirNFe`, que não tem
campo de IPI hoje), assume `0`.

Internamente, `resolverFiscalItem` é composto de 2 funções menores,
também exportadas (a tela precisa só da segunda em alguns pontos, ver
abaixo):

```ts
export function resolverClassificacaoFiscal(
  produtoId: number | null, dentroEstado: boolean,
  configProdutos: Map<number, ConfigFiscalProduto>, configPadrao: ConfigFiscalPadrao
): { ncm: string; cfop: string; cst: string }

export function calcularTributosItem(
  valorBruto: number, ipiPct: number, dentroEstado: boolean, configPadrao: ConfigFiscalPadrao
): { aliq_icms: number; valor_icms: number; aliq_pis: number; valor_pis: number;
     aliq_cofins: number; valor_cofins: number; aliq_ipi: number; valor_ipi: number }
```

## Busca de configuração

Função nova em `services/contabilidade.service.ts`:

```ts
export async function getConfigFiscalProdutos(
  produtoIds: number[]
): Promise<Map<number, ConfigFiscalProduto>>
```

Query `.in("produto_id", produtoIds)` — só as linhas relevantes pra nota
atual, não o catálogo inteiro (hoje ~11-15 produtos cadastrados, mas não
faz sentido buscar tudo pra emitir 1 nota). `getConfigPadrao()` já existe,
sem mudança.

## Onde cada call site muda

- **`emitirNFe`**: hoje monta o payload direto de `pedido.itens_pedido`.
  Passa a buscar `getConfigPadrao()` + `getConfigFiscalProdutos(ids)` antes
  de montar o array `items`, chamando `resolverFiscalItem` por item.
- **`emitirNFeCompleta`**: sem mudança de lógica fiscal — já recebe
  `form.itens` prontos, calculados na tela (ver abaixo). Só usa o que vier.
- **`app/notas/nova/page.tsx`**: `preencherDoPedido` busca a config (mesmo
  padrão acima) e chama `resolverFiscalItem` ao montar `itens` a partir do
  pedido, lendo `produto_id` direto de cada `ItemPedido` de origem — não
  precisa persistir esse campo em `ItemNota` (interface local), porque a
  classificação (NCM/CFOP/CST) é resolvida uma única vez na criação do
  item, não recalculada depois. `calcItem`/`atualizarItem` (usados quando
  o usuário edita valor bruto ou % de IPI na tela) param de recalcular
  ICMS/PIS/COFINS com percentual fixo — passam a usar `calcularTributosItem`
  (a metade de `resolverFiscalItem` que não depende de produto, só da
  configuração padrão), que fica disponível como export próprio de
  `lib/fiscal.ts` pra esse caso.

## Tratamento de erro

**Revisto durante o plano de implementação** (achado ao olhar o código real
de `getConfigPadrao`): a função já existente engole erro de rede/RLS e cai
num fallback (`PADRAO_FALLBACK`, já definida em `services/contabilidade.service.ts`)
que tem **exatamente os mesmos 7 valores hoje fixos no código** que este
projeto está substituindo. Não faz sentido inventar um bloqueio novo com
mensagem de erro quando o fallback já existente reproduz com precisão o
comportamento atual — falha de rede vira "igual a hoje", nunca pior. Por
isso: `getConfigPadrao()` não muda; `getConfigFiscalProdutos()` (função
nova) segue o mesmo padrão — em erro, loga com `console.error` e devolve
`Map` vazio, o que faz todo item cair no fallback do `configPadrao` (sem
override por produto), igual ao comportamento de hoje.

## Fora de escopo

- Regime "Simples Nacional" (`CSOSN`) — empresa é Lucro Real, confirmado; o
  payload continua enviando `icms_situacao_tributaria` do jeito que já
  envia hoje, sem branch pra CSOSN. Limitação pré-existente, não é
  regressão desta leva.
- Campos de IBS/CBS em si — passo 5 do plano maior, depois da resposta do
  suporte da Focus NFe (passo 2, em andamento pelo usuário).
- Persistir item da nota de venda no banco (passo 4 do plano maior) — esta
  leva troca só o que é *calculado/enviado*, não cria persistência nova.
- Qualquer mudança em `documentos_fiscais` (lado compra) — já lê dado real
  hoje, não faz parte deste achado.
- O `"MG"` fixo no código que decide `dentroEstado` (comparação de UF do
  cliente contra a UF do emitente, hoje hardcoded como string literal em
  vez de vir de `EMITENTE_UF`) **não muda nesta leva** — é um hardcode
  adjacente, mas não é um dos 7 campos fiscais do escopo combinado. Fica
  registrado aqui só pra quem for implementar não presumir que também
  está incluído.

## Teste

`lib/fiscal.test.ts` (vitest, padrão já usado no repo — ver
`services/cartoes.service.test.ts`, `lib/importXmlCompra.test.ts`) cobrindo:
produto com override completo; produto sem override (cai pro padrão); item
sem `produto_id` (avulso); CFOP dentro vs fora mudando NCM/CST quando o
produto tem valores diferentes pra cada caso; configuração padrão ausente
(edge case de erro).

Sem acesso a Supabase real disponível nesta sessão (mesma limitação
recorrente do projeto) — validação de ponta a ponta fica pro usuário:
emitir uma nota de teste em homologação e conferir que o NCM/CFOP/CST/
alíquotas na nota emitida batem com o cadastro do produto usado, e que a
tela de revisão (antes de emitir) já mostra os valores certos.
