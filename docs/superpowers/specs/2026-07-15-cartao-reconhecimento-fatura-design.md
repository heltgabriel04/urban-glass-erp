# Reconhecimento Automático de Fatura — Cartão Corporativo (Design)

## Contexto

O módulo Cartões (`app/contabilidade/cartoes/page.tsx`,
`services/cartoes.service.ts`) já conecta faturas fechadas e lançamentos
de débito com `lancamentos` reais (leva anterior desta sessão,
`docs/superpowers/specs/2026-07-15-cartao-corporativo-lancamento-real-design.md`).
O que falta é o fluxo mensal em si: hoje, criar uma fatura nova é 100%
manual (botão "+ Nova Fatura" abre um formulário em branco — mesmo o
cartão já tendo `dia_fechamento`/`dia_vencimento` cadastrados, o
`ModalFatura` nunca os usa) e associar uma compra a uma fatura depende
de o usuário já ter aberto a fatura certa antes de lançar
(`fatura_id` vem de qual modal está aberto, não de nenhum cálculo).

O usuário relatou que o dia de fechamento varia um pouco mês a mês (ex.
dia 2 num mês, dia 3 no outro) — a causa mais comum disso é o dia cair
em fim de semana — e quer lançar o cadastro do cartão "uma vez só" e o
sistema entender a variação sozinho, sem recriar fatura errada toda
hora.

## Objetivo

1. Ao fechar a fatura mais recente de um cartão de crédito, sugerir a
   criação da próxima com datas já calculadas a partir de
   `dia_fechamento`/`dia_vencimento`, confirmável em 1 clique.
2. Permitir lançar uma compra sem escolher a fatura manualmente — o
   sistema calcula a qual competência ela pertence e anexa (criando a
   fatura sozinho se ainda não existir).

Cartões de débito não são afetados (nunca tiveram conceito de fatura).

## Cálculo de datas

Toda a lógica de datas é local (sem tabela de feriados — não existe
nenhuma no projeto, confirmado via grep por `feriado`/`isWeekend` antes
deste desenho). Três funções novas, privadas, em
`services/cartoes.service.ts`:

```ts
function clampDiaNoMes(dia: number, ano: number, mes: number): number {
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate(); // mes 1-based
  return Math.min(dia, ultimoDiaDoMes);
}

function proximoDiaUtil(ano: number, mes: number, dia: number): string {
  const d = new Date(ano, mes - 1, dia);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** Data de fechamento/vencimento sugerida pro cartão numa competência:
 *  clampa o dia cadastrado ao mês (ex. dia 31 em fevereiro vira o
 *  último dia real) e empurra pro próximo dia útil se cair em fim de
 *  semana (só sábado/domingo — feriado específico continua sendo
 *  ajuste manual, como hoje). */
export function dataSugerida(diaCadastrado: number, ano: number, mes: number): string {
  const dia = clampDiaNoMes(diaCadastrado, ano, mes);
  return proximoDiaUtil(ano, mes, dia);
}
```

(`dataSugerida` é exportada só pra ser testada diretamente — quem
chama de fora deste arquivo continua sendo só as duas funções públicas
das Partes 1 e 2 abaixo.)

`dia_fechamento`/`dia_vencimento` em `Cartao` são `number | null` — se
o cartão de crédito não tiver um dos dois cadastrado, as funções que
dependem dele (abaixo) não geram sugestão/auto-criação e a tela cai de
volta pro fluxo 100% manual de hoje (form em branco), sem erro.

```ts
/** A que competência (ano, mês) uma compra pertence, dado o dia de
 *  fechamento do cartão: pertence à primeira competência cuja data de
 *  fechamento sugerida seja >= à data da compra (regra padrão de
 *  fatura de cartão — "até o fechamento entra no ciclo atual"). */
export function competenciaParaData(diaFechamento: number, dataCompraIso: string): { ano: number; mes: number } {
  const compra = new Date(dataCompraIso + "T00:00:00");
  let ano = compra.getFullYear();
  let mes = compra.getMonth() + 1;
  const fechamentoNoMesDaCompra = dataSugerida(diaFechamento, ano, mes);
  if (dataCompraIso > fechamentoNoMesDaCompra) {
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return { ano, mes };
}
```

## Parte 1 — Sugestão de próxima fatura ao fechar

Nova função exportada em `services/cartoes.service.ts`:

```ts
export interface SugestaoProximaFatura {
  competenciaAno: number;
  competenciaMes: number;
  dataFechamento: string;
  dataVencimento: string;
}

/** Se a fatura mais recente do cartão estiver fechada/paga e não
 *  existir ainda uma fatura pra competência seguinte, devolve a
 *  sugestão de datas pra criá-la. null se não houver o que sugerir
 *  (última fatura ainda aberta, cartão sem dia_fechamento cadastrado,
 *  ou a próxima já existe). */
export async function sugerirProximaFatura(cartaoId: number): Promise<SugestaoProximaFatura | null> {
  const { data: cartaoRow } = await supabase.from("cartoes").select("dia_fechamento, dia_vencimento").eq("id", cartaoId).maybeSingle();
  const cartao = cartaoRow as { dia_fechamento: number | null; dia_vencimento: number | null } | null;
  if (!cartao?.dia_fechamento || !cartao?.dia_vencimento) return null;

  const { data: ultimaRow } = await supabase
    .from("cartoes_faturas")
    .select("status, competencia_ano, competencia_mes")
    .eq("cartao_id", cartaoId)
    .order("competencia_ano", { ascending: false })
    .order("competencia_mes", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ultima = ultimaRow as { status: CartaoFatura["status"]; competencia_ano: number; competencia_mes: number } | null;
  if (!ultima || ultima.status === "aberta") return null;

  let mes = ultima.competencia_mes + 1;
  let ano = ultima.competencia_ano;
  if (mes > 12) { mes = 1; ano += 1; }

  const { count } = await supabase
    .from("cartoes_faturas")
    .select("id", { count: "exact", head: true })
    .eq("cartao_id", cartaoId)
    .eq("competencia_ano", ano)
    .eq("competencia_mes", mes);
  if (count && count > 0) return null;

  return {
    competenciaAno: ano,
    competenciaMes: mes,
    dataFechamento: dataSugerida(cartao.dia_fechamento, ano, mes),
    dataVencimento: dataSugerida(cartao.dia_vencimento, ano, mes),
  };
}
```

Na tela (`app/contabilidade/cartoes/page.tsx`), quando um cartão de
crédito está selecionado: `useEffect` chama `sugerirProximaFatura` (nas
mesmas dependências de `loadFaturas`, e de novo depois de qualquer
fechamento de fatura). Se vier não-nulo, mostra um card acima da
tabela de faturas, no mesmo estilo visual dos outros cards informativos
do módulo:

> "Fatura 07/2026 fechou. Criar 08/2026 — fecha 04/08/2026, vence
> 10/08/2026?"  [Criar fatura]

Clicar em "Criar fatura" chama `criarFatura` diretamente com os valores
já calculados (`status: "aberta"`, resto `null`) — sem abrir o
`ModalFatura`. Depois de criar, recarrega faturas e a sugestão some
(porque a competência passa a existir). Se o usuário quiser outra data,
edita depois pelo botão "Editar" que já existe na tabela — não precisa
de um segundo formulário só pra isso.

## Parte 2 — Lançar compra sem escolher fatura

Nova função exportada em `services/cartoes.service.ts`:

```ts
/** Acha a fatura 'aberta' da competência calculada pra essa data de
 *  compra; se não existir, cria com as datas sugeridas. Cartão sem
 *  dia_fechamento cadastrado não tem como calcular competência —
 *  devolve null (chamador cai pro fluxo manual). */
export async function encontrarOuCriarFaturaParaData(cartaoId: number, dataCompraIso: string): Promise<CartaoFatura | null> {
  const { data: cartaoRow } = await supabase.from("cartoes").select("dia_fechamento, dia_vencimento").eq("id", cartaoId).maybeSingle();
  const cartao = cartaoRow as { dia_fechamento: number | null; dia_vencimento: number | null } | null;
  if (!cartao?.dia_fechamento) return null;

  const { ano, mes } = competenciaParaData(cartao.dia_fechamento, dataCompraIso);

  const { data: existente } = await supabase
    .from("cartoes_faturas")
    .select("*")
    .eq("cartao_id", cartaoId)
    .eq("competencia_ano", ano)
    .eq("competencia_mes", mes)
    .maybeSingle();
  if (existente) return existente as CartaoFatura;

  return criarFatura({
    cartao_id: cartaoId, competencia_ano: ano, competencia_mes: mes, status: "aberta",
    data_fechamento: dataSugerida(cartao.dia_fechamento, ano, mes),
    data_vencimento: cartao.dia_vencimento ? dataSugerida(cartao.dia_vencimento, ano, mes) : null,
    data_pagamento: null, pdf_url: null, comprovante_pagamento_url: null, observacoes: null, criado_por: null,
  });
}
```

Na tela, ao lado de "+ Nova Fatura" (só quando `tipo === 'credito'`), um
novo botão "+ Lançar Compra" abre um formulário com os mesmos campos de
`ModalLancamentos` (data/descrição/fornecedor/conta/valor) mas **sem**
seletor de fatura. No submit:

1. `encontrarOuCriarFaturaParaData(cartao.id, form.data)`.
2. Se retornar uma fatura: `criarLancamentoCartao({ ...form, cartao_id, fatura_id: fatura.id, criado_por })`.
3. Se retornar `null` (cartão sem `dia_fechamento` cadastrado): mostra
   toast pedindo pra cadastrar o dia de fechamento no cartão primeiro
   (editar cartão) — não deixa lançar "no vazio" sem ao menos saber
   pra qual ciclo vai.

O modal `ModalLancamentos` existente (aberto a partir de uma fatura
específica na tabela) continua exatamente como está, pra revisão e
lançamentos avulsos de débito — essa mudança não mexe nele.

## Fora de escopo (YAGNI)

- Feriados nacionais/bancários — não existe tabela no projeto; fica
  como ajuste manual (editar a fatura depois de criada), igual hoje.
- Qualquer coisa retroativa em faturas/lançamentos já existentes.
- Mudar `registrarBaixa`/pagamento genérico — zero toque.
- Notificação/lembrete proativo fora da própria tela de Cartões (ex.
  e-mail, push) — a sugestão só aparece quando o usuário abre a tela.

## Testes

`competenciaParaData`, `dataSugerida`, `clampDiaNoMes` e
`proximoDiaUtil` são funções puras (sem Supabase) — ganham um arquivo
de teste real `services/cartoes.service.test.ts` (vitest) cobrindo pelo
menos: dia de fechamento em fim de semana empurra pro dia útil
seguinte; dia 31 cadastrado em fevereiro clampa pro último dia real;
compra em 03/08 com fechamento sugerido 04/08 fica na competência de
agosto; compra em 05/08 com fechamento sugerido 04/08 vai pra
competência de setembro. `clampDiaNoMes` e `proximoDiaUtil` continuam
privadas (chamadas só internamente por `dataSugerida`); só
`dataSugerida` e `competenciaParaData` são exportadas, por serem o que
o teste precisa chamar diretamente. O resto (chamadas Supabase) segue
sem teste automatizado
disponível, validado manualmente pelo usuário como sempre neste
projeto: `tsc --noEmit` + `next build` limpos, e checagem manual na
tela (fechar fatura de teste sintética e ver a sugestão aparecer;
lançar compra de teste sintética sem fatura e ver ela cair na
competência certa).
