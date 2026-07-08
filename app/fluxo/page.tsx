"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import { getBaixasPorLancamentos } from "@/services/lancamentos.service";
import type { BaixaLancamento } from "@/types";

interface Mov {
  id: number;
  tipo: "Entrada" | "Saída";
  valor: number;
  vencimento: string | null;
  dt_pagamento: string | null;
  conta: string | null;
  status: string;
}

interface EventoRealizado { data: string; valor: number; tipo: "Entrada" | "Saída"; }

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function diasNoMes(yyyyMM: string) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function primeirodia(yyyyMM: string) { return `${yyyyMM}-01`; }

function labelMes(yyyyMM: string) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function pad(n: number) { return String(n).padStart(2, "0"); }

const BRL = (v: number) => formatBRL(v);

function ColorVal({ v, zero = "var(--t3)" }: { v: number; zero?: string }) {
  const cor = v > 0 ? "var(--ok)" : v < 0 ? "var(--err)" : zero;
  return <span style={{ color: cor, fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{BRL(v)}</span>;
}

export default function FluxoPage() {
  return (
    <Suspense fallback={<AppLayout><div className="loading">Carregando...</div></AppLayout>}>
      <FluxoPageInner />
    </Suspense>
  );
}

function FluxoPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mes, setMes]           = useState(searchParams.get("mes") || mesAtual());
  const [conta, setConta]       = useState(searchParams.get("conta") ?? "");
  const [movs, setMovs]         = useState<Mov[]>([]);
  const [baixasMap, setBaixasMap] = useState<Map<number, BaixaLancamento[]>>(new Map());
  const [loading, setLoading]   = useState(true);

  useEffect(() => { load(); }, [mes, conta]);

  // Navegação inteligente: mês/conta sobrevivem a refresh/voltar do navegador.
  useEffect(() => {
    const params = new URLSearchParams();
    if (mes !== mesAtual()) params.set("mes", mes);
    if (conta) params.set("conta", conta);
    const qs = params.toString();
    router.replace(qs ? `/fluxo?${qs}` : "/fluxo", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, conta]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("lancamentos")
      .select("id, tipo, valor, vencimento, dt_pagamento, conta, status");
    if (conta) q = q.eq("conta", conta);
    const { data } = await q;
    const movsCarregados = (data ?? []) as Mov[];
    setMovs(movsCarregados);
    setBaixasMap(await getBaixasPorLancamentos(movsCarregados.map(m => m.id)));
    setLoading(false);
  }

  // Eventos de caixa efetivamente realizados: uma baixa = um evento na data
  // dela (suporta parcial — um título pode gerar vários eventos em dias
  // diferentes). Lançamento 'Pago' sem baixa nenhuma é pagamento anterior à
  // existência dessa tabela — conta como um evento único no dt_pagamento.
  const eventosRealizados = useMemo(() => {
    const eventos: EventoRealizado[] = [];
    for (const mv of movs) {
      const ativas = (baixasMap.get(mv.id) ?? []).filter(b => !b.estornado_em);
      if (ativas.length > 0) {
        for (const b of ativas) eventos.push({ data: b.data, valor: Number(b.valor), tipo: mv.tipo });
      } else if (mv.status === "Pago" && mv.dt_pagamento) {
        eventos.push({ data: mv.dt_pagamento, valor: Number(mv.valor), tipo: mv.tipo });
      }
    }
    return eventos;
  }, [movs, baixasMap]);

  // ── Contas únicas para filtro ──────────────────────────────
  const contasUnicas = useMemo(() => {
    const set = new Set<string>();
    movs.forEach(m => { if (m.conta) set.add(m.conta); });
    return [...set].sort();
  }, [movs]);

  // ── Dia a dia ─────────────────────────────────────────────
  const { realizado, projetado, saldoAntReal, saldoAntProj } = useMemo(() => {
    const total = diasNoMes(mes);
    const [y, m] = mes.split("-").map(Number);
    const inicio = primeirodia(mes);

    // Saldo anterior REALIZADO: soma dos eventos de baixa (ou pagamento
    // legado) com data < início do mês
    const saldoAntReal = eventosRealizados
      .filter(ev => ev.data < inicio)
      .reduce((s, ev) => s + (ev.tipo === "Entrada" ? ev.valor : -ev.valor), 0);

    // Saldo anterior PROJETADO: vencimento existe e < inicio do mês
    const saldoAntProj = movs
      .filter(mv => mv.vencimento && mv.vencimento < inicio)
      .reduce((s, mv) => s + (mv.tipo === "Entrada" ? Number(mv.valor) : -Number(mv.valor)), 0);

    let acumReal = saldoAntReal;
    let acumProj = saldoAntProj;

    const realizado: { dia: number; entradas: number; saidas: number; saldoDia: number; saldoMes: number }[] = [];
    const projetado: { dia: number; entradas: number; saidas: number; saldoDia: number; saldoMes: number }[] = [];

    for (let d = 1; d <= total; d++) {
      const data = `${y}-${pad(m)}-${pad(d)}`;

      // REALIZADO: soma os eventos de baixa (parcial ou total) do dia
      const entR = eventosRealizados.filter(ev => ev.data === data && ev.tipo === "Entrada").reduce((s, ev) => s + ev.valor, 0);
      const saiR = eventosRealizados.filter(ev => ev.data === data && ev.tipo === "Saída").reduce((s, ev) => s + ev.valor, 0);
      const sdR  = entR - saiR;
      acumReal  += sdR;
      realizado.push({ dia: d, entradas: entR, saidas: saiR, saldoDia: sdR, saldoMes: acumReal });

      // PROJETADO: usa vencimento
      const entP = movs.filter(mv => mv.vencimento === data && mv.tipo === "Entrada").reduce((s, mv) => s + Number(mv.valor), 0);
      const saiP = movs.filter(mv => mv.vencimento === data && mv.tipo === "Saída").reduce((s, mv) => s + Number(mv.valor), 0);
      const sdP  = entP - saiP;
      acumProj  += sdP;
      projetado.push({ dia: d, entradas: entP, saidas: saiP, saldoDia: sdP, saldoMes: acumProj });
    }

    return { realizado, projetado, saldoAntReal, saldoAntProj };
  }, [movs, eventosRealizados, mes]);

  // totais do mês
  const totReal = realizado.reduce((s, d) => ({ ent: s.ent + d.entradas, sai: s.sai + d.saidas }), { ent: 0, sai: 0 });
  const totProj = projetado.reduce((s, d) => ({ ent: s.ent + d.entradas, sai: s.sai + d.saidas }), { ent: 0, sai: 0 });
  const saldoFinalReal = realizado.length ? realizado[realizado.length - 1].saldoMes : saldoAntReal;
  const saldoFinalProj = projetado.length ? projetado[projetado.length - 1].saldoMes : saldoAntProj;

  const hoje = new Date().toISOString().split("T")[0];
  const [hY, hM, hD] = hoje.split("-").map(Number);
  const [mY, mM] = mes.split("-").map(Number);
  const diaHoje = (hY === mY && hM === mM) ? hD : null;

  const thStyle: React.CSSProperties = {
    padding: "7px 10px", fontSize: "9px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t3)",
    borderBottom: "1px solid var(--b1)", textAlign: "right", background: "var(--surf2)",
  };
  const thFirst: React.CSSProperties = { ...thStyle, textAlign: "left", width: "36px" };
  const td = (v: number, right = true): React.CSSProperties => ({
    padding: "5px 10px", fontSize: "12px", textAlign: right ? "right" : "left",
    fontFamily: "'DM Mono',monospace",
  });

  function Tabela({ dados, saldoAnt, acento }: {
    dados: typeof realizado;
    saldoAnt: number;
    acento: string;
  }) {
    const totalEnt  = dados.reduce((s, d) => s + d.entradas, 0);
    const totalSai  = dados.reduce((s, d) => s + d.saidas, 0);
    const saldoFinal = dados.length ? dados[dados.length - 1].saldoMes : saldoAnt;

    return (
      <div style={{ overflowX: "auto" }}>
        <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "10px", display: "flex", justifyContent: "flex-end", gap: "6px" }}>
          Saldo Final do Mês Anterior
          <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: saldoAnt >= 0 ? "var(--ok)" : "var(--err)" }}>
            {BRL(saldoAnt)}
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thFirst, background: `${acento}10` }}>Dia</th>
              <th style={{ ...thStyle, background: `${acento}10`, color: acento }}>Entradas</th>
              <th style={{ ...thStyle, background: `${acento}10`, color: "var(--err)" }}>Saídas</th>
              <th style={{ ...thStyle, background: `${acento}10` }}>Saldo do Dia</th>
              <th style={{ ...thStyle, background: `${acento}10`, color: acento }}>Saldo do Mês</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(row => {
              const isHoje = diaHoje === row.dia;
              const rowBg = isHoje ? `${acento}09` : row.dia % 2 === 0 ? "var(--surf2)" : "transparent";
              return (
                <tr key={row.dia} style={{ background: rowBg, outline: isHoje ? `1px solid ${acento}40` : "none" }}>
                  <td style={{ ...td(0, false), fontWeight: isHoje ? 800 : 400, color: isHoje ? acento : "var(--t2)", fontSize: "12px" }}>
                    {row.dia}
                    {isHoje && <span style={{ fontSize: "8px", marginLeft: "3px", color: acento }}>●</span>}
                  </td>
                  <td style={td(row.entradas)}>
                    {row.entradas > 0 ? <span style={{ color: "var(--ok)" }}>{BRL(row.entradas)}</span> : <span style={{ color: "var(--t3)" }}>0,00</span>}
                  </td>
                  <td style={td(row.saidas)}>
                    {row.saidas > 0 ? <span style={{ color: "var(--err)" }}>{BRL(row.saidas)}</span> : <span style={{ color: "var(--t3)" }}>0,00</span>}
                  </td>
                  <td style={td(row.saldoDia)}>
                    {row.saldoDia !== 0 ? <ColorVal v={row.saldoDia} /> : <span style={{ color: "var(--t3)" }}>0,00</span>}
                  </td>
                  <td style={td(row.saldoMes)}>
                    <ColorVal v={row.saldoMes} zero="var(--t2)" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--b1)", background: `${acento}08` }}>
              <td style={{ ...td(0, false), fontWeight: 700, color: "var(--t2)", fontSize: "11px" }}>Total</td>
              <td style={{ ...td(0), color: "var(--ok)", fontWeight: 800 }}>{BRL(totalEnt)}</td>
              <td style={{ ...td(0), color: "var(--err)", fontWeight: 800 }}>{BRL(totalSai)}</td>
              <td style={{ ...td(0) }}><ColorVal v={totalEnt - totalSai} /></td>
              <td style={{ ...td(0) }}>
                <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: "13px", color: saldoFinal >= 0 ? "var(--ok)" : "var(--err)" }}>
                  {BRL(saldoFinal)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Fluxo de Caixa Diário</div>
      </div>

      <div className="con">

        {/* Filtros */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "20px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px" }}>
          <div>
            <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>Mês / Ano</div>
            <input type="month" className="fc" style={{ margin: 0, width: "160px" }} value={mes}
              onChange={e => setMes(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>Conta Bancária</div>
            <select className="fc" style={{ margin: 0, minWidth: "200px" }} value={conta} onChange={e => setConta(e.target.value)}>
              <option value="">Todas as contas</option>
              {contasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t2)", marginBottom: "2px" }}>
            {labelMes(mes)}
          </div>
        </div>

        {/* Resumo do mês */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Entradas Realizadas", val: totReal.ent, cor: "var(--ok)" },
            { label: "Saídas Realizadas",   val: totReal.sai, cor: "var(--err)" },
            { label: "Saldo Realizado",     val: saldoFinalReal, cor: saldoFinalReal >= 0 ? "var(--ok)" : "var(--err)" },
            { label: "Saldo Projetado",     val: saldoFinalProj, cor: saldoFinalProj >= 0 ? "var(--ok)" : "var(--err)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px" }}>
              <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "6px" }}>{s.label}</div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: s.cor, fontFamily: "'DM Mono', monospace" }}>{BRL(s.val)}</div>
            </div>
          ))}
        </div>

        {loading ? <div className="loading">Carregando...</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

            {/* REALIZADO */}
            <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid var(--ok)", borderRadius: "12px", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", background: "var(--surf2)", borderBottom: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "9px", color: "var(--ok)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em" }}>Realizado</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", marginTop: "1px" }}>Movimentações Efetivadas</div>
                  <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>Baseado na data de pagamento / recebimento</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2px" }}>Saldo Final</div>
                  <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "'DM Mono',monospace", color: saldoFinalReal >= 0 ? "var(--ok)" : "var(--err)" }}>
                    {BRL(saldoFinalReal)}
                  </div>
                </div>
              </div>
              <div style={{ padding: "14px" }}>
                <Tabela dados={realizado} saldoAnt={saldoAntReal} acento="var(--ok)" />
              </div>
            </div>

            {/* PROJETADO */}
            <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid #60a5fa", borderRadius: "12px", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", background: "var(--surf2)", borderBottom: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "9px", color: "#60a5fa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em" }}>Projetado</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", marginTop: "1px" }}>Previsão de Caixa</div>
                  <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>Baseado na data de vencimento de todos os títulos</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2px" }}>Saldo Projetado</div>
                  <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "'DM Mono',monospace", color: saldoFinalProj >= 0 ? "var(--ok)" : "var(--err)" }}>
                    {BRL(saldoFinalProj)}
                  </div>
                </div>
              </div>
              <div style={{ padding: "14px" }}>
                <Tabela dados={projetado} saldoAnt={saldoAntProj} acento="#60a5fa" />
              </div>
            </div>

          </div>
        )}

        {/* Legenda */}
        <div style={{ marginTop: "16px", display: "flex", gap: "20px", justifyContent: "center", fontSize: "11px", color: "var(--t3)" }}>
          <span><span style={{ color: "var(--ok)", fontWeight: 700 }}>Realizado</span> — usa data de pagamento/recebimento efetivo</span>
          <span>·</span>
          <span><span style={{ color: "#60a5fa", fontWeight: 700 }}>Projetado</span> — usa data de vencimento de todos os títulos (pagos e pendentes)</span>
          {diaHoje && <><span>·</span><span><span style={{ color: "var(--acc)" }}>●</span> dia atual</span></>}
        </div>

      </div>
    </AppLayout>
  );
}
