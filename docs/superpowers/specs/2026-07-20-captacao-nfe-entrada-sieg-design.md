# Captação de NF-e de Entrada via SIEG — Design

## Contexto

Hoje `compras` só recebe uma NF-e de entrada por upload manual: o
fornecedor manda o XML por fora do sistema, o usuário baixa e sobe em
`ImportarXmlCompraModal` (feature "XML Inteligente de Compras",
2026-07-13). Dois specs anteriores (Documentos Diversos/SIEG,
2026-07-14, e o próprio XML Inteligente de Compras) já identificaram
"captura automática via SIEG" como o próximo passo natural, mas
descartaram explicitamente por depender de credenciais/API externa
ainda não configurada.

Investigação 2026-07-20 confirmou: não existe nenhuma comunicação real
com a SEFAZ no sistema hoje. A única integração fiscal existente é a
Focus NFe, e só pra **emissão** de venda (`app/api/notas/emitir`) — não
serve pra receber nada. Cogitou-se usar a própria Focus NFe pra
manifestação do destinatário, mas foi descartado: já existe um projeto
paralelo ([[project-reforma-tributaria-ibs-cbs]]) travado há dias
esperando resposta da Focus NFe sobre outro recurso, sem retorno — não
faz sentido empilhar mais uma dependência incerta no mesmo fornecedor.
Decisão: usar a SIEG, que o usuário já tem conta (sem chave API ativada
ainda).

## Incerteza real — não é documentação, é dependência externa

O usuário **não confirmou** com a SIEG se o serviço deles cobre busca
de NF-e de entrada pro CNPJ da empresa, nem os detalhes técnicos
(endpoint, autenticação, se exige certificado digital A1 cadastrado no
painel deles, formato da resposta). Isso é tratado explicitamente como
dependência externa a confirmar — mesmo padrão já usado com a Focus
NFe no projeto de Reforma Tributária. A arquitetura abaixo isola essa
incerteza numa única função (`buscarNotasSieg`), então nada do resto do
sistema precisa mudar quando os detalhes reais forem confirmados — só
essa função é reescrita.

## Decisões confirmadas com o usuário

1. **SIEG**, não manifestação do destinatário via Focus NFe (evita
   empilhar num fornecedor já com um bloqueio pendente).
2. **Botão manual "Buscar Notas Recebidas"**, sem cron — mesmo padrão
   já usado no sistema inteiro (botão "Consultar" da Focus NFe), sem
   depender de infraestrutura nova (Vercel Cron pode exigir plano
   pago, e este projeto nunca teve nenhum job agendado).
3. **Reaproveitar ao máximo o fluxo de importação manual já existente**
   — mesmo parser (`parseXmlCompra`), mesmo casamento de
   fornecedor/produto, mesma tela de revisão antes de confirmar. A
   SIEG só troca *de onde vem* o XML, não o que acontece depois dele
   chegar.

## Arquitetura

### Isolamento da chamada externa

**`app/api/compras/buscar-notas-sieg/route.ts`** (novo) — rota
server-side, mesmo padrão de `app/api/notas/emitir/route.ts`: lê
`SIEG_API_KEY` (env var nova, secreta, nunca exposta ao cliente),
protegida por `requireAuth()`, recebe um período (`inicio`/`fim`) e
devolve a lista normalizada:

```ts
export interface NotaSieg {
  chaveAcesso: string;
  numeroNF: string | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  dataEmissao: string | null;
  xml: string;
}
```

**A chamada real à API da SIEG dentro desta rota é o único ponto "a
confirmar"** — endpoint exato, forma de autenticação (header? query
param?), se a resposta já traz o XML completo ou só metadados exigindo
uma segunda chamada por nota, se cobre NF-e de entrada sem certificado
digital cadastrado. Até isso ser confirmado, a rota retorna um erro
claro (`{ error: "SIEG_API_KEY não configurada" }` se a env var estiver
ausente, e propaga qualquer erro da SIEG como mensagem legível) — nunca
falha silenciosamente.

### `services/siegNfe.service.ts` (novo)

Client-side, chama a rota acima via `fetch`:

```ts
export async function buscarNotasSieg(periodo: { inicio: string; fim: string }): Promise<NotaSieg[]>
```

### `ImportarXmlCompraModal` ganha um prop opcional

Mudança mínima e cirúrgica em `components/ui/ImportarXmlCompraModal.tsx`:
um novo prop `arquivoInicial?: File`. Se presente, um `useEffect` no
mount chama `handleFile(arquivoInicial)` automaticamente — a mesma
função que já roda quando o usuário escolhe um arquivo manualmente
(dedup por `chave_acesso`, casamento de fornecedor/produto, tela de
revisão). Nenhuma outra linha do modal muda. O `File` sintético é
construído com `new File([nota.xml], nota.numeroNF ?? nota.chaveAcesso, { type: "application/xml" })`
— `file.text()` dentro do modal devolve a string original normalmente,
sem o modal saber a diferença entre um arquivo do disco e um vindo da
SIEG.

### `components/ui/BuscarNotasRecebidasModal.tsx` (novo)

Ao abrir, chama `buscarNotasSieg()` pro mês atual, e pra cada nota
retornada checa `getDocumentoFiscalPorChaveAcesso(chaveAcesso)` (função
já existente, mesma usada no upload manual) em paralelo — **oculta as
que já foram importadas**. Lista as pendentes: número da NF, fornecedor,
data, valor não disponível ainda (só depois do parse completo). Cada
linha tem um botão "Revisar e Importar", que fecha este modal e abre
`ImportarXmlCompraModal` com `arquivoInicial` montado a partir do `xml`
daquela nota — cai direto na tela de revisão já existente.

Erros (SIEG não configurada, período sem notas, chamada falhou) mostram
mensagem — sem alterar layout/loading de outras telas.

### `app/compras/page.tsx`

Botão novo **"🔍 Buscar Notas Recebidas"** na topbar, ao lado de
"Importar XML" — abre `BuscarNotasRecebidasModal`. O restante do fluxo
(`handleImportarXml`, `handleSalvar`) já existe e não muda nada.

## Fora de escopo (YAGNI)

- Busca automática/cron — decidido, botão manual por enquanto.
- Manifestação do destinatário formal / comunicação direta com SEFAZ —
  a SIEG abstrai isso; se um dia trocar de fornecedor, só a rota
  `buscar-notas-sieg` muda.
- Qualquer mudança no fluxo de emissão de venda (Focus NFe) — módulos
  completamente independentes.
- Certificado digital A1 — se a SIEG exigir pra essa funcionalidade
  específica, é decisão/contratação do usuário, fora do código.

## Testes

Sem teste automatizado pra rota de API nem pros componentes novos
(nenhuma página/rota de I/O deste projeto tem teste). Verificação via
`npx tsc --noEmit` e `npm run build`.

Validação manual do usuário: **bloqueada até `SIEG_API_KEY` existir e
os detalhes reais da API serem confirmados** — o código fica pronto e
commitado, mas o teste de ponta a ponta (clicar "Buscar Notas
Recebidas", ver uma nota real da SIEG, importar) só acontece depois
disso. Até lá, testar só o caminho de erro (sem chave configurada →
mensagem clara, não erro genérico).
