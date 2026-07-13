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
