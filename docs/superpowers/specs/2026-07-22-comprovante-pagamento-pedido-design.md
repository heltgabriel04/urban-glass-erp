# Comprovante de pagamento no pedido

## Contexto

Hoje `app/pedidos/[id]/page.tsx` já tem um card único ("Romaneio / NF-e /
Boleto / Observações") com 3 seções retráteis de anexo de documento —
romaneio assinado, NF-e e boleto. Cada uma segue o mesmo padrão: bucket
próprio no Supabase Storage, coluna `text[]` na tabela `pedidos`, par de
funções `upload*/delete*` em `services/pedidos.service.ts`, e uma seção
de UI com badge de contagem, lista de links com botão "Remover", e área
de arrastar-e-soltar.

Pedido do usuário: adicionar um 4º tipo de documento ao mesmo esquema —
comprovante de pagamento (ex.: print/PDF de PIX ou transferência) — sem
mexer no que já existe.

## Design

Réplica exata do padrão Boleto (`BUCKET_BOLETO`, `uploadBoleto`,
`deleteBoleto`, seção "BOLETO" na UI), trocando só nomes e textos:

### Storage + banco
- Bucket novo `comprovantes-pagamento-pedidos` (público, limite 20MB,
  mesmas 3 policies de storage.objects que os buckets existentes:
  leitura pública, insert/delete restritos a `auth.role() = 'authenticated'`).
- Coluna nova `pedidos.comprovante_pagamento_urls text[] DEFAULT NULL`.
- Arquivo `sql/pedido-comprovante-pagamento.sql`, seguindo o formato de
  `sql/criar-buckets-storage.sql` (bucket + policies + coluna num arquivo
  só, já que é a mesma unidade de trabalho).

### Tipos
- `types/index.ts`: campo `comprovante_pagamento_urls?: string[] | null;`
  no tipo `Pedido`, ao lado de `nfe_urls`/`boleto_urls`.

### Service (`services/pedidos.service.ts`)
- `const BUCKET_COMPROVANTE_PAGAMENTO = 'comprovantes-pagamento-pedidos';`
- `uploadComprovantePagamento(pedidoId: string, files: File[])` — idêntica
  a `uploadBoleto`, registra log com texto "Anexou N comprovante(s) de
  pagamento em {pedidoId}".
- `deleteComprovantePagamento(url: string)` — idêntica a `deleteBoleto`.

### UI (`app/pedidos/[id]/page.tsx`)
- Estado novo: `uploadandoComprovante`, `abrirComprovante` (mesmo padrão
  de `uploadandoBoleto`/`abrirBoleto`).
- Handlers novos: `handleUploadComprovante`, `handleRemoverComprovante`
  (mesma lógica de `handleUploadBoleto`/`handleRemoverBoleto`, usando
  `pedido.comprovante_pagamento_urls`).
- Nova seção retrátil "COMPROVANTE DE PAGAMENTO", posicionada logo depois
  da seção Boleto, dentro do mesmo card. Badge de contagem, lista com
  link + "Remover", área de drag-and-drop com
  `accept=".pdf,.jpg,.jpeg,.png"` (confirmado com o usuário — mesmo
  aceite do Boleto, cobre tanto PDF quanto foto/print tirado no celular).
  Texto do dropzone: "Arraste ou clique para anexar comprovante de
  pagamento (PDF ou imagem)".

### Fora de escopo (decisão explícita)
`app/pedidos/page.tsx` (listagem) hoje mostra badges "falta NF-e" /
"falta Boleto" condicionados a regras de negócio específicas de cada
documento (`!sem_nota_fiscal`, `forma_pgto` contém "boleto"). Não existe
regra equivalente óbvia para quando um comprovante de pagamento é
esperado — não será adicionado badge de pendência na listagem nesta
mudança. Se o usuário quiser esse alerta depois, precisa definir a regra
primeiro (ex.: pedido com forma de pagamento PIX/transferência sem
comprovante anexado).

## Testes
Sem lógica nova a testar isoladamente (é I/O de storage + array simples,
mesmo padrão dos 3 tipos de documento já existentes, que também não têm
teste unitário dedicado). Verificação é manual: anexar, ver aparecer na
lista, remover, ver sumir — mesmo esperado dos outros 3 tipos.

## Migração
Novo arquivo SQL (`sql/pedido-comprovante-pagamento.sql`) precisa ser
rodado manualmente no Supabase SQL Editor pelo usuário, como todos os
outros nesta base (ver `sql/MANIFEST.md`).
