"use client";

import { useState } from "react";
import type { ItemPdfImportado } from "@/lib/importPdfOrcamento";
import { parsePdfOrcamentoText } from "@/lib/importPdfOrcamento";
import { Modal } from "./Modal";

interface ProdutoOpt {
  id: number;
  nome: string;
}

interface Props {
  produtos: ProdutoOpt[];
  onImportar: (itens: ItemPdfImportado[], produtoOverride: number | null) => void;
  onClose: () => void;
}

async function lerTextoPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  // Dynamic import — só carrega pdfjs-dist quando o usuário abre o modal
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const doc = await pdfjs.getDocument({ data }).promise;
  let text = "";

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | undefined;
    for (const raw of content.items) {
      const item = raw as { str: string; transform: number[] };
      if (lastY !== item.transform[5]) {
        lines.push("");
        lastY = item.transform[5];
      }
      lines[lines.length - 1] += item.str;
    }
    text += lines.join("\n") + "\n";
  }

  return text;
}

export default function ImportarPdfModal({ produtos, onImportar, onClose }: Props) {
  const [itens, setItens]             = useState<ItemPdfImportado[] | null>(null);
  const [produtoOverride, setProduto] = useState<number | null>(null);
  const [erro, setErro]               = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [lendo, setLendo]             = useState(false);

  async function handleFile(file: File) {
    setErro("");
    setItens(null);
    setNomeArquivo(file.name);
    setLendo(true);

    try {
      const text = await lerTextoPdf(file);
      const lidos = parsePdfOrcamentoText(text);

      if (lidos.length === 0) {
        setErro("Nenhum item com dimensões foi encontrado no PDF. Verifique se é um pedido/orçamento exportado por este sistema.");
      } else {
        setItens(lidos);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(`Não foi possível ler o PDF: ${msg}`);
    }
    setLendo(false);
  }

  const totalQtd = itens?.reduce((a, i) => a + i.quantidade, 0) ?? 0;
  const produtosUnicos = itens
    ? [...new Set(itens.map(i => i.produto_nome).filter(Boolean))]
    : [];

  return (
    <Modal open onClose={onClose} title="Importar PDF de Pedido/Orçamento" width="640px">
        <div className="fg" style={{ marginBottom: "12px" }}>
          <label className="fl">Arquivo PDF</label>
          <input
            className="fc"
            type="file"
            accept=".pdf,application/pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>
            Selecione um pedido ou orçamento exportado por este sistema. Serão importados automaticamente: <strong>produto, dimensões, quantidade e R$/m²</strong>.
          </div>
        </div>

        {lendo && (
          <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "12px" }}>
            Processando PDF...
          </div>
        )}

        {erro && <div className="al al-w" style={{ marginBottom: "12px" }}>{erro}</div>}

        {itens && (
          <>
            <div className="al al-i" style={{ marginBottom: "12px" }}>
              <strong>{itens.length}</strong> item(s) encontrado(s) em <em>{nomeArquivo}</em> · <strong>{totalQtd}</strong> peça(s) no total
            </div>

            {produtosUnicos.length > 0 && (
              <div style={{ marginBottom: "12px", fontSize: "12px", color: "var(--t2)", background: "var(--surf2)", borderRadius: "8px", padding: "8px 12px", border: "1px solid var(--b2)" }}>
                <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".05em" }}>Produto(s) detectado(s) no PDF</div>
                {produtosUnicos.map(n => (
                  <div key={n} style={{ fontFamily: "'DM Mono',monospace", fontSize: "11px" }}>{n}</div>
                ))}
              </div>
            )}

            <div className="fg" style={{ marginBottom: "16px" }}>
              <label className="fl">Substituir produto de todos os itens por (opcional)</label>
              <select className="fc" value={produtoOverride ?? ""} onChange={e => setProduto(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Manter produto detectado no PDF —</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>
                Se deixar em branco, o sistema tentará encontrar o produto pelo nome. Você poderá ajustar linha por linha depois.
              </div>
            </div>

            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--b1)", borderRadius: "8px", marginBottom: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 78px 75px 85px 72px 80px", gap: "4px", padding: "6px 10px", background: "var(--surf2)", borderBottom: "1px solid var(--b1)", position: "sticky", top: 0 }}>
                {["#", "Produto", "Largura", "Altura", "Quantidade", "R$/m²", "Total"].map(h => (
                  <div key={h} style={{ fontSize: "9px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono',monospace" }}>{h}</div>
                ))}
              </div>
              {itens.map((item, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr 78px 75px 85px 72px 80px", gap: "4px", padding: "5px 10px", borderBottom: i < itens.length - 1 ? "1px solid var(--b1)" : "none", alignItems: "center" }}>
                  <div style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{i + 1}</div>
                  <div style={{ fontSize: "11px", color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.produto_nome || "—"}>{item.produto_nome || "—"}</div>
                  <div style={{ fontSize: "11px", fontFamily: "'DM Mono',monospace", color: "var(--t1)" }}>{item.largura}</div>
                  <div style={{ fontSize: "11px", fontFamily: "'DM Mono',monospace", color: "var(--t1)" }}>{item.altura}</div>
                  <div style={{ fontSize: "11px", fontFamily: "'DM Mono',monospace", color: "var(--t3)" }}>{item.quantidade}</div>
                  <div style={{ fontSize: "11px", fontFamily: "'DM Mono',monospace", color: "var(--acc)" }}>
                    {item.valor_m2 > 0 ? `R$ ${item.valor_m2.toFixed(2).replace(".", ",")}` : "—"}
                  </div>
                  <div style={{ fontSize: "11px", fontFamily: "'DM Mono',monospace", color: "var(--t1)" }}>
                    {item.total_pdf > 0 ? `R$ ${item.total_pdf.toFixed(2).replace(".", ",")}` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button className="btn bg sm" onClick={onClose}>Cancelar</button>
          <button
            className="btn bp sm"
            disabled={!itens || itens.length === 0}
            onClick={() => { if (itens) onImportar(itens, produtoOverride); }}
          >
            Importar{itens ? ` (${itens.length} itens)` : ""}
          </button>
        </div>
    </Modal>
  );
}
