"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getOrcamentos, updateOrcamento, aprovarOrcamento, rejeitarOrcamento, deletarOrcamento } from "@/services/orcamentos.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";

const CHIP: Record<string, string> = {
  "Rascunho":  "chip cgr",
  "Enviado":   "chip cy",
  "Aprovado":  "chip cg",
  "Rejeitado": "chip cr",
};

const FILTROS = ["Todos", "Rascunho", "Enviado", "Aprovado", "Rejeitado"];

export default function OrcamentosPage() {
  const { toast } = useToast();
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busca, setBusca]           = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [hoverId, setHoverId]       = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await getOrcamentos();
    setOrcamentos(data);
    setLoading(false);
  }

  async function handleStatus(id: string, status: "Enviado" | "Aprovado" | "Rejeitado") {
    if (status === "Aprovado") {
      const result = await aprovarOrcamento(id);
      if (result) { toast(`Orçamento ${id} aprovado — pedido gerado`); load(); }
      else toast("Erro ao aprovar orçamento", "err");
    } else if (status === "Rejeitado") {
      const result = await rejeitarOrcamento(id);
      if (result) { toast(`Orçamento ${id} rejeitado`); load(); }
      else toast("Erro ao rejeitar orçamento", "err");
    } else {
      const result = await updateOrcamento(id, { status } as any);
      if (result) { toast(`Orçamento ${id} marcado como ${status}`); load(); }
      else toast("Erro ao atualizar status", "err");
    }
  }

  async function handleDeletar(id: string) {
    if (!confirm(`Excluir ${id} permanentemente? O pedido vinculado também será removido.`)) return;
    const ok = await deletarOrcamento(id);
    if (ok) { toast(`${id} excluído`); load(); }
    else toast("Erro ao excluir orçamento", "err");
  }

  const filtrados = orcamentos.filter(o => {
    const matchBusca = !busca ||
      o.id.toLowerCase().includes(busca.toLowerCase()) ||
      o.clientes?.nome?.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "Todos" || o.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  const btnAcao = (
    cor: string,
    bg: string,
    bgHover: string,
    titulo: string,
    icone: string,
    onClick: () => void
  ) => (
    <button
      title={titulo}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        background: bg,
        border: `1px solid ${cor}`,
        color: cor,
        fontSize: "13px",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = bgHover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = bg; }}
    >
      {icone}
    </button>
  );

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Orçamentos</div>
        <div className="tb-search">
          <span className="tb-search-ic">⌕</span>
          <input
            placeholder="Buscar orçamento ou cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <a href="/orcamentos/novo" className="btn bp sm">+ Novo Orçamento</a>
      </div>

      <div className="con">
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
          {FILTROS.map(f => (
            <button
              key={f}
              onClick={() => setFiltroStatus(f)}
              style={{
                padding: "5px 14px",
                borderRadius: "99px",
                border: "1px solid",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
                fontWeight: filtroStatus === f ? 700 : 400,
                background: filtroStatus === f
                  ? f === "Aprovado"  ? "rgba(16,185,129,.15)"
                  : f === "Rejeitado" ? "rgba(244,63,94,.15)"
                  : f === "Enviado"   ? "rgba(245,158,11,.15)"
                  : "var(--surf2)"
                  : "transparent",
                borderColor: filtroStatus === f
                  ? f === "Aprovado"  ? "var(--ok)"
                  : f === "Rejeitado" ? "var(--err)"
                  : f === "Enviado"   ? "var(--warn)"
                  : "var(--b2)"
                  : "var(--b1)",
                color: filtroStatus === f
                  ? f === "Aprovado"  ? "var(--ok)"
                  : f === "Rejeitado" ? "var(--err)"
                  : f === "Enviado"   ? "var(--warn)"
                  : "var(--t1)"
                  : "var(--t2)",
                transition: "all 0.15s",
              }}
            >
              {f}
              {f !== "Todos" && (
                <span style={{ marginLeft: "6px", opacity: 0.7, fontSize: "10px" }}>
                  {orcamentos.filter(o => o.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando orçamentos...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Orçamento</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Validade</th>
                  <th>m²</th>
                  <th>Valor Total</th>
                  <th>Status</th>
                  <th>Pedido</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhum orçamento encontrado
                    </td>
                  </tr>
                )}
                {filtrados.map(o => (
                  <tr
                    key={o.id}
                    style={{ position: "relative" }}
                    onMouseEnter={() => setHoverId(o.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <td style={{ position: "relative" }}>
                      <span className="mono" style={{ color: "var(--acc)" }}>{o.id}</span>
                      {/* Botão X flutuante */}
                      <button
                        title="Excluir orçamento"
                        onClick={() => handleDeletar(o.id)}
                        style={{
                          position: "absolute",
                          top: "50%",
                          right: "-8px",
                          transform: "translateY(-50%)",
                          display: hoverId === o.id ? "inline-flex" : "none",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "18px",
                          height: "18px",
                          borderRadius: "50%",
                          background: "var(--err)",
                          border: "none",
                          color: "white",
                          fontSize: "10px",
                          fontWeight: 700,
                          cursor: "pointer",
                          zIndex: 10,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </td>
                    <td>
                      <strong>{o.clientes?.nome ?? "—"}</strong>
                      {o.clientes?.cidade && <div className="tdim">{o.clientes.cidade}</div>}
                    </td>
                    <td className="mono">{formatDate(o.dt_orcamento)}</td>
                    <td className="mono">{formatDate(o.dt_validade) || "—"}</td>
                    <td className="mono">{Number(o.m2_total).toFixed(2)} m²</td>
                    <td className="mono" style={{ color: "var(--acc)", fontWeight: 600 }}>
                      {formatBRL(o.valor_total)}
                    </td>
                    <td>
                      <span className={CHIP[o.status] ?? "chip cgr"}>{o.status}</span>
                    </td>
                    <td>
                      {o.pedido_id ? (
                        <a
                          href={`/pedidos/${o.pedido_id}`}
                          className="mono"
                          style={{ color: "var(--acc2)", fontSize: "12px" }}
                        >
                          {o.pedido_id}
                        </a>
                      ) : (
                        <span style={{ color: "var(--t3)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        {/* Ver — sempre visível */}
                        <a
                          href={`/orcamentos/${o.id}`}
                          title="Ver orçamento"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "28px",
                            height: "28px",
                            borderRadius: "6px",
                            background: "var(--surf2)",
                            border: "1px solid var(--b2)",
                            color: "var(--t2)",
                            fontSize: "13px",
                            textDecoration: "none",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--acc)";
                            (e.currentTarget as HTMLAnchorElement).style.color = "var(--acc)";
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--b2)";
                            (e.currentTarget as HTMLAnchorElement).style.color = "var(--t2)";
                          }}
                        >
                          ◉
                        </a>

                        {/* Enviar — sempre visível, só ativo em Rascunho */}
                        {btnAcao(
                          o.status === "Rascunho" ? "var(--warn)" : "var(--b2)",
                          o.status === "Rascunho" ? "rgba(245,158,11,.1)" : "transparent",
                          o.status === "Rascunho" ? "rgba(245,158,11,.25)" : "transparent",
                          o.status === "Rascunho" ? "Marcar como Enviado" : "Só disponível em Rascunho",
                          "✉",
                          () => o.status === "Rascunho" && handleStatus(o.id, "Enviado")
                        )}

                        {/* Aprovar — sempre visível, ativo em Rascunho e Enviado */}
                        {btnAcao(
                          (o.status === "Rascunho" || o.status === "Enviado") ? "var(--ok)" : "var(--b2)",
                          (o.status === "Rascunho" || o.status === "Enviado") ? "rgba(16,185,129,.1)" : "transparent",
                          (o.status === "Rascunho" || o.status === "Enviado") ? "rgba(16,185,129,.25)" : "transparent",
                          (o.status === "Rascunho" || o.status === "Enviado") ? "Aprovar orçamento" : "Já processado",
                          "✓",
                          () => (o.status === "Rascunho" || o.status === "Enviado") && handleStatus(o.id, "Aprovado")
                        )}

                        {/* Rejeitar — sempre visível, ativo em Rascunho e Enviado */}
                        {btnAcao(
                          (o.status === "Rascunho" || o.status === "Enviado") ? "var(--err)" : "var(--b2)",
                          (o.status === "Rascunho" || o.status === "Enviado") ? "rgba(244,63,94,.1)" : "transparent",
                          (o.status === "Rascunho" || o.status === "Enviado") ? "rgba(244,63,94,.25)" : "transparent",
                          (o.status === "Rascunho" || o.status === "Enviado") ? "Rejeitar orçamento" : "Já processado",
                          "✕",
                          () => (o.status === "Rascunho" || o.status === "Enviado") && handleStatus(o.id, "Rejeitado")
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtrados.length > 0 && (
          <div className="totbar">
            <div className="ti">
              <div className="tl">Exibindo</div>
              <div className="tv">{filtrados.length}</div>
            </div>
            <div className="ti">
              <div className="tl">Valor Total</div>
              <div className="tv" style={{ color: "var(--acc)" }}>
                {formatBRL(filtrados.reduce((a, o) => a + Number(o.valor_total), 0))}
              </div>
            </div>
            <div className="ti">
              <div className="tl">Aprovados</div>
              <div className="tv" style={{ color: "var(--ok)" }}>
                {orcamentos.filter(o => o.status === "Aprovado").length}
              </div>
            </div>
            <div className="ti">
              <div className="tl">Pendentes</div>
              <div className="tv" style={{ color: "var(--warn)" }}>
                {orcamentos.filter(o => ["Rascunho", "Enviado"].includes(o.status)).length}
              </div>
            </div>
            <div className="ti">
              <div className="tl">Rejeitados</div>
              <div className="tv" style={{ color: "var(--err)" }}>
                {orcamentos.filter(o => o.status === "Rejeitado").length}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}