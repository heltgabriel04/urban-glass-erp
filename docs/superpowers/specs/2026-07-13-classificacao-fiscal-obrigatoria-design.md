# Classificação Fiscal Obrigatória

**Origem**: item "Cadastro de produto permite salvar sem NENHUM dado fiscal" do backlog da auditoria geral do ERP (2026-07-10, ver memória `project-auditoria-erp-completa`). Sub-projeto 4 de 4 (último) de uma leva combinada com o usuário (Fornecedor → Modal → RLS → Fiscal).

## Histórico — reversão de decisão anterior

Numa leva anterior da mesma auditoria (2026-07-10, "TERCEIRA LEVA"), esse item foi avaliado e **decidido explicitamente contra o bloqueio**: os 11 produtos cadastrados na época tinham zero config fiscal própria, e bloquear quebraria o cadastro pra base toda. A solução aplicada foi só visual (chip "Padrão"/"Própria" em `/produtos`, linkando pra `/contabilidade/fiscal-produtos`).

Nesta sessão (2026-07-13) o usuário revisitou o item e **confirmou explicitamente que quer reverter essa decisão** e implementar o bloqueio de verdade — mas só pra produtos novos (os existentes continuam herdando do padrão global sem forçar preenchimento).

## Problema estrutural e decisões (confirmadas com o usuário)

`config_fiscal_produtos.produto_id` referencia `produtos.id` — a config fiscal só pode existir DEPOIS que o produto já foi criado. Não dá pra bloquear a criação exigindo um dado que só pode existir depois. Decisões:

1. **Ordem**: criar o produto → abrir automaticamente o modal de Classificação Fiscal em seguida, no mesmo fluxo (não um formulário fundido, mantém a separação arquitetural da Fase 1 da Contabilidade).
2. **Produtos existentes**: só produtos **novos** exigem classificação. Os já cadastrados continuam editáveis normalmente, herdando do padrão global como já fazem.
3. **Saída do modal obrigatório**: sem X, sem Esc, sem clicar fora — só sai completando a classificação OU clicando "Cancelar e excluir produto" (que apaga o produto recém-criado, garantindo que nunca existe produto sem classificação — tudo ou nada).

## Componente compartilhado novo: `components/produtos/ModalClassificacaoFiscal.tsx`

Hoje `ModalProduto` (junto com as constantes `CFOP_DENTRO`/`CFOP_FORA`/`CST_NORMAL`/`CSOSN`) é local e não-exportado em `app/contabilidade/fiscal-produtos/page.tsx:23-53,55-196`. Vira um componente exportado, reaproveitado nos dois lugares. `SecaoPadrao` (mesma página) também usa essas constantes — ficam exportadas do novo arquivo e importadas de volta na página.

Props novas na interface existente:

```ts
interface ModalClassificacaoFiscalProps {
  item: ProdutoComConfig;
  padrao: ConfigFiscalPadrao;
  onSalvar: (input: ConfigFiscalProdutoInput) => Promise<void>;
  onRemover?: () => Promise<void>;           // opcional agora — só usado no modo normal
  onFechar: () => void;                       // fecha normal (modo não-obrigatório)
  obrigatorio?: boolean;                      // default false
  onCancelarObrigatorio?: () => Promise<void>; // usado só quando obrigatorio=true
  salvando: boolean;
}
```

No footer: se `obrigatorio`, o botão "Cancelar" vira "Cancelar e excluir produto" e chama `onCancelarObrigatorio` em vez de `onFechar`; "Remover exceção" nunca aparece nesse modo (não há necessidade — `config` é sempre `null` pra um produto recém-criado, e o botão já é condicionado a `config &&`).

## `Modal` ganha `dismissible?: boolean`

```ts
dismissible?: boolean; // default true
```

Quando `false`: o backdrop-click não fecha (`onClick={e => dismissible !== false && e.target === e.currentTarget && onClose()}`), `useEscToClose` não dispara (`useEscToClose(open && dismissible !== false, onClose)`), e o botão "✕" do cabeçalho não é renderizado. Único jeito de sair é pelos botões que o conteúdo (children) define.

## Fluxo em `app/produtos/page.tsx`

- `salvar()` sem `editId`: troca `insert([form])` por `insert([form]).select().single()` pra obter o `id` do produto novo.
- Em vez de fechar o modal de cadastro e recarregar, guarda o produto criado num state novo (`produtoPendenteFiscal: Produto | null`) e abre `ModalClassificacaoFiscal` com `item={{produto: produtoPendenteFiscal, config: null}}`, `obrigatorio`.
- Página carrega `padrao` (`getConfigPadrao()`) no mount, igual à página de Contabilidade.
- `onSalvar`: chama `salvarConfigFiscalProduto`, fecha, recarrega lista.
- `onCancelarObrigatorio`: `confirm()` (via `useConfirm`, `perigo: true`), se confirmado deleta o produto (`supabase.from("produtos").delete().eq("id", ...)`), fecha, recarrega lista.
- **Edição de produto existente (`editId` setado) não muda** — sem modal fiscal forçado, sem novo state envolvido.

## `app/contabilidade/fiscal-produtos/page.tsx`

Passa a importar `ModalClassificacaoFiscal` do novo arquivo em vez de definir localmente. Uso continua `obrigatorio` omitido (default `false`) — comportamento idêntico ao de hoje (Cancelar normal, Remover exceção disponível quando `config` existe).

## Fora de escopo

- Os 11 produtos existentes sem config própria — não são tocados, decisão explícita.
- Fundir os campos fiscais no formulário de cadastro de Produtos — mantém a separação arquitetural.
- Qualquer mudança em `config_fiscal_padrao`/parâmetros globais.

## Teste

Sem framework de teste automatizado nem service role key local (mesma limitação dos sub-projetos anteriores). Validação via:
- `tsc --noEmit` + `next build` limpos.
- Usuário testa manualmente: criar um produto sintético novo em `/produtos`, confirmar que o modal fiscal abre automaticamente e não fecha por X/Esc/clique-fora, testar "Cancelar e excluir produto" (produto some), testar completar e salvar (produto some da lista de pendentes em `/contabilidade/fiscal-produtos`). Confirmar que editar um dos produtos já existentes continua sem pedir classificação.
