# Cotação de Compras — Histórico de Preços Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao lidar com um produto (editar em `/produtos`, ou escolher o produto num item de Nova Compra), mostrar o histórico de preços já pagos a cada fornecedor por esse produto, pra embasar negociação.

**Architecture:** Uma função nova `getHistoricoPrecoProduto` em `services/compras.service.ts` consulta `compras_itens` com join `!inner` em `compras` (filtrando `status = 'recebido'`) e `fornecedores.nome` — zero tabela nova. Um componente novo `components/ui/HistoricoPrecoProduto.tsx` recebe `produtoId`, busca via essa função e renderiza uma tabela simples. O componente é reaproveitado em dois pontos de integração.

**Tech Stack:** Next.js/TypeScript, Supabase JS v2 (`!inner` embed + `.eq('relacao.coluna', ...)`, mesmo padrão de `services/dre.service.ts` e `services/buscaGlobal.service.ts`).

## Global Constraints

- Zero tabela nova, zero SQL.
- Zero mudança no fluxo atual de criação/recebimento de compra.
- Sem teste automatizado disponível — não há `SUPABASE_SERVICE_ROLE_KEY` nem mock de Supabase configurado neste repo para funções que fazem query real (mesma limitação de todos os sub-projetos anteriores desta sessão: fornecedor IE/regime, Modal compartilhado, RLS, acessibilidade). Validação via `tsc --noEmit` + `next build` + conferência manual.
- **Desvio da spec, documentado aqui**: a spec (`docs/superpowers/specs/2026-07-14-cotacao-compras-historico-precos-design.md`) descreve o ponto de integração em `/produtos` como "ao expandir um produto na listagem". Na exploração de código pra este plano, confirmei que `app/produtos/page.tsx` **não tem mecanismo de expandir linha** (diferente de `/compras`, que tem) — a listagem é uma tabela plana, e o único jeito de "abrir" um produto é o modal de Editar. Task 4 usa esse modal em vez de um card expandido inexistente. Mesmo propósito da spec (ver histórico ao lidar com o produto), UI real do projeto.
- Spec de referência: `docs/superpowers/specs/2026-07-14-cotacao-compras-historico-precos-design.md`.

---

### Task 1: `getHistoricoPrecoProduto` em `services/compras.service.ts`

**Files:**
- Modify: `services/compras.service.ts` (adicionar ao final do arquivo)

**Interfaces:**
- Produces: `HistoricoPrecoItem { data: string; fornecedorNome: string; custoUnitarioM2: number; chapas: number; m2: number }` e `getHistoricoPrecoProduto(produtoId: number): Promise<HistoricoPrecoItem[]>` — consumidos pela Task 2.

- [ ] **Step 1: Adicionar a interface e a função ao final de `services/compras.service.ts`**

```ts
export interface HistoricoPrecoItem {
  data: string;
  fornecedorNome: string;
  custoUnitarioM2: number;
  chapas: number;
  m2: number;
}

/** Histórico de preços já pagos por um produto — só compras já recebidas
 *  (rascunho tem preço não confirmado, fica de fora). Sem paginação: volume
 *  de compras hoje é baixo, e é histórico completo por design (não uma
 *  amostra). */
export async function getHistoricoPrecoProduto(produtoId: number): Promise<HistoricoPrecoItem[]> {
  const { data, error } = await supabase
    .from('compras_itens')
    .select('custo_unitario_m2, chapas, m2, compras!inner ( dt_recebimento, status, fornecedores ( nome ) )')
    .eq('produto_id', produtoId)
    .eq('compras.status', 'recebido');
  if (error) { console.error('getHistoricoPrecoProduto:', error); return []; }

  const linhas = (data ?? []) as unknown as Array<{
    custo_unitario_m2: number;
    chapas: number;
    m2: number;
    compras: { dt_recebimento: string | null; fornecedores: { nome: string } | null };
  }>;

  return linhas
    .map(row => ({
      data: row.compras.dt_recebimento ?? '',
      fornecedorNome: row.compras.fornecedores?.nome ?? '—',
      custoUnitarioM2: row.custo_unitario_m2,
      chapas: row.chapas,
      m2: row.m2,
    }))
    .sort((a, b) => b.data.localeCompare(a.data));
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 3: Commit**

```bash
git add services/compras.service.ts
git commit -m "feat(compras): adiciona getHistoricoPrecoProduto (historico de precos por fornecedor)"
```

---

### Task 2: Componente `HistoricoPrecoProduto`

**Files:**
- Create: `components/ui/HistoricoPrecoProduto.tsx`

**Interfaces:**
- Consumes: `getHistoricoPrecoProduto`, `HistoricoPrecoItem` (Task 1).
- Produces: `HistoricoPrecoProduto({ produtoId: number })` — usado pelas Tasks 3 e 4.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { useEffect, useState } from "react";
import { formatBRL, formatDate } from "@/lib/formatters";
import { getHistoricoPrecoProduto, type HistoricoPrecoItem } from "@/services/compras.service";

interface HistoricoPrecoProdutoProps {
  produtoId: number;
}

export function HistoricoPrecoProduto({ produtoId }: HistoricoPrecoProdutoProps) {
  const [itens, setItens] = useState<HistoricoPrecoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    getHistoricoPrecoProduto(produtoId).then(res => {
      if (ativo) { setItens(res); setLoading(false); }
    });
    return () => { ativo = false; };
  }, [produtoId]);

  if (loading) {
    return <div style={{ fontSize: "12px", color: "var(--t3)", padding: "6px 0" }}>Carregando histórico de preços...</div>;
  }

  if (itens.length === 0) {
    return <div style={{ fontSize: "12px", color: "var(--t3)", padding: "6px 0" }}>Nenhuma compra recebida deste produto ainda.</div>;
  }

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "6px" }}>
        HISTÓRICO DE PREÇOS
      </div>
      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Data</th><th>Fornecedor</th><th>R$/m²</th><th>Chapas</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => (
            <tr key={i}>
              <td className="mono">{formatDate(it.data)}</td>
              <td>{it.fornecedorNome}</td>
              <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(it.custoUnitarioM2)}</td>
              <td className="mono">{it.chapas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros (componente novo isolado, ainda não importado em lugar nenhum).

- [ ] **Step 3: Commit**

```bash
git add components/ui/HistoricoPrecoProduto.tsx
git commit -m "feat(ui): adiciona componente HistoricoPrecoProduto"
```

---

### Task 3: Integração em Nova Compra (`app/compras/page.tsx`)

**Files:**
- Modify: `app/compras/page.tsx`

**Interfaces:**
- Consumes: `HistoricoPrecoProduto` (Task 2).

- [ ] **Step 1: Adicionar o import no topo do arquivo**, junto dos outros imports de `@/components/ui/*`:

```tsx
import { HistoricoPrecoProduto } from "@/components/ui/HistoricoPrecoProduto";
```

- [ ] **Step 2: Envolver a linha de item num wrapper e mostrar o histórico abaixo dela quando um produto estiver selecionado**

Trocar o bloco atual (linhas ~318–371 hoje):

```tsx
            {itens.map((it, i) => {
              const prod = produtos.find(p => String(p.id) === it.produto_id);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.9fr 1fr 1fr auto", gap: "10px", alignItems: "end", marginBottom: "10px" }}>
                  <div>
                    {i === 0 && <label style={labelStyle}>Produto</label>}
                    <select aria-label="Produto" style={selectStyle} value={it.produto_id} onChange={e => updItem(i, "produto_id", e.target.value)}>
                      <option value="">Selecione...</option>
                      {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>Colares</label>}
                    <input aria-label="Colares" style={inputStyle} type="number" min="0" value={it.colares} onChange={e => updItem(i, "colares", e.target.value)}
                      placeholder={prod?.chapas_por_colar ? `× ${prod.chapas_por_colar} ch.` : "config. no produto"} />
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>Chapas *</label>}
                    {prod?.chapas_por_colar ? (
                      <div style={{ ...inputStyle, background: "transparent", color: "var(--t2)" }} title="Calculado automaticamente a partir dos colares">
                        {it.chapas || "—"}
                      </div>
                    ) : (
                      <input aria-label="Chapas" style={inputStyle} type="number" min="0" value={it.chapas} onChange={e => updItem(i, "chapas", e.target.value)} />
                    )}
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>m²/chapa *</label>}
                    {prod?.chapa_largura_mm && prod?.chapa_altura_mm ? (
                      <div style={{ ...inputStyle, background: "transparent", color: "var(--t2)" }} title="Calculado automaticamente a partir da chapa do produto">
                        {it.m2_por_chapa}
                      </div>
                    ) : (
                      <input aria-label="m²/chapa" style={inputStyle} type="number" min="0" step="0.0001" value={it.m2_por_chapa} onChange={e => updItem(i, "m2_por_chapa", e.target.value)} />
                    )}
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>Custo/m²</label>}
                    <CurrencyInput aria-label="Custo/m²" style={inputStyle} className="" value={it.custo_unitario_m2} onChange={v => updItem(i, "custo_unitario_m2", v)} />
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>Subtotal</label>}
                    <div style={{ ...inputStyle, background: "transparent", border: "1px solid transparent", color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>
                      {formatBRL(subtotalItem(it))}
                    </div>
                  </div>
                  <button
                    onClick={() => remItem(i)}
                    title="Remover item"
                    style={{ height: "37px", width: "32px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", cursor: "pointer" }}
                  >✕</button>
                </div>
              );
            })}
```

por:

```tsx
            {itens.map((it, i) => {
              const prod = produtos.find(p => String(p.id) === it.produto_id);
              return (
                <div key={i} style={{ marginBottom: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.9fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                    <div>
                      {i === 0 && <label style={labelStyle}>Produto</label>}
                      <select aria-label="Produto" style={selectStyle} value={it.produto_id} onChange={e => updItem(i, "produto_id", e.target.value)}>
                        <option value="">Selecione...</option>
                        {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Colares</label>}
                      <input aria-label="Colares" style={inputStyle} type="number" min="0" value={it.colares} onChange={e => updItem(i, "colares", e.target.value)}
                        placeholder={prod?.chapas_por_colar ? `× ${prod.chapas_por_colar} ch.` : "config. no produto"} />
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Chapas *</label>}
                      {prod?.chapas_por_colar ? (
                        <div style={{ ...inputStyle, background: "transparent", color: "var(--t2)" }} title="Calculado automaticamente a partir dos colares">
                          {it.chapas || "—"}
                        </div>
                      ) : (
                        <input aria-label="Chapas" style={inputStyle} type="number" min="0" value={it.chapas} onChange={e => updItem(i, "chapas", e.target.value)} />
                      )}
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>m²/chapa *</label>}
                      {prod?.chapa_largura_mm && prod?.chapa_altura_mm ? (
                        <div style={{ ...inputStyle, background: "transparent", color: "var(--t2)" }} title="Calculado automaticamente a partir da chapa do produto">
                          {it.m2_por_chapa}
                        </div>
                      ) : (
                        <input aria-label="m²/chapa" style={inputStyle} type="number" min="0" step="0.0001" value={it.m2_por_chapa} onChange={e => updItem(i, "m2_por_chapa", e.target.value)} />
                      )}
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Custo/m²</label>}
                      <CurrencyInput aria-label="Custo/m²" style={inputStyle} className="" value={it.custo_unitario_m2} onChange={v => updItem(i, "custo_unitario_m2", v)} />
                    </div>
                    <div>
                      {i === 0 && <label style={labelStyle}>Subtotal</label>}
                      <div style={{ ...inputStyle, background: "transparent", border: "1px solid transparent", color: "var(--acc)", fontFamily: "'DM Mono', monospace" }}>
                        {formatBRL(subtotalItem(it))}
                      </div>
                    </div>
                    <button
                      onClick={() => remItem(i)}
                      title="Remover item"
                      style={{ height: "37px", width: "32px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", cursor: "pointer" }}
                    >✕</button>
                  </div>
                  {it.produto_id && <HistoricoPrecoProduto produtoId={Number(it.produto_id)} />}
                </div>
              );
            })}
```

(Única mudança estrutural: a `div` de grid vira filha de uma `div` wrapper sem grid, que carrega o `marginBottom` que antes estava no grid; o histórico entra logo abaixo do grid, dentro do wrapper, condicionado a `it.produto_id` estar preenchido.)

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add app/compras/page.tsx
git commit -m "feat(compras): mostra historico de precos ao escolher produto em Nova Compra"
```

---

### Task 4: Integração em Produtos (`app/produtos/page.tsx`)

**Files:**
- Modify: `app/produtos/page.tsx`

**Interfaces:**
- Consumes: `HistoricoPrecoProduto` (Task 2).

- [ ] **Step 1: Adicionar o import no topo do arquivo**, junto dos outros imports de `@/components/ui/*` e `@/components/produtos/*`:

```tsx
import { HistoricoPrecoProduto } from "@/components/ui/HistoricoPrecoProduto";
```

- [ ] **Step 2: Mostrar o histórico no modal de Editar, só quando `editId` estiver setado** (produto novo ainda não tem histórico de compra nenhum — não faz sentido mostrar nesse caso)

Trocar o bloco atual (linhas ~363–372 hoje):

```tsx
            <Campo style={{ marginBottom:"14px" }} label="Observação">
              <input className="fc" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Observações opcionais" />
            </Campo>

            {/* Aviso se tipo não selecionado em novo produto */}
            {!editId && !form.cod && (
              <div className="al al-i" style={{ marginBottom: "12px", fontSize: "12px" }}>
                Selecione o tipo para gerar o código automaticamente
              </div>
            )}
```

por:

```tsx
            <Campo style={{ marginBottom:"14px" }} label="Observação">
              <input className="fc" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Observações opcionais" />
            </Campo>

            {editId && (
              <div style={{ marginBottom: "14px" }}>
                <HistoricoPrecoProduto produtoId={editId} />
              </div>
            )}

            {/* Aviso se tipo não selecionado em novo produto */}
            {!editId && !form.cod && (
              <div className="al al-i" style={{ marginBottom: "12px", fontSize: "12px" }}>
                Selecione o tipo para gerar o código automaticamente
              </div>
            )}
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 4: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add app/produtos/page.tsx
git commit -m "feat(produtos): mostra historico de precos por fornecedor ao editar produto"
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

Sem ambiente de teste automatizado nem browser disponível nesta sessão pra validar de fato. Pedir pro usuário:
- Em `/produtos`, editar um produto que já teve compras recebidas antes e confirmar que a tabela de histórico aparece com os preços corretos (comparar com as compras já visíveis em `/compras`); editar um produto nunca comprado e confirmar a mensagem de estado vazio.
- Em `/compras`, abrir "+ Nova Compra", escolher um produto com histórico e confirmar que a tabela aparece logo abaixo da linha do item; trocar pra um produto sem histórico e confirmar a mensagem de estado vazio; confirmar que nada mais no formulário mudou de comportamento.

Isso encerra o sub-projeto 5 de 7 (Cotação de compras). Próximo da fila: CRM (módulo novo, vai exigir brainstorm do zero).
