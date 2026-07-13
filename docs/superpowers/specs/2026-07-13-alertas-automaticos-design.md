# Alertas Automáticos — 4 novos

**Origem**: item "Alertas automáticos (6/22 do roadmap original)" do backlog da auditoria. Sub-projeto 2 de 7 de uma segunda leva (migrations → **alertas** → financeiro na exportação → acessibilidade → cotação de compras → CRM → SIEG).

## Contexto

A lista original dos 22 alertas (de um prompt anterior desta mesma auditoria) não está disponível nesta sessão. Levantamento do que já existe hoje (ver conversa) mostrou bastante infraestrutura de alerta já espalhada (Dashboard principal, "Radar de Riscos" no Dashboard Financeiro estratégico, métricas de atraso na Programação, ruptura de estoque, banner de Qualidade). Por decisão do usuário, em vez de tentar reconstruir os 22 originais, o escopo virou 4 lacunas reais identificadas (dado disponível, sem alerta correspondente ainda):

1. Compra parada há muito tempo.
2. NC/retrabalho aberto há muito tempo.
3. Cliente estourou o limite de crédito.
4. Pedido sem programação (além da fila normal de otimização).

"Comissão de vendedor pendente" foi descartado — não existe tabela de controle de comissão paga/a pagar no sistema, seria um módulo novo.

## 1. Compra parada há muito tempo

**`app/dashboard/page.tsx`** — sem query nova (`compras` já é buscado em `load()`, linha 51). Deriva:

```ts
const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
const comprasParadas = compras.filter(c => c.status === "rascunho" && new Date(c.dt_compra) < seteDiasAtras);
```

Novo chip no strip "Requer ação" (linha ~298-304, ao lado do chip `comprasPend` existente), cor `cy` (atenção), link `/compras`. `comprasPend` (contagem simples de pendentes) continua existindo sem mudança — este é um chip adicional, não substituição.

## 2. NC/retrabalho aberto há muito tempo

**`services/qualidade.service.ts`** (`getResumoQualidade`) — as duas queries `head:true` (só contagem) de `nao_conformidades` e `retrabalhos` viram select com a data de abertura, pra poder calcular idade:

```ts
supabase.from('nao_conformidades').select('id, dt_ocorrencia').in('status', [...]),   // era head:true
supabase.from('retrabalhos').select('id, dt_retrabalho').in('status', [...]),          // era head:true
```

Contagem (`ncsAbertas`, `retrabalhosAbertos`) passa a vir de `.length` do array retornado em vez do `count` do Postgres — resultado idêntico, só muda a forma de obter. Novos campos no retorno:

```ts
const LIMITE_DIAS_ANTIGO = 15;
const diasAberto = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000;
ncsAntigas: ncsAbertasRows.filter(n => diasAberto(n.dt_ocorrencia) > LIMITE_DIAS_ANTIGO).length,
retrabalhosAntigos: retrabAtivosRows.filter(r => diasAberto(r.dt_retrabalho) > LIMITE_DIAS_ANTIGO).length,
```

**`app/qualidade/page.tsx`** — `useState` default ganha os 2 campos novos. Novo banner (mesmo padrão do banner crítico já existente, `.item-card.warn` em vez de `.item-card.err`), condicionado a `ncsAntigas > 0 || retrabalhosAntigos > 0`, texto combinando os dois quando ambos > 0.

## 3. Cliente estourou limite de crédito

**`app/dashboard-financeiro/estrategica/page.tsx`** — a query existente (`supabase.from("clientes").select("id").eq("bloqueado_credito", true)`) vira `select("id, credito, bloqueado_credito")` (sem filtro, todos os clientes) + nova chamada `getFinanceiroClientes()` (de `@/services/financeiro.service`, já usada em outras telas) no mesmo `Promise.all`. Client-side:

```ts
const clientesBloqueados = clientes.filter(c => c.bloqueado_credito).length; // mesmo resultado de antes
const clientesEstouraramCredito = clientes.filter(c => {
  if (c.bloqueado_credito) return false; // já bloqueado, não conta 2x
  if (!c.credito || c.credito <= 0) return false;
  const fin = financeiroClientes.find(f => f.cliente_id === c.id);
  return !!fin && Number(fin.a_receber) > c.credito;
}).length;
```

Novo item no array `riscos` (nível `alto`), mesma lista que já renderiza `clientesBloqueados`. **Só alerta — não altera `bloqueado_credito` automaticamente**, o toggle manual em `/clientes` continua sendo a única forma de bloquear.

## 4. Pedido sem programação

**`app/dashboard/page.tsx`** — nova chamada `getPedidosSemProgramacao()` (de `@/services/programacao.service`, já existe) no `Promise.all` de `load()`. **Filtra fora `status === "Aguardando otimização"`** antes de contar (senão duplica o chip `aguardandoOtim` já existente — pedido nessa etapa naturalmente ainda não tem programação, não é anomalia):

```ts
const semProgramacaoReal = semProgramacao.filter(p => p.status !== "Aguardando otimização");
```

Novo chip no strip, cor `cb` (informativo), link `/programacao`.

## Fora de escopo

- Reconstruir os 22 alertas originais exatos (lista não disponível).
- Comissão de vendedor pendente (sem tabela de controle, seria módulo novo).
- Auto-bloqueio de crédito (item 3 só alerta, não age).
- Consolidar os 4 padrões de alerta já existentes (chip, `.al`, `Alerta` de Programação, `{severidade,mensagem,quantidade}` da Contabilidade) num componente único — dedup de UI não pedida, cada novo alerta usa o padrão já estabelecido no seu próprio contexto.

## Teste

Sem framework de teste automatizado nem dados sintéticos fáceis de gerar pra cada cenário (compra com 8+ dias, NC com 16+ dias, cliente estourando crédito). Validação via:
- `tsc --noEmit` + `next build` limpos.
- Usuário confere visualmente que os 3 alertas antigos do Dashboard/Qualidade/Radar de Riscos continuam aparecendo iguais (nenhuma regressão nos existentes) e que os novos aparecem quando há dado real que os dispare (ou ficam ausentes quando não há, sem erro).
