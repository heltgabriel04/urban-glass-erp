"use client";

import { useState } from "react";
import { lerPlanilhaRetalhos, type RetalhoImportado } from "@/lib/importPlanilhaRetalhos";

interface Props {
  onImportar: (itens: RetalhoImportado[]) => void;
  onClose: () => void;
  importando?: boolean;
}

export default function ImportarRetalhosModal({ onImportar, onClose, importando }: Props) {
  const [itens, setItens]             = useState<RetalhoImportado[] | null>(null);
  const [erro, setErro]               = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [lendo, setLendo]             = useState(false);

  async function handleFile(file: File) {
    setErro("");
    setItens(null);
    setNomeArquivo(file.name);
    setLendo(true);
    try {
      const lidos = await lerPlanilhaRetalhos(file);
      if (lidos.length === 0) {
        setErro("Nenhum retalho válido encontrado. Confirme que a planilha tem cabeçalho com colunas de Produto/Material, Largura/Dimensões e Altura (mm).");
      } else {
        setItens(lidos);
      }
    } catch {
      setErro("Não foi possível ler o arquivo. Confirme que é uma planilha .xlsx, .xls ou .csv válida.");
    }
    setLendo(false);
  }

  const totalQtd    = itens?.reduce((a, i) => a + i.quantidade, 0) ?? 0;
  const boxesUsed   = Array.from(new Set((itens ?? []).map(i => i.box).filter(Boolean))) as string[];
  const deCliente   = (itens ?? []).filter(i => i.observacao).reduce((a, i) => a + i.quantidade, 0);

  return (
    <div className="mov open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mod" style={{ width: "560px" }}>
        <div className="mhd">
          <div className="mtit">Importar Planilha de Retalhos</div>
          <button className="mcl" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="fg" style={{ marginBottom: "12px" }}>
          <label className="fl">Arquivo (.xlsx, .xls ou .csv)</label>
          <input
            className="fc"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>
            Colunas obrigatórias: <strong>Produto/Material</strong>, <strong>Largura/Dimensões</strong> e <strong>Altura</strong> (mm).
            Opcionais: <strong>Espessura</strong> (ou extraída do nome), <strong>Box/Local</strong>, <strong>Localização</strong>, <strong>Observação/Cliente</strong>, <strong>Chapa Origem</strong> e <strong>Quantidade</strong>.
          </div>
        </div>

        {lendo && <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "12px" }}>Lendo planilha...</div>}

        {erro && <div className="al al-w" style={{ marginBottom: "12px" }}>{erro}</div>}

        {itens && (
          <>
            <div className="al al-i" style={{ marginBottom: "12px" }}>
              {itens.length} linha(s) · {totalQtd} retalho(s)
              {boxesUsed.length > 0 && <> · {boxesUsed.length} box(es): {boxesUsed.join(", ")}</>}
              {deCliente > 0 && <> · <span style={{ color: "var(--warn)", fontWeight: 700 }}>{deCliente} de cliente</span></>}
            </div>

            {/* Preview com amostra */}
            <div style={{ maxHeight: "220px", overflowY: "auto", marginBottom: "16px", borderRadius: "6px", border: "1px solid var(--b1)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: "var(--surf2)" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--t3)", fontWeight: 600 }}>Produto</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--t3)", fontWeight: 600 }}>L × A</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--t3)", fontWeight: 600 }}>Espessura</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--t3)", fontWeight: 600 }}>Quantidade</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--t3)", fontWeight: 600 }}>Box</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--t3)", fontWeight: 600 }}>Observação / Cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.slice(0, 50).map((item, i) => (
                    <tr
                      key={i}
                      style={{
                        borderTop: "1px solid var(--b1)",
                        background: item.observacao ? "rgba(245,158,11,.07)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "5px 8px", color: "var(--t1)" }}>{item.produto_nome}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: "var(--t2)" }}>
                        {item.largura} × {item.altura}
                      </td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: "var(--t3)" }}>
                        {item.espessura ? `${item.espessura}mm` : "—"}
                      </td>
                      <td style={{ padding: "5px 8px", textAlign: "center", fontFamily: "monospace" }}>{item.quantidade}</td>
                      <td style={{ padding: "5px 8px", color: "var(--t2)" }}>{item.box || "—"}</td>
                      <td style={{ padding: "5px 8px" }}>
                        {item.observacao
                          ? <span style={{ background: "rgba(245,158,11,.2)", color: "var(--warn)", padding: "1px 6px", borderRadius: "4px", fontWeight: 600, fontSize: "10px" }}>
                              {item.observacao}
                            </span>
                          : <span style={{ color: "var(--t3)" }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                  {itens.length > 50 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "6px 8px", color: "var(--t3)", textAlign: "center", fontSize: "10px" }}>
                        + {itens.length - 50} linhas adicionais não exibidas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button className="btn bg sm" onClick={onClose} disabled={importando}>Cancelar</button>
          <button
            className="btn bp sm"
            disabled={!itens || itens.length === 0 || importando}
            onClick={() => { if (itens) onImportar(itens); }}
          >
            {importando ? "Importando..." : `Importar${itens ? ` (${totalQtd})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
