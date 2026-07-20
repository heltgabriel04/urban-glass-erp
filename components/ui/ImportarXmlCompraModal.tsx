"use client";

import { useEffect, useState } from "react";
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
  // Quando informado, o modal já abre lendo este arquivo automaticamente
  // (mesmo fluxo de handleFile, sem o usuário escolher no input) — usado
  // pelo fluxo de importação via SIEG, que já tem o XML em mãos antes de
  // abrir este modal.
  arquivoInicial?: File;
}

export default function ImportarXmlCompraModal({ produtos, fornecedores, onImportar, onFornecedorCriado, onClose, arquivoInicial }: Props) {
  const [arquivo, setArquivo]         = useState<File | null>(null);
  const [xmlDados, setXmlDados]       = useState<XmlCompraParseado | null>(null);
  const [fornecedorId, setFornecedorId] = useState<number | null>(null);
  const [produtoIds, setProdutoIds]   = useState<(number | null)[]>([]);
  const [erro, setErro]               = useState("");
  const [lendo, setLendo]             = useState(false);
  const [criandoFornecedor, setCriandoFornecedor] = useState(false);
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false);

  useEffect(() => {
    if (arquivoInicial) handleFile(arquivoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <input className="fc" type="file" accept=".xml" name="arquivo_xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
                  <select name="fornecedor_id" className="fc" value={fornecedorId} onChange={(e) => setFornecedorId(Number(e.target.value))}>
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
                    <select name="produto_ids" className="fc" value={produtoIds[i] ?? ""} onChange={(e) => {
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
