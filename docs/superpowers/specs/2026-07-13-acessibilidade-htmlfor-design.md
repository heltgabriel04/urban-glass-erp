# Acessibilidade — htmlFor em Labels

**Origem**: item "Acessibilidade: zero `htmlFor` em labels no sistema" do backlog da auditoria. Sub-projeto 4 de 7 da segunda leva (migrations → alertas → financeiro na exportação → **acessibilidade** → cotação de compras → CRM → SIEG).

## Escopo real (levantado, não estimado)

- **361 ocorrências** de `<label className="fl">` em **33 arquivos** (`grep -rn 'className="fl"' app components`) — o padrão dominante, raw `<div className="fg"><label className="fl">X</label><input/></div>`.
- **3 arquivos adicionais** (`app/bancos-caixa/page.tsx`, `app/fornecedores/page.tsx`, `app/recorrencias/page.tsx`) têm um componente `Campo` local com estilo inline (não usa `.fg`/`.fl`) — também sem `htmlFor`, não capturado pelo grep acima, mas no mesmo problema.
- Nenhum leitor de tela consegue hoje associar programaticamente um label ao seu campo — só a proximidade visual "conecta" os dois.

## Decisões (confirmadas com o usuário)

- Varredura completa dos 361 + os 3 arquivos com `Campo` local — não é uma amostra, é tudo.
- Risco de ID duplicado em campos reusados em lista (ex.: uma tabela editável renderizando o mesmo formulário por linha) resolvido com `React.useId()` — gera um ID estável e único por instância de componente automaticamente, sem precisar inventar uma string única manualmente em cada call site.

## Componente novo: `components/ui/Campo.tsx`

```tsx
"use client";
import { useId, cloneElement, isValidElement, type ReactElement, type CSSProperties } from "react";

interface CampoProps {
  label: string;
  children: ReactElement;
  span2?: boolean;
  style?: CSSProperties;
}

export function Campo({ label, children, span2, style }: CampoProps) {
  const id = useId();
  const campo = isValidElement(children) ? cloneElement(children, { id } as Record<string, unknown>) : children;
  return (
    <div className="fg" style={{ gridColumn: span2 ? "1 / -1" : undefined, ...style }}>
      <label className="fl" htmlFor={id}>{label}</label>
      {campo}
    </div>
  );
}
```

Substitui o padrão `<div className="fg">...</div>` cru nos 33 arquivos. `cloneElement` injeta `id` no filho direto — funciona pra `<input>`/`<select>`/`<textarea>` cru e pra componentes customizados (`CurrencyInput`, `DateInput`, `AutocompleteInput`) **desde que eles aceitem e repassem uma prop `id`** (ver abaixo). Casos onde o filho direto não é o campo em si (ex.: um `<div>` de posicionamento envolvendo o `<input>`) ficam sem `htmlFor` — exceção aceita, não force-encaixar.

## Componentes de campo customizados ganham `id?: string`

`components/ui/CurrencyInput.tsx`, `components/ui/DateInput.tsx`, `components/ui/AutocompleteInput.tsx` — nenhum aceita `id` hoje. Cada um ganha `id?: string` na interface de props, repassado pro `<input>` interno. Mudança aditiva, não quebra nenhum uso existente.

## Os 3 arquivos com `Campo` local

`bancos-caixa/page.tsx`, `fornecedores/page.tsx`, `recorrencias/page.tsx` — a função local ganha `useId()` + `htmlFor`/`id`, **sem trocar pro componente compartilhado** (o estilo deles é inline, diferente do `.fg`/`.fl` — trocar mudaria a aparência, fora do escopo desta correção que é só acessibilidade).

## Migração dos 33 arquivos

Cada bloco:
```tsx
<div className="fg">
  <label className="fl">Rótulo</label>
  <input ... />
</div>
```
vira:
```tsx
<Campo label="Rótulo">
  <input ... />
</Campo>
```
Blocos com `span2` (`gridColumn: "1 / -1"` hoje aplicado via classe utilitária ou style solto, varia por arquivo) viram `<Campo label="..." span2>`. Blocos com `style` extra no `.fg` original (ex.: `maxWidth`) viram `<Campo label="..." style={{...}}>`. Onde há conteúdo extra depois do campo (texto de ajuda, mensagem de erro), esse conteúdo continua depois do campo dentro do `<Campo>` — o `cloneElement` só afeta o primeiro filho.

## Fora de escopo

- Redesenhar visualmente qualquer formulário.
- Unificar os 3 `Campo` locais com o `Campo` compartilhado (estilos diferentes, decisão consciente).
- Corrigir os casos onde o filho direto não é o input em si (raro — aceito ficar sem `htmlFor` nesses poucos casos).
- Outros achados de acessibilidade (contraste, navegação por teclado, ARIA) — só o `htmlFor` foi pedido.

## Teste

Sem framework de teste automatizado. Validação via:
- `tsc --noEmit` + `next build` limpos a cada arquivo.
- Grep final confirmando zero `<label className="fl">` sem `Campo` ao redor restante.
- Usuário confere visualmente que nenhum formulário mudou de aparência (o objetivo é só acessibilidade, zero mudança visual).
