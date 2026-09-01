"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { formatBRL, formatDate } from "@/lib/formatters";
import { getLancamentosPorPedido } from "@/services/financeiro.service";
import { togglePermutaLancamento } from "@/services/lancamentos.service";
import type { Lancamento } from "@/types";

interface PermutaModalProps {
  pedidoId: string | null;
  onClose: () => void;
  /** Chamado depois de qualquer alteração, pra tela de trás atualizar o selo da linha. */
  onChange?: () => void;
}

// Marca/desmarca parcelas do pedido como "permuta" — é só uma tag de
// controle (pago em produto/serviço, não em dinheiro). Não mexe em valor,
// vencimento, status ou valor_recebido: nenhum cálculo financeiro lê essa
// flag, é puramente informativo.
export function PermutaModal({ pedidoId, onClose, onChange }: PermutaModalProps) {
  const { toast } = useToast();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvandoId, setSalvandoId] = useState<number | null>(null);

  useEffect(() => {
    if (!pedidoId) return;
    setLoading(true);
    getLancamentosPorPedido(pedidoId)
      .then(rows => setLancamentos(rows.filter(l => l.tipo === "Entrada")))
      .finally(() => setLoading(false));
  }, [pedidoId]);

  async function alternar(l: Lancamento) {
    setSalvandoId(l.id);
    const ok = await togglePermutaLancamento(l.id, !l.permuta);
    setSalvandoId(null);
    if (!ok) { toast("Erro ao salvar", "err"); return; }
    setLancamentos(prev => prev.map(x => x.id === l.id ? { ...x, permuta: !x.permuta } : x));
    onChange?.();
  }

  return (
    <Modal open={!!pedidoId} onClose={onClose} title={`Permuta — Pedido ${pedidoId ?? ""}`} width={460}>
      <div style={{ padding: "16px 20px" }}>
        <p style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "14px", lineHeight: 1.5 }}>
          Marque as parcelas pagas em permuta (produto/serviço, não em dinheiro).
          É só um controle — não altera valor recebido nem os totais de contas a receber.
        </p>

        {loading && <div className="loading">Carregando...</div>}

        {!loading && lancamentos.length === 0 && (
          <div style={{ fontSize: "12px", color: "var(--t3)", textAlign: "center", padding: "16px 0" }}>
            Nenhuma parcela a receber neste pedido.
          </div>
        )}

        {!loading && lancamentos.map(l => (
          <label
            key={l.id}
            style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "9px 4px",
              borderBottom: "1px solid var(--b2)", cursor: salvandoId ? "wait" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={!!l.permuta}
              disabled={salvandoId === l.id}
              onChange={() => alternar(l)}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "12px", fontWeight: 600 }}>{l.descricao}</div>
              <div style={{ fontSize: "10px", color: "var(--t3)" }}>
                Venc. {formatDate(l.vencimento)} · {l.status}
              </div>
            </div>
            <div className="mono" style={{ fontSize: "12px", fontWeight: 700 }}>{formatBRL(l.valor)}</div>
          </label>
        ))}
      </div>
    </Modal>
  );
}
