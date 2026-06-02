"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFinanceiroClientes } from "@/services/financeiro.service";
import { getPedidos, registrarRecebimento } from "@/services/pedidos.service";
import { formatBRL, formatPercent, formatDate, diffDias, labelDiff } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { FinanceiroCliente, Pedido } from "@/types";

export default function FinanceiroPage() {
  const { toast } = useToast();
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [clienteSel, setClienteSel] = useState<FinanceiroCliente | null>(null);
  const [pedidoSel, setPedidoSel] = useState<Pedido | null>(null);
  const [valorRec, setValorRec] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, peds] = await Promise.all([getFinanceiroClientes(), getPedidos()]);
    setFinanceiro(fin);
    setPedidos(peds);
    setLoading(false);
  }

  function abrirReceber(f: FinanceiroCliente) {
    setClienteSel(f); setPedidoSel(null); setValorRec(0); setErro(""); setModal(true);
  }

  function selecionarPedido(pedidoId: string) {
    const p = pedidos.find(p => p.id === pedidoId) ?? null;
    setPedidoSel(p); setValorRec(0); setErro("");
  }

  function handleValor(v: number) {
    setValorRec(v); setErro("");
    if (!pedidoSel) return;
    const saldo = Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido);
    if (v > saldo) setErro(`Valor máximo: ${formatBRL(saldo)}`);
  }

  function preencherTotal() {
    if (!pedidoSel) return;
    const saldo = Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido);
    setValorRec(saldo); setErro("");
  }

  async function salvarRecebimento() {
    if (!pedidoSel) { setErro("Selecione um pedido."); return; }
    if (!valorRec || valorRec <= 0) { setErro("Informe um valor válido."); return; }
    const saldo = Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido);
    if (valorRec > saldo) { setErro(`Valor máximo: ${formatBRL(saldo)}`); return; }
    setSalvando(true);
    const result = await registrarRecebimento(pedidoSel.id, valorRec);
    setSalvando(false);
    if (!result) { toast("Erro ao registrar recebimento", "err"); return; }
    toast(valorRec >= saldo ? `✓ Pedido ${pedidoSel.id} quitado!` : `Recebimento de ${formatBRL(valorRec)} registrado — ${pedidoSel.id}`);
    setModal(false); load();
  }

  const tot = financeiro.reduce((a, f) => ({ fat: a.fat + Number(f.faturado), rec: a.rec + Number(f.recebido) }), { fat: 0, rec: 0 });
  const aReceber = tot.fat - tot.rec;
  const vencimentos = pedidos.filter(p => Number(p.valor_total) - Number(p.valor_recebido) > 0 && p.dt_retirada).sort((a, b) => (a.dt_retirada! > b.dt_retirada! ? 1 : -1)).slice(0, 5);
  const inad = financeiro.filter(f => Number(f.recebido) === 0 && Number(f.faturado) > 0);
  const pedidosCliente = clienteSel ? pedidos.filter(p => p.cliente_id === clienteSel.cliente_id && Number(p.valor_total) - Number(p.valor_recebido) > 0).sort((a, b) => (a.dt_retirada ?? "") > (b.dt_retirada ?? "") ? 1 : -1) : [];
  const saldoPedido = pedidoSel ? Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido) : 0;
  const pctPreenchido = saldoPedido > 0 ? Math.min(100, (valorRec / saldoPedido) * 100) : 0;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Contas a Receber</div>
      </div>

      <div className="con">
        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total Faturado", value: formatBRL(tot.fat),    color:"var(--acc)",  sub:"Acumulado 2026" },
            { label:"Recebido",       value: formatBRL(tot.rec),    color:"var(--ok)",   sub: formatPercent(tot.fat > 0 ? tot.rec / tot.fat * 100 : 0) + " do faturado" },
            { label:"A Receber",      value: formatBRL(aReceber),   color:"var(--warn)", sub:"⚠ Atenção urgente" },
            { label:"Ticket Médio",   value: formatBRL(tot.fat / (pedidos.length || 1)), color:"var(--acc2)", sub: pedidos.length + " pedidos" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando financeiro...</div>
        ) : (
          <>
            <div className="g2 mb14">
              <div className="card">
                <div className="ct">Inadimplência Total</div>
                {inad.length === 0 ? (
                  <div style={{ color:"var(--ok)", fontSize:"12px", padding:"10px 0" }}>✓ Nenhum inadimplente total</div>
                ) : (
                  inad.map(f => (
                    <div key={f.cliente_id} className="sr">
                      <div className="sl">{f.cliente_nome}<small style={{ color:"var(--err)" }}>Sem pagamento registrado</small></div>
                      <div className="sv" style={{ color:"var(--err)" }}>{formatBRL(f.faturado)}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="card">
                <div className="ct">Vencimentos Próximos</div>
                {vencimentos.map(p => {
                  const diff = diffDias(p.dt_retirada);
                  const cor = diff === null ? "var(--t3)" : diff < 0 ? "var(--err)" : diff < 7 ? "var(--warn)" : "var(--t3)";
                  return (
                    <div key={p.id} className="sr">
                      <div className="sl">{p.clientes?.nome ?? "—"} · {p.id}<small style={{ color:cor }}>{diff !== null ? labelDiff(diff) : "—"}</small></div>
                      <div className="sv" style={{ color: diff !== null && diff < 0 ? "var(--err)" : "var(--warn)" }}>{formatBRL(Number(p.valor_total) - Number(p.valor_recebido))}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th><th>Pedidos</th><th>Faturado</th><th>Recebido</th>
                    <th>A Receber</th><th>% Rec.</th><th>Status</th><th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {[...financeiro].sort((a, b) => Number(b.faturado) - Number(a.faturado)).map(f => {
                    const ab = Number(f.a_receber);
                    const pct = Number(f.pct_recebido);
                    const st = ab <= 0 ? <span className="chip cg">✓ Quitado</span> : pct > 0 ? <span className="chip cy">Parcial</span> : <span className="chip cr">Aberto</span>;
                    return (
                      <tr key={f.cliente_id}>
                        <td><strong>{f.cliente_nome}</strong></td>
                        <td className="mono">{f.total_pedidos}</td>
                        <td className="mono">{formatBRL(f.faturado)}</td>
                        <td className="mono" style={{ color:"var(--acc)" }}>{formatBRL(f.recebido)}</td>
                        <td className="mono" style={{ color: ab > 0 ? "var(--warn)" : "var(--t2)" }}>{formatBRL(ab)}</td>
                        <td>
                          <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                            <div className="prg" style={{ width:"55px", height:"5px" }}>
                              <div className="prg-f" style={{ width:`${pct}%`, background: pct < 50 ? "var(--err)" : pct < 100 ? "var(--warn)" : "var(--ok)" }} />
                            </div>
                            <span className="mono">{formatPercent(pct)}</span>
                          </div>
                        </td>
                        <td>{st}</td>
                        <td>{ab > 0 && <button className="btn bp xs" onClick={() => abrirReceber(f)}>✓ Receber</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modal && clienteSel && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="mod" style={{ width:"480px" }}>
            <div className="mhd">
              <div className="mtit">Registrar Recebimento</div>
              <button className="mcl" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="al al-i" style={{ marginBottom:"16px" }}>
              <div>
                <strong>{clienteSel.cliente_nome}</strong>
                <div style={{ fontSize:"12px", marginTop:"2px" }}>Total em aberto: <strong>{formatBRL(clienteSel.a_receber)}</strong> · {pedidosCliente.length} pedido(s)</div>
              </div>
            </div>
            <div className="fg" style={{ marginBottom:"14px" }}>
              <label className="fl">Pedido *</label>
              <select className="fc" value={pedidoSel?.id ?? ""} onChange={e => selecionarPedido(e.target.value)}>
                <option value="">Selecione um pedido...</option>
                {pedidosCliente.map(p => {
                  const saldo = Number(p.valor_total) - Number(p.valor_recebido);
                  const diff = diffDias(p.dt_retirada);
                  const venc = diff !== null && diff < 0 ? " ⚠ VENCIDO" : diff !== null && diff < 7 ? " ⚠ Vence em breve" : "";
                  return <option key={p.id} value={p.id}>{p.id} — {formatBRL(saldo)} em aberto{venc}</option>;
                })}
              </select>
            </div>
            {pedidoSel && (
              <div style={{ background:"var(--surf2)", border:"1px solid var(--b1)", borderRadius:"var(--r)", padding:"12px", marginBottom:"14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Total do pedido</span><span className="mono">{formatBRL(pedidoSel.valor_total)}</span></div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Já recebido</span><span className="mono" style={{ color:"var(--ok)" }}>{formatBRL(pedidoSel.valor_recebido)}</span></div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Saldo restante</span><span className="mono" style={{ color:"var(--warn)", fontWeight:700 }}>{formatBRL(saldoPedido)}</span></div>
                <div style={{ height:"4px", borderRadius:"2px", background:"var(--surf3)", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"2px", width:`${Math.min(100, (Number(pedidoSel.valor_recebido) / Number(pedidoSel.valor_total)) * 100)}%`, background:"var(--ok)", transition:"width .3s" }} />
                </div>
              </div>
            )}
            <div className="fg" style={{ marginBottom:"6px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
                <label className="fl">Valor Recebido *</label>
                {pedidoSel && <button className="btn bg xs" onClick={preencherTotal} style={{ fontSize:"10px", padding:"2px 8px" }}>Preencher total</button>}
              </div>
              <CurrencyInput
                value={valorRec}
                onChange={handleValor}
                placeholder="R$ 0,00"
                disabled={!pedidoSel}
              />
            </div>
            {pedidoSel && valorRec > 0 && !erro && (
              <div style={{ marginBottom:"14px" }}>
                <div style={{ height:"4px", borderRadius:"2px", background:"var(--surf3)", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"2px", width:`${Math.min(100, ((Number(pedidoSel.valor_recebido) + valorRec) / Number(pedidoSel.valor_total)) * 100)}%`, background: pctPreenchido >= 100 ? "var(--ok)" : "var(--acc)", transition:"width .2s" }} />
                </div>
                <div style={{ fontSize:"11px", color:"var(--t3)", marginTop:"4px", textAlign:"right" }}>
                  {pctPreenchido >= 100 ? "✓ Pedido quitado" : `${((Number(pedidoSel.valor_recebido) + valorRec) / Number(pedidoSel.valor_total) * 100).toFixed(0)}% pago após este recebimento`}
                </div>
              </div>
            )}
            {erro && <div className="al al-e" style={{ marginBottom:"12px" }}>{erro}</div>}
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarRecebimento} disabled={salvando || valorRec <= 0 || !pedidoSel || !!erro}>
                {salvando ? "Salvando..." : "✓ Confirmar Recebimento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}