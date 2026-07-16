# Aba "Perda de Vidro" em Documentos Fiscais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba somente-leitura "Perda de Vidro" em Documentos
Fiscais que mostra os últimos 12 meses de perda por tipo de vidro (lendo
`vw_perda_mensal_vidro`), com um atalho por mês que abre o modal de "Nova
NF Perda" já preenchido com o total consolidado do mês.

**Architecture:** Uma função de serviço nova lê a view já existente no
Supabase. Uma nova aba na página `app/contabilidade/documentos/page.tsx`
(padrão já usado pelas outras 5 abas da mesma página) renderiza os dados
agrupados por mês (lógica pura extraída pra `lib/perdaVidro.ts`, testável
sem Supabase). O modal de criação de documento fiscal, já existente,
ganha um prop opcional de pré-preenchimento reaproveitado pelo atalho.

**Tech Stack:** Next.js (App Router, client components), Supabase-js,
TypeScript, Vitest.

## Global Constraints

- Sem teste automatizado para código que só faz I/O de Supabase (nenhuma
  função equivalente no projeto tem teste — ex. `getDocumentosFiscais`).
  Lógica pura (agrupamento, formatação, cálculo de totais) fica em
  `lib/` e ganha teste Vitest, seguindo o padrão de `lib/chapas.ts` /
  `lib/fiscal.ts`.
- Formatação de m² usa `formatM2` de `lib/formatters.ts` (já existe,
  `toFixed(2) + " m²"`, separador decimal com ponto — confirmado pelo
  teste já existente `lib/formatters.test.ts`). Não inventar formatação
  nova.
- Verificação de tipos via `npx tsc --noEmit` ao final de cada task que
  mexe em `.ts`/`.tsx`.
- Spec de referência: `docs/superpowers/specs/2026-07-16-perda-vidro-ui-design.md`.

---

### Task 1: Tipo `PerdaMensalVidro` + serviço `getPerdaMensalVidro()`

**Files:**
- Modify: `types/index.ts:679` (logo após `OtimizacaoPerdaDetalheInsert`)
- Modify: `services/contabilidadeDocumentos.service.ts` (import + função nova no fim do arquivo)

**Interfaces:**
- Produces: `PerdaMensalVidro` (tipo, `types/index.ts`); `getPerdaMensalVidro(): Promise<PerdaMensalVidro[]>` (`services/contabilidadeDocumentos.service.ts`)

- [ ] **Step 1: Adicionar o tipo `PerdaMensalVidro`**

Em `types/index.ts`, localizar (linhas 679-681):

```ts
export type OtimizacaoPerdaDetalheInsert = Omit<OtimizacaoPerdaDetalhe, 'id' | 'created_at'>;

// ─── NOTA FISCAL ───────────────────────────────────────────
```

Substituir por:

```ts
export type OtimizacaoPerdaDetalheInsert = Omit<OtimizacaoPerdaDetalhe, 'id' | 'created_at'>;

// Espelha as colunas de `vw_perda_mensal_vidro` (view, não tabela —
// ver sql/controle-perda-vidro.sql). mes_referencia vem como string
// ISO (date_trunc no mês); tratar sempre via slice(0, 7) = "YYYY-MM".
export interface PerdaMensalVidro {
  produto_id: number | null;
  produto_nome: string;
  mes_referencia: string;
  m2_perda_otimizacao: number;
  valor_perda_otimizacao: number;
  m2_perda_incidente: number;
  valor_perda_incidente: number;
  m2_perda_total: number;
  valor_perda_total: number;
  m2_retalho_salvo: number;
}

// ─── NOTA FISCAL ───────────────────────────────────────────
```

- [ ] **Step 2: Adicionar `getPerdaMensalVidro()` ao serviço**

Em `services/contabilidadeDocumentos.service.ts`, a linha 2 hoje é:

```ts
import type { DocumentoFiscal, DocumentoFiscalInsert } from "@/types";
```

Substituir por:

```ts
import type { DocumentoFiscal, DocumentoFiscalInsert, PerdaMensalVidro } from "@/types";
```

No fim do arquivo (após a função `uploadAnexoDocumentoFiscal`, que termina em `}` na linha 126), adicionar:

```ts

export async function getPerdaMensalVidro(): Promise<PerdaMensalVidro[]> {
  const desde = new Date();
  desde.setDate(1);
  desde.setMonth(desde.getMonth() - 11);
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

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `types/index.ts` ou `services/contabilidadeDocumentos.service.ts`.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts services/contabilidadeDocumentos.service.ts
git commit -m "feat: tipo PerdaMensalVidro e getPerdaMensalVidro()"
```

---

### Task 2: `lib/perdaVidro.ts` — agrupamento e pré-preenchimento (TDD)

**Files:**
- Create: `lib/perdaVidro.ts`
- Test: `lib/perdaVidro.test.ts`

**Interfaces:**
- Consumes: `PerdaMensalVidro` (Task 1); `DocumentoFiscalInsert` (`types/index.ts:788`, já existe); `formatBRL`, `formatM2` (`lib/formatters.ts`, já existem)
- Produces: `interface GrupoMesPerdaVidro { chaveMs: string; label: string; itens: PerdaMensalVidro[]; m2Total: number; valorTotal: number }`; `formatarMesReferencia(chaveMs: string): string`; `agruparPorMes(itens: PerdaMensalVidro[]): GrupoMesPerdaVidro[]`; `montarPrefillNfMes(itens: PerdaMensalVidro[]): Partial<DocumentoFiscalInsert>` — todos exportados de `lib/perdaVidro.ts`

- [ ] **Step 1: Escrever o teste (vai falhar — módulo ainda não existe)**

Criar `lib/perdaVidro.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { agruparPorMes, formatarMesReferencia, montarPrefillNfMes } from "./perdaVidro";
import type { PerdaMensalVidro } from "@/types";

function item(overrides: Partial<PerdaMensalVidro>): PerdaMensalVidro {
  return {
    produto_id: 1,
    produto_nome: "Incolor 4mm",
    mes_referencia: "2026-07-01T00:00:00",
    m2_perda_otimizacao: 0,
    valor_perda_otimizacao: 0,
    m2_perda_incidente: 0,
    valor_perda_incidente: 0,
    m2_perda_total: 0,
    valor_perda_total: 0,
    m2_retalho_salvo: 0,
    ...overrides,
  };
}

describe("formatarMesReferencia", () => {
  it("formata 'YYYY-MM' como 'Mês/Ano'", () => {
    expect(formatarMesReferencia("2026-07")).toBe("Julho/2026");
    expect(formatarMesReferencia("2026-01")).toBe("Janeiro/2026");
  });
});

describe("agruparPorMes", () => {
  it("agrupa itens por mês preservando a ordem de chegada e soma os totais", () => {
    const itens = [
      item({ produto_nome: "Incolor 4mm", mes_referencia: "2026-07-01T00:00:00", m2_perda_total: 12.3, valor_perda_total: 450 }),
      item({ produto_nome: "Verde 6mm", mes_referencia: "2026-07-01T00:00:00", m2_perda_total: 5.2, valor_perda_total: 200 }),
      item({ produto_nome: "Incolor 4mm", mes_referencia: "2026-06-01T00:00:00", m2_perda_total: 3, valor_perda_total: 100 }),
    ];
    const grupos = agruparPorMes(itens);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].chaveMs).toBe("2026-07");
    expect(grupos[0].label).toBe("Julho/2026");
    expect(grupos[0].itens).toHaveLength(2);
    expect(grupos[0].m2Total).toBeCloseTo(17.5);
    expect(grupos[0].valorTotal).toBe(650);
    expect(grupos[1].chaveMs).toBe("2026-06");
  });

  it("retorna lista vazia quando não há itens", () => {
    expect(agruparPorMes([])).toEqual([]);
  });
});

describe("montarPrefillNfMes", () => {
  it("soma quantidade e valor, e discrimina por tipo em observações", () => {
    const itens = [
      item({ produto_nome: "Incolor 4mm", mes_referencia: "2026-07-01T00:00:00", m2_perda_total: 12.3, valor_perda_total: 450 }),
      item({ produto_nome: "Verde 6mm", mes_referencia: "2026-07-01T00:00:00", m2_perda_total: 5.2, valor_perda_total: 200 }),
    ];
    const prefill = montarPrefillNfMes(itens);
    expect(prefill.competencia_ano).toBe(2026);
    expect(prefill.competencia_mes).toBe(7);
    expect(prefill.material).toBe("Incolor 4mm, Verde 6mm");
    expect(prefill.quantidade).toBe(17.5);
    expect(prefill.valor_total).toBe(650);
    expect(prefill.observacoes).toBe(
      "Incolor 4mm: 12.30 m² – R$ 450,00\nVerde 6mm: 5.20 m² – R$ 200,00"
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/perdaVidro.test.ts`
Expected: FAIL — `Cannot find module './perdaVidro'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `lib/perdaVidro.ts`**

```ts
import type { DocumentoFiscalInsert, PerdaMensalVidro } from "@/types";
import { formatBRL, formatM2 } from "./formatters";

const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface GrupoMesPerdaVidro {
  chaveMs: string; // "YYYY-MM"
  label: string;   // "Julho/2026"
  itens: PerdaMensalVidro[];
  m2Total: number;
  valorTotal: number;
}

export function formatarMesReferencia(chaveMs: string): string {
  const [ano, mes] = chaveMs.split("-").map(Number);
  return `${MESES_LONGOS[mes - 1]}/${ano}`;
}

export function agruparPorMes(itens: PerdaMensalVidro[]): GrupoMesPerdaVidro[] {
  const ordem: string[] = [];
  const porMes = new Map<string, PerdaMensalVidro[]>();
  for (const item of itens) {
    const chave = item.mes_referencia.slice(0, 7);
    if (!porMes.has(chave)) { porMes.set(chave, []); ordem.push(chave); }
    porMes.get(chave)!.push(item);
  }
  return ordem.map((chaveMs) => {
    const lista = porMes.get(chaveMs)!;
    return {
      chaveMs,
      label: formatarMesReferencia(chaveMs),
      itens: lista,
      m2Total: lista.reduce((s, l) => s + l.m2_perda_total, 0),
      valorTotal: lista.reduce((s, l) => s + l.valor_perda_total, 0),
    };
  });
}

export function montarPrefillNfMes(itens: PerdaMensalVidro[]): Partial<DocumentoFiscalInsert> {
  const [ano, mes] = itens[0].mes_referencia.slice(0, 7).split("-").map(Number);
  const m2Total = itens.reduce((s, l) => s + l.m2_perda_total, 0);
  const valorTotal = itens.reduce((s, l) => s + l.valor_perda_total, 0);
  return {
    competencia_ano: ano,
    competencia_mes: mes,
    material: itens.map((l) => l.produto_nome).join(", "),
    quantidade: Number(m2Total.toFixed(2)),
    valor_total: Number(valorTotal.toFixed(2)),
    observacoes: itens
      .map((l) => `${l.produto_nome}: ${formatM2(l.m2_perda_total)} – ${formatBRL(l.valor_perda_total)}`)
      .join("\n"),
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/perdaVidro.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add lib/perdaVidro.ts lib/perdaVidro.test.ts
git commit -m "feat: agrupamento e pré-preenchimento de NF pra perda mensal de vidro"
```

---

### Task 3: `ModalDocumento` ganha pré-preenchimento (`valoresIniciais`)

**Files:**
- Modify: `app/contabilidade/documentos/page.tsx:56-72` (interface `ModalDocProps` + assinatura + `base`)

**Interfaces:**
- Consumes: `DocumentoFiscalInsert` (já importado no arquivo)
- Produces: `ModalDocumento` aceita novo prop opcional `valoresIniciais?: Partial<DocumentoFiscalInsert>`, aplicado só quando `editando` é `null`

- [ ] **Step 1: Adicionar o prop na interface**

Em `app/contabilidade/documentos/page.tsx`, localizar (linhas 56-68):

```ts
interface ModalDocProps {
  tipo: TipoDocumentoFiscal;
  titulo: string;
  editando: DocumentoFiscal | null;
  ano: number;
  mes: number;
  fornecedores: Fornecedor[];
  notasVenda: NotaFiscal[];
  itensEstoque: ItemEstoqueGeral[];
  usuarioEmail: string;
  onSalvo: () => void;
  onFechar: () => void;
}
```

Substituir por:

```ts
interface ModalDocProps {
  tipo: TipoDocumentoFiscal;
  titulo: string;
  editando: DocumentoFiscal | null;
  valoresIniciais?: Partial<DocumentoFiscalInsert>;
  ano: number;
  mes: number;
  fornecedores: Fornecedor[];
  notasVenda: NotaFiscal[];
  itensEstoque: ItemEstoqueGeral[];
  usuarioEmail: string;
  onSalvo: () => void;
  onFechar: () => void;
}
```

- [ ] **Step 2: Aplicar o pré-preenchimento na criação**

Localizar (linhas 70-73):

```ts
function ModalDocumento({ tipo, titulo, editando, ano, mes, fornecedores, notasVenda, itensEstoque, usuarioEmail, onSalvo, onFechar }: ModalDocProps) {
  const { toast } = useToast();
  const base = editando ?? docVazio(tipo, ano, mes);
  const [form, setForm] = useState<DocumentoFiscalInsert>({ ...base });
```

Substituir por:

```ts
function ModalDocumento({ tipo, titulo, editando, valoresIniciais, ano, mes, fornecedores, notasVenda, itensEstoque, usuarioEmail, onSalvo, onFechar }: ModalDocProps) {
  const { toast } = useToast();
  const base = editando ?? { ...docVazio(tipo, ano, mes), ...valoresIniciais };
  const [form, setForm] = useState<DocumentoFiscalInsert>({ ...base });
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos (o prop é opcional, o único call site existente hoje continua compilando sem passá-lo).

- [ ] **Step 4: Commit**

```bash
git add app/contabilidade/documentos/page.tsx
git commit -m "feat: ModalDocumento aceita pré-preenchimento via valoresIniciais"
```

---

### Task 4: Aba "Perda de Vidro" — tipo, sub-aba, estado e carregamento

**Files:**
- Modify: `app/contabilidade/documentos/page.tsx` (imports, `AbaDocumentos`, `SUB_ABAS`, estado, `load()`, `mostraNovo`)

**Interfaces:**
- Consumes: `getPerdaMensalVidro()`, `PerdaMensalVidro` (Task 1)
- Produces: estado `perdaVidro: PerdaMensalVidro[]` e `valoresIniciaisModal: Partial<DocumentoFiscalInsert> | undefined` disponíveis pro resto do componente (consumidos na Task 5)

- [ ] **Step 1: Atualizar imports**

Localizar (linhas 12-24):

```ts
import { formatBRL, formatDate } from "@/lib/formatters";
import {
  getDocumentosFiscais,
  criarDocumentoFiscal,
  atualizarDocumentoFiscal,
  softDeleteDocumentoFiscal,
  uploadAnexoDocumentoFiscal,
} from "@/services/contabilidadeDocumentos.service";
import { getResumoNotasSaida, getNotasCanceladas, type ResumoNotasSaida, type NotaCancelada } from "@/services/contabilidadeDashboard.service";
import { getFornecedores } from "@/services/fornecedores.service";
import { getNotas } from "@/services/notas.service";
import { getItensEstoqueGerais } from "@/services/itensEstoqueGerais.service";
import type { DocumentoFiscal, DocumentoFiscalInsert, Fornecedor, ItemEstoqueGeral, NotaFiscal, TipoDocumentoFiscal } from "@/types";
```

Substituir por:

```ts
import { formatBRL, formatDate, formatM2 } from "@/lib/formatters";
import {
  getDocumentosFiscais,
  criarDocumentoFiscal,
  atualizarDocumentoFiscal,
  softDeleteDocumentoFiscal,
  uploadAnexoDocumentoFiscal,
  getPerdaMensalVidro,
} from "@/services/contabilidadeDocumentos.service";
import { getResumoNotasSaida, getNotasCanceladas, type ResumoNotasSaida, type NotaCancelada } from "@/services/contabilidadeDashboard.service";
import { getFornecedores } from "@/services/fornecedores.service";
import { getNotas } from "@/services/notas.service";
import { getItensEstoqueGerais } from "@/services/itensEstoqueGerais.service";
import { agruparPorMes, montarPrefillNfMes, type GrupoMesPerdaVidro } from "@/lib/perdaVidro";
import type { DocumentoFiscal, DocumentoFiscalInsert, Fornecedor, ItemEstoqueGeral, NotaFiscal, PerdaMensalVidro, TipoDocumentoFiscal } from "@/types";
```

- [ ] **Step 2: Adicionar `"perda_vidro"` ao tipo de aba e à lista de sub-abas**

Localizar (linhas 28-37):

```ts
type AbaDocumentos = "compra" | "perda" | "carta_correcao" | "inutilizacao" | "cancelamentos" | "saida";

const SUB_ABAS: { id: AbaDocumentos; label: string }[] = [
  { id: "compra", label: "Compra / Entrada" },
  { id: "saida", label: "Saída" },
  { id: "perda", label: "Perda" },
  { id: "cancelamentos", label: "Cancelamentos" },
  { id: "carta_correcao", label: "Carta de Correção" },
  { id: "inutilizacao", label: "Inutilização" },
];
```

Substituir por:

```ts
type AbaDocumentos = "compra" | "perda" | "perda_vidro" | "carta_correcao" | "inutilizacao" | "cancelamentos" | "saida";

const SUB_ABAS: { id: AbaDocumentos; label: string }[] = [
  { id: "compra", label: "Compra / Entrada" },
  { id: "saida", label: "Saída" },
  { id: "perda", label: "Perda" },
  { id: "perda_vidro", label: "Perda de Vidro" },
  { id: "cancelamentos", label: "Cancelamentos" },
  { id: "carta_correcao", label: "Carta de Correção" },
  { id: "inutilizacao", label: "Inutilização" },
];
```

- [ ] **Step 3: Adicionar estado novo**

Localizar (linhas 317-326):

```ts
  const [docs, setDocs] = useState<DocumentoFiscal[]>([]);
  const [resumoSaida, setResumoSaida] = useState<ResumoNotasSaida | null>(null);
  const [canceladas, setCanceladas] = useState<NotaCancelada[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [notasVenda, setNotasVenda] = useState<NotaFiscal[]>([]);
  const [itensEstoque, setItensEstoque] = useState<ItemEstoqueGeral[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<DocumentoFiscal | null>(null);
  const [modalAberto, setModalAberto] = useState<TipoDocumentoFiscal | null>(null);
```

Substituir por:

```ts
  const [docs, setDocs] = useState<DocumentoFiscal[]>([]);
  const [resumoSaida, setResumoSaida] = useState<ResumoNotasSaida | null>(null);
  const [canceladas, setCanceladas] = useState<NotaCancelada[]>([]);
  const [perdaVidro, setPerdaVidro] = useState<PerdaMensalVidro[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [notasVenda, setNotasVenda] = useState<NotaFiscal[]>([]);
  const [itensEstoque, setItensEstoque] = useState<ItemEstoqueGeral[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<DocumentoFiscal | null>(null);
  const [modalAberto, setModalAberto] = useState<TipoDocumentoFiscal | null>(null);
  const [valoresIniciaisModal, setValoresIniciaisModal] = useState<Partial<DocumentoFiscalInsert> | undefined>(undefined);
```

- [ ] **Step 4: Buscar os dados em `load()`**

Localizar (linhas 336-354):

```ts
  async function load() {
    setLoading(true);
    if (aba === "saida") {
      setResumoSaida(await getResumoNotasSaida(ano, mes));
    } else if (aba === "cancelamentos") {
      setCanceladas(await getNotasCanceladas(ano, mes));
    } else if (aba === "carta_correcao") {
      const [d, notas] = await Promise.all([
        getDocumentosFiscais({ tipo: "carta_correcao", competenciaAno: ano, competenciaMes: mes }),
        getNotas(),
      ]);
      setDocs(d);
      setNotasVenda(notas.filter((n) => n.status === "autorizada"));
    } else {
      const tipo = aba as TipoDocumentoFiscal;
      setDocs(await getDocumentosFiscais({ tipo, competenciaAno: ano, competenciaMes: mes }));
    }
    setLoading(false);
  }
```

Substituir por:

```ts
  async function load() {
    setLoading(true);
    if (aba === "saida") {
      setResumoSaida(await getResumoNotasSaida(ano, mes));
    } else if (aba === "cancelamentos") {
      setCanceladas(await getNotasCanceladas(ano, mes));
    } else if (aba === "carta_correcao") {
      const [d, notas] = await Promise.all([
        getDocumentosFiscais({ tipo: "carta_correcao", competenciaAno: ano, competenciaMes: mes }),
        getNotas(),
      ]);
      setDocs(d);
      setNotasVenda(notas.filter((n) => n.status === "autorizada"));
    } else if (aba === "perda_vidro") {
      setPerdaVidro(await getPerdaMensalVidro());
    } else {
      const tipo = aba as TipoDocumentoFiscal;
      setDocs(await getDocumentosFiscais({ tipo, competenciaAno: ano, competenciaMes: mes }));
    }
    setLoading(false);
  }
```

- [ ] **Step 5: Esconder seletor de mês/ano e "+ Novo" nesta aba**

Localizar (linha 373):

```ts
  const mostraNovo = aba !== "saida";
```

Substituir por:

```ts
  const mostraNovo = aba !== "saida" && aba !== "perda_vidro";
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos (o import `GrupoMesPerdaVidro`, `agruparPorMes`, `montarPrefillNfMes` fica sem uso até a Task 5 — se o linter/tsc acusar import não usado, ignorar por ora; é consumido na próxima task do mesmo arquivo).

- [ ] **Step 7: Commit**

```bash
git add app/contabilidade/documentos/page.tsx
git commit -m "feat: aba Perda de Vidro carrega vw_perda_mensal_vidro"
```

---

### Task 5: Componente `SecaoPerdaVidro` + atalho "Gerar NF do mês"

**Files:**
- Modify: `app/contabilidade/documentos/page.tsx` (render principal, handler novo, componente novo no fim do arquivo)

**Interfaces:**
- Consumes: `agruparPorMes`, `montarPrefillNfMes`, `GrupoMesPerdaVidro` (Task 2); `valoresIniciais` prop de `ModalDocumento` (Task 3); estado `perdaVidro`, `valoresIniciaisModal` (Task 4); `formatM2`, `formatBRL` (`lib/formatters.ts`)
- Produces: componente `SecaoPerdaVidro`; função `handleGerarNfMes` no componente principal

- [ ] **Step 1: Handler que abre o modal pré-preenchido**

Em `app/contabilidade/documentos/page.tsx`, logo depois de `handleExcluir` (linhas 356-362), adicionar:

```ts
  function handleGerarNfMes(grupo: GrupoMesPerdaVidro) {
    setEditando(null);
    setValoresIniciaisModal(montarPrefillNfMes(grupo.itens));
    setModalAberto("perda");
  }
```

- [ ] **Step 2: Passar `valoresIniciais` pro modal e limpar ao fechar/salvar/criar manual**

Localizar o bloco do modal (linhas 382-396):

```tsx
      {modalAberto && (
        <ModalDocumento
          tipo={modalAberto}
          titulo={tituloModal[modalAberto]}
          editando={editando}
          ano={ano}
          mes={mes}
          fornecedores={fornecedores}
          notasVenda={notasVenda}
          itensEstoque={itensEstoque}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalAberto(null); setEditando(null); load(); }}
          onFechar={() => { setModalAberto(null); setEditando(null); }}
        />
      )}
```

Substituir por:

```tsx
      {modalAberto && (
        <ModalDocumento
          tipo={modalAberto}
          titulo={tituloModal[modalAberto]}
          editando={editando}
          valoresIniciais={valoresIniciaisModal}
          ano={ano}
          mes={mes}
          fornecedores={fornecedores}
          notasVenda={notasVenda}
          itensEstoque={itensEstoque}
          usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalAberto(null); setEditando(null); setValoresIniciaisModal(undefined); load(); }}
          onFechar={() => { setModalAberto(null); setEditando(null); setValoresIniciaisModal(undefined); }}
        />
      )}
```

Localizar o botão "+ Novo" (linha 417):

```tsx
              <button className="btn bp sm" onClick={() => { setEditando(null); setModalAberto(tipoModalAtivo); }}>
                + Novo
              </button>
```

Substituir por:

```tsx
              <button className="btn bp sm" onClick={() => { setEditando(null); setValoresIniciaisModal(undefined); setModalAberto(tipoModalAtivo); }}>
                + Novo
              </button>
```

- [ ] **Step 3: Renderizar a nova seção**

Localizar (linhas 424-437):

```tsx
        {loading ? (
          <div className="loading">Carregando...</div>
        ) : aba === "saida" ? (
          <SecaoSaida resumo={resumoSaida} />
        ) : aba === "cancelamentos" ? (
          <SecaoCancelamentos itens={canceladas} />
        ) : (
          <SecaoDocumentos
            aba={aba}
            docs={docs}
            onEditar={(d) => { setEditando(d); setModalAberto(d.tipo); }}
            onExcluir={handleExcluir}
          />
        )}
```

Substituir por:

```tsx
        {loading ? (
          <div className="loading">Carregando...</div>
        ) : aba === "saida" ? (
          <SecaoSaida resumo={resumoSaida} />
        ) : aba === "cancelamentos" ? (
          <SecaoCancelamentos itens={canceladas} />
        ) : aba === "perda_vidro" ? (
          <SecaoPerdaVidro itens={perdaVidro} onGerarNf={handleGerarNfMes} />
        ) : (
          <SecaoDocumentos
            aba={aba}
            docs={docs}
            onEditar={(d) => { setEditando(d); setModalAberto(d.tipo); }}
            onExcluir={handleExcluir}
          />
        )}
```

- [ ] **Step 4: Componente `SecaoPerdaVidro`**

No fim do arquivo, depois de `SecaoCancelamentos` (após a linha 587), adicionar:

```tsx

// ─── Seção: Perda de Vidro (mensal, agregada da view) ───────
function SecaoPerdaVidro({ itens, onGerarNf }: {
  itens: PerdaMensalVidro[];
  onGerarNf: (grupo: GrupoMesPerdaVidro) => void;
}) {
  const grupos = agruparPorMes(itens);

  if (grupos.length === 0) {
    return <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhuma perda registrada nos últimos 12 meses.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {grupos.map((grupo) => (
        <div key={grupo.chaveMs}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>{grupo.label}</div>
            <button className="btn bg sm" onClick={() => onGerarNf(grupo)}>Gerar NF do mês</button>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr><th>Tipo de Vidro</th><th>m² Perdido</th><th>Valor Perdido</th></tr>
              </thead>
              <tbody>
                {grupo.itens.map((item) => (
                  <tr key={`${grupo.chaveMs}-${item.produto_id ?? item.produto_nome}`}>
                    <td>{item.produto_nome}</td>
                    <td className="mono">{formatM2(item.m2_perda_total)}</td>
                    <td className="mono">{formatBRL(item.valor_perda_total)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td>Total do mês</td>
                  <td className="mono">{formatM2(grupo.m2Total)}</td>
                  <td className="mono">{formatBRL(grupo.valorTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add app/contabilidade/documentos/page.tsx
git commit -m "feat: tabela de Perda de Vidro por mês + atalho Gerar NF do mês"
```

---

### Task 6: Verificação manual (fluxo completo)

**Files:** nenhum (só validação)

**Interfaces:** N/A

- [ ] **Step 1: Rodar a suíte completa e o build**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 2: Subir o dev server**

Run: `npm run dev`

- [ ] **Step 3: Conferir dados contra o Supabase**

No SQL Editor do Supabase, rodar `select * from public.vw_perda_mensal_vidro order by mes_referencia desc limit 20;` e comparar com o que aparece na aba "Perda de Vidro" (Documentos Fiscais → Perda de Vidro) — mesmos tipos de vidro, mesmos m²/valor por mês.

- [ ] **Step 4: Testar o atalho "Gerar NF do mês"**

Escolher um mês com mais de um tipo de vidro (se não houver, usar qualquer mês com pelo menos 1 linha). Clicar "Gerar NF do mês" e conferir no modal:
- `Quantidade` = soma dos m² daquele mês
- `Valor` = soma dos valores daquele mês
- `Observações` traz uma linha por tipo de vidro com m² e valor individuais
- `Competência` (mês/ano) bate com o mês da seção clicada

Preencher "Motivo" (obrigatório) e salvar. Confirmar que o documento aparece na aba "Perda" (manual) logo em seguida.

- [ ] **Step 5: Conferir que a criação manual continua funcionando**

Ir na aba "Perda" (não "Perda de Vidro"), clicar "+ Novo", confirmar que o formulário abre vazio (sem herdar valores do atalho usado no passo anterior), preencher e salvar normalmente.
