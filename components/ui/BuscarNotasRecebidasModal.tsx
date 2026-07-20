"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { buscarNotasSieg, type NotaSieg } from "@/services/siegNfe.service";
import { getDocumentoFiscalPorChaveAcesso } from "@/services/contabilidadeDocumentos.service";

interface Props {
  onRevisar: (arquivo: File) => void;
  onClose: () => void;
}

function primeiroDiaMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hoje(): string {
  return new Date().toISOString().split("T")[0];
}

export default function BuscarNotasRecebidasModal({ onRevisar, onClose }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [notas, setNotas] = useState<NotaSieg[]>([]);

  useEffect(() => { buscar(); }, []);

  async function buscar() {
    setCarregando(true);
    setErro("");
    const { notas: encontradas, erro: erroBusca } = await buscarNotasSieg({ inicio: primeiroDiaMes(), fim: hoje() });
    if (erroBusca) {
      setErro(erroBusca);
      setNotas([]);
      setCarregando(false);
      return;
    }

    // Oculta as que já foram importadas (mesma checagem por chave de
    // acesso que o upload manual já usa).
    const pendentes: NotaSieg[] = [];
    for (const nota of encontradas) {
      if (!nota.chaveAcesso) { pendentes.push(nota); continue; }
      const existente = await getDocumentoFiscalPorChaveAcesso(nota.chaveAcesso);
      if (!existente) pendentes.push(nota);
    }
    setNotas(pendentes);
    setCarregando(false);
  }

  function handleRevisar(nota: NotaSieg) {
    const nomeArquivo = (nota.numeroNF ?? nota.chaveAcesso ?? "nota") + ".xml";
    const arquivo = new File([nota.xml], nomeArquivo, { type: "application/xml" });
    onRevisar(arquivo);
  }

  return (
    <Modal open onClose={onClose} title="Buscar Notas Recebidas (SIEG)" width="560px" style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
        {carregando && <div style={{ fontSize: "12px", color: "var(--t3)" }}>Buscando notas na SIEG...</div>}
        {erro && <div className="al al-w">{erro}</div>}
        {!carregando && !erro && notas.length === 0 && (
          <div style={{ fontSize: "12px", color: "var(--t3)" }}>Nenhuma nota pendente encontrada neste mês.</div>
        )}
        {notas.map((nota) => (
          <div key={nota.chaveAcesso || nota.numeroNF} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surf2)", borderRadius: "8px", padding: "10px 12px" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t1)" }}>{nota.emitenteNome ?? "Fornecedor não identificado"}</div>
              <div style={{ fontSize: "10px", color: "var(--t3)" }}>NF {nota.numeroNF ?? "—"} · {nota.dataEmissao ?? "—"}</div>
            </div>
            <button type="button" className="btn bp xs" onClick={() => handleRevisar(nota)}>Revisar e Importar</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid var(--b1)" }}>
        <button type="button" className="btn bg" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  );
}
