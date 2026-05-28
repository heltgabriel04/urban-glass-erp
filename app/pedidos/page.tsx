"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidos, avancarStatusPedido } from "@/services/pedidos.service";
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
    if (result) {
      toast(`${id} → ${result.status}`);
    } else {
      toast("Erro ao avançar status", "err");
    }
    load();
  }

  const filtrados = pedidos.filter(p =>
    !filtro ||
    p.id.toLowerCase().includes(filtro.toLowerCase()) ||
    p.clientes?.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    p.status.toLowerCase().includes(filtro.toLowerCase())
  );

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
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      Nenhum pedido encontrado
                    </td>
                  </tr>
                )}
                {filtrados.map(p => {
                  const aberto = p.valor_total - p.valor_recebido;
                  const quitado = aberto <= 0;
                  return (
                    <tr key={p.id}>
                      <td><span className="mono" style={{ color: "var(--acc)" }}>{p.id}</span></td>
                      <td>
                        <strong>{p.clientes?.nome ?? "—"}</strong>
                        {p.clientes?.cidade && (
                          <div className="tdim">{p.clientes.cidade}</div>
                        )}
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
                        <span className={CHIP[p.status] ?? "chip cgr"}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <a href={`/pedidos/${p.id}`} className="btn bg xs">Ver</a>
                          {!["Entregue","Finalizado","Cancelado"].includes(p.status) && (
                            <button
                              className="btn bp xs"
                              onClick={() => handleAvancar(p.id, p.status)}
                            >
                              Avançar →
                            </button>
                          )}
                        </div>
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