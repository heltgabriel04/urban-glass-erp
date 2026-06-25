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
        setErro("Nenhum retalho válido encontrado. Confirme que a planilha tem cabeçalho com colunas de Produto/Material, Largura e Altura (mm).");
      } else {
        setItens(lidos);
      }
    } catch {
      setErro("Não foi possível ler o arquivo. Confirme que é uma planilha .xlsx, .xls ou .csv válida.");
    }
    setLendo(false);
  }

  const totalQtd  = itens?.reduce((a, i) => a + i.quantidade, 0) ?? 0;
  const boxesUsed = Array.from(new Set((itens ?? []).map(i => i.box).filter(Boolean))) as string[];

  return (
    <div className="mov open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mod" style={{ width: "480px" }}>
        <div className="mhd">
          <div className="mtit">Importar Planilha de Retalhos</div>
          <button className="mcl" onClick={onClose}>✕</button>
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
            Cabeçalho esperado: <strong>Produto/Material</strong>, <strong>Largura</strong> e <strong>Altura</strong> (mm).
            Opcionais: <strong>Espessura</strong>, <strong>Box</strong>, <strong>Localização</strong>, <strong>Chapa Origem</strong> e <strong>Quantidade</strong> (padrão 1).
          </div>
        </div>

        {lendo && <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "12px" }}>Lendo planilha...</div>}

        {erro && <div className="al al-w" style={{ marginBottom: "12px" }}>{erro}</div>}

        {itens && (
          <div className="al al-i" style={{ marginBottom: "16px" }}>
            {itens.length} linha(s) encontrada(s) em {nomeArquivo} · {totalQtd} retalho(s) no total
            {boxesUsed.length > 0 && <> · {boxesUsed.length} box(es): {boxesUsed.join(", ")}</>}
          </div>
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
