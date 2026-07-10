"use client";

import { useState } from "react";
import { lerPlanilhaMedidas, type MedidaImportada } from "@/lib/importPlanilhaMedidas";

interface ProdutoOpt {
  id: number;
  nome: string;
}

interface Props {
  produtos: ProdutoOpt[];
  onImportar: (itens: MedidaImportada[], produtoId: number | null) => void;
  onClose: () => void;
}

export default function ImportarMedidasModal({ produtos, onImportar, onClose }: Props) {
  const [itens, setItens]           = useState<MedidaImportada[] | null>(null);
  const [produtoId, setProdutoId]   = useState<number | null>(null);
  const [erro, setErro]             = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [lendo, setLendo]           = useState(false);

  async function handleFile(file: File) {
    setErro("");
    setItens(null);
    setNomeArquivo(file.name);
    setLendo(true);
    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      const lidos = isPdf ? await lerRelacaoVidrosPdf(file) : await lerPlanilhaMedidas(file);
      if (lidos.length === 0) {
        setErro(isPdf
          ? "Nenhuma medida encontrada nesse PDF. Confirme que é uma Relação de Vidros no formato Item/Código/Largura/Altura/Quantidade."
          : "Nenhuma medida válida encontrada. Confirme que a planilha tem colunas de largura e altura (em mm).");
      } else {
        setItens(lidos);
      }
    } catch {
      setErro("Não foi possível ler o arquivo. Confirme que é uma planilha .xlsx/.xls/.csv ou um PDF de Relação de Vidros válido.");
    }
    setLendo(false);
  }

  async function lerRelacaoVidrosPdf(file: File): Promise<MedidaImportada[]> {
    const form = new FormData();
    form.append("file", file);
    const resp = await fetch("/api/pedidos/importar-medidas-pdf", { method: "POST", body: form });
    if (!resp.ok) throw new Error("falha ao importar pdf");
    const data = await resp.json();
    return data.medidas as MedidaImportada[];
  }

  const totalQtd = itens?.reduce((a, i) => a + i.quantidade, 0) ?? 0;
  const totalComCodigo = itens?.filter(i => i.codigo).length ?? 0;

  return (
    <div className="mov open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mod" style={{ width: "440px" }}>
        <div className="mhd">
          <div className="mtit">Importar Medidas</div>
          <button className="mcl" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="fg" style={{ marginBottom: "12px" }}>
          <label className="fl">Arquivo (.xlsx, .xls, .csv ou .pdf)</label>
          <input
            className="fc"
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>
            Planilha — colunas esperadas: <strong>Largura</strong> e <strong>Altura</strong> (mm) e, opcionalmente, <strong>Quantidade</strong> (padrão 1 quando vazia) e <strong>Código</strong> (vai pra etiqueta de cada peça).
            <br />PDF — aceita o formato "Relação de Vidros" (Item · Código · Largura · Altura · Quantidade · Tipo de vidro).
          </div>
        </div>

        {lendo && <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "12px" }}>Lendo planilha...</div>}

        {erro && <div className="al al-w" style={{ marginBottom: "12px" }}>{erro}</div>}

        {itens && (
          <>
            <div className="al al-i" style={{ marginBottom: "12px" }}>
              {itens.length} medida(s) encontrada(s) em {nomeArquivo} · {totalQtd} peça(s) no total
              {totalComCodigo > 0 && ` · ${totalComCodigo} com código`}
            </div>

            <div className="fg" style={{ marginBottom: "16px" }}>
              <label className="fl">Vidro para todos os itens importados (opcional)</label>
              <select className="fc" value={produtoId ?? ""} onChange={e => setProdutoId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Deixar em branco, selecionar depois —</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button className="btn bg sm" onClick={onClose}>Cancelar</button>
          <button
            className="btn bp sm"
            disabled={!itens || itens.length === 0}
            onClick={() => { if (itens) onImportar(itens, produtoId); }}
          >
            Importar{itens ? ` (${itens.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
