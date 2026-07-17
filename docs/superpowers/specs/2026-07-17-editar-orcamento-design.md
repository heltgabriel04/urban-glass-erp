# Editar Orçamento + Total de m² no PDF — Design

## Contexto

Hoje `orcamentos` só pode ser alterado em dois pontos estreitos:
`updateOrcamento()` (em `services/orcamentos.service.ts`) é chamado
apenas para trocar `status` (Enviado/Rascunho), anexar/remover o
arquivo assinado pelo cliente, e por `aprovarOrcamento()`/
`rejeitarOrcamento()`. Não existe nenhuma tela para alterar cliente,
itens, forma de pagamento, frete, desconto, data de entrega ou
observações depois que o orçamento já foi criado — pra corrigir
qualquer coisa hoje seria preciso apagar e recriar.

O pedido já resolve esse problema com uma página dedicada,
`app/pedidos/[id]/editar/page.tsx`. Ela é o padrão que o orçamento vai
seguir. (O pedido também tem um SEGUNDO editor, um modal embutido em
`app/pedidos/[id]/page.tsx` — esse modal já causou um bug real onde
ficava com `valor_ipi` desatualizado em relação à página `/editar`,
corrigido em 2026-07-17. O orçamento não vai repetir esse padrão: só
uma tela de edição.)

Separadamente, o PDF impresso do orçamento (botão "⎙ PDF" em
`/orcamentos/[id]`) lista o m² de cada item na coluna "Medida", mas
nunca soma um total — só o "VALOR TOTAL" em reais aparece, numa caixa
separada. O usuário quer o total de m² (ou ml) logo abaixo do último
item, na mesma coluna.

## Decisões confirmadas com o usuário

1. **Uma só tela de edição** — página dedicada `/orcamentos/[id]/editar`,
   sem modal embutido na tela de detalhe (evita o risco de divergência
   que o pedido teve).
2. **Tudo é editável**: cliente, itens (dimensões, quantidade, valor/m²,
   lapidação — incluindo adicionar/remover itens), forma de pagamento,
   parcelas, frete, desconto, data de entrega, observações.
3. **Sem bloqueio por status** — editável em Rascunho, Enviado, Aprovado
   ou Rejeitado, sem exceção.
4. **Total de m² no PDF**: uma linha extra na própria tabela de itens,
   logo após o último item, alinhada na coluna "Medida" — não uma caixa
   separada.

## Por que a edição do orçamento é mais simples que a do pedido

Um orçamento nunca gera `lancamentos` (contas a receber) — isso só
acontece quando ele é aprovado e vira pedido (`aprovarOrcamento()`,
`services/orcamentos.service.ts:103-198`, que cria os `lancamentos` a
partir de `datas_pgto`/`valores_pgto` calculados na hora). O orçamento
em si não guarda cronograma de parcelas — `orcamentos.parcelas` é só
uma contagem (usada como `orc.parcelas}× de {formatBRL(orc.valor_total
/ orc.parcelas)}` no PDF), não uma lista de datas/valores.

Isso significa que editar um orçamento não precisa reconciliar nenhum
lançamento financeiro — só regravar a própria linha de `orcamentos` e
os `itens_orcamento`. Bem mais simples que `salvarEdicao()` do pedido,
que precisa deletar/recriar lançamentos "A Receber" a cada edição.

## Arquitetura

### Página nova: `app/orcamentos/[id]/editar/page.tsx`

Estrutura de formulário igual à `app/pedidos/[id]/editar/page.tsx`
(mesmos componentes: `Campo`, `AutocompleteInput`, `CurrencyInput`,
`DateInput`, tabela de itens editável inline com adicionar/remover
linha) — sem replicar a lógica de parcelas/lançamentos do pedido, que
não se aplica aqui.

**Campos do formulário** (nomes conforme já usados em
`createOrcamento()`, `app/orcamentos/novo/page.tsx:476-489`):
- `cliente_id` (autocomplete, igual novo/editar de pedido)
- `dt_orcamento`, `dt_validade`, `dt_entrega` (datas)
- `forma_pgto`, `conta`, `parcelas` (número, sem cronograma — só o
  divisor usado na exibição "N× de R$X")
- `frete` (texto — "Retirada" ou nome da transportadora, mesmo padrão
  do pedido)
- `desconto` (percentual)
- `obs`

**Itens** (`ItemForm`, mesmos campos de `app/orcamentos/novo/page.tsx:58-68`):
`produto_id`, `produto_nome`, `largura`, `altura`, `quantidade`,
`valor_m2`, `lapidacao` — sem `vidro_cliente` (orçamento nunca teve
esse campo; é específico do fluxo de pedido). Adicionar/remover linhas
de item usa o mesmo componente de seleção de produto de
`novo/page.tsx`.

`m2Total`/`valorTotal` recalculados a partir dos itens editados, com a
mesma fórmula pura de `novo/page.tsx` (`calcM2Item`/`calcSubtotal`,
arredondamento de dimensão a múltiplos de 50mm).

**Salvar**: um único fluxo, sem passos condicionais de reconciliação
financeira:
1. `updateOrcamento(id, { cliente_id, dt_orcamento, dt_validade,
   dt_entrega, forma_pgto, conta, parcelas, frete, obs, desconto,
   m2_total, valor_total })`.
2. Itens: comparar a lista carregada com a lista editada por `id`.
   - Itens com `id` presente na carga original mas removidos na tela →
     `delete` em `itens_orcamento`.
   - Itens com `id` presente nas duas listas → `update` dos campos
     (mesmo padrão do `salvarEdicao()` do pedido,
     `app/pedidos/[id]/page.tsx:371-378`, adaptado pra
     `itens_orcamento`).
   - Itens novos (sem `id`, adicionados na tela) → `insert` com
     `orcamento_id`.

**Botão de acesso**: em `app/orcamentos/[id]/page.tsx`, um botão
"Editar Orçamento" na topbar (mesma posição/estilo do botão "Editar
Cliente" em `clientes/[id]`), levando pra
`/orcamentos/[id]/editar`.

### Serviço: `services/orcamentos.service.ts`

`updateOrcamento()` já existe e já aceita `Partial<OrcamentoInsert>` —
não precisa mudar de assinatura, só passar a ser chamado com o
conjunto completo de campos em vez de só `status`/
`arquivo_assinado_url`. Nota: `types/index.ts`'s `Orcamento`/
`OrcamentoInsert` (linhas 410-425) estão desatualizados em relação às
colunas reais usadas pelo app (`orc` é tipado `any` na tela de
detalhe hoje) — este trabalho não tenta corrigir esse type, só reusa o
padrão já em uso (`as any`/`as never` nos pontos de I/O, igual o resto
do arquivo já faz).

Nenhuma alteração no que acontece quando o orçamento é aprovado
(`aprovarOrcamento()`) — a edição só muda os dados-base antes da
aprovação; o snapshot que vira pedido continua sendo o estado mais
recente no momento da aprovação, comportamento já correto sem mudança
nenhuma.

### PDF: total de m²/ml na tabela de itens

Em `app/orcamentos/[id]/page.tsx`, dentro da seção `print-area`
(linhas ~617-646, a tabela `<table>` de itens), depois do último
`<tr>` de item (fechamento do `.map`), uma linha extra:

```tsx
<tr style={{ borderTop: "2px solid #2d5fa6" }}>
  <td colSpan={3} style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800, color: "#2d5fa6", fontSize: "10px" }}>Total</td>
  <td style={{ padding: "7px 8px", fontFamily: "monospace", fontSize: "10px", fontWeight: 800, color: "#2d5fa6" }}>
    {isMLGeral
      ? `${itens.reduce((s, i) => s + Number(i.m2), 0).toFixed(2)} ml`
      : formatM2(itens.reduce((s, i) => s + Number(i.m2), 0))}
  </td>
  <td colSpan={2}></td>
</tr>
```

`isMLGeral` = mesmo teste já usado em `romaneio.tsx:52` e no
`relatorioCliente.tsx` (`itens.every(i => i.produtos?.unidade === "ml"
|| i.vidro_cliente === true)`) — reaproveitado, não uma lógica nova.
A linha fica dentro do `<tbody>` (não do `<tfoot>`, que este projeto
não usa em nenhuma tabela existente), com borda superior grossa pra se
diferenciar visualmente dos itens.

## Fora de escopo (YAGNI)

- Bloqueio de edição por status — decisão explícita do usuário:
  sempre editável.
- Alterar `types/index.ts`'s `Orcamento`/`OrcamentoInsert` pra bater
  com as colunas reais — fora do pedido original, risco de tocar
  código que não faz parte desta mudança.
- Histórico de alterações (log de quem editou o quê) — o pedido não
  tem isso hoje, orçamento não vai ganhar antes dele.
- Editar orçamentos já aprovados para refletir de volta no pedido
  gerado — orçamento e pedido são entidades independentes após a
  aprovação; editar o orçamento depois de aprovado não deveria (e não
  vai) alterar o pedido já criado.

## Testes

Sem teste automatizado pra página nova (mesmo padrão de
`app/pedidos/[id]/editar/page.tsx` — nenhuma página deste projeto tem
teste, só lib puras). Verificação via `npx tsc --noEmit` e
`npm run build`.

Validação manual do usuário: editar um orçamento em cada status
(Rascunho, Enviado, Aprovado, Rejeitado) alterando cliente, itens
(incluindo adicionar e remover um item) e os demais campos; conferir
que o PDF gerado depois mostra a linha de total de m²/ml correta,
inclusive num orçamento só de vidro do cliente (ml) e um normal (m²).
