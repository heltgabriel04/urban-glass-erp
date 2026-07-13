# Fornecedor: IE + Regime Tributário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar Inscrição Estadual (IE + indicador de contribuinte) e Regime Tributário ao cadastro de Fornecedor, opcionais, sem bloquear salvar.

**Architecture:** 3 colunas novas aditivas em `fornecedores` (migration SQL avulsa, padrão do repo — o usuário roda manualmente no Supabase, não há runner de migration automatizado). Tipos TypeScript estendidos em `types/index.ts` (só a interface base — `FornecedorInsert`/`FornecedorUpdate` são derivados via `Omit`/`Partial`, não precisam de edição própria). UI adicionada ao modal existente em `app/fornecedores/page.tsx`, reaproveitando a máscara de IE já usada em `app/clientes/page.tsx`. `services/fornecedores.service.ts` não muda — já é passthrough genérico.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (Postgres + client JS direto do browser), sem framework de teste automatizado nas telas de cadastro (padrão existente do repo).

## Global Constraints

- Campos opcionais — não adicionar nenhuma validação de obrigatoriedade em `salvar()`.
- Não tocar em `services/fornecedores.service.ts`, RLS/policies de `fornecedores`, nem na listagem/tabela de fornecedores (só o formulário de cadastro/edição).
- Não extrair `maskIE` para módulo compartilhado — duplicar localmente, igual ao padrão já existente (função não-exportada em `clientes/page.tsx`).
- Spec de referência: `docs/superpowers/specs/2026-07-13-fornecedor-ie-regime-design.md`.

---

### Task 1: Migration SQL

**Files:**
- Create: `sql/fornecedores-ie-regime.sql`

**Interfaces:**
- Produces: colunas `ie` (text), `ind_ie` (text, check `'1'|'2'|'9'`, default `'9'`), `regime_tributario` (text, check `'mei'|'simples'|'presumido'|'real'`, nullable) na tabela `fornecedores`. Tasks 2-3 assumem esses nomes e domínios exatos.

- [ ] **Step 1: Escrever a migration**

```sql
-- Fornecedores — Inscrição Estadual + Regime Tributário
-- Aditiva, todas as colunas com default seguro — não afeta os
-- fornecedores existentes. Idempotente (add column if not exists).

alter table fornecedores
  add column if not exists ie text default '',
  add column if not exists ind_ie text default '9' check (ind_ie in ('1','2','9')),
  add column if not exists regime_tributario text check (regime_tributario in ('mei','simples','presumido','real'));
```

- [ ] **Step 2: Validar sintaxe localmente**

Não há runner de SQL local neste repo (migrations rodam manualmente no SQL Editor do Supabase, padrão já usado em todas as fases da Contabilidade/Financeiro). Conferir visualmente que o arquivo segue o mesmo estilo dos outros `sql/*.sql` do repo (comentário de cabeçalho + `alter table` idempotente).

Run: `ls "sql/fornecedores-ie-regime.sql"` (Bash/PowerShell — só confirma que o arquivo existe no lugar certo)
Expected: caminho listado, sem erro.

- [ ] **Step 3: Commit**

```bash
git add sql/fornecedores-ie-regime.sql
git commit -m "feat(fornecedores): adiciona SQL de IE + regime tributario"
```

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `types/index.ts` (interface `Fornecedor`, hoje nas linhas ~82-95 conforme levantamento — confirmar número exato antes de editar, o arquivo pode ter mudado)

**Interfaces:**
- Consumes: nenhuma (edição isolada de tipos).
- Produces: `Fornecedor.ie: string`, `Fornecedor.ind_ie: IndIE` (tipo `IndIE` já existe em `types/index.ts`, importado de Clientes), `Fornecedor.regime_tributario: '' | 'mei' | 'simples' | 'presumido' | 'real'`. Task 3 (UI) consome esses 3 campos exatamente com esses nomes e domínios.

- [ ] **Step 1: Ler a interface atual**

Abrir `types/index.ts` e localizar a interface `Fornecedor` (procurar por `interface Fornecedor`). Confirmar que está assim antes de editar:

```ts
export interface Fornecedor {
  id: number; nome: string; cnpj: string; tel: string; email: string;
  contato: string; cidade: string; uf: string; categoria: string;
  obs: string; ativo: boolean; created_at: string;
}
```

- [ ] **Step 2: Adicionar os 3 campos novos**

Substituir a interface por:

```ts
export interface Fornecedor {
  id: number; nome: string; cnpj: string; tel: string; email: string;
  contato: string; cidade: string; uf: string; categoria: string;
  obs: string; ativo: boolean; created_at: string;
  ie: string; ind_ie: IndIE;
  regime_tributario: '' | 'mei' | 'simples' | 'presumido' | 'real';
}
```

`IndIE` já é exportado em `types/index.ts` (`export type IndIE = '1' | '2' | '9';`, usado por `Cliente`) — não precisa criar de novo, só usar no tipo de `Fornecedor`.

- [ ] **Step 3: Verificar que `FornecedorInsert`/`FornecedorUpdate` propagam os campos**

```
export type FornecedorInsert = Omit<Fornecedor, 'id' | 'created_at'>;
export type FornecedorUpdate = Partial<FornecedorInsert>;
```

Essas duas linhas (logo abaixo da interface) não mudam — são derivadas automaticamente, então já incluem `ie`/`ind_ie`/`regime_tributario` assim que a interface muda.

- [ ] **Step 4: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: erros novos APENAS em `app/fornecedores/page.tsx` (linhas 11-14 `VAZIO` e 41-48 `abrirEdicao`, que ainda não inicializam os campos novos — serão corrigidos na Task 3). Nenhum outro arquivo deve quebrar.

- [ ] **Step 5: Commit**

```bash
git add types/index.ts
git commit -m "feat(fornecedores): adiciona ie/ind_ie/regime_tributario ao tipo Fornecedor"
```

---

### Task 3: UI do formulário

**Files:**
- Modify: `app/fornecedores/page.tsx`

**Interfaces:**
- Consumes: `Fornecedor.ie`, `Fornecedor.ind_ie` (tipo `IndIE`), `Fornecedor.regime_tributario` (Task 2). Tipo `IndIE` importado de `@/types`.
- Produces: nenhuma (folha da árvore — UI final).

- [ ] **Step 1: Importar `IndIE` no topo do arquivo**

Localizar a linha de import de tipos (hoje `import type { Fornecedor, FornecedorInsert } from "@/types";`) e trocar por:

```ts
import type { Fornecedor, FornecedorInsert, IndIE } from "@/types";
```

- [ ] **Step 2: Adicionar a função `maskIE` local**

Logo abaixo dos imports, antes do `const VAZIO`, adicionar (cópia da função já usada em `app/clientes/page.tsx:49-54`, mesmo padrão de não-exportada/local a cada arquivo):

```ts
function maskIE(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 13);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4");
}
```

- [ ] **Step 3: Atualizar `VAZIO` com os defaults novos**

Trocar:

```ts
const VAZIO: FornecedorInsert = {
  nome: "", cnpj: "", tel: "", email: "", contato: "",
  cidade: "", uf: "", categoria: "", obs: "", ativo: true,
};
```

por:

```ts
const VAZIO: FornecedorInsert = {
  nome: "", cnpj: "", tel: "", email: "", contato: "",
  cidade: "", uf: "", categoria: "", obs: "", ativo: true,
  ie: "", ind_ie: "9", regime_tributario: "",
};
```

- [ ] **Step 4: Atualizar `abrirEdicao` pra carregar os campos novos**

Trocar:

```ts
function abrirEdicao(f: Fornecedor) {
  setEditId(f.id);
  setForm({
    nome: f.nome, cnpj: f.cnpj, tel: f.tel, email: f.email, contato: f.contato,
    cidade: f.cidade, uf: f.uf, categoria: f.categoria, obs: f.obs, ativo: f.ativo,
  });
  setModalAberto(true);
}
```

por:

```ts
function abrirEdicao(f: Fornecedor) {
  setEditId(f.id);
  setForm({
    nome: f.nome, cnpj: f.cnpj, tel: f.tel, email: f.email, contato: f.contato,
    cidade: f.cidade, uf: f.uf, categoria: f.categoria, obs: f.obs, ativo: f.ativo,
    ie: f.ie ?? "", ind_ie: (f.ind_ie ?? "9") as IndIE,
    regime_tributario: f.regime_tributario ?? "",
  });
  setModalAberto(true);
}
```

- [ ] **Step 5: Adicionar os 3 campos no modal**

Localizar o bloco do formulário (grid 2 colunas, dentro de `{modalAberto && (...)}`) e, logo depois do `Campo label="Observações"` (o último campo antes do footer de botões), adicionar:

```tsx
<Campo label="Inscrição Estadual (IE)">
  <input className="fc" value={form.ie} onChange={e => upd("ie", maskIE(e.target.value))} placeholder="000.000.000/0000" maxLength={17} inputMode="numeric" style={{ margin:0 }} />
</Campo>
<Campo label="Indicador IE">
  <select className="fc" value={form.ind_ie} onChange={e => upd("ind_ie", e.target.value as IndIE)} style={{ margin:0 }}>
    <option value="1">1 — Contribuinte ICMS</option>
    <option value="2">2 — Contribuinte Isento</option>
    <option value="9">9 — Não Contribuinte</option>
  </select>
</Campo>
<Campo label="Regime Tributário" span2>
  <select className="fc" value={form.regime_tributario} onChange={e => upd("regime_tributario", e.target.value as FornecedorInsert["regime_tributario"])} style={{ margin:0 }}>
    <option value="">Não informado</option>
    <option value="mei">MEI</option>
    <option value="simples">Simples Nacional</option>
    <option value="presumido">Lucro Presumido</option>
    <option value="real">Lucro Real</option>
  </select>
</Campo>
```

(`Campo` já existe como componente local do arquivo, aceita prop `span2` — confirmar visualmente comparando com o campo "Observações" logo acima, que também usa `span2`.)

- [ ] **Step 6: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros (os erros da Task 2 Step 4 em `app/fornecedores/page.tsx` devem ter sumido).

- [ ] **Step 7: Rodar build**

Run: `npm run build`
Expected: build limpo, sem warnings novos relacionados a `app/fornecedores/page.tsx`.

- [ ] **Step 8: Commit**

```bash
git add app/fornecedores/page.tsx
git commit -m "feat(fornecedores): adiciona campos de IE e regime tributario ao formulario"
```

---

### Task 4: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

**Interfaces:**
- Consumes: commits das Tasks 1-3.
- Produces: nada (fim do plano).

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário os passos manuais pendentes**

Não há service role key configurada localmente (`.env.local` só tem `SUPABASE_ANON_KEY`) nem runner de TypeScript avulso (`tsx`/`ts-node`) no projeto — diferente de outras fases anteriores (Contabilidade) que tiveram smoke test via Node script, aqui a validação de schema depende do usuário. Informar explicitamente:

1. Rodar `sql/fornecedores-ie-regime.sql` no SQL Editor do Supabase.
2. Testar no navegador: criar um fornecedor sintético (nome `__teste_ie_regime`), preencher IE/Indicador/Regime, salvar, reabrir pra conferir que persistiu, depois excluir o registro de teste. **Não testar em cima de um fornecedor real já cadastrado** (mesma regra de [[feedback-nunca-testar-em-registro-real]] da memória do projeto).

Isso encerra o sub-projeto 1 de 4 (Fornecedor). Próximo da fila combinada com o usuário: Modal compartilhado.
