# Cartão Corporativo — Ponte com Contas a Pagar Real — Design

**Origem**: item "Cartão × Fluxo de Caixa" da auditoria fiscal/contábil (2026-07-15) — depois de uma volta de esclarecimento, ficou confirmado que o assunto é o **cartão corporativo da própria empresa** (módulo Contabilidade → Cartões, Contas a Pagar), não a venda no cartão pro cliente (esse fica registrado como pendência separada, não resolvida). Escopo definido via brainstorming.

## O achado real

O módulo Cartões (`app/contabilidade/cartoes/page.tsx`, `services/cartoes.service.ts`, tabelas `cartoes`/`cartoes_faturas`/`cartoes_lancamentos`) já tem cadastro de cartão, fatura e lançamento detalhado por compra (com `plano_contas_id`, `fornecedor_id`, parcelamento) — o "destrinchamento" que o usuário mencionou **já existe** na tela de detalhe da fatura. O que falta: **nenhum gasto no cartão corporativo nunca vira um lançamento na tabela `lancamentos`** — confirmado por busca exaustiva, `services/dre.service.ts` não tem nenhuma menção a `cartoes_lancamentos`/`cartoes_faturas`. Resultado: gasto no cartão corporativo é invisível pro DRE, Fluxo de Caixa e Contas a Pagar — existe só dentro da "caderneta" do módulo Cartões.

## Regras de negócio confirmadas com o usuário

- **Crédito**: o banco debita a conta em UMA parcela só, na data de vencimento da fatura, independente de quantas compras aconteceram dentro dela.
- **Débito**: cada compra debita a conta imediatamente, sem ciclo de fatura mensal.
- **Sem retroativo**: só faturas/lançamentos criados a partir desta mudança geram lançamento em `lancamentos`. Histórico já fechado/pago fica como está.
- **MDR/adquirente/D+1 de venda no cartão pro cliente**: fora de escopo aqui — é outro módulo (Contas a Receber), fica pendência separada.

## Schema — 2 colunas novas, aditivas

```sql
ALTER TABLE cartoes_faturas ADD COLUMN lancamento_id int REFERENCES lancamentos(id);
ALTER TABLE cartoes_lancamentos ADD COLUMN lancamento_id int REFERENCES lancamentos(id);
```

`cartoes_faturas.lancamento_id`: aponta pro lançamento único gerado quando a fatura fecha (crédito). `cartoes_lancamentos.lancamento_id`: aponta pro lançamento próprio gerado por uma compra individual de débito sem fatura.

## Fluxo — Crédito (1 lançamento por fatura)

Em `services/cartoes.service.ts`, `atualizarFatura(id, patch)` ganha um passo: se `patch.status === 'fechada'` e a fatura (buscada antes do update) ainda não tem `lancamento_id`, cria um lançamento novo em `lancamentos`:

```
tipo: 'Saída'
descricao: `Fatura cartão ${cartao.nome} — ${mes}/${ano}`
valor: fatura.valor_total
status: 'Pendente'
vencimento: fatura.data_vencimento
plano_contas_id: null  // fatura agrega múltiplas categorias, cada compra já tem a sua própria em cartoes_lancamentos
fornecedor_id: null
pedido_id: null
cliente_id: null
```

Depois grava o `id` desse lançamento em `cartoes_faturas.lancamento_id`. Idempotente: se a fatura já tinha `lancamento_id` (ex.: reabriu e fechou de novo), não cria outro.

## Fluxo — Débito (1 lançamento por compra, imediato)

Em `criarLancamentoCartao(input)`: se o cartão do lançamento (`input.cartao_id`) for `tipo === 'debito'` e `input.fatura_id` for `null`, cria o lançamento em `lancamentos` na mesma chamada:

```
tipo: 'Saída'
descricao: input.descricao
valor: input.valor
status: 'Pendente'
vencimento: input.data
plano_contas_id: input.plano_contas_id
fornecedor_id: input.fornecedor_id
pedido_id: null
cliente_id: null
```

Grava o `id` em `cartoes_lancamentos.lancamento_id` do registro recém-criado.

## Sincronização de status (leitura, não escrita)

Sem tocar na lógica genérica de pagamento (`registrarBaixa`/`editarLancamento`, usada por pedidos/compras/todo o sistema). Em vez disso, `getFaturas()` e `getLancamentosCartao()`/`getLancamentosFatura()` passam a também buscar o `status` do `lancamento_id` vinculado (via embed do Supabase, `lancamentos(status, dt_pagamento)`), e se esse status for `'Pago'` mas o registro de cartão ainda não refletir isso (`cartoes_faturas.status !== 'paga'` ou `cartoes_lancamentos` sem flag equivalente), a própria função de leitura dispara um `atualizarFatura`/update pontual antes de devolver os dados — sincronização "de leitura", acontece quando a tela de Cartões é aberta, não em tempo real no momento do pagamento.

## Fora de escopo

- Retroativo (faturas/lançamentos de débito já existentes antes desta mudança).
- MDR, distinção débito/crédito, prazo de repasse de adquirente para venda no cartão pro CLIENTE (Contas a Receber) — assunto totalmente separado, continua como pendência da auditoria original, não resolvido aqui.
- Qualquer mudança em `registrarBaixa`/`editarLancamento` (lógica de pagamento genérica).
- Mudança na tela de detalhe da fatura (destrinchamento por compra) — já funciona, não precisa de ajuste.

## Teste

Sem framework de teste automatizado disponível pra fluxo com Supabase real (mesma limitação recorrente do projeto). Validação via `tsc --noEmit` + `next build`, e conferência manual do usuário: fechar uma fatura de cartão de crédito de teste e confirmar que aparece em Contas a Pagar com o valor certo; lançar uma compra de débito sem fatura e confirmar o mesmo; pagar um desses lançamentos em Contas a Pagar e reabrir a tela de Cartões pra confirmar que o status sincronizou sozinho.
