"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { useTheme } from "@/components/layout/ThemeProvider";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/formatters";
import { ordenarPorCodigoEstruturado } from "@/lib/planoContas";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { useToast } from "@/components/ui/toast";
import { editarBaixa, editarLancamento } from "@/services/lancamentos.service";
import { getSaldoCaixaTotal } from "@/services/dashboardFinanceiro.service";
import { getOcorrenciasFuturas } from "@/services/recorrencias.service";
import { recalcularRecebido } from "@/services/pedidos.service";
import { exportarExcel } from "@/lib/exportExcel";

// ── Datas ─────────────────────────────────────────────────────────────────
function fmtISO(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function hojeISO() { return fmtISO(new Date()); }
function inicioMes(base = new Date()) { return fmtISO(new Date(base.getFullYear(), base.getMonth(), 1)); }
function fimMes(base = new Date()) { return fmtISO(new Date(base.getFullYear(), base.getMonth() + 1, 0)); }
function addDias(iso: string, n: number) { const [y, m, d] = iso.split("-").map(Number); return fmtISO(new Date(y, m - 1, d + n)); }

const ATALHOS: { label: string; get: () => readonly [string, string] }[] = [
  { label: "Este mês", get: () => [inicioMes(), fimMes()] },
  { label: "Mês passado", get: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return [inicioMes(d), fimMes(d)]; } },
  { label: "Últimos 30 dias", get: () => [addDias(hojeISO(), -30), hojeISO()] },
  { label: "Próximos 30 dias", get: () => [hojeISO(), addDias(hojeISO(), 30)] },
];

// ── Linhas do extrato ────────────────────────────────────────────────────
type OrigemLinha = "baixa" | "pago-legado" | "pendente" | "recorrencia-futura";

interface LinhaBase {
  key: string;
  data: string;
  tipo: "Entrada" | "Saída";
  valor: number;
  descricao: string;
  pessoa: string | null;
  pedidoId: string | null;
  documento: string | null;
  planoContasId: number | null;
  origem: OrigemLinha;
  lancamentoId?: number;
  baixaId?: number;
  temBaixaAtiva?: boolean;
}
interface Linha extends LinhaBase { saldoAcumulado: number; }

interface EdicaoLinha { data: string; valor: number; motivo: string; salvando: boolean; }

type PlanoItem = { id: number; codigo_estruturado: string; descricao: string };

type LancRow = {
  id: number; tipo: "Entrada" | "Saída"; descricao: string; valor: number; status: string;
  vencimento: string | null; dt_pagamento: string | null; pedido_id: string | null;
  fornecedor: string | null; documento: string | null; plano_contas_id: number | null;
  clientes: { id: number; nome: string } | null;
};
type BaixaRow = { id: number; lancamento_id: number; valor: number; data: string };

const SITUACOES = ["Realizado", "Previsto", "Vencido", "Recorrência"] as const;

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
  const { toast } = useToast();
  const { theme } = useTheme();

  const [dataIni, setDataIni] = useState(searchParams.get("de") || inicioMes());
  const [dataFim, setDataFim] = useState(searchParams.get("ate") || fimMes());
  const [verTudo, setVerTudo] = useState(searchParams.get("tudo") === "1");
  const [loading, setLoading] = useState(true);
  const [linhasBase, setLinhasBase] = useState<LinhaBase[]>([]);
  const [planos, setPlanos] = useState<PlanoItem[]>([]);
  const [saldoInicialContas, setSaldoInicialContas] = useState(0);
  const [saldoAtual, setSaldoAtual] = useState(0);
  const [editando, setEditando] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<EdicaoLinha>({ data: "", valor: 0, motivo: "", salvando: false });

  // Filtros extras (vieram de Movimentações, que foi descontinuada)
  const [filtroTipo, setFiltroTipo] = useState<"Todos" | "Entrada" | "Saída">("Todos");
  const [filtroSituacao, setFiltroSituacao] = useState<"Todos" | (typeof SITUACOES)[number]>("Todos");
  const [filtroPlano, setFiltroPlano] = useState("");
  const [busca, setBusca] = useState("");
  // Painel de filtros extras começa fechado — ocupava espaço grande demais
  // parado no estado padrão, empurrando os KPIs pra baixo.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  useEffect(() => { load(); }, []);

  // Filtro sobrevive a refresh/voltar do navegador. Padrão continua "Este
  // mês" — "Ver tudo" só entra na URL quando ativado de propósito.
  useEffect(() => {
    const params = new URLSearchParams();
    if (verTudo) {
      params.set("tudo", "1");
    } else {
      if (dataIni !== inicioMes()) params.set("de", dataIni);
      if (dataFim !== fimMes()) params.set("ate", dataFim);
    }
    const qs = params.toString();
    router.replace(qs ? `/fluxo?${qs}` : "/fluxo", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataIni, dataFim, verTudo]);

  function setPeriodo(ini: string, fim: string) {
    setVerTudo(false);
    setDataIni(ini);
    setDataFim(fim);
  }

  async function load() {
    setLoading(true);
    const [{ data: lancsRaw }, { data: baixasRaw }, { data: contasRaw }, { data: planosRaw }, ocorrencias, saldoAtualCalc] = await Promise.all([
      supabase.from("lancamentos")
        .select("id, tipo, descricao, valor, status, vencimento, dt_pagamento, pedido_id, fornecedor, documento, plano_contas_id, clientes(id, nome)")
        .is("deletado_em", null),
      supabase.from("baixas_lancamento")
        .select("id, lancamento_id, valor, data")
        .is("estornado_em", null)
        .not("lancamento_id", "is", null),
      supabase.from("contas_bancarias").select("saldo_inicial").eq("ativo", true),
      supabase.from("plano_contas").select("id, codigo_estruturado, descricao"),
      getOcorrenciasFuturas(400),
      getSaldoCaixaTotal(),
    ]);

    const lancs = (lancsRaw ?? []) as unknown as LancRow[];
    const baixas = (baixasRaw ?? []) as unknown as BaixaRow[];
    const somaSaldoInicial = ((contasRaw ?? []) as { saldo_inicial: number }[]).reduce((a, c) => a + Number(c.saldo_inicial), 0);
    setPlanos(ordenarPorCodigoEstruturado((planosRaw ?? []) as PlanoItem[]));

    const lancMap = new Map(lancs.map(l => [l.id, l]));
    const baixasPorLanc = new Map<number, BaixaRow[]>();
    for (const b of baixas) {
      const arr = baixasPorLanc.get(b.lancamento_id) ?? [];
      arr.push(b);
      baixasPorLanc.set(b.lancamento_id, arr);
    }

    const linhas: LinhaBase[] = [];

    for (const b of baixas) {
      const l = lancMap.get(b.lancamento_id);
      if (!l) continue;
      linhas.push({
        key: `baixa-${b.id}`, data: b.data, tipo: l.tipo, valor: Number(b.valor),
        descricao: l.descricao, pessoa: l.clientes?.nome ?? l.fornecedor ?? null,
        pedidoId: l.pedido_id, documento: l.documento, planoContasId: l.plano_contas_id, origem: "baixa",
        lancamentoId: l.id, baixaId: b.id,
      });
    }

    for (const l of lancs) {
      const baixasDoLanc = baixasPorLanc.get(l.id) ?? [];
      if (l.status === "Pago" && baixasDoLanc.length === 0 && l.dt_pagamento) {
        linhas.push({
          key: `legado-${l.id}`, data: l.dt_pagamento, tipo: l.tipo, valor: Number(l.valor),
          descricao: l.descricao, pessoa: l.clientes?.nome ?? l.fornecedor ?? null,
          pedidoId: l.pedido_id, documento: l.documento, planoContasId: l.plano_contas_id, origem: "pago-legado",
          lancamentoId: l.id,
        });
        continue;
      }
      if (l.status === "Pago") continue;
      const valorPago = baixasDoLanc.reduce((a, bx) => a + Number(bx.valor), 0);
      const saldo = Number(l.valor) - valorPago;
      if (saldo <= 0 || !l.vencimento) continue;
      linhas.push({
        key: `pendente-${l.id}`, data: l.vencimento, tipo: l.tipo, valor: saldo,
        descricao: l.descricao, pessoa: l.clientes?.nome ?? l.fornecedor ?? null,
        pedidoId: l.pedido_id, documento: l.documento, planoContasId: l.plano_contas_id, origem: "pendente",
        lancamentoId: l.id, temBaixaAtiva: baixasDoLanc.length > 0,
      });
    }

    for (const o of ocorrencias) {
      linhas.push({
        key: `rec-${o.recorrenciaId}-${o.data}`, data: o.data, tipo: o.tipo, valor: o.valor,
        descricao: o.descricao, pessoa: o.pessoa, pedidoId: null, documento: null,
        planoContasId: o.planoContasId, origem: "recorrencia-futura",
      });
    }

    linhas.sort((a, b) => a.data.localeCompare(b.data) || a.key.localeCompare(b.key));

    setLinhasBase(linhas);
    setSaldoInicialContas(somaSaldoInicial);
    setSaldoAtual(saldoAtualCalc);
    setLoading(false);
  }

  // Saldo acumulado ao longo de TODA a linha do tempo (não só o período
  // visível) — pra "menor saldo" e o saldo de cada linha ficarem corretos
  // mesmo filtrando uma janela que não começa do zero.
  const linhasComSaldo: Linha[] = useMemo(() => {
    let acumulado = saldoInicialContas;
    return linhasBase.map(l => {
      acumulado += l.tipo === "Entrada" ? l.valor : -l.valor;
      return { ...l, saldoAcumulado: acumulado };
    });
  }, [linhasBase, saldoInicialContas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhasComSaldo.filter(l => {
      if (!verTudo && (l.data < dataIni || l.data > dataFim)) return false;
      if (filtroTipo !== "Todos" && l.tipo !== filtroTipo) return false;
      if (filtroSituacao !== "Todos" && situacaoLabel(l) !== filtroSituacao) return false;
      if (filtroPlano && l.planoContasId !== Number(filtroPlano)) return false;
      if (q) {
        const alvo = `${l.pessoa ?? ""} ${l.descricao}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [linhasComSaldo, dataIni, dataFim, verTudo, filtroTipo, filtroSituacao, filtroPlano, busca]);

  const totaisPeriodo = useMemo(() => {
    const ent = visiveis.filter(l => l.tipo === "Entrada").reduce((a, l) => a + l.valor, 0);
    const sai = visiveis.filter(l => l.tipo === "Saída").reduce((a, l) => a + l.valor, 0);
    return { ent, sai };
  }, [visiveis]);

  const menorSaldo = useMemo(() => {
    if (visiveis.length === 0) return null;
    return visiveis.reduce((min, l) => (l.saldoAcumulado < min.saldoAcumulado ? l : min), visiveis[0]);
  }, [visiveis]);

  function abrirEdicao(l: Linha) {
    setEditando(l.key);
    setEdicao({ data: l.data, valor: l.valor, motivo: "", salvando: false });
  }
  function cancelarEdicao() { setEditando(null); }

  async function salvarEdicao(l: Linha) {
    if (!(edicao.valor > 0)) { toast("Valor precisa ser maior que zero", "err"); return; }
    setEdicao(e => ({ ...e, salvando: true }));

    let ok = false;
    if (l.origem === "baixa") {
      if (!edicao.motivo.trim()) { toast("Informe o motivo da correção", "err"); setEdicao(e => ({ ...e, salvando: false })); return; }
      ok = await editarBaixa({ baixaId: l.baixaId!, data: edicao.data, valor: edicao.valor, motivo: edicao.motivo.trim() });
    } else if (l.origem === "pago-legado") {
      ok = await editarLancamento({ id: l.lancamentoId!, updates: { dt_pagamento: edicao.data, valor: edicao.valor } });
      if (ok && l.tipo === "Entrada" && l.pedidoId) await recalcularRecebido(l.pedidoId);
    } else if (l.origem === "pendente") {
      // Com baixa parcial já registrada, `l.valor` é o SALDO (não o total do
      // lançamento) e o campo fica bloqueado na UI — nunca manda esse valor
      // pro update, senão sobrescreve o total do lançamento com o saldo.
      const mudouData = edicao.data !== l.data;
      const precisaMotivo = !!l.temBaixaAtiva && mudouData;
      if (precisaMotivo && !edicao.motivo.trim()) { toast("Título com pagamento parcial — informe o motivo da renegociação", "err"); setEdicao(e => ({ ...e, salvando: false })); return; }
      const updates: Record<string, unknown> = { vencimento: edicao.data };
      if (!l.temBaixaAtiva) updates.valor = edicao.valor;
      ok = await editarLancamento({
        id: l.lancamentoId!,
        updates,
        motivoRenegociacao: precisaMotivo ? edicao.motivo.trim() : undefined,
      });
    }

    setEdicao(e => ({ ...e, salvando: false }));
    if (ok) { toast("✓ Atualizado"); setEditando(null); load(); }
    else toast("Erro ao salvar — confira os dados", "err");
  }

  function handleExportar() {
    exportarExcel(`FluxoCaixa_UrbanGlass_${dataIni}_a_${dataFim}`,
      ["Data", "Cliente/Fornecedor", "Descrição", "Pedido/Documento", "Situação", "Valor", "Saldo"],
      visiveis.map(l => [
        formatDate(l.data), l.pessoa ?? "", l.descricao, l.pedidoId ?? l.documento ?? "",
        situacaoLabel(l), l.tipo === "Saída" ? -l.valor : l.valor, l.saldoAcumulado,
      ])
    );
  }

  const filtrosAtivos = (filtroTipo !== "Todos" ? 1 : 0) + (filtroSituacao !== "Todos" ? 1 : 0) + (filtroPlano ? 1 : 0) + (busca ? 1 : 0);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Fluxo de Caixa</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn bg sm" onClick={() => router.push("/contas-receber?novo=1")}>+ A Receber</button>
          <button className="btn bg sm" onClick={() => router.push("/contas-pagar?novo=1")}>+ A Pagar</button>
          <button className="btn bg sm" onClick={handleExportar}>⇩ Exportar</button>
        </div>
      </div>

      {/* Teste visual: fundo neutro frio (cinza-azulado) no lugar do bege
          quente padrão do tema claro — só nesta página, só no claro, pra
          o usuário decidir se estende pro resto do sistema. */}
      <div className="con" style={theme === "light" ? { background: "#eef1f6" } : undefined}>

        {/* KPIs — primeira coisa visível na página, antes de qualquer filtro */}
        <div className="g4" style={{ marginBottom: "16px" }}>
          <div className="kpi">
            <div className="kpi-l">Caixa Atual</div>
            <div className="kpi-v" style={{ color: saldoAtual >= 0 ? "var(--ok)" : "var(--err)" }}>{formatBRL(saldoAtual)}</div>
            <div className="kpi-s">Saldo real agora, em todas as contas</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Menor Saldo no Período</div>
            <div className="kpi-v" style={{ color: menorSaldo && menorSaldo.saldoAcumulado < 0 ? "var(--err)" : "var(--acc)" }}>
              {menorSaldo ? formatBRL(menorSaldo.saldoAcumulado) : "—"}
            </div>
            <div className="kpi-s">{menorSaldo ? `Em ${formatDate(menorSaldo.data)}` : "Sem movimentações no período"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Entradas no Período</div>
            <div className="kpi-v" style={{ color: "var(--ok)" }}>{formatBRL(totaisPeriodo.ent)}</div>
            <div className="kpi-s">{visiveis.filter(l => l.tipo === "Entrada").length} lançamento(s)</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Saídas no Período</div>
            <div className="kpi-v" style={{ color: "var(--err)" }}>{formatBRL(totaisPeriodo.sai)}</div>
            <div className="kpi-s">{visiveis.filter(l => l.tipo === "Saída").length} lançamento(s)</div>
          </div>
        </div>

        {/* Filtro de período — estilo extrato */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "9px 12px" }}>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {ATALHOS.map(a => {
              const [ai, af] = a.get();
              const ativo = !verTudo && ai === dataIni && af === dataFim;
              return (
                <button key={a.label} className={ativo ? "btn bp xs" : "btn bg xs"}
                  onClick={() => setPeriodo(ai, af)}>
                  {a.label}
                </button>
              );
            })}
            <button className={verTudo ? "btn bp xs" : "btn bg xs"} onClick={() => setVerTudo(true)}>
              Ver tudo
            </button>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginLeft: "auto" }}>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>De</span>
            <DateInput value={dataIni} onChange={v => setPeriodo(v, dataFim)} style={inputXs} />
            <span style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Até</span>
            <DateInput value={dataFim} onChange={v => setPeriodo(dataIni, v)} style={inputXs} />
            <button className={filtrosAbertos ? "btn bp xs" : "btn bg xs"} onClick={() => setFiltrosAbertos(v => !v)}>
              ⚙ Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ""}
            </button>
          </div>
        </div>

        {/* Filtros extras — vieram de Movimentações, escondidos por padrão */}
        {filtrosAbertos && (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "9px 12px" }}>
          <select name="filtro_tipo" className="fc" style={inputSelXs} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as typeof filtroTipo)}>
            <option value="Todos">Todos os tipos</option>
            <option value="Entrada">↑ Entrada</option>
            <option value="Saída">↓ Saída</option>
          </select>
          <select name="filtro_situacao" className="fc" style={inputSelXs} value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as typeof filtroSituacao)}>
            <option value="Todos">Todas as situações</option>
            {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="filtro_plano" className="fc" style={{ ...inputSelXs, width: "200px" }} value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)}>
            <option value="">Todos os planos de contas</option>
            {planos.map(p => <option key={p.id} value={p.id}>{p.codigo_estruturado} · {p.descricao}</option>)}
          </select>
          <input name="busca" className="fc" style={{ ...inputSelXs, width: "220px" }} placeholder="Buscar cliente, fornecedor ou descrição..."
            value={busca} onChange={e => setBusca(e.target.value)} />
          {(filtroTipo !== "Todos" || filtroSituacao !== "Todos" || filtroPlano || busca) && (
            <button className="btn bg xs" onClick={() => { setFiltroTipo("Todos"); setFiltroSituacao("Todos"); setFiltroPlano(""); setBusca(""); }}>
              ✕ Limpar
            </button>
          )}
        </div>
        )}

        {loading ? <div className="loading">Carregando...</div> : (
          <div className="tw">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thS}>Data</th>
                  <th style={thS}>Cliente / Fornecedor</th>
                  <th style={thS}>Pedido / Documento</th>
                  <th style={thS}>Situação</th>
                  <th style={{ ...thS, textAlign: "right" }}>Valor</th>
                  <th style={{ ...thS, textAlign: "right" }}>Saldo</th>
                  <th style={{ ...thS, width: "70px" }}></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--t3)", padding: "40px" }}>Nenhuma movimentação no período.</td></tr>
                )}
                {visiveis.map(l => {
                  const isHoje = l.data === hojeISO();
                  const isMenor = menorSaldo?.key === l.key;
                  const editavel = l.origem !== "recorrencia-futura";
                  const emEdicao = editando === l.key;
                  return (
                    <Fragment key={l.key}>
                      <tr style={{
                        background: isMenor ? "rgba(185,58,58,.06)" : isHoje ? "rgba(0,200,255,.05)" : "transparent",
                        borderBottom: "1px solid var(--b1)",
                      }}>
                        <td style={{ padding: "8px 10px", fontSize: "12px", whiteSpace: "nowrap" }}>
                          {formatDate(l.data)}
                          {isHoje && <span style={{ fontSize: "9px", color: "var(--acc)", marginLeft: "5px" }}>● hoje</span>}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{l.pessoa ?? <span style={{ color: "var(--t3)" }}>—</span>}</div>
                          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>{l.descricao}</div>
                        </td>
                        <td className="mono" style={{ padding: "8px 10px", fontSize: "11px", color: "var(--acc)" }}>
                          {l.pedidoId
                            ? <span style={{ fontWeight: 700 }}>{l.pedidoId}</span>
                            : l.documento
                              ? <span style={{ color: "var(--t2)" }}>{l.documento}</span>
                              : <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 10px" }}><span className={`chip ${situacaoClasse(l)}`}>{situacaoLabel(l)}</span></td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: 700, color: l.tipo === "Entrada" ? "var(--ok)" : "var(--err)" }}>
                          {l.tipo === "Saída" && "−"}{formatBRL(l.valor)}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: 700, color: l.saldoAcumulado >= 0 ? "var(--t1)" : "var(--err)" }}>
                          {formatBRL(l.saldoAcumulado)}
                          {isMenor && <span style={{ fontSize: "9px", color: "var(--err)", marginLeft: "4px" }}>◀ menor</span>}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          {editavel ? (
                            <button className="btn bg xs" onClick={() => (emEdicao ? cancelarEdicao() : abrirEdicao(l))}>
                              {emEdicao ? "✕" : "✎"}
                            </button>
                          ) : (
                            <a href="/recorrencias" style={{ fontSize: "10px", color: "var(--t3)", textDecoration: "none" }} title="Gerar essa ocorrência em Recorrências">↗</a>
                          )}
                        </td>
                      </tr>
                      {emEdicao && (
                        <tr style={{ background: "var(--surf2)", borderBottom: "1px solid var(--b1)" }}>
                          <td colSpan={7} style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
                              <div>
                                <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>
                                  {l.origem === "pendente" ? "Vencimento" : "Data"}
                                </div>
                                <DateInput value={edicao.data} onChange={v => setEdicao(e => ({ ...e, data: v }))} style={{ margin: 0, width: "130px" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>Valor</div>
                                {l.origem === "pendente" && l.temBaixaAtiva ? (
                                  <div style={{ padding: "8px 11px", fontSize: "13px", color: "var(--t3)" }} title="Título com pagamento parcial — ajuste o valor em Contas a Pagar/Receber">
                                    {formatBRL(l.valor)} (parcial, não editável aqui)
                                  </div>
                                ) : (
                                  <CurrencyInput value={edicao.valor} onChange={v => setEdicao(e => ({ ...e, valor: v }))} style={{ margin: 0, width: "140px" }} />
                                )}
                              </div>
                              {(l.origem === "baixa" || (l.origem === "pendente" && l.temBaixaAtiva)) && (
                                <div style={{ flex: 1, minWidth: "220px" }}>
                                  <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>
                                    Motivo da correção *
                                  </div>
                                  <input name="edicao_motivo" className="fc" style={{ margin: 0 }} placeholder="Por que está corrigindo esse lançamento?"
                                    value={edicao.motivo} onChange={e => setEdicao(ed => ({ ...ed, motivo: e.target.value }))} />
                                </div>
                              )}
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button className="btn bg sm" onClick={cancelarEdicao} disabled={edicao.salvando}>Cancelar</button>
                                <button className="btn bp sm" onClick={() => salvarEdicao(l)} disabled={edicao.salvando}>
                                  {edicao.salvando ? "Salvando..." : "Salvar"}
                                </button>
                              </div>
                            </div>
                            <div style={{ fontSize: "10.5px", color: "var(--t3)", marginTop: "8px" }}>
                              A alteração é feita no lançamento de verdade — atualiza sozinho em Contas a {l.tipo === "Entrada" ? "Receber" : "Pagar"}
                              {l.pedidoId ? `, no Pedido ${l.pedidoId}` : ""}.
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: "16px", display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap", fontSize: "11px", color: "var(--t3)" }}>
          <span><span className="chip cg">Realizado</span> já entrou ou saiu do caixa</span>
          <span><span className="chip cb">Previsto</span> vencimento ainda não chegou</span>
          <span><span className="chip cr">Vencido</span> passou do vencimento e não foi pago</span>
          <span><span className="chip cgr">Recorrência</span> ainda não virou lançamento — gere em /recorrencias</span>
        </div>

      </div>
    </AppLayout>
  );
}

function situacaoLabel(l: LinhaBase): string {
  if (l.origem === "baixa" || l.origem === "pago-legado") return "Realizado";
  if (l.origem === "recorrencia-futura") return "Recorrência";
  return l.data < hojeISO() ? "Vencido" : "Previsto";
}

function situacaoClasse(l: LinhaBase): string {
  if (l.origem === "baixa" || l.origem === "pago-legado") return "cg";
  if (l.origem === "recorrencia-futura") return "cgr";
  return l.data < hojeISO() ? "cr" : "cb";
}

const thS: React.CSSProperties = {
  padding: "7px 10px", fontSize: "9px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t3)",
  borderBottom: "1px solid var(--b1)", textAlign: "left", background: "var(--surf2)",
};

// Mesma altura visual dos botões .xs do filtro, pra "De"/"Até" não
// ficarem maiores que os atalhos ao lado.
const inputXs: React.CSSProperties = { margin: 0, width: "108px", padding: "3px 8px", fontSize: "11px" };
const inputSelXs: React.CSSProperties = { margin: 0, padding: "4px 8px", fontSize: "11px" };
