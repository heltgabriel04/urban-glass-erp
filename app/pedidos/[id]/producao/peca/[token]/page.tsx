"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPecaPorToken, confirmarProximaEtapaPeca, proximaAcaoPeca } from "@/services/pecas.service";
import type { PedidoPeca } from "@/types";

const ACAO_LABEL: Record<"corte" | "lapidacao" | "separacao", string> = {
  corte: "Corte",
  lapidacao: "Lapidação",
  separacao: "Separação",
};

const STATUS_LABEL: Record<PedidoPeca["status"], string> = {
  pendente: "Aguardando corte",
  cortada: "Cortada — aguardando lapidação",
  lapidada: "Lapidada — aguardando separação",
  separada: "Separada",
};

export default function ScanPecaPage() {
  const { token } = useParams<{ token: string }>();

  const [peca, setPeca]           = useState<PedidoPeca | null>(null);
  const [loading, setLoading]     = useState(true);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando]   = useState(false);
  const [feedback, setFeedback]   = useState<{ msg: string; tipo: "ok" | "err" } | null>(null);

  useEffect(() => { load(); }, [token]);

  async function load() {
    setLoading(true);
    const p = await getPecaPorToken(token);
    setPeca(p);
    setNaoEncontrada(!p);
    setLoading(false);
  }

  function mostrarFeedback(msg: string, tipo: "ok" | "err" = "ok") {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function handleConfirmar() {
    setSalvando(true);
    setConfirmando(false);
    const result = await confirmarProximaEtapaPeca(token);
    if (result.ok) {
      mostrarFeedback(`✓ ${ACAO_LABEL[acao!]} confirmado`, "ok");
      await load();
    } else {
      mostrarFeedback(result.erro ?? "Erro ao confirmar", "err");
    }
    setSalvando(false);
  }

  if (loading) return (
    <div style={styles.root}>
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <div style={{ color: "rgba(255,255,255,.4)", fontSize: "14px", marginTop: "16px" }}>Carregando...</div>
      </div>
    </div>
  );

  if (naoEncontrada || !peca) return (
    <div style={{ ...styles.root, alignItems: "center", justifyContent: "center", textAlign: "center", gap: "12px" }}>
      <div style={{ fontSize: "28px" }}>✕</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color: "#f43f5e" }}>Peça não encontrada</div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,.35)", maxWidth: "260px" }}>
        Esta etiqueta não corresponde a nenhuma peça cadastrada.
      </div>
    </div>
  );

  const acao = proximaAcaoPeca(peca);

  return (
    <div style={styles.root}>
      {feedback && (
        <div style={{
          ...styles.toast,
          background: feedback.tipo === "ok" ? "rgba(16,185,129,.18)" : "rgba(244,63,94,.18)",
          borderColor: feedback.tipo === "ok" ? "#10b981" : "#f43f5e",
          color: feedback.tipo === "ok" ? "#10b981" : "#f43f5e",
        }}>
          {feedback.msg}
        </div>
      )}

      <div style={styles.header}>
        <div style={styles.logoMark}>UG</div>
        <div style={{ flex: 1 }}>
          <div style={styles.pedidoId}>{peca.pedido_id}</div>
          <div style={styles.clienteNome}>{peca.pedidos?.clientes?.nome ?? "—"}</div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardLabel}>PEÇA</div>
        <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "'DM Mono', monospace" }}>
          Chapa {peca.chapa_num} · #{peca.ordem + 1}
        </div>
        <div style={{ fontSize: "14px", color: "rgba(255,255,255,.5)", marginTop: "4px" }}>
          {peca.itens_pedido?.produto_nome ?? "—"}
        </div>
        <div style={{ fontSize: "16px", fontWeight: 700, color: "rgba(255,255,255,.8)", fontFamily: "'DM Mono', monospace", marginTop: "6px" }}>
          {peca.largura} × {peca.altura} mm
        </div>
        {!peca.precisa_lapidacao && (
          <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "6px" }}>Este item não precisa de lapidação</div>
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.cardLabel}>STATUS ATUAL</div>
        <div style={{ fontSize: "15px", fontWeight: 700, color: peca.status === "separada" ? "#10b981" : "#fff" }}>
          {STATUS_LABEL[peca.status]}
        </div>
      </div>

      <div style={{ padding: "16px 16px 32px" }}>
        {acao && !confirmando && (
          <button style={styles.btnAvancar} onClick={() => setConfirmando(true)} disabled={salvando}>
            {salvando ? "Salvando..." : `Confirmar ${ACAO_LABEL[acao]} →`}
          </button>
        )}

        {confirmando && acao && (
          <div style={styles.confirmBox}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "16px" }}>
              Confirmar {ACAO_LABEL[acao].toLowerCase()} desta peça?
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button style={styles.btnConfirmar} onClick={handleConfirmar}>✓ Confirmar</button>
              <button style={styles.btnCancelar} onClick={() => setConfirmando(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {!acao && (
          <div style={styles.statusFinal}>✓ Peça separada</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100dvh", background: "#0d0d14",
    display: "flex", flexDirection: "column", gap: "14px",
    paddingTop: "16px", maxWidth: "480px", margin: "0 auto",
    fontFamily: "'DM Sans', 'DM Mono', system-ui, sans-serif",
  },
  loadingWrap: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", minHeight: "100dvh",
  },
  spinner: {
    width: "36px", height: "36px", borderRadius: "50%",
    border: "3px solid rgba(255,255,255,.1)", borderTopColor: "#10b981",
    animation: "spin 0.8s linear infinite",
  },
  toast: {
    position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
    padding: "12px 20px", borderRadius: "12px", border: "1px solid",
    fontSize: "14px", fontWeight: 600, zIndex: 100,
    whiteSpace: "nowrap", backdropFilter: "blur(12px)",
  },
  header: { display: "flex", alignItems: "center", gap: "12px", padding: "0 16px" },
  logoMark: {
    width: "40px", height: "40px", borderRadius: "10px",
    background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "12px", fontWeight: 800, color: "rgba(255,255,255,.6)",
    letterSpacing: "0.05em", flexShrink: 0,
  },
  pedidoId: { fontSize: "20px", fontWeight: 800, color: "#fff", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.5px" },
  clienteNome: { fontSize: "13px", color: "rgba(255,255,255,.45)", marginTop: "1px" },
  card: {
    margin: "0 16px", padding: "16px",
    background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
    borderRadius: "14px",
  },
  cardLabel: { fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,.3)", marginBottom: "8px" },
  btnAvancar: {
    width: "100%", padding: "18px",
    background: "#10b981", border: "none", borderRadius: "14px",
    color: "#000", fontSize: "16px", fontWeight: 800, cursor: "pointer",
    fontFamily: "'DM Sans', system-ui, sans-serif", letterSpacing: "-0.3px",
  },
  confirmBox: {
    padding: "20px", background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.1)", borderRadius: "16px", textAlign: "center",
  },
  btnConfirmar: {
    flex: 1, padding: "14px", background: "#10b981", border: "none",
    borderRadius: "10px", color: "#000", fontSize: "15px", fontWeight: 800, cursor: "pointer",
  },
  btnCancelar: {
    flex: 1, padding: "14px", background: "transparent",
    border: "1px solid rgba(255,255,255,.15)", borderRadius: "10px",
    color: "rgba(255,255,255,.5)", fontSize: "15px", fontWeight: 600, cursor: "pointer",
  },
  statusFinal: {
    textAlign: "center", padding: "18px",
    background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)",
    borderRadius: "14px", color: "#10b981", fontSize: "16px", fontWeight: 700,
  },
};
