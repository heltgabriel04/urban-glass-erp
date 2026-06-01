"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPedidoById } from "@/services/pedidos.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import { formatDate } from "@/lib/formatters";
import type { Pedido } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";

interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; }
interface EspacoLivre { x: number; y: number; l: number; a: number; }
interface ChapaData { W: number; H: number; prod: string; placed: PecaPlacada[]; free: EspacoLivre[]; }

const COLS = ["#e8f0fe","#fce8e6","#e6f4ea","#fef7e0","#f3e8fd","#e8f5e9","#fff3e0","#e3f2fd","#fbe9e7","#f1f8e9"];
const BORDER_COLS = ["#1a73e8","#d93025","#1e8e3e","#f9ab00","#9334e6","#0f9d58","#e37400","#1976d2","#bf360c","#558b2f"];

function ChapaSVG({ chapa, bord, chapaNum }: { chapa: ChapaData; bord: number; chapaNum: number }) {
  const VW = 400;
  const VH = Math.round(VW * chapa.H / chapa.W);
  const sx = VW / chapa.W;
  const sy = VH / chapa.H;

  // Dimensões da borda em mm para referência
  const bordPx = bord * sx;

  return (
    <svg viewBox={"0 0 " + VW + " " + VH} width="100%" style={{ display:"block", border:"1px solid #ccc", background:"white" }}>
      {/* Fundo chapa */}
      <rect x={0} y={0} width={VW} height={VH} fill="white" />

      {/* Borda de lapidação */}
      {bord > 0 && (
        <rect
          x={0} y={0} width={VW} height={VH}
          fill="none"
          stroke="red"
          strokeWidth={bordPx * 2}
          strokeDasharray="4 2"
          opacity={0.5}
        />
      )}

      {/* Peças */}
      {chapa.placed.map((p, i) => {
        const x = (p.x + bord) * sx;
        const y = (p.y + bord) * sy;
        const w = p.l * sx;
        const h = p.a * sy;
        const col = COLS[i % COLS.length];
        const border = BORDER_COLS[i % BORDER_COLS.length];
        const num = i + 1;
        const fontSize = Math.max(7, Math.min(11, w / 6));

        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={col} stroke={border} strokeWidth={0.8} />
            {/* Número da peça */}
            {w > 15 && h > 12 && (
              <text x={x + 3} y={y + fontSize + 1} fontSize={fontSize} fill={border} fontFamily="Arial" fontWeight="bold">
                {num}
              </text>
            )}
            {/* Dimensões */}
            {w > 35 && h > 20 && (
              <text x={x + 3} y={y + fontSize * 2 + 3} fontSize={Math.max(5, fontSize - 2)} fill="#333" fontFamily="Arial">
                {p.l}.0 x {p.a}.0
              </text>
            )}
          </g>
        );
      })}

      {/* Dimensão total na base */}
      <text x={VW / 2} y={VH - 2} fontSize={8} fill="#666" fontFamily="Arial" textAnchor="middle">
        {chapa.W}.0
      </text>

      {/* Borda externa */}
      <rect x={0} y={0} width={VW} height={VH} fill="none" stroke="#333" strokeWidth={1.5} />
    </svg>
  );
}

export default function PlanoCorte() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido]   = useState<Pedido | null>(null);
  const [otim, setOtim]       = useState<HistoricoOtimizador | null>(null);
  const [chapas, setChapas]   = useState<ChapaData[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"Arial", color:"#888" }}>
      Carregando plano de corte...
    </div>
  );

  if (!pedido || !otim) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:"12px" }}>
      <div style={{ color:"#c00" }}>Nenhum plano de corte encontrado.</div>
      <button onClick={() => router.back()} style={{ padding:"8px 16px", borderRadius:"6px", border:"1px solid #ccc", cursor:"pointer" }}>← Voltar</button>
    </div>
  );

  const bord = otim.borda ?? 3;
  const totalPecas = chapas.reduce((s, c) => s + c.placed.length, 0);
  const totalM2 = chapas.reduce((s, c) => s + c.placed.reduce((ss, p) => ss + p.l * p.a, 0), 0) / 1e6;
  const agora = new Date();

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #eee; font-family: Arial, sans-serif; font-size: 11px; color: #000; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .chapa-page { page-break-after: always; }
          .chapa-page:last-child { page-break-after: avoid; }
          @page { margin: 8mm; size: A4 portrait; }
        }
        .chapa-page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 16px;
          background: white;
          padding: 8mm;
        }
      `}</style>

      {/* TOOLBAR */}
      <div className="no-print" style={{ position:"sticky", top:0, zIndex:100, background:"#222", padding:"8px 16px", display:"flex", alignItems:"center", gap:"10px" }}>
        <button onClick={() => router.back()} style={{ padding:"6px 12px", borderRadius:"4px", border:"1px solid #555", background:"transparent", color:"#ccc", cursor:"pointer", fontSize:"12px" }}>← Voltar</button>
        <div style={{ flex:1, color:"white", fontSize:"13px", fontWeight:700 }}>
          Plano de Corte — <span style={{ color:"#3dffa0" }}>{pedido.id}</span>
        </div>
        <button onClick={() => window.print()} style={{ padding:"7px 16px", borderRadius:"4px", border:"none", background:"#3dffa0", color:"#000", fontWeight:700, cursor:"pointer", fontSize:"12px" }}>
          🖨 Imprimir
        </button>
      </div>

      {/* UMA PÁGINA POR CHAPA */}
      {chapas.map((chapa, ci) => {
        const usedArea = chapa.placed.reduce((s, p) => s + p.l * p.a, 0);
        const chapaM2 = chapa.W * chapa.H / 1e6;
        const usedM2 = usedArea / 1e6;
        const retM2 = chapa.free.filter(f => f.l >= 200 && f.a >= 200).reduce((s, f) => s + f.l * f.a, 0) / 1e6;
        const aprovPct = chapaM2 > 0 ? ((usedM2 / chapaM2) * 100).toFixed(2) : "0";
        const perdaPct = chapaM2 > 0 ? (((chapaM2 - usedM2) / chapaM2) * 100).toFixed(2) : "0";
        const retalhos = chapa.free.filter(f => f.l >= 200 && f.a >= 200);

        // Peças pequenas (menores que 15% da largura do canvas)
        const pequenas = chapa.placed.filter(p => (p.l / chapa.W) < 0.15 || (p.a / chapa.H) < 0.15);

        return (
          <div key={ci} className="chapa-page">

            {/* ── CABEÇALHO ── */}
            <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"6px" }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign:"top", width:"60%" }}>
                    <div style={{ fontSize:"13px", fontWeight:900, color:"#000", letterSpacing:"-0.5px" }}>urbanglass</div>
                    <div style={{ fontSize:"8px", color:"#666", textTransform:"uppercase", letterSpacing:"1px" }}>Urban Glass Comércio Ltda</div>
                    <div style={{ fontSize:"8px", color:"#888", marginTop:"2px" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – JF/MG</div>
                  </td>
                  <td style={{ verticalAlign:"top", textAlign:"right", fontSize:"9px", color:"#555" }}>
                    <div style={{ fontWeight:700, fontSize:"11px" }}>PLANO DE CORTE</div>
                    <div>{agora.toLocaleTimeString("pt-BR")} &nbsp; {agora.toLocaleDateString("pt-BR")}</div>
                    <div>Pedido: <strong>{pedido.id}</strong> &nbsp;·&nbsp; Chapa {ci + 1} de {chapas.length}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── INFO DA MONTAGEM ── */}
            <div style={{ border:"1px solid #ccc", padding:"5px 8px", marginBottom:"6px", fontSize:"9px", background:"#fafafa" }}>
              <div>Projeto: {pedido.id} &nbsp;·&nbsp; Montagem {ci + 1} – Quantidade: 1</div>
              <div>Chapa utilizada: {chapa.W}.0 x {chapa.H}.0 mm</div>
              <div>Material: {chapa.prod}</div>
              <div>Cliente: <strong>{pedido.clientes?.nome ?? "—"}</strong></div>
            </div>

            {/* ── TOTAIS ── */}
            <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"6px", fontSize:"9px", border:"1px solid #ccc" }}>
              <thead>
                <tr style={{ background:"#eee" }}>
                  <th style={{ padding:"3px 6px", textAlign:"left", fontWeight:600 }}></th>
                  <th style={{ padding:"3px 6px", textAlign:"right", fontWeight:600 }}>Qtd:</th>
                  <th style={{ padding:"3px 6px", textAlign:"right", fontWeight:600 }}>Área (m²):</th>
                  <th style={{ padding:"3px 6px", textAlign:"right", fontWeight:600 }}>%:</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding:"2px 6px" }}>Totais</td>
                  <td style={{ padding:"2px 6px", textAlign:"right" }}>{chapa.placed.length}</td>
                  <td style={{ padding:"2px 6px", textAlign:"right", fontFamily:"monospace" }}>{usedM2.toFixed(3)}</td>
                  <td style={{ padding:"2px 6px", textAlign:"right", color:"#155724", fontWeight:700 }}>{aprovPct}%</td>
                </tr>
                <tr>
                  <td style={{ padding:"2px 6px" }}>Peças</td>
                  <td style={{ padding:"2px 6px", textAlign:"right" }}>{chapa.placed.length}</td>
                  <td style={{ padding:"2px 6px", textAlign:"right", fontFamily:"monospace" }}>{usedM2.toFixed(3)}</td>
                  <td style={{ padding:"2px 6px", textAlign:"right" }}>{aprovPct}%</td>
                </tr>
                <tr>
                  <td style={{ padding:"2px 6px" }}>Retalhos</td>
                  <td style={{ padding:"2px 6px", textAlign:"right" }}>{retalhos.length}</td>
                  <td style={{ padding:"2px 6px", textAlign:"right", fontFamily:"monospace" }}>{retM2.toFixed(3)}</td>
                  <td style={{ padding:"2px 6px", textAlign:"right" }}>{(retM2 / chapaM2 * 100).toFixed(2)}%</td>
                </tr>
                <tr>
                  <td style={{ padding:"2px 6px" }}>Sobras</td>
                  <td style={{ padding:"2px 6px", textAlign:"right" }}>0</td>
                  <td style={{ padding:"2px 6px", textAlign:"right", fontFamily:"monospace" }}>0.000</td>
                  <td style={{ padding:"2px 6px", textAlign:"right", color:"#721c24" }}>{perdaPct}%</td>
                </tr>
              </tbody>
            </table>

            {/* ── DIAGRAMA ── */}
            <div style={{ marginBottom:"6px" }}>
              <ChapaSVG chapa={chapa} bord={bord} chapaNum={ci + 1} />
            </div>

            {/* ── LEGENDA PEÇAS PEQUENAS ── */}
            {pequenas.length > 0 && (
              <div style={{ marginBottom:"6px" }}>
                <div style={{ fontSize:"9px", fontWeight:700, marginBottom:"3px" }}>Legenda para as peças pequenas:</div>
                <table style={{ borderCollapse:"collapse", fontSize:"9px" }}>
                  <thead>
                    <tr style={{ background:"#eee" }}>
                      <th style={{ padding:"2px 5px", textAlign:"left" }}>Peça</th>
                      <th style={{ padding:"2px 5px", textAlign:"right" }}>Larg</th>
                      <th style={{ padding:"2px 5px", textAlign:"right" }}>Alt</th>
                      <th style={{ padding:"2px 5px", textAlign:"left" }}>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pequenas.map((p, pi) => {
                      const letra = String.fromCharCode(65 + pi);
                      return (
                        <tr key={pi} style={{ borderBottom:"1px solid #eee" }}>
                          <td style={{ padding:"2px 5px", fontWeight:700 }}>{letra}</td>
                          <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace" }}>{p.l}.0</td>
                          <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace" }}>{p.a}.0</td>
                          <td style={{ padding:"2px 5px", color:"#555" }}>Ret {ci + 1} {p.l}.0 x {p.a}.0</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── LISTA TOTAL DAS PEÇAS ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
              <div>
                <div style={{ fontSize:"9px", fontWeight:700, marginBottom:"3px" }}>Lista total das peças desta montagem:</div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"9px" }}>
                  <thead>
                    <tr style={{ background:"#eee" }}>
                      <th style={{ padding:"2px 5px", textAlign:"left" }}>Peça</th>
                      <th style={{ padding:"2px 5px", textAlign:"right" }}>Larg x</th>
                      <th style={{ padding:"2px 5px", textAlign:"right" }}>Alt</th>
                      <th style={{ padding:"2px 5px", textAlign:"right" }}>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapa.placed.map((p, pi) => (
                      <tr key={pi} style={{ borderBottom:"1px solid #eee" }}>
                        <td style={{ padding:"2px 5px", fontWeight:700 }}>{pi + 1}</td>
                        <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace" }}>{p.l}.0 x</td>
                        <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace" }}>{p.a}.0</td>
                        <td style={{ padding:"2px 5px", textAlign:"right" }}>1 —</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Retalhos aproveitáveis */}
              {retalhos.length > 0 && (
                <div>
                  <div style={{ fontSize:"9px", fontWeight:700, marginBottom:"3px", color:"#3d8c5c" }}>Retalhos aproveitáveis:</div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"9px" }}>
                    <thead>
                      <tr style={{ background:"#e6f4ea" }}>
                        <th style={{ padding:"2px 5px", textAlign:"right" }}>Larg</th>
                        <th style={{ padding:"2px 5px", textAlign:"right" }}>Alt</th>
                        <th style={{ padding:"2px 5px", textAlign:"right" }}>m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retalhos.map((f, fi) => (
                        <tr key={fi} style={{ borderBottom:"1px solid #d0e8d8" }}>
                          <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace" }}>{f.l}.0</td>
                          <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace" }}>{f.a}.0</td>
                          <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", color:"#3d8c5c" }}>{((f.l * f.a) / 1e6).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── RODAPÉ ── */}
            <div style={{ marginTop:"auto", paddingTop:"8px", borderTop:"1px solid #ccc", fontSize:"8px", color:"#999", display:"flex", justifyContent:"space-between" }}>
              <span>Urban Glass · CNPJ 65.668.970/0001-05 · Juiz de Fora/MG</span>
              <span>Pedido {pedido.id} · Chapa {ci + 1}/{chapas.length} · {agora.toLocaleString("pt-BR")}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}