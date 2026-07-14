# Cotação de Compras — Histórico de Preços por Produto × Fornecedor — Design

**Origem**: item "cotação de compras" do backlog da Auditoria ERP, sub-projeto 5 de 7 da segunda leva (migrations → alertas → financeiro na exportação → acessibilidade → **cotação de compras** → CRM → SIEG). A auditoria original só apontava a lacuna, sem especificar comportamento — escopo definido via brainstorming com o usuário em 2026-07-14.

## O que é (e o que não é)

"Cotação de compras" aqui significa **histórico de preços por produto × fornecedor**, para embasar negociação na hora de comprar de novo — não um fluxo formal de RFQ (pedido de cotação enviado a fornecedores, respostas registradas, decisão). Não existe "cotação" como entidade própria no sistema; é uma consulta sobre dados que já existem.

Hoje o módulo de Compras (`app/compras`, `services/compras.service.ts`) não tem noção de comparação prévia entre fornecedores — uma compra já nasce com fornecedor único e preço fechado (`rascunho` → `recebido`). Este sub-projeto não muda esse fluxo; só adiciona uma consulta de apoio.

## Fonte de dados

Nenhuma tabela nova. O histórico vem inteiramente de compras já registradas:
- `compras_itens` (`produto_id`, `custo_unitario_m2`, `chapas`, `m2`)
- `compras` (`fornecedor_id`, `dt_recebimento`, `status`)
- `fornecedores` (`nome`)

**Filtro: só `compras.status = 'recebido'`.** Uma compra em `rascunho` pode ter preço provisório/não confirmado — incluí-la distorceria o histórico. Decisão confirmada com o usuário.

## Nova função de serviço

Em `services/compras.service.ts`:

```ts
export interface HistoricoPrecoItem {
  data: string;           // compras.dt_recebimento
  fornecedorNome: string;
  custoUnitarioM2: number;
  chapas: number;
  m2: number;
}

export async function getHistoricoPrecoProduto(produtoId: number): Promise<HistoricoPrecoItem[]>
```

Consulta `compras_itens` filtrando `produto_id`, join com `compras` (`status = 'recebido'`) e `fornecedores.nome`, ordenado por `dt_recebimento` desc (mais recente primeiro). Sem paginação/limite — histórico completo, mesmo padrão de simplicidade do resto do módulo (volume de compras hoje é baixo).

## Componente novo: `components/ui/HistoricoPrecoProduto.tsx`

Recebe `produtoId: number` via prop, busca via `getHistoricoPrecoProduto` no mount (`useEffect`), renderiza uma tabela simples: **Data | Fornecedor | R$/m² | Chapas**. Ordenação fixa por data desc — sem agregação por fornecedor, sem destaque de "menor preço" (decisão do usuário: tabela simples ordenada por data, não agrupada).

Estado vazio (produto nunca comprado / nunca recebido): mensagem "Nenhuma compra recebida deste produto ainda." em vez de tabela vazia.

## Dois pontos de integração (reaproveitando o mesmo componente)

1. **`app/produtos/page.tsx`** — ao expandir um produto na listagem, `<HistoricoPrecoProduto produtoId={produto.id} />` aparece dentro do card expandido, abaixo dos dados já exibidos.
2. **`app/compras/page.tsx`** (formulário de Nova Compra) — ao escolher um produto num item do formulário (`ItemForm.produto_id` preenchido), `<HistoricoPrecoProduto produtoId={...} />` aparece inline abaixo da linha desse item, antes do usuário digitar o `custo_unitario_m2` novo.

Nenhum dos dois pontos duplica lógica de busca — o componente é autocontido (busca os próprios dados a partir do `produtoId`).

## Fora de escopo

- Fluxo de RFQ formal (enviar pedido de cotação, registrar respostas de fornecedores que não compraram).
- Registrar preços cotados que não viraram compra.
- Agregação/análise (média, menor preço destacado, gráfico de tendência).
- Tela dedicada de cotações — os dois pontos de integração acima são suficientes.
- Qualquer mudança no fluxo atual de criação de compra (`rascunho` → `recebido`).

## Teste

Sem framework de teste automatizado disponível nesta sessão (mesma limitação recorrente do projeto). Validação via:
- `tsc --noEmit` + `next build` limpos.
- Conferência manual: escolher um produto com compras recebidas anteriores em `/produtos` e em Nova Compra, confirmar que a tabela mostra os preços corretos; escolher um produto nunca comprado e confirmar a mensagem de estado vazio.
