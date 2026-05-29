"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidos, avancarStatusPedido, retrocederStatusPedido, deletarPedido } from "@/services/pedidos.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import type { Pedido } from "@/types";

const CHIP: Record<string, string> = {
  "Aguardando otimização":    "chip cy",
  "Em Produção – Corte":      "chip cp",
  "Em Produção – Lapidação":  "chip co",
  "Separação":                "chip cb",
  "Saiu para entrega":        "chip cb",
  "Entregue":                 "chip cg",
  "Finalizado":               "chip cg",
  "Cancelado":                "chip cr",
};

export default function PedidosPage() {
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await getPedidos();
    setPedidos(data);
    setLoading(false);
  }

  async function handleAvancar(id: string, status: Pedido["status"]) {
    const result = await avancarStatusPedido(id, status);
    if (result) { toast(`${id} → ${result.status}`); load(); }
    else toast("Erro ao avançar status", "err");
  }

  async function handleRetroceder(id: string, status: Pedido["status"]) {
    const result = await retrocederStatusPedido(id, status);
    if (result) { toast(`${id} → ${result.status}`); load(); }
    else toast("Erro ao retroceder status", "err");
  }

  async function handleDeletar(id: string) {
    if (!confirm(`Excluir pedido ${id} permanentemente?`)) return;
    const ok = await deletarPedido(id);
    if (ok) { toast(`${id} excluído`); load(); }
    else toast("Erro ao excluir pedido", "err");
  }

  const filtrados = pedidos.filter(p =>
    !filtro ||
    p.id.toLowerCase().includes(filtro.toLowerCase()) ||
    p.clientes?.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    p.status.toLowerCase().includes(filtro.toLowerCase())
  );

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
        <div className="tb-title">Pedidos</div>
        <div className="tb-search">
          <span className="tb-search-ic">⌕</span>
          <input
            placeholder="Buscar pedido ou cliente..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
          />
        </div>
        <a href="/pedidos/novo" className="btn bp sm">+ Novo Pedido</a>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando pedidos...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Retirada</th>
                  <th>m²</th>
                  <th>Valor</th>
                  <th>Recebido</th>
                  <th>Status</th>
                  <th>Ações</th>
                  <th style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhum pedido encontrado
                    </td>
                  </tr>
                )}
                {filtrados.map(p => {
                  const aberto = p.valor_total - p.valor_recebido;
                  const quitado = aberto <= 0;
                  const finalizado = ["Entregue","Finalizado","Cancelado"].includes(p.status);
                  const primeiro = p.status === "Aguardando otimização";

                  return (
                    <tr key={p.id}>
                      <td><span className="mono" style={{ color: "var(--acc)" }}>{p.id}</span></td>
                      <td>
                        <strong>{p.clientes?.nome ?? "—"}</strong>
                        {p.clientes?.cidade && <div className="tdim">{p.clientes.cidade}</div>}
                      </td>
                      <td className="mono">{formatDate(p.dt_pedido)}</td>
                      <td className="mono">{formatDate(p.dt_retirada)}</td>
                      <td className="mono">{Number(p.m2_total).toFixed(2)} m²</td>
                      <td className="mono">{formatBRL(p.valor_total)}</td>
                      <td>
                        <span className="mono" style={{ color: quitado ? "var(--ok)" : "var(--warn)" }}>
                          {formatBRL(p.valor_recebido)}
                        </span>
                        {!quitado && (
                          <div className="tdim" style={{ color: "var(--err)" }}>
                            − {formatBRL(aberto)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={CHIP[p.status] ?? "chip cgr"}>{p.status}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                          {/* Ver */}
                          <a
                            href={`/pedidos/${p.id}`}
                            title="Ver pedido"
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

                          {/* Retroceder */}
                          {btnAcao(
                            "var(--warn)", "rgba(245,158,11,.15)",
                            primeiro ? "Já está no início do fluxo" : "Retroceder etapa",
                            "←",
                            () => !primeiro && handleRetroceder(p.id, p.status)
                          )}

                          {/* Avançar */}
                          {btnAcao(
                            "var(--ok)", "rgba(16,185,129,.15)",
                            finalizado ? "Pedido finalizado" : "Avançar etapa",
                            "→",
                            () => !finalizado && handleAvancar(p.id, p.status)
                          )}
                        </div>
                      </td>

                      {/* Lixeira */}
                      <td style={{ width: "40px", textAlign: "center" }}>
                        <button
                          title="Excluir pedido"
                          onClick={() => handleDeletar(p.id)}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtrados.length > 0 && (
          <div className="totbar">
            <div className="ti">
              <div className="tl">Total Pedidos</div>
              <div className="tv">{filtrados.length}</div>
            </div>
            <div className="ti">
              <div className="tl">Valor Total</div>
              <div className="tv" style={{ color: "var(--acc)" }}>
                {formatBRL(filtrados.reduce((a, p) => a + Number(p.valor_total), 0))}
              </div>
            </div>
            <div className="ti">
              <div className="tl">Recebido</div>
              <div className="tv" style={{ color: "var(--ok)" }}>
                {formatBRL(filtrados.reduce((a, p) => a + Number(p.valor_recebido), 0))}
              </div>
            </div>
            <div className="ti">
              <div className="tl">A Receber</div>
              <div className="tv" style={{ color: "var(--warn)" }}>
                {formatBRL(filtrados.reduce((a, p) => a + Number(p.valor_total) - Number(p.valor_recebido), 0))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}