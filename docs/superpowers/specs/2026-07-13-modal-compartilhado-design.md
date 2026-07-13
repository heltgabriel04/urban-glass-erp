# Modal Compartilhado

**Origem**: item "Modal compartilhado de verdade (20+ reimplementações)" do backlog da auditoria geral do ERP (2026-07-10, ver memória `project-auditoria-erp-completa`). Sub-projeto 2 de 4 de uma leva combinada com o usuário (Fornecedor → Modal → RLS → Fiscal).

## Problema

52 ocorrências de modal implementado localmente (`className="mov"` → `.mod` → `.mhd`/`.mtit`/`.mcl`) em 28 arquivos `.tsx` (21 em `app/`, 7 em `components/ui/`). Cada um reimplementa manualmente:
- A moldura (`mov`/`mod`/`mhd`/`mtit`/`mcl`, CSS já centralizado em `app/globals.css:602-640`).
- O fechar-ao-clicar-no-backdrop (`onClick={e => e.target === e.currentTarget && ...}`), byte-idêntico em todo lugar.
- O botão de fechar (`mcl` com `✕` e `aria-label="Fechar"`), também idêntico.
- `useEscToClose` — usado em só 13 dos 28 arquivos hoje (inconsistente).

`components/ui/confirm.tsx` e `components/ui/prompt.tsx` são o modelo mais próximo de um Modal genérico (Context+Promise), mas cada um ainda desenha `mov`/`mod` na mão — não existe um componente `<Modal>` por trás de nenhum dos 52.

## Decisões (confirmadas com o usuário)

- Migrar os 28 arquivos de uma vez (não piloto parcial) — mesmo padrão das levas anteriores da auditoria (alert/confirm/prompt nativos foram migrados 100% de uma vez).
- Preservar a largura exata de cada modal (sem introduzir sistema sm/md/lg — zero mudança visual pretendida).
- Embutir `useEscToClose` dentro do componente `<Modal>` — os 15 arquivos que hoje não fecham no Esc passam a fechar (mudança de comportamento pequena e deliberada, mesma direção já tomada numa leva anterior pra Pedidos/Clientes).
- **Footer e corpo do modal continuam 100% autorais de cada tela** — o componente não tenta unificar botões nem estilo de footer (existem pelo menos 2 convenções visuais diferentes hoje: footer com borda superior nos modais de cadastro tipo Fornecedores/Produtos vs. footer "solto" sem borda em `confirm.tsx`/`prompt.tsx`). Unificar isso seria mudança de design não pedida.

## Componente novo: `components/ui/Modal.tsx`

```tsx
"use client";

import { useEscToClose } from "./useEscToClose";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width: number | string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, width, style, children }: ModalProps) {
  useEscToClose(open, onClose);
  if (!open) return null;
  return (
    <div className="mov open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mod" style={{ width, ...style }}>
        <div className="mhd">
          <span className="mtit">{title}</span>
          <button className="mcl" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- Desmonta (`return null`) quando `open` é `false` — mesmo comportamento que a maioria das 21 telas de `app/` já tem hoje (só `confirm.tsx`/`prompt.tsx` hoje mantêm o `mov` sempre montado e alternam a classe `open`; migrar esses dois pro padrão de desmontagem é uma diferença de implementação sem efeito observável, já que o estado deles vive no Context, não no mount).
- `style` opcional serve pros poucos modais que hoje têm `maxHeight`/`display:flex`/`flexDirection:column` pra footer fixo com corpo rolável (ex.: `app/clientes/page.tsx`, `app/contabilidade/fiscal-produtos/page.tsx`) — passam esse `style` extra em vez de reescrever o wrapper `.mod` inteiro.
- `children` é o corpo INTEIRO de hoje (a `div` de padding com os campos + a `div` de footer com os botões) — migração é colar o mesmo JSX de corpo pra dentro de `<Modal>`, sem reescrever lógica de campo nem de botão.

## Migração (28 arquivos, 52 instâncias de modal)

Cada instância migra de:

```tsx
{modalAberto && (
  <div className="mov open" onClick={e => e.target === e.currentTarget && setModalAberto(false)}>
    <div className="mod" style={{ width: "560px" }}>
      <div className="mhd">
        <div className="mtit">Título</div>
        <button className="mcl" onClick={() => setModalAberto(false)} aria-label="Fechar">✕</button>
      </div>
      {/* corpo + footer, sem mudança */}
    </div>
  </div>
)}
```

para:

```tsx
<Modal open={modalAberto} onClose={() => setModalAberto(false)} title="Título" width="560px">
  {/* corpo + footer, sem mudança */}
</Modal>
```

Se o arquivo já importava e usava `useEscToClose` manualmente pro mesmo modal, essa chamada e o import correspondente saem (o `<Modal>` já cuida disso). Lista completa dos 28 arquivos (via grep por `mov`/`` `mov ``):

`app/fornecedores/page.tsx`, `app/contas-receber/page.tsx`, `app/contas-pagar/page.tsx`, `app/contabilidade/documentos/page.tsx`, `app/contabilidade/cartoes/page.tsx`, `components/ui/prompt.tsx`, `app/pedidos/[id]/page.tsx`, `app/clientes/page.tsx`, `app/bancos-caixa/page.tsx`, `app/formas-pagamento/page.tsx`, `app/orcamentos/page.tsx`, `app/vendedores/page.tsx`, `app/recorrencias/page.tsx`, `app/produtos/page.tsx`, `app/contabilidade/fiscal-produtos/page.tsx`, `app/contabilidade/consorcios/page.tsx`, `app/contabilidade/estoque/page.tsx`, `app/contabilidade/ativo-imobilizado/page.tsx`, `app/contabilidade/emprestimos/page.tsx`, `app/programacao/page.tsx`, `app/investimentos/page.tsx`, `app/plano-contas/page.tsx`, `components/ui/confirm.tsx`, `components/ui/ImportarMedidasModal.tsx`, `components/ui/ImportarPdfModal.tsx`, `components/ui/ImportarRetalhosModal.tsx`, `components/ui/DatePromptModal.tsx`, `components/ui/CommandPalette.tsx`.

## Fora de escopo

- Unificar estilo/borda de footer entre telas — decisão de design não pedida, cada tela mantém o footer que já tem.
- Sistema de tamanhos padronizados (sm/md/lg) — largura exata preservada por tela.
- Migrar `.mov`/`.mod`/`.mhd`/`.mtit`/`.mcl` do CSS global pra CSS-in-JS/módulo — continuam classes globais, `Modal.tsx` só consome, não redefine.
- Acessibilidade adicional (`role="dialog"`, `aria-modal`, focus trap) — não foi pedido nesta rodada; é um achado de acessibilidade separado (`htmlFor` em labels) que já está listado como pendência à parte no backlog da auditoria.

## Teste

Sem framework de teste automatizado para essas telas (padrão do repo). Validação via:
- `tsc --noEmit` limpo após a migração de cada arquivo (pega erros de prop/import na hora).
- `npm run build` limpo ao final de todos os 28.
- Usuário testa manualmente algumas telas depois (abrir/fechar modal, clicar fora, Esc) — não há credencial de teste automatizada disponível localmente (mesma limitação do sub-projeto 1).
