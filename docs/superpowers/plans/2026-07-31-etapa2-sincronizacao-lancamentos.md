# Etapa 2 — Sincronização Pedido→Lançamento e Prevenção de Recorrência

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que editar um pedido crie lançamentos "A Receber" duplicados/divergentes do `valor_total`, mesmo quando a edição concorre com um pagamento feito por outra aba/usuário, e deixar rastro (log + alerta visual) para qualquer recorrência futura.

**Architecture:** Uma função pura de decisão (`decidirReconciliacaoLancamentos`) recebe o snapshot capturado na abertura da tela + a lista fresca de lançamentos do banco e devolve uma de 4 decisões (conflito / ajuste automático / revisão manual / reconciliar parcelas). Um orquestrador (`sincronizarLancamentosPedido`) busca os dados frescos, chama a função pura, executa a escrita no banco correspondente e loga em `log_atividades`. As duas telas de edição (`/pedidos/[id]/editar` e `/pedidos/[id]`) passam a chamar só o orquestrador, eliminando a duplicação de lógica que causou a divergência original (P-018). Um único alerta visual computado (soma dos lançamentos ativos vs. `valor_total`) cobre tanto o caso de revisão manual (item 1) quanto qualquer divergência futura (item 4) — sem coluna nova, sem migração.

**Tech Stack:** Next.js (client components), Supabase (`@supabase/supabase-js`), Vitest.

## Contexto (não repetir em cada task)

Hoje, tanto `app/pedidos/[id]/editar/page.tsx` quanto `app/pedidos/[id]/page.tsx` implementam **de forma duplicada e divergente** a rotina de "apagar as parcelas A Receber e recriar a partir do formulário":

- `editar/page.tsx` (linhas 437-469): já busca `lancsAtual` fresco do banco antes de decidir o que apagar, mas ainda **recria cegamente** todas as parcelas do formulário (`parcelasForm`) mesmo que uma delas represente um lançamento que foi pago por outra sessão enquanto a tela estava aberta — gerando duplicata (o pago fica `Pago`, mais um novo `A Receber` do mesmo valor é criado). A comparação de saldo usa `valorRecebidoOriginal`, que é um snapshot congelado no `load()` e nunca atualizado.
- `page.tsx` (linhas 417-432, dentro de `salvarEdicao`): usa o estado `lancamentos` (também um snapshot do `load()`) tanto para decidir o que apagar quanto para recriar — mais suscetível ainda à mesma classe de bug.

Este plano substitui as duas implementações por uma única função compartilhada em `services/pedidos.service.ts`, adiciona a checagem de conflito de edição concorrente (item 2 do prompt do usuário), a instrumentação em `log_atividades` (item 3) e o alerta visual de divergência na tela do pedido (item 4). O item 1 (auto-ajuste do lançamento único vs. aviso manual em caso de múltiplas parcelas/pagamento parcial) fica embutido na função de decisão.

**Decisões de UX já confirmadas com o usuário:**
- Conflito de edição concorrente (item 2): aborta **só a seção de lançamentos** — pedido e itens salvam normalmente (mesmo padrão já usado hoje quando o insert de parcela falha); só a reconciliação de "A Receber" é pulada, com toast avisando para conferir/recarregar.
- Aviso de múltiplas parcelas/pagamento parcial (item 1): a decisão original pedia um "banner dedicado" separado do alerta do item 4, sustentado por uma coluna nova em `pedidos`. Revisado — o gatilho do caso `revisao_manual` sempre implica `soma(lançamentos ativos) != valor_total` no momento em que ocorre (é um subconjunto estrito da condição do item 4, nunca independente dela), então **um único alerta computado** (sem persistência, sem migração) cobre os dois casos. O antes/depois exato de cada ocorrência fica registrado no `log_atividades` (item 3), não na tela — quem precisar do valor anterior/data exata consulta o log.

## Global Constraints

- Nunca usar dados de estado do React (snapshot de quando a tela abriu) para decidir o que apagar/atualizar em `lancamentos` — sempre buscar fresco do banco no momento do save (é exatamente o bug que este plano corrige).
- `registrarLog` (já existente em `services/log.service.ts`) é fire-and-forget — não precisa de `await` para não travar o save, mas deve ser chamado de forma que o payload já esteja completo no momento da chamada.
- A função de decisão nunca lê `pedido.valor_recebido` para decidir se ajusta automaticamente — só a contagem real de lançamentos `Entrada` ativos vindos frescos do banco. Isso é deliberado: `valor_recebido` é um campo derivado que pode estar desatualizado/errado (é literalmente a classe de bug encontrada no pedido P-018/P-048 — múltiplos lançamentos já pagos somando o total mais um "A Receber" fantasma sobrando), então basear a decisão nele reintroduziria o mesmo tipo de fragilidade. Ver teste explícito desse cenário na Task 1.
- Sem migração de schema neste plano — o alerta de divergência (item 4) já cobre o aviso do item 1 sem precisar persistir nada em `pedidos`.
- Este código mexe em dinheiro real de cliente — a Task 6 (verificação) é obrigatória antes de considerar a Etapa 2 fechada, e usa um pedido `__teste_*` sintético (nunca um pedido real), por [[feedback-nunca-testar-em-registro-real]].

---

### Task 1: Função pura de decisão — `decidirReconciliacaoLancamentos`

**Files:**
- Modify: `services/pedidos.service.ts` (adicionar ao final do arquivo, após `getProximoIdPedido`)
- Create: `services/pedidos.service.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: tipo `DecisaoReconciliacaoLancamentos` e função `decidirReconciliacaoLancamentos(input)`, consumidos pela Task 2 (orquestrador) e testados isoladamente aqui. Assinatura exata:

```typescript
export interface LancamentoEntradaAtivo {
  id: number;
  status: string; // 'A Receber' | 'Pago' | outros
}

export type DecisaoReconciliacaoLancamentos =
  | { tipo: 'conflito'; lancamentosDivergentes: number[] }
  | { tipo: 'ajuste_automatico'; lancamentoId: number; novoValor: number; novaData: string | null }
  | { tipo: 'revisao_manual'; motivo: 'multiplos_lancamentos' | 'pagamento_ja_registrado' }
  | { tipo: 'reconciliar_parcelas'; idsParaExcluir: number[]; novasParcelas: { data: string; valor: number; descricao: string }[] };

export function decidirReconciliacaoLancamentos(input: {
  pedidoId: string;
  idsAReceberSnapshot: number[];
  lancamentosEntradaAtivos: LancamentoEntradaAtivo[];
  valorTotalAnterior: number;
  valorTotalNovo: number;
  parcelasDesejadas: { data: string; valor: number }[];
  numParcelas: number;
}): DecisaoReconciliacaoLancamentos
```

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `services/pedidos.service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { decidirReconciliacaoLancamentos } from "@/services/pedidos.service";

const base = {
  pedidoId: "P-999",
  valorTotalAnterior: 1000,
  valorTotalNovo: 1000,
  parcelasDesejadas: [{ data: "2026-08-01", valor: 1000 }],
  numParcelas: 1,
};

describe("decidirReconciliacaoLancamentos", () => {
  it("detecta conflito quando um lançamento do snapshot não está mais A Receber", () => {
    const decisao = decidirReconciliacaoLancamentos({
      ...base,
      idsAReceberSnapshot: [77],
      lancamentosEntradaAtivos: [{ id: 77, status: "Pago" }],
    });
    expect(decisao).toEqual({ tipo: "conflito", lancamentosDivergentes: [77] });
  });

  it("reconcilia parcelas normalmente quando o total não mudou e não há conflito", () => {
    const decisao = decidirReconciliacaoLancamentos({
      ...base,
      idsAReceberSnapshot: [77],
      lancamentosEntradaAtivos: [{ id: 77, status: "A Receber" }],
    });
    expect(decisao).toEqual({
      tipo: "reconciliar_parcelas",
      idsParaExcluir: [77],
      novasParcelas: [{ data: "2026-08-01", valor: 1000, descricao: "Recebimento · P-999" }],
    });
  });

  it("numera a descrição das parcelas quando há mais de uma", () => {
    const decisao = decidirReconciliacaoLancamentos({
      ...base,
      idsAReceberSnapshot: [77, 78],
      lancamentosEntradaAtivos: [{ id: 77, status: "A Receber" }, { id: 78, status: "A Receber" }],
      parcelasDesejadas: [{ data: "2026-08-01", valor: 500 }, { data: "2026-09-01", valor: 500 }],
      numParcelas: 2,
    });
    expect(decisao.tipo).toBe("reconciliar_parcelas");
    if (decisao.tipo === "reconciliar_parcelas") {
      expect(decisao.novasParcelas.map(p => p.descricao)).toEqual([
        "Parcela 1/2 · P-999", "Parcela 2/2 · P-999",
      ]);
    }
  });

  it("ajusta automaticamente quando há exatamente 1 lançamento A Receber e o total mudou", () => {
    const decisao = decidirReconciliacaoLancamentos({
      ...base,
      valorTotalNovo: 1550,
      idsAReceberSnapshot: [77],
      lancamentosEntradaAtivos: [{ id: 77, status: "A Receber" }],
      parcelasDesejadas: [{ data: "2026-08-05", valor: 1550 }],
    });
    expect(decisao).toEqual({
      tipo: "ajuste_automatico", lancamentoId: 77, novoValor: 1550, novaData: "2026-08-05",
    });
  });

  it("pede revisão manual quando o total mudou e há múltiplos lançamentos", () => {
    const decisao = decidirReconciliacaoLancamentos({
      ...base,
      valorTotalNovo: 1550,
      idsAReceberSnapshot: [77, 78],
      lancamentosEntradaAtivos: [{ id: 77, status: "A Receber" }, { id: 78, status: "A Receber" }],
    });
    expect(decisao).toEqual({ tipo: "revisao_manual", motivo: "multiplos_lancamentos" });
  });

  it("pede revisão manual quando o total mudou e o único lançamento já foi pago", () => {
    const decisao = decidirReconciliacaoLancamentos({
      ...base,
      valorTotalNovo: 1550,
      idsAReceberSnapshot: [],
      lancamentosEntradaAtivos: [{ id: 77, status: "Pago" }],
    });
    expect(decisao).toEqual({ tipo: "revisao_manual", motivo: "pagamento_ja_registrado" });
  });

  it("não confunde diferença de centavos com mudança de total", () => {
    const decisao = decidirReconciliacaoLancamentos({
      ...base,
      valorTotalAnterior: 1000,
      valorTotalNovo: 1000.01,
      idsAReceberSnapshot: [77],
      lancamentosEntradaAtivos: [{ id: 77, status: "A Receber" }],
    });
    expect(decisao.tipo).toBe("reconciliar_parcelas");
  });

  it("cenário P-018/P-048: múltiplos lançamentos já pagos somando o total + 1 'A Receber' fantasma sobrando não dispara ajuste automático, mesmo que valor_recebido (não usado aqui) estivesse errado", () => {
    // 2 lançamentos Pago somam o valor_total ANTERIOR (500+500=1000); um
    // terceiro lançamento fantasma ainda "A Receber" (ex.: sobra órfã de um
    // bug antigo, como o achado no pedido P-018) também existia no snapshot.
    // O total do pedido mudou (novo item aumentou o valor) — a função NUNCA
    // recebe/lê pedido.valor_recebido, então mesmo que esse campo estivesse
    // desatualizado (não refletisse os 2 pagamentos), a decisão é a mesma:
    // 3 lançamentos ativos (não é o caso de exatamente 1 A Receber) => não
    // ajusta sozinho, pede revisão manual.
    const decisao = decidirReconciliacaoLancamentos({
      ...base,
      valorTotalNovo: 1550,
      idsAReceberSnapshot: [79],
      lancamentosEntradaAtivos: [
        { id: 77, status: "Pago" },
        { id: 78, status: "Pago" },
        { id: 79, status: "A Receber" },
      ],
    });
    expect(decisao).toEqual({ tipo: "revisao_manual", motivo: "multiplos_lancamentos" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run services/pedidos.service.test.ts`
Expected: FAIL — `decidirReconciliacaoLancamentos` não existe ainda.

- [ ] **Step 3: Implementar a função**

Ao final de `services/pedidos.service.ts` (após `getProximoIdPedido`, antes do fim do arquivo):

```typescript
export interface LancamentoEntradaAtivo {
  id: number;
  status: string;
}

export type DecisaoReconciliacaoLancamentos =
  | { tipo: 'conflito'; lancamentosDivergentes: number[] }
  | { tipo: 'ajuste_automatico'; lancamentoId: number; novoValor: number; novaData: string | null }
  | { tipo: 'revisao_manual'; motivo: 'multiplos_lancamentos' | 'pagamento_ja_registrado' }
  | { tipo: 'reconciliar_parcelas'; idsParaExcluir: number[]; novasParcelas: { data: string; valor: number; descricao: string }[] };

// Decisão pura (sem I/O) de como reconciliar os lançamentos "A Receber" de um
// pedido após uma edição. Separada do I/O (sincronizarLancamentosPedido,
// abaixo) justamente para poder ser testada sem mock de Supabase — ver
// convenção já usada em cartoes.service.ts (dataSugerida/competenciaParaData).
// Deliberadamente NÃO recebe pedido.valor_recebido como input: esse campo é
// derivado e pode estar desatualizado (ver teste do cenário P-018/P-048) —
// a decisão só confia na contagem real de lançamentos Entrada ativos.
export function decidirReconciliacaoLancamentos(input: {
  pedidoId: string;
  idsAReceberSnapshot: number[];
  lancamentosEntradaAtivos: LancamentoEntradaAtivo[];
  valorTotalAnterior: number;
  valorTotalNovo: number;
  parcelasDesejadas: { data: string; valor: number }[];
  numParcelas: number;
}): DecisaoReconciliacaoLancamentos {
  const idsAtivosAReceber = input.lancamentosEntradaAtivos
    .filter(l => l.status === 'A Receber')
    .map(l => l.id);

  // Conflito de edição concorrente: um lançamento que era "A Receber" quando
  // a tela abriu não está mais nessa lista fresca (foi pago/excluído por
  // outra sessão enquanto a tela estava aberta).
  const conflitantes = input.idsAReceberSnapshot.filter(id => !idsAtivosAReceber.includes(id));
  if (conflitantes.length > 0) {
    return { tipo: 'conflito', lancamentosDivergentes: conflitantes };
  }

  const totalMudou = Math.abs(input.valorTotalNovo - input.valorTotalAnterior) > 0.02;

  if (!totalMudou) {
    const novasParcelas = input.parcelasDesejadas
      .filter(p => p.data && p.valor > 0)
      .map((p, i) => ({
        data: p.data,
        valor: p.valor,
        descricao: input.numParcelas === 1
          ? `Recebimento · ${input.pedidoId}`
          : `Parcela ${i + 1}/${input.numParcelas} · ${input.pedidoId}`,
      }));
    return { tipo: 'reconciliar_parcelas', idsParaExcluir: idsAtivosAReceber, novasParcelas };
  }

  if (input.lancamentosEntradaAtivos.length === 1 && input.lancamentosEntradaAtivos[0].status === 'A Receber') {
    return {
      tipo: 'ajuste_automatico',
      lancamentoId: input.lancamentosEntradaAtivos[0].id,
      novoValor: input.valorTotalNovo,
      novaData: input.parcelasDesejadas[0]?.data ?? null,
    };
  }

  return {
    tipo: 'revisao_manual',
    motivo: input.lancamentosEntradaAtivos.length > 1 ? 'multiplos_lancamentos' : 'pagamento_ja_registrado',
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run services/pedidos.service.test.ts`
Expected: PASS — todos os 8 testes.

- [ ] **Step 5: Commit**

```bash
git add services/pedidos.service.ts services/pedidos.service.test.ts
git commit -m "feat(pedidos): função pura de decisão de reconciliação de lançamentos"
```

---

### Task 2: Orquestrador — `sincronizarLancamentosPedido`

**Files:**
- Modify: `services/pedidos.service.ts` (logo após a função da Task 1)

**Interfaces:**
- Consumes: `decidirReconciliacaoLancamentos` e `DecisaoReconciliacaoLancamentos` (Task 1); `registrarLog` (já importado no topo do arquivo, `services/log.service.ts`).
- Produces: `sincronizarLancamentosPedido(params): Promise<DecisaoReconciliacaoLancamentos>`, consumido pelas Tasks 3 e 4.

Não há teste automatizado para esta função (é I/O puro contra Supabase — mesma convenção já usada no resto de `pedidos.service.ts`/`financeiro.service.ts`, nenhum dos quais tem teste de integração; só as funções puras extraídas são testadas, como feito na Task 1). A verificação é manual, na Task 6.

- [ ] **Step 1: Implementar**

```typescript
// Ponto único de reconciliação de lançamentos "A Receber" ao editar um
// pedido — chamado por app/pedidos/[id]/editar/page.tsx e
// app/pedidos/[id]/page.tsx (Etapa 2, itens 1-3). Antes, cada tela tinha sua
// própria cópia dessa lógica, uma delas usando estado potencialmente
// obsoleto do React em vez de reconsultar o banco — causa provável da
// duplicação encontrada no pedido P-018 (ver comentário em
// registrarRecebimento, acima).
export async function sincronizarLancamentosPedido(params: {
  pedidoId: string;
  clienteId: number;
  conta?: string | null;
  valorTotalAnterior: number;
  valorTotalNovo: number;
  idsAReceberSnapshot: number[];
  parcelasDesejadas: { data: string; valor: number }[];
  numParcelas: number;
}): Promise<DecisaoReconciliacaoLancamentos> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, status')
    .eq('pedido_id', params.pedidoId)
    .eq('tipo', 'Entrada')
    .is('deletado_em', null);

  if (error) {
    console.error('sincronizarLancamentosPedido:', error);
    return { tipo: 'revisao_manual', motivo: 'pagamento_ja_registrado' };
  }

  const lancamentosEntradaAtivos = (data ?? []) as LancamentoEntradaAtivo[];

  const decisao = decidirReconciliacaoLancamentos({
    pedidoId: params.pedidoId,
    idsAReceberSnapshot: params.idsAReceberSnapshot,
    lancamentosEntradaAtivos,
    valorTotalAnterior: params.valorTotalAnterior,
    valorTotalNovo: params.valorTotalNovo,
    parcelasDesejadas: params.parcelasDesejadas,
    numParcelas: params.numParcelas,
  });

  const buscarInfo = (id: number) => lancamentosEntradaAtivos.find(l => l.id === id);

  switch (decisao.tipo) {
    case 'conflito': {
      registrarLog({
        acao: 'reconciliou', tabela: 'lancamentos', registro_id: params.pedidoId,
        descricao: `Conflito de edição concorrente ao salvar pedido ${params.pedidoId}: lançamento(s) ${decisao.lancamentosDivergentes.join(', ')} mudaram de status enquanto a tela estava aberta — reconciliação de parcelas foi pulada`,
        campos_alterados: {
          lancamentos_divergentes: decisao.lancamentosDivergentes,
          snapshot_desatualizado: true,
        },
      });
      break;
    }
    case 'ajuste_automatico': {
      await supabase.from('lancamentos').update({
        valor: decisao.novoValor,
        ...(decisao.novaData ? { vencimento: decisao.novaData } : {}),
      } as never).eq('id', decisao.lancamentoId);
      registrarLog({
        acao: 'reconciliou', tabela: 'lancamentos', registro_id: params.pedidoId,
        descricao: `Ajustou automaticamente o lançamento #${decisao.lancamentoId} do pedido ${params.pedidoId} de ${params.valorTotalAnterior} para ${decisao.novoValor}`,
        campos_alterados: {
          lancamentos_criados: [{ id: decisao.lancamentoId, valor: decisao.novoValor }],
          lancamentos_apagados: [],
          snapshot_desatualizado: false,
        },
      });
      break;
    }
    case 'revisao_manual': {
      registrarLog({
        acao: 'reconciliou', tabela: 'lancamentos', registro_id: params.pedidoId,
        descricao: `Pulou ajuste automático do pedido ${params.pedidoId} (${decisao.motivo}) — valor mudou de ${params.valorTotalAnterior} para ${params.valorTotalNovo}, parcelas não foram tocadas`,
        campos_alterados: {
          motivo: decisao.motivo,
          valor_anterior: params.valorTotalAnterior,
          valor_novo: params.valorTotalNovo,
          snapshot_desatualizado: false,
        },
      });
      break;
    }
    case 'reconciliar_parcelas': {
      const apagados = decisao.idsParaExcluir.map(id => ({
        id, status: buscarInfo(id)?.status ?? null,
      }));
      if (decisao.idsParaExcluir.length > 0) {
        await supabase.from('lancamentos').delete().in('id', decisao.idsParaExcluir);
      }
      let criados: { id: number; valor: number }[] = [];
      if (decisao.novasParcelas.length > 0) {
        const { data: inseridos, error: errInsert } = await supabase
          .from('lancamentos')
          .insert(decisao.novasParcelas.map(p => ({
            tipo: 'Entrada', status: 'A Receber', vencimento: p.data, valor: p.valor,
            descricao: p.descricao, pedido_id: params.pedidoId, cliente_id: params.clienteId,
            conta: params.conta || null,
          })) as never)
          .select('id, valor');
        if (errInsert) console.error('sincronizarLancamentosPedido (insert):', errInsert);
        criados = (inseridos ?? []) as { id: number; valor: number }[];
      }
      registrarLog({
        acao: 'reconciliou', tabela: 'lancamentos', registro_id: params.pedidoId,
        descricao: `Recriou parcela(s) A Receber do pedido ${params.pedidoId}`,
        campos_alterados: {
          lancamentos_apagados: apagados,
          lancamentos_criados: criados,
          snapshot_desatualizado: false,
        },
      });
      break;
    }
  }

  return decisao;
}
```

- [ ] **Step 2: Checar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add services/pedidos.service.ts
git commit -m "feat(pedidos): orquestrador sincronizarLancamentosPedido com log de instrumentação"
```

---

### Task 3: Integrar em `/pedidos/[id]/editar`

**Files:**
- Modify: `app/pedidos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `sincronizarLancamentosPedido` (Task 2).

- [ ] **Step 1: Importar a função**

Em `app/pedidos/[id]/editar/page.tsx:7`, ajustar o import existente:

```typescript
import { getPedidoById, updatePedido, recalcularRecebido, sincronizarLancamentosPedido } from "@/services/pedidos.service";
```

- [ ] **Step 2: Substituir `valorRecebidoOriginal` pelo novo snapshot**

`valorRecebidoOriginal` (linha 120) só é lido dentro do bloco que a Step 4 remove (`saldoPendente = valorComIpiCalc - valorRecebidoOriginal`, linha 450) — a nova lógica não precisa mais desse cálculo de saldo pendente, então em vez de manter os dois, substituir `valorRecebidoOriginal` por `valorTotalOriginal` (que a Task 1/2 realmente consomem):

```typescript
  const [valorTotalOriginal, setValorTotalOriginal] = useState(0);
  const [idsAReceberSnapshot, setIdsAReceberSnapshot] = useState<number[]>([]);
```

- [ ] **Step 3: Capturar o snapshot no `load()`**

Em `load()`, substituir a linha `setValorRecebidoOriginal(pedido.valor_recebido ?? 0);` (linha 143) por:

```typescript
    setValorTotalOriginal(valorComIpi(pedido));
```

E, dentro do bloco que já calcula `aReceber` para montar `parcelasForm` (linhas 186-200), capturar os ids logo depois de `aReceber` ser calculado:

```typescript
    // Parcelas a receber
    const aReceber = lancs.filter(l => l.status === "A Receber").sort((a, b) =>
      (a.vencimento ?? "").localeCompare(b.vencimento ?? "")
    );
    setIdsAReceberSnapshot(aReceber.map(l => l.id));
    if (aReceber.length > 0) {
```

- [ ] **Step 4: Substituir o bloco de reconciliação em `salvar()`**

Substituir todo o bloco (linhas 437-469 do arquivo original, do comentário `// Recriar lançamentos A Receber` até o `}` que fecha o `if (idsParaExcluir.length > 0 || saldoPendente > 0.02)`):

```typescript
    // Reconciliação de lançamentos "A Receber" — decisão pura em
    // decidirReconciliacaoLancamentos, I/O em sincronizarLancamentosPedido
    // (services/pedidos.service.ts). Trata 3 casos que a versão antiga
    // (delete+recriar cego) não tratava: conflito de edição concorrente
    // (lançamento pago por outra sessão enquanto a tela estava aberta),
    // ajuste automático quando há só 1 lançamento pendente, e aviso de
    // revisão manual quando há múltiplas parcelas ou pagamento parcial.
    const decisaoLancamentos = await sincronizarLancamentosPedido({
      pedidoId: id,
      clienteId,
      conta: conta || undefined,
      valorTotalAnterior: valorTotalOriginal,
      valorTotalNovo: valorComIpiCalc,
      idsAReceberSnapshot,
      parcelasDesejadas: parcelasForm.map(p => ({ data: p.data, valor: p.valor })),
      numParcelas: parcelas,
    });

    if (decisaoLancamentos.tipo === "conflito") {
      toast("Um lançamento deste pedido mudou de status enquanto você editava (ex.: foi pago). As parcelas não foram alteradas — recarregue a página antes de salvar de novo.", "err");
    } else if (decisaoLancamentos.tipo === "revisao_manual") {
      toast("Valor do pedido mudou — como há múltiplas parcelas ou pagamento parcial, revise manualmente em Contas a Receber", "warn");
    }
```

- [ ] **Step 5: Checar que compila e que não sobrou código morto**

Run: `npx tsc --noEmit`
Expected: sem erros. Confirmar visualmente que não sobrou nenhuma referência solta a `lancsAtual`/`idsParaExcluir`/`saldoPendente`/`novasParcelas`/`valorRecebidoOriginal` no arquivo (eram só usadas dentro do bloco removido).

Run: `grep -n "lancsAtual\b\|valorRecebidoOriginal" "app/pedidos/[id]/editar/page.tsx"`
Expected: só a ocorrência de `lancsAtual2` (usada no bloco de comissão, abaixo, fora do escopo desta task) — zero ocorrências de `valorRecebidoOriginal`.

- [ ] **Step 6: Commit**

```bash
git add "app/pedidos/[id]/editar/page.tsx"
git commit -m "fix(pedidos): editar usa sincronizarLancamentosPedido em vez de recriar lançamentos cegamente"
```

---

### Task 4: Integrar em `/pedidos/[id]` (edição inline)

**Files:**
- Modify: `app/pedidos/[id]/page.tsx`

**Interfaces:**
- Consumes: `sincronizarLancamentosPedido` (Task 2).

- [ ] **Step 1: Importar a função**

Em `app/pedidos/[id]/page.tsx:6`, ajustar o import existente:

```typescript
import { getPedidoById, avancarStatusPedido, recalcularRecebido, updatePedido, getCreditoCliente, atualizarCreditoCliente, utilizarCreditoEmPedido, uploadRomaneioAssinado, deleteRomaneioAssinado, uploadNfe, deleteNfe, uploadBoleto, deleteBoleto, uploadComprovantePagamento, deleteComprovantePagamento, sincronizarLancamentosPedido } from "@/services/pedidos.service";
```

- [ ] **Step 2: Adicionar estado de snapshot**

Logo após `const [editItens, setEditItens] = useState<ItemEdit[]>([]);` (linha 222):

```typescript
  const [editItens, setEditItens]       = useState<ItemEdit[]>([]);
  const [valorTotalOriginal, setValorTotalOriginal] = useState(0);
  const [idsAReceberSnapshot, setIdsAReceberSnapshot] = useState<number[]>([]);
```

- [ ] **Step 3: Capturar o snapshot no `load()`**

Em `load()`, logo após `setLancamentos(lancs);` (linha 268):

```typescript
    setLancamentos(lancs);
    setValorTotalOriginal(data ? valorComIpi(data) : 0);
    setIdsAReceberSnapshot(lancs.filter(l => l.status === "A Receber").map(l => l.id));
```

- [ ] **Step 4: Substituir o bloco de reconciliação em `salvarEdicao()`**

Substituir o bloco (linhas 417-432 do arquivo original):

```typescript
    const aReceber = lancamentos.filter(l => l.status === "A Receber");
    for (const l of aReceber) {
      const ok = await deletarLancamento(l.id);
      if (!ok) { toast("Erro ao remover lançamento", "err"); setSalvando(false); return; }
    }
    for (let i = 0; i < editParcelas.length; i++) {
      const p = editParcelas[i];
      if (!p.data || p.valor <= 0) continue;
      await createLancamento({
        tipo: "Entrada",
        descricao: editForm.parcelas === 1 ? `Recebimento · ${pedido.id}` : `Parcela ${i + 1}/${editForm.parcelas} · ${pedido.id}`,
        valor: p.valor, status: "A Receber", vencimento: p.data,
        pedido_id: pedido.id, cliente_id: editForm.cliente_id,
        conta: editForm.conta || CONTAS[0],
      });
    }
```

por:

```typescript
    const decisaoLancamentos = await sincronizarLancamentosPedido({
      pedidoId: pedido.id,
      clienteId: editForm.cliente_id,
      conta: editForm.conta || CONTAS[0],
      valorTotalAnterior: valorTotalOriginal,
      valorTotalNovo: valorComIpiEditado,
      idsAReceberSnapshot,
      parcelasDesejadas: editParcelas.map(p => ({ data: p.data, valor: p.valor })),
      numParcelas: editForm.parcelas,
    });

    if (decisaoLancamentos.tipo === "conflito") {
      toast("Um lançamento deste pedido mudou de status enquanto você editava (ex.: foi pago). As parcelas não foram alteradas — recarregue a página antes de salvar de novo.", "err");
    } else if (decisaoLancamentos.tipo === "revisao_manual") {
      toast("Valor do pedido mudou — como há múltiplas parcelas ou pagamento parcial, revise manualmente", "warn");
    }
```

- [ ] **Step 5: Checar imports não usados**

`deletarLancamento`/`createLancamento` continuam usados em outras funções do mesmo arquivo (`handleDeletarLancamento`, `handleMarcarPago`) — não remover o import. Confirmar:

Run: `grep -n "deletarLancamento\|createLancamento" "app/pedidos/[id]/page.tsx"`
Expected: ainda aparecem em `handleMarcarPago`/`handleDeletarLancamento`, então o import em `app/pedidos/[id]/page.tsx:7` continua necessário.

- [ ] **Step 6: Checar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "fix(pedidos): edição inline usa sincronizarLancamentosPedido em vez de apagar+recriar por estado obsoleto"
```

---

### Task 5: Alerta visual único de divergência (itens 1 + 4)

**Files:**
- Modify: `app/pedidos/[id]/page.tsx`

**Interfaces:**
- Consumes: `lancamentos` (já em estado), `totalComIpi` (já calculado na linha 844).
- Não depende de nenhuma coluna nova — puramente computado a cada render, a partir dos dados já carregados.

- [ ] **Step 1: Calcular a divergência**

Logo após `const mostrarBoleto = ...` (linha 897, antes de `const fc: React.CSSProperties`), adicionar:

```typescript
  const somaLancamentosAtivos = lancamentos
    .filter(l => l.tipo === "Entrada" && !l.deletado_em)
    .reduce((a, l) => a + Number(l.valor), 0);
  const divergenciaLancamentos = Math.abs(somaLancamentosAtivos - totalComIpi);
  const temDivergencia = divergenciaLancamentos > 0.02;
```

- [ ] **Step 2: Renderizar o alerta**

Logo após o fechamento do bloco de `MetricCard`s (linha 964, `</div>` que fecha a `div` com `display:"flex", gap:"16px"`), antes de `<div className="con no-print" style={{ display:"flex", flexDirection:"column", gap:"20px" }}>` (linha 966):

```typescript
        {temDivergencia && (
          <div className="con no-print" style={{ padding: "0 26px" }}>
            <div style={{
              background: "rgba(244,63,94,.1)", border: "1px solid rgba(244,63,94,.35)",
              borderRadius: "8px", padding: "10px 14px", fontSize: "12px",
              color: "var(--err)", fontFamily: "'DM Mono',monospace",
            }}>
              ⚠ Soma dos lançamentos ativos ({formatBRL(somaLancamentosAtivos)}) difere do valor do pedido ({formatBRL(totalComIpi)}) em {formatBRL(divergenciaLancamentos)} — confira em Contas a Receber. Se o valor do pedido mudou recentemente e havia múltiplas parcelas ou pagamento parcial registrado, as parcelas precisam ser revisadas manualmente (ver histórico em Logs).
            </div>
          </div>
        )}
```

Este é o único mecanismo visual do plano: cobre tanto uma divergência recém-criada pelo caminho `revisao_manual` (Task 2) quanto qualquer divergência futura de outra origem — sem precisar saber qual das duas causou.

- [ ] **Step 3: Rodar o app e conferir visualmente**

Run: `npm run dev` (ou equivalente já em uso no projeto) e abrir um pedido qualquer em `/pedidos/[id]` — sem divergência, nenhum alerta deve aparecer. A conferência com divergência real acontece na Task 6, com o pedido sintético.

- [ ] **Step 4: Checar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "feat(pedidos): alerta visual único de divergência entre lançamentos e valor_total"
```

---

### Task 6: Verificação manual com pedido sintético (obrigatória antes de fechar a Etapa 2)

**Files:** nenhum (task de verificação, não de código)

Por [[feedback-nunca-testar-em-registro-real]], criar um pedido `__teste_*` sintético — nunca reproduzir em pedido real. Este projeto não expõe uma seed/factory de pedidos pronta para teste isolado; os passos abaixo usam a própria UI.

- [ ] **Step 1: Criar cenário "ajuste automático"**

Criar um pedido de teste (cliente sintético `__teste_cliente`, 1 item, 1 parcela) via `/pedidos/novo`. Confirmar que existe exatamente 1 lançamento "A Receber" vinculado (`Contas a Receber` ou `getLancamentosPorPedido` via console). Editar o pedido em `/pedidos/[id]/editar` mudando a largura de um item (para mudar `valor_total`) e salvar. Verificar: o **mesmo** lançamento (mesmo `id`) teve o `valor` atualizado — não deve existir um segundo lançamento "A Receber" para este pedido, e nenhum alerta de divergência deve aparecer.

- [ ] **Step 2: Criar cenário "revisão manual" (múltiplas parcelas)**

No mesmo pedido de teste, editar para 2 parcelas e salvar (gera 2 lançamentos "A Receber"). Editar de novo mudando `valor_total` (ex.: mudar altura de um item) e salvar. Verificar: os 2 lançamentos **não** mudaram de valor, o toast de aviso apareceu no save, e o alerta de divergência aparece em `/pedidos/[id]` mostrando a diferença correta entre a soma dos lançamentos e o novo `valor_total`.

- [ ] **Step 3: Criar cenário "conflito de edição concorrente"**

Abrir `/pedidos/[id]/editar` do pedido de teste (com 1 parcela "A Receber") em uma aba. Em outra aba, abrir `/pedidos/[id]` do mesmo pedido e marcar a parcela como paga (`handleMarcarPago`). Voltar à primeira aba (ainda com o formulário aberto, sem recarregar) e salvar. Verificar: toast de erro "recarregue a página", **nenhum** lançamento novo foi criado, o lançamento pago permanece com `status='Pago'` e valor correto (sem duplicata).

- [ ] **Step 4: Conferir `log_atividades`**

Em `/logs` (ou consulta direta), confirmar que os 3 cenários acima geraram entradas com `tabela='lancamentos'`, `acao='reconciliou'`, e que `campos_alterados` contém a informação esperada para cada caso (lançamentos apagados/criados, motivo, ou `lancamentos_divergentes`) — inclusive o valor anterior/novo do cenário de revisão manual, já que essa informação não está mais na tela.

- [ ] **Step 5: Rodar a suíte de testes completa**

Run: `npm run test`
Expected: PASS — incluindo os 8 testes novos de `decidirReconciliacaoLancamentos` (incluindo o cenário P-018/P-048 do Step 1 da Task 1) e nenhuma regressão nos demais.

- [ ] **Step 6: Excluir o pedido de teste**

Apagar o pedido `__teste_*` criado (via `deletarPedido`, já existente) para não poluir a base.

- [ ] **Step 7: Confirmar com o usuário antes de fechar a Etapa 2**

Não marcar esta etapa como resolvida sem antes perguntar ao usuário se ele quer também validar com um pedido real em produção — é código que mexe direto em dinheiro de cliente (ponto que ele mesmo levantou ao encomendar esta etapa).
