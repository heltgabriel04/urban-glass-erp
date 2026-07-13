# XML Inteligente de Compras — Design

## Contexto

A contabilidade enviou uma lista de necessidades (documento externo) pedindo, entre outras coisas, um pipeline automático de importação de XML de NF-e de compra: ao importar o XML, o sistema deveria verificar fornecedor e produto, atualizar estoque, financeiro e custo médio, e arquivar o documento — sem digitação manual.

Investigação do código existente mostrou que a maior parte desse pipeline **já existe**:

- `services/compras.service.ts` já tem `createCompra()` (cria `Compra` + `compras_itens`) e `confirmarRecebimento()` (idempotente: dá entrada em estoque via `registrarMovimentacao` com custo médio ponderado, e gera Conta a Pagar automaticamente via `gerarContaAPagarDaCompra`).
- `app/compras/page.tsx` já tem o formulário "Nova Compra" completo (fornecedor, NF, itens com produto/colares/chapas/m²/custo).
- `services/contabilidadeDocumentos.service.ts` já tem `criarDocumentoFiscal()` e `uploadAnexoDocumentoFiscal()` para registrar e anexar XML/PDF a um documento fiscal.

Ou seja: **não existe pipeline de estoque/financeiro para construir — ele já roda**. O que falta é só a ponte entre "arquivo XML" e "dados prontos para esse pipeline usar", eliminando a digitação manual de fornecedor/NF/itens.

## Escopo desta v1

- Entrada do XML: **upload manual** de um arquivo `.xml` por vez (sem integração com SIEG — isso fica para um sub-projeto futuro, dependente de credenciais e API externa).
- Fluxo: **parse → tela de revisão → confirmar → grava**. Nunca grava direto sem o usuário ver os dados extraídos primeiro (mesmo padrão dos importadores existentes: `ImportarPdfModal`, `ImportarMedidasModal`, `ImportarRetalhosModal`).
- Ao confirmar a revisão, cria de uma vez: `Compra` + `compras_itens` (rascunho) e um `documento_fiscal` (tipo `compra`, com XML anexado, NCM/CFOP extraídos, linkado por `compra_id`).
- O "receber" (que dispara estoque + conta a pagar) continua sendo o botão "Confirmar Recebimento" que já existe em `/compras` — **não muda**, só passa a ser alimentado por dados corretos desde o início.

### Fora de escopo (não fazer agora)

- Integração com API do SIEG (busca automática de XML).
- Conversão automática de quantidade comercial (`qCom`, ex. "12 UN" ou "45,2 M2") para chapas/m². O XML de NF-e não garante que a unidade comercial corresponda a "chapa inteira" — essa conversão fica manual, feita pelo usuário na tela de revisão (o sistema pré-preenche produto e valores; chapas/m²/colares o usuário confirma, igual já faz hoje no formulário manual).
- Matching fuzzy de nome de produto (distância de edição, etc.). Segue o mesmo padrão simples dos importadores existentes: casa por igualdade de nome (case-insensitive, trim), senão deixa em branco para o usuário escolher.
- "Conciliação 3 pontas" como engine separada — coberto como consulta de auditoria (ver seção final), não como sub-projeto à parte.

## Arquitetura

### 1. Parser — `lib/importXmlCompra.ts` (novo)

Função pura, sem I/O, roda no browser com `DOMParser` nativo (NF-e é XML bem formado — não precisa de nenhuma lib nova como `xml2js`/`fast-xml-parser`).

```ts
export interface ItemXmlCompra {
  descricao: string;   // prod/xProd
  ncm: string | null;  // prod/NCM
  cfop: string | null; // prod/CFOP
  quantidade: number;  // prod/qCom
  unidade: string;     // prod/uCom
  valorUnitario: number; // prod/vUnCom
  valorTotal: number;    // prod/vProd
}

export interface XmlCompraParseado {
  chaveAcesso: string | null;   // infNFe/@Id, sem o prefixo "NFe"
  numeroNF: string | null;      // ide/nNF
  serie: string | null;         // ide/serie
  dataEmissao: string | null;   // ide/dhEmi ou ide/dEmi, YYYY-MM-DD
  fornecedorCnpj: string | null; // emit/CNPJ (só dígitos)
  fornecedorNome: string | null; // emit/xNome
  itens: ItemXmlCompra[];
  valorTotalNota: number; // total/ICMSTot/vNF
}

export function parseXmlCompra(xmlText: string): XmlCompraParseado;
```

Implementação: `new DOMParser().parseFromString(xmlText, "application/xml")`, navega pelos elementos via `querySelector`/`getElementsByTagName` (namespace da NF-e exige `getElementsByTagNameNS` ou remover namespace antes de parsear — usar a abordagem de remover o atributo `xmlns` do texto antes do parse, mais simples e já suficiente pra esse caso de uso, sem depender de biblioteca extra). Lança `Error` com mensagem clara se não achar o nó raiz `infNFe` (arquivo não é uma NF-e válida) ou se não achar nenhum `det` (nota sem itens).

### 2. Modal de importação — `components/ui/ImportarXmlCompraModal.tsx` (novo)

Segue exatamente o esqueleto de `ImportarPdfModal.tsx`: input de arquivo → `parseXmlCompra` → tela de revisão → `onImportar(dados)`.

Diferença chave em relação aos importadores existentes: aqui cada item pode ser um produto **diferente** (é uma nota de compra, não um pedido de um cliente só), então a revisão precisa de um seletor de produto **por item**, não um único "produto para todos" como em `ImportarPdfModal`/`ImportarMedidasModal`.

```ts
interface ProdutoOpt { id: number; nome: string; }
interface FornecedorOpt { id: number; nome: string; cnpj: string; }

interface Props {
  produtos: ProdutoOpt[];
  fornecedores: FornecedorOpt[];
  onImportar: (dados: XmlCompraParseado, fornecedorId: number | null, produtoIdsPorItem: (number | null)[], xmlFile: File) => void;
  onCriarFornecedor: () => void; // abre o fluxo de cadastro rápido, sem fechar o modal
  onClose: () => void;
}
```

Tela de revisão mostra, por item: descrição do XML (somente leitura) + `<select>` de produto (pré-selecionado se achou nome igual, case-insensitive) + NCM/CFOP extraídos + valor. Se o CNPJ do fornecedor não bater com nenhum cadastrado, mostra um aviso com nome/CNPJ extraídos do XML e um botão "Cadastrar fornecedor" que abre o modal de fornecedor (reaproveita o existente em `/fornecedores`) sem perder os dados já lidos do XML.

### 3. Integração em `app/compras/page.tsx` (modifica)

- Novo botão "Importar XML" ao lado do botão que abre o formulário manual.
- Ao importar: preenche `form` (fornecedor_id, nf, dt_compra) e `itens` (um `ItemForm` por item do XML, com `produto_id` já setado quando casou, `chapas`/`m2_por_chapa` deixados em branco — usando o `updItem` já existente, que já auto-calcula `m2_por_chapa` a partir do produto selecionado quando o produto tem `chapa_largura_mm`/`chapa_altura_mm` configurados), abre o formulário (`showForm = true`) com os campos já preenchidos, e guarda o `File` do XML e o `chaveAcesso`/`ncm`/`cfop` extraídos num state novo (`xmlPendente`) pra usar no save.
- `handleSalvar` (existente) passa a, depois de `createCompra` ter sucesso, se houver `xmlPendente`: checar duplicata por `chave_acesso` em `documentos_fiscais` (se já existir, avisa e não duplica o documento — a compra em si já foi criada, então o aviso orienta a excluir a compra duplicada se for engano), senão criar o `documento_fiscal` (tipo `compra`, `entrada: true`, `compra_id` da compra recém-criada, `ncm`/`cfop`/`chave_acesso`/`numero_documento`/`competencia_ano`/`competencia_mes` extraídos do XML, `fornecedor_id`) e então `uploadAnexoDocumentoFiscal` + patch de `xml_url`, no mesmo padrão já usado em `app/contabilidade/documentos/page.tsx`.
- Se a compra foi criada **sem** XML (fluxo manual, como já é hoje), nada muda — `xmlPendente` fica `null` e o passo de documento fiscal é pulado.

### 4. Dedup por chave de acesso

Antes de processar a importação (na hora de confirmar a revisão no modal, não só no save), consulta `documentos_fiscais` por `chave_acesso` igual. Se achar, bloqueia com mensagem indicando qual compra/documento já tem essa nota, sem opção de forçar duplicata — chave de acesso é única por definição (44 dígitos), duplicata é sempre erro do usuário (XML errado ou reimportação).

## Fluxo de dados (importação completa)

```
Usuário seleciona .xml
  → parseXmlCompra() [client-side, sem rede]
  → checa chave_acesso duplicada (consulta documentos_fiscais)
      → duplicada: mostra erro, para aqui
  → casa fornecedor por CNPJ
      → não achou: mostra aviso + botão cadastrar (não bloqueia o resto da revisão)
  → casa produto por nome, por item
  → usuário revisa/ajusta produto e completa chapas/m²/colares por item
  → confirma
  → createCompra() [já existente] → Compra (rascunho) + compras_itens
  → criarDocumentoFiscal() + upload do XML [novo, reaproveitando funções existentes]
  → toast de sucesso, formulário fecha
  → (depois, quando o usuário clicar "Confirmar Recebimento", roda o pipeline já existente:
     registrarMovimentacao por item + gerarContaAPagarDaCompra — sem mudança nenhuma aqui)
```

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| Arquivo não é XML válido / não tem `infNFe` | Erro no modal: "Não foi possível ler o XML: não parece ser uma NF-e válida." |
| XML sem nenhum `det` (item) | Erro: "Nenhum item encontrado neste XML." |
| `chave_acesso` já importada antes | Erro: "Esta nota já foi importada (documento #X, compra Y)." Bloqueia. |
| CNPJ do fornecedor não cadastrado | Aviso não-bloqueante na revisão + atalho pra cadastrar. |
| Produto do item não casa com nenhum cadastrado | Select fica em branco, `handleSalvar` já rejeita item sem produto (validação existente: "Adicione ao menos um item com produto, chapas e m²/chapa."). |
| Upload do XML falha após `createCompra` ter sucesso | Compra fica criada normalmente (não é revertida); toast avisa que o XML não foi anexado e que dá pra anexar depois em Documentos Fiscais. Evita perder a compra por causa de um upload que falhou. |

## Conciliação 3 pontas (consulta de auditoria, não engine nova)

Como toda compra que passa por este fluxo fica linkada (`compra_id` em `documento_fiscal`, `lancamentos.compra_id`, `origem_id` em `estoque_movimentacoes`), "conciliar" passa a ser uma consulta, não um motor de matching:

- Documentos fiscais tipo `compra`/`entrada: true` **sem** `compra_id` preenchido → compra registrada fora do fluxo padrão (nota chegou mas não virou compra no sistema).
- Compras com `status = 'recebido'` **sem** lançamento correspondente em `lancamentos` (`compra_id` igual) → falha silenciosa no `gerarContaAPagarDaCompra` (não deveria acontecer, mas é o tipo de coisa que essa consulta pega).

Essa consulta fica fora do escopo desta v1 (é o próximo sub-projeto natural, mas como tela dedicada de auditoria, não como parte do importador de XML).

## Testes / validação

Sem framework de teste automatizado no projeto para este tipo de fluxo (padrão já estabelecido nas sub-tarefas anteriores desta sessão: `npx tsc --noEmit` + `npm run build` após cada arquivo, validação manual no navegador depois). Para este sub-projeto, validação manual mínima recomendada ao final: importar um XML de NF-e real (de compra de vidro), conferir que fornecedor/itens vieram certos, confirmar, e rodar "Confirmar Recebimento" pra ver estoque e conta a pagar aparecerem corretos.
