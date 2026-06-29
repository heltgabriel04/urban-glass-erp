"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  getLinhas, getConfigTempo, getProgramacao, getPedidosSemProgramacao,
  criarProgramacaoPedido, reagendar, atualizarStatusProgramacao, deletarProgramacao,
  calcularTempoEstimado, formatarDuracao, getMetricasProducao,
  addDays, getMonday, diffDays, toISOLocal,
} from "@/services/programacao.service";
import type {
  ProducaoLinha, ConfigTempoProducao, ProgramacaoProducao, Pedido, TempoEstimado,
} from "@/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { DndContext, useDraggable, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// ─── CONSTANTES ───────────────────────────────────────────────

const COL_W: Record<string, number> = { dia: 100, semana: 144, mes: 52 };
const ROW_H  = 104;
const LABEL_W = 188;

const COR_STATUS: Record<string, string> = {
  "Aguardando otimização":   "#f59e0b",
  "Em Produção – Corte":     "#3dffa0",
  "Qualidade (Corte)":       "#00c8ff",
  "Em Produção – Lapidação": "#3dffa0",
  "Qualidade (Lapidação)":   "#00c8ff",
  "Separação":               "#a78bfa",
  "Finalizado":              "#10b981",
};

// ─── UTILITÁRIOS ──────────────────────────────────────────────

function formatDate(d: Date, short = false): string {
  if (short) return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function corBloco(prog: ProgramacaoProducao): string {
  if (prog.status === "Concluído")   return "#1e1e2e";
  if (prog.status === "Em Execução") return "#0f2a1a";
  const prazo = prog.pedidos?.dt_retirada ? new Date(prog.pedidos.dt_retirada) : null;
  const fim   = prog.dt_fim_previsto      ? new Date(prog.dt_fim_previsto)      : null;
  if (!prazo || !fim) return "#0d1b30";
  const diff = diffDays(prazo, fim);
  if (diff < 0)  return "#2d0f18";
  if (diff <= 2) return "#2d1f08";
  return "#081e14";
}

function bordaBloco(prog: ProgramacaoProducao): string {
  if (prog.status === "Concluído")   return "#4a4a6a";
  if (prog.status === "Em Execução") return "#3dffa0";
  const prazo = prog.pedidos?.dt_retirada ? new Date(prog.pedidos.dt_retirada) : null;
  const fim   = prog.dt_fim_previsto      ? new Date(prog.dt_fim_previsto)      : null;
  if (!prazo || !fim) return "#00c8ff";
  const diff = diffDays(prazo, fim);
  if (diff < 0)  return "#f43f5e";
  if (diff <= 2) return "#f59e0b";
  return "#3dffa0";
}

function diasVisiveis(zoom: string, base: Date): Date[] {
  if (zoom === "dia") return [new Date(base)];
  if (zoom === "semana") return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  const firstDay = new Date(base.getFullYear(), base.getMonth(), 1);
  const lastDay  = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return Array.from({ length: lastDay.getDate() }, (_, i) => addDays(firstDay, i));
}

function horasVisiveis(): number[] {
  return Array.from({ length: 9 }, (_, i) => i + 8);
}

function blocoLeft(prog: ProgramacaoProducao, zoom: string, visibleStart: Date): number {
  if (!prog.dt_inicio_previsto) return 0;
  const inicio = new Date(prog.dt_inicio_previsto);
  if (zoom === "dia") {
    const h = inicio.getHours() - 8;
    return Math.max(0, h) * COL_W[zoom];
  }
  const dias = diffDays(inicio, visibleStart);
  return Math.max(0, dias) * COL_W[zoom];
}

function blocoWidth(prog: ProgramacaoProducao, zoom: string): number {
  const dur = prog.duracao_estimada_min ?? 60;
  const cw  = COL_W[zoom];
  if (zoom === "dia") return Math.max(cw * 0.9, (dur / 60) * cw);
  const dias = Math.max(0.5, dur / 480);
  return Math.max(cw * 0.85, dias * cw - 4);
}

// ─── COMPONENTE BLOCO (DRAGGABLE) ────────────────────────────

function BlocoProducao({
  prog, zoom, visibleStart, onClick,
}: {
  prog: ProgramacaoProducao; zoom: string; visibleStart: Date;
  onClick: (p: ProgramacaoProducao) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: prog.id, data: { prog },
  });

  const left  = blocoLeft(prog, zoom, visibleStart);
  const width = blocoWidth(prog, zoom);
  const borda = bordaBloco(prog);
  const bg    = corBloco(prog);

  const style: React.CSSProperties = {
    position: "absolute",
    left, top: 6, width,
    height: ROW_H - 16,
    background: bg,
    border: `1.5px solid ${borda}`,
    borderRadius: 8,
    padding: "6px 9px",
    cursor: isDragging ? "grabbing" : "grab",
    userSelect: "none",
    zIndex: isDragging ? 50 : 2,
    opacity: isDragging ? 0.7 : 1,
    transform: CSS.Translate.toString(transform),
    overflow: "hidden",
    transition: isDragging ? "none" : "box-shadow 0.15s",
    boxSizing: "border-box",
  };

  const itens = prog.pedidos?.itens_pedido ?? [];
  const pecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const prazo = prog.pedidos?.dt_retirada
    ? new Date(prog.pedidos.dt_retirada).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "—";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick(prog); }}
    >
      {/* ID do pedido */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: borda, lineHeight: 1.2,
        marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {prog.pedido_id}
      </div>

      {/* Cliente */}
      {width > 72 && (
        <div style={{
          fontSize: 10, color: "var(--t1)", marginBottom: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {prog.pedidos?.clientes?.nome ?? "—"}
        </div>
      )}

      {/* Detalhes (m², peças, prazo) */}
      {width > 100 && (
        <div style={{
          fontSize: 10, color: "var(--t2)", display: "flex", gap: 6,
          flexWrap: "nowrap", overflow: "hidden",
        }}>
          <span>{prog.pedidos?.m2_total?.toFixed(1)}m²</span>
          <span>·</span>
          <span>{pecas}pç</span>
          <span>·</span>
          <span>↗{prazo}</span>
        </div>
      )}

      {/* Duração */}
      {width > 100 && (
        <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>
          {formatarDuracao(prog.duracao_estimada_min ?? 0)} · {prog.etapa}
        </div>
      )}
    </div>
  );
}

// ─── MODAL DE AGENDAMENTO ────────────────────────────────────

function ModalAgendar({
  pedido, linhas, config, onConfirmar, onFechar,
}: {
  pedido: Pedido; linhas: ProducaoLinha[]; config: ConfigTempoProducao[];
  onConfirmar: (dtInicio: Date, linhaCorteId: number, linhaLapId: number | undefined) => Promise<void>;
  onFechar: () => void;
}) {
  const linhasCorte = linhas.filter(l => l.tipo === "Corte");
  const linhasLap   = linhas.filter(l => l.tipo === "Lapidação");
  const semTabelas  = linhas.length === 0;
  const semConfig   = config.length === 0;

  const amanhaBR = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  })();

  const [dtDisplay,    setDtDisplay]    = useState(amanhaBR);
  const [linhaCorteId, setLinhaCorteId] = useState<number>(linhasCorte[0]?.id ?? 0);
  const [linhaLapId,   setLinhaLapId]   = useState<number | undefined>(linhasLap[0]?.id);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState("");

  useEffect(() => {
    if (linhasCorte.length > 0 && !linhaCorteId) setLinhaCorteId(linhasCorte[0].id);
  }, [linhas]);

  const itens = (pedido.itens_pedido ?? []) as { m2: number; quantidade: number; lapidacao: number; produto_nome: string; }[];
  const tempos: TempoEstimado = calcularTempoEstimado(itens, config);

  function maskData(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  }

  function parseBR(masked: string): Date | null {
    const parts = masked.split("/");
    if (parts.length !== 3 || parts[2].length < 4) return null;
    const [dd, mm, yyyy] = parts.map(Number);
    if (!dd || !mm || !yyyy || mm > 12 || dd > 31) return null;
    const d = new Date(yyyy, mm - 1, dd, 8, 0, 0);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  async function handleConfirmar() {
    setErro("");
    if (semTabelas) { setErro("Execute o script SQL no Supabase primeiro."); return; }
    const dt = parseBR(dtDisplay);
    if (!dt) { setErro("Data inválida. Use dd/mm/aaaa."); return; }
    if (!linhaCorteId) { setErro("Selecione uma linha de corte."); return; }
    setSalvando(true);
    await onConfirmar(dt, linhaCorteId, tempos.tem_lapidacao ? linhaLapId : undefined);
    setSalvando(false);
  }

  const dtValida = !!parseBR(dtDisplay);

  return (
    <div className="mov open">
      <div className="mod" style={{ width: 480 }}>
        <div className="mhd">
          <span>Agendar — Pedido {pedido.id}</span>
          <button className="btn icon" onClick={onFechar}>✕</button>
        </div>

        <div className="mbd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Aviso RLS / tabelas não encontradas */}
          {semTabelas && (
            <div style={{
              background: "rgba(244,63,94,.08)", border: "1px solid var(--err)",
              borderRadius: 10, padding: "12px 16px",
            }}>
              <div style={{ color: "var(--err)", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                ⚠ Linhas de produção não encontradas
              </div>
              <div style={{ color: "var(--t1)", fontSize: 12, lineHeight: 1.6 }}>
                Execute <strong>sql/fix-programacao-rls.sql</strong> no Supabase SQL Editor
                para desativar o RLS e garantir os dados iniciais.
              </div>
            </div>
          )}

          {/* Info do pedido */}
          <div style={{
            background: "var(--surf2)", borderRadius: 10, padding: "12px 16px",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
          }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3 }}>CLIENTE</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>
                {(pedido as any).clientes?.nome ?? "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3 }}>PEDIDO</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--acc)" }}>{pedido.id}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3 }}>ÁREA</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pedido.m2_total?.toFixed(2)} m²</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3 }}>PEÇAS</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {itens.reduce((s, i) => s + i.quantidade, 0)}
                {itens.length === 0 && (
                  <span style={{ color: "var(--warn)", fontSize: 11 }}> ⚠ itens não carregados</span>
                )}
              </div>
            </div>
          </div>

          {/* Estimativa de tempo */}
          <div style={{
            background: "var(--surf3)", borderRadius: 10, padding: "12px 16px",
            border: "1px solid var(--b2)",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "var(--acc)", marginBottom: 10,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>ESTIMATIVA DE TEMPO</span>
              {semConfig && (
                <span style={{ color: "var(--warn)", fontWeight: 400, fontSize: 10 }}>
                  ⚠ config não encontrada
                </span>
              )}
            </div>
            {semConfig ? (
              <div style={{ color: "var(--t3)", fontSize: 12 }}>
                Tabela <em>config_tempo_producao</em> não encontrada. Execute o script SQL.
              </div>
            ) : (
              <div style={{ display: "flex", gap: 0 }}>
                <div style={{ flex: 1, textAlign: "center", padding: "6px 0" }}>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 4 }}>CORTE</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>
                    {tempos.corte_min > 0 ? formatarDuracao(tempos.corte_min) : "—"}
                  </div>
                </div>
                {tempos.tem_lapidacao && (
                  <>
                    <div style={{ width: 1, background: "var(--b2)", alignSelf: "stretch", margin: "0 4px" }} />
                    <div style={{ flex: 1, textAlign: "center", padding: "6px 0" }}>
                      <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 4 }}>LAPIDAÇÃO</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--acc2)", lineHeight: 1 }}>
                        {formatarDuracao(tempos.lapidacao_min)}
                      </div>
                    </div>
                  </>
                )}
                <div style={{ width: 1, background: "var(--b2)", alignSelf: "stretch", margin: "0 4px" }} />
                <div style={{ flex: 1, textAlign: "center", padding: "6px 0" }}>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 4 }}>TOTAL</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--acc)", lineHeight: 1 }}>
                    {tempos.total_min > 0 ? formatarDuracao(tempos.total_min) : "—"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Data de início */}
          <div className="fg">
            <label className="fl" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Data de Início</span>
              {dtDisplay.length === 10 && !dtValida && (
                <span style={{ color: "var(--err)", fontSize: 11, fontWeight: 400 }}>data inválida</span>
              )}
            </label>
            <input
              className="fc"
              value={dtDisplay}
              onChange={e => setDtDisplay(maskData(e.target.value))}
              placeholder="dd/mm/aaaa"
              maxLength={10}
              inputMode="numeric"
              style={{
                borderColor: dtDisplay.length === 10 && !dtValida ? "var(--err)" : undefined,
                fontSize: 15,
              }}
            />
          </div>

          {/* Linha de corte */}
          <div className="fg">
            <label className="fl">Linha de Corte</label>
            {linhasCorte.length === 0 ? (
              <div className="fc" style={{ color: "var(--t3)", pointerEvents: "none" }}>
                Nenhuma linha configurada
              </div>
            ) : (
              <select className="fc" value={linhaCorteId} onChange={e => setLinhaCorteId(Number(e.target.value))}>
                {linhasCorte.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            )}
          </div>

          {/* Linha de lapidação */}
          {tempos.tem_lapidacao && (
            <div className="fg">
              <label className="fl">Linha de Lapidação</label>
              {linhasLap.length === 0 ? (
                <div className="fc" style={{ color: "var(--t3)", pointerEvents: "none" }}>
                  Nenhuma linha configurada
                </div>
              ) : (
                <select className="fc" value={linhaLapId ?? ""} onChange={e => setLinhaLapId(Number(e.target.value) || undefined)}>
                  <option value="">— sem lapidação —</option>
                  {linhasLap.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              )}
            </div>
          )}

          {erro && (
            <div style={{
              color: "var(--err)", fontSize: 12, fontWeight: 600,
              background: "rgba(244,63,94,.08)", borderRadius: 8, padding: "8px 12px",
            }}>
              ⚠ {erro}
            </div>
          )}
        </div>

        <div className="mft">
          <button className="btn bg" onClick={onFechar}>Cancelar</button>
          <button
            className="btn pri"
            onClick={handleConfirmar}
            disabled={salvando || semTabelas || !dtValida || !linhaCorteId}
          >
            {salvando ? "Agendando…" : "Confirmar Agendamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DETALHE DO BLOCO ───────────────────────────────────

function ModalBloco({
  prog, onFechar, onIniciar, onConcluir, onDeletar,
}: {
  prog: ProgramacaoProducao; onFechar: () => void;
  onIniciar: () => void; onConcluir: () => void; onDeletar: () => void;
}) {
  const borda = bordaBloco(prog);
  const prazo  = prog.pedidos?.dt_retirada ? new Date(prog.pedidos.dt_retirada).toLocaleDateString("pt-BR") : "—";
  const inicio = prog.dt_inicio_previsto   ? new Date(prog.dt_inicio_previsto).toLocaleDateString("pt-BR") : "—";
  const fim    = prog.dt_fim_previsto       ? new Date(prog.dt_fim_previsto).toLocaleDateString("pt-BR")   : "—";
  const inicioReal = prog.dt_inicio_real   ? new Date(prog.dt_inicio_real).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : null;
  const fimReal    = prog.dt_fim_real       ? new Date(prog.dt_fim_real).toLocaleDateString("pt-BR",    { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : null;

  const statusColor: Record<string, string> = {
    Agendado: "var(--t2)", "Em Execução": "var(--acc)", Concluído: "var(--ok)", Cancelado: "var(--err)",
  };

  return (
    <div className="mov open">
      <div className="mod" style={{ width: 480 }}>
        <div className="mhd" style={{ borderLeft: `4px solid ${borda}`, paddingLeft: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{prog.pedido_id}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>{prog.etapa}</div>
          </div>
          <button className="btn icon" onClick={onFechar}>✕</button>
        </div>

        <div className="mbd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 20,
              background: `${statusColor[prog.status] ?? "var(--t2)"}18`,
              border: `1px solid ${statusColor[prog.status] ?? "var(--b2)"}`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor[prog.status] ?? "var(--t2)" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[prog.status] ?? "var(--t1)" }}>
                {prog.status}
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--t2)" }}>{formatarDuracao(prog.duracao_estimada_min ?? 0)}</span>
          </div>

          {/* Grid de informações */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
            background: "var(--surf2)", borderRadius: 10, padding: "14px 16px",
          }}>
            <StatBloco label="Cliente"         value={prog.pedidos?.clientes?.nome ?? "—"} />
            <StatBloco label="Cidade"           value={prog.pedidos?.clientes?.cidade ?? "—"} />
            <StatBloco label="Área Total"       value={(prog.pedidos?.m2_total ?? 0).toFixed(2) + " m²"} />
            <StatBloco label="Peças"            value={String((prog.pedidos?.itens_pedido ?? []).reduce((s, i) => s + i.quantidade, 0))} />
            <StatBloco label="Início Previsto"  value={inicio} />
            <StatBloco label="Fim Previsto"     value={fim} />
            <StatBloco label="Prazo de Entrega" value={prazo} col={borda} />
            <StatBloco label="Duração Est."     value={formatarDuracao(prog.duracao_estimada_min ?? 0)} />
          </div>

          {/* Tempos reais (se disponíveis) */}
          {(inicioReal || fimReal) && (
            <div style={{
              background: "rgba(61,255,160,.06)", border: "1px solid rgba(61,255,160,.2)",
              borderRadius: 10, padding: "10px 16px",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
            }}>
              {inicioReal && <StatBloco label="Início Real" value={inicioReal} col="var(--acc)" />}
              {fimReal    && <StatBloco label="Fim Real"    value={fimReal}    col="var(--ok)"  />}
            </div>
          )}

          {/* Observação */}
          {prog.pedidos?.obs && (
            <div style={{
              fontSize: 12, color: "var(--t2)", background: "var(--surf2)",
              padding: "8px 12px", borderRadius: 8, lineHeight: 1.5,
            }}>
              {prog.pedidos.obs}
            </div>
          )}
        </div>

        <div className="mft" style={{ gap: 8 }}>
          {prog.status === "Agendado"    && (
            <button className="btn pri" onClick={onIniciar}>▶ Iniciar Produção</button>
          )}
          {prog.status === "Em Execução" && (
            <button className="btn pri" onClick={onConcluir} style={{ background: "var(--ok)", borderColor: "var(--ok)" }}>
              ✓ Marcar Concluído
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn bg" onClick={onDeletar} style={{ color: "var(--err)", borderColor: "var(--err)" }}>
              Remover
            </button>
            <button className="btn bg" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBloco({ label, value, col }: { label: string; value: string; col?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 3, fontWeight: 600 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: col ?? "var(--t1)" }}>{value}</div>
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function ProgramacaoPage() {
  const [aba,          setAba]          = useState<"gantt" | "dashboard">("gantt");
  const [zoom,         setZoom]         = useState<"dia" | "semana" | "mes">("semana");
  const [dataBase,     setDataBase]     = useState<Date>(() => getMonday(new Date()));
  const [linhas,       setLinhas]       = useState<ProducaoLinha[]>([]);
  const [config,       setConfig]       = useState<ConfigTempoProducao[]>([]);
  const [programacoes, setProg]         = useState<ProgramacaoProducao[]>([]);
  const [semProg,      setSemProg]      = useState<Pedido[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dragId,       setDragId]       = useState<string | null>(null);
  const [modalAgendar, setModalAgendar] = useState<Pedido | null>(null);
  const [modalBloco,   setModalBloco]   = useState<ProgramacaoProducao | null>(null);
  const [filtroLinha,  setFiltroLinha]  = useState<number | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [metricas,     setMetricas]     = useState<Awaited<ReturnType<typeof getMetricasProducao>> | null>(null);

  const dias      = diasVisiveis(zoom, dataBase);
  const horas     = horasVisiveis();
  const colW      = COL_W[zoom];
  const totalWidth = zoom === "dia" ? horas.length * colW : dias.length * colW;

  async function load() {
    setLoading(true);
    const [lin, cfg, sem] = await Promise.all([getLinhas(), getConfigTempo(), getPedidosSemProgramacao()]);
    setLinhas(lin); setConfig(cfg); setSemProg(sem);
    const from = zoom === "dia" ? dataBase : dias[0];
    const to   = addDays(zoom === "dia" ? dataBase : dias[dias.length - 1], 1);
    const progs = await getProgramacao(from, to);
    setProg(progs);
    setLoading(false);
  }

  async function loadMetricas() {
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    const to = addDays(from, 30);
    setMetricas(await getMetricasProducao(from, to));
  }

  useEffect(() => { load(); }, [zoom, dataBase.toISOString().slice(0, 10)]);
  useEffect(() => { if (aba === "dashboard") loadMetricas(); }, [aba]);

  function navAnterior() {
    if (zoom === "dia")    setDataBase(d => addDays(d, -1));
    if (zoom === "semana") setDataBase(d => addDays(d, -7));
    if (zoom === "mes")    setDataBase(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function navProximo() {
    if (zoom === "dia")    setDataBase(d => addDays(d, 1));
    if (zoom === "semana") setDataBase(d => addDays(d, 7));
    if (zoom === "mes")    setDataBase(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  function irHoje() {
    if (zoom === "semana")     setDataBase(getMonday(new Date()));
    else if (zoom === "mes")   setDataBase(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    else                       setDataBase(new Date());
  }

  function tituloPeriodo() {
    if (zoom === "dia") {
      return dataBase.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    }
    if (zoom === "semana") {
      const fim = addDays(dataBase, 6);
      return `${dataBase.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
    }
    return dataBase.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  async function handleDragEnd(e: DragEndEvent) {
    setDragId(null);
    const { active, delta } = e;
    const prog = programacoes.find(p => p.id === active.id);
    if (!prog?.dt_inicio_previsto) return;
    if (zoom === "dia") {
      const hoursShifted = Math.round(delta.x / colW);
      if (hoursShifted === 0) return;
      const novaDt = new Date(prog.dt_inicio_previsto);
      novaDt.setHours(novaDt.getHours() + hoursShifted);
      await reagendar(prog.id, novaDt, prog.duracao_estimada_min ?? 60);
    } else {
      const daysShifted = Math.round(delta.x / colW);
      if (daysShifted === 0) return;
      const novaDt = addDays(new Date(prog.dt_inicio_previsto), daysShifted);
      await reagendar(prog.id, novaDt, prog.duracao_estimada_min ?? 60);
    }
    await load();
  }

  async function handleAgendar(dtInicio: Date, linhaCorteId: number, linhaLapId?: number) {
    if (!modalAgendar) return;
    const itens = (modalAgendar.itens_pedido ?? []) as { m2: number; quantidade: number; lapidacao: number; produto_nome: string; }[];
    await criarProgramacaoPedido(modalAgendar.id, itens, config, linhas, dtInicio, linhaCorteId, linhaLapId);
    setModalAgendar(null);
    await load();
  }

  async function handleIniciar() {
    if (!modalBloco) return;
    await atualizarStatusProgramacao(modalBloco.id, "Em Execução", new Date());
    setModalBloco(null); await load();
  }
  async function handleConcluir() {
    if (!modalBloco) return;
    await atualizarStatusProgramacao(modalBloco.id, "Concluído", new Date());
    setModalBloco(null); await load();
  }
  async function handleDeletar() {
    if (!modalBloco) return;
    if (!confirm("Remover este agendamento?")) return;
    await deletarProgramacao(modalBloco.id);
    setModalBloco(null); await load();
  }

  const linhasFiltradas = linhas.filter(l => !filtroLinha || l.id === filtroLinha);
  const progFiltradas   = programacoes.filter(p =>
    (!filtroLinha  || p.linha_id === filtroLinha) &&
    (!filtroStatus || p.status   === filtroStatus)
  );

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* ─── CABEÇALHO ──────────────────────────────────────── */}
        <div style={{
          padding: "14px 20px 12px", borderBottom: "1px solid var(--b1)",
          flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.4px", margin: 0 }}>
              Programação da Produção
            </h1>
            <p style={{ fontSize: 11, color: "var(--t3)", margin: "2px 0 0" }}>
              APS Simplificado · Urban Glass
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["gantt", "dashboard"] as const).map(t => (
              <button key={t} onClick={() => setAba(t)} style={{
                padding: "7px 18px", borderRadius: 8, border: "1px solid",
                borderColor: aba === t ? "var(--acc)" : "var(--b2)",
                background: aba === t ? "rgba(61,255,160,.12)" : "transparent",
                color: aba === t ? "var(--acc)" : "var(--t2)",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>
                {t === "gantt" ? "◧ Gantt" : "◭ Dashboard"}
              </button>
            ))}
          </div>
        </div>

        {/* ─── ABA GANTT ──────────────────────────────────────── */}
        {aba === "gantt" && (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* Timeline principal */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

              {/* Barra de controles */}
              <div style={{
                padding: "10px 14px", borderBottom: "1px solid var(--b1)",
                display: "flex", alignItems: "center", gap: 8,
                flexShrink: 0, flexWrap: "wrap",
              }}>
                {/* Zoom */}
                <div style={{ display: "flex", border: "1px solid var(--b2)", borderRadius: 8, overflow: "hidden" }}>
                  {(["dia", "semana", "mes"] as const).map(z => (
                    <button key={z} onClick={() => setZoom(z)} style={{
                      padding: "5px 13px", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      background: zoom === z ? "var(--acc)" : "transparent",
                      color: zoom === z ? "#090b10" : "var(--t2)",
                    }}>
                      {z.charAt(0).toUpperCase() + z.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Navegação */}
                <button onClick={navAnterior} className="btn bg xs">◀</button>
                <button onClick={irHoje}      className="btn bg xs">Hoje</button>
                <button onClick={navProximo}  className="btn bg xs">▶</button>

                <span style={{
                  fontSize: 12, fontWeight: 700, color: "var(--t1)",
                  flex: "1 1 auto", minWidth: 0, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {tituloPeriodo()}
                </span>

                {/* Filtros */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <select
                    className="fc"
                    style={{ padding: "4px 8px", fontSize: 11, width: 150 }}
                    value={filtroLinha ?? ""}
                    onChange={e => setFiltroLinha(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Todas as linhas</option>
                    {linhas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                  <select
                    className="fc"
                    style={{ padding: "4px 8px", fontSize: 11, width: 140 }}
                    value={filtroStatus}
                    onChange={e => setFiltroStatus(e.target.value)}
                  >
                    <option value="">Todos os status</option>
                    {["Agendado", "Em Execução", "Concluído"].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Grade do Gantt */}
              {loading ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: 13 }}>
                  Carregando…
                </div>
              ) : (
                <div style={{ flex: 1, overflow: "auto" }}>
                  <DndContext
                    onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
                    onDragEnd={handleDragEnd}
                  >
                    <div style={{ minWidth: LABEL_W + totalWidth, position: "relative" }}>

                      {/* Cabeçalho de datas/horas */}
                      <div style={{
                        display: "flex", position: "sticky", top: 0, zIndex: 10,
                        background: "var(--surf)", borderBottom: "1px solid var(--b2)",
                      }}>
                        {/* Canto fixo topo-esquerdo */}
                        <div style={{
                          width: LABEL_W, flexShrink: 0,
                          padding: "10px 14px", fontSize: 10, color: "var(--t3)",
                          fontWeight: 700, borderRight: "1px solid var(--b2)",
                          position: "sticky", left: 0, zIndex: 20,
                          background: "var(--surf)",
                        }}>
                          LINHA
                        </div>
                        <div style={{ display: "flex" }}>
                          {(zoom === "dia" ? horas : dias).map((slot, i) => {
                            const isHoje = zoom !== "dia" &&
                              new Date(slot as Date).toDateString() === new Date().toDateString();
                            return (
                              <div key={i} style={{
                                width: colW, flexShrink: 0,
                                padding: zoom === "mes" ? "10px 2px" : "10px 6px",
                                fontSize: zoom === "mes" ? 9 : 11,
                                fontWeight: isHoje ? 800 : 600,
                                color: isHoje ? "var(--acc)" : "var(--t2)",
                                textAlign: "center", borderRight: "1px solid var(--b1)",
                                background: isHoje ? "rgba(61,255,160,0.07)" : "transparent",
                                lineHeight: 1.3,
                              }}>
                                {zoom === "dia"
                                  ? formatHour(slot as number)
                                  : formatDate(slot as Date, zoom === "mes")}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Linhas de produção */}
                      {linhasFiltradas.length === 0 ? (
                        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
                          {linhas.length === 0
                            ? "Nenhuma linha de produção encontrada. Execute sql/fix-programacao-rls.sql no Supabase."
                            : "Nenhuma linha corresponde ao filtro selecionado."}
                        </div>
                      ) : linhasFiltradas.map(linha => {
                        const blocos = progFiltradas.filter(p => p.linha_id === linha.id);
                        return (
                          <div key={linha.id} style={{ display: "flex", borderBottom: "1px solid var(--b1)", minHeight: ROW_H }}>

                            {/* Label sticky-esquerda */}
                            <div style={{
                              width: LABEL_W, flexShrink: 0,
                              padding: "14px 14px", display: "flex", flexDirection: "column",
                              justifyContent: "center", gap: 3,
                              borderRight: "1px solid var(--b2)",
                              position: "sticky", left: 0,
                              background: "var(--surf)", zIndex: 5,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 9, height: 9, borderRadius: "50%", background: linha.cor, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {linha.nome}
                                </span>
                              </div>
                              <div style={{ fontSize: 10, color: "var(--t3)", paddingLeft: 17 }}>
                                {blocos.length} pedido{blocos.length !== 1 ? "s" : ""}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--t3)", paddingLeft: 17 }}>
                                {formatarDuracao(blocos.reduce((s, p) => s + (p.duracao_estimada_min ?? 0), 0))} est.
                              </div>
                            </div>

                            {/* Área de blocos */}
                            <div style={{ flex: 1, position: "relative", minHeight: ROW_H }}>
                              {/* Grade de colunas */}
                              {(zoom === "dia" ? horas : dias).map((_, i) => {
                                const isHoje = zoom !== "dia" && dias[i] &&
                                  new Date(dias[i]).toDateString() === new Date().toDateString();
                                return (
                                  <div key={i} style={{
                                    position: "absolute", left: i * colW, top: 0,
                                    width: colW, height: "100%",
                                    borderRight: "1px solid var(--b1)",
                                    background: isHoje ? "rgba(61,255,160,0.04)" : "transparent",
                                  }} />
                                );
                              })}

                              {/* Blocos arrastáveis */}
                              {blocos.map(prog => (
                                <BlocoProducao
                                  key={prog.id}
                                  prog={prog}
                                  zoom={zoom}
                                  visibleStart={zoom === "dia" ? dataBase : dias[0]}
                                  onClick={setModalBloco}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {/* Barra de capacidade */}
                      <div style={{ display: "flex", borderTop: "2px solid var(--b2)", background: "var(--surf2)" }}>
                        <div style={{
                          width: LABEL_W, flexShrink: 0,
                          padding: "9px 14px", fontSize: 10, color: "var(--t3)",
                          fontWeight: 700, borderRight: "1px solid var(--b2)",
                          position: "sticky", left: 0, background: "var(--surf2)", zIndex: 5,
                        }}>
                          OCUPAÇÃO
                        </div>
                        <div style={{ flex: 1, padding: "9px 14px", display: "flex", gap: 20, flexWrap: "wrap" }}>
                          {linhas.map(l => {
                            const minTotal   = progFiltradas
                              .filter(p => p.linha_id === l.id)
                              .reduce((s, p) => s + (p.duracao_estimada_min ?? 0), 0);
                            const horasCap   = l.capacidade_horas_dia * Math.max(1, dias.length);
                            const pct        = Math.min(100, Math.round((minTotal / (horasCap * 60)) * 100));
                            const cor        = pct > 90 ? "var(--err)" : pct > 70 ? "var(--warn)" : "var(--ok)";
                            return (
                              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "var(--t2)", whiteSpace: "nowrap" }}>
                                  {l.nome.split("–")[1]?.trim() ?? l.nome}
                                </span>
                                <div style={{ width: 90, height: 6, background: "var(--b2)", borderRadius: 99, overflow: "hidden" }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: cor, borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 11, color: cor, fontWeight: 700, minWidth: 30 }}>{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  </DndContext>
                </div>
              )}
            </div>

            {/* ─── PAINEL SEM PROGRAMAÇÃO ─────────────────────── */}
            <div style={{
              width: 274, flexShrink: 0, borderLeft: "1px solid var(--b1)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 14px", borderBottom: "1px solid var(--b1)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Sem Programação</span>
                <span style={{
                  fontSize: 12, fontWeight: 800,
                  color: semProg.length > 0 ? "var(--warn)" : "var(--ok)",
                  background: semProg.length > 0 ? "rgba(245,158,11,.12)" : "rgba(16,185,129,.12)",
                  padding: "2px 8px", borderRadius: 20,
                }}>
                  {semProg.length}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                {semProg.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--t3)", fontSize: 12, padding: "32px 12px" }}>
                    ✓ Todos os pedidos estão programados
                  </div>
                ) : semProg.map(p => {
                  const statusCol = COR_STATUS[p.status] ?? "var(--t3)";
                  const itens     = p.itens_pedido ?? [];
                  const pecas     = (itens as any[]).reduce((s: number, i: any) => s + i.quantidade, 0);
                  const prazoStr  = p.dt_retirada
                    ? new Date(p.dt_retirada).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                    : "—";
                  const prazoDate  = p.dt_retirada ? new Date(p.dt_retirada) : null;
                  const diasFaltam = prazoDate ? diffDays(prazoDate, new Date()) : null;
                  const urgente    = diasFaltam !== null && diasFaltam <= 3;
                  return (
                    <div key={p.id} style={{
                      background: "var(--surf2)",
                      border: `1px solid ${urgente ? "var(--err)" : "var(--b2)"}`,
                      borderRadius: 10, padding: "10px 12px", marginBottom: 8,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--acc)" }}>{p.id}</span>
                        {urgente && (
                          <span style={{
                            fontSize: 10, color: "var(--err)", fontWeight: 700,
                            background: "rgba(244,63,94,.12)", padding: "1px 6px", borderRadius: 10,
                          }}>
                            URGENTE
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 12, color: "var(--t1)", marginBottom: 4,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {(p as any).clientes?.nome ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t2)", display: "flex", gap: 8, marginBottom: 4 }}>
                        <span>{p.m2_total?.toFixed(1)} m²</span>
                        <span>·</span>
                        <span>{pecas} pç</span>
                        <span>·</span>
                        <span style={{ color: urgente ? "var(--err)" : "var(--t3)" }}>↗ {prazoStr}</span>
                      </div>
                      <div style={{
                        fontSize: 10, color: statusCol, marginBottom: 8,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {p.status}
                      </div>
                      <button
                        className="btn pri"
                        style={{ width: "100%", fontSize: 11, padding: "6px 0" }}
                        onClick={() => setModalAgendar(p)}
                      >
                        + Agendar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* ─── ABA DASHBOARD ──────────────────────────────────── */}
        {aba === "dashboard" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            {!metricas ? (
              <div style={{ textAlign: "center", color: "var(--t3)", paddingTop: 80, fontSize: 13 }}>
                Carregando métricas…
              </div>
            ) : (
              <DashboardConteudo metricas={metricas} />
            )}
          </div>
        )}

      </div>

      {/* ─── MODAIS ─────────────────────────────────────────── */}
      {modalAgendar && (
        <ModalAgendar
          pedido={modalAgendar}
          linhas={linhas}
          config={config}
          onConfirmar={handleAgendar}
          onFechar={() => setModalAgendar(null)}
        />
      )}
      {modalBloco && (
        <ModalBloco
          prog={modalBloco}
          onFechar={() => setModalBloco(null)}
          onIniciar={handleIniciar}
          onConcluir={handleConcluir}
          onDeletar={handleDeletar}
        />
      )}
    </AppLayout>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────

function DashboardConteudo({ metricas }: { metricas: Awaited<ReturnType<typeof getMetricasProducao>> }) {
  const cards = [
    { label: "Total Programado", value: metricas.totalProgramados, unit: "pedidos",  col: "var(--acc)"  },
    { label: "Em Execução",      value: metricas.emExecucao,       unit: "agora",    col: "var(--acc2)" },
    { label: "Concluídos",       value: metricas.concluidos,       unit: "pedidos",  col: "var(--ok)"   },
    { label: "Atrasados",        value: metricas.atrasados,        unit: "pedidos",  col: "var(--err)"  },
    { label: "Em Risco",         value: metricas.emRisco,          unit: "≤ 2 dias", col: "var(--warn)" },
    { label: "M² Programado",    value: metricas.m2Programado,     unit: "m²",       col: "var(--acc4)" },
  ];

  const dadosStatus = [
    { name: "No Prazo",  value: metricas.noTempo,    fill: "#3dffa0" },
    { name: "Em Risco",  value: metricas.emRisco,    fill: "#f59e0b" },
    { name: "Atrasado",  value: metricas.atrasados,  fill: "#f43f5e" },
    { name: "Concluído", value: metricas.concluidos, fill: "#6b7280" },
  ].filter(d => d.value > 0);

  const dadosCapacidade = metricas.capacidadePorLinha.map(l => ({
    name: l.nome.split("–")[1]?.trim() ?? l.nome,
    ocupadas: l.horasOcupadas,
    livres: Math.max(0, l.horasDisponiveis - l.horasOcupadas),
    fill: l.cor,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Alertas */}
      {(metricas.atrasados > 0 || metricas.vencemHoje > 0 || metricas.vencemSemana > 0 ||
        metricas.capacidadePorLinha.some(l => l.pct > 90) || metricas.histReprogramacoes > 5) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {metricas.atrasados > 0 && (
            <Alerta cor="var(--err)"  icon="⚠"  texto={`${metricas.atrasados} pedido${metricas.atrasados > 1 ? "s" : ""} atrasado${metricas.atrasados > 1 ? "s" : ""}`} />
          )}
          {metricas.vencemHoje > 0 && (
            <Alerta cor="var(--warn)" icon="⏰" texto={`${metricas.vencemHoje} pedido${metricas.vencemHoje > 1 ? "s" : ""} vence hoje`} />
          )}
          {metricas.vencemSemana > 0 && (
            <Alerta cor="var(--acc5)" icon="📅" texto={`${metricas.vencemSemana} vencem esta semana`} />
          )}
          {metricas.capacidadePorLinha.some(l => l.pct > 90) && (
            <Alerta cor="var(--err)"  icon="🔴" texto="Linha sobrecarregada (> 90%)" />
          )}
          {metricas.histReprogramacoes > 5 && (
            <Alerta cor="var(--acc4)" icon="↻"  texto={`${metricas.histReprogramacoes} reprogramações no período`} />
          )}
        </div>
      )}

      {/* Cards de métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: "var(--surf2)", border: "1px solid var(--b2)",
            borderRadius: 12, padding: "16px 18px", borderTop: `3px solid ${c.col}`,
          }}>
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 8, fontWeight: 700, letterSpacing: "0.5px" }}>
              {c.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: c.col, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 6 }}>{c.unit}</div>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Capacidade por linha */}
        <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 12, padding: "18px 18px 12px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: "var(--t1)" }}>
            Capacidade por Linha
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dadosCapacidade} barSize={36} barGap={4}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--t2)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--t2)" }} unit="h" width={36} />
              <Tooltip
                contentStyle={{ background: "var(--surf3)", border: "1px solid var(--b2)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v}h`, ""]}
              />
              <Bar dataKey="ocupadas" name="Ocupadas" fill="#3dffa0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="livres"   name="Livres"   fill="#1c2540" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status dos pedidos */}
        <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 12, padding: "18px 18px 12px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: "var(--t1)" }}>
            Status dos Pedidos
          </div>
          {dadosStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={dadosStatus} dataKey="value"
                  cx="50%" cy="45%" outerRadius={72}
                  paddingAngle={3}
                >
                  {dadosStatus.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--surf3)", border: "1px solid var(--b2)", borderRadius: 8, fontSize: 12 }} />
                <Legend
                  iconType="circle" iconSize={9}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "var(--t2)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", color: "var(--t3)", paddingTop: 70, fontSize: 12 }}>
              Nenhum dado no período
            </div>
          )}
        </div>
      </div>

      {/* Métricas secundárias */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
        <MetricaRow label="Peças programadas"     value={String(metricas.pecasProgramadas)} />
        <MetricaRow label="M² concluído"           value={metricas.m2Concluido + " m²"}     />
        <MetricaRow label="Taxa de atraso"         value={metricas.taxaAtraso + "%"}          />
        <MetricaRow label="Tempo médio de corte"   value={formatarDuracao(metricas.tempoMedioCorte)}      />
        <MetricaRow label="Tempo médio lapidação"  value={formatarDuracao(metricas.tempoMedioLapidacao)}  />
        <MetricaRow label="Reprogramações"         value={String(metricas.histReprogramacoes)}  />
      </div>

    </div>
  );
}

function Alerta({ cor, icon, texto }: { cor: string; icon: string; texto: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
      background: "var(--surf2)", border: `1px solid ${cor}`,
      borderRadius: 8, fontSize: 12, color: cor, fontWeight: 600,
    }}>
      <span>{icon}</span>
      <span>{texto}</span>
    </div>
  );
}

function MetricaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 10,
      padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span style={{ fontSize: 12, color: "var(--t2)" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>{value}</span>
    </div>
  );
}
