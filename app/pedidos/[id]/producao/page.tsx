"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPedidoById, getClienteNomePublico, avancarStatusPedido } from "@/services/pedidos.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import type { Pedido } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";

const FLUXO = [
  "Aguardando otimização",
  "Em Produção – Corte",
  "Em Produção – Lapidação",
  "Separação",
  "Finalizado",
  "Entregue",
];

const STATUS_COLOR: Record<string, string> = {
  "Aguardando otimização":   "#f59e0b",
  "Em Produção – Corte":     "#a855f7",
  "Em Produção – Lapidação": "#f97316",
  "Separação":               "#3b82f6",
  "Finalizado":              "#10b981",
  "Entregue":                "#10b981",
  "Cancelado":               "#f43f5e",
};

const PROXIMA: Record<string, string> = {
  "Aguardando otimização":   "Em Produção – Corte",
  "Em Produção – Corte":     "Em Produção – Lapidação",
  "Em Produção – Lapidação": "Separação",
  "Separação":               "Finalizado",
  "Finalizado":              "Entregue",
};

export default function ProducaoView() {
  const { id } = useParams<{ id: string }>();

  const [pedido, setPedido]         = useState<Pedido | null>(null);
  const [clienteNome, setClienteNome] = useState<string | null>(null);
  const [otims, setOtims]           = useState<HistoricoOtimizador[]>([]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [feedback, setFeedback]     = useState<{ msg: string; tipo: "ok" | "err" | "warn" } | null>(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [data, o] = await Promise.all([
      getPedidoById(id),
      getOtimizacoesPorPedido(id),
    ]);
    setPedido(data);
    setOtims(o);
    if (data?.cliente_id) setClienteNome(await getClienteNomePublico(data.cliente_id));
    setLoading(false);
  }

  function mostrarFeedback(msg: string, tipo: "ok" | "err" | "warn" = "ok") {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function handleAvancar() {
    if (!pedido) return;
    if (pedido.status === "Aguardando otimização" && otims.length === 0) {
      mostrarFeedback("Otimização de corte pendente. Fale com o responsável.", "warn");
      setConfirmando(false);
      return;
    }
    setSalvando(true);
    setConfirmando(false);
    const result = await avancarStatusPedido(pedido.id, pedido.status);
    if (result) {
      mostrarFeedback(`✓ Avançado para: ${result.status}`, "ok");
      await load();
    } else {
      mostrarFeedback("Erro ao avançar status", "err");
    }
    setSalvando(false);
  }

  const statusAtual       = pedido?.status ?? "";
  const corStatus         = STATUS_COLOR[statusAtual] ?? "var(--acc)";
  const proximaEtapa      = PROXIMA[statusAtual];
  const podeAvancar       = !!proximaEtapa;
  const bloqueado         = statusAtual === "Aguardando otimização" && otims.length === 0;
  const statusIdx         = FLUXO.indexOf(statusAtual);

  if (loading) return (
    <div style={styles.root}>
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <div style={{ color: "var(--t3)", fontSize: "14px", marginTop: "16px" }}>Carregando...</div>
      </div>
    </div>
  );

  if (!pedido) return (
    <div style={styles.root}>
      <div style={{ color: "#f43f5e", textAlign: "center", padding: "48px 24px", fontSize: "16px" }}>
        Pedido não encontrado.
      </div>
    </div>
  );

  if (pedido.status === "Entregue" || pedido.status === "Cancelado") return (
    <div style={{ ...styles.root, alignItems: "center", justifyContent: "center", textAlign: "center", gap: "20px" }}>
      <div style={{ width: "64px", height: "64px", borderRadius: "18px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 800, color: "rgba(255,255,255,.35)", letterSpacing: "0.05em" }}>
        UG
      </div>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,.2)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" }}>
          Urban Glass
        </div>
        <div style={{ fontSize: "28px" }}>
          {pedido.status === "Entregue" ? "✓" : "✕"}
        </div>
        <div style={{ fontSize: "18px", fontWeight: 800, color: pedido.status === "Entregue" ? "#10b981" : "#f43f5e", marginTop: "8px" }}>
          {pedido.status === "Entregue" ? "Pedido entregue" : "Pedido cancelado"}
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,.25)", marginTop: "8px", lineHeight: 1.6, maxWidth: "260px" }}>
          Este link foi desativado.<br />O pedido não está mais em produção.
        </div>
      </div>
    </div>
  );

  return (
    <div style={styles.root}>

      {/* Feedback toast */}
      {feedback && (
        <div style={{
          ...styles.toast,
          background: feedback.tipo === "ok" ? "rgba(16,185,129,.18)" : feedback.tipo === "warn" ? "rgba(245,158,11,.18)" : "rgba(244,63,94,.18)",
          borderColor: feedback.tipo === "ok" ? "#10b981" : feedback.tipo === "warn" ? "#f59e0b" : "#f43f5e",
          color: feedback.tipo === "ok" ? "#10b981" : feedback.tipo === "warn" ? "#f59e0b" : "#f43f5e",
        }}>
          {feedback.msg}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logoMark}>UG</div>
        <div style={{ flex: 1 }}>
          <div style={styles.pedidoId}>{pedido.id}</div>
          <div style={styles.clienteNome}>{clienteNome ?? "—"}</div>
        </div>
        <div style={{ ...styles.statusChip, background: corStatus + "22", borderColor: corStatus, color: corStatus }}>
          {statusAtual}
        </div>
      </div>

      {/* Progresso visual */}
      <div style={styles.progressWrap}>
        {FLUXO.map((step, i) => {
          const done    = i < statusIdx;
          const current = i === statusIdx;
          const last    = i === FLUXO.length - 1;
          return (
            <div key={step} style={{ display: "flex", alignItems: "center", flex: last ? "0 0 auto" : "1 1 0" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div style={{
                  width: current ? "28px" : "18px",
                  height: current ? "28px" : "18px",
                  borderRadius: "50%",
                  background: done ? "#10b981" : current ? corStatus : "rgba(255,255,255,.1)",
                  border: `2px solid ${done ? "#10b981" : current ? corStatus : "rgba(255,255,255,.15)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: current ? "11px" : "9px", fontWeight: 700,
                  color: done || current ? "#000" : "rgba(255,255,255,.3)",
                  flexShrink: 0, transition: "all .3s",
                }}>
                  {done ? "✓" : i + 1}
                </div>
              </div>
              {!last && (
                <div style={{
                  flex: "1 1 auto", height: "2px",
                  background: done ? "#10b981" : "rgba(255,255,255,.1)",
                  minWidth: "8px", margin: "0 2px",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Alerta bloqueio */}
      {bloqueado && (
        <div style={styles.alertaBloqueio}>
          <div style={{ fontSize: "20px" }}>⚠️</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#f59e0b" }}>Otimização pendente</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,.55)", marginTop: "4px" }}>
              Este pedido não pode avançar sem plano de corte. Fale com o responsável.
            </div>
          </div>
        </div>
      )}

      {/* Itens */}
      <div style={styles.card}>
        <div style={styles.cardLabel}>ITENS DO PEDIDO ({pedido.itens_pedido?.length ?? 0})</div>
        {!pedido.itens_pedido?.length ? (
          <div style={{ color: "rgba(255,255,255,.35)", fontSize: "13px", padding: "8px 0" }}>Nenhum item registrado.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pedido.itens_pedido.map((item, i) => (
              <div key={item.id} style={styles.itemRow}>
                <div style={styles.itemNum}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{item.produto_nome}</div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,.5)", fontFamily: "'DM Mono', monospace", marginTop: "2px" }}>
                    {item.largura} × {item.altura} mm · {item.quantidade}× · {Number(item.m2).toFixed(3)} m²
                    {item.lapidacao > 0 && <span style={{ color: "#f59e0b" }}> · Lapidado</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info resumida */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "0 16px" }}>
        <div style={styles.infoBlock}>
          <div style={styles.infoLabel}>RETIRADA</div>
          <div style={styles.infoValue}>
            {pedido.dt_retirada
              ? new Date(pedido.dt_retirada + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
              : "—"}
          </div>
        </div>
        <div style={styles.infoBlock}>
          <div style={styles.infoLabel}>m² TOTAL</div>
          <div style={styles.infoValue}>{Number(pedido.m2_total).toFixed(2)}</div>
        </div>
      </div>

      {/* Botão principal */}
      <div style={{ padding: "16px 16px 32px" }}>
        {podeAvancar && !bloqueado && !confirmando && (
          <button
            style={styles.btnAvancar}
            onClick={() => setConfirmando(true)}
            disabled={salvando}
          >
            {salvando ? "Salvando..." : `Avançar para ${proximaEtapa} →`}
          </button>
        )}

        {confirmando && (
          <div style={styles.confirmBox}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
              Confirmar avanço?
            </div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,.55)", marginBottom: "16px" }}>
              {statusAtual} → <strong style={{ color: "#fff" }}>{proximaEtapa}</strong>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button style={styles.btnConfirmar} onClick={handleAvancar}>✓ Confirmar</button>
              <button style={styles.btnCancelar} onClick={() => setConfirmando(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {!podeAvancar && (
          <div style={styles.statusFinal}>
            {statusAtual === "Entregue" ? "✓ Pedido entregue" : statusAtual === "Cancelado" ? "✕ Pedido cancelado" : statusAtual}
          </div>
        )}
      </div>

      {/* Link voltar */}
      <div style={{ textAlign: "center", paddingBottom: "24px" }}>
        <a href={`/pedidos/${pedido.id}`} style={{ fontSize: "12px", color: "rgba(255,255,255,.3)", textDecoration: "none" }}>
          Ver detalhes completos →
        </a>
      </div>
    </div>
  );
}

// ─── ESTILOS ────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100dvh",
    background: "#0d0d14",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    paddingTop: "16px",
    maxWidth: "480px",
    margin: "0 auto",
    fontFamily: "'DM Sans', 'DM Mono', system-ui, sans-serif",
  },
  loadingWrap: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", minHeight: "100dvh",
  },
  spinner: {
    width: "36px", height: "36px", borderRadius: "50%",
    border: "3px solid rgba(255,255,255,.1)",
    borderTopColor: "#10b981",
    animation: "spin 0.8s linear infinite",
  },
  toast: {
    position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
    padding: "12px 20px", borderRadius: "12px", border: "1px solid",
    fontSize: "14px", fontWeight: 600, zIndex: 100,
    whiteSpace: "nowrap", backdropFilter: "blur(12px)",
  },
  header: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "0 16px",
  },
  logoMark: {
    width: "40px", height: "40px", borderRadius: "10px",
    background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "12px", fontWeight: 800, color: "rgba(255,255,255,.6)",
    letterSpacing: "0.05em", flexShrink: 0,
  },
  pedidoId: {
    fontSize: "20px", fontWeight: 800, color: "#fff",
    fontFamily: "'DM Mono', monospace", letterSpacing: "-0.5px",
  },
  clienteNome: {
    fontSize: "13px", color: "rgba(255,255,255,.45)", marginTop: "1px",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  statusChip: {
    padding: "5px 10px", borderRadius: "8px", border: "1px solid",
    fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em",
    whiteSpace: "nowrap", flexShrink: 0,
  },
  progressWrap: {
    display: "flex", alignItems: "center",
    padding: "12px 20px",
    background: "rgba(255,255,255,.03)",
    borderTop: "1px solid rgba(255,255,255,.06)",
    borderBottom: "1px solid rgba(255,255,255,.06)",
  },
  alertaBloqueio: {
    display: "flex", gap: "12px", alignItems: "flex-start",
    margin: "0 16px", padding: "14px 16px",
    background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.3)",
    borderRadius: "12px",
  },
  card: {
    margin: "0 16px", padding: "16px",
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: "14px",
  },
  cardLabel: {
    fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
    color: "rgba(255,255,255,.3)", marginBottom: "12px",
  },
  itemRow: {
    display: "flex", alignItems: "flex-start", gap: "10px",
    padding: "10px 12px",
    background: "rgba(255,255,255,.03)",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,.06)",
  },
  itemNum: {
    width: "22px", height: "22px", borderRadius: "6px",
    background: "rgba(255,255,255,.08)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,.4)",
    flexShrink: 0, marginTop: "1px",
  },
  infoBlock: {
    padding: "12px 14px",
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.07)",
    borderRadius: "12px",
  },
  infoLabel: {
    fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
    color: "rgba(255,255,255,.3)", marginBottom: "4px",
  },
  infoValue: {
    fontSize: "20px", fontWeight: 800, color: "#fff",
    fontFamily: "'DM Mono', monospace",
  },
  btnAvancar: {
    width: "100%", padding: "18px",
    background: "#10b981", border: "none", borderRadius: "14px",
    color: "#000", fontSize: "16px", fontWeight: 800,
    cursor: "pointer", transition: "opacity .15s",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    letterSpacing: "-0.3px",
  },
  confirmBox: {
    padding: "20px", background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: "16px", textAlign: "center",
  },
  btnConfirmar: {
    flex: 1, padding: "14px",
    background: "#10b981", border: "none", borderRadius: "10px",
    color: "#000", fontSize: "15px", fontWeight: 800, cursor: "pointer",
  },
  btnCancelar: {
    flex: 1, padding: "14px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,.15)",
    borderRadius: "10px",
    color: "rgba(255,255,255,.5)", fontSize: "15px", fontWeight: 600, cursor: "pointer",
  },
  statusFinal: {
    textAlign: "center", padding: "18px",
    background: "rgba(16,185,129,.08)",
    border: "1px solid rgba(16,185,129,.25)",
    borderRadius: "14px",
    color: "#10b981", fontSize: "16px", fontWeight: 700,
  },
};