"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFinanceiroClientes, getContasAPagar, criarContaPagar, pagarConta, deletarLancamento, updateLancamento } from "@/services/financeiro.service";
import { getPedidos, registrarRecebimento } from "@/services/pedidos.service";
import { formatBRL, formatPercent, formatDate, diffDias, labelDiff } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DateInput from "@/components/ui/DateInput";
import type { FinanceiroCliente, Pedido, Lancamento } from "@/types";

type Aba = "receber" | "pagar";

function hoje() { return new Date().toISOString().split("T")[0]; }

const CATEGORIAS = ["Fornecedor","Aluguel","Energia","Água","Internet","Salário","Imposto","Manutenção","Transporte","Material","Outros"];

export default function FinanceiroPage() {
  const { toast } = useToast();
  const [aba, setAba]               = useState<Aba>("receber");
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [contasPagar, setContasPagar] = useState<Lancamento[]>([]);
  const [loading, setLoading]       = useState(true);

  // Modal receber
  const [modalReceber, setModalReceber]   = useState(false);
  const [clienteSel, setClienteSel]       = useState<FinanceiroCliente | null>(null);
  const [pedidoSel, setPedidoSel]         = useState<Pedido | null>(null);
  const [valorRec, setValorRec]           = useState(0);
  const [salvando, setSalvando]           = useState(false);
  const [erro, setErro]                   = useState("");

  // Modal nova conta a pagar
  const [modalPagar, setModalPagar]       = useState(false);
  const [editandoConta, setEditandoConta] = useState<Lancamento | null>(null);
  const [formPagar, setFormPagar]         = useState({
    descricao: "", fornecedor: "", categoria: "",
    valor: 0, vencimento: "", dt_pagamento: "", status: "Pendente" as "Pendente" | "Pago",
    obs: "",
  });

  // Modal pagar conta
  const [modalConfirmarPgto, setModalConfirmarPgto] = useState(false);
  const [contaParaPagar, setContaParaPagar]           = useState<Lancamento | null>(null);
  const [dtPagamentoConfirm, setDtPagamentoConfirm]   = useState(hoje());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fin, peds, pagar] = await Promise.all([
      getFinanceiroClientes(),
      getPedidos(),
      getContasAPagar(),
    ]);
    setFinanceiro(fin);
    setPedidos(peds);
    setContasPagar(pagar);
    setLoading(false);
  }

  // ── Receber ───────────────────────────────────────────────────────────────

  function abrirReceber(f: FinanceiroCliente) {
    setClienteSel(f); setPedidoSel(null); setValorRec(0); setErro(""); setModalReceber(true);
  }

  function selecionarPedido(pedidoId: string) {
    const p = pedidos.find(p => p.id === pedidoId) ?? null;
    setPedidoSel(p); setValorRec(0); setErro("");
  }

  function handleValorRec(v: number) {
    setValorRec(v); setErro("");
  }

  function preencherTotal() {
    if (!pedidoSel) return;
    const saldo = Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido);
    setValorRec(saldo); setErro("");
  }

  async function salvarRecebimento() {
    if (!pedidoSel) { setErro("Selecione um pedido."); return; }
    if (!valorRec || valorRec <= 0) { setErro("Informe um valor válido."); return; }
    setSalvando(true);
    const result = await registrarRecebimento(pedidoSel.id, valorRec);
    setSalvando(false);
    if (!result) { toast("Erro ao registrar recebimento", "err"); return; }
    const { excedente } = result as any;
    if (excedente > 0.005) {
      toast(`✓ Pedido ${pedidoSel.id} quitado! ${formatBRL(excedente)} viraram crédito do cliente.`);
    } else {
      toast(`✓ Recebimento de ${formatBRL(valorRec)} registrado`);
    }
    setModalReceber(false); load();
  }

  // ── Contas a pagar ────────────────────────────────────────────────────────

  function abrirNovaConta() {
    setEditandoConta(null);
    setFormPagar({ descricao: "", fornecedor: "", categoria: "", valor: 0, vencimento: "", dt_pagamento: "", status: "Pendente", obs: "" });
    setModalPagar(true);
  }

  function abrirEditarConta(c: Lancamento) {
    setEditandoConta(c);
    setFormPagar({
      descricao:    c.descricao,
      fornecedor:   (c as any).fornecedor ?? "",
      categoria:    (c as any).categoria ?? "",
      valor:        c.valor,
      vencimento:   c.vencimento ?? "",
      dt_pagamento: (c as any).dt_pagamento ?? "",
      status:       c.status === "Pago" ? "Pago" : "Pendente",
      obs:          (c as any).obs ?? "",
    });
    setModalPagar(true);
  }

  async function salvarConta() {
    if (!formPagar.descricao.trim() || formPagar.valor <= 0 || !formPagar.vencimento) {
      toast("Preencha descrição, valor e vencimento", "warn"); return;
    }
    setSalvando(true);
    if (editandoConta) {
      await updateLancamento(editandoConta.id, {
        descricao:    formPagar.descricao,
        valor:        formPagar.valor,
        vencimento:   formPagar.vencimento,
        status:       formPagar.status,
        fornecedor:   formPagar.fornecedor,
        categoria:    formPagar.categoria,
        dt_pagamento: formPagar.dt_pagamento || null,
        obs:          formPagar.obs,
      } as any);
      toast("Conta atualizada");
    } else {
      await criarContaPagar({
        descricao:    formPagar.descricao,
        fornecedor:   formPagar.fornecedor,
        categoria:    formPagar.categoria,
        valor:        formPagar.valor,
        vencimento:   formPagar.vencimento,
        dt_pagamento: formPagar.dt_pagamento || undefined,
        status:       formPagar.status,
        obs:          formPagar.obs,
      });
      toast("Conta criada");
    }
    setSalvando(false);
    setModalPagar(false);
    load();
  }

  async function confirmarPagamento() {
    if (!contaParaPagar) return;
    setSalvando(true);
    await pagarConta(contaParaPagar.id, dtPagamentoConfirm);
    toast(`✓ Conta "${contaParaPagar.descricao}" marcada como paga`);
    setSalvando(false);
    setModalConfirmarPgto(false);
    setContaParaPagar(null);
    load();
  }

  async function handleDeletarConta(c: Lancamento) {
    if (!confirm(`Excluir "${c.descricao}"?`)) return;
    await deletarLancamento(c.id);
    toast("Conta removida");
    load();
  }

  // ── Cálculos ──────────────────────────────────────────────────────────────

  const tot = financeiro.reduce((a, f) => ({ fat: a.fat + Number(f.faturado), rec: a.rec + Number(f.recebido) }), { fat: 0, rec: 0 });
  const aReceber = tot.fat - tot.rec;
  const totalPagar = contasPagar.filter(c => c.status !== "Pago").reduce((a, c) => a + Number(c.valor), 0);
  const totalPagoMes = contasPagar.filter(c => c.status === "Pago").reduce((a, c) => a + Number(c.valor), 0);
  const vencidas = contasPagar.filter(c => c.status !== "Pago" && c.vencimento && c.vencimento < hoje());

  const pedidosCliente = clienteSel
    ? pedidos.filter(p => p.cliente_id === clienteSel.cliente_id && Number(p.valor_total) - Number(p.valor_recebido) > 0)
    : [];
  const saldoPedido = pedidoSel ? Number(pedidoSel.valor_total) - Number(pedidoSel.valor_recebido) : 0;

  const corStatus = (c: Lancamento) => {
    if (c.status === "Pago") return "var(--ok)";
    if (c.vencimento && c.vencimento < hoje()) return "var(--err)";
    const diff = diffDias(c.vencimento);
    if (diff !== null && diff < 7) return "var(--warn)";
    return "var(--t2)";
  };

  const chipStatus = (c: Lancamento) => {
    if (c.status === "Pago") return <span className="chip cg">✓ Pago</span>;
    if (c.vencimento && c.vencimento < hoje()) return <span className="chip cr">Vencido</span>;
    return <span className="chip cy">Pendente</span>;
  };

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Financeiro</div>
        {aba === "pagar" && (
          <button className="btn bp sm" onClick={abrirNovaConta}>+ Nova Conta</button>
        )}
      </div>

      <div className="con">
        {/* Cards resumo */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Faturado",    value: formatBRL(tot.fat),    color:"var(--acc)",  sub:"Total pedidos" },
            { label:"A Receber",   value: formatBRL(aReceber),   color:"var(--warn)", sub:"Em aberto" },
            { label:"A Pagar",     value: formatBRL(totalPagar), color:"var(--err)",  sub: `${vencidas.length} vencida(s)` },
            { label:"Pago no mês", value: formatBRL(totalPagoMes), color:"var(--ok)", sub:"Saídas pagas" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display:"flex", gap:"2px", marginBottom:"16px", borderBottom:"1px solid var(--b1)" }}>
          {([["receber","Contas a Receber"],["pagar","Contas a Pagar"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setAba(key)} style={{
              padding:"10px 20px", fontSize:"13px", fontWeight:600, cursor:"pointer",
              background:"transparent", border:"none",
              borderBottom:`2px solid ${aba === key ? "var(--acc)" : "transparent"}`,
              color: aba === key ? "var(--acc)" : "var(--t3)", transition:"all .15s",
            }}>{label}</button>
          ))}
        </div>

        {loading ? <div className="loading">Carregando...</div> : (
          <>
            {/* ── ABA RECEBER ── */}
            {aba === "receber" && (
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
                      const ab  = Number(f.a_receber);
                      const pct = Number(f.pct_recebido);
                      const st  = ab <= 0 ? <span className="chip cg">✓ Quitado</span> : pct > 0 ? <span className="chip cy">Parcial</span> : <span className="chip cr">Aberto</span>;
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
            )}

            {/* ── ABA PAGAR ── */}
            {aba === "pagar" && (
              <>
                {vencidas.length > 0 && (
                  <div style={{ marginBottom:"14px", padding:"12px 16px", background:"rgba(244,63,94,.08)", border:"1px solid var(--err)", borderRadius:"10px", display:"flex", alignItems:"center", gap:"10px" }}>
                    <span style={{ fontSize:"18px" }}>⚠</span>
                    <div>
                      <div style={{ fontSize:"13px", fontWeight:700, color:"var(--err)" }}>{vencidas.length} conta(s) vencida(s)</div>
                      <div style={{ fontSize:"12px", color:"var(--t3)" }}>Total: {formatBRL(vencidas.reduce((a, c) => a + Number(c.valor), 0))}</div>
                    </div>
                  </div>
                )}
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Descrição</th><th>Fornecedor</th><th>Categoria</th>
                        <th>Vencimento</th><th>Valor</th><th>Status</th>
                        <th>Dt. Pagamento</th><th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contasPagar.length === 0 && (
                        <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>Nenhuma conta a pagar cadastrada</td></tr>
                      )}
                      {[...contasPagar].sort((a, b) => (a.vencimento ?? "") > (b.vencimento ?? "") ? 1 : -1).map(c => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.descricao}</strong>
                            {(c as any).obs && <div className="tdim">{(c as any).obs}</div>}
                          </td>
                          <td>{(c as any).fornecedor || <span style={{ color:"var(--t3)" }}>—</span>}</td>
                          <td>{(c as any).categoria ? <span className="chip cgr" style={{ fontSize:"10px" }}>{(c as any).categoria}</span> : <span style={{ color:"var(--t3)" }}>—</span>}</td>
                          <td className="mono" style={{ color: corStatus(c) }}>{formatDate(c.vencimento)}</td>
                          <td className="mono" style={{ color:"var(--err)", fontWeight:600 }}>{formatBRL(c.valor)}</td>
                          <td>{chipStatus(c)}</td>
                          <td className="mono" style={{ color:"var(--t3)" }}>{(c as any).dt_pagamento ? formatDate((c as any).dt_pagamento) : "—"}</td>
                          <td>
                            <div style={{ display:"flex", gap:"4px" }}>
                              {c.status !== "Pago" && (
                                <button className="btn bp xs" onClick={() => { setContaParaPagar(c); setDtPagamentoConfirm(hoje()); setModalConfirmarPgto(true); }}>
                                  ✓ Pagar
                                </button>
                              )}
                              <button className="btn bg xs" onClick={() => abrirEditarConta(c)}>✏</button>
                              <button className="btn bg xs" style={{ color:"var(--err)", borderColor:"var(--err)" }} onClick={() => handleDeletarConta(c)}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Modal Receber ── */}
      {modalReceber && clienteSel && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalReceber(false)}>
          <div className="mod" style={{ width:"480px" }}>
            <div className="mhd">
              <div className="mtit">Registrar Recebimento</div>
              <button className="mcl" onClick={() => setModalReceber(false)}>✕</button>
            </div>
            <div style={{ marginBottom:"14px" }}>
              <strong>{clienteSel.cliente_nome}</strong>
              <div style={{ fontSize:"12px", color:"var(--t3)", marginTop:"2px" }}>Em aberto: <strong>{formatBRL(clienteSel.a_receber)}</strong></div>
            </div>
            <div className="fg" style={{ marginBottom:"14px" }}>
              <label className="fl">Pedido *</label>
              <select className="fc" value={pedidoSel?.id ?? ""} onChange={e => selecionarPedido(e.target.value)}>
                <option value="">Selecione um pedido...</option>
                {pedidosCliente.map(p => {
                  const saldo = Number(p.valor_total) - Number(p.valor_recebido);
                  return <option key={p.id} value={p.id}>{p.id} — {formatBRL(saldo)} em aberto</option>;
                })}
              </select>
            </div>
            {pedidoSel && (
              <div style={{ background:"var(--surf2)", border:"1px solid var(--b1)", borderRadius:"8px", padding:"12px", marginBottom:"14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Total</span><span className="mono">{formatBRL(pedidoSel.valor_total)}</span></div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Recebido</span><span className="mono" style={{ color:"var(--ok)" }}>{formatBRL(pedidoSel.valor_recebido)}</span></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ fontSize:"11px", color:"var(--t3)" }}>Saldo</span><span className="mono" style={{ color:"var(--warn)", fontWeight:700 }}>{formatBRL(saldoPedido)}</span></div>
              </div>
            )}
            <div className="fg" style={{ marginBottom:"6px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
                <label className="fl">Valor *</label>
                {pedidoSel && <button className="btn bg xs" onClick={preencherTotal} style={{ fontSize:"10px" }}>Preencher total</button>}
              </div>
              <CurrencyInput value={valorRec} onChange={handleValorRec} placeholder="R$ 0,00" disabled={!pedidoSel} />
              <div style={{ fontSize:"11px", color:"var(--t3)", marginTop:"4px" }}>Pode ser maior que o saldo — excedente vira crédito do cliente</div>
            </div>
            {erro && <div className="al al-e" style={{ marginBottom:"12px" }}>{erro}</div>}
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg" onClick={() => setModalReceber(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarRecebimento} disabled={salvando || valorRec <= 0 || !pedidoSel}>
                {salvando ? "Salvando..." : "✓ Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Nova/Editar Conta a Pagar ── */}
      {modalPagar && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalPagar(false)}>
          <div className="mod" style={{ width:"520px" }}>
            <div className="mhd">
              <div className="mtit">{editandoConta ? "Editar Conta" : "Nova Conta a Pagar"}</div>
              <button className="mcl" onClick={() => setModalPagar(false)}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <div className="fg">
                <label className="fl">Descrição *</label>
                <input className="fc" value={formPagar.descricao} onChange={e => setFormPagar(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Conta de energia, aluguel..." />
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Fornecedor</label>
                  <input className="fc" value={formPagar.fornecedor} onChange={e => setFormPagar(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" />
                </div>
                <div className="fg">
                  <label className="fl">Categoria</label>
                  <select className="fc" value={formPagar.categoria} onChange={e => setFormPagar(f => ({ ...f, categoria: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Valor *</label>
                  <CurrencyInput value={formPagar.valor} onChange={v => setFormPagar(f => ({ ...f, valor: v }))} placeholder="R$ 0,00" />
                </div>
                <div className="fg">
                  <label className="fl">Status</label>
                  <select className="fc" value={formPagar.status} onChange={e => setFormPagar(f => ({ ...f, status: e.target.value as "Pendente" | "Pago" }))}>
                    <option value="Pendente">Pendente</option>
                    <option value="Pago">Pago</option>
                  </select>
                </div>
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Vencimento *</label>
                  <DateInput value={formPagar.vencimento} onChange={v => setFormPagar(f => ({ ...f, vencimento: v }))} />
                </div>
                <div className="fg">
                  <label className="fl">Data de Pagamento</label>
                  <DateInput value={formPagar.dt_pagamento} onChange={v => setFormPagar(f => ({ ...f, dt_pagamento: v }))} />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Observações</label>
                <textarea className="fc" value={formPagar.obs} onChange={e => setFormPagar(f => ({ ...f, obs: e.target.value }))} placeholder="Observações..." rows={2} style={{ resize:"vertical" }} />
              </div>
              <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
                <button className="btn bg" onClick={() => setModalPagar(false)}>Cancelar</button>
                <button className="btn bp" onClick={salvarConta} disabled={salvando}>
                  {salvando ? "Salvando..." : editandoConta ? "Salvar Alterações" : "Criar Conta"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmar Pagamento ── */}
      {modalConfirmarPgto && contaParaPagar && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalConfirmarPgto(false)}>
          <div className="mod" style={{ width:"380px" }}>
            <div className="mhd">
              <div className="mtit">Confirmar Pagamento</div>
              <button className="mcl" onClick={() => setModalConfirmarPgto(false)}>✕</button>
            </div>
            <div style={{ marginBottom:"16px" }}>
              <div style={{ fontSize:"14px", fontWeight:700, color:"var(--t1)", marginBottom:"4px" }}>{contaParaPagar.descricao}</div>
              <div style={{ fontSize:"22px", fontWeight:800, color:"var(--err)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(contaParaPagar.valor)}</div>
            </div>
            <div className="fg" style={{ marginBottom:"16px" }}>
              <label className="fl">Data do Pagamento</label>
              <DateInput value={dtPagamentoConfirm} onChange={setDtPagamentoConfirm} />
            </div>
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg" onClick={() => setModalConfirmarPgto(false)}>Cancelar</button>
              <button className="btn bp" onClick={confirmarPagamento} disabled={salvando}>
                {salvando ? "Salvando..." : "✓ Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}