"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  getLinhas, getConfigTempo, getProgramacao, getPedidosSemProgramacao,
  getPedidosExpedicao, getCalendario,
  getBloqueiosLinha, adicionarBloqueioLinha, removerBloqueioLinha,
  criarProgramacaoPedido, agendarChapaInteira, reagendar,
  atualizarStatusProgramacao, deletarProgramacao,
  registrarRetiradaParcial, getRetiradas,
  registrarRetrabalho, getCalibracaoTempos,
  calcularTempoEstimado, formatarDuracao, getMetricasProducao,
  isPedidoSomenteChapas,
  calcularPrioridadePedido, produtoPrincipal,
  construirDiasBloqueadosPorLinha, minutosRestantesNoDia, proximaTarefaParaEncaixe,
  addDays, proximoDiaUtil, getMonday, diffDays, toISOLocal,
} from "@/services/programacao.service";
import type { RetiradaParcial, BloqueioLinha, DadosCalibracao } from "@/services/programacao.service";
import type {
  ProducaoLinha, ConfigTempoProducao, ProgramacaoProducao, Pedido, TempoEstimado,
} from "@/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  DndContext, useDraggable, useDroppable,
  DragEndEvent, DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";

// ─── CONSTANTES ───────────────────────────────────────────────

const COL_W: Record<string, number> = { dia: 100, semana: 144, mes: 52 };
const ROW_H   = 104;
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
function formatHour(h: number): string { return `${String(h).padStart(2, "0")}:00`; }

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
function horasVisiveis() { return Array.from({ length: 9 }, (_, i) => i + 8); }

function blocoLeft(prog: ProgramacaoProducao, zoom: string, visibleStart: Date): number {
  if (!prog.dt_inicio_previsto) return 0;
  const inicio = new Date(prog.dt_inicio_previsto);
  if (zoom === "dia") return Math.max(0, (inicio.getHours() - 8)) * COL_W[zoom];
  return Math.max(0, diffDays(inicio, visibleStart)) * COL_W[zoom];
}

function calcBlocoWidth(dur: number, zoom: string): number {
  const cw = COL_W[zoom];
  if (zoom === "dia") return Math.max(cw * 0.9, (dur / 60) * cw);
  const dias = Math.max(0.5, dur / 480);
  return Math.max(cw * 0.85, dias * cw - 4);
}

type TipoDia = 'fim_semana' | 'feriado' | 'bloqueio_global' | 'bloqueio_linha' | null;
function getDiaTipo(date: Date, linhaId: number, calendario: Set<string>, bloqueios: BloqueioLinha[]): TipoDia {
  const dow = date.getDay();
  const iso = date.toISOString().slice(0, 10);
  if (dow === 0 || dow === 6) return 'fim_semana';
  if (calendario.has(iso))   return 'feriado';
  const dts = date.getTime(), dte = dts + 86400000;
  for (const b of bloqueios) {
    const bi = new Date(b.dt_inicio).getTime(), bf = new Date(b.dt_fim).getTime();
    if (bi < dte && bf > dts) {
      if (b.linha_id === null)     return 'bloqueio_global';
      if (b.linha_id === linhaId)  return 'bloqueio_linha';
    }
  }
  return null;
}

const HATCH: Record<NonNullable<TipoDia>, { bg: string }> = {
  fim_semana:     { bg: "rgba(255,255,255,0.02)" },
  feriado:        { bg: "repeating-linear-gradient(45deg, rgba(244,63,94,.06) 0,rgba(244,63,94,.06) 3px,transparent 3px,transparent 12px)" },
  bloqueio_global:{ bg: "repeating-linear-gradient(45deg, rgba(245,158,11,.08) 0,rgba(245,158,11,.08) 3px,transparent 3px,transparent 12px)" },
  bloqueio_linha: { bg: "repeating-linear-gradient(45deg, rgba(245,158,11,.12) 0,rgba(245,158,11,.12) 3px,transparent 3px,transparent 12px)" },
};

// ─── LEGENDA DE CORES ─────────────────────────────────────────

function LegendaCores() {
  const blocos = [
    { cor: "#3dffa0", label: "No prazo", borda: false },
    { cor: "#f59e0b", label: "≤ 2 dias para vencer", borda: false },
    { cor: "#f43f5e", label: "Atrasado", borda: false },
    { cor: "#3dffa0", label: "Em execução", borda: true },
    { cor: "#4a4a6a", label: "Concluído", borda: false },
  ];
  const hatches = [
    { bg: "rgba(244,63,94,.5)",   pat: HATCH.feriado.bg,        label: "Feriado" },
    { bg: "rgba(245,158,11,.5)",  pat: HATCH.bloqueio_linha.bg,  label: "Manutenção" },
    { bg: "rgba(255,255,255,.15)",pat: HATCH.fim_semana.bg,      label: "Fim de semana" },
  ];
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
      {blocos.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: it.borda ? "rgba(61,255,160,.2)" : it.cor, border: `2px solid ${it.cor}` }} />
          <span style={{ fontSize: 10, color: "var(--t3)" }}>{it.label}</span>
        </div>
      ))}
      <div style={{ width: 1, height: 10, background: "var(--b2)" }} />
      {hatches.map((h, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: h.pat, border: `1px solid ${h.bg}` }} />
          <span style={{ fontSize: 10, color: "var(--t3)" }}>{h.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── BLOCO DRAGGABLE + REDIMENSIONÁVEL ───────────────────────

function BlocoProducao({
  prog, zoom, visibleStart, onClick, onResizeFim,
}: {
  prog: ProgramacaoProducao; zoom: string; visibleStart: Date;
  onClick: (p: ProgramacaoProducao) => void;
  onResizeFim: (id: string, novaDur: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: prog.id, data: { prog },
  });

  // Preview local de duração durante o resize
  const [previewDur, setPreviewDur] = useState<number | null>(null);
  const isResizing = useRef(false);

  const displayDur = previewDur ?? (prog.duracao_estimada_min ?? 60);
  const left  = blocoLeft(prog, zoom, visibleStart);
  const width = calcBlocoWidth(displayDur, zoom);
  const borda = bordaBloco(prog);
  const bg    = corBloco(prog);

  // Snap em minutos conforme zoom
  const snapMin = zoom === "dia" ? 15 : zoom === "semana" ? 30 : 60;
  // Minutos por pixel conforme zoom
  const minsPorPx = zoom === "dia"
    ? 60 / COL_W.dia
    : 480 / COL_W[zoom];

  function handleResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = true;
    const startX   = e.clientX;
    const startDur = prog.duracao_estimada_min ?? 60;

    function onMove(ev: PointerEvent) {
      if (!isResizing.current) return;
      const deltaMin = Math.round((ev.clientX - startX) * minsPorPx / snapMin) * snapMin;
      setPreviewDur(Math.max(snapMin, startDur + deltaMin));
    }
    function onUp(ev: PointerEvent) {
      isResizing.current = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup",   onUp);
      const deltaMin = Math.round((ev.clientX - startX) * minsPorPx / snapMin) * snapMin;
      const newDur   = Math.max(snapMin, startDur + deltaMin);
      setPreviewDur(null);
      if (newDur !== startDur) onResizeFim(prog.id, newDur);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup",   onUp);
  }

  const item  = prog.item_pedido ?? null;
  const prazo = prog.pedidos?.dt_retirada
    ? new Date(prog.pedidos.dt_retirada).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "—";

  const titleInfo = item
    ? `${prog.pedido_id} · ${item.produto_nome} · ${item.largura}×${item.altura} · ${prog.etapa}`
    : `${prog.pedido_id} · ${prog.pedidos?.clientes?.nome ?? ""} · ${prog.etapa}`;

  return (
    <div
      ref={setNodeRef}
      title={titleInfo}
      style={{
        position: "absolute", left, top: 6, width, height: ROW_H - 16,
        background: bg, border: `1.5px solid ${borda}`, borderRadius: 8,
        padding: "5px 9px 5px 9px",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none", zIndex: isDragging ? 50 : 2,
        opacity: isDragging ? 0.7 : 1,
        transform: CSS.Translate.toString(transform),
        overflow: "hidden",
        transition: isDragging ? "none" : "box-shadow 0.15s",
        boxSizing: "border-box",
      }}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick(prog); }}
    >
      {/* Conteúdo do bloco */}
      <div style={{ paddingRight: 10, overflow: "hidden" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: borda, lineHeight: 1.2, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {prog.pedido_id}
          {prog.predecessor_id && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>⛓</span>}
          {prog.travado && <span title="Reposicionado manualmente — o auto-agendamento não move este bloco" style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>🔒</span>}
        </div>
        {width > 56 && item && (
          <div style={{ fontSize: 9, color: "var(--t1)", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.produto_nome}
          </div>
        )}
        {width > 80 && item && (
          <div style={{ fontSize: 9, color: "var(--t2)", display: "flex", gap: 3, overflow: "hidden" }}>
            <span>{item.largura}×{item.altura}</span>
            <span>·</span>
            <span>{item.m2.toFixed(2)}m²</span>
            <span>·</span>
            <span>↗{prazo}</span>
          </div>
        )}
        {width > 80 && !item && (
          <div style={{ fontSize: 9, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {prog.pedidos?.clientes?.nome ?? "—"}
          </div>
        )}
        {width > 80 && (
          <div style={{ fontSize: 9, color: previewDur ? "var(--acc)" : "var(--t3)", marginTop: 1, fontWeight: previewDur ? 700 : 400 }}>
            {formatarDuracao(displayDur)} · {prog.etapa}
          </div>
        )}
      </div>

      {/* Resize handle — borda direita */}
      <div
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: 12,
          cursor: "ew-resize", zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent",
        }}
        onPointerDown={handleResizeDown}
        onClick={e => e.stopPropagation()}
        title="Arraste para ajustar a duração"
      >
        <div style={{
          width: 3, height: 18, borderRadius: 2,
          background: previewDur ? borda : `${borda}55`,
          transition: "background 0.1s",
          flexShrink: 0,
        }} />
      </div>
    </div>
  );
}

// ─── LINHA DROPPABLE ──────────────────────────────────────────

function LinhaDroppable({ id, children }: { id: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, position: "relative", minHeight: ROW_H,
        background: isOver ? "rgba(61,255,160,0.07)" : "transparent",
        transition: "background 0.12s",
      }}
    >
      {children}
    </div>
  );
}

// ─── MODAL DE AGENDAMENTO ─────────────────────────────────────

function ModalAgendar({
  pedido, linhas, config, onConfirmar, onFechar,
}: {
  pedido: Pedido; linhas: ProducaoLinha[]; config: ConfigTempoProducao[];
  onConfirmar: (dtInicio: Date, linhaCorteId: number, linhaLapId: number | undefined) => Promise<void>;
  onFechar: () => void;
}) {
  const eChapa      = isPedidoSomenteChapas(pedido);
  const linhasCorte = linhas.filter(l => l.tipo === "Corte");
  const linhasLap   = linhas.filter(l => l.tipo === "Lapidação");
  const semTabelas  = linhas.length === 0;
  const semConfig   = config.length === 0;

  const amanhaBR = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  })();

  const [dtDisplay,    setDtDisplay]    = useState(amanhaBR);
  const [linhaCorteId, setLinhaCorteId] = useState<number>(linhasCorte[0]?.id ?? 0);
  const [linhaLapId,   setLinhaLapId]   = useState<number | undefined>(linhasLap[0]?.id);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState("");

  useEffect(() => {
    if (linhasCorte.length > 0 && !linhaCorteId) setLinhaCorteId(linhasCorte[0].id);
  }, [linhas]);

  const itens = (pedido.itens_pedido ?? []) as { m2: number; quantidade: number; lapidacao: number; produto_nome: string }[];
  const tempos: TempoEstimado = calcularTempoEstimado(itens, config);

  function maskData(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
    return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
  }
  function parseBR(s: string): Date | null {
    const p = s.split("/");
    if (p.length !== 3 || p[2].length < 4) return null;
    const [dd, mm, yyyy] = p.map(Number);
    if (!dd || !mm || !yyyy || mm > 12 || dd > 31) return null;
    const d = new Date(yyyy, mm - 1, dd, 8, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  async function handleConfirmar() {
    setErro("");
    if (semTabelas) { setErro("Execute o script SQL no Supabase primeiro."); return; }
    const dt = parseBR(dtDisplay);
    if (!dt) { setErro("Data inválida."); return; }
    if (!eChapa && !linhaCorteId) { setErro("Selecione uma linha de corte."); return; }
    setSalvando(true);
    // Chapas inteiras não precisam de linha de corte
    await onConfirmar(dt, eChapa ? -1 : linhaCorteId, eChapa ? undefined : (tempos.tem_lapidacao ? linhaLapId : undefined));
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

          {eChapa && (
            <div style={{ background: "rgba(167,139,250,.08)", border: "1px solid #a78bfa", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>▣</span>
              <div>
                <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Retirada de Chapa Inteira</div>
                <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5 }}>
                  Todos os itens deste pedido têm dimensões de chapa inteira — não passa pela linha de corte.
                </div>
              </div>
            </div>
          )}

          {semTabelas && (
            <div style={{ background: "rgba(244,63,94,.08)", border: "1px solid var(--err)", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ color: "var(--err)", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>⚠ Linhas não encontradas</div>
              <div style={{ fontSize: 12, color: "var(--t1)", lineHeight: 1.6 }}>
                Execute <strong>sql/fix-programacao-rls.sql</strong> no Supabase SQL Editor.
              </div>
            </div>
          )}

          {/* Info do pedido */}
          <div style={{ background: "var(--surf2)", borderRadius: 10, padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatBloco label="Cliente" value={(pedido as any).clientes?.nome ?? "—"} />
            <StatBloco label="Pedido"  value={pedido.id} col="var(--acc)" />
            <StatBloco label="Área"    value={(pedido.m2_total ?? 0).toFixed(2) + " m²"} />
            <StatBloco label="Peças"   value={String(itens.reduce((s, i) => s + i.quantidade, 0))} />
          </div>

          {/* Estimativa */}
          <div style={{ background: "var(--surf3)", borderRadius: 10, padding: "12px 16px", border: "1px solid var(--b2)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--acc)", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>ESTIMATIVA DE TEMPO</span>
              {semConfig && <span style={{ color: "var(--warn)", fontWeight: 400 }}>⚠ config não encontrada</span>}
            </div>
            {semConfig ? (
              <div style={{ color: "var(--t3)", fontSize: 12 }}>Execute o script SQL para configurar os parâmetros.</div>
            ) : (
              <div style={{ display: "flex" }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 4 }}>CORTE</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>
                    {formatarDuracao(tempos.corte_min)}
                  </div>
                </div>
                {tempos.tem_lapidacao && (
                  <>
                    <div style={{ width: 1, background: "var(--b2)", alignSelf: "stretch", margin: "0 8px" }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 4 }}>LAPIDAÇÃO</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--acc2)", lineHeight: 1 }}>
                        {formatarDuracao(tempos.lapidacao_min)}
                      </div>
                    </div>
                  </>
                )}
                <div style={{ width: 1, background: "var(--b2)", alignSelf: "stretch", margin: "0 8px" }} />
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 4 }}>TOTAL</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--acc)", lineHeight: 1 }}>
                    {formatarDuracao(tempos.total_min)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Campos */}
          <div className="fg">
            <label className="fl" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Data de Início</span>
              {dtDisplay.length === 10 && !dtValida && (
                <span style={{ color: "var(--err)", fontSize: 11, fontWeight: 400 }}>data inválida</span>
              )}
            </label>
            <input className="fc" value={dtDisplay} onChange={e => setDtDisplay(maskData(e.target.value))}
              placeholder="dd/mm/aaaa" maxLength={10} inputMode="numeric"
              style={{ fontSize: 15, borderColor: dtDisplay.length === 10 && !dtValida ? "var(--err)" : undefined }} />
          </div>

          {!eChapa && (
            <div className="fg">
              <label className="fl">Linha de Corte</label>
              {linhasCorte.length === 0
                ? <div className="fc" style={{ color: "var(--t3)", pointerEvents: "none" }}>Nenhuma linha configurada</div>
                : <select className="fc" value={linhaCorteId} onChange={e => setLinhaCorteId(Number(e.target.value))}>
                    {linhasCorte.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
              }
            </div>
          )}

          {!eChapa && tempos.tem_lapidacao && (
            <div className="fg">
              <label className="fl">Linha de Lapidação</label>
              {linhasLap.length === 0
                ? <div className="fc" style={{ color: "var(--t3)", pointerEvents: "none" }}>Nenhuma linha configurada</div>
                : <select className="fc" value={linhaLapId ?? ""} onChange={e => setLinhaLapId(Number(e.target.value) || undefined)}>
                    <option value="">— sem lapidação —</option>
                    {linhasLap.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
              }
            </div>
          )}

          {erro && (
            <div style={{ color: "var(--err)", fontSize: 12, fontWeight: 600, background: "rgba(244,63,94,.08)", borderRadius: 8, padding: "8px 12px" }}>
              ⚠ {erro}
            </div>
          )}
        </div>
        <div className="mft">
          <button className="btn bg" onClick={onFechar}>Cancelar</button>
          <button className="btn pri" onClick={handleConfirmar}
            disabled={salvando || semTabelas || !dtValida || !linhaCorteId}>
            {salvando ? "Agendando…" : "Confirmar Agendamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL AGENDAMENTO EM LOTE ────────────────────────────────

function ModalAgendamentoLote({
  pedidos, linhas, config, onConfirmar, onFechar,
}: {
  pedidos: Pedido[]; linhas: ProducaoLinha[]; config: ConfigTempoProducao[];
  onConfirmar: (dtInicio: Date, linhaCorteId: number) => Promise<void>;
  onFechar: () => void;
}) {
  const linhasCorte = linhas.filter(l => l.tipo === "Corte");
  const amanhaBR = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  })();
  const [dtDisplay,    setDtDisplay]    = useState(amanhaBR);
  const [linhaCorteId, setLinhaCorteId] = useState<number>(linhasCorte[0]?.id ?? 0);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState("");

  function maskData(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
    return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
  }
  function parseBR(s: string): Date | null {
    const p = s.split("/");
    if (p.length !== 3 || p[2].length < 4) return null;
    const [dd, mm, yyyy] = p.map(Number);
    if (!dd || !mm || !yyyy || mm > 12 || dd > 31) return null;
    const d = new Date(yyyy, mm - 1, dd, 8, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  const dtValida = !!parseBR(dtDisplay);

  // Calcula totais estimados
  const totalMin = pedidos.reduce((sum, p) => {
    const itens = (p.itens_pedido ?? []) as { m2: number; quantidade: number; lapidacao: number; produto_nome: string }[];
    return sum + calcularTempoEstimado(itens, config).total_min;
  }, 0);

  async function handleConfirmar() {
    setErro("");
    const dt = parseBR(dtDisplay);
    if (!dt) { setErro("Data inválida."); return; }
    if (!linhaCorteId) { setErro("Selecione uma linha."); return; }
    setSalvando(true);
    await onConfirmar(dt, linhaCorteId);
    setSalvando(false);
  }

  return (
    <div className="mov open">
      <div className="mod" style={{ width: 480 }}>
        <div className="mhd">
          <span>Agendar em Lote — {pedidos.length} pedidos</span>
          <button className="btn icon" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div style={{ background: "var(--surf2)", borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>PEDIDOS SELECIONADOS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
              {pedidos.map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--acc)", fontWeight: 700 }}>{p.id}</span>
                  <span style={{ color: "var(--t2)" }}>{(p as any).clientes?.nome ?? "—"}</span>
                  <span style={{ color: "var(--t3)" }}>{p.m2_total?.toFixed(1)}m²</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--b2)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--t3)" }}>Tempo total estimado</span>
              <span style={{ color: "var(--acc)", fontWeight: 700 }}>{formatarDuracao(totalMin)}</span>
            </div>
          </div>

          <div style={{ background: "rgba(61,255,160,.06)", border: "1px solid rgba(61,255,160,.2)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--t2)", lineHeight: 1.6 }}>
            Os pedidos serão agendados sequencialmente a partir da data informada, sem sobreposição entre eles.
          </div>

          <div className="fg">
            <label className="fl" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Data de Início (1º pedido)</span>
              {dtDisplay.length === 10 && !dtValida && <span style={{ color: "var(--err)", fontSize: 11, fontWeight: 400 }}>inválida</span>}
            </label>
            <input className="fc" value={dtDisplay} onChange={e => setDtDisplay(maskData(e.target.value))}
              placeholder="dd/mm/aaaa" maxLength={10} inputMode="numeric"
              style={{ fontSize: 15, borderColor: dtDisplay.length === 10 && !dtValida ? "var(--err)" : undefined }} />
          </div>

          <div className="fg">
            <label className="fl">Linha de Corte</label>
            <select className="fc" value={linhaCorteId} onChange={e => setLinhaCorteId(Number(e.target.value))}>
              {linhasCorte.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>

          {erro && (
            <div style={{ color: "var(--err)", fontSize: 12, background: "rgba(244,63,94,.08)", borderRadius: 8, padding: "8px 12px" }}>⚠ {erro}</div>
          )}
        </div>
        <div className="mft">
          <button className="btn bg" onClick={onFechar}>Cancelar</button>
          <button className="btn pri" onClick={handleConfirmar}
            disabled={salvando || !dtValida || !linhaCorteId}>
            {salvando ? "Agendando…" : `Agendar ${pedidos.length} Pedidos`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DETALHE DO BLOCO ───────────────────────────────────

function ModalBloco({
  prog, linhas, onFechar, onIniciar, onConcluir, onDeletar, onRetirada, onRetrabalho,
}: {
  prog: ProgramacaoProducao; linhas: ProducaoLinha[];
  onFechar: () => void; onIniciar: () => void;
  onConcluir: () => void; onDeletar: () => void;
  onRetirada: () => void; onRetrabalho: () => void;
}) {
  const borda      = bordaBloco(prog);
  const prazo      = prog.pedidos?.dt_retirada ? new Date(prog.pedidos.dt_retirada).toLocaleDateString("pt-BR") : "—";
  const inicio     = prog.dt_inicio_previsto   ? new Date(prog.dt_inicio_previsto).toLocaleDateString("pt-BR") : "—";
  const fim        = prog.dt_fim_previsto       ? new Date(prog.dt_fim_previsto).toLocaleDateString("pt-BR")   : "—";

  // Retiradas parciais
  const [retiradas,     setRetiradas]     = useState<RetiradaParcial[]>([]);
  const [mostraForm,    setMostraForm]    = useState(false);
  const [qtdRetirada,   setQtdRetirada]   = useState("");
  const [obsRetirada,   setObsRetirada]   = useState("");
  const [salvandoRet,   setSalvandoRet]   = useState(false);

  useEffect(() => {
    getRetiradas(prog.id).then(setRetiradas);
  }, [prog.id]);

  const pecasTotal    = (prog.pedidos?.itens_pedido ?? []).reduce((s, i) => s + i.quantidade, 0);
  const pecasEntregues = retiradas.reduce((s, r) => s + r.pecas_retiradas, 0);
  const pctEntregue   = pecasTotal > 0 ? Math.min(100, Math.round((pecasEntregues / pecasTotal) * 100)) : 0;

  async function handleSalvarRetirada() {
    const qtd = parseInt(qtdRetirada);
    if (!qtd || qtd <= 0) return;
    setSalvandoRet(true);
    const ok = await registrarRetiradaParcial(prog.id, prog.pedido_id, qtd, obsRetirada || undefined);
    if (ok) {
      const updated = await getRetiradas(prog.id);
      setRetiradas(updated);
      setQtdRetirada("");
      setObsRetirada("");
      setMostraForm(false);
      onRetirada();
    }
    setSalvandoRet(false);
  }
  const inicioReal = prog.dt_inicio_real
    ? new Date(prog.dt_inicio_real).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
    : null;
  const fimReal    = prog.dt_fim_real
    ? new Date(prog.dt_fim_real).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
    : null;

  const statusColor: Record<string, string> = {
    Agendado: "var(--t2)", "Em Execução": "var(--acc)", Concluído: "var(--ok)", Cancelado: "var(--err)",
  };

  const linhaNome = linhas.find(l => l.id === prog.linha_id)?.nome ?? prog.etapa;

  return (
    <div className="mov open">
      <div className="mod" style={{ width: 480 }}>
        <div className="mhd" style={{ borderLeft: `4px solid ${borda}`, paddingLeft: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{prog.pedido_id}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>{prog.etapa} · {linhaNome}</div>
          </div>
          <button className="btn icon" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 20,
              background: `${statusColor[prog.status] ?? "var(--t2)"}18`,
              border: `1px solid ${statusColor[prog.status] ?? "var(--b2)"}`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor[prog.status] ?? "var(--t2)" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[prog.status] ?? "var(--t1)" }}>{prog.status}</span>
            </div>
            <span style={{ fontSize: 12, color: "var(--t2)" }}>{formatarDuracao(prog.duracao_estimada_min ?? 0)}</span>
          </div>

          {/* Grid info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "var(--surf2)", borderRadius: 10, padding: "14px 16px" }}>
            <StatBloco label="Cliente"         value={prog.pedidos?.clientes?.nome ?? "—"} />
            <StatBloco label="Cidade"          value={prog.pedidos?.clientes?.cidade ?? "—"} />
            {prog.item_pedido ? (
              <>
                <StatBloco label="Produto"     value={prog.item_pedido.produto_nome} />
                <StatBloco label="Dimensões"   value={`${prog.item_pedido.largura ?? "?"}×${prog.item_pedido.altura ?? "?"} mm`} />
                <StatBloco label="Área"        value={`${prog.item_pedido.m2.toFixed(4)} m²`} />
                <StatBloco label="Quantidade"  value={`${prog.item_pedido.quantidade} pç`} />
              </>
            ) : (
              <>
                <StatBloco label="Área Total"  value={(prog.pedidos?.m2_total ?? 0).toFixed(2) + " m²"} />
                <StatBloco label="Peças"       value={String((prog.pedidos?.itens_pedido ?? []).reduce((s, i) => s + i.quantidade, 0))} />
              </>
            )}
            <StatBloco label="Início Previsto" value={inicio} />
            <StatBloco label="Fim Previsto"    value={fim} />
            <StatBloco label="Prazo Entrega"   value={prazo} col={borda} />
            <StatBloco label="Duração Est."    value={formatarDuracao(prog.duracao_estimada_min ?? 0)} />
          </div>

          {/* Tempos reais */}
          {(inicioReal || fimReal) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "rgba(61,255,160,.06)", border: "1px solid rgba(61,255,160,.2)", borderRadius: 10, padding: "10px 16px" }}>
              {inicioReal && <StatBloco label="Início Real" value={inicioReal} col="var(--acc)" />}
              {fimReal    && <StatBloco label="Fim Real"    value={fimReal}    col="var(--ok)"  />}
            </div>
          )}

          {prog.pedidos?.obs && (
            <div style={{ fontSize: 12, color: "var(--t2)", background: "var(--surf2)", padding: "8px 12px", borderRadius: 8, lineHeight: 1.5 }}>
              {prog.pedidos.obs}
            </div>
          )}

          {/* ── Retiradas parciais ── */}
          {pecasTotal > 0 && (
            <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>RETIRADAS</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: pctEntregue === 100 ? "var(--ok)" : "var(--t1)" }}>
                  {pecasEntregues}/{pecasTotal} peças ({pctEntregue}%)
                </span>
              </div>
              {/* Barra de progresso */}
              <div style={{ height: 6, background: "var(--b2)", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  width: `${pctEntregue}%`,
                  background: pctEntregue === 100 ? "var(--ok)" : pctEntregue > 50 ? "var(--acc)" : "var(--warn)",
                  transition: "width 0.3s ease",
                }} />
              </div>
              {/* Histórico de retiradas */}
              {retiradas.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                  {retiradas.map(r => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--t2)" }}>
                      <span>{new Date(r.dt_retirada).toLocaleDateString("pt-BR")}</span>
                      <span style={{ color: "var(--acc)", fontWeight: 700 }}>{r.pecas_retiradas} peças</span>
                      {r.obs && <span style={{ color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{r.obs}</span>}
                    </div>
                  ))}
                </div>
              )}
              {/* Formulário de nova retirada */}
              {mostraForm ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8, borderTop: "1px solid var(--b1)" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number" min={1} max={pecasTotal - pecasEntregues}
                      value={qtdRetirada} onChange={e => setQtdRetirada(e.target.value)}
                      placeholder={`Quantidade (máx ${pecasTotal - pecasEntregues})`}
                      className="fc" style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
                    />
                    <input
                      value={obsRetirada} onChange={e => setObsRetirada(e.target.value)}
                      placeholder="Observação (opcional)"
                      className="fc" style={{ flex: 2, fontSize: 12, padding: "5px 8px" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn bg" style={{ flex: 1, fontSize: 11 }} onClick={() => setMostraForm(false)}>Cancelar</button>
                    <button className="btn pri" style={{ flex: 1, fontSize: 11 }} onClick={handleSalvarRetirada}
                      disabled={salvandoRet || !qtdRetirada}>
                      {salvandoRet ? "…" : "Registrar"}
                    </button>
                  </div>
                </div>
              ) : (
                pctEntregue < 100 && (
                  <button className="btn bg" style={{ width: "100%", fontSize: 11, padding: "5px 0", marginTop: 4 }}
                    onClick={() => setMostraForm(true)}>
                    + Registrar Retirada
                  </button>
                )
              )}
            </div>
          )}
        </div>
        <div className="mft" style={{ gap: 8 }}>
          {prog.status === "Agendado"    && <button className="btn pri" onClick={onIniciar}>▶ Iniciar Produção</button>}
          {prog.status === "Em Execução" && <button className="btn pri" onClick={onConcluir} style={{ background: "var(--ok)", borderColor: "var(--ok)" }}>✓ Marcar Concluído</button>}
          {prog.status !== "Concluído"   && (
            <button className="btn bg" onClick={onRetrabalho}
              style={{ color: "var(--warn)", borderColor: "var(--warn)" }}
              title="Registrar problema — cria bloco de retrabalho">
              ⚠ Retrabalho
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn bg" onClick={onDeletar} style={{ color: "var(--err)", borderColor: "var(--err)" }}>Remover</button>
            <button className="btn bg" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL RETRABALHO ────────────────────────────────────────

function ModalRetrabalho({
  prog, onFechar, onSalvo,
}: {
  prog: ProgramacaoProducao;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [motivo,    setMotivo]    = useState("");
  const [dias,      setDias]      = useState("1");
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState("");

  async function handleSalvar() {
    if (!motivo.trim()) { setErro("Informe o motivo."); return; }
    const d = parseInt(dias);
    if (!d || d < 1) { setErro("Informe quantos dias de retrabalho."); return; }
    setSalvando(true);
    const result = await registrarRetrabalho(prog.id, motivo, d);
    setSalvando(false);
    if (!result.ok) { setErro(result.erro ?? "Erro ao salvar."); return; }
    onSalvo();
  }

  return (
    <div className="mov open">
      <div className="mod" style={{ width: 420 }}>
        <div className="mhd">
          <span style={{ color: "var(--warn)" }}>⚠ Registrar Retrabalho</span>
          <button className="btn icon" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid var(--warn)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--t2)" }}>
            Pedido <strong style={{ color: "var(--t1)" }}>{prog.pedido_id}</strong> · Etapa: {prog.etapa}
          </div>
          <div className="fg">
            <label className="fl">Motivo / descrição do problema</label>
            <textarea className="fc" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ex: Peças fora de esquadro, precisa reprocessar..." />
          </div>
          <div className="fg">
            <label className="fl">Dias de retrabalho estimados</label>
            <input className="fc" type="number" min={1} max={30} value={dias}
              onChange={e => setDias(e.target.value)} style={{ width: 100 }} />
          </div>
          {erro && <div style={{ color: "var(--err)", fontSize: 12 }}>⚠ {erro}</div>}
        </div>
        <div className="mft">
          <button className="btn bg" onClick={onFechar}>Cancelar</button>
          <button className="btn" style={{ background: "rgba(245,158,11,.15)", borderColor: "var(--warn)", color: "var(--warn)" }}
            onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Registrar Retrabalho"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL BLOQUEIO DE LINHA ──────────────────────────────────

function ModalBloqueioLinha({
  linha, bloqueiosExistentes, onFechar, onSalvo,
}: {
  linha: { id: number; nome: string } | null; // null = bloquear todas
  bloqueiosExistentes: BloqueioLinha[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const nomeDisplay = linha ? linha.nome : "Todas as Linhas";
  const bloqueiosFiltrados = bloqueiosExistentes.filter(b =>
    linha ? b.linha_id === linha.id : b.linha_id === null
  );

  function maskData(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  }
  function parseBR(s: string): Date | null {
    const p = s.split("/");
    if (p.length !== 3 || p[2].length < 4) return null;
    const [dd, mm, yyyy] = p.map(Number);
    if (!dd || !mm || !yyyy || mm > 12 || dd > 31) return null;
    const d = new Date(yyyy, mm - 1, dd, 8, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  const [dtIni,    setDtIni]    = useState("");
  const [dtFim,    setDtFim]    = useState("");
  const [motivo,   setMotivo]   = useState("");
  const [tipo,     setTipo]     = useState<BloqueioLinha['tipo']>("manutencao");
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  async function handleSalvar() {
    const di = parseBR(dtIni), df = parseBR(dtFim);
    if (!di || !df) { setErro("Datas inválidas."); return; }
    if (df <= di)   { setErro("Data fim deve ser depois do início."); return; }
    setSalvando(true);
    df.setHours(18, 0, 0, 0);
    const result = await adicionarBloqueioLinha(linha?.id ?? null, di, df, motivo, tipo);
    setSalvando(false);
    if (!result.ok) { setErro(result.erro ?? "Erro."); return; }
    onSalvo();
  }

  async function handleRemover(id: string) {
    await removerBloqueioLinha(id);
    onSalvo();
  }

  const tipoLabels: Record<BloqueioLinha['tipo'], string> = {
    manutencao: "Manutenção", recesso: "Recesso", outro: "Outro",
  };

  return (
    <div className="mov open">
      <div className="mod" style={{ width: 480 }}>
        <div className="mhd">
          <span>Bloqueios — {nomeDisplay}</span>
          <button className="btn icon" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Bloqueios existentes */}
          {bloqueiosFiltrados.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 8 }}>BLOQUEIOS ATIVOS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bloqueiosFiltrados.map(b => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surf2)", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--warn)" }}>
                        {new Date(b.dt_inicio).toLocaleDateString("pt-BR")} – {new Date(b.dt_fim).toLocaleDateString("pt-BR")}
                        <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 400, marginLeft: 8 }}>{tipoLabels[b.tipo]}</span>
                      </div>
                      {b.motivo && <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 2 }}>{b.motivo}</div>}
                    </div>
                    <button className="btn icon" style={{ color: "var(--err)", fontSize: 11 }}
                      onClick={() => handleRemover(b.id)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulário de novo bloqueio */}
          <div style={{ borderTop: bloqueiosFiltrados.length > 0 ? "1px solid var(--b2)" : "none", paddingTop: bloqueiosFiltrados.length > 0 ? 14 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 10 }}>NOVO BLOQUEIO</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div className="fg">
                <label className="fl">Data Início</label>
                <input className="fc" value={dtIni} onChange={e => setDtIni(maskData(e.target.value))} placeholder="dd/mm/aaaa" maxLength={10} inputMode="numeric" />
              </div>
              <div className="fg">
                <label className="fl">Data Fim</label>
                <input className="fc" value={dtFim} onChange={e => setDtFim(maskData(e.target.value))} placeholder="dd/mm/aaaa" maxLength={10} inputMode="numeric" />
              </div>
            </div>
            <div className="fg" style={{ marginBottom: 10 }}>
              <label className="fl">Tipo</label>
              <select className="fc" value={tipo} onChange={e => setTipo(e.target.value as BloqueioLinha['tipo'])}>
                <option value="manutencao">Manutenção</option>
                <option value="recesso">Recesso</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="fg">
              <label className="fl">Motivo (opcional)</label>
              <input className="fc" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: Revisão preventiva da máquina" />
            </div>
          </div>

          {erro && <div style={{ color: "var(--err)", fontSize: 12 }}>⚠ {erro}</div>}
        </div>
        <div className="mft">
          <button className="btn bg" onClick={onFechar}>Fechar</button>
          <button className="btn pri" onClick={handleSalvar} disabled={salvando || !dtIni || !dtFim}>
            {salvando ? "Salvando…" : "Adicionar Bloqueio"}
          </button>
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

// ─── ABA EXPEDIÇÃO ────────────────────────────────────────────

function AbaExpedicao({ pedidos }: { pedidos: Pedido[] }) {
  const hoje     = new Date(); hoje.setHours(0, 0, 0, 0);
  const amanha   = addDays(hoje, 1);
  const semana   = addDays(hoje, 7);

  const entregaHoje   = pedidos.filter(p => p.dt_retirada && diffDays(new Date(p.dt_retirada), hoje) === 0);
  const entregaAmanha = pedidos.filter(p => p.dt_retirada && diffDays(new Date(p.dt_retirada), amanha) === 0);
  const entregaSemana = pedidos.filter(p => p.dt_retirada && diffDays(new Date(p.dt_retirada), hoje) > 1);

  function CardExpedicao({ p, urgencia }: { p: Pedido; urgencia: "hoje" | "amanha" | "semana" }) {
    const cor  = urgencia === "hoje" ? "var(--err)" : urgencia === "amanha" ? "var(--warn)" : "var(--t3)";
    const bg   = urgencia === "hoje" ? "rgba(244,63,94,.07)" : urgencia === "amanha" ? "rgba(245,158,11,.07)" : "var(--surf2)";
    const itens = (p.itens_pedido ?? []) as any[];
    const pecas = itens.reduce((s: number, i: any) => s + i.quantidade, 0);
    const prazoStr = p.dt_retirada
      ? new Date(p.dt_retirada).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
      : "—";
    return (
      <div style={{ background: bg, border: `1px solid ${cor}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: cor }}>{p.id}</span>
          <span style={{ fontSize: 11, color: cor, fontWeight: 700 }}>↗ {prazoStr}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 600, marginBottom: 4 }}>
          {(p as any).clientes?.nome ?? "—"}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--t2)" }}>
          <span>{p.m2_total?.toFixed(2)} m²</span>
          <span>·</span>
          <span>{pecas} peças</span>
          <span>·</span>
          <span style={{ color: COR_STATUS[p.status] ?? "var(--t3)" }}>{p.status}</span>
        </div>
      </div>
    );
  }

  function Secao({ titulo, cor, items, urgencia }: { titulo: string; cor: string; items: Pedido[]; urgencia: "hoje" | "amanha" | "semana" }) {
    if (items.length === 0) return null;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: cor }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{titulo}</span>
          <span style={{ fontSize: 11, color: "var(--t3)" }}>({items.length})</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(p => <CardExpedicao key={p.id} p={p} urgencia={urgencia} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      {pedidos.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--t3)", paddingTop: 80, fontSize: 13 }}>
          Nenhum pedido com entrega nos próximos 7 dias.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 800 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { label: "Hoje",        value: entregaHoje.length,   cor: "var(--err)"  },
              { label: "Amanhã",      value: entregaAmanha.length, cor: "var(--warn)" },
              { label: "Esta semana", value: entregaSemana.length, cor: "var(--t2)"   },
            ].map(c => (
              <div key={c.label} style={{ flex: 1, background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: c.cor, lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 6 }}>{c.label}</div>
              </div>
            ))}
          </div>
          <Secao titulo="Entrega Hoje"   cor="var(--err)"  items={entregaHoje}   urgencia="hoje"   />
          <Secao titulo="Entrega Amanhã" cor="var(--warn)" items={entregaAmanha} urgencia="amanha" />
          <Secao titulo="Esta Semana"    cor="var(--t2)"   items={entregaSemana} urgencia="semana" />
        </div>
      )}
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function ProgramacaoPage() {
  const [aba,          setAba]          = useState<"gantt" | "dashboard" | "expedicao">("gantt");
  const [zoom,         setZoom]         = useState<"dia" | "semana" | "mes">("semana");
  const [dataBase,     setDataBase]     = useState<Date>(() => getMonday(new Date()));
  const [linhas,       setLinhas]       = useState<ProducaoLinha[]>([]);
  const [config,       setConfig]       = useState<ConfigTempoProducao[]>([]);
  const [programacoes, setProg]         = useState<ProgramacaoProducao[]>([]);
  const [semProg,      setSemProg]      = useState<Pedido[]>([]);
  const [expedicao,    setExpedicao]    = useState<Pedido[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [erroLoad,     setErroLoad]     = useState("");
  const [dragId,       setDragId]       = useState<string | null>(null);
  const [modalAgendar, setModalAgendar] = useState<Pedido | null>(null);
  const [modalBloco,   setModalBloco]   = useState<ProgramacaoProducao | null>(null);
  const [modalLote,    setModalLote]    = useState(false);
  const [filtroLinha,  setFiltroLinha]  = useState<number | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [busca,        setBusca]        = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [metricas,     setMetricas]     = useState<Awaited<ReturnType<typeof getMetricasProducao>> | null>(null);
  const [calendario,   setCalendario]   = useState<Set<string>>(new Set());
  const [bloqueios,    setBloqueios]    = useState<BloqueioLinha[]>([]);
  const [calibracao,   setCalibracao]   = useState<DadosCalibracao[]>([]);
  const [modalBloqueio, setModalBloqueio] = useState<{ id: number; nome: string } | null | "global">(undefined as any);
  const [modalRetrabalho, setModalRetrabalho] = useState<ProgramacaoProducao | null>(null);
  // Feedback de toast
  const [toast,        setToast]        = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }

  const dias   = diasVisiveis(zoom, dataBase);
  const horas  = horasVisiveis();
  const colW   = COL_W[zoom];
  const totalWidth = zoom === "dia" ? horas.length * colW : dias.length * colW;

  async function load() {
    setLoading(true);
    setErroLoad("");
    try {
      const from2 = zoom === "dia" ? dataBase : dias[0];
      const to2   = addDays(zoom === "dia" ? dataBase : dias[dias.length - 1], 1);
      const [lin, cfg, sem, exp, cal, blq] = await Promise.all([
        getLinhas(), getConfigTempo(), getPedidosSemProgramacao(), getPedidosExpedicao(),
        getCalendario(), getBloqueiosLinha(from2, addDays(to2, 30)),
      ]);
      setCalendario(cal);
      setBloqueios(blq);
      setLinhas(lin); setConfig(cfg); setSemProg(sem); setExpedicao(exp);
      const from = zoom === "dia" ? dataBase : dias[0];
      const to   = addDays(zoom === "dia" ? dataBase : dias[dias.length - 1], 1);
      const progs = await getProgramacao(from, to);
      setProg(progs);
    } catch (e: any) {
      setErroLoad("Erro ao carregar dados: " + (e?.message ?? "verifique a conexão."));
    } finally {
      setLoading(false);
    }
  }

  async function loadMetricas() {
    try {
      const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
      const [m, c] = await Promise.all([
        getMetricasProducao(from, addDays(from, 30)),
        getCalibracaoTempos(),
      ]);
      setMetricas(m);
      setCalibracao(c);
    } catch {}
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
    if (zoom === "semana")    setDataBase(getMonday(new Date()));
    else if (zoom === "mes")  setDataBase(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    else                      setDataBase(new Date());
  }

  function tituloPeriodo() {
    if (zoom === "dia") return dataBase.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    if (zoom === "semana") {
      const fim = addDays(dataBase, 6);
      return `${dataBase.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
    }
    return dataBase.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  async function handleDragEnd(e: DragEndEvent) {
    setDragId(null);
    const { active, delta, over } = e;
    const prog = programacoes.find(p => p.id === active.id);
    if (!prog?.dt_inicio_previsto) return;

    const daysShifted  = zoom === "dia" ? 0 : Math.round(delta.x / colW);
    const hoursShifted = zoom === "dia" ? Math.round(delta.x / colW) : 0;
    const novaLinhaId  = over?.id && Number(over.id) !== prog.linha_id ? Number(over.id) : undefined;

    if (daysShifted === 0 && hoursShifted === 0 && !novaLinhaId) return;

    const novaDt = new Date(prog.dt_inicio_previsto);
    if (daysShifted  !== 0) novaDt.setDate(novaDt.getDate() + daysShifted);
    if (hoursShifted !== 0) novaDt.setHours(novaDt.getHours() + hoursShifted);

    // manual=true: trava o bloco para que o auto-agendamento nunca o mova de novo
    const ok = await reagendar(prog.id, novaDt, prog.duracao_estimada_min ?? 60, novaLinhaId, undefined, true);
    if (ok) {
      showToast(novaLinhaId ? "Pedido movido para outra linha." : "Pedido reagendado.");
      await load();
    }
  }

  async function handleAgendar(dtInicio: Date, linhaCorteId: number, linhaLapId?: number) {
    if (!modalAgendar) return;
    const itens = (modalAgendar.itens_pedido ?? []) as { id: number; m2: number; quantidade: number; lapidacao: number; produto_nome: string }[];
    const pecasTotal = itens.reduce((s, i) => s + i.quantidade, 0);

    // linhaCorteId === -1 sinaliza chapa inteira (sem corte)
    const result = linhaCorteId === -1
      ? await agendarChapaInteira(modalAgendar.id, pecasTotal, linhas, dtInicio, calendario)
      : await criarProgramacaoPedido(modalAgendar.id, itens, config, linhas, dtInicio, linhaCorteId, linhaLapId, calendario);

    if (!result.ok) {
      alert(result.erro ?? "Erro ao agendar.");
      return;
    }
    showToast("Pedido agendado com sucesso.");
    setModalAgendar(null);
    await load();
  }

  async function handleAgendarLote(dtInicio: Date, linhaCorteId: number) {
    const pedidosLote = semProg.filter(p => selecionados.has(p.id));
    let dtAtual = new Date(dtInicio);
    let erros = 0;

    for (const p of pedidosLote) {
      const itens = (p.itens_pedido ?? []) as { id: number; m2: number; quantidade: number; lapidacao: number; produto_nome: string }[];
      const tempos = calcularTempoEstimado(itens, config);
      const result = await criarProgramacaoPedido(p.id, itens, config, linhas, dtAtual, linhaCorteId, undefined);
      if (result.ok) {
        // avança a data para o próximo pedido (1 dia após o fim estimado)
        const diasNecessarios = Math.max(1, Math.ceil(tempos.corte_min / 480));
        dtAtual = addDays(dtAtual, diasNecessarios + 1);
      } else {
        erros++;
      }
    }

    setModalLote(false);
    setSelecionados(new Set());
    showToast(erros > 0 ? `${pedidosLote.length - erros} agendados, ${erros} com conflito.` : `${pedidosLote.length} pedidos agendados.`);
    await load();
  }

  async function handleIniciar() {
    if (!modalBloco) return;
    await atualizarStatusProgramacao(modalBloco.id, "Em Execução", new Date());
    showToast("Produção iniciada.");
    setModalBloco(null); await load();
  }
  async function handleConcluir() {
    if (!modalBloco) return;
    await atualizarStatusProgramacao(modalBloco.id, "Concluído", new Date());
    showToast("Pedido concluído.");
    setModalBloco(null); await load();
  }
  async function handleDeletar() {
    if (!modalBloco) return;
    if (!confirm(`Remover o agendamento de ${modalBloco.pedido_id}?`)) return;
    await deletarProgramacao(modalBloco.id);
    showToast("Agendamento removido.");
    setModalBloco(null); await load();
  }

  // ── Resize de duração ──────────────────────────────────────
  async function handleResizeFim(id: string, novaDur: number) {
    const prog = programacoes.find(p => p.id === id);
    if (!prog?.dt_inicio_previsto) return;
    const ok = await reagendar(prog.id, new Date(prog.dt_inicio_previsto), novaDur, undefined, undefined, true);
    if (ok) {
      showToast(`Duração ajustada para ${formatarDuracao(novaDur)}.`);
      await load();
    }
  }

  // ── Auto-agendamento ────────────────────────────────────────
  const [autoAgendando, setAutoAgendando] = useState(false);

  async function handleAutoAgendar() {
    if (semProg.length === 0) { showToast("Não há pedidos para agendar."); return; }
    const linhasCorte = linhas.filter(l => l.tipo === "Corte");
    if (linhasCorte.length === 0) { showToast("Nenhuma linha de corte configurada."); return; }

    const confirmar = window.confirm(
      `Auto-agendar ${semProg.length} pedido${semProg.length > 1 ? "s" : ""}?\n\n` +
      `Critério: prioridade por folga real até o prazo (atrasados primeiro) + distribuição entre linhas.\n` +
      `Lapidação não é incluída automaticamente.`
    );
    if (!confirmar) return;

    setAutoAgendando(true);

    // Cursor real por linha (APS · Fase 2): retoma exatamente de onde o
    // último bloco termina — sem mais o "+1 dia inteiro" fixo de antes.
    // Se a linha estiver livre agora, usa o próprio "agora" como ponto de
    // partida, deixando o alocarBloco decidir se ainda cabe hoje.
    const agora = new Date();
    const cursorPorLinha: Record<number, Date> = {};
    for (const l of linhasCorte) {
      const ultimo = [...programacoes]
        .filter(p => p.linha_id === l.id && p.status !== "Cancelado" && p.dt_fim_previsto)
        .sort((a, b) => new Date(b.dt_fim_previsto!).getTime() - new Date(a.dt_fim_previsto!).getTime())[0];
      cursorPorLinha[l.id] = ultimo?.dt_fim_previsto ? new Date(ultimo.dt_fim_previsto) : agora;
    }

    // Bloqueios específicos de cada linha (manutenção/recesso) + calendário
    // global, combinados — antes os bloqueios de linha só apareciam como
    // hachura visual no Gantt, sem impedir o agendamento automático.
    const bloqueadosPorLinha = construirDiasBloqueadosPorLinha(linhasCorte, calendario, bloqueios);

    // Ordena por score de prioridade (atraso > folga real até o prazo,
    // considerando o tempo de produção que falta — não só a data em si);
    // desempata por m² maior
    const pendentes = [...semProg].sort((a, b) => {
      const scoreA = calcularPrioridadePedido(a, (a.itens_pedido ?? []) as any[], config, agora).score;
      const scoreB = calcularPrioridadePedido(b, (b.itens_pedido ?? []) as any[], config, agora).score;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return (b.m2_total ?? 0) - (a.m2_total ?? 0);
    });

    let agendados = 0, erros = 0;

    while (pendentes.length > 0) {
      // Linha menos ocupada (cursor mais cedo)
      const linha = linhasCorte.reduce((best, l) =>
        cursorPorLinha[l.id].getTime() < cursorPorLinha[best.id].getTime() ? l : best
      );

      // Gap-fill: entre os pendentes, prioriza o de maior score que ainda
      // caiba no tempo restante do expediente de hoje nessa linha; se
      // nenhum couber, agenda o mais prioritário mesmo assim (só empurra
      // pro próximo dia útil, nunca fica ocioso à toa).
      const minutosLivres = minutosRestantesNoDia(cursorPorLinha[linha.id], linha);
      const idx = proximaTarefaParaEncaixe(
        pendentes,
        minutosLivres,
        p => calcularTempoEstimado((p.itens_pedido ?? []) as any[], config).corte_min,
      );

      const pedido = pendentes[idx];
      const itens = (pedido.itens_pedido ?? []) as { id: number; m2: number; quantidade: number; lapidacao: number; produto_nome: string }[];

      const result = await criarProgramacaoPedido(
        pedido.id, itens, config, linhas, cursorPorLinha[linha.id], linha.id, undefined,
        bloqueadosPorLinha[linha.id] ?? calendario,
      );

      if (result.ok && result.fimCorte) {
        agendados++;
        cursorPorLinha[linha.id] = result.fimCorte;
      } else {
        erros++;
        cursorPorLinha[linha.id] = proximoDiaUtil(addDays(cursorPorLinha[linha.id], 1), calendario);
      }
      pendentes.splice(idx, 1);
    }

    setAutoAgendando(false);
    showToast(
      erros > 0
        ? `${agendados} agendados · ${erros} com conflito`
        : `✓ ${agendados} pedido${agendados > 1 ? "s" : ""} agendado${agendados > 1 ? "s" : ""} automaticamente`
    );
    await load();
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selecionarTodos() {
    setSelecionados(new Set(semProgFiltrada.map(p => p.id)));
  }
  function limparSelecao() { setSelecionados(new Set()); }

  const linhasFiltradas = linhas.filter(l => !filtroLinha || l.id === filtroLinha);
  const progFiltradas   = programacoes.filter(p =>
    (!filtroLinha  || p.linha_id === filtroLinha) &&
    (!filtroStatus || p.status   === filtroStatus)
  );
  const semProgFiltrada = semProg.filter(p => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return p.id.toLowerCase().includes(b) ||
      ((p as any).clientes?.nome ?? "").toLowerCase().includes(b);
  });

  const pedidosLoteAtual = semProg.filter(p => selecionados.has(p.id));

  // ── Fila priorizada (APS · Fase 1) ──────────────────────────
  // Ordena por score de prioridade (atraso > folga real até o prazo) e
  // sinaliza pedidos agrupáveis (mesmo produto principal na fila), sem
  // alterar como o agendamento em si é feito — só a ordem de exibição/sugestão.
  const filaPriorizada = useMemo(() => {
    const agora = new Date();
    const base = semProgFiltrada.map(p => {
      const itens = (p.itens_pedido ?? []) as any[];
      return {
        pedido: p,
        prioridade: calcularPrioridadePedido(p, itens, config, agora),
        produto: produtoPrincipal(itens),
      };
    });
    const contagemGrupo = new Map<string, number>();
    for (const b of base) if (b.produto) contagemGrupo.set(b.produto, (contagemGrupo.get(b.produto) ?? 0) + 1);

    return base
      .map(b => ({ ...b, grupoSimilar: b.produto ? (contagemGrupo.get(b.produto) ?? 1) - 1 : 0 }))
      .sort((a, b) => b.prioridade.score - a.prioridade.score);
  }, [semProgFiltrada, config]);

  // Posição da linha "agora" no Gantt
  const agora = new Date();
  const agoraLeft = (() => {
    if (zoom === "dia") {
      const h = agora.getHours() - 8 + agora.getMinutes() / 60;
      return h >= 0 && h <= 9 ? h * colW : null;
    }
    const idx = dias.findIndex(d => d.toDateString() === agora.toDateString());
    return idx >= 0 ? idx * colW + (agora.getHours() / 24) * colW : null;
  })();

  // Contagem de alertas para badge na tab
  const nAtrasados = metricas?.atrasados ?? 0;

  return (
    <AppLayout>
      {/* Toast de feedback */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--surf3)", border: "1px solid var(--acc)", borderRadius: 10,
          padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "var(--acc)",
          zIndex: 1000, boxShadow: "0 4px 24px rgba(0,0,0,.4)",
          animation: "fadeIn .2s ease",
        }}>
          ✓ {toast}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* ─── CABEÇALHO ─────────────────────────────────────── */}
        <div style={{
          padding: "12px 20px 10px", borderBottom: "1px solid var(--b1)",
          flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.4px", margin: 0 }}>
              Programação da Produção
            </h1>
            <p style={{ fontSize: 11, color: "var(--t3)", margin: "2px 0 0" }}>APS Simplificado · Urban Glass</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {(["gantt", "dashboard", "expedicao"] as const).map(t => {
              const labels = { gantt: "◧ Gantt", dashboard: "◭ Dashboard", expedicao: "↗ Expedição" };
              const badge  = t === "dashboard" && nAtrasados > 0 ? nAtrasados : null;
              return (
                <button key={t} onClick={() => setAba(t)} style={{
                  padding: "7px 16px", borderRadius: 8, border: "1px solid",
                  borderColor: aba === t ? "var(--acc)" : "var(--b2)",
                  background: aba === t ? "rgba(61,255,160,.12)" : "transparent",
                  color: aba === t ? "var(--acc)" : "var(--t2)",
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                  position: "relative",
                }}>
                  {labels[t]}
                  {badge && (
                    <span style={{
                      position: "absolute", top: -5, right: -5,
                      background: "var(--err)", color: "#fff",
                      fontSize: 9, fontWeight: 800,
                      padding: "1px 4px", borderRadius: 10,
                      minWidth: 16, textAlign: "center",
                    }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
            <Link href="/programacao/tv" target="_blank" style={{
              padding: "7px 14px", borderRadius: 8, border: "1px solid var(--b2)",
              background: "transparent", color: "var(--t3)", fontWeight: 700,
              fontSize: 12, cursor: "pointer", textDecoration: "none",
              display: "flex", alignItems: "center", gap: 5,
            }} title="Abrir modo TV para o chão de fábrica">
              ⬡ TV
            </Link>
          </div>
        </div>

        {/* Erro de carregamento */}
        {erroLoad && (
          <div style={{
            padding: "10px 20px", background: "rgba(244,63,94,.1)", borderBottom: "1px solid var(--err)",
            fontSize: 12, color: "var(--err)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>⚠ {erroLoad}</span>
            <button onClick={load} style={{ background: "transparent", border: "1px solid var(--err)", borderRadius: 6, color: "var(--err)", fontSize: 11, padding: "2px 10px", cursor: "pointer" }}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* ─── ABA GANTT ─────────────────────────────────────── */}
        {aba === "gantt" && (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* Timeline */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

              {/* Controles */}
              <div style={{
                padding: "8px 14px", borderBottom: "1px solid var(--b1)",
                display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap",
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

                <button onClick={navAnterior} className="btn bg xs">◀</button>
                <button onClick={irHoje}      className="btn bg xs">Hoje</button>
                <button onClick={navProximo}  className="btn bg xs">▶</button>

                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tituloPeriodo()}
                </span>

                {/* Filtros */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <select className="fc" style={{ padding: "4px 8px", fontSize: 11, width: 150 }}
                    value={filtroLinha ?? ""} onChange={e => setFiltroLinha(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Todas as linhas</option>
                    {linhas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                  <select className="fc" style={{ padding: "4px 8px", fontSize: 11, width: 140 }}
                    value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                    <option value="">Todos os status</option>
                    {["Agendado", "Em Execução", "Concluído"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Legenda */}
              <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--b1)", background: "var(--surf2)", flexShrink: 0 }}>
                <LegendaCores />
              </div>

              {/* Gantt */}
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

                      {/* Cabeçalho de datas */}
                      <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 10, background: "var(--surf)", borderBottom: "1px solid var(--b2)" }}>
                        <div style={{ width: LABEL_W, flexShrink: 0, padding: "10px 14px", fontSize: 10, color: "var(--t3)", fontWeight: 700, borderRight: "1px solid var(--b2)", position: "sticky", left: 0, zIndex: 20, background: "var(--surf)" }}>
                          LINHA
                        </div>
                        <div style={{ display: "flex", position: "relative" }}>
                          {(zoom === "dia" ? horas : dias).map((slot, i) => {
                            const isHoje = zoom !== "dia" && new Date(slot as Date).toDateString() === agora.toDateString();
                            return (
                              <div key={i} style={{
                                width: colW, flexShrink: 0,
                                padding: zoom === "mes" ? "10px 2px" : "10px 6px",
                                fontSize: zoom === "mes" ? 9 : 11,
                                fontWeight: isHoje ? 800 : 600,
                                color: isHoje ? "var(--acc)" : "var(--t2)",
                                textAlign: "center", borderRight: "1px solid var(--b1)",
                                background: isHoje ? "rgba(61,255,160,0.07)" : "transparent",
                              }}>
                                {zoom === "dia" ? formatHour(slot as number) : formatDate(slot as Date, zoom === "mes")}
                              </div>
                            );
                          })}
                          {/* Linha de "agora" */}
                          {agoraLeft !== null && (
                            <div style={{
                              position: "absolute", left: agoraLeft, top: 0, bottom: 0,
                              width: 2, background: "var(--acc)", zIndex: 8, opacity: 0.6,
                              pointerEvents: "none",
                            }} />
                          )}
                        </div>
                      </div>

                      {/* Linhas de produção */}
                      {linhasFiltradas.length === 0 ? (
                        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
                          {linhas.length === 0
                            ? "Nenhuma linha encontrada. Execute sql/fix-programacao-rls.sql no Supabase."
                            : "Nenhuma linha no filtro selecionado."}
                        </div>
                      ) : (
                      <div style={{ position: "relative" }}>
                      {/* SVG de setas de dependência (Corte → Lapidação por item) */}
                      {(() => {
                        const visStart = zoom === "dia" ? dataBase : dias[0];
                        const setas = progFiltradas.filter(p => p.predecessor_id);
                        if (setas.length === 0) return null;
                        return (
                          <svg
                            style={{
                              position: "absolute", top: 0, left: LABEL_W,
                              width: totalWidth, height: linhasFiltradas.length * ROW_H,
                              pointerEvents: "none", zIndex: 4, overflow: "visible",
                            }}
                          >
                            <defs>
                              <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                <path d="M0,0 L6,3 L0,6 Z" fill="rgba(167,139,250,0.7)" />
                              </marker>
                            </defs>
                            {setas.map(prog => {
                              const pred = programacoes.find(p => p.id === prog.predecessor_id);
                              if (!pred) return null;
                              const predRowIdx = linhasFiltradas.findIndex(l => l.id === pred.linha_id);
                              const currRowIdx = linhasFiltradas.findIndex(l => l.id === prog.linha_id);
                              if (predRowIdx < 0 || currRowIdx < 0) return null;
                              const x1 = blocoLeft(pred, zoom, visStart) + calcBlocoWidth(pred.duracao_estimada_min ?? 60, zoom);
                              const y1 = predRowIdx * ROW_H + ROW_H / 2;
                              const x2 = blocoLeft(prog, zoom, visStart);
                              const y2 = currRowIdx * ROW_H + ROW_H / 2;
                              const cx1 = x1 + Math.min(40, (x2 - x1) * 0.4);
                              const cx2 = x2 - Math.min(40, (x2 - x1) * 0.4);
                              return (
                                <path
                                  key={`dep-${prog.id}`}
                                  d={`M ${x1} ${y1} C ${cx1} ${y1} ${cx2} ${y2} ${x2} ${y2}`}
                                  fill="none"
                                  stroke="rgba(167,139,250,0.55)"
                                  strokeWidth={1.5}
                                  strokeDasharray="5 3"
                                  markerEnd="url(#arr)"
                                />
                              );
                            })}
                          </svg>
                        );
                      })()}
                      {linhasFiltradas.map(linha => {
                        const blocos = progFiltradas.filter(p => p.linha_id === linha.id);
                        const minTotal = blocos.reduce((s, p) => s + (p.duracao_estimada_min ?? 0), 0);
                        const horasCap = linha.capacidade_horas_dia * Math.max(1, dias.length);
                        const pctCap   = Math.min(100, Math.round((minTotal / (horasCap * 60)) * 100));
                        const corCap   = pctCap > 90 ? "var(--err)" : pctCap > 70 ? "var(--warn)" : "var(--ok)";
                        return (
                          <div key={linha.id} style={{ display: "flex", borderBottom: "1px solid var(--b1)", minHeight: ROW_H }}>

                            {/* Label sticky */}
                            <div style={{
                              width: LABEL_W, flexShrink: 0, padding: "12px 14px",
                              display: "flex", flexDirection: "column", justifyContent: "center", gap: 3,
                              borderRight: "1px solid var(--b2)",
                              position: "sticky", left: 0, background: "var(--surf)", zIndex: 5,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 9, height: 9, borderRadius: "50%", background: linha.cor, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                  {linha.nome}
                                </span>
                                <button
                                  title="Gerenciar bloqueios desta linha"
                                  onClick={() => setModalBloqueio({ id: linha.id, nome: linha.nome })}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 12, padding: "1px 3px", lineHeight: 1, flexShrink: 0 }}>
                                  🔒
                                </button>
                              </div>
                              <div style={{ paddingLeft: 17, display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 10, color: "var(--t3)" }}>
                                  {blocos.length} {blocos.length !== 1 ? "itens" : "item"}
                                </span>
                                {/* Mini barra de ocupação */}
                                <div style={{ flex: 1, height: 3, background: "var(--b2)", borderRadius: 99, overflow: "hidden" }}>
                                  <div style={{ width: `${pctCap}%`, height: "100%", background: corCap, borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 9, color: corCap, fontWeight: 700 }}>{pctCap}%</span>
                              </div>
                              <div style={{ fontSize: 10, color: "var(--t3)", paddingLeft: 17 }}>
                                {formatarDuracao(minTotal)} est.
                              </div>
                            </div>

                            {/* Área droppable */}
                            <LinhaDroppable id={linha.id}>
                              {/* Grade */}
                              {(zoom === "dia" ? horas : dias).map((_, i) => {
                                const isHoje = zoom !== "dia" && dias[i] && new Date(dias[i]).toDateString() === agora.toDateString();
                                const tipo   = zoom !== "dia" && dias[i]
                                  ? getDiaTipo(new Date(dias[i]), linha.id, calendario, bloqueios)
                                  : null;
                                const hachura = tipo ? HATCH[tipo].bg : null;
                                return (
                                  <div key={i} style={{
                                    position: "absolute", left: i * colW, top: 0, width: colW, height: "100%",
                                    borderRight: "1px solid var(--b1)",
                                    background: hachura ?? (isHoje ? "rgba(61,255,160,0.04)" : "transparent"),
                                  }} />
                                );
                              })}

                              {/* Linha de agora (vertical) */}
                              {agoraLeft !== null && (
                                <div style={{
                                  position: "absolute", left: agoraLeft, top: 0, bottom: 0,
                                  width: 2, background: "var(--acc)", zIndex: 3, opacity: 0.4,
                                  pointerEvents: "none",
                                }} />
                              )}

                              {/* Blocos */}
                              {blocos.map(prog => (
                                <BlocoProducao
                                  key={prog.id} prog={prog} zoom={zoom}
                                  visibleStart={zoom === "dia" ? dataBase : dias[0]}
                                  onClick={setModalBloco}
                                  onResizeFim={handleResizeFim}
                                />
                              ))}
                            </LinhaDroppable>
                          </div>
                        );
                      })}
                      </div>
                      )}

                      {/* Barra de capacidade geral */}
                      <div style={{ display: "flex", borderTop: "2px solid var(--b2)", background: "var(--surf2)" }}>
                        <div style={{ width: LABEL_W, flexShrink: 0, padding: "9px 14px", fontSize: 10, color: "var(--t3)", fontWeight: 700, borderRight: "1px solid var(--b2)", position: "sticky", left: 0, background: "var(--surf2)", zIndex: 5 }}>
                          OCUPAÇÃO
                        </div>
                        <div style={{ flex: 1, padding: "9px 14px", display: "flex", gap: 20, flexWrap: "wrap" }}>
                          {linhasFiltradas.map(l => {
                            const minTotal  = progFiltradas.filter(p => p.linha_id === l.id).reduce((s, p) => s + (p.duracao_estimada_min ?? 0), 0);
                            const horasCap  = l.capacidade_horas_dia * Math.max(1, dias.length);
                            const pct       = Math.min(100, Math.round((minTotal / (horasCap * 60)) * 100));
                            const cor       = pct > 90 ? "var(--err)" : pct > 70 ? "var(--warn)" : "var(--ok)";
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

            {/* ─── PAINEL SEM PROGRAMAÇÃO ──────────────────── */}
            <div style={{ width: 278, flexShrink: 0, borderLeft: "1px solid var(--b1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Header do painel */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Sem Programação</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                      color: semProg.length > 0 ? "var(--warn)" : "var(--ok)",
                      background: semProg.length > 0 ? "rgba(245,158,11,.12)" : "rgba(16,185,129,.12)",
                    }}>
                      {semProg.length}
                    </span>
                    {semProg.length > 0 && (
                      <button
                        className="btn pri"
                        style={{ fontSize: 10, padding: "3px 8px" }}
                        onClick={handleAutoAgendar}
                        disabled={autoAgendando}
                        title="Agendar todos automaticamente — prazo mais urgente primeiro, distribuindo entre linhas"
                      >
                        {autoAgendando ? "…" : "⚡ Auto"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Busca */}
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar pedido ou cliente…"
                  className="fc"
                  style={{ padding: "5px 10px", fontSize: 11, width: "100%", boxSizing: "border-box" }}
                />

                {/* Controles de seleção */}
                {selecionados.size > 0 ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--acc)", fontWeight: 700, flex: 1 }}>
                      {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
                    </span>
                    <button className="btn pri" style={{ fontSize: 10, padding: "4px 10px" }}
                      onClick={() => setModalLote(true)}>
                      Agendar lote
                    </button>
                    <button className="btn bg" style={{ fontSize: 10, padding: "4px 8px" }}
                      onClick={limparSelecao}>
                      ✕
                    </button>
                  </div>
                ) : (
                  semProgFiltrada.length > 1 && (
                    <button className="btn bg" style={{ marginTop: 8, width: "100%", fontSize: 10, padding: "4px 0" }}
                      onClick={selecionarTodos}>
                      Selecionar todos ({semProgFiltrada.length})
                    </button>
                  )
                )}
              </div>

              {/* Lista */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                {semProgFiltrada.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--t3)", fontSize: 12, padding: "32px 12px" }}>
                    {busca ? "Nenhum resultado para esta busca." : "✓ Todos os pedidos estão programados"}
                  </div>
                ) : filaPriorizada.map(({ pedido: p, prioridade, grupoSimilar }, idx) => {
                  const statusCol  = COR_STATUS[p.status] ?? "var(--t3)";
                  const itens      = p.itens_pedido ?? [];
                  const pecas      = (itens as any[]).reduce((s: number, i: any) => s + i.quantidade, 0);
                  const prazoStr   = p.dt_retirada ? new Date(p.dt_retirada).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
                  const { atrasado, emRisco, folgaHoras } = prioridade;
                  const sel        = selecionados.has(p.id);
                  const isChapa    = isPedidoSomenteChapas(p);
                  const folgaStr   = atrasado
                    ? `atrasado ${formatarDuracao(Math.round(Math.abs(folgaHoras) * 60))}`
                    : Number.isFinite(folgaHoras) ? `folga ${formatarDuracao(Math.round(folgaHoras * 60))}` : null;

                  return (
                    <div key={p.id} style={{
                      background: sel ? "rgba(61,255,160,.08)" : "var(--surf2)",
                      border: `1px solid ${atrasado ? "var(--err)" : emRisco ? "var(--warn)" : isChapa ? "#a78bfa" : sel ? "var(--acc)" : "var(--b2)"}`,
                      borderRadius: 10, padding: "10px 10px", marginBottom: 6, cursor: "pointer",
                    }}
                      onClick={() => toggleSelecionado(p.id)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color: "var(--t3)", width: 14, textAlign: "right", flexShrink: 0 }} title="Posição na fila de prioridade">
                            #{idx + 1}
                          </span>
                          <div style={{
                            width: 14, height: 14, borderRadius: 4, border: `2px solid ${sel ? "var(--acc)" : "var(--b2)"}`,
                            background: sel ? "var(--acc)" : "transparent", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {sel && <span style={{ color: "#090b10", fontSize: 9, fontWeight: 900 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: isChapa ? "#a78bfa" : "var(--acc)" }}>{p.id}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {isChapa && (
                            <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700, background: "rgba(167,139,250,.12)", padding: "1px 6px", borderRadius: 10 }}>
                              ▣ Chapa
                            </span>
                          )}
                          {grupoSimilar > 0 && (
                            <span title="Outros pedidos na fila com o mesmo produto principal — podem ser agrupados para reduzir setup" style={{ fontSize: 10, color: "var(--t2)", fontWeight: 700, background: "var(--b1)", padding: "1px 6px", borderRadius: 10 }}>
                              ≈ agrupável ({grupoSimilar})
                            </span>
                          )}
                          {atrasado && (
                            <span style={{ fontSize: 10, color: "var(--err)", fontWeight: 700, background: "rgba(244,63,94,.12)", padding: "1px 6px", borderRadius: 10 }}>
                              ATRASADO
                            </span>
                          )}
                          {!atrasado && emRisco && (
                            <span style={{ fontSize: 10, color: "var(--warn)", fontWeight: 700, background: "rgba(245,158,11,.12)", padding: "1px 6px", borderRadius: 10 }}>
                              EM RISCO
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--t1)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(p as any).clientes?.nome ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t2)", display: "flex", gap: 6, marginBottom: 3 }}>
                        <span>{p.m2_total?.toFixed(1)}m²</span>
                        <span>·</span>
                        <span>{pecas}pç</span>
                        <span>·</span>
                        <span style={{ color: atrasado ? "var(--err)" : emRisco ? "var(--warn)" : "var(--t3)" }}>↗{prazoStr}</span>
                        {folgaStr && (
                          <>
                            <span>·</span>
                            <span style={{ color: atrasado ? "var(--err)" : "var(--t3)" }}>{folgaStr}</span>
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: statusCol, marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.status}
                      </div>
                      <button
                        className="btn pri"
                        style={{ width: "100%", fontSize: 11, padding: "5px 0" }}
                        onClick={(e) => { e.stopPropagation(); setModalAgendar(p); }}
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

        {/* ─── ABA DASHBOARD ──────────────────────────────── */}
        {aba === "dashboard" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            {!metricas ? (
              <div style={{ textAlign: "center", color: "var(--t3)", paddingTop: 80, fontSize: 13 }}>Carregando métricas…</div>
            ) : (
              <>
                <DashboardConteudo metricas={metricas} />
                {calibracao.length > 0 && (
                  <div style={{ marginTop: 24, background: "var(--surf2)", borderRadius: 12, border: "1px solid var(--b2)", padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--acc)", marginBottom: 14, letterSpacing: ".05em" }}>
                      CALIBRAÇÃO DE TEMPOS — Estimado vs Real
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: "var(--t3)", fontWeight: 700 }}>
                          {["Etapa","Amostras","Estimado","Real","Fator"].map(h => (
                            <th key={h} style={{ textAlign: "left", padding: "4px 10px", borderBottom: "1px solid var(--b2)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {calibracao.map(row => {
                          const fatorCor = row.fator_ajuste > 1.2 ? "var(--err)" : row.fator_ajuste < 0.8 ? "var(--ok)" : "var(--t2)";
                          return (
                            <tr key={row.etapa} style={{ borderBottom: "1px solid var(--b1)" }}>
                              <td style={{ padding: "6px 10px", color: "var(--t1)", fontWeight: 600 }}>{row.etapa}</td>
                              <td style={{ padding: "6px 10px", color: "var(--t3)" }}>{row.count}</td>
                              <td style={{ padding: "6px 10px", color: "var(--t2)" }}>{formatarDuracao(row.media_estimado_min)}</td>
                              <td style={{ padding: "6px 10px", color: "var(--t2)" }}>{formatarDuracao(row.media_real_min)}</td>
                              <td style={{ padding: "6px 10px", fontWeight: 700, color: fatorCor }}>
                                {row.fator_ajuste}×
                                {row.fator_ajuste > 1.2 && <span style={{ fontSize: 10, marginLeft: 4 }}>↑ subestimado</span>}
                                {row.fator_ajuste < 0.8 && <span style={{ fontSize: 10, marginLeft: 4 }}>↓ superestimado</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 8 }}>
                      Fator &gt; 1.0 = real demorou mais que o estimado. Use esses valores para ajustar a Config de Tempo.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── ABA EXPEDIÇÃO ──────────────────────────────── */}
        {aba === "expedicao" && <AbaExpedicao pedidos={expedicao} />}

      </div>

      {/* ─── MODAIS ─────────────────────────────────────── */}
      {modalAgendar && (
        <ModalAgendar pedido={modalAgendar} linhas={linhas} config={config}
          onConfirmar={handleAgendar} onFechar={() => setModalAgendar(null)} />
      )}
      {modalLote && pedidosLoteAtual.length > 0 && (
        <ModalAgendamentoLote pedidos={pedidosLoteAtual} linhas={linhas} config={config}
          onConfirmar={handleAgendarLote} onFechar={() => setModalLote(false)} />
      )}
      {modalBloco && (
        <ModalBloco prog={modalBloco} linhas={linhas}
          onFechar={() => setModalBloco(null)}
          onIniciar={handleIniciar} onConcluir={handleConcluir} onDeletar={handleDeletar}
          onRetirada={load}
          onRetrabalho={() => { setModalRetrabalho(modalBloco); setModalBloco(null); }} />
      )}

      {modalRetrabalho && (
        <ModalRetrabalho
          prog={modalRetrabalho}
          onFechar={() => setModalRetrabalho(null)}
          onSalvo={async () => { setModalRetrabalho(null); showToast("Retrabalho registrado."); await load(); }} />
      )}

      {modalBloqueio !== undefined && modalBloqueio !== null && (
        <ModalBloqueioLinha
          linha={typeof modalBloqueio === "object" ? modalBloqueio : null}
          bloqueiosExistentes={bloqueios}
          onFechar={() => setModalBloqueio(undefined as any)}
          onSalvo={async () => { await load(); }} />
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
          {metricas.atrasados > 0     && <Alerta cor="var(--err)"  icon="⚠"  texto={`${metricas.atrasados} pedido${metricas.atrasados>1?"s":""} atrasado${metricas.atrasados>1?"s":""}`} />}
          {metricas.vencemHoje > 0    && <Alerta cor="var(--warn)" icon="⏰" texto={`${metricas.vencemHoje} pedido${metricas.vencemHoje>1?"s":""} vence hoje`} />}
          {metricas.vencemSemana > 0  && <Alerta cor="var(--acc5)" icon="📅" texto={`${metricas.vencemSemana} vencem esta semana`} />}
          {metricas.capacidadePorLinha.some(l => l.pct > 90) && <Alerta cor="var(--err)" icon="🔴" texto="Linha sobrecarregada (> 90%)" />}
          {metricas.histReprogramacoes > 5 && <Alerta cor="var(--acc4)" icon="↻" texto={`${metricas.histReprogramacoes} reprogramações no período`} />}
        </div>
      )}

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 12, padding: "16px 18px", borderTop: `3px solid ${c.col}` }}>
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
        <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 12, padding: "18px 18px 12px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: "var(--t1)" }}>Capacidade por Linha</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dadosCapacidade} barSize={36} barGap={4}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--t2)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--t2)" }} unit="h" width={36} />
              <Tooltip contentStyle={{ background: "#1c2130", border: "1px solid #243050", borderRadius: 8, fontSize: 12, color: "#dde1f0" }} formatter={(v: number) => [`${v}h`, ""]} />
              <Bar dataKey="ocupadas" name="Ocupadas" fill="#3dffa0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="livres"   name="Livres"   fill="#1c2540" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 12, padding: "18px 18px 12px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: "var(--t1)" }}>Status dos Pedidos</div>
          {dadosStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={dadosStatus} dataKey="value" cx="50%" cy="45%" outerRadius={72} paddingAngle={3}>
                  {dadosStatus.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1c2130", border: "1px solid #243050", borderRadius: 8, fontSize: 12, color: "#dde1f0" }} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "var(--t2)" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", color: "var(--t3)", paddingTop: 70, fontSize: 12 }}>Nenhum dado no período</div>
          )}
        </div>
      </div>

      {/* Métricas secundárias */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
        <MetricaRow label="Peças programadas"     value={String(metricas.pecasProgramadas)} />
        <MetricaRow label="M² concluído"           value={metricas.m2Concluido + " m²"} />
        <MetricaRow label="Taxa de atraso"         value={metricas.taxaAtraso + "%"} />
        <MetricaRow label="Tempo médio de corte"   value={formatarDuracao(metricas.tempoMedioCorte)} />
        <MetricaRow label="Tempo médio lapidação"  value={formatarDuracao(metricas.tempoMedioLapidacao)} />
        <MetricaRow label="Reprogramações"         value={String(metricas.histReprogramacoes)} />
      </div>
    </div>
  );
}

function Alerta({ cor, icon, texto }: { cor: string; icon: string; texto: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "var(--surf2)", border: `1px solid ${cor}`, borderRadius: 8, fontSize: 12, color: cor, fontWeight: 600 }}>
      <span>{icon}</span><span>{texto}</span>
    </div>
  );
}
function MetricaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--t2)" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>{value}</span>
    </div>
  );
}
