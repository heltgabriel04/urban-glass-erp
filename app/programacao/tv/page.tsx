"use client";

import { useEffect, useState } from "react";
import { getProgramacaoTV, formatarDuracao, diffDays, addDays } from "@/services/programacao.service";
import type { ProducaoLinha, ProgramacaoProducao } from "@/types";
import Link from "next/link";

type DadosLinha = {
  linha: ProducaoLinha;
  atual: ProgramacaoProducao | null;
  proximo: ProgramacaoProducao | null;
};

function horaAtual(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dataAtual(): string {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function urgenciaClass(prog: ProgramacaoProducao | null): { cor: string; label: string } {
  if (!prog) return { cor: "#4a4a6a", label: "—" };
  if (prog.status === "Em Execução") return { cor: "#3dffa0", label: "EM EXECUÇÃO" };
  const prazo = prog.pedidos?.dt_retirada ? new Date(prog.pedidos.dt_retirada) : null;
  const fim   = prog.dt_fim_previsto      ? new Date(prog.dt_fim_previsto)      : null;
  if (!prazo || !fim) return { cor: "#00c8ff", label: "AGENDADO" };
  const diff = diffDays(prazo, fim);
  if (diff < 0)  return { cor: "#f43f5e", label: "ATRASADO" };
  if (diff <= 2) return { cor: "#f59e0b", label: "URGENTE" };
  return { cor: "#3dffa0", label: "NO PRAZO" };
}

function CartaoLinha({ dados, tamanho }: { dados: DadosLinha; tamanho: number }) {
  const { linha, atual, proximo } = dados;
  const urg    = urgenciaClass(atual);
  const itens  = (atual?.pedidos?.itens_pedido ?? []) as any[];
  const pecas  = itens.reduce((s: number, i: any) => s + i.quantidade, 0);
  const prazo  = atual?.pedidos?.dt_retirada
    ? new Date(atual.pedidos.dt_retirada).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : null;

  const proxPecas = ((proximo?.pedidos?.itens_pedido ?? []) as any[]).reduce((s: number, i: any) => s + i.quantidade, 0);
  const proxInicio = proximo?.dt_inicio_previsto
    ? new Date(proximo.dt_inicio_previsto).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  const fs = tamanho <= 2 ? 1.0 : 0.85; // escala de fonte para 1-2 vs 3-4 linhas

  return (
    <div style={{
      background: "#0d1117",
      border: `2px solid ${atual ? urg.cor : "#1e2535"}`,
      borderRadius: 16,
      padding: "24px 28px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minHeight: 260,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Indicador brilhante no canto */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${urg.cor}00, ${urg.cor}, ${urg.cor}00)`,
      }} />

      {/* Nome da linha */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: linha.cor }} />
          <span style={{ fontSize: 14 * fs, fontWeight: 700, color: "#8899aa", letterSpacing: "1px", textTransform: "uppercase" }}>
            {linha.nome}
          </span>
        </div>
        <span style={{
          fontSize: 11 * fs, fontWeight: 800, color: urg.cor,
          background: `${urg.cor}18`, border: `1px solid ${urg.cor}40`,
          padding: "3px 10px", borderRadius: 20, letterSpacing: "0.5px",
        }}>
          {urg.label}
        </span>
      </div>

      {/* Pedido atual */}
      {atual ? (
        <div>
          <div style={{ fontSize: 36 * fs, fontWeight: 900, color: urg.cor, lineHeight: 1, marginBottom: 6 }}>
            {atual.pedido_id}
          </div>
          <div style={{ fontSize: 22 * fs, fontWeight: 700, color: "#e8eef4", marginBottom: 8, lineHeight: 1.2 }}>
            {atual.pedidos?.clientes?.nome ?? "—"}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Stat label="ÁREA"     value={`${(atual.pedidos?.m2_total ?? 0).toFixed(2)} m²`} cor="#8899aa" />
            <Stat label="PEÇAS"    value={String(pecas)}                                        cor="#8899aa" />
            <Stat label="DURAÇÃO"  value={formatarDuracao(atual.duracao_estimada_min ?? 0)}   cor="#8899aa" />
            {prazo && (
              <Stat label="PRAZO" value={`↗ ${prazo}`} cor={urg.cor} />
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 18 * fs, color: "#2a3040", fontWeight: 700 }}>LINHA LIVRE</span>
        </div>
      )}

      {/* Próximo pedido */}
      {proximo && (
        <div style={{
          borderTop: "1px solid #1e2535", paddingTop: 12,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 10, color: "#4a5568", fontWeight: 700, letterSpacing: "1px", whiteSpace: "nowrap" }}>
            PRÓXIMO
          </span>
          <span style={{ fontSize: 14 * fs, fontWeight: 800, color: "#4a9eff" }}>{proximo.pedido_id}</span>
          <span style={{ fontSize: 13 * fs, color: "#8899aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {proximo.pedidos?.clientes?.nome ?? "—"}
          </span>
          <span style={{ fontSize: 12 * fs, color: "#4a5568", whiteSpace: "nowrap" }}>
            {proximo.pedidos?.m2_total?.toFixed(1)}m² · {proxPecas}pç
          </span>
          {proxInicio && (
            <span style={{ fontSize: 11 * fs, color: "#4a5568", whiteSpace: "nowrap" }}>
              {proxInicio}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cor }: { label: string; value: string; cor: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#4a5568", fontWeight: 700, letterSpacing: "1px", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: cor }}>{value}</div>
    </div>
  );
}

export default function ProgramacaoTVPage() {
  const [dados,  setDados]  = useState<Record<number, DadosLinha>>({});
  const [hora,   setHora]   = useState(horaAtual());
  const [data,   setData]   = useState(dataAtual());
  const [loading, setLoading] = useState(true);

  async function carregar() {
    try {
      const d = await getProgramacaoTV();
      setDados(d);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    const refreshInterval = setInterval(carregar, 30000);
    const clockInterval   = setInterval(() => {
      setHora(horaAtual());
      setData(dataAtual());
    }, 1000);
    return () => {
      clearInterval(refreshInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const linhasOrdenadas = Object.values(dados).sort((a, b) => a.linha.id - b.linha.id);
  const nLinhas = linhasOrdenadas.length;

  const gridCols = nLinhas <= 1 ? "1fr"
    : nLinhas <= 2 ? "1fr 1fr"
    : nLinhas <= 3 ? "1fr 1fr 1fr"
    : "1fr 1fr";

  const totalAtrasados = linhasOrdenadas.filter(d => {
    if (!d.atual) return false;
    const prazo = d.atual.pedidos?.dt_retirada ? new Date(d.atual.pedidos.dt_retirada) : null;
    const fim   = d.atual.dt_fim_previsto       ? new Date(d.atual.dt_fim_previsto)      : null;
    return prazo && fim && diffDays(prazo, fim) < 0;
  }).length;

  return (
    <div style={{
      minHeight: "100vh", background: "#060a0f",
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Mono', 'DM Sans', monospace",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 32px", borderBottom: "1px solid #1a2030",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3dffa0", boxShadow: "0 0 8px #3dffa0" }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: "#3dffa0", letterSpacing: "2px", textTransform: "uppercase" }}>
            Urban Glass · Produção
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {totalAtrasados > 0 && (
            <div style={{
              background: "rgba(244,63,94,.15)", border: "1px solid #f43f5e",
              borderRadius: 8, padding: "6px 14px", fontSize: 13,
              color: "#f43f5e", fontWeight: 700,
            }}>
              ⚠ {totalAtrasados} atrasado{totalAtrasados > 1 ? "s" : ""}
            </div>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#e8eef4", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {hora}
            </div>
            <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2, textTransform: "capitalize" }}>
              {data}
            </div>
          </div>
        </div>
      </div>

      {/* Grid de linhas */}
      <div style={{ flex: 1, padding: "24px 32px" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#4a5568", paddingTop: 100, fontSize: 16 }}>
            Carregando programação…
          </div>
        ) : nLinhas === 0 ? (
          <div style={{ textAlign: "center", color: "#2a3040", paddingTop: 100, fontSize: 18 }}>
            Nenhuma linha de produção configurada.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 20, height: "100%" }}>
            {linhasOrdenadas.map(d => (
              <CartaoLinha key={d.linha.id} dados={d} tamanho={nLinhas} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 32px", borderTop: "1px solid #0d1117",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: "#1e2535" }}>Atualiza a cada 30 segundos</span>
        <Link href="/programacao" style={{
          fontSize: 11, color: "#2a3a50", textDecoration: "none",
          border: "1px solid #1a2535", borderRadius: 6, padding: "4px 12px",
        }}>
          ← Voltar ao Gantt
        </Link>
      </div>
    </div>
  );
}
