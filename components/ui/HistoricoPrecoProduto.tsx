"use client";

import { useEffect, useState } from "react";
import { formatBRL, formatDate } from "@/lib/formatters";
import { getHistoricoPrecoProduto, type HistoricoPrecoItem } from "@/services/compras.service";

interface HistoricoPrecoProdutoProps {
  produtoId: number;
}

export function HistoricoPrecoProduto({ produtoId }: HistoricoPrecoProdutoProps) {
  const [itens, setItens] = useState<HistoricoPrecoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    getHistoricoPrecoProduto(produtoId).then(res => {
      if (ativo) { setItens(res); setLoading(false); }
    });
    return () => { ativo = false; };
  }, [produtoId]);

  if (loading) {
    return <div style={{ fontSize: "12px", color: "var(--t3)", padding: "6px 0" }}>Carregando histórico de preços...</div>;
  }

  if (itens.length === 0) {
    return <div style={{ fontSize: "12px", color: "var(--t3)", padding: "6px 0" }}>Nenhuma compra recebida deste produto ainda.</div>;
  }

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em", marginBottom: "6px" }}>
        HISTÓRICO DE PREÇOS
      </div>
      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Data</th><th>Fornecedor</th><th>R$/m²</th><th>Chapas</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => (
            <tr key={i}>
              <td className="mono">{formatDate(it.data)}</td>
              <td>{it.fornecedorNome}</td>
              <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(it.custoUnitarioM2)}</td>
              <td className="mono">{it.chapas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
