"use client";

import { useState } from "react";

interface DatePromptModalProps {
  titulo: string;
  valorInicial?: string;
  onConfirmar: (data: string) => void;
  onFechar: () => void;
}

/** Modal simples pra capturar uma data — substitui prompt() nativo, que
 *  não valida formato e quebra a identidade visual do produto. */
export default function DatePromptModal({ titulo, valorInicial, onConfirmar, onFechar }: DatePromptModalProps) {
  const [data, setData] = useState(valorInicial ?? new Date().toISOString().split("T")[0]);

  return (
    <div className="mov open" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="mod" style={{ width: "360px" }}>
        <div className="mhd">
          <div className="mtit">{titulo}</div>
          <button className="mcl" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (data) onConfirmar(data); }} style={{ padding: "20px" }}>
          <div className="fg" style={{ margin: 0 }}>
            <label className="fl">Data</label>
            <input className="fc" type="date" value={data} onChange={(e) => setData(e.target.value)} autoFocus required />
          </div>
        </form>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
          <button type="button" className="btn bg" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn bp" onClick={() => data && onConfirmar(data)} disabled={!data}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
