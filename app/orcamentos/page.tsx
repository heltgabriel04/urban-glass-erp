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

  function btnAcao(
    corHover: string,
    bgHover: string,
    titulo: string,
    icone: string,
    onClick: () => void
  ) {
    return (
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
          background: "transparent",
          border: "1px solid var(--b2)",
          color: "var(--t3)",
          fontSize: "13px",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = bgHover;
          (e.currentTarget as HTMLButtonElement).style.borderColor = corHover;
          (e.currentTarget as HTMLButtonElement).style.color = corHover;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--b2)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--t3)";
        }}
      >
        {icone}
      </button>
    );
  }

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
                  <th style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhum orçamento encontrado
                    </td>
                  </tr>
                )}
                {filtrados.map(o => (
                  <tr key={o.id}>
                    <td>
                      <span className="mono" style={{ color: "var(--acc)" }}>{o.id}</span>
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
                        <a href={`/pedidos/${o.pedido_id}`} className="mono" style={{ color: "var(--acc2)", fontSize: "12px" }}>
                          {o.pedido_id}
                        </a>
                      ) : (
                        <span style={{ color: "var(--t3)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        {/* Ver */}
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
                            background: "transparent",
                            border: "1px solid var(--b2)",
                            color: "var(--t3)",
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
                            (e.currentTarget as HTMLAnchorElement).style.color = "var(--t3)";
                          }}
                        >
                          ◉
                        </a>

                        {/* PDF — abre orçamento em nova aba para imprimir */}
                        <button
                          title="Gerar PDF"
                          onClick={() => {
                            const iframe = document.createElement("iframe");
                            iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999;background:white;";
                            iframe.src = `/orcamentos/${o.id}?print=1`;
                            document.body.appendChild(iframe);
                            setTimeout(() => { document.body.removeChild(iframe); }, 4000);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "28px",
                            padding: "0 8px",
                            borderRadius: "6px",
                            background: "transparent",
                            border: "1px solid var(--b2)",
                            color: "var(--t3)",
                            fontSize: "10px",
                            fontWeight: 700,
                            fontFamily: "'DM Mono', monospace",
                            letterSpacing: "0.5px",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,179,237,.15)";
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--acc2)";
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--acc2)";
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--b2)";
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--t3)";
                          }}
                        >
                          PDF
                        </button>

                        {btnAcao("var(--warn)", "rgba(245,158,11,.15)", "Marcar como Enviado", "✉",
                          () => handleStatus(o.id, "Enviado"))}

                        {btnAcao("var(--ok)", "rgba(16,185,129,.15)", "Aprovar orçamento", "✓",
                          () => handleStatus(o.id, "Aprovado"))}

                        {btnAcao("var(--err)", "rgba(244,63,94,.15)", "Rejeitar orçamento", "✕",
                          () => handleStatus(o.id, "Rejeitado"))}
                      </div>
                    </td>
                    <td style={{ width: "40px", textAlign: "center" }}>
                      <button
                        title="Excluir orçamento"
                        onClick={() => handleDeletar(o.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "28px",
                          height: "28px",
                          borderRadius: "6px",
                          background: "transparent",
                          border: "1px solid var(--b2)",
                          color: "var(--t3)",
                          fontSize: "13px",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(244,63,94,.15)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--err)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--err)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--b2)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--t3)";
                        }}
                      >
                        🗑
                      </button>
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