# Editar Observações do Pedido (lista de notas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar o texto de uma nota já criada na seção "Observações" do pedido (hoje só dá pra adicionar ou excluir).

**Architecture:** Uma policy de RLS nova (`UPDATE` em `pedido_observacoes`), uma função de serviço `updateObservacao` no mesmo padrão de `deletarObservacao`, e um modo de edição inline na lista de notas em `app/pedidos/[id]/page.tsx` (a nota vira uma textarea com Salvar/Cancelar).

**Tech Stack:** Next.js (App Router), Supabase (Postgres + RLS), React (client component, `useState`), Vitest.

## Global Constraints

- Sem indicador de "editado" — sobrescreve o texto silenciosamente, igual à exclusão hoje. (Spec: `docs/superpowers/specs/2026-07-24-editar-observacoes-pedido-design.md`)
- Não mexe em `created_at` nem adiciona coluna nova na tabela.
- Não mexe no campo único `pedidos.obs` (já é editável hoje via "Editar pedido").
- Sem restrição por usuário — segue o padrão já existente de `deletarObservacao`, que qualquer usuário autenticado pode chamar.
- Editar uma nota não recarrega a lista do servidor — atualiza o item no estado local (`setObservacoes`), igual ao padrão de `handleAdicionarObservacao`.

---

### Task 1: Policy de UPDATE + função de serviço `updateObservacao`

**Files:**
- Create: `sql/pedido-observacoes-update.sql`
- Modify: `services/observacoes.service.ts` (adiciona função no final do arquivo, depois de `deletarObservacao`)

**Interfaces:**
- Produces: `updateObservacao(id: string, pedidoId: string, texto: string): Promise<boolean>` — mesma assinatura de retorno de `deletarObservacao`, para a Task 2 usar.

A tabela `pedido_observacoes` tem RLS habilitada com policies de `SELECT`, `INSERT` e `DELETE` (`sql/pedido-observacoes.sql`), mas nenhuma de `UPDATE`. Sem a policy, o Supabase bloqueia qualquer update e a query retorna sem erro explícito mas sem alterar a linha — por isso a policy vem antes da função de serviço nesta task, e o teste manual do fim depende dela ter sido rodada no Supabase.

Não há teste automatizado para esta função: as funções irmãs `createObservacao` e `deletarObservacao` também não têm testes unitários no projeto (são wrappers finos sobre `supabase.from(...)`, sem lógica pura pra testar — ver `services/cartoes.service.test.ts` para o padrão de testes deste projeto, que cobre só funções de lógica pura). A verificação desta task é o teste manual do passo final.

- [ ] **Step 1: Criar o arquivo SQL da policy**

Criar `sql/pedido-observacoes-update.sql`:

```sql
-- Falta a policy de UPDATE em pedido_observacoes (só existiam SELECT/INSERT/DELETE em
-- sql/pedido-observacoes.sql). Sem ela, editar o texto de uma nota já criada é
-- bloqueado pelo RLS. Execute no SQL Editor do Supabase.

CREATE POLICY "auth_update" ON pedido_observacoes FOR UPDATE USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Adicionar `updateObservacao` em `services/observacoes.service.ts`**

Adicionar ao final do arquivo (depois de `deletarObservacao`, que termina na linha 44):

```ts
export async function updateObservacao(id: string, pedidoId: string, texto: string): Promise<boolean> {
  const { error } = await supabase.from('pedido_observacoes').update({ texto } as never).eq('id', id);
  if (error) { console.error('updateObservacao:', error); return false; }

  registrarLog({
    acao: "editou", tabela: "pedido_observacoes", registro_id: id,
    descricao: `Editou observação do pedido ${pedidoId}`,
  });
  return true;
}
```

- [ ] **Step 3: Checar tipos**

Rodar: `npx tsc --noEmit`
Esperado: sem erros novos relacionados a `services/observacoes.service.ts`.

- [ ] **Step 4: Commit**

```bash
git add sql/pedido-observacoes-update.sql services/observacoes.service.ts
git commit -m "feat(pedidos): permite editar texto de observação existente (service)"
```

---

### Task 2: Modo de edição inline na lista de Observações

**Files:**
- Modify: `app/pedidos/[id]/page.tsx`
  - Import (linha 11)
  - Estado (perto da linha 184-186)
  - Handlers (depois de `handleExcluirObservacao`, linhas 677-682)
  - Render da lista de notas (linhas 1710-1729)

**Interfaces:**
- Consumes: `updateObservacao(id: string, pedidoId: string, texto: string): Promise<boolean>` (Task 1); `observacoes: PedidoObservacao[]` e `setObservacoes` já existentes (linha 184); `toast` (já importado e usado em `handleExcluirObservacao`).

- [ ] **Step 1: Atualizar o import do serviço**

Em `app/pedidos/[id]/page.tsx:11`, trocar:

```ts
import { getObservacoesPorPedido, createObservacao, deletarObservacao } from "@/services/observacoes.service";
```

por:

```ts
import { getObservacoesPorPedido, createObservacao, deletarObservacao, updateObservacao } from "@/services/observacoes.service";
```

- [ ] **Step 2: Adicionar estado de edição**

Em `app/pedidos/[id]/page.tsx:184-186`, onde hoje está:

```ts
  const [observacoes, setObservacoes]   = useState<PedidoObservacao[]>([]);
  const [novaObs, setNovaObs]           = useState("");
  const [salvandoObs, setSalvandoObs]   = useState(false);
```

adicionar logo abaixo:

```ts
  const [observacoes, setObservacoes]   = useState<PedidoObservacao[]>([]);
  const [novaObs, setNovaObs]           = useState("");
  const [salvandoObs, setSalvandoObs]   = useState(false);
  const [editandoObsId, setEditandoObsId] = useState<string | null>(null);
  const [textoEditadoObs, setTextoEditadoObs] = useState("");
```

- [ ] **Step 3: Adicionar os handlers de edição**

Em `app/pedidos/[id]/page.tsx`, logo depois de `handleExcluirObservacao` (linhas 677-682):

```ts
  async function handleExcluirObservacao(obsId: string) {
    if (!(await confirm("Excluir esta observação?", { perigo: true }))) return;
    const ok = await deletarObservacao(obsId, id);
    if (ok) setObservacoes(prev => prev.filter(o => o.id !== obsId));
    else toast("Erro ao excluir observação", "err");
  }
```

adicionar:

```ts
  function handleIniciarEdicaoObservacao(obs: PedidoObservacao) {
    setEditandoObsId(obs.id);
    setTextoEditadoObs(obs.texto);
  }

  function handleCancelarEdicaoObservacao() {
    setEditandoObsId(null);
    setTextoEditadoObs("");
  }

  async function handleSalvarEdicaoObservacao(obsId: string) {
    const texto = textoEditadoObs.trim();
    if (!texto) return;
    const ok = await updateObservacao(obsId, id, texto);
    if (ok) {
      setObservacoes(prev => prev.map(o => o.id === obsId ? { ...o, texto } : o));
      setEditandoObsId(null);
      setTextoEditadoObs("");
    } else {
      toast("Erro ao editar observação", "err");
    }
  }
```

- [ ] **Step 4: Editar o render da lista de notas**

Em `app/pedidos/[id]/page.tsx:1710-1729`, onde hoje está:

```tsx
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {observacoes.map(o => (
                      <div key={o.id} style={{ background: "var(--surf2)", borderRadius: "7px", padding: "8px 12px", border: "1px solid var(--b2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div style={{ fontSize: "12px", color: "var(--t1)", whiteSpace: "pre-wrap", flex: 1 }}>{o.texto}</div>
                          <button
                            title="Excluir observação"
                            onClick={() => handleExcluirObservacao(o.id)}
                            style={{ background: "transparent", border: "1px solid var(--b2)", borderRadius: "5px", color: "var(--t3)", fontSize: "10px", cursor: "pointer", padding: "2px 6px", flexShrink: 0, transition: "all 0.15s" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                          >🗑</button>
                        </div>
                        <div style={{ fontSize: "9.5px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", marginTop: "5px" }}>
                          {new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {o.usuario_email ? ` · ${o.usuario_email}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
```

trocar por:

```tsx
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {observacoes.map(o => (
                      <div key={o.id} style={{ background: "var(--surf2)", borderRadius: "7px", padding: "8px 12px", border: "1px solid var(--b2)" }}>
                        {editandoObsId === o.id ? (
                          <>
                            <textarea
                              className="fc"
                              value={textoEditadoObs}
                              onChange={e => setTextoEditadoObs(e.target.value)}
                              rows={2}
                              style={{ width: "100%", resize: "vertical", fontSize: "12px" }}
                              autoFocus
                            />
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", marginTop: "6px" }}>
                              <button className="btn bg sm" onClick={handleCancelarEdicaoObservacao}>Cancelar</button>
                              <button
                                className="btn bp sm"
                                onClick={() => handleSalvarEdicaoObservacao(o.id)}
                                disabled={!textoEditadoObs.trim()}
                              >
                                Salvar
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                              <div style={{ fontSize: "12px", color: "var(--t1)", whiteSpace: "pre-wrap", flex: 1 }}>{o.texto}</div>
                              <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                                <button
                                  title="Editar observação"
                                  onClick={() => handleIniciarEdicaoObservacao(o)}
                                  style={{ background: "transparent", border: "1px solid var(--b2)", borderRadius: "5px", color: "var(--t3)", fontSize: "10px", cursor: "pointer", padding: "2px 6px", transition: "all 0.15s" }}
                                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(122,132,158,.15)"; b.style.borderColor = "var(--t3)"; b.style.color = "var(--t1)"; }}
                                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                                >✏️</button>
                                <button
                                  title="Excluir observação"
                                  onClick={() => handleExcluirObservacao(o.id)}
                                  style={{ background: "transparent", border: "1px solid var(--b2)", borderRadius: "5px", color: "var(--t3)", fontSize: "10px", cursor: "pointer", padding: "2px 6px", transition: "all 0.15s" }}
                                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                                >🗑</button>
                              </div>
                            </div>
                            <div style={{ fontSize: "9.5px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", marginTop: "5px" }}>
                              {new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              {o.usuario_email ? ` · ${o.usuario_email}` : ""}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
```

- [ ] **Step 5: Checar tipos**

Rodar: `npx tsc --noEmit`
Esperado: sem erros novos relacionados a `app/pedidos/[id]/page.tsx`.

- [ ] **Step 6: Rodar o lint**

Rodar: `npx eslint app/pedidos/[id]/page.tsx`
Esperado: sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add app/pedidos/[id]/page.tsx
git commit -m "feat(pedidos): permite editar observações já registradas na lista de notas"
```

---

## Teste manual final (depois das duas tasks)

1. Rodar `sql/pedido-observacoes-update.sql` no SQL Editor do Supabase (sem isso o passo 3 abaixo falha).
2. Abrir um pedido, expandir "Observações", adicionar uma nota de teste (ex.: `__teste_edicao_obs`).
3. Clicar no ✏️ da nota, alterar o texto, clicar em Salvar — confirmar que o texto muda na tela e que `created_at` (a data mostrada) não muda.
4. Clicar no ✏️ de novo, alterar o texto, clicar em Cancelar — confirmar que o texto volta ao valor salvo anteriormente.
5. Clicar no ✏️, apagar todo o texto — confirmar que o botão Salvar fica desabilitado.
6. Excluir a nota de teste ao final (não deixar `__teste_edicao_obs` no pedido usado).
