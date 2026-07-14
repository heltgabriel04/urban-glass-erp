# CRM — Painel do Cliente (Orçamentos + Interações) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A página `/clientes/[id]` ganha uma seção de Orçamentos do cliente (reaproveitando dados existentes) e uma seção nova de Interações comerciais (ligação/e-mail/reunião/nota) com lembrete visual de follow-up atrasado.

**Architecture:** Tabela nova `interacoes_cliente` + `services/interacoes.service.ts` (3 funções). A seção de Orçamentos não precisa de serviço novo — query direta reaproveitando a tabela `orcamentos`, mesmo padrão que a página já usa pra `pedidos`. Ambas as seções entram na página existente sem tocar no que já funciona.

**Tech Stack:** Next.js/TypeScript, Supabase JS v2, SQL puro (RLS + policies, mesmo padrão de `sql/contabilidade-fase3-01-ativos-imobilizados.sql`).

## Global Constraints

- Zero mudança nas seções já existentes da página (dados cadastrais, endereço, fiscal, financeiro, pedidos).
- Interações: sem vínculo a usuário logado, sem soft-delete, sem edição (só criar/excluir) — decisões confirmadas com o usuário na spec.
- Follow-up atrasado é calculado em runtime, exibido só na própria página do cliente — sem alerta em Dashboard ou outro lugar.
- Sem teste automatizado disponível para funções que fazem query real no Supabase — validar via `tsc --noEmit` + `next build` + conferência manual (mesma limitação recorrente do projeto).
- Spec de referência: `docs/superpowers/specs/2026-07-14-crm-painel-cliente-design.md`.

---

### Task 1: SQL — tabela `interacoes_cliente`

**Files:**
- Create: `sql/crm-interacoes-cliente.sql`
- Modify: `sql/MANIFEST.md` (adicionar linha na tabela de migrações)

- [ ] **Step 1: Criar o arquivo SQL**

```sql
-- CRM — Painel do Cliente
-- Registro de interações comerciais (ligação/e-mail/reunião/nota) por
-- cliente, com lembrete opcional de próximo contato — o follow-up
-- atrasado é calculado em runtime e exibido só na própria página do
-- cliente, sem alerta em outro lugar do sistema.
-- Sem vínculo a usuário logado, sem soft-delete, sem UPDATE (só criar/
-- excluir) — decisões confirmadas na spec.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS interacoes_cliente (
  id               bigserial PRIMARY KEY,
  cliente_id       bigint NOT NULL REFERENCES clientes(id),
  tipo             text NOT NULL CHECK (tipo IN ('ligacao','email','reuniao','nota')),
  data             timestamptz NOT NULL DEFAULT now(),
  descricao        text NOT NULL,
  proximo_contato  date,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interacoes_cliente_cliente ON interacoes_cliente (cliente_id);

ALTER TABLE interacoes_cliente ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'interacoes_cliente') THEN
    CREATE POLICY "auth_select" ON interacoes_cliente FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'interacoes_cliente') THEN
    CREATE POLICY "auth_insert" ON interacoes_cliente FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete' AND tablename = 'interacoes_cliente') THEN
    CREATE POLICY "auth_delete" ON interacoes_cliente FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;
-- Sem policy de UPDATE: interação não é editável depois de criada (spec).
```

- [ ] **Step 2: Adicionar linha ao manifesto**

No fim da tabela de `sql/MANIFEST.md` (depois da linha de `sql/contabilidade-fase6-checklist-ativa-financeiro.sql`), adicionar:

```
| 2026-07-14 | `sql/crm-interacoes-cliente.sql` | CRM — Painel do Cliente: tabela de interações comerciais | ⏳ |
```

- [ ] **Step 3: Commit**

```bash
git add sql/crm-interacoes-cliente.sql sql/MANIFEST.md
git commit -m "docs: adiciona SQL da tabela interacoes_cliente (CRM painel do cliente)"
```

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `TipoInteracao`, `InteracaoCliente`, `InteracaoClienteInsert` — consumidos pelas Tasks 3 e 4.

- [ ] **Step 1: Adicionar logo depois do bloco `Orcamento`/`OrcamentoInsert`** (depois da linha `export type OrcamentoInsert = Omit<Orcamento, 'created_at' | 'clientes'>;`)

```ts
// ─── INTERAÇÃO CLIENTE (CRM) ──────────────────────────────
export type TipoInteracao = 'ligacao' | 'email' | 'reuniao' | 'nota';

export interface InteracaoCliente {
  id: number;
  cliente_id: number;
  tipo: TipoInteracao;
  data: string;
  descricao: string;
  proximo_contato: string | null;
  created_at: string;
}

export type InteracaoClienteInsert = Omit<InteracaoCliente, 'id' | 'created_at' | 'data'>;
```

- [ ] **Step 2: Adicionar ao mapa `Database` no fim do arquivo**, na mesma lista onde está `compras_itens: { Row: CompraItem; Insert: CompraItemInsert };` (por volta da linha 1309):

```ts
      interacoes_cliente:      { Row: InteracaoCliente;    Insert: InteracaoClienteInsert                       };
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros (tipos novos ainda não usados em lugar nenhum).

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): adiciona TipoInteracao/InteracaoCliente (CRM painel do cliente)"
```

---

### Task 3: `services/interacoes.service.ts`

**Files:**
- Create: `services/interacoes.service.ts`

**Interfaces:**
- Consumes: `InteracaoCliente`, `InteracaoClienteInsert` (Task 2).
- Produces: `getInteracoesPorCliente(clienteId: number): Promise<InteracaoCliente[]>`, `createInteracao(input: InteracaoClienteInsert): Promise<InteracaoCliente | null>`, `deletarInteracao(id: number): Promise<boolean>` — consumidos pela Task 4.

- [ ] **Step 1: Criar o arquivo**

```ts
import { supabase } from '@/lib/supabase/client';
import type { InteracaoCliente, InteracaoClienteInsert } from '@/types';

export async function getInteracoesPorCliente(clienteId: number): Promise<InteracaoCliente[]> {
  const { data, error } = await supabase
    .from('interacoes_cliente')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('data', { ascending: false });
  if (error) { console.error('getInteracoesPorCliente:', error); return []; }
  return data as InteracaoCliente[];
}

export async function createInteracao(input: InteracaoClienteInsert): Promise<InteracaoCliente | null> {
  const { data, error } = await supabase
    .from('interacoes_cliente')
    .insert([input as never])
    .select()
    .single();
  if (error) { console.error('createInteracao:', error); return null; }
  return data as InteracaoCliente;
}

export async function deletarInteracao(id: number): Promise<boolean> {
  const { error } = await supabase.from('interacoes_cliente').delete().eq('id', id);
  if (error) { console.error('deletarInteracao:', error); return false; }
  return true;
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Commit**

```bash
git add services/interacoes.service.ts
git commit -m "feat(crm): adiciona services/interacoes.service.ts"
```

---

### Task 4: Integração em `app/clientes/[id]/page.tsx`

**Files:**
- Modify: `app/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `getInteracoesPorCliente`/`createInteracao`/`deletarInteracao` (Task 3), `Orcamento`/`InteracaoCliente`/`TipoInteracao` (Task 2, tipo `Orcamento` já existia).

- [ ] **Step 1: Trocar os imports do topo**

De:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate, formatPercent } from "@/lib/formatters";
import { registrarRecente } from "@/lib/recentes";
import type { Cliente, Pedido, FinanceiroCliente } from "@/types";
```

Para:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate, formatPercent } from "@/lib/formatters";
import { registrarRecente } from "@/lib/recentes";
import { useConfirm } from "@/components/ui/confirm";
import { Campo } from "@/components/ui/Campo";
import DateInput from "@/components/ui/DateInput";
import { getInteracoesPorCliente, createInteracao, deletarInteracao } from "@/services/interacoes.service";
import type { Cliente, Pedido, FinanceiroCliente, Orcamento, InteracaoCliente, TipoInteracao } from "@/types";
```

- [ ] **Step 2: Adicionar os mapas `ORCAMENTO_CHIP` e `TIPO_LABEL` logo depois do `CHIP` já existente** (depois do bloco `const CHIP: Record<string, string> = {...};`)

```tsx
const ORCAMENTO_CHIP: Record<string, string> = {
  "Rascunho":  "chip cgr",
  "Enviado":   "chip cy",
  "Aprovado":  "chip cg",
  "Rejeitado": "chip cr",
};

const TIPO_LABEL: Record<TipoInteracao, string> = {
  ligacao: "Ligação",
  email: "E-mail",
  reuniao: "Reunião",
  nota: "Nota",
};

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Adicionar `useConfirm()` e os states novos dentro do componente**, logo depois de `const router = useRouter();`

De:

```tsx
export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [fin, setFin]         = useState<FinanceiroCliente | null>(null);
  const [loading, setLoading] = useState(true);
```

Para:

```tsx
export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const confirm = useConfirm();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [fin, setFin]         = useState<FinanceiroCliente | null>(null);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [interacoes, setInteracoes] = useState<InteracaoCliente[]>([]);
  const [showFormInteracao, setShowFormInteracao] = useState(false);
  const [novoTipo, setNovoTipo] = useState<TipoInteracao>("ligacao");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoProximoContato, setNovoProximoContato] = useState("");
  const [salvandoInteracao, setSalvandoInteracao] = useState(false);
  const [loading, setLoading] = useState(true);
```

- [ ] **Step 4: Atualizar `load()` pra buscar orçamentos e interações**

De:

```tsx
  async function load() {
    setLoading(true);
    const [{ data: cliData }, { data: pedData }, { data: finData }] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase.from("pedidos").select("*, itens_pedido(id)").eq("cliente_id", id).order("dt_pedido", { ascending: false }),
      supabase.from("financeiro_clientes").select("*").eq("cliente_id", id).single(),
    ]);
    setCliente(cliData as Cliente);
    setPedidos((pedData ?? []) as Pedido[]);
    setFin(finData as FinanceiroCliente ?? null);
    setLoading(false);
    if (cliData) {
      const c = cliData as Cliente;
      registrarRecente({ tipo: "cliente", id: String(c.id), label: c.nome, sublabel: c.cidade ?? undefined, href: `/clientes/${c.id}` });
    }
  }
```

Para:

```tsx
  async function load() {
    setLoading(true);
    const [{ data: cliData }, { data: pedData }, { data: finData }, { data: orcData }, interacoesData] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase.from("pedidos").select("*, itens_pedido(id)").eq("cliente_id", id).order("dt_pedido", { ascending: false }),
      supabase.from("financeiro_clientes").select("*").eq("cliente_id", id).single(),
      supabase.from("orcamentos").select("*").eq("cliente_id", id).order("dt_criacao", { ascending: false }),
      getInteracoesPorCliente(Number(id)),
    ]);
    setCliente(cliData as Cliente);
    setPedidos((pedData ?? []) as Pedido[]);
    setFin(finData as FinanceiroCliente ?? null);
    setOrcamentos((orcData ?? []) as Orcamento[]);
    setInteracoes(interacoesData);
    setLoading(false);
    if (cliData) {
      const c = cliData as Cliente;
      registrarRecente({ tipo: "cliente", id: String(c.id), label: c.nome, sublabel: c.cidade ?? undefined, href: `/clientes/${c.id}` });
    }
  }
```

- [ ] **Step 5: Adicionar os handlers de interação**, logo depois do fechamento de `load()` e antes de `if (loading) return ...`

```tsx
  async function handleCriarInteracao() {
    if (!cliente || !novaDescricao.trim()) return;
    setSalvandoInteracao(true);
    const res = await createInteracao({
      cliente_id: cliente.id,
      tipo: novoTipo,
      descricao: novaDescricao.trim(),
      proximo_contato: novoProximoContato || null,
    });
    setSalvandoInteracao(false);
    if (!res) return;
    setNovoTipo("ligacao");
    setNovaDescricao("");
    setNovoProximoContato("");
    setShowFormInteracao(false);
    load();
  }

  async function handleExcluirInteracao(interacaoId: number) {
    if (!(await confirm("Excluir esta interação?", { perigo: true }))) return;
    await deletarInteracao(interacaoId);
    load();
  }
```

- [ ] **Step 6: Inserir as duas seções novas entre "Resumo financeiro" e "Histórico de Pedidos"**

Localizar o fechamento do card "Resumo financeiro" (`</div>` que fecha a `div` com o comentário `{/* Resumo financeiro */}`) e o comentário `{/* Histórico de pedidos */}` logo depois. O trecho hoje é:

```tsx
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginTop:"6px" }}>
            <span>Recebimento geral</span><span>{pctRec.toFixed(0)}%</span>
          </div>
        </div>

        {/* Histórico de pedidos */}
```

Vira:

```tsx
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginTop:"6px" }}>
            <span>Recebimento geral</span><span>{pctRec.toFixed(0)}%</span>
          </div>
        </div>

        {/* Interações */}
        <div className="card" style={{ padding:"20px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>INTERAÇÕES ({interacoes.length})</div>
            <button className="btn bp xs" onClick={() => setShowFormInteracao(v => !v)}>
              {showFormInteracao ? "✕ Cancelar" : "+ Nova Interação"}
            </button>
          </div>

          {showFormInteracao && (
            <div style={{ background:"var(--surf2)", border:"1px solid var(--b1)", borderRadius:"8px", padding:"14px 16px", marginBottom:"16px", display:"flex", flexDirection:"column", gap:"10px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                <Campo label="Tipo">
                  <select className="fc" value={novoTipo} onChange={e => setNovoTipo(e.target.value as TipoInteracao)}>
                    <option value="ligacao">Ligação</option>
                    <option value="email">E-mail</option>
                    <option value="reuniao">Reunião</option>
                    <option value="nota">Nota</option>
                  </select>
                </Campo>
                <Campo label="Próximo contato (opcional)">
                  <DateInput value={novoProximoContato} onChange={setNovoProximoContato} />
                </Campo>
              </div>
              <Campo label="Descrição">
                <textarea className="fc" rows={3} value={novaDescricao} onChange={e => setNovaDescricao(e.target.value)} placeholder="O que foi conversado..." />
              </Campo>
              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                <button className="btn bp sm" onClick={handleCriarInteracao} disabled={salvandoInteracao || !novaDescricao.trim()}>
                  {salvandoInteracao ? "Salvando..." : "Salvar Interação"}
                </button>
              </div>
            </div>
          )}

          {interacoes.length === 0 ? (
            <div style={{ color:"var(--t3)", padding:"24px 0", textAlign:"center" }}>Nenhuma interação registrada ainda.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              {interacoes.map(it => {
                const atrasado = it.proximo_contato != null && it.proximo_contato < hoje();
                return (
                  <div key={it.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"12px", borderBottom:"1px solid var(--b1)", paddingBottom:"10px" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px" }}>
                        <span className="chip cgr" style={{ fontSize:"10px" }}>{TIPO_LABEL[it.tipo]}</span>
                        <span style={{ fontSize:"11px", color:"var(--t3)" }}>{formatDate(it.data)}</span>
                        {atrasado && <span className="chip cr" style={{ fontSize:"10px" }}>⚠ Follow-up atrasado</span>}
                      </div>
                      <div style={{ fontSize:"13px", color:"var(--t1)" }}>{it.descricao}</div>
                      {it.proximo_contato && !atrasado && (
                        <div style={{ fontSize:"11px", color:"var(--t3)", marginTop:"4px" }}>Próximo contato: {formatDate(it.proximo_contato)}</div>
                      )}
                    </div>
                    <button
                      title="Excluir interação"
                      onClick={() => handleExcluirInteracao(it.id)}
                      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"26px", height:"26px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"12px", cursor:"pointer", flexShrink:0 }}
                    >🗑</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Orçamentos do cliente */}
        <div className="card" style={{ padding:"20px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ORÇAMENTOS DO CLIENTE ({orcamentos.length})</div>
            <a href="/orcamentos/novo" className="btn bp xs">+ Novo Orçamento</a>
          </div>

          {orcamentos.length === 0 ? (
            <div style={{ color:"var(--t3)", padding:"24px 0", textAlign:"center" }}>Nenhum orçamento registrado para este cliente.</div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr><th>Orçamento</th><th>Data</th><th>Validade</th><th>Valor</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {orcamentos.map(o => (
                    <tr key={o.id}>
                      <td><span className="mono" style={{ color:"var(--acc)" }}>{o.id}</span></td>
                      <td className="mono">{formatDate(o.dt_criacao)}</td>
                      <td className="mono">{o.validade} dias</td>
                      <td className="mono">{formatBRL(o.valor_total)}</td>
                      <td><span className={ORCAMENTO_CHIP[o.status] ?? "chip cgr"}>{o.status}</span></td>
                      <td><a href={`/orcamentos/${o.id}`} className="btn bg xs">Ver</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Histórico de pedidos */}
```

- [ ] **Step 7: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 8: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 9: Commit**

```bash
git add app/clientes/\[id\]/page.tsx
git commit -m "feat(crm): adiciona orcamentos do cliente e interacoes com follow-up na pagina do cliente"
```

---

### Task 5: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário**

**Rodar o SQL `sql/crm-interacoes-cliente.sql` no Supabase antes de testar** — sem ele, a seção de Interações vai falhar ao carregar (tabela não existe). Pedir pro usuário:
- Rodar o SQL, confirmar que a tabela `interacoes_cliente` foi criada.
- Abrir um cliente que já tem orçamentos e confirmar que a nova seção "Orçamentos do Cliente" mostra os dados corretos (comparar com `/orcamentos`).
- Criar uma interação de teste com "Próximo contato" numa data passada, confirmar que aparece com o badge "⚠ Follow-up atrasado".
- Criar uma interação sem próximo contato, confirmar que aparece normal sem badge.
- Excluir uma interação de teste e confirmar que some da lista (com a confirmação aparecendo antes).

Isso encerra o sub-projeto 6a (Painel do Cliente). Próximo: 6b — Relatórios Analíticos de CRM (brainstorm próprio, usando os dados de interação reais depois que o usuário testar) — ou seguir direto pro item 7 (SIEG), a critério do usuário.
