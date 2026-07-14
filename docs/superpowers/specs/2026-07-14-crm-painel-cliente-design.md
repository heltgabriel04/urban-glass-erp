# CRM — Painel do Cliente (Orçamentos + Interações) — Design

**Origem**: item "CRM/follow-up comercial" do backlog da Auditoria ERP, sub-projeto 6 de 7 da segunda leva (migrations → alertas → financeiro na exportação → acessibilidade → cotação de compras → **CRM** → SIEG). A auditoria original só apontava a lacuna, sem especificar comportamento — escopo definido via brainstorming com o usuário em 2026-07-14.

## Decomposição do CRM em 2 sub-projetos

A descrição inicial do usuário misturava dois conceitos: (A) painel único por cliente com contato + histórico + interações, e (B) relatórios analíticos pra decisão estratégica/padrões de comportamento. Como (B) depende de dados de interação que ainda não existem, foi decidido dividir em 2 sub-projetos sequenciais — **esta spec cobre só o (A) Painel do Cliente**. Relatórios Analíticos (B) fica pra depois, com brainstorm próprio sobre dados reais já existentes.

## Escopo real (após checar o código)

`app/clientes/[id]/page.tsx` **já existe e já é um painel de cliente completo**: dados cadastrais, endereço, dados fiscais, resumo financeiro (faturado/recebido/a receber/ticket médio) e histórico de pedidos. Não precisa ser redesenhado.

O que falta de fato, confirmado com o usuário:
1. **Orçamentos do cliente** — a página mostra pedidos, mas não orçamentos.
2. **Interações** (ligação/e-mail/reunião/nota) com lembrete de follow-up — inexistente hoje, é a peça genuinamente nova do "CRM".

## 1. Seção de Orçamentos

Reaproveita a tabela `orcamentos` já existente (`types/index.ts` — `Orcamento { id, cliente_id, dt_criacao, validade, valor_total, status, obs, envio, motivo_rejeicao, obs_rejeicao }`). Mesmo padrão de query direta já usado na página pra `pedidos`:

```ts
supabase.from("orcamentos").select("*").eq("cliente_id", id).order("dt_criacao", { ascending: false })
```

Card novo "Orçamentos do Cliente" na página, mesmo estilo visual do card "Histórico de Pedidos" já existente (tabela: ID, Data, Validade, Valor, Status, link "Ver"). Reaproveita o mapa `CHIP` de status já usado em `app/orcamentos/page.tsx` (Pendente/Aprovado/Recusado).

## 2. Interações

### Tabela nova: `interacoes_cliente`

```sql
create table interacoes_cliente (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references clientes(id),
  tipo text not null check (tipo in ('ligacao', 'email', 'reuniao', 'nota')),
  data timestamptz not null default now(),
  descricao text not null,
  proximo_contato date,
  created_at timestamptz not null default now()
);
```

Sem `usuario_id`/autoria — o projeto não rastreia autoria rigidamente na maioria dos módulos (decisão confirmada com o usuário). Sem soft-delete — é uma nota de acompanhamento, não um registro financeiro/fiscal; exclusão física é suficiente (decisão confirmada com o usuário, mesmo padrão de simplicidade dos módulos não-contábeis).

### Serviço novo: `services/interacoes.service.ts`

- `getInteracoesPorCliente(clienteId: number): Promise<InteracaoCliente[]>` — ordenado por `data` desc.
- `createInteracao(input: InteracaoClienteInsert): Promise<InteracaoCliente | null>`.
- `deletarInteracao(id: number): Promise<boolean>`.

### UI: card novo "Interações" em `app/clientes/[id]/page.tsx`

Posição: depois do card "Resumo Financeiro", antes de "Histórico de Pedidos" (histórico comercial mais recente/acionável primeiro).

- Lista as interações mais recentes primeiro: tipo (ícone/label), data, descrição, e se `proximo_contato` estiver preenchido e no passado, um badge "⚠ Follow-up atrasado há N dias" (cálculo em runtime, sem cron/alerta em outro lugar do sistema — decisão confirmada: só visível nesta página, não no Dashboard).
- Botão "+ Nova Interação" abre um formulário inline (não modal, consistente com o resto da página que já é tudo inline) com: tipo (select: Ligação/E-mail/Reunião/Nota), descrição (textarea), próximo contato (date, opcional). Data da interação é sempre "agora" (`new Date()`), não editável — é um registro de log, não um evento retroativo.
- Botão de excluir por linha (mesmo padrão visual do botão 🗑 já usado nas outras tabelas da página).

## Fora de escopo

- Relatórios/análise sobre interações (sub-projeto B, brainstorm separado).
- Alerta de follow-up em Dashboard ou qualquer lugar fora da página do cliente.
- Vínculo de interação a vendedor específico ou usuário logado.
- Criar interação a partir de outras telas (Orçamentos, Pedidos) — só a partir da página do cliente.
- Editar interação depois de criada — só criar e excluir.
- Redesenho de qualquer seção já existente da página (dados cadastrais, endereço, fiscal, financeiro, pedidos).

## Teste

Sem framework de teste automatizado disponível pra funções que fazem query real no Supabase (mesma limitação recorrente do projeto). Validação via:
- `tsc --noEmit` + `next build` limpos.
- Conferência manual: abrir um cliente com orçamentos e confirmar que aparecem corretos; criar uma interação com `proximo_contato` no passado e confirmar o badge de atrasado; excluir uma interação e confirmar que some da lista.
