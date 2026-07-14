# Reconhecimento Automático de Fatura (Cartão Corporativo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sugerir automaticamente a próxima fatura de crédito ao fechar a atual (datas calculadas do `dia_fechamento`/`dia_vencimento` do cartão) e permitir lançar uma compra sem escolher a fatura manualmente.

**Architecture:** Toda a lógica de cálculo de data mora em `services/cartoes.service.ts` como funções puras testáveis, mais 2 funções públicas que combinam esse cálculo com queries no Supabase. A UI (`app/contabilidade/cartoes/page.tsx`) ganha um card de sugestão acima da tabela de faturas e um novo botão/modal "+ Lançar Compra".

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase + vitest.

## Global Constraints

- Sem tabela de feriados no projeto — ajuste de data cobre só sábado/domingo, feriado específico continua edição manual (spec, seção "Cálculo de datas").
- Zero mudança em `registrarBaixa`/pagamento genérico ou em qualquer fatura/lançamento já existente — só vale pra frente (spec, seção "Fora de escopo").
- `Cartao.dia_fechamento`/`dia_vencimento` são `number | null` — toda função que depende deles devolve `null`/cai pro fluxo manual quando ausentes, nunca lança exceção (spec, seções "Parte 1" e "Parte 2").
- Nomes de campo exatos (conferidos em `types/index.ts` nesta sessão): `CartaoFatura.status` é `'aberta' | 'fechada' | 'paga'`; `CartaoFaturaInsert = Omit<CartaoFatura, 'id' | 'valor_total' | 'created_at' | 'updated_at' | 'cartoes' | 'lancamento_id'>`.
- Sem Supabase real disponível em teste automatizado — só as funções puras de data ganham teste vitest real; o resto é validado manualmente pelo usuário na tela, sempre com cartão/fatura/lançamento sintéticos de teste, nunca em registro real.
- Convenção da sessão: commit e push imediatamente após cada task concluída, sem esperar pedido.

---

### Task 1: Funções puras de cálculo de data + testes

**Files:**
- Modify: `services/cartoes.service.ts` (adicionar ao final do arquivo, após a seção "─── Storage ────")
- Create: `services/cartoes.service.test.ts`

**Interfaces:**
- Produces: `export function dataSugerida(diaCadastrado: number, ano: number, mes: number): string` — devolve data ISO (`YYYY-MM-DD`).
- Produces: `export function competenciaParaData(diaFechamento: number, dataCompraIso: string): { ano: number; mes: number }`.
- Produces (privadas, só usadas internamente): `clampDiaNoMes(dia: number, ano: number, mes: number): number`, `proximoDiaUtil(ano: number, mes: number, dia: number): string`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `services/cartoes.service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dataSugerida, competenciaParaData } from "./cartoes.service";

describe("dataSugerida", () => {
  it("empurra o dia cadastrado pro próximo dia útil quando cai em fim de semana", () => {
    // 02/08/2026 é domingo — mesmo caso que o usuário descreveu (dia 2 num mês, dia 3 no outro)
    expect(dataSugerida(2, 2026, 8)).toBe("2026-08-03");
  });

  it("não mexe na data quando o dia cadastrado já cai em dia útil", () => {
    // 02/01/2026 é sexta-feira
    expect(dataSugerida(2, 2026, 1)).toBe("2026-01-02");
  });

  it("clampa o dia cadastrado ao último dia real do mês", () => {
    // fevereiro de 2028 (bissexto) só tem 29 dias; dia 29/02/2028 é terça (dia útil)
    expect(dataSugerida(31, 2028, 2)).toBe("2028-02-29");
  });
});

describe("competenciaParaData", () => {
  it("compra até a data de fechamento sugerida fica na competência do próprio mês", () => {
    // dia_fechamento=2 em agosto/2026 sugere 03/08 (domingo empurrado pra segunda)
    expect(competenciaParaData(2, "2026-08-03")).toEqual({ ano: 2026, mes: 8 });
    expect(competenciaParaData(2, "2026-08-01")).toEqual({ ano: 2026, mes: 8 });
  });

  it("compra depois da data de fechamento sugerida vai pra competência seguinte", () => {
    expect(competenciaParaData(2, "2026-08-04")).toEqual({ ano: 2026, mes: 9 });
  });

  it("vira o ano quando a competência seguinte é janeiro", () => {
    // dia_fechamento=2 em dezembro/2026 (02/12/2026 é quarta, dia útil) — compra depois vai pra jan/2027
    expect(competenciaParaData(2, "2026-12-03")).toEqual({ ano: 2027, mes: 1 });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run services/cartoes.service.test.ts`
Expected: FAIL — `dataSugerida`/`competenciaParaData` não existem em `services/cartoes.service.ts`.

- [ ] **Step 3: Implementar as funções**

No final de `services/cartoes.service.ts` (depois de `uploadAnexoCartao`), adicionar:

```ts
// ─── Reconhecimento de fatura (cálculo de datas) ────────────

function clampDiaNoMes(dia: number, ano: number, mes: number): number {
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate(); // mes é 1-based
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
 *  ajuste manual). Exportada só pra ser testada diretamente. */
export function dataSugerida(diaCadastrado: number, ano: number, mes: number): string {
  const dia = clampDiaNoMes(diaCadastrado, ano, mes);
  return proximoDiaUtil(ano, mes, dia);
}

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

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run services/cartoes.service.test.ts`
Expected: PASS — 7 testes verdes.

- [ ] **Step 5: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit e push**

```bash
git add services/cartoes.service.ts services/cartoes.service.test.ts
git commit -m "feat: calculo de data sugerida e competencia para fatura de cartao

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Sugestão de próxima fatura + auto-anexo de compra (camada de serviço)

**Files:**
- Modify: `services/cartoes.service.ts` (adicionar logo após as funções da Task 1)

**Interfaces:**
- Consumes: `dataSugerida` e `criarFatura` (já existe em `services/cartoes.service.ts:88-94`).
- Produces: `export interface SugestaoProximaFatura { competenciaAno: number; competenciaMes: number; dataFechamento: string; dataVencimento: string }`.
- Produces: `export async function sugerirProximaFatura(cartaoId: number): Promise<SugestaoProximaFatura | null>`.
- Produces: `export async function encontrarOuCriarFaturaParaData(cartaoId: number, dataCompraIso: string): Promise<CartaoFatura | null>`.

- [ ] **Step 1: Implementar `sugerirProximaFatura`**

Logo depois de `competenciaParaData` (final de `services/cartoes.service.ts`), adicionar:

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

- [ ] **Step 2: Implementar `encontrarOuCriarFaturaParaData`**

Logo em seguida:

```ts
/** Acha a fatura da competência calculada pra essa data de compra; se
 *  não existir, cria com as datas sugeridas. Cartão sem dia_fechamento
 *  cadastrado não tem como calcular competência — devolve null
 *  (chamador cai pro fluxo manual). */
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

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. (Sem teste automatizado aqui — ambas as funções dependem de Supabase real; cobertura fica na Task 5, validação manual.)

- [ ] **Step 4: Commit e push**

```bash
git add services/cartoes.service.ts
git commit -m "feat: sugerirProximaFatura e encontrarOuCriarFaturaParaData no service de cartoes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Card de sugestão de próxima fatura na tela

**Files:**
- Modify: `app/contabilidade/cartoes/page.tsx`

**Interfaces:**
- Consumes: `sugerirProximaFatura(cartaoId: number): Promise<SugestaoProximaFatura | null>` e `SugestaoProximaFatura` (Task 2), `criarFatura` (já importado na página, `services/cartoes.service.ts:88-94`).

- [ ] **Step 1: Importar a nova função e o novo tipo**

Em `app/contabilidade/cartoes/page.tsx:14-19`, o bloco de import de `@/services/cartoes.service` hoje é:

```ts
import {
  getCartoes, criarCartao, atualizarCartao, inativarCartao, reativarCartao,
  getFaturas, criarFatura, atualizarFatura,
  getLancamentosFatura, getLancamentosCartao, criarLancamentoCartao, atualizarLancamentoCartao, softDeleteLancamentoCartao,
  uploadAnexoCartao,
} from "@/services/cartoes.service";
```

Trocar por:

```ts
import {
  getCartoes, criarCartao, atualizarCartao, inativarCartao, reativarCartao,
  getFaturas, criarFatura, atualizarFatura,
  getLancamentosFatura, getLancamentosCartao, criarLancamentoCartao, atualizarLancamentoCartao, softDeleteLancamentoCartao,
  uploadAnexoCartao, sugerirProximaFatura, encontrarOuCriarFaturaParaData,
} from "@/services/cartoes.service";
import type { SugestaoProximaFatura } from "@/services/cartoes.service";
```

- [ ] **Step 2: Adicionar estado da sugestão e atualizar `loadFaturas`**

Em `app/contabilidade/cartoes/page.tsx:352`, logo abaixo de `const [faturas, setFaturas] = useState<CartaoFatura[]>([]);`, adicionar:

```ts
const [sugestaoFatura, setSugestaoFatura] = useState<SugestaoProximaFatura | null>(null);
```

Em `app/contabilidade/cartoes/page.tsx:389-391`, o corpo de `loadFaturas` hoje é:

```ts
  async function loadFaturas(cartaoId: number) {
    setFaturas(await getFaturas({ cartaoId }));
  }
```

Trocar por:

```ts
  async function loadFaturas(cartaoId: number) {
    setFaturas(await getFaturas({ cartaoId }));
    setSugestaoFatura(cartaoSelecionado?.tipo === "credito" ? await sugerirProximaFatura(cartaoId) : null);
  }
```

- [ ] **Step 3: Adicionar o handler que cria a fatura sugerida**

Logo depois de `handleInativar` (`app/contabilidade/cartoes/page.tsx:393-398`), adicionar:

```ts
  async function handleCriarFaturaSugerida() {
    if (!cartaoSelecionado || !sugestaoFatura) return;
    const criada = await criarFatura({
      cartao_id: cartaoSelecionado.id,
      competencia_ano: sugestaoFatura.competenciaAno,
      competencia_mes: sugestaoFatura.competenciaMes,
      status: "aberta",
      data_fechamento: sugestaoFatura.dataFechamento,
      data_vencimento: sugestaoFatura.dataVencimento,
      data_pagamento: null, pdf_url: null, comprovante_pagamento_url: null, observacoes: null, criado_por: null,
    });
    if (!criada) { toast("Erro ao criar fatura", "err"); return; }
    toast("Fatura criada");
    loadFaturas(cartaoSelecionado.id);
  }
```

- [ ] **Step 4: Renderizar o card de sugestão**

Em `app/contabilidade/cartoes/page.tsx:492-494`, hoje é:

```tsx
            </div>

            {cartaoSelecionado.tipo === "credito" && (
              faturas.length === 0 ? (
```

Trocar por:

```tsx
            </div>

            {cartaoSelecionado.tipo === "credito" && sugestaoFatura && (
              <div className="card" style={{ padding: "14px 18px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", border: "1px solid var(--acc)" }}>
                <div style={{ fontSize: "12.5px", color: "var(--t2)" }}>
                  Fatura anterior fechou. Criar {String(sugestaoFatura.competenciaMes).padStart(2, "0")}/{sugestaoFatura.competenciaAno} — fecha {formatDate(sugestaoFatura.dataFechamento)}, vence {formatDate(sugestaoFatura.dataVencimento)}?
                </div>
                <button className="btn bp sm" onClick={handleCriarFaturaSugerida}>Criar fatura</button>
              </div>
            )}

            {cartaoSelecionado.tipo === "credito" && (
              faturas.length === 0 ? (
```

- [ ] **Step 5: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit e push**

```bash
git add app/contabilidade/cartoes/page.tsx
git commit -m "feat: card de sugestao da proxima fatura na tela de cartoes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Botão e modal "+ Lançar Compra" (auto-anexo por data)

**Files:**
- Modify: `app/contabilidade/cartoes/page.tsx`

**Interfaces:**
- Consumes: `encontrarOuCriarFaturaParaData(cartaoId: number, dataCompraIso: string): Promise<CartaoFatura | null>` (Task 2), `criarLancamentoCartao` e `LANC_VAZIO` (já existentes na página, `app/contabilidade/cartoes/page.tsx:37-41` e `:170`), `Fornecedor`, `ContaBancaria` (já importados), `PlanoContasOpcao` (já definido em `app/contabilidade/cartoes/page.tsx:27`).

- [ ] **Step 1: Criar o componente `ModalLancarCompra`**

Logo depois do fechamento de `ModalFatura` (`app/contabilidade/cartoes/page.tsx:217`, a linha `}` que fecha a função, antes do comentário `// ─── Modal: Lançamentos da Fatura ───────────────────`), adicionar:

```tsx
// ─── Modal: Lançar Compra (sem escolher fatura) ─────────────
function ModalLancarCompra({ cartao, fornecedores, planoContas, usuarioEmail, onFechar, onSalvo }: {
  cartao: Cartao; fornecedores: Fornecedor[]; planoContas: PlanoContasOpcao[]; usuarioEmail: string;
  onFechar: () => void; onSalvo: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<typeof LANC_VAZIO>({ ...LANC_VAZIO });
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof typeof LANC_VAZIO>(k: K, v: (typeof LANC_VAZIO)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim() || !form.valor) { toast("Preencha descrição e valor", "err"); return; }
    setSalvando(true);
    const fatura = await encontrarOuCriarFaturaParaData(cartao.id, form.data);
    if (!fatura) {
      toast("Cadastre o dia de fechamento do cartão antes de lançar", "err");
      setSalvando(false);
      return;
    }
    const criado = await criarLancamentoCartao({ ...form, cartao_id: cartao.id, fatura_id: fatura.id, criado_por: usuarioEmail });
    setSalvando(false);
    if (!criado) { toast("Erro ao lançar compra", "err"); return; }
    toast(`Lançado na fatura ${String(fatura.competencia_mes).padStart(2, "0")}/${fatura.competencia_ano}`);
    onSalvo();
  }

  return (
    <Modal open onClose={onFechar} title={`Lançar Compra — ${cartao.nome}`} width="480px">
        <form id="form-lancar-compra" onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <Campo label="Data">
            <input className="fc" type="date" value={form.data} onChange={(e) => set("data", e.target.value)} required />
          </Campo>
          <Campo label="Descrição">
            <input className="fc" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
          </Campo>
          <Campo label="Fornecedor">
            <select className="fc" value={form.fornecedor_id ?? ""} onChange={(e) => set("fornecedor_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Conta">
            <select className="fc" value={form.plano_contas_id ?? ""} onChange={(e) => set("plano_contas_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {planoContas.map((p) => <option key={p.id} value={p.id}>{p.codigo_estruturado}</option>)}
            </select>
          </Campo>
          <Campo label="Valor">
            <input className="fc" type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", Number(e.target.value))} required style={{ fontFamily: "'DM Mono', monospace" }} />
          </Campo>
        </form>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form="form-lancar-compra" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Lançar"}</button>
        </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Adicionar estado do modal na página principal**

Em `app/contabilidade/cartoes/page.tsx:363`, logo abaixo de `const [faturaLancamentos, setFaturaLancamentos] = useState<CartaoFatura | null | "avulso">(null);`, adicionar:

```ts
  const [modalLancarCompraAberto, setModalLancarCompraAberto] = useState(false);
```

- [ ] **Step 3: Renderizar o modal condicionalmente**

Em `app/contabilidade/cartoes/page.tsx:426-436`, logo depois do bloco `{faturaLancamentos && cartaoSelecionado && ( <ModalLancamentos ... /> )}`, adicionar:

```tsx
      {modalLancarCompraAberto && cartaoSelecionado && (
        <ModalLancarCompra
          cartao={cartaoSelecionado}
          fornecedores={fornecedores}
          planoContas={planoContas}
          usuarioEmail={usuarioEmail}
          onFechar={() => setModalLancarCompraAberto(false)}
          onSalvo={() => { setModalLancarCompraAberto(false); loadFaturas(cartaoSelecionado.id); }}
        />
      )}
```

- [ ] **Step 4: Adicionar o botão "+ Lançar Compra"**

Em `app/contabilidade/cartoes/page.tsx:487-491`, hoje é:

```tsx
              {cartaoSelecionado.tipo === "credito" ? (
                <button className="btn bp sm" onClick={() => { setEditandoFatura(null); setModalFaturaAberto(true); }}>+ Nova Fatura</button>
              ) : (
                <button className="btn bp sm" onClick={() => setFaturaLancamentos("avulso")}>+ Ver Lançamentos</button>
              )}
```

Trocar por:

```tsx
              {cartaoSelecionado.tipo === "credito" ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="btn bg sm" onClick={() => setModalLancarCompraAberto(true)}>+ Lançar Compra</button>
                  <button className="btn bp sm" onClick={() => { setEditandoFatura(null); setModalFaturaAberto(true); }}>+ Nova Fatura</button>
                </div>
              ) : (
                <button className="btn bp sm" onClick={() => setFaturaLancamentos("avulso")}>+ Ver Lançamentos</button>
              )}
```

- [ ] **Step 5: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit e push**

```bash
git add app/contabilidade/cartoes/page.tsx
git commit -m "feat: botao e modal Lancar Compra sem escolher fatura manualmente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 5: Verificação final e memória

**Files:**
- Modify: `C:\Users\ADM 01\.claude\projects\C--Users-ADM-01-urban-glass-erp\memory\project-auditoria-fiscal-contabil.md`
- Modify: `C:\Users\ADM 01\.claude\projects\C--Users-ADM-01-urban-glass-erp\memory\MEMORY.md`

**Interfaces:**
- Consumes: nada de código — só documentação/memória.

- [ ] **Step 1: Rodar a suíte completa de testes**

Run: `npm run test`
Expected: todos os testes verdes, incluindo os 7 novos de `services/cartoes.service.test.ts`.

- [ ] **Step 2: Rodar `tsc` e `build` uma última vez no HEAD final**

Run: `npx tsc --noEmit && npm run build`
Expected: ambos limpos.

- [ ] **Step 3: Atualizar a memória do projeto**

Adicionar ao final de `project-auditoria-fiscal-contabil.md` (antes da linha "Relacionado:"), um parágrafo novo:

```markdown
**Extensão 2026-07-15 — Reconhecimento automático de fatura**: como o
dia de fechamento do cartão varia mês a mês (cai em fim de semana),
o módulo ganhou cálculo de data (`dataSugerida`/`competenciaParaData`
em `services/cartoes.service.ts`, com teste vitest real) que sugere a
próxima fatura ao fechar a atual (card na tela, botão "Criar fatura")
e anexa uma compra à fatura certa sozinho via novo botão "+ Lançar
Compra" (cria a fatura se ainda não existir). Spec
`docs/superpowers/specs/2026-07-15-cartao-reconhecimento-fatura-design.md`,
plano `docs/superpowers/plans/2026-07-15-cartao-reconhecimento-fatura.md`.
Mesma limitação de sempre: sem tabela de feriados, só ajusta fim de
semana; sem retroativo. Validação manual do usuário ainda pendente
(fechar fatura de teste e ver a sugestão aparecer; lançar compra de
teste com data futura/passada e ver ela cair na competência certa).
```

Atualizar a linha do índice de `project-auditoria-fiscal-contabil.md` em `MEMORY.md` pra mencionar a extensão, mantendo o resto do arquivo intacto.

- [ ] **Step 4: Conferir que não sobrou nada do repositório do ERP sem commit**

O diretório de memória (`C:\Users\ADM 01\.claude\projects\...\memory\`) fica
fora do repositório do ERP — os Steps 1-3 acima não geram nenhum commit
nesse repositório. Rodar só pra confirmar:

Run: `git status`
Expected: working tree limpo (tudo já commitado/pushado nas Tasks 1-4).
