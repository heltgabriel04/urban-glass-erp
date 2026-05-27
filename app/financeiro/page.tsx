"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFinanceiroClientes } from "@/services/financeiro.service";
import { getPedidos, registrarRecebimento } from "@/services/pedidos.service";
import { formatBRL, formatPercent, formatDate, diffDias, labelDiff } from "@/lib/formatters";
import type { FinanceiroCliente, Pedido } from "@/types";

export default function FinanceiroPage() {
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [clienteSel, setClienteSel] = useState<FinanceiroCliente | null>(null);
  const [pedidoSel, setPedidoSel] = useState<Pedido | null>(null);
  const [valorRec, setValorRec] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, peds] = await Promise.all([
      getFinanceiroClientes(),
      getPedidos(),
    ]);
    setFinanceiro(fin);
    setPedidos(peds);
    setLoading(false);
  }

  function abrirReceber(f: FinanceiroCliente) {
    setClienteSel(f);
    setPedidoSel(null);
    setValorRec("");
    setErro("");
    setModal(true);
  }

  function selecionarPedido(pedidoId: string) {
    const p = pedidos.find(p => p.id === pedidoId) ?? null;
    setPedidoSel(p);
    setValorRec("");
    setErro("");
  }

  function handleValor(v: string) {
    setValorRec(v);
    setErro("");
    if (!pedidoSel) return;
    const val = parseFloat(v);
    const saldo = Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido);
    if (val > saldo) setErro(`Valor máximo: ${formatBRL(saldo)}`);
  }

  function preencherTotal() {
    if (!pedidoSel) return;
    const saldo = Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido);
    setValorRec(saldo.toFixed(2));
    setErro("");
  }

  async function salvarRecebimento() {
    if (!pedidoSel) { setErro("Selecione um pedido."); return; }
    const val = parseFloat(valorRec);
    if (!val || val <= 0) { setErro("Informe um valor válido."); return; }
    const saldo = Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido);
    if (val > saldo) { setErro(`Valor máximo: ${formatBRL(saldo)}`); return; }

    setSalvando(true);
    await registrarRecebimento(pedidoSel.id, val);
    setSalvando(false);
    setModal(false);
    load();
  }

  const tot = financeiro.reduce(
    (a, f) => ({ fat: a.fat + Number(f.faturado), rec: a.rec + Number(f.recebido) }),
    { fat: 0, rec: 0 }
  );
  const aReceber = tot.fat - tot.rec;

  const vencimentos = pedidos
    .filter(p => Number(p.valor_total) - Number(p.valor_recebido) > 0 && p.dt_retirada)
    .sort((a, b) => (a.dt_retirada! > b.dt_retirada! ? 1 : -1))
    .slice(0, 5);

  const inad = financeiro.filter(f => Number(f.recebido) === 0 && Number(f.faturado) > 0);

  // Pedidos em aberto do cliente selecionado
  const pedidosCliente = clienteSel
    ? pedidos.filter(p =>
        p.cliente_id === clienteSel.cliente_id &&
        Number(p.valor_total) - Number(p.valor_recebido) > 0
      ).sort((a, b) => (a.dt_retirada ?? "") > (b.dt_retirada ?? "") ? 1 : -1)
    : [];

  const saldoPedido = pedidoSel
    ? Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido)
    : 0;

  const valorNum = parseFloat(valorRec) || 0;
  const pctPreenchido = saldoPedido > 0 ? Math.min(100, (valorNum / saldoPedido) * 100) : 0;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Contas a Receber</div>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando financeiro...</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="g4 mb14">
              <div className="kpi">
                <div className="kpi-l">Total Faturado</div>
                <div className="kpi-v" style={{ color: "var(--acc)" }}>{formatBRL(tot.fat)}</div>
                <div className="kpi-s up">Acumulado 2026</div>
                <div className="kpi-bar" style={{ width: "100%", background: "var(--acc)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Recebido</div>
                <div className="kpi-v" style={{ color: "var(--ok)" }}>{formatBRL(tot.rec)}</div>
                <div className="kpi-s up">{formatPercent(tot.fat > 0 ? tot.rec / tot.fat * 100 : 0)} do faturado</div>
                <div className="kpi-bar" style={{ width: `${tot.fat > 0 ? tot.rec / tot.fat * 100 : 0}%`, background: "var(--ok)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">A Receber</div>
                <div className="kpi-v" style={{ color: "var(--warn)" }}>{formatBRL(aReceber)}</div>
                <div className="kpi-s wa">⚠ Atenção urgente</div>
                <div className="kpi-bar" style={{ width: `${tot.fat > 0 ? aReceber / tot.fat * 100 : 0}%`, background: "var(--warn)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Ticket Médio</div>
                <div className="kpi-v">{formatBRL(tot.fat / (pedidos.length || 1))}</div>
                <div className="kpi-s">{pedidos.length} pedidos</div>
                <div className="kpi-bar" style={{ width: "60%", background: "var(--acc2)" }} />
              </div>
            </div>

            <div className="g2 mb14">
              {/* Inadimplência */}
              <div className="card">
                <div className="ct">Inadimplência Total</div>
                {inad.length === 0 ? (
                  <div style={{ color: "var(--ok)", fontSize: "12px", padding: "10px 0" }}>
                    ✓ Nenhum inadimplente total
                  </div>
                ) : (
                  inad.map(f => (
                    <div key={f.cliente_id} className="sr">
                      <div className="sl">
                        {f.cliente_nome}
                        <small style={{ color: "var(--err)" }}>Sem pagamento registrado</small>
                      </div>
                      <div className="sv" style={{ color: "var(--err)" }}>{formatBRL(f.faturado)}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Vencimentos próximos */}
              <div className="card">
                <div className="ct">Vencimentos Próximos</div>
                {vencimentos.map(p => {
                  const diff = diffDias(p.dt_retirada);
                  const cor = diff === null ? "var(--t3)" : diff < 0 ? "var(--err)" : diff < 7 ? "var(--warn)" : "var(--t3)";
                  return (
                    <div key={p.id} className="sr">
                      <div className="sl">
                        {p.clientes?.nome ?? "—"} · {p.id}
                        <small style={{ color: cor }}>{diff !== null ? labelDiff(diff) : "—"}</small>
                      </div>
                      <div className="sv" style={{ color: diff !== null && diff < 0 ? "var(--err)" : "var(--warn)" }}>
                        {formatBRL(Number(p.valor_total) - Number(p.valor_recebido))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabela por cliente */}
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Pedidos</th>
                    <th>Faturado</th>
                    <th>Recebido</th>
                    <th>A Receber</th>
                    <th>% Rec.</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {[...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)).map(f => {
                    const ab = Number(f.a_receber);
                    const pct = Number(f.pct_recebido);
                    const st = ab <= 0
                      ? <span className="chip cg">✓ Quitado</span>
                      : pct > 0
                        ? <span className="chip cy">Parcial</span>
                        : <span className="chip cr">Aberto</span>;
                    return (
                      <tr key={f.cliente_id}>
                        <td><strong>{f.cliente_nome}</strong></td>
                        <td className="mono">{f.total_pedidos}</td>
                        <td className="mono">{formatBRL(f.faturado)}</td>
                        <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(f.recebido)}</td>
                        <td className="mono" style={{ color: ab > 0 ? "var(--warn)" : "var(--t2)" }}>{formatBRL(ab)}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div className="prg" style={{ width: "55px", height: "5px" }}>
                              <div className="prg-f" style={{
                                width: `${pct}%`,
                                background: pct < 50 ? "var(--err)" : pct < 100 ? "var(--warn)" : "var(--ok)"
                              }} />
                            </div>
                            <span className="mono">{formatPercent(pct)}</span>
                          </div>
                        </td>
                        <td>{st}</td>
                        <td>
                          {ab > 0 && (
                            <button className="btn bp xs" onClick={() => abrirReceber(f)}>
                              ✓ Receber
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Modal recebimento ── */}
      {modal && clienteSel && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="mod" style={{ width: "480px" }}>

            {/* Header */}
            <div className="mhd">
              <div className="mtit">Registrar Recebimento</div>
              <button className="mcl" onClick={() => setModal(false)}>✕</button>
            </div>

            {/* Info cliente */}
            <div className="al al-i" style={{ marginBottom: "16px" }}>
              <div>
                <strong>{clienteSel.cliente_nome}</strong>
                <div style={{ fontSize: "12px", marginTop: "2px" }}>
                  Total em aberto: <strong>{formatBRL(clienteSel.a_receber)}</strong>
                  {" · "}{pedidosCliente.length} pedido(s)
                </div>
              </div>
            </div>

            {/* Seleção de pedido */}
            <div className="fg" style={{ marginBottom: "14px" }}>
              <label className="fl">Pedido *</label>
              <select
                className="fc"
                value={pedidoSel?.id ?? ""}
                onChange={e => selecionarPedido(e.target.value)}
              >
                <option value="">Selecione um pedido...</option>
                {pedidosCliente.map(p => {
                  const saldo = Number(p.valor_total) - Number(p.valor_recebido);
                  const diff = diffDias(p.dt_retirada);
                  const venc = diff !== null && diff < 0 ? " ⚠ VENCIDO" : diff !== null && diff < 7 ? " ⚠ Vence em breve" : "";
                  return (
                    <option key={p.id} value={p.id}>
                      {p.id} — {formatBRL(saldo)} em aberto{venc}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Detalhes do pedido selecionado */}
            {pedidoSel && (
              <div style={{
                background: "var(--surf2)", border: "1px solid var(--b1)",
                borderRadius: "var(--r)", padding: "12px", marginBottom: "14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--t3)" }}>Total do pedido</span>
                  <span className="mono">{formatBRL(pedidoSel.valor_total)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--t3)" }}>Já recebido</span>
                  <span className="mono" style={{ color: "var(--ok)" }}>{formatBRL(pedidoSel.valor_recebido)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", color: "var(--t3)" }}>Saldo restante</span>
                  <span className="mono" style={{ color: "var(--warn)", fontWeight: 700 }}>{formatBRL(saldoPedido)}</span>
                </div>
                {/* Barra de progresso */}
                <div style={{ height: "4px", borderRadius: "2px", background: "var(--surf3)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "2px",
                    width: `${Math.min(100, (Number(pedidoSel.valor_recebido) / Number(pedidoSel.valor_total)) * 100)}%`,
                    background: "var(--ok)", transition: "width .3s",
                  }} />
                </div>
              </div>
            )}

            {/* Valor */}
            <div className="fg" style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label className="fl">Valor Recebido *</label>
                {pedidoSel && (
                  <button
                    className="btn bg xs"
                    onClick={preencherTotal}
                    style={{ fontSize: "10px", padding: "2px 8px" }}
                  >
                    Preencher total
                  </button>
                )}
              </div>
              <input
                className="fc"
                type="number"
                placeholder="0,00"
                value={valorRec}
                onChange={e => handleValor(e.target.value)}
                disabled={!pedidoSel}
                autoFocus={!!pedidoSel}
              />
            </div>

            {/* Preview da barra após recebimento */}
            {pedidoSel && valorNum > 0 && !erro && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ height: "4px", borderRadius: "2px", background: "var(--surf3)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "2px",
                    width: `${Math.min(100, ((Number(pedidoSel.valor_recebido) + valorNum) / Number(pedidoSel.valor_total)) * 100)}%`,
                    background: pctPreenchido >= 100 ? "var(--ok)" : "var(--acc)",
                    transition: "width .2s",
                  }} />
                </div>
                <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px", textAlign: "right" }}>
                  {pctPreenchido >= 100 ? "✓ Pedido quitado" : `${((Number(pedidoSel.valor_recebido) + valorNum) / Number(pedidoSel.valor_total) * 100).toFixed(0)}% pago após este recebimento`}
                </div>
              </div>
            )}

            {/* Erro */}
            {erro && (
              <div className="al al-e" style={{ marginBottom: "12px" }}>
                {erro}
              </div>
            )}

            {/* Ações */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
              <button
                className="btn bp"
                onClick={salvarRecebimento}
                disabled={salvando || !valorRec || !pedidoSel || !!erro}
              >
                {salvando ? "Salvando..." : "✓ Confirmar Recebimento"}
              </button>
            </div>

          </div>
        </div>
      )}
    </AppLayout>
  );
}