# Reorganização da página de detalhe do pedido

## Contexto

`app/pedidos/[id]/page.tsx` cresceu ao longo de várias sessões (financeiro,
retiradas, qualidade, documentos, romaneio) sem nunca ter sido repensada como
um todo. O usuário relatou 4 problemas concretos ao abrir um pedido:

1. Excesso de scroll — muitos cards empilhados verticalmente.
2. Falta de hierarquia visual — tudo com o mesmo peso (tamanho/cor/destaque).
3. Informação espalhada/duplicada — ex. valor total aparece em mais de um
   lugar (grid "Informações do Pedido", "Condições de Pagamento", print area).
4. Cores sem critério — vários hex/rgba digitados na mão dentro desta página
   especificamente, mesmo o app já tendo variáveis semânticas (`--ok`,
   `--warn`, `--err`, `--acc`, `--acc2`) e uma paleta de chips de status
   (`.cg/.cy/.cr/.cb/.cp/.co/.cgr`) usadas de forma consistente em outras telas.

Decisão de abordagem, validada com o usuário via 3 mockups comparados
visualmente (abas / coluna lateral fixa / resumo em destaque + tudo
recolhido): **resumo em destaque + tudo recolhido**, por reduzir o scroll
sem exigir uma reestruturação de navegação (menor risco, estende um padrão
que a própria página já usa hoje na seção de Documentos).

## Design

### 1. Card de resumo (hero) — sempre visível, nunca colapsa

Substitui a barra de topo atual (`<div className="tb">`) por uma versão
expandida que inclui, além do que já existe (Voltar, ID do pedido, chip de
status, botão Otimizar Corte quando aplicável, botão Romaneio, botão NC,
botão Avançar Status):

- Nome do cliente
- Valor total (com IPI), valor recebido, valor em aberto — usando `var(--ok)`
  quando quitado e `var(--warn)` quando em aberto (mesma regra de cor que
  `corRetiradas` já usa hoje, só que consolidada aqui em vez de espalhada)
- Progresso de retirada (`X de Y peça(s) retirada(s)`), só quando `temItens`

Todos os botões de ação existentes continuam com o mesmo comportamento —
isso é reposicionamento visual, não mudança de lógica.

### 2. Banners de alerta — continuam sempre visíveis, fora do accordion

O banner "⚠ Otimização de corte pendente" (`bloqueadoSemOtim`) e qualquer
alerta contextual equivalente continuam renderizando logo abaixo do hero,
sem virar seção retrátil — alerta escondido dentro de um accordion fechado
não cumpre a função de alertar.

### 3. Seções retráteis (accordion), reaproveitando o padrão já existente

A seção "Romaneio / NF-e / Boleto / Comprovante" já usa collapse com
`useState(false)` por seção e um header clicável com seta (▾/▲). Esse
exato padrão (mesmo componente visual, mesmo estilo de header) se estende
para as demais seções da página, cada uma virando seu próprio bloco
independente:

| Seção | Conteúdo (inalterado) | Estado inicial |
|---|---|---|
| Itens do Pedido | Tabela de itens (já existe) | **Aberta** |
| Financeiro | Lançamentos a receber, formulário de pagamento, histórico pago (já existe) | Fechada |
| Retiradas | Resumo por vidro, registrar retirada rápida, link "Ver Retiradas" (já existe) | Fechada |
| Informações do Pedido | Cliente/cidade/telefone/data/frete/vendedor-comissão (já existe, hoje em grid ao lado de Financeiro) | Fechada |
| Documentos | Romaneio assinado / NF-e / Boleto / Comprovante / Observações (já existe como accordion aninhado) | Fechada |

Cada seção vira um `useState<boolean>` próprio (seguindo a convenção já usada
para `abrirRomaneio`/`abrirNfe`/`abrirBoleto`/`abrirComprovante`/`abrirObs`),
nomeado de forma equivalente (`abrirItens`, `abrirFinanceiro`,
`abrirRetiradas`, `abrirInformacoes`). `abrirItens` inicia `true`; os demais
`false`.

**Fora de escopo, deliberadamente**: nenhuma lógica interna de nenhuma seção
muda — formulário de pagamento, modal de Não Conformidade, cálculo de saldo
de retirada, upload de documentos, tudo continua exatamente como está. Esta
mudança é só a casca (o que fica visível e em que ordem), não o conteúdo.
Qualidade (Não Conformidades) continua sendo um modal via botão "⚑ NC" —
não existe hoje uma seção fixa na tela para isso, e criar uma está fora do
pedido original.

### 4. Consistência de cor (sem paleta nova)

Varredura da parte **não-impressa** da página (exclui `.print-area`, que
usa hex fixo de propósito — papel não tem tema claro/escuro) substituindo
valores de cor ad-hoc por:

- `var(--ok)` / `var(--warn)` / `var(--err)` onde o significado for
  positivo/atenção/erro (ex.: `corRetiradas`, badges de documento faltando,
  indicadores de quitação)
- As classes de chip já existentes (`.cg/.cy/.cr/.cb/.cp/.co/.cgr`) onde o
  significado for "status categórico" (isso já está correto hoje via `CHIP`
  — só precisa não regredir durante a reorganização)

Não é uma auditoria exaustiva de 100% das cores da página — é uma passada
nas cores que ficarão mais visíveis/repetidas na nova estrutura (hero e
headers de seção), consolidando o que hoje se repete em vários lugares com
valores ligeiramente diferentes.

## Testes

Sem lógica nova a testar isoladamente — é reorganização de JSX/CSS em cima
de estado e cálculos que já existem e já funcionam. Verificação é: typecheck
limpo, suite de testes existente continua passando (nenhuma mudança de
comportamento), `next build` compila a rota, e verificação manual (abrir um
pedido, conferir que hero mostra os dados certos, que cada seção abre/fecha
independente, que nada de dados sumiu).

## Migração

Nenhuma mudança de schema ou dado — puramente `app/pedidos/[id]/page.tsx`
(e possivelmente pequenos ajustes de estilo em `app/globals.css` se alguma
cor precisar de uma variável que ainda não existe, o que não é esperado
dado o levantamento já feito).
