# Aba "Perda de Vidro" em Documentos Fiscais — Design

## Contexto

O relatório mensal de perda de vidro por tipo já existe no banco desde
[[project-controle-perda-vidro]] (`vw_perda_mensal_vidro`, unindo `quebras`
+ `otimizacao_perda_detalhe` + `retalhos`), mas nenhuma tela consome essa
view — hoje só é possível olhar rodando SQL direto no Supabase.

A página `app/contabilidade/documentos/page.tsx` (Documentos Fiscais) já
tem uma aba **"Perda"**, mas ela é outra coisa: uma lista manual de
`documentos_fiscais` (tipo `perda`) digitados um a um pelo usuário — não
tem relação automática com `vw_perda_mensal_vidro`.

O usuário quer visualizar facilmente, por mês, quanto de cada tipo de
vidro teve perda, especificamente pra decidir o que declarar na hora de
emitir a NF de perda mensal.

## Objetivo

Uma aba nova, **"Perda de Vidro"**, dentro de Documentos Fiscais, que:

1. Mostra os últimos 12 meses de perda por tipo de vidro (m² e valor
   total), lendo direto de `vw_perda_mensal_vidro`.
2. Tem um atalho por mês que já abre o modal existente de "Nova NF Perda"
   pré-preenchido com os totais consolidados daquele mês (todos os tipos
   de vidro juntos numa nota só), pra economizar redigitação na hora de
   emitir.

Fora desta aba, nada muda: a aba "Perda" manual continua exatamente como
está, inclusive recebendo os documentos criados pelo atalho.

## Mudança 1 — tipo `PerdaMensalVidro`

Em `types/index.ts`, ao lado de `OtimizacaoPerdaDetalhe`:

```ts
export interface PerdaMensalVidro {
  produto_id: number | null;
  produto_nome: string;
  mes_referencia: string; // timestamp truncado no mês (date_trunc), ex. "2026-07-01T00:00:00"
  m2_perda_otimizacao: number;
  valor_perda_otimizacao: number;
  m2_perda_incidente: number;
  valor_perda_incidente: number;
  m2_perda_total: number;
  valor_perda_total: number;
  m2_retalho_salvo: number;
}
```

Não entra no bloco `Database` de `types/index.ts` (é uma `view`, não uma
tabela — o padrão do projeto só lista tabelas ali; a leitura usa
`supabase.from("vw_perda_mensal_vidro").select("*")` tipado via `as
PerdaMensalVidro[]`, igual a outras views do projeto).

## Mudança 2 — `getPerdaMensalVidro()`

Nova função em `services/contabilidadeDocumentos.service.ts` (mesmo
arquivo das outras funções de Documentos Fiscais):

```ts
export async function getPerdaMensalVidro(): Promise<PerdaMensalVidro[]> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 11);
  desde.setDate(1);
  const { data, error } = await supabase
    .from("vw_perda_mensal_vidro")
    .select("*")
    .gte("mes_referencia", desde.toISOString().slice(0, 10))
    .order("mes_referencia", { ascending: false })
    .order("m2_perda_total", { ascending: false });
  if (error) { console.error("getPerdaMensalVidro:", error); return []; }
  return data as PerdaMensalVidro[];
}
```

Filtra últimos 12 meses (a partir do primeiro dia do mês, 11 meses atrás)
pra não devolver histórico ilimitado. Ordena por mês decrescente e, dentro
do mês, por maior perda primeiro.

## Mudança 3 — aba nova na página

Em `app/contabilidade/documentos/page.tsx`:

- `AbaDocumentos` ganha `"perda_vidro"`.
- `SUB_ABAS` ganha `{ id: "perda_vidro", label: "Perda de Vidro" }`, logo
  depois de `"perda"`.
- `mostraNovo` passa a ser `aba !== "saida" && aba !== "perda_vidro"` —
  essa aba não tem seletor de mês/ano nem botão "+ Novo" no topo (mostra
  os 12 meses de uma vez; a única ação de escrita é o atalho por mês,
  mudança 5).
- `load()` ganha um branch: quando `aba === "perda_vidro"`, chama
  `getPerdaMensalVidro()` e guarda em novo state `perdaVidro:
  PerdaMensalVidro[]`. Diferente das outras abas, esse `load()` não deve
  re-disparar quando `ano`/`mes` mudam (a aba ignora esses states) — o
  `useEffect` de carga já depende de `[aba, ano, mes]`; como a aba não usa
  `ano`/`mes` pra filtrar, chamadas extras ao trocar mês/ano enquanto essa
  aba está aberta são inofensivas (mesmo resultado), não vale a pena
  complicar as dependências do effect por isso.
- Render: quando `aba === "perda_vidro"`, renderiza `<SecaoPerdaVidro
  itens={perdaVidro} usuarioEmail={usuarioEmail} onGerarNf={...} />` em
  vez de `SecaoDocumentos`.

## Mudança 4 — componente `SecaoPerdaVidro`

Novo componente na mesma página (padrão dos outros `Secao*` já no
arquivo). Agrupa `itens: PerdaMensalVidro[]` por `mes_referencia` (já vem
ordenado do service, então é um `groupBy` simples preservando ordem).

Por grupo de mês:

```
Julho/2026                              [Gerar NF do mês]
┌─────────────────────┬────────────┬──────────────┐
│ Tipo de Vidro        │ m² Perdido │ Valor Perdido│
├─────────────────────┼────────────┼──────────────┤
│ Incolor 4mm          │   12,30    │  R$ 450,00   │
│ Verde 6mm            │    5,20    │  R$ 200,00   │
├─────────────────────┼────────────┼──────────────┤
│ Total do mês         │   17,50    │  R$ 650,00   │
└─────────────────────┴────────────┴──────────────┘
```

- Colunas: só `produto_nome`, `m2_perda_total` (2 casas), `valor_perda_total`
  (`formatBRL`) — sem separar otimização/incidente/retalho salvo (decisão
  do usuário: só totais).
- Linha de subtotal do mês soma `m2_perda_total`/`valor_perda_total` de
  todas as linhas daquele mês.
- Se `itens.length === 0`: mesmo padrão vazio das outras seções
  (`"Nenhuma perda registrada nos últimos 12 meses."`).
- Nome do mês formatado por extenso (reaproveitar array `MESES` já
  existente no arquivo + o ano de `mes_referencia`).

## Mudança 5 — "Gerar NF do mês" (NF consolidada)

Ao clicar, monta um objeto de pré-preenchimento a partir das linhas
daquele mês e abre o `ModalDocumento` (tipo `perda`) já existente:

```ts
function montarPrefillNfMes(linhas: PerdaMensalVidro[]): Partial<DocumentoFiscalInsert> {
  const m2Total = linhas.reduce((s, l) => s + l.m2_perda_total, 0);
  const valorTotal = linhas.reduce((s, l) => s + l.valor_perda_total, 0);
  return {
    material: linhas.map(l => l.produto_nome).join(", "),
    quantidade: Number(m2Total.toFixed(2)),
    valor_total: Number(valorTotal.toFixed(2)),
    observacoes: linhas.map(l =>
      `${l.produto_nome}: ${l.m2_perda_total.toFixed(2)} m² – ${formatBRL(l.valor_perda_total)}`
    ).join("\n"),
  };
}
```

`motivo` fica de fora do prefill (obrigatório no form, usuário digita algo
como "Perda de corte consolidada do mês" antes de salvar — texto livre,
não vale a pena adivinhar).

**`ModalDocumento` ganha uma prop nova, `valoresIniciais?:
Partial<DocumentoFiscalInsert>`:**

```ts
const base = editando ?? { ...docVazio(tipo, ano, mes), ...valoresIniciais };
```

Só se aplica quando `editando` é `null` (criação nova) — abrir o atalho
nunca edita um documento existente, sempre cria um novo. `competencia_mes`
e `competencia_ano` do prefill vêm do mês do grupo clicado (não do
mês/ano global da página, que essa aba ignora).

Fluxo: clique em "Gerar NF do mês" → `setEditando(null)` →
`setValoresIniciais(montarPrefillNfMes(linhasDoMes))` →
`setModalAberto("perda")`. Usuário revisa (pode editar qualquer campo,
inclusive material/observações/motivo) e salva normalmente pelo
`criarDocumentoFiscal` já existente — o documento resultante aparece
tanto no histórico quanto na aba "Perda" manual, sem tabela nova.

## Fora de escopo (YAGNI)

- Nenhuma edição da view `vw_perda_mensal_vidro` — spec anterior já
  resolveu a modelagem de dados, esta spec é só a camada de exibição.
- Nenhum filtro por ano/tipo de vidro nesta primeira versão — janela fixa
  de 12 meses, sem paginação. Se o usuário precisar de mais histórico
  depois, é ajuste pontual (mudar o `setMonth(-11)`), não replanejar a
  tela.
- Nenhuma exclusão/edição de linhas da tabela de perda mensal — é
  somente-leitura (os dados vêm de `quebras`/`otimizador`/`retalhos`,
  editados nas próprias telas de origem).
- Nenhuma vinculação entre o documento fiscal gerado pelo atalho e as
  linhas de origem (`quebras`/`otimizacao_perda_detalhe`) — o documento
  fiscal registra o consolidado como texto (`observacoes`), não guarda
  FK pra cada linha. Rastreabilidade fica no texto, suficiente pro caso de
  uso (emitir a nota), sem modelo de rateio.
- Nenhuma separação entre perda de otimização vs. incidente na tela —
  decisão do usuário, só totais.

## Testes

Sem teste automatizado novo (mesmo padrão do resto do projeto — depende
de Supabase). Verificação via `npx tsc --noEmit`.

Validação manual do usuário, depois de implementado: abrir a aba "Perda de
Vidro", conferir que os meses batem com o que `select * from
vw_perda_mensal_vidro` mostra direto no Supabase, clicar em "Gerar NF do
mês" num mês com mais de um tipo de vidro e conferir que
quantidade/valor/observações vêm somados e discriminados corretamente
antes de salvar.
