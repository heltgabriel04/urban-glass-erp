# Comprovante de Pagamento no Pedido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar "comprovante de pagamento" como um 4º tipo de documento anexável no pedido, replicando exatamente o padrão já existente de Boleto/NF-e/Romaneio (bucket próprio no Supabase Storage, coluna `text[]`, par de funções upload/delete, seção retrátil na UI).

**Architecture:** Cópia estrutural 1:1 do padrão Boleto já implementado em `services/pedidos.service.ts` e `app/pedidos/[id]/page.tsx` — mesmo bucket-por-tipo-de-documento, mesma forma de coluna array, mesmos handlers de UI. Nenhuma abstração nova é criada; a duplicação entre os 4 tipos de documento já existe hoje no código-base e este trabalho segue a mesma convenção (não é o momento de unificá-los — fora de escopo desta mudança).

**Tech Stack:** Next.js (App Router), Supabase (Postgres + Storage), TypeScript.

## Global Constraints

- Aceita os mesmos tipos de arquivo que o Boleto: `.pdf,.jpg,.jpeg,.png` (decisão confirmada com o usuário).
- Bucket: `comprovantes-pagamento-pedidos`, público, limite de 20MB — mesmos valores dos buckets existentes (`nfe-pedidos`, `boletos-pedidos`, `romaneios-assinados`).
- Coluna: `pedidos.comprovante_pagamento_urls text[] DEFAULT NULL`.
- Fora de escopo: badge de "pendente" na listagem (`app/pedidos/page.tsx`) — não existe regra de negócio óbvia pra quando um comprovante é esperado, diferente de NF-e/Boleto que já têm essa regra.
- Sem SQL executado automaticamente — o usuário roda manualmente no Supabase SQL Editor, como todo o resto do projeto (ver `sql/MANIFEST.md`).

---

### Task 1: Migração SQL (bucket + policies + coluna)

**Files:**
- Create: `sql/pedido-comprovante-pagamento.sql`
- Modify: `sql/MANIFEST.md`

**Interfaces:**
- Consumes: nenhuma (arquivo SQL independente).
- Produces: bucket `comprovantes-pagamento-pedidos` no Storage, coluna `pedidos.comprovante_pagamento_urls` — consumidos pelas Tasks 2-4 (a coluna precisa existir no banco pro `updatePedido` do Task 4 funcionar em produção, mas o código compila e o dev pode seguir sem rodar o SQL ainda).

- [ ] **Step 1: Criar o arquivo SQL seguindo o padrão de `sql/criar-buckets-storage.sql`**

Criar `sql/pedido-comprovante-pagamento.sql`:

```sql
-- Bucket + coluna pra anexo de comprovante de pagamento no pedido
-- (4o tipo de documento, mesmo esquema de Romaneio/NF-e/Boleto)
-- Rodar no Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('comprovantes-pagamento-pedidos', 'comprovantes-pagamento-pedidos', true, 20971520)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comprovante pagamento public read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "comprovante pagamento public read" ON storage.objects FOR SELECT USING (bucket_id = 'comprovantes-pagamento-pedidos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comprovante pagamento auth insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "comprovante pagamento auth insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'comprovantes-pagamento-pedidos' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comprovante pagamento auth delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "comprovante pagamento auth delete" ON storage.objects FOR DELETE USING (bucket_id = 'comprovantes-pagamento-pedidos' AND auth.role() = 'authenticated');
  END IF;
END $$;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS comprovante_pagamento_urls text[] DEFAULT NULL;

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'comprovantes-pagamento-pedidos';
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'pedidos' AND column_name = 'comprovante_pagamento_urls';
```

- [ ] **Step 2: Adicionar linha no `sql/MANIFEST.md`**

Abrir `sql/MANIFEST.md`, achar a última linha da tabela, e adicionar logo depois (data de hoje, status `⏳ pendente` até o usuário confirmar que rodou):

```
| 2026-07-22 | `sql/pedido-comprovante-pagamento.sql` | Bucket + coluna comprovante_pagamento_urls — 4o tipo de anexo no pedido (Romaneio/NF-e/Boleto/Comprovante) | ⏳ |
```

- [ ] **Step 3: Commit**

```bash
git add sql/pedido-comprovante-pagamento.sql sql/MANIFEST.md
git commit -m "feat: SQL do bucket + coluna pra comprovante de pagamento no pedido"
```

---

### Task 2: Campo novo no tipo `Pedido`

**Files:**
- Modify: `types/index.ts:311`

**Interfaces:**
- Consumes: nenhuma.
- Produces: `Pedido.comprovante_pagamento_urls?: string[] | null` — usado pelas Tasks 3 e 4.

- [ ] **Step 1: Adicionar o campo logo depois de `boleto_urls`**

Em `types/index.ts`, linha 311 (`boleto_urls?: string[] | null;`), adicionar a linha logo abaixo:

```typescript
  boleto_urls?: string[] | null;
  comprovante_pagamento_urls?: string[] | null;
  sem_nota_fiscal?: boolean;
```

- [ ] **Step 2: Rodar typecheck pra confirmar que não quebrou nada**

Run: `npx tsc --noEmit -p .`
Expected: sem output (sem erros).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: campo comprovante_pagamento_urls no tipo Pedido"
```

---

### Task 3: Funções de upload/delete no service

**Files:**
- Modify: `services/pedidos.service.ts` (inserir logo depois da função `deleteBoleto`, atualmente terminando na linha 598, antes de `getProximoIdPedido` na linha 600)

**Interfaces:**
- Consumes: `supabase` e `registrarLog` (já importados no topo do arquivo, linhas 1 e 4 — nenhum import novo necessário).
- Produces: `uploadComprovantePagamento(pedidoId: string, files: File[]): Promise<{ urls: string[]; erro?: string }>` e `deleteComprovantePagamento(url: string): Promise<boolean>` — usadas pela Task 4.

- [ ] **Step 1: Inserir o bucket e as duas funções depois de `deleteBoleto`**

Em `services/pedidos.service.ts`, logo depois do fechamento de `deleteBoleto` (linha 598, `}`) e antes de `export async function getProximoIdPedido()` (linha 600), inserir:

```typescript

// ─── Storage: Comprovante de pagamento ─────────────────────────────────
const BUCKET_COMPROVANTE_PAGAMENTO = 'comprovantes-pagamento-pedidos';

export async function uploadComprovantePagamento(pedidoId: string, files: File[]): Promise<{ urls: string[]; erro?: string }> {
  const urls: string[] = [];
  for (const file of files) {
    const ext  = file.name.split('.').pop() ?? 'pdf';
    const path = `${pedidoId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_COMPROVANTE_PAGAMENTO).upload(path, file, { upsert: false });
    if (error) { console.error('uploadComprovantePagamento:', error); return { urls, erro: error.message }; }
    const { data } = supabase.storage.from(BUCKET_COMPROVANTE_PAGAMENTO).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  if (urls.length > 0) {
    registrarLog({ acao: "anexou", tabela: "pedidos", registro_id: pedidoId, descricao: `Anexou ${urls.length} comprovante(s) de pagamento em ${pedidoId}` });
  }
  return { urls };
}

export async function deleteComprovantePagamento(url: string): Promise<boolean> {
  const marker = `/${BUCKET_COMPROVANTE_PAGAMENTO}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return false;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET_COMPROVANTE_PAGAMENTO).remove([path]);
  if (error) { console.error('deleteComprovantePagamento:', error); return false; }
  return true;
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output (sem erros).

- [ ] **Step 3: Commit**

```bash
git add services/pedidos.service.ts
git commit -m "feat: upload/delete de comprovante de pagamento em services/pedidos.service.ts"
```

---

### Task 4: Seção de UI no pedido

**Files:**
- Modify: `app/pedidos/[id]/page.tsx`
  - linha 6 (import de `services/pedidos.service.ts`)
  - linhas 160-164 (estado)
  - depois da linha 768 (handlers, logo depois de `handleRemoverBoleto`)
  - linhas 1500-1533 (JSX — inserir nova seção logo depois da seção Boleto, antes do comentário `{/* Observações */}` na linha 1535)

**Interfaces:**
- Consumes: `uploadComprovantePagamento`, `deleteComprovantePagamento` (Task 3); `Pedido.comprovante_pagamento_urls` (Task 2).
- Produces: nada consumido por outra task — é o último elo da cadeia.

- [ ] **Step 1: Atualizar o import no topo do arquivo**

Em `app/pedidos/[id]/page.tsx:6`, trocar:

```typescript
import { getPedidoById, avancarStatusPedido, recalcularRecebido, updatePedido, getCreditoCliente, atualizarCreditoCliente, utilizarCreditoEmPedido, uploadRomaneioAssinado, deleteRomaneioAssinado, uploadNfe, deleteNfe, uploadBoleto, deleteBoleto } from "@/services/pedidos.service";
```

por:

```typescript
import { getPedidoById, avancarStatusPedido, recalcularRecebido, updatePedido, getCreditoCliente, atualizarCreditoCliente, utilizarCreditoEmPedido, uploadRomaneioAssinado, deleteRomaneioAssinado, uploadNfe, deleteNfe, uploadBoleto, deleteBoleto, uploadComprovantePagamento, deleteComprovantePagamento } from "@/services/pedidos.service";
```

- [ ] **Step 2: Adicionar estado novo**

Em `app/pedidos/[id]/page.tsx:159-164`, trocar:

```typescript
  const [uploadandoRomaneio, setUploadandoRomaneio] = useState(false);
  const [uploadandoNfe,     setUploadandoNfe]     = useState(false);
  const [uploadandoBoleto,  setUploadandoBoleto]  = useState(false);
  const [abrirRomaneio,     setAbrirRomaneio]     = useState(false);
  const [abrirNfe,          setAbrirNfe]          = useState(false);
  const [abrirBoleto,       setAbrirBoleto]       = useState(false);
  const [abrirObs,          setAbrirObs]          = useState(false);
```

por:

```typescript
  const [uploadandoRomaneio, setUploadandoRomaneio] = useState(false);
  const [uploadandoNfe,     setUploadandoNfe]     = useState(false);
  const [uploadandoBoleto,  setUploadandoBoleto]  = useState(false);
  const [uploadandoComprovante, setUploadandoComprovante] = useState(false);
  const [abrirRomaneio,     setAbrirRomaneio]     = useState(false);
  const [abrirNfe,          setAbrirNfe]          = useState(false);
  const [abrirBoleto,       setAbrirBoleto]       = useState(false);
  const [abrirComprovante,  setAbrirComprovante]  = useState(false);
  const [abrirObs,          setAbrirObs]          = useState(false);
```

- [ ] **Step 3: Adicionar os handlers logo depois de `handleRemoverBoleto`**

Em `app/pedidos/[id]/page.tsx`, logo depois do fechamento de `handleRemoverBoleto` (linha 768, `}`), inserir:

```typescript

  async function handleUploadComprovante(files: File[]) {
    if (!pedido || files.length === 0) return;
    setUploadandoComprovante(true);
    const { urls, erro } = await uploadComprovantePagamento(id, files);
    if (urls.length > 0) {
      const existentes = pedido.comprovante_pagamento_urls ?? [];
      await updatePedido(id, { comprovante_pagamento_urls: [...existentes, ...urls] } as any);
      toast(urls.length > 1 ? `${urls.length} comprovantes salvos` : "Comprovante salvo");
      await load();
    } else {
      toast(`Erro ao enviar comprovante${erro ? `: ${erro}` : ""}`, "err");
    }
    setUploadandoComprovante(false);
  }

  async function handleRemoverComprovante(url: string) {
    if (!pedido) return;
    if (!(await confirm("Remover este comprovante?", { perigo: true }))) return;
    await deleteComprovantePagamento(url);
    const restantes = (pedido.comprovante_pagamento_urls ?? []).filter(u => u !== url);
    await updatePedido(id, { comprovante_pagamento_urls: restantes.length > 0 ? restantes : null } as any);
    toast("Comprovante removido");
    await load();
  }
```

- [ ] **Step 4: Adicionar a seção de UI logo depois da seção Boleto**

Em `app/pedidos/[id]/page.tsx`, logo depois do `)}` que fecha a seção Boleto (linha 1533) e antes do comentário `{/* Observações */}` (linha 1535), inserir:

```typescript

            {/* Comprovante de Pagamento */}
            <button onClick={() => setAbrirComprovante(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", borderTop: "1px solid var(--b1)", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px" }}>💳</span>
                <span style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>COMPROVANTE DE PAGAMENTO</span>
                {(pedido.comprovante_pagamento_urls?.length ?? 0) > 0 && (
                  <span style={{ fontSize: "10px", background: "rgba(34,197,94,.15)", color: "var(--ok)", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>{pedido.comprovante_pagamento_urls!.length}</span>
                )}
              </div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirComprovante ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
            {abrirComprovante && (
              <div style={{ padding: "0 18px 14px" }}>
                {(pedido.comprovante_pagamento_urls?.length ?? 0) > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                    {pedido.comprovante_pagamento_urls!.map((url, i) => (
                      <div key={url} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(34,197,94,.08)", borderRadius: "7px", border: "1px solid rgba(34,197,94,.25)" }}>
                        <span style={{ fontSize: "14px" }}>💳</span>
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "var(--ok)", fontWeight: 600, fontSize: "12px", textDecoration: "underline" }}>Comprovante {i + 1}</a>
                        <button className="btn bw sm" onClick={() => handleRemoverComprovante(url)} disabled={uploadandoComprovante}>Remover</button>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "12px", border: "2px dashed var(--b2)", borderRadius: "7px", cursor: uploadandoComprovante ? "default" : "pointer", background: "var(--surf2)" }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length > 0 && !uploadandoComprovante) handleUploadComprovante(fs); }}>
                  <span style={{ fontSize: "16px" }}>💳</span>
                  <span style={{ fontSize: "11px", color: "var(--t3)" }}>{uploadandoComprovante ? "Enviando..." : "Arraste ou clique para anexar comprovante de pagamento (PDF ou imagem)"}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple name="arquivo_comprovante" style={{ display: "none" }} disabled={uploadandoComprovante}
                    onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) handleUploadComprovante(fs); e.target.value = ""; }} />
                </label>
              </div>
            )}
```

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output (sem erros).

- [ ] **Step 6: Rodar a suite de testes (garantir que nada quebrou)**

Run: `npx vitest run`
Expected: todos os testes passando (mesma contagem de antes — esta task não adiciona testes novos, é UI de I/O igual às 3 seções irmãs, que também não têm teste dedicado).

- [ ] **Step 7: Verificação manual (dev server)**

Run: `npm run dev`, abrir um pedido existente em `/pedidos/[id]`, expandir a seção "COMPROVANTE DE PAGAMENTO", anexar um PDF ou imagem, confirmar que aparece na lista com link funcional, clicar "Remover" e confirmar que some. Nota: sem o SQL da Task 1 rodado no Supabase, o `updatePedido` vai falhar (coluna não existe) — rodar o SQL da Task 1 no ambiente de teste antes desta verificação.

- [ ] **Step 8: Commit**

```bash
git add app/pedidos/\[id\]/page.tsx
git commit -m "feat: secao de comprovante de pagamento na pagina do pedido"
```

---

## Self-Review Notes

- **Cobertura da spec:** bucket+coluna (Task 1), tipo (Task 2), service (Task 3), UI (Task 4) — as 4 peças do design estão cobertas. O item "fora de escopo" (badge na listagem) foi deixado de fora de propósito, conforme a spec.
- **Consistência de nomes:** `uploadComprovantePagamento`/`deleteComprovantePagamento` (Task 3) usados exatamente com esses nomes no import e nos handlers (Task 4); `comprovante_pagamento_urls` usado de forma idêntica em types (Task 2), service (Task 3 — via `pedidoId` genérico, não referencia o campo diretamente) e UI (Task 4).
- **Sem testes unitários novos:** decisão deliberada, documentada na spec — os 3 tipos de documento existentes (Romaneio/NF-e/Boleto) também não têm teste unitário dedicado, é I/O de storage + array simples. A verificação é o typecheck (garante que os tipos batem) + teste manual (Task 4, Step 7).
