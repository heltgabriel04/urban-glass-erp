"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPedidoById } from "@/services/pedidos.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import type { Pedido } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";

interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; pedidoId?: string; }
interface EspacoLivre { x: number; y: number; l: number; a: number; }
interface CorteLinha { seq: number; dir: "V" | "H"; pos: number; ini: number; fim: number; }
interface ChapaData { W: number; H: number; prod: string; placed: PecaPlacada[]; free: EspacoLivre[]; cortes?: CorteLinha[] | null; }

// Paleta de cores modernas para as peças
const FILL_COLORS = [
  "#dbeafe","#dcfce7","#fef9c3","#fce7f3","#ede9fe","#ffedd5",
  "#cffafe","#d1fae5","#fef3c7","#fae8ff","#e0f2fe","#ecfdf5",
];
const STROKE_COLORS = [
  "#2563eb","#16a34a","#ca8a04","#db2777","#7c3aed","#ea580c",
  "#0891b2","#059669","#d97706","#a21caf","#0284c7","#047857",
];

function ChapaSVG({ chapa, bord, escala = 1 }: { chapa: ChapaData; bord: number; escala?: number }) {
  const BASE = 580;
  const VW = Math.round(BASE * escala);
  const VH = Math.round(VW * chapa.H / chapa.W);
  const sx = VW / chapa.W;
  const sy = VH / chapa.H;
  const bordPx = bord * sx;

  // Agrupa peças por produto para legenda de cores
  const prodColors: Record<string, number> = {};
  let colorCount = 0;
  chapa.placed.forEach(p => {
    const key = p.pedidoId ? `${p.pedidoId}:${p.prod}` : p.prod;
    if (prodColors[key] === undefined) { prodColors[key] = colorCount % FILL_COLORS.length; colorCount++; }
  });

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width={VW}
      height={VH}
      style={{ display: "block", borderRadius: "4px", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}
    >
      {/* Fundo da chapa */}
      <rect x={0} y={0} width={VW} height={VH} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} rx={2} />

      {/* Hachura de fundo — padrão de vidro */}
      <defs>
        <pattern id="glass" patternUnits="userSpaceOnUse" width={12} height={12}>
          <line x1={0} y1={12} x2={12} y2={0} stroke="#e2e8f0" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={VW} height={VH} fill="url(#glass)" />

      {/* Área de borda lapidação */}
      {bord > 0 && (
        <>
          <rect x={0} y={0} width={VW} height={VH}
            fill="none" stroke="#f97316" strokeWidth={bordPx * 2}
            strokeDasharray="5 3" opacity={0.6} />
          {/* Label borda */}
          <text x={bordPx + 2} y={bordPx - 2} fontSize={8} fill="#f97316" fontFamily="monospace" fontWeight="bold" opacity={0.8}>
            borda {bord}mm
          </text>
        </>
      )}

      {/* Retalhos aproveitáveis */}
      {chapa.free.filter(f => f.l >= 200 && f.a >= 200).map((fr, fi) => {
        const fx = (fr.x + bord) * sx;
        const fy = (fr.y + bord) * sy;
        const fw = fr.l * sx;
        const fh = fr.a * sy;
        return (
          <g key={"ret" + fi}>
            <rect x={fx} y={fy} width={fw} height={fh}
              fill="#bbf7d0" stroke="#16a34a" strokeWidth={0.8}
              strokeDasharray="3 2" opacity={0.55} />
            {fw > 24 && fh > 14 && (
              <text x={fx + fw / 2} y={fy + fh / 2 + 3} fontSize={Math.max(7, Math.min(10, fw / 8))}
                fill="#15803d" fontFamily="monospace" fontWeight="bold" textAnchor="middle" opacity={0.9}>
                ↺ ret
              </text>
            )}
          </g>
        );
      })}

      {/* Peças */}
      {chapa.placed.map((p, i) => {
        const key = p.pedidoId ? `${p.pedidoId}:${p.prod}` : p.prod;
        const colorIdx = prodColors[key];
        const fill   = FILL_COLORS[colorIdx % FILL_COLORS.length];
        const stroke = STROKE_COLORS[colorIdx % STROKE_COLORS.length];
        const px = (p.x + bord) * sx;
        const py = (p.y + bord) * sy;
        const pw = p.l * sx;
        const ph = p.a * sy;
        const fontSize = Math.max(7, Math.min(12, pw / 6));
        const numFontSize = Math.max(8, Math.min(14, Math.min(pw, ph) / 3));

        return (
          <g key={i}>
            {/* Sombra interna */}
            <rect x={px + 1} y={py + 1} width={pw} height={ph} fill="rgba(0,0,0,0.06)" rx={1} />
            {/* Peça */}
            <rect x={px} y={py} width={pw} height={ph} fill={fill} stroke={stroke} strokeWidth={1.2} rx={1} />
            {/* Gradiente topo */}
            <rect x={px} y={py} width={pw} height={Math.min(ph * 0.35, 12)}
              fill="rgba(255,255,255,0.45)" rx={1} />
            {/* Número da peça */}
            {pw > 16 && ph > 12 && (
              <text x={px + pw / 2} y={py + ph / 2 - (pw > 50 && ph > 28 ? fontSize / 2 + 1 : 0)}
                fontSize={numFontSize} fill={stroke} fontFamily="Arial" fontWeight="900"
                textAnchor="middle" dominantBaseline="middle">
                {i + 1}
              </text>
            )}
            {/* Dimensões */}
            {pw > 50 && ph > 28 && (
              <text x={px + pw / 2} y={py + ph / 2 + numFontSize / 2 + 3}
                fontSize={Math.max(6, fontSize - 1)} fill={stroke} fontFamily="monospace" fontWeight="bold"
                textAnchor="middle" opacity={0.85}>
                {p.l}×{p.a}
              </text>
            )}
            {/* Indicador rotacionado */}
            {p.rot && pw > 20 && ph > 14 && (
              <text x={px + pw - 4} y={py + 9} fontSize={7} fill={stroke} fontFamily="Arial" textAnchor="end" opacity={0.7}>↻</text>
            )}
          </g>
        );
      })}

      {/* Riscos de corte numerados (sequência de execução na mesa) */}
      {(chapa.cortes ?? []).map(c => {
        const isV = c.dir === "V";
        const x1 = isV ? (c.pos + bord) * sx : (c.ini + bord) * sx;
        const x2 = isV ? (c.pos + bord) * sx : (c.fim + bord) * sx;
        const y1 = isV ? (c.ini + bord) * sy : (c.pos + bord) * sy;
        const y2 = isV ? (c.fim + bord) * sy : (c.pos + bord) * sy;
        // etiqueta do nº do risco no início do segmento
        const lx = isV ? x1 : x1 + 2;
        const ly = isV ? y1 + 8 : y1;
        return (
          <g key={"corte" + c.seq}>
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#dc2626" strokeWidth={1.1} strokeDasharray="6 3" opacity={0.85} />
            <circle cx={lx} cy={ly} r={6.5} fill="#dc2626" opacity={0.92} />
            <text x={lx} y={ly + 2.5} fontSize={7.5} fill="white" fontFamily="Arial"
              fontWeight="900" textAnchor="middle">
              {c.seq}
            </text>
          </g>
        );
      })}

      {/* Dimensões da chapa */}
      {/* Largura — embaixo */}
      <rect x={0} y={VH - 14} width={VW} height={14} fill="rgba(30,30,30,0.75)" />
      <text x={VW / 2} y={VH - 4} fontSize={9} fill="white" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
        ← {chapa.W} mm →
      </text>
      {/* Altura — direita */}
      <rect x={VW - 14} y={0} width={14} height={VH} fill="rgba(30,30,30,0.75)" />
      <text
        x={VW - 4} y={VH / 2}
        fontSize={9} fill="white" fontFamily="monospace" fontWeight="bold"
        textAnchor="middle" dominantBaseline="middle"
        transform={`rotate(-90, ${VW - 7}, ${VH / 2})`}
      >
        ↑ {chapa.H} mm ↓
      </text>

      {/* Borda final */}
      <rect x={0} y={0} width={VW} height={VH} fill="none" stroke="#475569" strokeWidth={1.5} rx={2} />
    </svg>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: "8px", border: `1px solid ${color}22`, background: `${color}11`, minWidth: "80px" }}>
      <div style={{ fontSize: "9px", color: color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "18px", fontWeight: 900, color: color, fontFamily: "monospace", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "9px", color: "#64748b", marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

export default function PlanoCorte() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido]         = useState<Pedido | null>(null);
  const [otim, setOtim]             = useState<HistoricoOtimizador | null>(null);
  const [chapas, setChapas]         = useState<ChapaData[]>([]);
  const [loading, setLoading]       = useState(true);
  const [chapaAtiva, setChapaAtiva] = useState(0);
  const [escala, setEscala]         = useState(1);

  useEffect(() => {
    async function load() {
      const [ped, otims] = await Promise.all([getPedidoById(id), getOtimizacoesPorPedido(id)]);
      setPedido(ped);
      if (otims.length > 0) {
        const o = otims[0];
        setOtim(o);
        if (o.chapas_json) setChapas(o.chapas_json as ChapaData[]);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial", background: "#0d1117", color: "#aaa", flexDirection: "column", gap: "12px" }}>
      <div style={{ fontSize: "24px" }}>◈</div>
      <div>Carregando plano de corte...</div>
    </div>
  );

  if (!pedido || !otim) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", background: "#0d1117" }}>
      <div style={{ color: "#f43f5e", fontWeight: 700 }}>Nenhum plano de corte encontrado.</div>
      <button onClick={() => router.back()} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #333", background: "transparent", color: "#aaa", cursor: "pointer" }}>← Voltar</button>
    </div>
  );

  const bord = otim.borda ?? 3;
  const totalPecas = chapas.reduce((s, c) => s + c.placed.length, 0);
  const totalRetalhos = chapas.reduce((s, c) => s + c.free.filter(f => f.l >= 200 && f.a >= 200).length, 0);
  const agora = new Date();

  // Stats globais
  const areaTotal  = chapas.reduce((s, c) => s + (c.W - bord * 2) * (c.H - bord * 2), 0);
  const areaUsada  = chapas.reduce((s, c) => s + c.placed.reduce((a, p) => a + p.l * p.a, 0), 0);
  const aprovGlobal = areaTotal > 0 ? ((areaUsada / areaTotal) * 100).toFixed(1) : "0";

  const chapa = chapas[chapaAtiva];
  const usedArea  = chapa?.placed.reduce((s, p) => s + p.l * p.a, 0) ?? 0;
  const chapaM2   = chapa ? (chapa.W * chapa.H) / 1e6 : 0;
  const utilM2    = chapa ? Math.max((chapa.W - bord * 2) * (chapa.H - bord * 2), 1) / 1e6 : 0;
  const usedM2    = usedArea / 1e6;
  const retalhos  = chapa?.free.filter(f => f.l >= 200 && f.a >= 200) ?? [];
  const retM2     = retalhos.reduce((s, f) => s + (f.l * f.a) / 1e6, 0);
  const aprovPct  = utilM2 > 0 ? ((usedM2 / utilM2) * 100).toFixed(1) : "0";
  const perdaPct  = utilM2 > 0 ? (((utilM2 - usedM2) / utilM2) * 100).toFixed(1) : "0";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: 'Arial', sans-serif; background: #0d1117; color: #e2e8f0; }

        .toolbar {
          position: sticky; top: 0; z-index: 100;
          background: #111827; border-bottom: 1px solid #1f2937;
          padding: 10px 24px; display: flex; align-items: center; gap: 12px;
        }
        .btn-tb {
          padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;
          cursor: pointer; border: 1px solid #374151; background: transparent;
          color: #9ca3af; transition: all 0.15s;
        }
        .btn-tb:hover { background: #1f2937; color: #f9fafb; }
        .btn-print {
          padding: 7px 18px; border-radius: 6px; font-size: 12px; font-weight: 700;
          cursor: pointer; border: none; background: #3dffa0; color: #000;
        }

        .layout {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 0;
          height: calc(100vh - 53px);
        }
        .col-main {
          overflow-y: auto;
          padding: 20px 24px;
          display: flex; flex-direction: column; gap: 16px;
        }
        .col-side {
          overflow-y: auto;
          background: #111827;
          border-left: 1px solid #1f2937;
          padding: 16px;
          display: flex; flex-direction: column; gap: 14px;
        }

        .card {
          background: #161b25; border: 1px solid #1f2937; border-radius: 10px; padding: 16px;
        }
        .card-title {
          font-size: 10px; font-weight: 700; color: #6b7280;
          text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;
        }

        .chapa-tab {
          padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
          cursor: pointer; border: 1px solid #1f2937; background: transparent;
          color: #6b7280; transition: all 0.15s; font-family: monospace;
        }
        .chapa-tab.ativa {
          background: rgba(61,255,160,0.1); border-color: #3dffa0; color: #3dffa0;
        }

        .peca-row {
          display: grid; grid-template-columns: 28px 1fr 90px 90px 28px;
          gap: 6px; align-items: center;
          padding: 5px 8px; border-radius: 6px; font-size: 11px;
          border: 1px solid transparent;
        }
        .peca-row:nth-child(even) { background: rgba(255,255,255,0.03); }

        .ret-row {
          display: grid; grid-template-columns: 1fr 80px 50px;
          gap: 6px; align-items: center;
          padding: 5px 8px; border-radius: 6px; font-size: 11px;
          border: 1px solid rgba(22,163,74,0.2); background: rgba(22,163,74,0.05);
          margin-bottom: 4px;
        }

        @media print {
          .no-print { display: none !important; }
          .print-page { display: flex !important; flex-direction: column; gap: 14px; page-break-before: always; }
          .print-page:first-of-type { page-break-before: avoid; }
          .pecas-list { max-height: none !important; overflow: visible !important; }
          html, body { background: white; color: #000; }
          .layout { display: block; height: auto; }
          .col-main { padding: 0; overflow: visible; }
          .col-side { display: none; }
          .card { background: white; border: 1px solid #ccc; }
          .card-title { color: #374151; }
          @page { margin: 12mm; size: A4; }
        }
      `}</style>

      {/* ── TOOLBAR ── */}
      <div className="toolbar no-print">
        <button className="btn-tb" onClick={() => router.back()}>← Voltar</button>
        <div style={{ flex: 1 }}>
          <span style={{ color: "#f9fafb", fontWeight: 700, fontSize: "14px" }}>Plano de Corte</span>
          <span style={{ color: "#3dffa0", fontWeight: 700, fontSize: "14px", marginLeft: "8px" }}>{pedido.id}</span>
          <span style={{ color: "#6b7280", fontSize: "11px", marginLeft: "16px", fontFamily: "monospace" }}>
            {aprovGlobal}% aproveitamento · {chapas.length} chapa(s) · {totalPecas} peça(s)
          </span>
        </div>
        <button className="btn-print" onClick={() => window.print()}>🖨 Imprimir PDF</button>
      </div>

      <div className="layout">
        {/* ── COL PRINCIPAL ── */}
        <div className="col-main">

          {/* Seletor de chapas */}
          {chapas.length > 1 && (
            <div className="no-print" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {chapas.map((c, i) => (
                <button key={i} className={`chapa-tab${chapaAtiva === i ? " ativa" : ""}`}
                  onClick={() => setChapaAtiva(i)}>
                  Chapa {i + 1}
                  <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "5px" }}>
                    {c.prod.split(" ").slice(0, 2).join(" ")}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Renderiza chapa ativa na tela, todas no print */}
          {chapas.map((c, ci) => {
            const cUsedArea  = c.placed.reduce((s, p) => s + p.l * p.a, 0);
            const cChapaM2   = (c.W * c.H) / 1e6;
            const cUtilM2    = Math.max((c.W - bord * 2) * (c.H - bord * 2), 1) / 1e6;
            const cUsedM2    = cUsedArea / 1e6;
            const cRetalhos  = c.free.filter(f => f.l >= 200 && f.a >= 200);
            const cRetM2     = cRetalhos.reduce((s, f) => s + (f.l * f.a) / 1e6, 0);
            const cAprov     = cUtilM2 > 0 ? ((cUsedM2 / cUtilM2) * 100).toFixed(1) : "0";
            const cPerda     = cUtilM2 > 0 ? (((cUtilM2 - cUsedM2) / cUtilM2) * 100).toFixed(1) : "0";

            return (
              <div key={ci} className="print-page"
                style={{ display: ci !== chapaAtiva ? "none" : "flex", flexDirection: "column", gap: "14px" }}>

                {/* Cabeçalho da chapa */}
                <div className="card" style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "4px" }}>
                        CHAPA {ci + 1} DE {chapas.length}
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: 900, color: "#f9fafb", lineHeight: 1.1 }}>
                        {c.prod}
                      </div>
                      <div style={{ fontSize: "12px", color: "#9ca3af", fontFamily: "monospace", marginTop: "4px" }}>
                        {c.W} × {c.H} mm · {cChapaM2.toFixed(3)} m²
                      </div>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                        Cliente: <strong style={{ color: "#e2e8f0" }}>{pedido.clientes?.nome ?? "—"}</strong>
                        {" · "}Pedido: <strong style={{ color: "#3dffa0" }}>{pedido.id}</strong>
                        {" · "}Borda: <strong style={{ color: "#f97316" }}>{bord}mm</strong>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <StatBox label="Aproveitamento" value={cAprov + "%"} sub={cUsedM2.toFixed(3) + " m²"} color="#3dffa0" />
                      <StatBox label="Perda"          value={cPerda + "%"} sub={((cUtilM2 - cUsedM2)).toFixed(3) + " m²"} color="#f43f5e" />
                      <StatBox label="Peças"          value={String(c.placed.length)} color="#60a5fa" />
                      <StatBox label="Retalhos"       value={String(cRetalhos.length)} sub={cRetM2.toFixed(3) + " m²"} color="#f59e0b" />
                    </div>
                  </div>
                </div>

                {/* Diagrama */}
                <div className="card" style={{ padding: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Diagrama de Corte</span>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
                      <span style={{ width: "10px", height: "10px", background: "#bbf7d0", border: "1px dashed #16a34a", display: "inline-block", borderRadius: "2px" }} />
                      <span style={{ color: "#16a34a" }}>Retalho aproveitável</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
                      <span style={{ width: "10px", height: "10px", background: "rgba(249,115,22,0.3)", border: "1px dashed #f97316", display: "inline-block", borderRadius: "2px" }} />
                      <span style={{ color: "#f97316" }}>Borda lapidação</span>
                    </span>
                    {/* Controles de zoom */}
                    <div className="no-print" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        onClick={() => setEscala(e => Math.max(0.25, parseFloat((e - 0.25).toFixed(2))))}
                        style={{ width: "26px", height: "26px", borderRadius: "5px", border: "1px solid #374151", background: "#1f2937", color: "#e2e8f0", fontSize: "16px", lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="Diminuir"
                      >−</button>
                      <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#9ca3af", minWidth: "38px", textAlign: "center" }}>
                        {Math.round(escala * 100)}%
                      </span>
                      <button
                        onClick={() => setEscala(e => Math.min(3, parseFloat((e + 0.25).toFixed(2))))}
                        style={{ width: "26px", height: "26px", borderRadius: "5px", border: "1px solid #374151", background: "#1f2937", color: "#e2e8f0", fontSize: "16px", lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="Ampliar"
                      >+</button>
                      <button
                        onClick={() => setEscala(1)}
                        style={{ padding: "0 8px", height: "26px", borderRadius: "5px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontSize: "10px", cursor: "pointer" }}
                        title="Resetar zoom"
                      >↺</button>
                    </div>
                  </div>
                  <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "520px" }}>
                    <ChapaSVG chapa={c} bord={bord} escala={escala} />
                  </div>
                </div>

                {/* Roteiro de cortes (sequência de execução na mesa) */}
                {(c.cortes ?? []).length > 0 && (
                  <div className="card">
                    <div className="card-title" style={{ color: "#dc2626" }}>✂ Sequência de cortes ({c.cortes!.length} riscos)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "4px 0" }}>
                      {c.cortes!.map(ct => (
                        <div key={ct.seq} style={{ display: "flex", alignItems: "center", gap: "5px", background: "#1f2937", border: "1px solid #374151", borderRadius: "5px", padding: "3px 8px" }}>
                          <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: "#dc2626", color: "white", fontSize: "9px", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ct.seq}</span>
                          <span style={{ fontSize: "10.5px", fontFamily: "monospace", color: "#e2e8f0" }}>
                            {ct.dir === "V" ? "vertical" : "horizontal"} em {ct.dir === "V" ? "X" : "Y"}={ct.pos}mm
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "10px", color: "#6b7280" }}>
                      Riscos de ponta a ponta do painel, na ordem de execução — risque, destaque e siga o próximo número.
                    </div>
                  </div>
                )}

                {/* Lista de peças + retalhos */}
                <div style={{ display: "grid", gridTemplateColumns: cRetalhos.length > 0 ? "1fr 1fr" : "1fr", gap: "14px" }}>

                  {/* Peças */}
                  <div className="card">
                    <div className="card-title">Peças desta chapa ({c.placed.length})</div>
                    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 90px 90px", gap: "4px", padding: "4px 8px", marginBottom: "4px", borderBottom: "1px solid #1f2937" }}>
                      {["#","Produto","Dim. (mm)","m²"].map(h => (
                        <div key={h} style={{ fontSize: "9px", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
                      ))}
                    </div>
                    <div className="pecas-list" style={{ maxHeight: "260px", overflowY: "auto" }}>
                      {c.placed.map((p, pi) => {
                        const key = p.pedidoId ? `${p.pedidoId}:${p.prod}` : p.prod;
                        const colorIdx = pi % STROKE_COLORS.length;
                        const stroke = STROKE_COLORS[colorIdx];
                        const fill   = FILL_COLORS[colorIdx];
                        return (
                          <div key={pi} className="peca-row">
                            <div style={{ width: "22px", height: "22px", borderRadius: "4px", background: fill, border: `1.5px solid ${stroke}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 900, color: stroke, flexShrink: 0 }}>
                              {pi + 1}
                            </div>
                            <div style={{ fontSize: "11px", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.prod}
                              {p.pedidoId && p.pedidoId !== pedido.id && (
                                <span style={{ marginLeft: "4px", fontSize: "9px", color: "#6b7280" }}>({p.pedidoId})</span>
                              )}
                              {p.rot && <span style={{ marginLeft: "4px", fontSize: "9px", color: "#f59e0b" }}>↻</span>}
                            </div>
                            <div style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "monospace" }}>{p.l}×{p.a}</div>
                            <div style={{ fontSize: "11px", color: "#60a5fa", fontFamily: "monospace" }}>{((p.l * p.a) / 1e6).toFixed(4)}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #1f2937", display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6b7280", fontFamily: "monospace" }}>
                      <span>Total peças: <strong style={{ color: "#60a5fa" }}>{c.placed.length}</strong></span>
                      <span>Área usada: <strong style={{ color: "#3dffa0" }}>{cUsedM2.toFixed(3)} m²</strong></span>
                    </div>
                  </div>

                  {/* Retalhos */}
                  {cRetalhos.length > 0 && (
                    <div className="card">
                      <div className="card-title" style={{ color: "#16a34a" }}>↺ Retalhos aproveitáveis ({cRetalhos.length})</div>
                      {cRetalhos.map((f, fi) => (
                        <div key={fi} className="ret-row">
                          <div style={{ color: "#e2e8f0", fontFamily: "monospace", fontSize: "12px", fontWeight: 700 }}>
                            {f.l} × {f.a} mm
                          </div>
                          <div style={{ color: "#16a34a", fontFamily: "monospace", fontWeight: 700 }}>
                            {((f.l * f.a) / 1e6).toFixed(4)} m²
                          </div>
                          <div style={{ width: "10px", height: "10px", background: "#bbf7d0", border: "1px solid #16a34a", borderRadius: "2px" }} />
                        </div>
                      ))}
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(22,163,74,0.2)", display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6b7280", fontFamily: "monospace" }}>
                        <span>Total retalhos: <strong style={{ color: "#f59e0b" }}>{cRetalhos.length}</strong></span>
                        <span>Área: <strong style={{ color: "#16a34a" }}>{cRetM2.toFixed(3)} m²</strong></span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Rodapé da chapa */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#4b5563", padding: "4px 0", fontFamily: "monospace" }}>
                  <span>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Juiz de Fora/MG</span>
                  <span>Pedido {pedido.id} · Chapa {ci + 1}/{chapas.length} · {agora.toLocaleString("pt-BR")}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── COL LATERAL ── */}
        <div className="col-side no-print">

          {/* Resumo geral */}
          <div>
            <div className="card-title">Resumo Geral</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { label: "Pedido",         value: pedido.id,          color: "#3dffa0" },
                { label: "Cliente",        value: pedido.clientes?.nome ?? "—", color: "#e2e8f0" },
                { label: "Chapas",         value: chapas.length + " chapa(s)", color: "#60a5fa" },
                { label: "Peças total",    value: totalPecas + " peça(s)", color: "#60a5fa" },
                { label: "Aproveitamento", value: aprovGlobal + "%",   color: "#3dffa0" },
                { label: "Retalhos",       value: totalRetalhos + " retalho(s)", color: "#f59e0b" },
                { label: "Data otimização",value: new Date(otim.dt_otim + "T12:00:00").toLocaleDateString("pt-BR"), color: "#9ca3af" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "12px" }}>
                  <span style={{ color: "#6b7280" }}>{item.label}</span>
                  <span style={{ color: item.color, fontWeight: 600, fontFamily: "monospace", fontSize: "12px" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid #1f2937" }} />

          {/* Chapa ativa — detalhes */}
          {chapa && (
            <div>
              <div className="card-title">Chapa {chapaAtiva + 1} — Detalhes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  { label: "Material",      value: chapa.prod },
                  { label: "Dimensão",      value: `${chapa.W} × ${chapa.H} mm` },
                  { label: "Área total",    value: chapaM2.toFixed(3) + " m²" },
                  { label: "Área usada",    value: usedM2.toFixed(3) + " m²" },
                  { label: "Aproveitamento",value: aprovPct + "%",   color: "#3dffa0" },
                  { label: "Perda",         value: perdaPct + "%",   color: "#f43f5e" },
                  { label: "Retalhos",      value: retalhos.length + " (" + retM2.toFixed(3) + " m²)", color: "#f59e0b" },
                  { label: "Kerf/diamante", value: (otim.kerf ?? 4) + " mm" },
                  { label: "Borda",         value: bord + " mm",     color: "#f97316" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "11px" }}>
                    <span style={{ color: "#6b7280" }}>{item.label}</span>
                    <span style={{ color: (item as any).color ?? "#e2e8f0", fontWeight: 600, fontFamily: "monospace" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid #1f2937" }} />

          {/* Legenda de cores */}
          {chapa && chapa.placed.length > 0 && (
            <div>
              <div className="card-title">Legenda</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {chapa.placed.slice(0, 12).map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                    <div style={{ width: "18px", height: "18px", borderRadius: "3px", background: FILL_COLORS[i % FILL_COLORS.length], border: `1.5px solid ${STROKE_COLORS[i % STROKE_COLORS.length]}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 900, color: STROKE_COLORS[i % STROKE_COLORS.length] }}>
                      {i + 1}
                    </div>
                    <span style={{ color: "#9ca3af", fontFamily: "monospace", fontSize: "10px" }}>{p.l}×{p.a}</span>
                    {p.rot && <span style={{ color: "#f59e0b", fontSize: "9px" }}>↻</span>}
                  </div>
                ))}
                {chapa.placed.length > 12 && (
                  <div style={{ fontSize: "10px", color: "#4b5563" }}>+ {chapa.placed.length - 12} peças</div>
                )}
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid #1f2937" }} />

          {/* Ações */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button className="btn-print" onClick={() => window.print()} style={{ padding: "10px", width: "100%", borderRadius: "8px" }}>
              🖨 Imprimir PDF
            </button>
            <button className="btn-tb" onClick={() => router.back()} style={{ width: "100%", padding: "9px", borderRadius: "8px", textAlign: "center" }}>
              ← Voltar ao Pedido
            </button>
          </div>
        </div>
      </div>
    </>
  );
}