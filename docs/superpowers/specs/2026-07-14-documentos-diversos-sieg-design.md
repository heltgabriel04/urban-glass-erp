# Documentos Diversos (gap do SIEG) — Design

**Origem**: item "SIEG (documentos não capturados)" do backlog da Auditoria ERP, sub-projeto 7 (último) da segunda leva (migrations → alertas → financeiro na exportação → acessibilidade → cotação de compras → CRM → **SIEG**). Era a "maior lacuna" identificada na auditoria original da Contabilidade — área inteira do prompt original nunca construída. Escopo definido via brainstorming com o usuário em 2026-07-14.

## O que é SIEG e o que fica de fora

SIEG (assim como Nuvem Fiscal/FocusNFe, já integrados ao sistema) é um serviço de captura automática de NF-e/NFS-e — documentos fiscais formais. Ele **não cobre** despesas administrativas recorrentes que não são nota fiscal: conta de energia, água, telefone/internet, guias de imposto (DARF/GPS), boletos diversos, reembolso de funcionário. Hoje essas despesas não têm lugar organizado no sistema — viram lançamento manual solto em Contas a Pagar, sem documento/comprovante anexado nem categorização.

## Por que uma tabela nova (não estender `documentos_fiscais`)

A maioria dos campos de `documentos_fiscais` (NCM, CFOP, CST, chave de acesso, XML) não se aplica a esses documentos — não são NF-e. Reaproveitar a tabela forçaria um monte de campo nulo/sem sentido e o modal de Documentos Fiscais (`ModalDocProps`, acoplado a esses campos fiscais) teria que virar condicional. Tabela e formulário próprios, mesmo padrão de separação já usado pra Cartões/Empréstimos/Consórcios na Fase 4 (área nova = tabela + service + aba próprios).

## Tabela `documentos_diversos`

```sql
CREATE TABLE documentos_diversos (
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
```

Soft-delete (mesmo padrão de `documentos_fiscais`/`ativos_imobilizados` — é uma tabela de compliance, sem DELETE físico). Categoria em lista fixa (7 valores), não texto livre — consistência pra relatório/filtro, mesmo espírito de `tipo` em `documentos_fiscais`.

## Lançamento financeiro automático

Ao criar um documento diverso, gera automaticamente um lançamento de Saída em Contas a Pagar vinculado (`lancamento_id` preenchido na criação) — mesmo padrão de `gerarContaAPagarDaCompra` em `services/compras.service.ts`, evita redigitação. Diferente do padrão de Compras (que precisa ser idempotente porque `confirmarRecebimento` pode ser chamado de novo), aqui a criação acontece uma vez só — sem necessidade de checagem de duplicidade.

## Serviço: `services/contabilidadeDocumentosDiversos.service.ts`

- `getDocumentosDiversos(filtro?: { competenciaAno?, competenciaMes?, categoria? }): Promise<DocumentoDiverso[]>`
- `criarDocumentoDiverso(input): Promise<DocumentoDiverso | null>` — cria o documento e o lançamento vinculado na mesma chamada.
- `softDeleteDocumentoDiverso(id, motivo): Promise<boolean>`
- `uploadAnexoDocumentoDiverso(id, file): Promise<string | null>` — mesmo bucket `contabilidade-anexos` já usado pelos outros anexos da Contabilidade.

## Página nova: `/contabilidade/diversos`

Nova aba "Documentos Diversos" em `ContabilidadeTabs` (slug `diversos`, entre "Cartões/Empréstimos/Consórcios" e "Configuração Fiscal"). Página no mesmo estilo das outras abas de Contabilidade: filtro por competência (ano/mês) + categoria, tabela (Categoria, Fornecedor, Descrição, Valor, Vencimento, PDF, Status do lançamento — lido do `lancamento_id` vinculado, não duplicado), botão "+ Novo Documento" com formulário (categoria, fornecedor opcional, descrição, valor, vencimento, upload de PDF opcional na criação ou depois).

## Dashboard e Alertas

**6º card de semáforo** em `services/contabilidadeDashboard.service.ts` (mesmo padrão dos 5 existentes — Documentos Fiscais/Estoque/Ativo Imobilizado/Cartões/Financeiro): vermelho se algum documento do mês sem PDF, amarelo se o item do checklist ainda não foi marcado manualmente, verde se completo. Grid do Dashboard (`app/contabilidade/page.tsx`) ajusta de 5 pra 6 colunas.

**Alerta novo em `getAlertas()`**: "Documento diverso sem PDF anexado" (severidade crítico), mesmo padrão de "NF de compra/entrada sem PDF".

## Checklist Mensal

Item novo em `lib/contabilidadeChecklist.ts`: `{ key: "documentos_diversos", label: "Documentos Diversos", area: "documentos_diversos", faseDisponivel: 7 }`, `FASE_ATUAL` sobe de 6 pra 7. É um toggle manual do usuário (mesmo padrão dos outros itens — o semáforo vermelho de "sem PDF" é um alerta automático separado, não substitui o toggle manual).

## Fora de escopo

- Captura automática de verdade (integração com SIEG ou qualquer API) — é só o registro manual organizado que falta hoje. Automatizar captura é outro projeto, não pedido aqui.
- Centro de custo — removido do sistema antes da Fase 1 da Contabilidade (decisão deliberada), não recriado aqui mesmo estando no prompt original.
- Editar categoria/fornecedor/valor depois de criado o lançamento vinculado — sem escopo de edição avançada nesta rodada, só criar/excluir (soft-delete).
- Inclusão na exportação `.zip` mensal (`lib/exportacaoContabilidade.ts`) — pode ser pedido futuro, não incluído aqui pra não inflar o escopo desta rodada.

## Teste

Sem framework de teste automatizado disponível pra funções que fazem query real no Supabase (mesma limitação recorrente do projeto). Validação via:
- `tsc --noEmit` + `next build` limpos.
- Conferência manual: criar um documento diverso, confirmar que aparece em Contas a Pagar vinculado; conferir o alerta "sem PDF" e o 6º card do Dashboard antes/depois de anexar o PDF; marcar o item do checklist e confirmar que o semáforo amarelo desaparece.
