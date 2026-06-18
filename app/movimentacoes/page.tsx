"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import SearchInput from "@/components/ui/SearchInput";

interface PlanoContasMin { id: number; codigo_estruturado: string; descricao: string }
interface ClienteMin    { id: number; nome: string }

interface Mov {
  id: number;
  tipo: "Entrada" | "Saída";
  descricao: string;
  valor: number;
  vencimento: string | null;
  dt_emissao: string | null;
  dt_pagamento: string | null;
  conta: string | null;
  forma_pgto: string | null;
  pedido_id: string | null;
  cliente_id: number | null;
  documento: string | null;
  fornecedor: string | null;
  obs: string | null;
  plano_contas_id: number | null;
  created_at: string;
  plano_contas: PlanoContasMin | null;
  clientes: ClienteMin | null;
}

type TipoDate = "pagamento" | "vencimento" | "emissao";
type FiltroTipo = "Todos" | "Entrada" | "Saída";
type FiltroStatus = "Todos" | "Quitado" | "Em aberto" | "Vencido";

function getStatusEfetivo(m: Mov): "Quitado" | "Em aberto" | "Vencido" {
  if (m.dt_pagamento) return "Quitado";
  const hoje = new Date().toISOString().split("T")[0];
  if (m.vencimento && m.vencimento < hoje) return "Vencido";
  return "Em aberto";
}

function dataEfetiva(m: Mov, tipo: TipoDate): string | null {
  if (tipo === "pagamento") return m.dt_pagamento;
  if (tipo === "vencimento") return m.vencimento;
  return m.dt_emissao;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

const BRL = (v: number) => formatBRL(v);

const STATUS_COLOR: Record<string, string> = {
  Quitado:    "var(--ok)",
  "Em aberto": "#60a5fa",
  Vencido:    "var(--err)",
};

export default function MovimentacoesPage() {
  const [movs, setMovs]               = useState<Mov[]>([]);
  const [loading, setLoading]         = useState(true);
  const [planos, setPlanos]           = useState<PlanoContasMin[]>([]);

  // filtros
  const [tipoDate, setTipoDate]       = useState<TipoDate>("pagamento");
  const [dataIni, setDataIni]         = useState("");
  const [dataFim, setDataFim]         = useState("");
  const [filtroTipo, setFiltroTipo]   = useState<FiltroTipo>("Todos");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("Todos");
  const [filtroPlano, setFiltroPlano] = useState("");
  const [filtroConta, setFiltroConta] = useState("");
  const [filtroPessoa, setFiltroPessoa] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: movData }, { data: planoData }] = await Promise.all([
      supabase
        .from("lancamentos")
        .select(`id, tipo, descricao, valor, vencimento, dt_emissao, dt_pagamento,
                 conta, forma_pgto, pedido_id, cliente_id, documento, fornecedor, obs,
                 plano_contas_id, created_at,
                 plano_contas(id, codigo_estruturado, descricao),
                 clientes(id, nome)`)
        .order("created_at", { ascending: false }),
      supabase
        .from("plano_contas")
        .select("id, codigo_estruturado, descricao")
        .order("codigo_estruturado"),
    ]);
    setMovs((movData ?? []) as unknown as Mov[]);
    setPlanos((planoData ?? []) as unknown as PlanoContasMin[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // contas únicas
  const contasUnicas = useMemo(() => {
    const s = new Set<string>();
    movs.forEach(m => { if (m.conta) s.add(m.conta); });
    return [...s].sort();
  }, [movs]);

  // filtragem
  const filtered = useMemo(() => {
    return movs.filter(m => {
      if (filtroTipo !== "Todos" && m.tipo !== filtroTipo) return false;

      const st = getStatusEfetivo(m);
      if (filtroStatus !== "Todos" && st !== filtroStatus) return false;

      if (filtroPlano && m.plano_contas_id !== Number(filtroPlano)) return false;
      if (filtroConta && m.conta !== filtroConta) return false;

      if (filtroPessoa) {
        const q = filtroPessoa.toLowerCase();
        const nome = m.clientes?.nome?.toLowerCase() ?? "";
        const forn = m.fornecedor?.toLowerCase() ?? "";
        const desc = m.descricao?.toLowerCase() ?? "";
        if (!nome.includes(q) && !forn.includes(q) && !desc.includes(q)) return false;
      }

      const dataMov = dataEfetiva(m, tipoDate);
      if (dataIni && (!dataMov || dataMov < dataIni)) return false;
      if (dataFim && (!dataMov || dataMov > dataFim)) return false;

      return true;
    });
  }, [movs, filtroTipo, filtroStatus, filtroPlano, filtroConta, filtroPessoa, tipoDate, dataIni, dataFim]);

  // totais
  const totais = useMemo(() => {
    const ent = filtered.filter(m => m.tipo === "Entrada").reduce((s, m) => s + Number(m.valor), 0);
    const sai = filtered.filter(m => m.tipo === "Saída").reduce((s, m) => s + Number(m.valor), 0);
    return { ent, sai, saldo: ent - sai, total: filtered.length };
  }, [filtered]);

  const vencidos = useMemo(() => movs.filter(m => getStatusEfetivo(m) === "Vencido").length, [movs]);

  function limparFiltros() {
    setTipoDate("pagamento"); setDataIni(""); setDataFim("");
    setFiltroTipo("Todos"); setFiltroStatus("Todos");
    setFiltroPlano(""); setFiltroConta(""); setFiltroPessoa("");
  }

  const fc: React.CSSProperties = { margin: 0, fontSize: "12px" };
  const thS: React.CSSProperties = {
    padding: "7px 10px", fontSize: "9px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t3)",
    borderBottom: "1px solid var(--b1)", textAlign: "left", background: "var(--surf2)",
    whiteSpace: "nowrap",
  };

  function Badge({ label, color }: { label: string; color: string }) {
    return (
      <span style={{
        display: "inline-block", padding: "2px 8px", borderRadius: "20px", fontSize: "10px",
        fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}40`,
        whiteSpace: "nowrap",
      }}>{label}</span>
    );
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Movimentações Financeiras</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {vencidos > 0 && (
            <span style={{ fontSize: "11px", background: "var(--err)18", color: "var(--err)", border: "1px solid var(--err)40", borderRadius: "20px", padding: "3px 10px", fontWeight: 700 }}>
              {vencidos} vencido{vencidos > 1 ? "s" : ""}
            </span>
          )}
          <button className="btn-sec" onClick={load}>↺ Atualizar</button>
        </div>
      </div>

      <div className="con">

        {/* ── Filtros ── */}
        <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr auto auto", gap: "10px", alignItems: "flex-end", marginBottom: "10px" }}>
            <div>
              <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>Filtrar por data</div>
              <select className="fc" style={fc} value={tipoDate} onChange={e => setTipoDate(e.target.value as TipoDate)}>
                <option value="pagamento">Data de Pagamento</option>
                <option value="vencimento">Data de Vencimento</option>
                <option value="emissao">Data de Emissão</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>De</div>
              <input type="date" className="fc" style={fc} value={dataIni} onChange={e => setDataIni(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>Até</div>
              <input type="date" className="fc" style={fc} value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>Conta Bancária</div>
              <select className="fc" style={fc} value={filtroConta} onChange={e => setFiltroConta(e.target.value)}>
                <option value="">Todas</option>
                {contasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ paddingBottom: "1px" }}>
              <button className="btn-sec" onClick={limparFiltros} style={{ fontSize: "11px", padding: "5px 12px" }}>✕ Limpar</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>Plano de Contas</div>
              <select className="fc" style={fc} value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)}>
                <option value="">Todos os planos</option>
                {planos.map(p => <option key={p.id} value={p.id}>{p.codigo_estruturado} — {p.descricao}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>Pessoa / Fornecedor / Descrição</div>
              <SearchInput icon={false} className="fc" inputStyle={fc} placeholder="Buscar..." value={filtroPessoa} onChange={setFiltroPessoa} />
            </div>
            <div style={{ display: "flex", gap: "6px", paddingBottom: "1px" }}>
              <select className="fc" style={{ ...fc, minWidth: "120px" }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as FiltroStatus)}>
                <option value="Todos">Todos os status</option>
                <option value="Quitado">Quitado</option>
                <option value="Em aberto">Em aberto</option>
                <option value="Vencido">Vencido</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Tabs de Tipo ── */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "14px" }}>
          {(["Todos", "Entrada", "Saída"] as FiltroTipo[]).map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              style={{
                padding: "5px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: 700,
                border: filtroTipo === t ? "none" : "1px solid var(--b1)",
                background: filtroTipo === t
                  ? t === "Entrada" ? "var(--ok)" : t === "Saída" ? "var(--err)" : "var(--acc)"
                  : "var(--surf1)",
                color: filtroTipo === t ? "#000" : "var(--t2)",
                cursor: "pointer", transition: "0.12s",
              }}
            >
              {t === "Todos" ? `Todos (${movs.length})` : t === "Entrada"
                ? `↑ Entradas (${movs.filter(m => m.tipo === "Entrada").length})`
                : `↓ Saídas (${movs.filter(m => m.tipo === "Saída").length})`}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--t3)" }}>
            {filtered.length !== movs.length && (
              <span style={{ color: "var(--acc)", fontWeight: 700 }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        {/* ── Cards de resumo ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "16px" }}>
          {[
            { label: "Total Movimentos",  val: totais.total,  isMoney: false, cor: "var(--t1)" },
            { label: "Total Entradas",    val: totais.ent,    isMoney: true,  cor: "var(--ok)" },
            { label: "Total Saídas",      val: totais.sai,    isMoney: true,  cor: "var(--err)" },
            { label: "Saldo do Período",  val: totais.saldo,  isMoney: true,  cor: totais.saldo >= 0 ? "var(--ok)" : "var(--err)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "5px" }}>{s.label}</div>
              <div style={{ fontSize: s.isMoney ? "15px" : "22px", fontWeight: 800, color: s.cor, fontFamily: s.isMoney ? "'DM Mono', monospace" : undefined }}>
                {s.isMoney ? BRL(s.val as number) : s.val}
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabela ── */}
        {loading ? <div className="loading">Carregando...</div> : (
          <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thS}>Tipo</th>
                    <th style={thS}>Data</th>
                    <th style={thS}>Documento</th>
                    <th style={thS}>Plano de Contas</th>
                    <th style={{ ...thS, minWidth: "200px" }}>Descrição / Origem</th>
                    <th style={thS}>Pessoa</th>
                    <th style={thS}>Conta</th>
                    <th style={{ ...thS, textAlign: "right" }}>Valor</th>
                    <th style={thS}>Vencimento</th>
                    <th style={thS}>Pagamento</th>
                    <th style={thS}>Status</th>
                    <th style={{ ...thS, textAlign: "center" }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={12} style={{ padding: "32px", textAlign: "center", color: "var(--t3)", fontSize: "13px" }}>Nenhuma movimentação encontrada</td></tr>
                  ) : filtered.map((m, i) => {
                    const st = getStatusEfetivo(m);
                    const isVenc = st === "Vencido";
                    const pessoa = m.clientes?.nome ?? m.fornecedor ?? "—";
                    return (
                      <tr key={m.id} style={{ background: i % 2 === 0 ? "transparent" : "var(--surf2)", borderBottom: "1px solid var(--b1)" }}>

                        {/* Tipo */}
                        <td style={{ padding: "8px 10px" }}>
                          <Badge
                            label={m.tipo === "Entrada" ? "↑ Entrada" : "↓ Saída"}
                            color={m.tipo === "Entrada" ? "var(--ok)" : "var(--err)"}
                          />
                        </td>

                        {/* Data efetiva pelo filtro */}
                        <td style={{ padding: "8px 10px", fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
                          {fmtDate(dataEfetiva(m, tipoDate))}
                        </td>

                        {/* Documento */}
                        <td style={{ padding: "8px 10px", fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>
                          {m.pedido_id
                            ? <span style={{ color: "var(--acc)", fontWeight: 700 }}>#{m.pedido_id}</span>
                            : m.documento ?? "—"}
                        </td>

                        {/* Plano de Contas */}
                        <td style={{ padding: "8px 10px", fontSize: "11px", color: "var(--t2)", whiteSpace: "nowrap" }}>
                          {m.plano_contas ? (
                            <>
                              <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--acc)", fontWeight: 700, fontSize: "10px" }}>{m.plano_contas.codigo_estruturado}</span>
                              <span style={{ color: "var(--t3)", marginLeft: "5px" }}>{m.plano_contas.descricao}</span>
                            </>
                          ) : <span style={{ color: "var(--t3)" }}>—</span>}
                        </td>

                        {/* Descrição */}
                        <td style={{ padding: "8px 10px", fontSize: "12px", color: "var(--t1)", maxWidth: "220px" }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.descricao}>{m.descricao}</div>
                          {m.obs && <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.obs}>{m.obs}</div>}
                        </td>

                        {/* Pessoa */}
                        <td style={{ padding: "8px 10px", fontSize: "12px", color: "var(--t2)", whiteSpace: "nowrap", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {pessoa}
                        </td>

                        {/* Conta */}
                        <td style={{ padding: "8px 10px", fontSize: "11px", color: "var(--t3)", whiteSpace: "nowrap" }}>
                          {m.conta ?? "—"}
                          {m.forma_pgto && <div style={{ fontSize: "9px", color: "var(--t3)" }}>{m.forma_pgto}</div>}
                        </td>

                        {/* Valor */}
                        <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{
                            fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: "13px",
                            color: m.tipo === "Entrada" ? "var(--ok)" : "var(--err)",
                          }}>
                            {m.tipo === "Saída" && "−"}{BRL(Number(m.valor))}
                          </span>
                        </td>

                        {/* Vencimento */}
                        <td style={{ padding: "8px 10px", fontSize: "11px", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap", color: isVenc ? "var(--err)" : "var(--t3)" }}>
                          {fmtDate(m.vencimento)}
                          {isVenc && <span style={{ fontSize: "8px", marginLeft: "3px" }}>●</span>}
                        </td>

                        {/* Pagamento */}
                        <td style={{ padding: "8px 10px", fontSize: "11px", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap", color: m.dt_pagamento ? "var(--ok)" : "var(--t3)" }}>
                          {fmtDate(m.dt_pagamento)}
                        </td>

                        {/* Status */}
                        <td style={{ padding: "8px 10px" }}>
                          <Badge label={st} color={STATUS_COLOR[st]} />
                        </td>

                        {/* Ação */}
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          <a
                            href={m.tipo === "Entrada" ? "/contas-receber" : "/contas-pagar"}
                            style={{
                              fontSize: "10px", color: "var(--t3)", textDecoration: "none",
                              border: "1px solid var(--b1)", borderRadius: "5px", padding: "2px 8px",
                              display: "inline-block", transition: "0.1s",
                            }}
                            title="Abrir no módulo"
                          >
                            ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Rodapé com totais */}
            {filtered.length > 0 && (
              <div style={{
                display: "flex", justifyContent: "flex-end", gap: "24px", alignItems: "center",
                padding: "10px 14px", borderTop: "2px solid var(--b1)", background: "var(--surf2)",
              }}>
                <span style={{ fontSize: "11px", color: "var(--t3)" }}>{filtered.length} registro{filtered.length !== 1 ? "s" : ""}</span>
                <span style={{ fontSize: "11px", color: "var(--t3)" }}>
                  Entradas: <span style={{ color: "var(--ok)", fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>{BRL(totais.ent)}</span>
                </span>
                <span style={{ fontSize: "11px", color: "var(--t3)" }}>
                  Saídas: <span style={{ color: "var(--err)", fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>{BRL(totais.sai)}</span>
                </span>
                <span style={{ fontSize: "12px", color: "var(--t2)", fontWeight: 700 }}>
                  Saldo: <span style={{ color: totais.saldo >= 0 ? "var(--ok)" : "var(--err)", fontFamily: "'DM Mono',monospace", fontSize: "14px", fontWeight: 800 }}>
                    {BRL(totais.saldo)}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
