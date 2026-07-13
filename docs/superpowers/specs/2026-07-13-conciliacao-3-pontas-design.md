# Conciliação 3 Pontas — Design

## Contexto

Continuação natural do XML Inteligente de Compras (`2026-07-13-xml-inteligente-compras-design.md`): agora que compras registradas por esse fluxo ficam linkadas em três pontas (`documento_fiscal.compra_id`, `lancamentos.compra_id`, `estoque_movimentacoes.origem_id`), "conciliar" NF × Financeiro × Estoque não precisa de uma engine de matching nova — vira uma checagem de integridade sobre esse link já existente.

## Onde entra

Não é tela nova. `services/contabilidadeDashboard.service.ts` já tem `getAlertas(ano, mes)`, que roda um conjunto de checagens por competência (NF sem XML, sem classificação fiscal, chave duplicada etc.) e já é renderizado na lista de "Alertas" do Dashboard da Contabilidade (`app/contabilidade/page.tsx`). As duas checagens de conciliação entram nessa mesma função, aparecem na mesma lista.

## As duas checagens

1. **Documento fiscal de compra sem `compra_id`** — usa o `docsCompra` que `getAlertas` já busca (mesma query usada pelos alertas de XML/PDF/classificação); filtra os que têm `entrada === true` e `compra_id === null`. Indica nota registrada manualmente em Documentos Fiscais, fora do fluxo de Compras — pode ser proposital (compra muito antiga, lançada direto) ou esquecimento; o alerta só avisa, não bloqueia nada.

2. **Compra `recebido` sem lançamento correspondente** — consulta nova: busca `compras` com `status = 'recebido'` e `dt_recebimento` dentro da competência (ano/mês), depois verifica quais desses `id` não aparecem em `lancamentos.compra_id`. Indica falha silenciosa em `gerarContaAPagarDaCompra` (função já existente, chamada automaticamente por `confirmarRecebimento`).

Não existe uma terceira checagem "estoque". Revisão de `confirmarRecebimento` confirmou que uma compra só vira `status: 'recebido'` depois que **todos** os itens passam por `registrarMovimentacao` com sucesso — se algum item falha, a função retorna erro antes de marcar como recebida, então uma compra "recebido sem estoque" não é um estado que o sistema produz.

## Severidade

Ambas entram como `severidade: "atencao"` (não `"critico"`) — são sinais de algo fora do padrão, não erros que bloqueiam o fechamento por si só (diferente de, por exemplo, "NF de compra sem XML", que já é crítico hoje).

## Fora de escopo

- Tela dedicada de auditoria com lista clicável — decidido explicitamente que não é necessário agora; a lista de Alertas já existente é suficiente.
- Ação de "corrigir" automática — o alerta só aponta o problema; resolver (vincular manualmente, criar o lançamento faltante) continua manual, nas telas que já existem (Documentos Fiscais, Compras, Contas a Pagar).
