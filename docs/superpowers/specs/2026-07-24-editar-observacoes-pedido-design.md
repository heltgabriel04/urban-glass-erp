# Editar observações do pedido (lista de notas)

**Data:** 2026-07-24

## Contexto

A página do pedido (`app/pedidos/[id]/page.tsx`) tem uma seção expansível "Observações"
que lista notas datadas registradas em `pedido_observacoes` (ex.: "entregador quebrou 4
vidros ontem"). Hoje é possível **adicionar** uma nota nova (`createObservacao`) e
**excluir** uma nota (`deletarObservacao`), mas não existe forma de corrigir o texto de
uma nota já criada — só apagar e recriar, perdendo o `created_at` original.

Isso é diferente do campo único `pedidos.obs`, que já é editável via o formulário de
"Editar pedido".

## Objetivo

Permitir editar o texto de uma nota existente na lista de Observações, sem deixar
indicador de "editado" (decisão do usuário — mantém o mesmo comportamento discreto que
a exclusão já tem hoje).

## Mudanças

### 1. Banco de dados — `sql/pedido-observacoes-update.sql` (novo)

A tabela `pedido_observacoes` tem RLS habilitada com policies de `SELECT`, `INSERT` e
`DELETE`, mas nenhuma de `UPDATE`. Sem a policy, qualquer tentativa de update é
silenciosamente bloqueada pelo RLS. Precisa rodar:

```sql
CREATE POLICY "auth_update" ON pedido_observacoes FOR UPDATE USING (auth.role() = 'authenticated');
```

### 2. `services/observacoes.service.ts`

Nova função, no mesmo padrão de `deletarObservacao`:

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

Não altera `created_at` nem adiciona coluna nova.

### 3. UI — `app/pedidos/[id]/page.tsx`, seção Observações (~linha 1711)

Novo estado local:
- `editandoObsId: string | null`
- `textoEditadoObs: string`

Cada nota na lista ganha um botão ✏️ ("Editar observação") ao lado do 🗑️ existente,
mesmo estilo visual (borda, hover). Ao clicar:
- Entra em modo de edição só daquela nota: `editandoObsId` = id da nota, `textoEditadoObs`
  = texto atual.
- O `<div>` de texto vira uma `<textarea>` inline (mesmo estilo da textarea de "nova
  observação" já existente na seção).
- Aparecem dois botões: **Salvar** (chama `updateObservacao`, atualiza o item em
  `observacoes` no estado local, sai do modo edição) e **Cancelar** (sai do modo edição
  sem salvar).
- Salvar com texto vazio não é permitido (mesma regra do "Adicionar").
- Enquanto uma nota está em edição, o botão 🗑️ dela fica oculto (evita excluir no meio
  de uma edição); as outras notas continuam normais.

Não há necessidade de recarregar a lista inteira do servidor — atualiza o item no
estado local (`setObservacoes(prev => prev.map(...))`) igual ao padrão já usado no
`handleAdicionarObservacao`.

## Fora de escopo

- Indicador de "editado" / histórico de revisões.
- Editar o campo único `pedidos.obs` (já é editável hoje).
- Restringir edição/exclusão por usuário (hoje não existe essa restrição para excluir,
  então não é introduzida para editar).

## Teste manual

1. Abrir um pedido, expandir "Observações", adicionar uma nota de teste.
2. Clicar no ✏️ da nota, alterar o texto, Salvar — confirmar que o texto muda e a data
   original (`created_at`) não muda.
3. Clicar no ✏️, alterar o texto, Cancelar — confirmar que o texto volta ao original.
4. Tentar salvar com texto vazio — botão Salvar deve ficar desabilitado.
5. Rodar o SQL da policy de UPDATE antes do teste acima (sem ela, o update falha
   silenciosamente e o `updateObservacao` retorna `false`).
