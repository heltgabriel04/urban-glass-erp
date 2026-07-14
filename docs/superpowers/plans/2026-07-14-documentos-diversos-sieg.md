# Documentos Diversos (gap do SIEG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo novo em Contabilidade pra registrar despesas administrativas recorrentes que o SIEG (captura de NF-e/NFS-e) não cobre — conta de energia/água/telefone, guia de imposto, boleto diverso, reembolso de funcionário — com lançamento financeiro automático, alerta de documento sem PDF, e integração no semáforo/checklist mensal.

**Architecture:** Tabela nova `documentos_diversos` (independente de `documentos_fiscais` — não é NF-e) + `services/contabilidadeDocumentosDiversos.service.ts` + página nova `/contabilidade/diversos` (mesmo padrão estrutural de `/contabilidade/ativo-imobilizado`: lista + modal de formulário). Integra nos 3 pontos já existentes de Contabilidade: `ContabilidadeTabs`, o semáforo/alertas de `contabilidadeDashboard.service.ts`, e o catálogo de `lib/contabilidadeChecklist.ts`.

**Tech Stack:** Next.js/TypeScript, Supabase JS v2, SQL puro (RLS + policies).

## Global Constraints

- Soft-delete (`deletado_em`/`deletado_por`/`motivo_exclusao`) — nunca DELETE físico, mesmo padrão de `documentos_fiscais`.
- Categoria em lista fixa de 7 valores, não texto livre.
- Sem centro de custo (removido do sistema antes da Fase 1 da Contabilidade, decisão deliberada — não recriar aqui mesmo estando no prompt original da auditoria).
- Lançamento financeiro é gerado uma vez, na criação — sem checagem de idempotência (diferente do padrão de Compras, que precisa disso porque pode ser chamado de novo).
- Sem teste automatizado disponível para funções que fazem query real no Supabase — validar via `tsc --noEmit` + `next build` + conferência manual.
- Spec de referência: `docs/superpowers/specs/2026-07-14-documentos-diversos-sieg-design.md`.

---

### Task 1: SQL — tabela `documentos_diversos`

**Files:**
- Create: `sql/contabilidade-documentos-diversos.sql`
- Modify: `sql/MANIFEST.md`

- [ ] **Step 1: Criar o arquivo SQL**

```sql
-- Contabilidade — Documentos Diversos (gap do SIEG)
-- Despesas administrativas recorrentes que não são NF-e/NFS-e (o SIEG só
-- captura documento fiscal formal): energia, água, telefone/internet,
-- guia de imposto, boleto diverso, reembolso de funcionário. Ao criar,
-- gera automaticamente um lançamento de Saída em Contas a Pagar vinculado
-- (lancamento_id) — mesmo espírito de gerarContaAPagarDaCompra.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS documentos_diversos (
  id                bigserial PRIMARY KEY,
  categoria         text NOT NULL CHECK (categoria IN (
                      'energia','agua','telefone_internet','guia_imposto',
                      'boleto_diverso','reembolso_funcionario','outros')),
  fornecedor_id     int REFERENCES fornecedores(id),
  competencia_ano   int NOT NULL,
  competencia_mes   int NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  descricao         text NOT NULL,
  valor             numeric(14,2) NOT NULL,
  vencimento        date,
  pdf_url           text,
  lancamento_id     int REFERENCES lancamentos(id),
  observacoes       text,
  deletado_em       timestamptz,
  deletado_por      text,
  motivo_exclusao   text,
  criado_por        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_diversos_competencia ON documentos_diversos (competencia_ano, competencia_mes) WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_diversos_categoria    ON documentos_diversos (categoria)   WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_diversos_fornecedor   ON documentos_diversos (fornecedor_id);

ALTER TABLE documentos_diversos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'documentos_diversos') THEN
    CREATE POLICY "auth_select" ON documentos_diversos FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'documentos_diversos') THEN
    CREATE POLICY "auth_insert" ON documentos_diversos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'documentos_diversos') THEN
    CREATE POLICY "auth_update" ON documentos_diversos FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;
-- Sem policy de DELETE — exclusão é sempre soft-delete via UPDATE (deletado_em).
```

- [ ] **Step 2: Adicionar linha ao manifesto**, no fim da tabela de `sql/MANIFEST.md`:

```
| 2026-07-14 | `sql/contabilidade-documentos-diversos.sql` | Contabilidade — Documentos Diversos (gap do SIEG) | ⏳ |
```

(Coloque essa linha depois da linha de `sql/crm-interacoes-cliente.sql` já adicionada nesta mesma sessão.)

- [ ] **Step 3: Commit**

```bash
git add sql/contabilidade-documentos-diversos.sql sql/MANIFEST.md
git commit -m "docs: adiciona SQL da tabela documentos_diversos (gap do SIEG)"
```

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `CategoriaDocumentoDiverso`, `DocumentoDiverso`, `DocumentoDiversoInsert` — consumidos pelas Tasks 3, 4 e 6.

- [ ] **Step 1: Adicionar logo depois do bloco `InteracaoCliente`** (a interação que a sessão adicionou antes desta — procurar `export type InteracaoClienteInsert = Omit<InteracaoCliente, 'id' | 'created_at' | 'data'>;` e inserir depois dessa linha, antes do comentário `// ─── RETALHO`)

```ts
// ─── DOCUMENTO DIVERSO (gap do SIEG) ──────────────────────
export type CategoriaDocumentoDiverso =
  | 'energia' | 'agua' | 'telefone_internet' | 'guia_imposto'
  | 'boleto_diverso' | 'reembolso_funcionario' | 'outros';

export interface DocumentoDiverso {
  id: number;
  categoria: CategoriaDocumentoDiverso;
  fornecedor_id: number | null;
  competencia_ano: number;
  competencia_mes: number;
  descricao: string;
  valor: number;
  vencimento: string | null;
  pdf_url: string | null;
  lancamento_id: number | null;
  observacoes: string | null;
  deletado_em: string | null;
  deletado_por: string | null;
  motivo_exclusao: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome' | 'cnpj'>;
}

export type DocumentoDiversoInsert = Pick<DocumentoDiverso,
  'categoria' | 'fornecedor_id' | 'competencia_ano' | 'competencia_mes' |
  'descricao' | 'valor' | 'vencimento' | 'observacoes'
> & { criado_por?: string | null };
```

- [ ] **Step 2: Adicionar ao mapa `Database`**, na mesma lista onde está a linha `interacoes_cliente: { Row: InteracaoCliente; Insert: InteracaoClienteInsert };` (adicionada antes nesta sessão):

```ts
      documentos_diversos:     { Row: DocumentoDiverso;    Insert: DocumentoDiversoInsert                       };
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): adiciona CategoriaDocumentoDiverso/DocumentoDiverso (gap do SIEG)"
```

---

### Task 3: `services/contabilidadeDocumentosDiversos.service.ts`

**Files:**
- Create: `services/contabilidadeDocumentosDiversos.service.ts`

**Interfaces:**
- Consumes: `DocumentoDiverso`, `DocumentoDiversoInsert` (Task 2), `getUltimoPlanoContas` de `services/lancamentos.service.ts` (já existe).
- Produces: `getDocumentosDiversos(filtro?)`, `criarDocumentoDiverso(input)`, `atualizarDocumentoDiverso(id, patch)`, `softDeleteDocumentoDiverso(id, usuarioEmail, motivo?)`, `uploadAnexoDocumentoDiverso(id, file)` — consumidos pelas Tasks 5 e 6.

- [ ] **Step 1: Criar o arquivo**

```ts
import { supabase } from "@/lib/supabase/client";
import type { DocumentoDiverso, DocumentoDiversoInsert } from "@/types";
import { registrarLog } from "./log.service";
import { getUltimoPlanoContas } from "./lancamentos.service";

const BUCKET = "contabilidade-anexos";
const SELECT = "*, fornecedores ( id, nome, cnpj )";

export interface FiltroDocumentosDiversos {
  competenciaAno?: number;
  competenciaMes?: number;
  categoria?: DocumentoDiverso["categoria"];
}

export async function getDocumentosDiversos(filtro: FiltroDocumentosDiversos = {}): Promise<DocumentoDiverso[]> {
  let query = supabase
    .from("documentos_diversos")
    .select(SELECT)
    .is("deletado_em", null)
    .order("created_at", { ascending: false });

  if (filtro.competenciaAno) query = query.eq("competencia_ano", filtro.competenciaAno);
  if (filtro.competenciaMes) query = query.eq("competencia_mes", filtro.competenciaMes);
  if (filtro.categoria) query = query.eq("categoria", filtro.categoria);

  const { data, error } = await query;
  if (error) { console.error("getDocumentosDiversos:", error); return []; }
  return data as DocumentoDiverso[];
}

/** Cria o documento e, na mesma chamada, o lançamento de Saída vinculado
 *  em Contas a Pagar — mesmo espírito de gerarContaAPagarDaCompra em
 *  services/compras.service.ts, mas sem checagem de idempotência: aqui a
 *  criação acontece uma vez só, nunca é re-chamada pro mesmo documento. */
export async function criarDocumentoDiverso(input: DocumentoDiversoInsert): Promise<DocumentoDiverso | null> {
  const sugestao = input.fornecedor_id
    ? await getUltimoPlanoContas({ fornecedorId: input.fornecedor_id })
    : { planoContasId: null };

  const { data: lancamento, error: errLanc } = await supabase
    .from("lancamentos")
    .insert([{
      tipo: "Saída",
      descricao: input.descricao,
      valor: input.valor,
      status: "Pendente",
      vencimento: input.vencimento,
      documento: null,
      fornecedor_id: input.fornecedor_id,
      plano_contas_id: sugestao.planoContasId,
      pedido_id: null,
      cliente_id: null,
    } as never])
    .select("id")
    .single();
  if (errLanc || !lancamento) { console.error("criarDocumentoDiverso (lancamento):", errLanc); return null; }

  const lancamentoId = (lancamento as { id: number }).id;

  const { data, error } = await supabase
    .from("documentos_diversos")
    .insert([{ ...input, lancamento_id: lancamentoId } as never])
    .select(SELECT)
    .single();
  if (error) { console.error("criarDocumentoDiverso:", error); return null; }

  const doc = data as DocumentoDiverso;
  registrarLog({
    acao: "criou",
    tabela: "documentos_diversos",
    registro_id: String(doc.id),
    descricao: `Criou documento diverso (${doc.categoria}) — R$ ${doc.valor.toFixed(2)}`,
    campos_alterados: input as unknown as Record<string, unknown>,
  });
  return doc;
}

export async function atualizarDocumentoDiverso(
  id: number,
  patch: Partial<DocumentoDiversoInsert> & { pdf_url?: string | null }
): Promise<boolean> {
  const { error } = await supabase
    .from("documentos_diversos")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) { console.error("atualizarDocumentoDiverso:", error); return false; }
  return true;
}

// Nunca DELETE físico — só marca deletado_em/deletado_por/motivo_exclusao.
export async function softDeleteDocumentoDiverso(
  id: number,
  usuarioEmail: string,
  motivo?: string
): Promise<boolean> {
  const { error } = await supabase
    .from("documentos_diversos")
    .update({
      deletado_em: new Date().toISOString(),
      deletado_por: usuarioEmail,
      motivo_exclusao: motivo ?? null,
    } as never)
    .eq("id", id);
  if (error) { console.error("softDeleteDocumentoDiverso:", error); return false; }
  registrarLog({
    acao: "excluiu",
    tabela: "documentos_diversos",
    registro_id: String(id),
    descricao: `Excluiu documento diverso #${id}${motivo ? ` — ${motivo}` : ""}`,
  });
  return true;
}

export async function uploadAnexoDocumentoDiverso(documentoId: number, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `diversos/${documentoId}/pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadAnexoDocumentoDiverso:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Commit**

```bash
git add services/contabilidadeDocumentosDiversos.service.ts
git commit -m "feat(contabilidade): adiciona services/contabilidadeDocumentosDiversos.service.ts"
```

---

### Task 4: Constantes de categoria + nova aba em `ContabilidadeTabs`

**Files:**
- Create: `lib/documentosDiversosConstants.ts`
- Modify: `components/contabilidade/ContabilidadeTabs.tsx`

**Interfaces:**
- Produces: `CATEGORIAS_DOC_DIVERSO: { value, label }[]`, `labelCategoriaDocDiverso(categoria)` — consumidos pela Task 5.

- [ ] **Step 1: Criar `lib/documentosDiversosConstants.ts`**

```ts
import type { CategoriaDocumentoDiverso } from "@/types";

export const CATEGORIAS_DOC_DIVERSO: { value: CategoriaDocumentoDiverso; label: string }[] = [
  { value: "energia", label: "Energia" },
  { value: "agua", label: "Água" },
  { value: "telefone_internet", label: "Telefone / Internet" },
  { value: "guia_imposto", label: "Guia de Imposto (DARF/GPS)" },
  { value: "boleto_diverso", label: "Boleto Diverso" },
  { value: "reembolso_funcionario", label: "Reembolso de Funcionário" },
  { value: "outros", label: "Outros" },
];

export function labelCategoriaDocDiverso(categoria: CategoriaDocumentoDiverso): string {
  return CATEGORIAS_DOC_DIVERSO.find((c) => c.value === categoria)?.label ?? categoria;
}
```

- [ ] **Step 2: Adicionar a aba nova em `components/contabilidade/ContabilidadeTabs.tsx`**

De:

```tsx
const ABAS: Aba[] = [
  { label: "Dashboard", slug: "" },
  { label: "Checklist Mensal", slug: "checklist" },
  { label: "Documentos Fiscais", slug: "documentos" },
  { label: "Estoque / CMV", slug: "estoque" },
  { label: "Ativo Imobilizado", slug: "ativo-imobilizado" },
  { label: "Cartões", slug: "cartoes" },
  { label: "Empréstimos", slug: "emprestimos" },
  { label: "Consórcios", slug: "consorcios" },
  { label: "Configuração Fiscal", slug: "fiscal-produtos" },
];

export default function ContabilidadeTabs({ ativo }: { ativo: "dashboard" | "checklist" | "documentos" | "estoque" | "ativo-imobilizado" | "cartoes" | "emprestimos" | "consorcios" | "fiscal-produtos" }) {
```

Para:

```tsx
const ABAS: Aba[] = [
  { label: "Dashboard", slug: "" },
  { label: "Checklist Mensal", slug: "checklist" },
  { label: "Documentos Fiscais", slug: "documentos" },
  { label: "Estoque / CMV", slug: "estoque" },
  { label: "Ativo Imobilizado", slug: "ativo-imobilizado" },
  { label: "Cartões", slug: "cartoes" },
  { label: "Empréstimos", slug: "emprestimos" },
  { label: "Consórcios", slug: "consorcios" },
  { label: "Documentos Diversos", slug: "diversos" },
  { label: "Configuração Fiscal", slug: "fiscal-produtos" },
];

export default function ContabilidadeTabs({ ativo }: { ativo: "dashboard" | "checklist" | "documentos" | "estoque" | "ativo-imobilizado" | "cartoes" | "emprestimos" | "consorcios" | "diversos" | "fiscal-produtos" }) {
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Commit**

```bash
git add lib/documentosDiversosConstants.ts components/contabilidade/ContabilidadeTabs.tsx
git commit -m "feat(contabilidade): adiciona constantes de categoria e aba Documentos Diversos"
```

---

### Task 5: Página `/contabilidade/diversos`

**Files:**
- Create: `app/contabilidade/diversos/page.tsx`

**Interfaces:**
- Consumes: `getDocumentosDiversos`/`criarDocumentoDiverso`/`atualizarDocumentoDiverso`/`softDeleteDocumentoDiverso`/`uploadAnexoDocumentoDiverso` (Task 3), `CATEGORIAS_DOC_DIVERSO`/`labelCategoriaDocDiverso` (Task 4), `getFornecedores` (já existe em `services/fornecedores.service.ts`).

- [ ] **Step 1: Criar o arquivo**

```tsx
"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { usePrompt } from "@/components/ui/prompt";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import { CATEGORIAS_DOC_DIVERSO, labelCategoriaDocDiverso } from "@/lib/documentosDiversosConstants";
import {
  getDocumentosDiversos, criarDocumentoDiverso, atualizarDocumentoDiverso,
  softDeleteDocumentoDiverso, uploadAnexoDocumentoDiverso,
} from "@/services/contabilidadeDocumentosDiversos.service";
import { getFornecedores } from "@/services/fornecedores.service";
import type { DocumentoDiverso, DocumentoDiversoInsert, CategoriaDocumentoDiverso, Fornecedor } from "@/types";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function hoje() { return new Date().toISOString().split("T")[0]; }

function formVazio(ano: number, mes: number): DocumentoDiversoInsert {
  return {
    categoria: "outros", fornecedor_id: null,
    competencia_ano: ano, competencia_mes: mes,
    descricao: "", valor: 0, vencimento: null, observacoes: null,
  };
}

// ─── Modal: Documento Diverso ─────────────────────────────────
function ModalDocDiverso({ ano, mes, fornecedores, usuarioEmail, onSalvo, onFechar }: {
  ano: number; mes: number; fornecedores: Fornecedor[]; usuarioEmail: string;
  onSalvo: () => void; onFechar: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<DocumentoDiversoInsert>(formVazio(ano, mes));
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof DocumentoDiversoInsert>(k: K, v: DocumentoDiversoInsert[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim() || !(form.valor > 0)) { toast("Preencha descrição e valor", "err"); return; }
    setSalvando(true);

    const criado = await criarDocumentoDiverso({ ...form, criado_por: usuarioEmail } as DocumentoDiversoInsert);
    if (!criado) { toast("Erro ao salvar", "err"); setSalvando(false); return; }

    if (pdfFile) {
      const url = await uploadAnexoDocumentoDiverso(criado.id, pdfFile);
      if (url) await atualizarDocumentoDiverso(criado.id, { pdf_url: url });
    }

    setSalvando(false);
    toast("Documento criado");
    onSalvo();
  }

  return (
    <Modal open onClose={onFechar} title="Novo Documento Diverso" width="560px" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
      <form id="form-doc-diverso" onSubmit={handleSubmit} style={{ overflowY: "auto", padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Campo label="Categoria">
            <select className="fc" value={form.categoria} onChange={(e) => set("categoria", e.target.value as CategoriaDocumentoDiverso)}>
              {CATEGORIAS_DOC_DIVERSO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Campo>
          <Campo label="Fornecedor">
            <select className="fc" value={form.fornecedor_id ?? ""} onChange={(e) => set("fornecedor_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
        </div>

        <Campo label="Descrição *">
          <input className="fc" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex: Conta de energia — Julho/2026" required />
        </Campo>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Campo label="Valor *">
            <CurrencyInput value={form.valor} onChange={(v) => set("valor", v)} placeholder="R$ 0,00" />
          </Campo>
          <Campo label="Vencimento">
            <DateInput value={form.vencimento ?? ""} onChange={(v) => set("vencimento", v || null)} />
          </Campo>
        </div>

        <Campo label="PDF do documento">
          <input className="fc" type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
        </Campo>

        <Campo label="Observações">
          <textarea className="fc" rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
        </Campo>
      </form>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
        <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button type="submit" form="form-doc-diverso" className="btn bp" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
      </div>
    </Modal>
  );
}

// ─── Página principal ───────────────────────────────────────
export default function DocumentosDiversosPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaDocumentoDiverso | "">("");
  const [docs, setDocs] = useState<DocumentoDiverso[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
    getFornecedores(true).then(setFornecedores);
  }, []);

  useEffect(() => { load(); }, [ano, mes, filtroCategoria]);

  async function load() {
    setLoading(true);
    setDocs(await getDocumentosDiversos({
      competenciaAno: ano, competenciaMes: mes,
      categoria: filtroCategoria || undefined,
    }));
    setLoading(false);
  }

  async function handleExcluir(id: number) {
    const motivo = (await prompt("Motivo da exclusão (opcional):", { titulo: "Excluir documento" })) ?? undefined;
    if (!(await confirm("Excluir este documento? O registro fica no histórico, não é apagado de fato.", { perigo: true }))) return;
    const ok = await softDeleteDocumentoDiverso(id, usuarioEmail, motivo);
    toast(ok ? "Documento excluído" : "Erro ao excluir", ok ? "ok" : "err");
    if (ok) load();
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Documentos Diversos</div>
      </div>
      <ContabilidadeTabs ativo="diversos" />

      {modalAberto && (
        <ModalDocDiverso
          ano={ano} mes={mes} fornecedores={fornecedores} usuarioEmail={usuarioEmail}
          onSalvo={() => { setModalAberto(false); load(); }}
          onFechar={() => setModalAberto(false)}
        />
      )}

      <div className="con">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <select className="fc" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: "140px" }}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input className="fc" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: "90px" }} />
            <select className="fc" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value as CategoriaDocumentoDiverso | "")} style={{ width: "220px" }}>
              <option value="">Todas as categorias</option>
              {CATEGORIAS_DOC_DIVERSO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <button className="btn bp sm" onClick={() => setModalAberto(true)}>+ Novo Documento</button>
        </div>

        {loading ? <div className="loading">Carregando...</div> : docs.length === 0 ? (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Nenhum documento nesta competência.</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Categoria</th><th>Fornecedor</th><th>Descrição</th>
                  <th>Valor</th><th>Vencimento</th><th>PDF</th><th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td><span className="chip cgr" style={{ fontSize: "11px" }}>{labelCategoriaDocDiverso(d.categoria)}</span></td>
                    <td>{d.fornecedores?.nome ?? "—"}</td>
                    <td>{d.descricao}</td>
                    <td className="mono">{formatBRL(d.valor)}</td>
                    <td className="mono">{d.vencimento ? formatDate(d.vencimento) : "—"}</td>
                    <td>{d.pdf_url ? <a href={d.pdf_url} target="_blank" rel="noreferrer">Ver</a> : <span style={{ color: "var(--err)" }}>Sem PDF</span>}</td>
                    <td><button className="btn bg xs" onClick={() => handleExcluir(d.id)}>Excluir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add "app/contabilidade/diversos/page.tsx"
git commit -m "feat(contabilidade): adiciona pagina Documentos Diversos"
```

---

### Task 6: Dashboard — 6º semáforo + alerta de PDF faltando

**Files:**
- Modify: `services/contabilidadeDashboard.service.ts`
- Modify: `app/contabilidade/page.tsx`

**Interfaces:**
- Consumes: `getDocumentosDiversos` (Task 3).

- [ ] **Step 1: Importar `getDocumentosDiversos` no topo de `services/contabilidadeDashboard.service.ts`**

De:

```ts
import { getConsorcios } from "./consorcios.service";
import type { NotaFiscal } from "@/types";
```

Para:

```ts
import { getConsorcios } from "./consorcios.service";
import { getDocumentosDiversos } from "./contabilidadeDocumentosDiversos.service";
import type { NotaFiscal } from "@/types";
```

- [ ] **Step 2: Adicionar o alerta em `getAlertas()`**, logo depois do bloco de `chavesDuplicadas` e antes do bloco do checklist geral (`const agora = new Date();`)

De:

```ts
  const chaves = docsCompra.map((d) => d.chave_acesso).filter((c): c is string => !!c);
  const chavesDuplicadas = chaves.filter((c, i) => chaves.indexOf(c) !== i);
  if (chavesDuplicadas.length > 0) alertas.push({ severidade: "critico", mensagem: "Documento fiscal com chave de acesso duplicada", quantidade: new Set(chavesDuplicadas).size });

  const agora = new Date();
```

Para:

```ts
  const chaves = docsCompra.map((d) => d.chave_acesso).filter((c): c is string => !!c);
  const chavesDuplicadas = chaves.filter((c, i) => chaves.indexOf(c) !== i);
  if (chavesDuplicadas.length > 0) alertas.push({ severidade: "critico", mensagem: "Documento fiscal com chave de acesso duplicada", quantidade: new Set(chavesDuplicadas).size });

  const docsDiversos = await getDocumentosDiversos({ competenciaAno: ano, competenciaMes: mes });
  const diversoSemPdf = docsDiversos.filter((d) => !d.pdf_url).length;
  if (diversoSemPdf > 0) alertas.push({ severidade: "critico", mensagem: "Documento diverso sem PDF anexado", quantidade: diversoSemPdf });

  const agora = new Date();
```

- [ ] **Step 3: Adicionar o 6º `StatusArea` em `getStatusAreas()`**, logo depois do bloco `financeiroArea` e antes do `return`

De:

```ts
  const financeiroArea: StatusArea =
    totalVencidasFin > 0
      ? { area: "financeiro", label: "Financeiro", semaforo: "vermelho", detalhe: `${totalVencidasFin} conta(s) vencida(s) sem pagamento` }
      : checklistFinanceiroPendente
      ? { area: "financeiro", label: "Financeiro", semaforo: "amarelo", detalhe: "Checklist financeiro ainda pendente" }
      : { area: "financeiro", label: "Financeiro", semaforo: "verde", detalhe: "Completo" };

  return [
    documentosFiscais,
    estoque,
    ativoImobilizado,
    cartoesArea,
    financeiroArea,
  ];
}
```

Para:

```ts
  const financeiroArea: StatusArea =
    totalVencidasFin > 0
      ? { area: "financeiro", label: "Financeiro", semaforo: "vermelho", detalhe: `${totalVencidasFin} conta(s) vencida(s) sem pagamento` }
      : checklistFinanceiroPendente
      ? { area: "financeiro", label: "Financeiro", semaforo: "amarelo", detalhe: "Checklist financeiro ainda pendente" }
      : { area: "financeiro", label: "Financeiro", semaforo: "verde", detalhe: "Completo" };

  const docsDiversosArea = await getDocumentosDiversos({ competenciaAno: ano, competenciaMes: mes });
  const diversoSemPdfArea = docsDiversosArea.filter((d) => !d.pdf_url).length;
  const itemChecklistDiversos = itens.find((i) => i.item_key === "documentos_diversos");
  const checklistDiversosPendente = itemChecklistDiversos?.status === "pendente" || itemChecklistDiversos?.status === "em_andamento";

  const documentosDiversosArea: StatusArea =
    diversoSemPdfArea > 0
      ? { area: "documentos_diversos", label: "Documentos Diversos", semaforo: "vermelho", detalhe: `${diversoSemPdfArea} documento(s) sem PDF anexado` }
      : checklistDiversosPendente
      ? { area: "documentos_diversos", label: "Documentos Diversos", semaforo: "amarelo", detalhe: "Checklist de documentos diversos ainda pendente" }
      : { area: "documentos_diversos", label: "Documentos Diversos", semaforo: "verde", detalhe: "Completo" };

  return [
    documentosFiscais,
    estoque,
    ativoImobilizado,
    cartoesArea,
    financeiroArea,
    documentosDiversosArea,
  ];
}
```

- [ ] **Step 4: Ajustar o grid do Dashboard de 5 pra 6 colunas** em `app/contabilidade/page.tsx`

De:

```tsx
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "24px" }}>
```

Para:

```tsx
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px", marginBottom: "24px" }}>
```

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 6: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 7: Commit**

```bash
git add services/contabilidadeDashboard.service.ts "app/contabilidade/page.tsx"
git commit -m "feat(contabilidade): adiciona 6o semaforo e alerta de PDF faltando pra Documentos Diversos"
```

---

### Task 7: Item no Checklist Mensal

**Files:**
- Modify: `lib/contabilidadeChecklist.ts`

- [ ] **Step 1: Atualizar o catálogo**

De:

```ts
export interface ChecklistItemDef {
  key: string;
  label: string;
  area: "documentos_fiscais" | "estoque" | "ativo_imobilizado" | "cartoes" | "financeiro";
  faseDisponivel: 1 | 2 | 3 | 4 | 6;
}

export const CHECKLIST_ITENS: ChecklistItemDef[] = [
  { key: "nf_compra",          label: "NF Compra",                          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_entrada",         label: "NF Entrada",                         area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_saida",           label: "NF Saída",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_perda",           label: "NF Perda",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_cancelada",       label: "NF Canceladas",                      area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "carta_correcao",     label: "Carta de Correção",                  area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "inutilizacao",       label: "Inutilização de Numeração",          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "estoque",            label: "Estoque / CMV",                      area: "estoque",            faseDisponivel: 2 },
  { key: "ativo_imobilizado",  label: "Ativo Imobilizado",                  area: "ativo_imobilizado",  faseDisponivel: 3 },
  { key: "cartoes_emprestimos", label: "Cartões / Empréstimos / Consórcios", area: "cartoes",           faseDisponivel: 4 },
  { key: "financeiro",         label: "Financeiro (Contas a Pagar/Receber)", area: "financeiro",        faseDisponivel: 6 },
];

export const FASE_ATUAL = 6;
```

Para:

```ts
export interface ChecklistItemDef {
  key: string;
  label: string;
  area: "documentos_fiscais" | "estoque" | "ativo_imobilizado" | "cartoes" | "financeiro" | "documentos_diversos";
  faseDisponivel: 1 | 2 | 3 | 4 | 6 | 7;
}

export const CHECKLIST_ITENS: ChecklistItemDef[] = [
  { key: "nf_compra",          label: "NF Compra",                          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_entrada",         label: "NF Entrada",                         area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_saida",           label: "NF Saída",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_perda",           label: "NF Perda",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_cancelada",       label: "NF Canceladas",                      area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "carta_correcao",     label: "Carta de Correção",                  area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "inutilizacao",       label: "Inutilização de Numeração",          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "estoque",            label: "Estoque / CMV",                      area: "estoque",            faseDisponivel: 2 },
  { key: "ativo_imobilizado",  label: "Ativo Imobilizado",                  area: "ativo_imobilizado",  faseDisponivel: 3 },
  { key: "cartoes_emprestimos", label: "Cartões / Empréstimos / Consórcios", area: "cartoes",           faseDisponivel: 4 },
  { key: "financeiro",         label: "Financeiro (Contas a Pagar/Receber)", area: "financeiro",        faseDisponivel: 6 },
  { key: "documentos_diversos", label: "Documentos Diversos",               area: "documentos_diversos", faseDisponivel: 7 },
];

export const FASE_ATUAL = 7;
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Commit**

```bash
git add lib/contabilidadeChecklist.ts
git commit -m "feat(contabilidade): adiciona item Documentos Diversos ao checklist mensal (fase 7)"
```

---

### Task 8: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário**

**Rodar o SQL `sql/contabilidade-documentos-diversos.sql` no Supabase antes de testar** — sem ele, a página `/contabilidade/diversos` e o novo card do Dashboard vão falhar ao carregar. Pedir pro usuário:
- Rodar o SQL, confirmar que a tabela `documentos_diversos` foi criada.
- Criar um documento diverso de teste (ex: categoria Energia, valor R$ 100) e confirmar que aparece um lançamento correspondente em Contas a Pagar.
- Conferir o alerta "Documento diverso sem PDF anexado" no Dashboard da Contabilidade antes de anexar PDF, e confirmar que some depois de anexar.
- Conferir o 6º card de semáforo "Documentos Diversos" no Dashboard.
- Marcar o item "Documentos Diversos" no Checklist Mensal e confirmar que o semáforo amarelo correspondente desaparece (assumindo já sem alerta de PDF).
- Excluir o documento de teste e confirmar que some da lista (soft-delete, com motivo opcional e confirmação).

Isso encerra a Leva 2 inteira da Auditoria ERP (7 sub-projetos) — resta só o CRM 6b (Relatórios Analíticos), propositalmente adiado até haver dados reais de interação.
