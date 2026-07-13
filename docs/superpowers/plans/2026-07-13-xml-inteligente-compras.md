# XML Inteligente de Compras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar um XML de NF-e de compra, pré-preencher o formulário "Nova Compra" já existente (fornecedor, NF, itens) e, ao salvar, registrar automaticamente o documento fiscal correspondente com o XML anexado — eliminando a digitação manual de fornecedor/NF/produtos/valores.

**Architecture:** Um parser puro (`lib/importXmlCompra.ts`, regex sobre o texto do XML — sem `DOMParser` e sem lib nova, testável em Node) extrai os dados do XML. Um modal de revisão (`ImportarXmlCompraModal.tsx`) lê o arquivo, casa fornecedor por CNPJ e produto por nome, e devolve os dados pro `app/compras/page.tsx` pré-preencher o formulário manual já existente. O fluxo de salvar (`createCompra` → `confirmarRecebimento`, ambos já existentes e não alterados) continua igual; só ganha um passo extra depois de `createCompra`: `anexarXmlNaCompra` (nova função em `compras.service.ts`) cria o `documento_fiscal` e sobe o XML, reaproveitando `criarDocumentoFiscal`/`uploadAnexoDocumentoFiscal`/`atualizarDocumentoFiscal` que já existem em `contabilidadeDocumentos.service.ts`.

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase. Testes com Vitest (já configurado no projeto, `environment: "node"`, sem jsdom — por isso o parser usa regex em vez de `DOMParser`, que não existe em Node).

## Global Constraints

- Não adicionar nenhuma dependência nova (nem lib de parsing de XML, nem lib de matching fuzzy) — YAGNI, reaproveitar o que já existe no projeto.
- Não converter automaticamente quantidade/unidade comercial do XML em chapas — isso fica manual na revisão (ver spec, seção "Fora de escopo").
- Todo texto de interface em português, seguindo o padrão do resto do app.
- Cada arquivo modificado: rodar `npx tsc --noEmit` antes de commitar. Build completo (`npm run build`) ao final do plano.
- Commits pequenos, um por task, no padrão já usado nesta sessão: `git commit -m "..." ` com `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, push direto pra `main` (sem branch — convenção já estabelecida neste projeto).

---

### Task 1: Parser de XML + funções de casamento (`lib/importXmlCompra.ts`)

**Files:**
- Create: `lib/importXmlCompra.ts`
- Test: `lib/importXmlCompra.test.ts`

**Interfaces:**
- Produces: `parseXmlCompra(xmlText: string): XmlCompraParseado`, `casarFornecedorPorCnpj(cnpjXml: string | null, fornecedores: FornecedorParaCasamento[]): number | null`, `casarProdutoPorNome(descricaoXml: string, produtos: ProdutoParaCasamento[]): number | null`, e os tipos `ItemXmlCompra`, `XmlCompraParseado`, `FornecedorParaCasamento`, `ProdutoParaCasamento`. Tasks 4 e 5 consomem essas funções e tipos.

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo ainda não existe)**

Criar `lib/importXmlCompra.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseXmlCompra, casarFornecedorPorCnpj, casarProdutoPorNome } from "./importXmlCompra";

const XML_VALIDO = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe35240712345678000199550010000012341234567890">
      <ide>
        <cUF>35</cUF>
        <nNF>1234</nNF>
        <serie>1</serie>
        <dhEmi>2026-07-10T14:32:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>Vidros Fornecedor LTDA</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>001</cProd>
          <xProd>VIDRO TEMPERADO 8MM INCOLOR</xProd>
          <NCM>70071900</NCM>
          <CFOP>5102</CFOP>
          <uCom>M2</uCom>
          <qCom>45.2000</qCom>
          <vUnCom>85.0000</vUnCom>
          <vProd>3842.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>002</cProd>
          <xProd>VIDRO LAMINADO 4+4 INCOLOR</xProd>
          <NCM>70051000</NCM>
          <CFOP>5102</CFOP>
          <uCom>M2</uCom>
          <qCom>20.0000</qCom>
          <vUnCom>120.0000</vUnCom>
          <vProd>2400.00</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>6242.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

describe("parseXmlCompra", () => {
  it("extrai fornecedor, itens e total de um XML de NF-e válido", () => {
    const r = parseXmlCompra(XML_VALIDO);
    expect(r.fornecedorCnpj).toBe("12345678000199");
    expect(r.fornecedorNome).toBe("Vidros Fornecedor LTDA");
    expect(r.numeroNF).toBe("1234");
    expect(r.serie).toBe("1");
    expect(r.dataEmissao).toBe("2026-07-10");
    expect(r.chaveAcesso).toBe("35240712345678000199550010000012341234567890");
    expect(r.itens).toHaveLength(2);
    expect(r.itens[0]).toEqual({
      descricao: "VIDRO TEMPERADO 8MM INCOLOR",
      ncm: "70071900",
      cfop: "5102",
      quantidade: 45.2,
      unidade: "M2",
      valorUnitario: 85,
      valorTotal: 3842,
    });
    expect(r.itens[1].descricao).toBe("VIDRO LAMINADO 4+4 INCOLOR");
    expect(r.valorTotalNota).toBe(6242);
  });

  it("lança erro se o XML não tem <infNFe>", () => {
    expect(() => parseXmlCompra("<xml><foo>bar</foo></xml>")).toThrow(/não parece ser uma NF-e válida/i);
  });

  it("lança erro se o XML não tem nenhum item <det>", () => {
    const semItens = XML_VALIDO.replace(/<det[\s\S]*?<\/det>/g, "");
    expect(() => parseXmlCompra(semItens)).toThrow(/nenhum item/i);
  });
});

describe("casarFornecedorPorCnpj", () => {
  const fornecedores = [
    { id: 1, nome: "Vidros Fornecedor LTDA", cnpj: "12.345.678/0001-99" },
    { id: 2, nome: "Outro Fornecedor", cnpj: "99999999000199" },
  ];

  it("acha o fornecedor comparando só os dígitos do CNPJ (ignora pontuação)", () => {
    expect(casarFornecedorPorCnpj("12345678000199", fornecedores)).toBe(1);
  });

  it("retorna null se não achar", () => {
    expect(casarFornecedorPorCnpj("00000000000000", fornecedores)).toBeNull();
  });

  it("retorna null se o CNPJ do XML for null", () => {
    expect(casarFornecedorPorCnpj(null, fornecedores)).toBeNull();
  });
});

describe("casarProdutoPorNome", () => {
  const produtos = [
    { id: 10, nome: "Vidro Temperado 8mm Incolor" },
    { id: 11, nome: "Vidro Laminado 4+4 Incolor" },
  ];

  it("acha o produto ignorando maiúsculas/minúsculas e espaços nas pontas", () => {
    expect(casarProdutoPorNome("  VIDRO TEMPERADO 8MM INCOLOR  ", produtos)).toBe(10);
  });

  it("retorna null se não achar nome igual", () => {
    expect(casarProdutoPorNome("Vidro Temperado 10mm", produtos)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (módulo não existe)**

Run: `npx vitest run lib/importXmlCompra.test.ts`
Expected: FAIL com "Cannot find module './importXmlCompra'" (ou similar).

- [ ] **Step 3: Implementar `lib/importXmlCompra.ts`**

```ts
export interface ItemXmlCompra {
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
}

export interface XmlCompraParseado {
  chaveAcesso: string | null;
  numeroNF: string | null;
  serie: string | null;
  dataEmissao: string | null;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  itens: ItemXmlCompra[];
  valorTotalNota: number;
}

function extrairTag(bloco: string, nomeTag: string): string | null {
  const re = new RegExp(`<${nomeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${nomeTag}>`);
  const m = bloco.match(re);
  return m ? m[1].trim() : null;
}

function extrairBlocos(xml: string, nomeTag: string): string[] {
  const re = new RegExp(`<${nomeTag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${nomeTag}>`, "g");
  return xml.match(re) ?? [];
}

/**
 * Parser de XML de NF-e baseado em regex, não em DOMParser — o ambiente de
 * teste (vitest, environment "node") não tem DOM disponível, e não vale a
 * pena adicionar jsdom/xmldom só pra isso quando a NF-e tem uma estrutura
 * simples o bastante (tags sem atributos nos campos que interessam aqui).
 */
export function parseXmlCompra(xmlText: string): XmlCompraParseado {
  if (!/<infNFe[\s>]/.test(xmlText)) {
    throw new Error("Não parece ser uma NF-e válida (não encontrei <infNFe>).");
  }

  const idMatch = xmlText.match(/<infNFe[^>]*\bId="([^"]+)"/);
  const chaveAcesso = idMatch ? idMatch[1].replace(/^NFe/, "") : null;

  const ideBloco = extrairBlocos(xmlText, "ide")[0] ?? "";
  const numeroNF = extrairTag(ideBloco, "nNF");
  const serie = extrairTag(ideBloco, "serie");
  const dhEmi = extrairTag(ideBloco, "dhEmi") ?? extrairTag(ideBloco, "dEmi");
  const dataEmissao = dhEmi ? dhEmi.slice(0, 10) : null;

  const emitBloco = extrairBlocos(xmlText, "emit")[0] ?? "";
  const fornecedorCnpj = extrairTag(emitBloco, "CNPJ");
  const fornecedorNome = extrairTag(emitBloco, "xNome");

  const detBlocos = extrairBlocos(xmlText, "det");
  if (detBlocos.length === 0) {
    throw new Error("Nenhum item encontrado neste XML.");
  }

  const itens: ItemXmlCompra[] = detBlocos.map((det) => {
    const prodBloco = extrairBlocos(det, "prod")[0] ?? det;
    return {
      descricao: extrairTag(prodBloco, "xProd") ?? "",
      ncm: extrairTag(prodBloco, "NCM"),
      cfop: extrairTag(prodBloco, "CFOP"),
      quantidade: Number(extrairTag(prodBloco, "qCom") ?? 0),
      unidade: extrairTag(prodBloco, "uCom") ?? "",
      valorUnitario: Number(extrairTag(prodBloco, "vUnCom") ?? 0),
      valorTotal: Number(extrairTag(prodBloco, "vProd") ?? 0),
    };
  });

  const totalBloco = extrairBlocos(xmlText, "ICMSTot")[0] ?? "";
  const valorTotalNota = Number(extrairTag(totalBloco, "vNF") ?? 0);

  return { chaveAcesso, numeroNF, serie, dataEmissao, fornecedorCnpj, fornecedorNome, itens, valorTotalNota };
}

export interface FornecedorParaCasamento {
  id: number;
  nome: string;
  cnpj: string;
}

export function casarFornecedorPorCnpj(
  cnpjXml: string | null,
  fornecedores: FornecedorParaCasamento[]
): number | null {
  if (!cnpjXml) return null;
  const soDigitos = (s: string) => s.replace(/\D/g, "");
  const alvo = soDigitos(cnpjXml);
  const achado = fornecedores.find((f) => soDigitos(f.cnpj) === alvo);
  return achado?.id ?? null;
}

export interface ProdutoParaCasamento {
  id: number;
  nome: string;
}

export function casarProdutoPorNome(
  descricaoXml: string,
  produtos: ProdutoParaCasamento[]
): number | null {
  const alvo = descricaoXml.trim().toLowerCase();
  const achado = produtos.find((p) => p.nome.trim().toLowerCase() === alvo);
  return achado?.id ?? null;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/importXmlCompra.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `lib/importXmlCompra.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/importXmlCompra.ts lib/importXmlCompra.test.ts
git commit -m "feat: parser de XML de NF-e de compra + casamento de fornecedor/produto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Busca de documento fiscal por chave de acesso (dedup)

**Files:**
- Modify: `services/contabilidadeDocumentos.service.ts`

**Interfaces:**
- Consumes: nada novo (usa `supabase` e o tipo `DocumentoFiscal` já importados no arquivo).
- Produces: `getDocumentoFiscalPorChaveAcesso(chaveAcesso: string): Promise<DocumentoFiscal | null>`. Task 3 consome essa função.

- [ ] **Step 1: Adicionar a função**

Em `services/contabilidadeDocumentos.service.ts`, logo depois de `getDocumentoFiscalById` (depois da linha que fecha essa função, antes de `criarDocumentoFiscal`), adicionar:

```ts
export async function getDocumentoFiscalPorChaveAcesso(chaveAcesso: string): Promise<DocumentoFiscal | null> {
  const { data, error } = await supabase
    .from("documentos_fiscais")
    .select("*, fornecedores ( id, nome, cnpj )")
    .eq("chave_acesso", chaveAcesso)
    .is("deletado_em", null)
    .maybeSingle();
  if (error) { console.error("getDocumentoFiscalPorChaveAcesso:", error); return null; }
  return data as DocumentoFiscal | null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `services/contabilidadeDocumentos.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add services/contabilidadeDocumentos.service.ts
git commit -m "feat: busca documento fiscal por chave de acesso (dedup de XML)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Vincular XML a uma compra (`anexarXmlNaCompra`)

**Files:**
- Modify: `services/compras.service.ts`

**Interfaces:**
- Consumes: `getDocumentoFiscalPorChaveAcesso` (Task 2), `criarDocumentoFiscal`/`uploadAnexoDocumentoFiscal`/`atualizarDocumentoFiscal` (já existentes em `contabilidadeDocumentos.service.ts`).
- Produces: `anexarXmlNaCompra(compraId: string, dados: DadosXmlParaDocumento, xmlFile: File): Promise<ResultadoAnexarXml>` e o tipo `DadosXmlParaDocumento`. Task 5 consome essa função e esse tipo.

- [ ] **Step 1: Adicionar o import**

No topo de `services/compras.service.ts`, adicionar à lista de imports:

```ts
import {
  criarDocumentoFiscal, uploadAnexoDocumentoFiscal, atualizarDocumentoFiscal,
  getDocumentoFiscalPorChaveAcesso,
} from './contabilidadeDocumentos.service';
```

- [ ] **Step 2: Adicionar a função `anexarXmlNaCompra`**

No final de `services/compras.service.ts`, depois de `gerarContaAPagarDaCompra`:

```ts
export interface DadosXmlParaDocumento {
  chaveAcesso: string | null;
  numeroNF: string | null;
  serie: string | null;
  ncm: string | null;
  cfop: string | null;
  valorTotal: number;
  fornecedorId: number | null;
  competenciaAno: number;
  competenciaMes: number;
}

export interface ResultadoAnexarXml {
  ok: boolean;
  aviso?: string;
}

/** Cria o documento fiscal (tipo compra, entrada) linkado a uma compra já
 *  criada e anexa o XML original. Não reverte a compra em caso de falha
 *  aqui — a compra já existe e é válida por si só; só avisa o usuário pra
 *  completar manualmente em Documentos Fiscais se algo falhar. */
export async function anexarXmlNaCompra(
  compraId: string,
  dados: DadosXmlParaDocumento,
  xmlFile: File
): Promise<ResultadoAnexarXml> {
  if (dados.chaveAcesso) {
    const existente = await getDocumentoFiscalPorChaveAcesso(dados.chaveAcesso);
    if (existente) {
      return { ok: false, aviso: `Esta nota já tinha sido importada antes (documento fiscal #${existente.id}). A compra foi criada, mas não dupliquei o documento fiscal.` };
    }
  }

  const doc = await criarDocumentoFiscal({
    tipo: 'compra', entrada: true,
    competencia_ano: dados.competenciaAno, competencia_mes: dados.competenciaMes,
    numero_documento: dados.numeroNF, serie: dados.serie, chave_acesso: dados.chaveAcesso,
    fornecedor_id: dados.fornecedorId, compra_id: compraId, nota_fiscal_id: null,
    ncm: dados.ncm, cfop: dados.cfop, cst: null,
    valor_produtos: null, valor_icms: null, valor_pis: null, valor_cofins: null, valor_ipi: null,
    valor_total: dados.valorTotal,
    motivo: null, material: null, quantidade: null,
    numero_inicial: null, numero_final: null,
    sequencia_evento: null, texto_correcao: null,
    responsavel: null, observacoes: 'Importado automaticamente via XML.',
    xml_url: null, pdf_url: null, fotos_urls: null,
    criado_por: null,
  });

  if (!doc) {
    return { ok: false, aviso: 'A compra foi criada, mas não consegui registrar o documento fiscal. Registre manualmente em Documentos Fiscais.' };
  }

  const url = await uploadAnexoDocumentoFiscal(doc.id, xmlFile, 'xml');
  if (!url) {
    return { ok: false, aviso: 'A compra e o documento fiscal foram criados, mas o upload do XML falhou. Anexe manualmente em Documentos Fiscais.' };
  }
  await atualizarDocumentoFiscal(doc.id, { xml_url: url });

  return { ok: true };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `services/compras.service.ts`.

- [ ] **Step 4: Commit**

```bash
git add services/compras.service.ts
git commit -m "feat: vincula documento fiscal + XML a uma compra recem-criada

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Modal de importação (`ImportarXmlCompraModal.tsx`)

**Files:**
- Create: `components/ui/ImportarXmlCompraModal.tsx`

**Interfaces:**
- Consumes: `parseXmlCompra`, `casarFornecedorPorCnpj`, `casarProdutoPorNome`, `XmlCompraParseado` (Task 1); `createFornecedor` (já existente em `services/fornecedores.service.ts`); `getDocumentoFiscalPorChaveAcesso` (Task 2); `Modal` e `Campo` (já existentes em `components/ui/`).
- Produces: componente `ImportarXmlCompraModal` e o tipo `DadosImportadosXml`. Task 5 consome os dois.

Nota: o dedup por chave de acesso é checado **aqui, no modal, ao ler o arquivo** — antes do usuário gastar tempo revisando/completando itens — não só no save (Task 3 mantém uma segunda checagem no save como cinto-e-suspensório, pra cobrir o caso raro de duas importações simultâneas).

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Campo } from "./Campo";
import {
  parseXmlCompra, casarFornecedorPorCnpj, casarProdutoPorNome,
  type XmlCompraParseado,
} from "@/lib/importXmlCompra";
import { createFornecedor } from "@/services/fornecedores.service";
import { getDocumentoFiscalPorChaveAcesso } from "@/services/contabilidadeDocumentos.service";

interface ProdutoOpt { id: number; nome: string; }
interface FornecedorOpt { id: number; nome: string; cnpj: string; }

export interface DadosImportadosXml {
  xmlDados: XmlCompraParseado;
  fornecedorId: number | null;
  produtoIdsPorItem: (number | null)[];
  xmlFile: File;
}

interface Props {
  produtos: ProdutoOpt[];
  fornecedores: FornecedorOpt[];
  onImportar: (dados: DadosImportadosXml) => void;
  onFornecedorCriado: (fornecedor: FornecedorOpt) => void;
  onClose: () => void;
}

export default function ImportarXmlCompraModal({ produtos, fornecedores, onImportar, onFornecedorCriado, onClose }: Props) {
  const [arquivo, setArquivo]         = useState<File | null>(null);
  const [xmlDados, setXmlDados]       = useState<XmlCompraParseado | null>(null);
  const [fornecedorId, setFornecedorId] = useState<number | null>(null);
  const [produtoIds, setProdutoIds]   = useState<(number | null)[]>([]);
  const [erro, setErro]               = useState("");
  const [lendo, setLendo]             = useState(false);
  const [criandoFornecedor, setCriandoFornecedor] = useState(false);
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false);

  async function handleFile(file: File) {
    setErro("");
    setXmlDados(null);
    setArquivo(file);
    setLendo(true);
    try {
      const texto = await file.text();
      const dados = parseXmlCompra(texto);

      if (dados.chaveAcesso) {
        const existente = await getDocumentoFiscalPorChaveAcesso(dados.chaveAcesso);
        if (existente) {
          setErro(`Esta nota já foi importada antes (documento fiscal #${existente.id}).`);
          setLendo(false);
          return;
        }
      }

      setXmlDados(dados);
      setFornecedorId(casarFornecedorPorCnpj(dados.fornecedorCnpj, fornecedores));
      setProdutoIds(dados.itens.map((item) => casarProdutoPorNome(item.descricao, produtos)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(msg);
    }
    setLendo(false);
  }

  async function handleCriarFornecedor() {
    if (!xmlDados?.fornecedorNome) return;
    setSalvandoFornecedor(true);
    const criado = await createFornecedor({
      nome: xmlDados.fornecedorNome,
      cnpj: xmlDados.fornecedorCnpj ?? "",
      tel: "", email: "", contato: "", cidade: "", uf: "", categoria: "", obs: "",
      ativo: true, ie: "", ind_ie: "9", regime_tributario: "",
    });
    setSalvandoFornecedor(false);
    if (!criado) { setErro("Não consegui cadastrar o fornecedor."); return; }
    onFornecedorCriado({ id: criado.id, nome: criado.nome, cnpj: criado.cnpj });
    setFornecedorId(criado.id);
    setCriandoFornecedor(false);
  }

  function handleConfirmar() {
    if (!xmlDados || !arquivo) return;
    onImportar({ xmlDados, fornecedorId, produtoIdsPorItem: produtoIds, xmlFile: arquivo });
  }

  const fornecedorNaoAchado = !!(xmlDados && xmlDados.fornecedorCnpj && fornecedorId === null);

  return (
    <Modal open onClose={onClose} title="Importar XML de Compra" width="620px" style={{ maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
          <Campo label="Arquivo XML da NF-e">
            <input className="fc" type="file" accept=".xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </Campo>

          {lendo && <div style={{ fontSize: "12px", color: "var(--t3)" }}>Lendo XML...</div>}
          {erro && <div className="al al-w">{erro}</div>}

          {xmlDados && (
            <>
              <div className="al al-i" style={{ fontSize: "12px" }}>
                NF {xmlDados.numeroNF ?? "—"} · Série {xmlDados.serie ?? "—"} · {xmlDados.itens.length} item(ns) · Total {xmlDados.valorTotalNota.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>

              {fornecedorNaoAchado && !criandoFornecedor && (
                <div className="al al-w" style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
                  <div>Fornecedor não cadastrado: <strong>{xmlDados.fornecedorNome}</strong> — CNPJ {xmlDados.fornecedorCnpj}</div>
                  <button type="button" className="btn bg xs" style={{ alignSelf: "flex-start" }} onClick={() => setCriandoFornecedor(true)}>
                    Cadastrar fornecedor
                  </button>
                </div>
              )}
              {criandoFornecedor && (
                <div className="al al-i" style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", flexWrap: "wrap" }}>
                  <span>Cadastrar &quot;{xmlDados.fornecedorNome}&quot; (CNPJ {xmlDados.fornecedorCnpj}) como novo fornecedor?</span>
                  <button type="button" className="btn bp xs" onClick={handleCriarFornecedor} disabled={salvandoFornecedor}>
                    {salvandoFornecedor ? "Salvando..." : "Confirmar"}
                  </button>
                  <button type="button" className="btn bg xs" onClick={() => setCriandoFornecedor(false)}>Cancelar</button>
                </div>
              )}
              {!fornecedorNaoAchado && fornecedorId !== null && (
                <Campo label="Fornecedor">
                  <select className="fc" value={fornecedorId} onChange={(e) => setFornecedorId(Number(e.target.value))}>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </Campo>
              )}

              <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Itens</div>
              {xmlDados.itens.map((item, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px", alignItems: "end", background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t1)" }}>{item.descricao}</div>
                    <div style={{ fontSize: "10px", color: "var(--t3)" }}>NCM {item.ncm ?? "—"} · CFOP {item.cfop ?? "—"} · {item.quantidade} {item.unidade} · {item.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                  </div>
                  <Campo label="Produto">
                    <select className="fc" value={produtoIds[i] ?? ""} onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setProdutoIds((prev) => prev.map((p, idx) => idx === i ? v : p));
                    }}>
                      <option value="">Selecione...</option>
                      {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </Campo>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn bp" onClick={handleConfirmar} disabled={!xmlDados}>
            Continuar
          </button>
        </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `components/ui/ImportarXmlCompraModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/ui/ImportarXmlCompraModal.tsx
git commit -m "feat: modal de revisao de importacao de XML de compra

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 5: Integração em `app/compras/page.tsx`

**Files:**
- Modify: `app/compras/page.tsx`

**Interfaces:**
- Consumes: `ImportarXmlCompraModal` + `DadosImportadosXml` (Task 4); `anexarXmlNaCompra` + `DadosXmlParaDocumento` (Task 3).

- [ ] **Step 1: Atualizar imports**

Substituir:

```ts
import {
  getCompras, createCompra, confirmarRecebimento, deletarCompra,
} from "@/services/compras.service";
```

por:

```ts
import {
  getCompras, createCompra, confirmarRecebimento, deletarCompra, anexarXmlNaCompra,
} from "@/services/compras.service";
import ImportarXmlCompraModal, { type DadosImportadosXml } from "@/components/ui/ImportarXmlCompraModal";
import type { XmlCompraParseado } from "@/lib/importXmlCompra";
```

- [ ] **Step 2: Atualizar o estado de fornecedores para incluir CNPJ**

Substituir:

```ts
  const [fornecedores, setFornecedores] = useState<{ id: number; nome: string }[]>([]);
```

por:

```ts
  const [fornecedores, setFornecedores] = useState<{ id: number; nome: string; cnpj: string }[]>([]);
```

- [ ] **Step 3: Buscar CNPJ junto na query de fornecedores**

Em `load()`, substituir:

```ts
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
```

por:

```ts
      supabase.from("fornecedores").select("id, nome, cnpj").eq("ativo", true).order("nome"),
```

- [ ] **Step 4: Adicionar estado do modal de XML e do XML pendente**

Depois de `const [processando, setProcessando] = useState<string | null>(null);`, adicionar:

```ts
  const [modalXmlAberto, setModalXmlAberto] = useState(false);
  const [xmlPendente, setXmlPendente] = useState<{ dados: XmlCompraParseado; xmlFile: File } | null>(null);
```

- [ ] **Step 5: Adicionar o handler que pré-preenche o formulário a partir do XML**

Depois da função `resetForm()`, adicionar:

```ts
  function handleImportarXml(dados: DadosImportadosXml) {
    setModalXmlAberto(false);
    setForm({
      fornecedor_id: dados.fornecedorId ? String(dados.fornecedorId) : "",
      nf: dados.xmlDados.numeroNF ?? "",
      dt_compra: dados.xmlDados.dataEmissao ?? hoje(),
      condicao_pgto: "",
      obs: "",
    });
    setItens(dados.xmlDados.itens.map((item, i) => {
      const produtoId = dados.produtoIdsPorItem[i];
      const produto = produtoId ? produtos.find(p => p.id === produtoId) : undefined;
      const m2PorChapa = produto?.chapa_largura_mm && produto?.chapa_altura_mm
        ? ((Number(produto.chapa_largura_mm) / 1000) * (Number(produto.chapa_altura_mm) / 1000)).toFixed(4)
        : "";
      return {
        produto_id: produtoId ? String(produtoId) : "",
        colares: "",
        chapas: "",
        m2_por_chapa: m2PorChapa,
        custo_unitario_m2: item.unidade.toUpperCase() === "M2" ? item.valorUnitario : 0,
      };
    }));
    setXmlPendente({ dados: dados.xmlDados, xmlFile: dados.xmlFile });
    setShowForm(true);
  }

  function handleFornecedorCriado(f: { id: number; nome: string; cnpj: string }) {
    setFornecedores(prev => [...prev, f].sort((a, b) => a.nome.localeCompare(b.nome)));
  }
```

- [ ] **Step 6: Estender `resetForm` para limpar o XML pendente**

Substituir:

```ts
  function resetForm() {
    setForm(FORM_VAZIO);
    setItens([{ ...ITEM_VAZIO }]);
    setShowForm(false);
  }
```

por:

```ts
  function resetForm() {
    setForm(FORM_VAZIO);
    setItens([{ ...ITEM_VAZIO }]);
    setXmlPendente(null);
    setShowForm(false);
  }
```

- [ ] **Step 7: Estender `handleSalvar` para anexar o XML depois de criar a compra**

Substituir:

```ts
    const res = await createCompra({
      fornecedor_id: Number(form.fornecedor_id),
      nf: form.nf.trim() || null,
      dt_compra: form.dt_compra || hoje(),
      condicao_pgto: form.condicao_pgto.trim() || null,
      valor_total: parseFloat(valorTotal.toFixed(2)),
      obs: form.obs.trim() || null,
    }, itensPayload);

    setSalvando(false);
    if (!res) { toast("Erro ao salvar compra.", "err"); return; }

    resetForm();
    load();
  }
```

por:

```ts
    const res = await createCompra({
      fornecedor_id: Number(form.fornecedor_id),
      nf: form.nf.trim() || null,
      dt_compra: form.dt_compra || hoje(),
      condicao_pgto: form.condicao_pgto.trim() || null,
      valor_total: parseFloat(valorTotal.toFixed(2)),
      obs: form.obs.trim() || null,
    }, itensPayload);

    if (!res) { setSalvando(false); toast("Erro ao salvar compra.", "err"); return; }

    if (xmlPendente) {
      const dt = form.dt_compra || hoje();
      const primeiroItem = xmlPendente.dados.itens[0];
      const anexo = await anexarXmlNaCompra(res.id, {
        chaveAcesso: xmlPendente.dados.chaveAcesso,
        numeroNF: xmlPendente.dados.numeroNF,
        serie: xmlPendente.dados.serie,
        ncm: primeiroItem?.ncm ?? null,
        cfop: primeiroItem?.cfop ?? null,
        valorTotal: xmlPendente.dados.valorTotalNota,
        fornecedorId: Number(form.fornecedor_id),
        competenciaAno: Number(dt.slice(0, 4)),
        competenciaMes: Number(dt.slice(5, 7)),
      }, xmlPendente.xmlFile);
      if (!anexo.ok && anexo.aviso) toast(anexo.aviso, "warn");
    }

    setSalvando(false);
    resetForm();
    load();
  }
```

- [ ] **Step 8: Adicionar o botão "Importar XML" na barra de topo**

Substituir:

```tsx
        <button className="btn bp sm" onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}>
          {showForm ? "✕ Cancelar" : "+ Nova Compra"}
        </button>
      </div>
```

por:

```tsx
        <button className="btn bg sm" onClick={() => setModalXmlAberto(true)}>
          Importar XML
        </button>
        <button className="btn bp sm" onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}>
          {showForm ? "✕ Cancelar" : "+ Nova Compra"}
        </button>
      </div>

      {modalXmlAberto && (
        <ImportarXmlCompraModal
          produtos={produtos.map(p => ({ id: p.id, nome: p.nome }))}
          fornecedores={fornecedores}
          onImportar={handleImportarXml}
          onFornecedorCriado={handleFornecedorCriado}
          onClose={() => setModalXmlAberto(false)}
        />
      )}
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `app/compras/page.tsx`.

- [ ] **Step 10: Commit**

```bash
git add app/compras/page.tsx
git commit -m "feat: importar XML de compra pre-preenche o formulario de Nova Compra

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 6: Verificação final

**Files:** nenhum (só verificação).

- [ ] **Step 1: Rodar a suíte de testes completa**

Run: `npm test`
Expected: todos os testes passam, incluindo os de `lib/importXmlCompra.test.ts`.

- [ ] **Step 2: Build completo**

Run: `npm run build`
Expected: build passa sem erros, incluindo a rota `/compras`.

- [ ] **Step 3: Checklist de validação manual (reportar ao usuário, não é algo que dá pra automatizar aqui)**

- Abrir `/compras`, clicar "Importar XML", subir um XML real de NF-e de compra de vidro.
- Conferir que fornecedor, NF, data e itens aparecem certos na tela de revisão.
- Se o fornecedor do XML não estiver cadastrado, testar o botão "Cadastrar fornecedor" inline.
- Confirmar a importação, completar chapas/colares nos itens (dado que não vem do XML) e salvar.
- Conferir em `/contabilidade/documentos` que o documento fiscal foi criado com o XML anexado e linkado à compra.
- Clicar "Confirmar Recebimento" na compra e conferir que o estoque e o Contas a Pagar foram atualizados (fluxo já existente, não deveria ter regressão).
- Tentar importar o mesmo XML de novo e confirmar que o sistema bloqueia por chave de acesso duplicada.
