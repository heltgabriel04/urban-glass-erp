"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  getLinhas, getConfigTempo, getProgramacao, getPedidosSemProgramacao,
  criarProgramacaoPedido, reagendar, atualizarStatusProgramacao, deletarProgramacao,
  calcularTempoEstimado, formatarDuracao, getMetricasProducao,
  addDays, getMonday, diffDays, startOfDay, toISOLocal,
} from "@/services/programacao.service";
import type {
  ProducaoLinha, ConfigTempoProducao, ProgramacaoProducao, Pedido, TempoEstimado,
} from "@/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { DndContext, useDraggable, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// ─── CONSTANTES ───────────────────────────────────────────────

const COL_W: Record<string, number> = { dia: 80, semana: 130, mes: 44 };
const ROW_H = 90;
const LABEL_W = 160;

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
  if (prog.status === "Concluído") return "#2a2a3a";
  if (prog.status === "Em Execução") return "#1a4a2a";
  const prazo = prog.pedidos?.dt_retirada ? new Date(prog.pedidos.dt_retirada) : null;
  const fim   = prog.dt_fim_previsto      ? new Date(prog.dt_fim_previsto)      : null;
  if (!prazo || !fim) return "#1a2a4a";
  const diff = diffDays(prazo, fim);
  if (diff < 0)  return "#3a0f1a"; // vermelho
  if (diff <= 2) return "#3a2a0a"; // amarelo
  return "#0a2a1a"; // verde
}

function bordaBloco(prog: ProgramacaoProducao): string {
  if (prog.status === "Concluído") return "#4a4a6a";
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
  if (zoom === "dia") {
    return [new Date(base)];
  }
  if (zoom === "semana") {
    return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  }
  const firstDay = new Date(base.getFullYear(), base.getMonth(), 1);
  const lastDay  = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return Array.from({ length: lastDay.getDate() }, (_, i) => addDays(firstDay, i));
}

function horasVisiveis(): number[] {
  return Array.from({ length: 9 }, (_, i) => i + 8); // 08..16
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
  const cw = COL_W[zoom];
  if (zoom === "dia") {
    return Math.max(cw * 0.9, (dur / 60) * cw);
  }
  const dias = Math.max(0.5, dur / 480);
  return Math.max(cw * 0.8, dias * cw - 4);
}

// ─── COMPONENTE BLOCO (DRAGGABLE) ────────────────────────────

function BlocoProducao({
  prog, zoom, visibleStart, onClick,
}: {
  prog: ProgramacaoProducao;
  zoom: string;
  visibleStart: Date;
  onClick: (p: ProgramacaoProducao) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: prog.id,
    data: { prog },
  });

  const left  = blocoLeft(prog, zoom, visibleStart);
  const width = blocoWidth(prog, zoom);
  const borda = bordaBloco(prog);
  const bg    = corBloco(prog);

  const style: React.CSSProperties = {
    position: "absolute",
    left,
    top: 6,
    width,
    height: ROW_H - 14,
    background: bg,
    border: `1.5px solid ${borda}`,
    borderRadius: 8,
    padding: "5px 8px",
    cursor: isDragging ? "grabbing" : "grab",
    userSelect: "none",
    zIndex: isDragging ? 50 : 2,
    opacity: isDragging ? 0.7 : 1,
    transform: CSS.Translate.toString(transform),
    overflow: "hidden",
    transition: isDragging ? "none" : "box-shadow 0.15s",
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
      <div style={{ fontSize: 11, fontWeight: 700, color: borda, lineHeight: 1.2, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {prog.pedido_id}
      </div>
      <div style={{ fontSize: 10, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {prog.pedidos?.clientes?.nome ?? "—"}
      </div>
      {width > 90 && (
        <div style={{ fontSize: 9, color: "var(--t2)", marginTop: 2, display: "flex", gap: 6, flexWrap: "nowrap" }}>
          <span>{prog.pedidos?.m2_total?.toFixed(1)}m²</span>
          <span>{pecas}pç</span>
          <span>↗{prazo}</span>
        </div>
      )}
      {width > 90 && (
        <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 1 }}>
          {formatarDuracao(prog.duracao_estimada_min ?? 0)}
        </div>
      )}
    </div>
  );
}

// ─── MODAL DE AGENDAMENTO ────────────────────────────────────

function ModalAgendar({
  pedido, linhas, config, onConfirmar, onFechar,
}: {
  pedido: Pedido;
  linhas: ProducaoLinha[];
  config: ConfigTempoProducao[];
  onConfirmar: (dtInicio: Date, linhaCorteId: number, linhaLapId: number | undefined) => Promise<void>;
  onFechar: () => void;
}) {
  const linhasCorte = linhas.filter(l => l.tipo === "Corte");
  const linhasLap   = linhas.filter(l => l.tipo === "Lapidação");
  const semTabelas  = linhas.length === 0;
  const semConfig   = config.length === 0;

  // Data em dd/mm/aaaa
  const amanhaBR = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  })();
  const [dtDisplay, setDtDisplay] = useState(amanhaBR);
  const [linhaCorteId, setLinhaCorteId] = useState<number>(linhasCorte[0]?.id ?? 0);
  const [linhaLapId,   setLinhaLapId]   = useState<number | undefined>(linhasLap[0]?.id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Atualiza seleção quando linhas carregam depois do modal abrir
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
    if (!dt) { setErro("Data inválida. Use o formato dd/mm/aaaa."); return; }
    if (!linhaCorteId) { setErro("Selecione uma linha de corte."); return; }
    setSalvando(true);
    await onConfirmar(dt, linhaCorteId, tempos.tem_lapidacao ? linhaLapId : undefined);
    setSalvando(false);
  }

  const dtValida = !!parseBR(dtDisplay);

  return (
    <div className="mov open">
      <div className="mod" style={{ width: 460 }}>
        <div className="mhd">
          <span>Agendar Pedido {pedido.id}</span>
          <button className="btn icon" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Aviso de tabelas não criadas */}
          {semTabelas && (
            <div style={{ background: "rgba(244,63,94,.12)", border: "1px solid var(--err)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--err)" }}>
              <strong>⚠ Configuração pendente</strong>
              <div style={{ marginTop: 4, color: "var(--t1)", lineHeight: 1.5 }}>
                Execute o arquivo <strong>sql/programacao-producao.sql</strong> no Supabase SQL Editor para criar as tabelas e linhas de produção.
              </div>
            </div>
          )}

          {/* Info do pedido */}
          <div style={{ background: "var(--surf2)", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
            <strong style={{ color: "var(--t1)" }}>{(pedido as any).clientes?.nome ?? "—"}</strong>
            <div style={{ color: "var(--t2)", marginTop: 4, display: "flex", gap: 12 }}>
              <span>{pedido.m2_total?.toFixed(2)} m²</span>
              <span>{itens.reduce((s, i) => s + i.quantidade, 0)} peças</span>
              {itens.length === 0 && <span style={{ color: "var(--warn)" }}>⚠ itens não carregados</span>}
            </div>
          </div>

          {/* Estimativa de tempo */}
          <div style={{ background: "var(--surf3)", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--acc)", display: "flex", justifyContent: "space-between" }}>
              <span>Estimativa de Tempo</span>
              {semConfig && <span style={{ color: "var(--warn)", fontWeight: 400, fontSize: 10 }}>⚠ configuração não encontrada</span>}
            </div>
            {semConfig ? (
              <div style={{ color: "var(--t3)", fontSize: 11 }}>
                Tabela <em>config_tempo_producao</em> não encontrada. Execute o script SQL.
              </div>
            ) : (
              <div style={{ display: "flex", gap: 20 }}>
                <div>
                  <div style={{ color: "var(--t2)" }}>Corte</div>
                  <div style={{ color: "var(--t1)", fontWeight: 700 }}>
                    {tempos.corte_min > 0 ? formatarDuracao(tempos.corte_min) : "—"}
                  </div>
                </div>
                {tempos.tem_lapidacao && (
                  <div>
                    <div style={{ color: "var(--t2)" }}>Lapidação</div>
                    <div style={{ color: "var(--acc2)", fontWeight: 700 }}>{formatarDuracao(tempos.lapidacao_min)}</div>
                  </div>
                )}
                <div>
                  <div style={{ color: "var(--t2)" }}>Total</div>
                  <div style={{ color: "var(--t1)", fontWeight: 700 }}>
                    {tempos.total_min > 0 ? formatarDuracao(tempos.total_min) : "—"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Data de início dd/mm/aaaa */}
          <div className="fg">
            <label className="fl" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Data de Início</span>
              {dtDisplay.length === 10 && !dtValida && (
                <span style={{ color: "var(--err)", fontSize: 10 }}>data inválida</span>
              )}
            </label>
            <input
              className="fc"
              value={dtDisplay}
              onChange={e => setDtDisplay(maskData(e.target.value))}
              placeholder="dd/mm/aaaa"
              maxLength={10}
              inputMode="numeric"
              style={{ borderColor: dtDisplay.length === 10 && !dtValida ? "var(--err)" : undefined }}
            />
          </div>

          {/* Linha de corte */}
          <div className="fg">
            <label className="fl">Linha de Corte</label>
            {linhasCorte.length === 0 ? (
              <div className="fc" style={{ color: "var(--t3)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
                Nenhuma linha configurada
              </div>
            ) : (
              <select className="fc" value={linhaCorteId} onChange={e => setLinhaCorteId(Number(e.target.value))}>
                {linhasCorte.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            )}
          </div>

          {/* Linha de lapidação (só se tiver itens com lapidação) */}
          {tempos.tem_lapidacao && (
            <div className="fg">
              <label className="fl">Linha de Lapidação</label>
              {linhasLap.length === 0 ? (
                <div className="fc" style={{ color: "var(--t3)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
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
            <div style={{ color: "var(--err)", fontSize: 12, fontWeight: 600 }}>⚠ {erro}</div>
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
  prog: ProgramacaoProducao;
  onFechar: () => void;
  onIniciar: () => void;
  onConcluir: () => void;
  onDeletar: () => void;
}) {
  const borda = bordaBloco(prog);
  const prazo = prog.pedidos?.dt_retirada
    ? new Date(prog.pedidos.dt_retirada).toLocaleDateString("pt-BR")
    : "—";
  const inicio = prog.dt_inicio_previsto
    ? new Date(prog.dt_inicio_previsto).toLocaleDateString("pt-BR")
    : "—";
  const fim = prog.dt_fim_previsto
    ? new Date(prog.dt_fim_previsto).toLocaleDateString("pt-BR")
    : "—";

  const statusColor: Record<string, string> = {
    Agendado: "var(--t2)", "Em Execução": "var(--acc)", Concluído: "var(--ok)", Cancelado: "var(--err)",
  };

  return (
    <div className="mov open">
      <div className="mod" style={{ width: 460 }}>
        <div className="mhd" style={{ borderLeft: `4px solid ${borda}`, paddingLeft: 12 }}>
          <span>{prog.pedido_id} — {prog.etapa}</span>
          <button className="btn icon" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd" style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Stat label="Cliente" value={prog.pedidos?.clientes?.nome ?? "—"} />
            <Stat label="Cidade"  value={prog.pedidos?.clientes?.cidade ?? "—"} />
            <Stat label="M² Total" value={(prog.pedidos?.m2_total ?? 0).toFixed(2) + " m²"} />
            <Stat label="Peças"   value={String((prog.pedidos?.itens_pedido ?? []).reduce((s, i) => s + i.quantidade, 0))} />
            <Stat label="Início Previsto" value={inicio} />
            <Stat label="Fim Previsto"    value={fim}    />
            <Stat label="Prazo Entrega"   value={prazo}  col={borda} />
            <Stat label="Duração Est."    value={formatarDuracao(prog.duracao_estimada_min ?? 0)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--t3)", fontSize: 11 }}>Status:</span>
            <span style={{ fontWeight: 700, color: statusColor[prog.status] ?? "var(--t1)" }}>{prog.status}</span>
          </div>
          {prog.pedidos?.obs && (
            <div style={{ fontSize: 11, color: "var(--t2)", background: "var(--surf2)", padding: "6px 10px", borderRadius: 6 }}>
              {prog.pedidos.obs}
            </div>
          )}
        </div>
        <div className="mft" style={{ flexWrap: "wrap", gap: 8 }}>
          {prog.status === "Agendado"    && <button className="btn pri"  onClick={onIniciar}>▶ Iniciar</button>}
          {prog.status === "Em Execução" && <button className="btn pri"  onClick={onConcluir} style={{ background: "var(--ok)" }}>✓ Concluir</button>}
          <button className="btn bg" onClick={onDeletar} style={{ color: "var(--err)", borderColor: "var(--err)", marginLeft: "auto" }}>Remover</button>
          <button className="btn bg" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, col }: { label: string; value: string; col?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, color: col ?? "var(--t1)" }}>{value}</div>
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function ProgramacaoPage() {
  const [aba, setAba]               = useState<"gantt" | "dashboard">("gantt");
  const [zoom, setZoom]             = useState<"dia" | "semana" | "mes">("semana");
  const [dataBase, setDataBase]     = useState<Date>(() => getMonday(new Date()));
  const [linhas, setLinhas]         = useState<ProducaoLinha[]>([]);
  const [config, setConfig]         = useState<ConfigTempoProducao[]>([]);
  const [programacoes, setProg]     = useState<ProgramacaoProducao[]>([]);
  const [semProg, setSemProg]       = useState<Pedido[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dragId, setDragId]         = useState<string | null>(null);
  const [modalAgendar, setModalAgendar] = useState<Pedido | null>(null);
  const [modalBloco, setModalBloco] = useState<ProgramacaoProducao | null>(null);
  const [filtroLinha, setFiltroLinha] = useState<number | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [metricas, setMetricas]     = useState<Awaited<ReturnType<typeof getMetricasProducao>> | null>(null);

  const dias = diasVisiveis(zoom, dataBase);
  const horas = horasVisiveis();
  const colW = COL_W[zoom];

  const totalWidth = zoom === "dia"
    ? horas.length * colW
    : dias.length * colW;

  async function load() {
    setLoading(true);
    const [lin, cfg, sem] = await Promise.all([getLinhas(), getConfigTempo(), getPedidosSemProgramacao()]);
    setLinhas(lin);
    setConfig(cfg);
    setSemProg(sem);

    const from = zoom === "dia" ? dataBase : dias[0];
    const to   = addDays(zoom === "dia" ? dataBase : dias[dias.length - 1], 1);
    const progs = await getProgramacao(from, to);
    setProg(progs);
    setLoading(false);
  }

  async function loadMetricas() {
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    const to   = addDays(from, 30);
    const m = await getMetricasProducao(from, to);
    setMetricas(m);
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
    if (zoom === "semana") setDataBase(getMonday(new Date()));
    else if (zoom === "mes") setDataBase(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    else setDataBase(new Date());
  }

  function tituloPeríodo() {
    if (zoom === "dia") return dataBase.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
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

    let daysShifted = 0;
    if (zoom === "dia") {
      const hoursShifted = Math.round(delta.x / colW);
      if (hoursShifted === 0) return;
      const novaDt = new Date(prog.dt_inicio_previsto);
      novaDt.setHours(novaDt.getHours() + hoursShifted);
      await reagendar(prog.id, novaDt, prog.duracao_estimada_min ?? 60);
    } else {
      daysShifted = Math.round(delta.x / colW);
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
  const progFiltradas = programacoes.filter(p =>
    (!filtroLinha || p.linha_id === filtroLinha) &&
    (!filtroStatus || p.status === filtroStatus)
  );

  const hoje = new Date();
  const hojeOffset = zoom === "dia" ? -1 : diffDays(hoje, dias[0]);

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* ─── CABEÇALHO ─────────────────────────────────────────── */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px" }}>Programação da Produção</h1>
              <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>APS Simplificado · Urban Glass</p>
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
        </div>

        {/* ─── ABA GANTT ─────────────────────────────────────────── */}
        {aba === "gantt" && (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* Timeline principal */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Barra de controles */}
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
                {/* Zoom */}
                <div style={{ display: "flex", border: "1px solid var(--b2)", borderRadius: 8, overflow: "hidden" }}>
                  {(["dia", "semana", "mes"] as const).map(z => (
                    <button key={z} onClick={() => setZoom(z)} style={{
                      padding: "5px 12px", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      background: zoom === z ? "var(--acc)" : "transparent",
                      color: zoom === z ? "#090b10" : "var(--t2)",
                    }}>
                      {z.charAt(0).toUpperCase() + z.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Navegação de datas */}
                <button onClick={navAnterior} className="btn bg xs">◀</button>
                <button onClick={irHoje} className="btn bg xs">Hoje</button>
                <button onClick={navProximo} className="btn bg xs">▶</button>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", minWidth: 200 }}>{tituloPeríodo()}</span>

                {/* Filtros */}
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <select
                    className="fc"
                    style={{ padding: "4px 8px", fontSize: 11, width: 140 }}
                    value={filtroLinha ?? ""}
                    onChange={e => setFiltroLinha(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Todas as linhas</option>
                    {linhas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                  <select
                    className="fc"
                    style={{ padding: "4px 8px", fontSize: 11, width: 130 }}
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
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}>
                  Carregando…
                </div>
              ) : (
                <div style={{ flex: 1, overflow: "auto" }}>
                  <DndContext
                    onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
                    onDragEnd={handleDragEnd}
                  >
                    <div style={{ minWidth: LABEL_W + totalWidth + 20, position: "relative" }}>

                      {/* Cabeçalho de datas/horas */}
                      <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 10, background: "var(--surf)", borderBottom: "1px solid var(--b2)" }}>
                        <div style={{ width: LABEL_W, flexShrink: 0, padding: "8px 12px", fontSize: 10, color: "var(--t3)", fontWeight: 700, borderRight: "1px solid var(--b2)" }}>
                          LINHA
                        </div>
                        <div style={{ display: "flex" }}>
                          {(zoom === "dia" ? horas : dias).map((slot, i) => {
                            const isHoje = zoom === "dia"
                              ? false
                              : new Date(slot as Date).toDateString() === new Date().toDateString();
                            return (
                              <div
                                key={i}
                                style={{
                                  width: colW, flexShrink: 0, padding: "8px 4px",
                                  fontSize: 10, fontWeight: isHoje ? 800 : 600,
                                  color: isHoje ? "var(--acc)" : "var(--t2)",
                                  textAlign: "center", borderRight: "1px solid var(--b1)",
                                  background: isHoje ? "rgba(61,255,160,0.06)" : "transparent",
                                }}
                              >
                                {zoom === "dia" ? formatHour(slot as number) : formatDate(slot as Date, zoom === "mes")}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Linhas de produção */}
                      {linhasFiltradas.map(linha => {
                        const blocos = progFiltradas.filter(p => p.linha_id === linha.id);
                        return (
                          <div
                            key={linha.id}
                            style={{ display: "flex", borderBottom: "1px solid var(--b1)", minHeight: ROW_H }}
                          >
                            {/* Label da linha */}
                            <div style={{
                              width: LABEL_W, flexShrink: 0,
                              padding: "12px", display: "flex", flexDirection: "column",
                              justifyContent: "center", borderRight: "1px solid var(--b2)",
                              position: "sticky", left: 0, background: "var(--surf)", zIndex: 5,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: linha.cor, flexShrink: 0 }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{linha.nome}</span>
                              </div>
                              <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 3 }}>
                                {blocos.length} pedido{blocos.length !== 1 ? "s" : ""}
                              </div>
                              <div style={{ fontSize: 9, color: "var(--t3)" }}>
                                {formatarDuracao(blocos.reduce((s, p) => s + (p.duracao_estimada_min ?? 0), 0))} est.
                              </div>
                            </div>

                            {/* Área de blocos */}
                            <div style={{ flex: 1, position: "relative", minHeight: ROW_H }}>
                              {/* Colunas de grade */}
                              {(zoom === "dia" ? horas : dias).map((_, i) => {
                                const isHoje = zoom !== "dia" && dias[i] && new Date(dias[i]).toDateString() === new Date().toDateString();
                                return (
                                  <div key={i} style={{
                                    position: "absolute", left: i * colW, top: 0, width: colW, height: "100%",
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
                        <div style={{ width: LABEL_W, flexShrink: 0, padding: "8px 12px", fontSize: 10, color: "var(--t3)", fontWeight: 700, borderRight: "1px solid var(--b2)" }}>
                          OCUPAÇÃO
                        </div>
                        <div style={{ flex: 1, padding: "8px 12px", display: "flex", gap: 16 }}>
                          {linhas.map(l => {
                            const minTotal = progFiltradas
                              .filter(p => p.linha_id === l.id)
                              .reduce((s, p) => s + (p.duracao_estimada_min ?? 0), 0);
                            const horasCap = l.capacidade_horas_dia * Math.max(1, dias.length);
                            const pct = Math.min(100, Math.round((minTotal / (horasCap * 60)) * 100));
                            const cor = pct > 90 ? "var(--err)" : pct > 70 ? "var(--warn)" : "var(--ok)";
                            return (
                              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 10, color: "var(--t2)" }}>{l.nome.split("–")[1]?.trim() ?? l.nome}:</span>
                                <div style={{ width: 80, height: 6, background: "var(--b2)", borderRadius: 99, overflow: "hidden" }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: cor, borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 10, color: cor, fontWeight: 700 }}>{pct}%</span>
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

            {/* ─── PAINEL DE PENDENTES ─────────────────────────────── */}
            <div style={{
              width: 260, flexShrink: 0, borderLeft: "1px solid var(--b1)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Sem Programação</span>
                <span style={{ fontSize: 11, color: "var(--warn)", fontWeight: 700 }}>{semProg.length}</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                {semProg.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--t3)", fontSize: 11, padding: 20 }}>
                    Todos os pedidos estão programados
                  </div>
                ) : semProg.map(p => {
                  const statusCol = COR_STATUS[p.status] ?? "var(--t3)";
                  const itens = p.itens_pedido ?? [];
                  const pecas = (itens as any[]).reduce((s: number, i: any) => s + i.quantidade, 0);
                  const prazoStr = p.dt_retirada
                    ? new Date(p.dt_retirada).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                    : "—";
                  const prazoDate  = p.dt_retirada ? new Date(p.dt_retirada) : null;
                  const diasFaltam = prazoDate ? diffDays(prazoDate, new Date()) : null;
                  const urgente    = diasFaltam !== null && diasFaltam <= 3;
                  return (
                    <div
                      key={p.id}
                      style={{
                        background: "var(--surf2)", border: `1px solid ${urgente ? "var(--err)" : "var(--b2)"}`,
                        borderRadius: 8, padding: "10px 10px", marginBottom: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--acc)" }}>{p.id}</span>
                        {urgente && <span style={{ fontSize: 9, color: "var(--err)", fontWeight: 700 }}>URGENTE</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t1)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(p as any).clientes?.nome ?? "—"}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--t2)", display: "flex", gap: 8, marginBottom: 6 }}>
                        <span>{p.m2_total?.toFixed(1)}m²</span>
                        <span>{pecas}pç</span>
                        <span style={{ color: urgente ? "var(--err)" : "var(--t3)" }}>↗{prazoStr}</span>
                      </div>
                      <div style={{ fontSize: 9, color: statusCol, marginBottom: 6 }}>{p.status}</div>
                      <button
                        className="btn pri"
                        style={{ width: "100%", fontSize: 10, padding: "5px 0" }}
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

        {/* ─── ABA DASHBOARD ─────────────────────────────────────── */}
        {aba === "dashboard" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {!metricas ? (
              <div style={{ textAlign: "center", color: "var(--t3)", paddingTop: 60 }}>Carregando métricas…</div>
            ) : (
              <DashboardConteudo metricas={metricas} />
            )}
          </div>
        )}

      </div>

      {/* ─── MODAIS ─────────────────────────────────────────────── */}
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
  const CARD_COLORS = ["var(--acc)", "var(--err)", "var(--warn)", "var(--ok)", "var(--acc2)", "var(--acc4)"];

  const cards = [
    { label: "Total Programado",  value: metricas.totalProgramados, unit: "pedidos", col: "var(--acc)" },
    { label: "Em Execução",       value: metricas.emExecucao,       unit: "agora",   col: "var(--acc2)" },
    { label: "Concluídos",        value: metricas.concluidos,       unit: "pedidos", col: "var(--ok)" },
    { label: "Atrasados",         value: metricas.atrasados,        unit: "pedidos", col: "var(--err)" },
    { label: "Em Risco",          value: metricas.emRisco,          unit: "pedidos", col: "var(--warn)" },
    { label: "M² Programado",     value: metricas.m2Programado,     unit: "m²",      col: "var(--acc4)" },
  ];

  const dadosStatus = [
    { name: "No Prazo",  value: metricas.noTempo,   fill: "#3dffa0" },
    { name: "Em Risco",  value: metricas.emRisco,   fill: "#f59e0b" },
    { name: "Atrasado",  value: metricas.atrasados, fill: "#f43f5e" },
    { name: "Concluído", value: metricas.concluidos,fill: "#6b7280" },
  ].filter(d => d.value > 0);

  const dadosCapacidade = metricas.capacidadePorLinha.map(l => ({
    name: l.nome.split("–")[1]?.trim() ?? l.nome,
    ocupadas: l.horasOcupadas,
    livres: Math.max(0, l.horasDisponiveis - l.horasOcupadas),
    fill: l.cor,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Cards de métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 10,
            padding: "14px 16px", borderTop: `3px solid ${c.col}`,
          }}>
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 6, fontWeight: 600 }}>{c.label.toUpperCase()}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.col, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: "var(--t2)", marginTop: 4 }}>{c.unit}</div>
          </div>
        ))}
      </div>

      {/* Alertas */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {metricas.atrasados > 0 && (
          <Alerta cor="var(--err)" icon="⚠" texto={`${metricas.atrasados} pedido${metricas.atrasados > 1 ? "s" : ""} atrasado${metricas.atrasados > 1 ? "s" : ""}`} />
        )}
        {metricas.vencemHoje > 0 && (
          <Alerta cor="var(--warn)" icon="⏰" texto={`${metricas.vencemHoje} pedido${metricas.vencemHoje > 1 ? "s" : ""} vence hoje`} />
        )}
        {metricas.vencemSemana > 0 && (
          <Alerta cor="var(--acc5)" icon="📅" texto={`${metricas.vencemSemana} pedido${metricas.vencemSemana > 1 ? "s" : ""} vencem esta semana`} />
        )}
        {metricas.capacidadePorLinha.some(l => l.pct > 90) && (
          <Alerta cor="var(--err)" icon="🔴" texto="Linha sobrecarregada (> 90%)" />
        )}
        {metricas.histReprogramacoes > 5 && (
          <Alerta cor="var(--acc4)" icon="↻" texto={`${metricas.histReprogramacoes} reprogramações no período`} />
        )}
      </div>

      {/* Gráficos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Capacidade por linha */}
        <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, color: "var(--t1)" }}>Capacidade por Linha (período)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dadosCapacidade} barSize={32}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--t2)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--t2)" }} unit="h" />
              <Tooltip
                contentStyle={{ background: "var(--surf3)", border: "1px solid var(--b2)", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v}h`, ""]}
              />
              <Bar dataKey="ocupadas" name="Ocupadas" fill="#3dffa0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="livres"   name="Livres"   fill="#1a2035" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status dos pedidos */}
        <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, color: "var(--t1)" }}>Status dos Pedidos</div>
          {dadosStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={dadosStatus} dataKey="value" cx="50%" cy="50%" outerRadius={70} paddingAngle={3} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {dadosStatus.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--surf3)", border: "1px solid var(--b2)", borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", color: "var(--t3)", paddingTop: 60, fontSize: 12 }}>Nenhum dado no período</div>
          )}
        </div>

      </div>

      {/* Métricas adicionais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <MetricaRow label="Peças programadas"       value={String(metricas.pecasProgramadas)} />
        <MetricaRow label="M² concluído"            value={metricas.m2Concluido + " m²"} />
        <MetricaRow label="Taxa de atraso"          value={metricas.taxaAtraso + "%"} />
        <MetricaRow label="Tempo médio de corte"    value={formatarDuracao(metricas.tempoMedioCorte)} />
        <MetricaRow label="Tempo médio lapidação"   value={formatarDuracao(metricas.tempoMedioLapidacao)} />
        <MetricaRow label="Reprogramações"          value={String(metricas.histReprogramacoes)} />
      </div>

    </div>
  );
}

function Alerta({ cor, icon, texto }: { cor: string; icon: string; texto: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
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
    <div style={{ background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "var(--t2)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{value}</span>
    </div>
  );
}
