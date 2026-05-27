"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFaturamentoMensal, getLancamentos, createLancamento } from "@/services/financeiro.service";
import { formatBRL, formatPercent, formatDate, MESES } from "@/lib/formatters";
import type { FaturamentoMensal, Lancamento, LancamentoInsert } from "@/types";

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const VAZIO: LancamentoInsert = {
  tipo: "Entrada", descricao: "", valor: 0,
  status: "Pendente", vencimento: null,
  pedido_id: null, cliente_id: null,
};

export default function FluxoPage() {
  const [fatMensal, setFatMensal] = useState<FaturamentoMensal[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<LancamentoInsert>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fat, lanc] = await Promise.all([
      getFaturamentoMensal(2026),
      getLancamentos(),
    ]);
    setFatMensal(fat);
    setLancamentos(lanc);
    setLoading(false);
  }

  async function salvar() {
    if (!form.descricao || !form.valor) return;
    setSalvando(true);
    await createLancamento(form);
    setSalvando(false);
    setModal(false);
    setForm(VAZIO);
    load();
  }

  // Monta array dos 12 meses
  const meses = MESES_ABREV.map((mes, i) => {
    const fat = fatMensal.find(f => f.mes === i + 1);
    return {
      mes,
      faturado: fat ? Number(fat.faturado) : 0,
      recebido: fat ? Number(fat.recebido) : 0,
    };
  });

  const totalFat = meses.reduce((a, m) => a + m.faturado, 0);
  const totalRec = meses.reduce((a, m) => a + m.recebido, 0);

  // Lançamentos
  const entradas = lancamentos.filter(l => l.tipo === "Entrada");
  const saidas = lancamentos.filter(l => l.tipo === "Saída");
  const totalEntradas = entradas.reduce((a, l) => a + Number(l.valor), 0);
  const totalSaidas = saidas.reduce((a, l) => a + Number(l.valor), 0);
  const saldo = totalEntradas - totalSaidas;

  const chipStatus = (s: string) => {
    if (s === "Pago") return <span className="chip cg">Pago</span>;
    if (s === "A Receber") return <span className="chip cy">A Receber</span>;
    return <span className="chip cgr">Pendente</span>;
  };

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Fluxo de Caixa</div>
        <button className="btn bp sm" onClick={() => setModal(true)}>+ Lançamento</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando fluxo de caixa...</div>
        ) : (
          <>
            {/* KPIs lançamentos */}
            <div className="g3 mb14">
              <div className="kpi">
                <div className="kpi-l">Total Entradas</div>
                <div className="kpi-v" style={{ color: "var(--ok)" }}>{formatBRL(totalEntradas)}</div>
                <div className="kpi-s up">{entradas.length} lançamentos</div>
                <div className="kpi-bar" style={{ width: "100%", background: "var(--ok)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Total Saídas</div>
                <div className="kpi-v" style={{ color: "var(--err)" }}>{formatBRL(totalSaidas)}</div>
                <div className="kpi-s dn">{saidas.length} lançamentos</div>
                <div className="kpi-bar" style={{ width: "60%", background: "var(--err)" }} />
              </div>
              <div className="kpi">
                <div className="kpi-l">Saldo</div>
                <div className="kpi-v" style={{ color: saldo >= 0 ? "var(--acc)" : "var(--err)" }}>
                  {formatBRL(saldo)}
                </div>
                <div className={`kpi-s ${saldo >= 0 ? "up" : "dn"}`}>
                  {saldo >= 0 ? "↑ Positivo" : "↓ Negativo"}
                </div>
                <div className="kpi-bar" style={{ width: "80%", background: saldo >= 0 ? "var(--acc)" : "var(--err)" }} />
              </div>
            </div>

            {/* Faturamento mensal por pedidos */}
            <div className="card mb14">
              <div className="ct">Faturamento vs Recebimento por Mês</div>
              <div className="tw" style={{ border: "none", borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Faturado</th>
                      <th>Recebido</th>
                      <th>A Receber</th>
                      <th>Realizado %</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meses.filter(m => m.faturado > 0 || m.recebido > 0).map((m, i) => {
                      const pct = m.faturado > 0 ? m.recebido / m.faturado * 100 : 0;
                      const aRec = m.faturado - m.recebido;
                      return (
                        <tr key={i}>
                          <td><strong>{m.mes}</strong></td>
                          <td className="mono">{formatBRL(m.faturado)}</td>
                          <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(m.recebido)}</td>
                          <td className="mono" style={{ color: aRec > 0 ? "var(--warn)" : "var(--t2)" }}>{formatBRL(aRec)}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                              <div className="prg" style={{ width: "75px", height: "5px" }}>
                                <div className="prg-f" style={{
                                  width: `${Math.min(pct, 100)}%`,
                                  background: pct < 50 ? "var(--err)" : pct < 80 ? "var(--warn)" : "var(--ok)"
                                }} />
                              </div>
                              <span className="mono">{formatPercent(pct)}</span>
                            </div>
                          </td>
                          <td>{chipStatus(pct >= 100 ? "Pago" : pct > 0 ? "A Receber" : "Pendente")}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ fontWeight: 700, background: "var(--surf2)" }}>
                      <td>TOTAL</td>
                      <td className="mono">{formatBRL(totalFat)}</td>
                      <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(totalRec)}</td>
                      <td className="mono" style={{ color: "var(--warn)" }}>{formatBRL(totalFat - totalRec)}</td>
                      <td className="mono">{formatPercent(totalFat > 0 ? totalRec / totalFat * 100 : 0)}</td>
                      <td>{chipStatus(totalRec >= totalFat ? "Pago" : totalRec > 0 ? "A Receber" : "Pendente")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lançamentos avulsos */}
            <div className="card">
              <div className="ct">
                Lançamentos
                <button className="btn bp xs" onClick={() => setModal(true)}>+ Novo</button>
              </div>
              {lancamentos.length === 0 ? (
                <div style={{ color: "var(--t3)", fontSize: "12px", padding: "16px 0" }}>
                  Nenhum lançamento cadastrado
                </div>
              ) : (
                <div className="tw" style={{ border: "none", borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Descrição</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lancamentos.map(l => (
                        <tr key={l.id}>
                          <td>
                            <span className={l.tipo === "Entrada" ? "chip cg" : "chip cr"}>
                              {l.tipo}
                            </span>
                          </td>
                          <td>{l.descricao}</td>
                          <td className="mono" style={{ color: l.tipo === "Entrada" ? "var(--ok)" : "var(--err)" }}>
                            {l.tipo === "Saída" ? "− " : ""}{formatBRL(l.valor)}
                          </td>
                          <td className="mono">{formatDate(l.vencimento)}</td>
                          <td>{chipStatus(l.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal novo lançamento */}
      {modal && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="mod" style={{ width: "440px" }}>
            <div className="mhd">
              <div className="mtit">Novo Lançamento</div>
              <button className="mcl" onClick={() => setModal(false)}>✕</button>
            </div>

            <div className="fr" style={{ marginBottom: "10px" }}>
              <div className="fg">
                <label className="fl">Tipo</label>
                <select className="fc" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}>
                  <option>Entrada</option>
                  <option>Saída</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Status</label>
                <select className="fc" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                  <option>Pendente</option>
                  <option>Pago</option>
                  <option>A Receber</option>
                </select>
              </div>
            </div>

            <div className="fg" style={{ marginBottom: "10px" }}>
              <label className="fl">Descrição *</label>
              <input className="fc" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Compra de chapas" />
            </div>

            <div className="fr" style={{ marginBottom: "14px" }}>
              <div className="fg">
                <label className="fl">Valor *</label>
                <input className="fc" type="number" step="0.01" value={form.valor || ""} onChange={e => setForm(f => ({ ...f, valor: parseFloat(e.target.value) || 0 }))} placeholder="0,00" />
              </div>
              <div className="fg">
                <label className="fl">Vencimento</label>
                <input className="fc" type="date" value={form.vencimento || ""} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value || null }))} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}