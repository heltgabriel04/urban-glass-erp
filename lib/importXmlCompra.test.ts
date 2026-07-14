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
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <vICMS>691.56</vICMS>
            </ICMS00>
          </ICMS>
        </imposto>
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
        <imposto>
          <ICMS>
            <ICMSSN102>
              <orig>0</orig>
              <CSOSN>102</CSOSN>
            </ICMSSN102>
          </ICMS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vProd>6242.00</vProd>
          <vICMS>691.56</vICMS>
          <vIPI>0.00</vIPI>
          <vPIS>102.39</vPIS>
          <vCOFINS>473.20</vCOFINS>
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
      cst: "00",
      quantidade: 45.2,
      unidade: "M2",
      valorUnitario: 85,
      valorTotal: 3842,
    });
    expect(r.itens[1].descricao).toBe("VIDRO LAMINADO 4+4 INCOLOR");
    // Item 2 é Simples Nacional (usa CSOSN em vez de CST) — cst cai no
    // fallback pra CSOSN.
    expect(r.itens[1].cst).toBe("102");
    expect(r.valorTotalNota).toBe(6242);
    expect(r.valorProdutos).toBe(6242);
    expect(r.valorIcms).toBe(691.56);
    expect(r.valorIpi).toBe(0);
    expect(r.valorPis).toBe(102.39);
    expect(r.valorCofins).toBe(473.2);
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
