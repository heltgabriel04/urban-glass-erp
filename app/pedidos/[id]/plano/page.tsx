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

function ChapaSVG({ chapa, bord }: { chapa: ChapaData; bord: number }) {
  const VW = 400;
  const VH = Math.round(VW * chapa.H / chapa.W);
  const sx = VW / chapa.W;
  const sy = VH / chapa.H;
  const bordPx = bord * sx;

  return (
    <svg viewBox={"0 0 " + VW + " " + VH} width="100%" style={{ display:"block", border:"1px solid #ccc", background:"white" }}>
      <rect x={0} y={0} width={VW} height={VH} fill="white" />
      {bord > 0 && (
        <rect x={0} y={0} width={VW} height={VH} fill="none" stroke="red" strokeWidth={bordPx * 2} strokeDasharray="4 2" opacity={0.5} />
      )}
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
            {w > 15 && h > 12 && (
              <text x={x + 3} y={y + fontSize + 1} fontSize={fontSize} fill={border} fontFamily="Arial" fontWeight="bold">
                {num}
              </text>
            )}
            {w > 35 && h > 20 && (
              <text x={x + 3} y={y + fontSize * 2 + 3} fontSize={Math.max(5, fontSize - 2)} fill="#000" fontFamily="Arial" fontWeight="bold">
                {p.l}.0 x {p.a}.0
              </text>
            )}
          </g>
        );
      })}
      <text x={VW / 2} y={VH - 2} fontSize={8} fill="#444" fontFamily="Arial" fontWeight="bold" textAnchor="middle">
        {chapa.W}.0
      </text>
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
          <span style={{ fontSize:"11px", color:"#888", marginLeft:"12px", fontFamily:"monospace" }}>
            {otim.aproveitamento}% aproveitamento · {chapas.length} chapas · {totalPecas} peças
          </span>
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
        const pequenas = chapa.placed.filter(p => (p.l / chapa.W) < 0.15 || (p.a / chapa.H) < 0.15);

        return (
          <div key={ci} className="chapa-page">

            {/* CABEÇALHO */}
            <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"6px" }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign:"top", width:"60%" }}>
                    <div style={{ fontSize:"14px", fontWeight:900, color:"#000", letterSpacing:"-0.5px" }}>urbanglass</div>
                    <div style={{ fontSize:"8px", color:"#444", textTransform:"uppercase", letterSpacing:"1px", fontWeight:700 }}>Urban Glass Comércio Ltda</div>
                    <div style={{ fontSize:"8px", color:"#666", marginTop:"2px" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – JF/MG</div>
                  </td>
                  <td style={{ verticalAlign:"top", textAlign:"right", fontSize:"9px", color:"#333" }}>
                    <div style={{ fontWeight:900, fontSize:"12px" }}>PLANO DE CORTE</div>
                    <div style={{ fontWeight:700 }}>{agora.toLocaleTimeString("pt-BR")} &nbsp; {agora.toLocaleDateString("pt-BR")}</div>
                    <div style={{ fontWeight:700 }}>Pedido: <strong>{pedido.id}</strong> &nbsp;·&nbsp; Chapa {ci + 1} de {chapas.length}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* INFO DA MONTAGEM */}
            <div style={{ border:"1px solid #999", padding:"5px 8px", marginBottom:"6px", fontSize:"9px", background:"#fafafa" }}>
              <div style={{ fontWeight:700 }}>Projeto: {pedido.id} &nbsp;·&nbsp; Montagem {ci + 1} – Quantidade: 1</div>
              <div style={{ fontWeight:700 }}>Chapa utilizada: {chapa.W}.0 x {chapa.H}.0 mm</div>
              <div style={{ fontWeight:700 }}>Material: {chapa.prod}</div>
              <div style={{ fontWeight:700 }}>Cliente: {pedido.clientes?.nome ?? "—"}</div>
            </div>

            {/* TOTAIS */}
            <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"6px", fontSize:"9px", border:"1px solid #999" }}>
              <thead>
                <tr style={{ background:"#333", color:"white" }}>
                  <th style={{ padding:"3px 6px", textAlign:"left", fontWeight:700 }}></th>
                  <th style={{ padding:"3px 6px", textAlign:"right", fontWeight:700 }}>QTD:</th>
                  <th style={{ padding:"3px 6px", textAlign:"right", fontWeight:700 }}>ÁREA (M²):</th>
                  <th style={{ padding:"3px 6px", textAlign:"right", fontWeight:700 }}>%:</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label:"Totais",   qtd: chapa.placed.length, m2: usedM2,   pct: aprovPct, bold: true,  color:"#155724" },
                  { label:"Peças",    qtd: chapa.placed.length, m2: usedM2,   pct: aprovPct, bold: false, color:"#000" },
                  { label:"Retalhos", qtd: retalhos.length,     m2: retM2,    pct: (retM2 / chapaM2 * 100).toFixed(2), bold: false, color:"#3d8c5c" },
                  { label:"Sobras",   qtd: 0,                   m2: 0,        pct: perdaPct, bold: true,  color:"#721c24" },
                ].map((row, ri) => (
                  <tr key={ri} style={{ borderBottom:"1px solid #ddd", background: ri % 2 === 0 ? "#f9f9f9" : "white" }}>
                    <td style={{ padding:"3px 6px", fontWeight: row.bold ? 700 : 400 }}>{row.label}</td>
                    <td style={{ padding:"3px 6px", textAlign:"right", fontWeight: row.bold ? 700 : 400 }}>{row.qtd}</td>
                    <td style={{ padding:"3px 6px", textAlign:"right", fontFamily:"monospace", fontWeight: row.bold ? 700 : 400 }}>{row.m2.toFixed(3)}</td>
                    <td style={{ padding:"3px 6px", textAlign:"right", fontWeight:700, color: row.color }}>{row.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* DIAGRAMA */}
            <div style={{ marginBottom:"6px" }}>
              <ChapaSVG chapa={chapa} bord={bord} />
            </div>

            {/* LEGENDA PEÇAS PEQUENAS */}
            {pequenas.length > 0 && (
              <div style={{ marginBottom:"6px" }}>
                <div style={{ fontSize:"9px", fontWeight:700, marginBottom:"3px" }}>Legenda para as peças pequenas:</div>
                <table style={{ borderCollapse:"collapse", fontSize:"9px" }}>
                  <thead>
                    <tr style={{ background:"#eee" }}>
                      <th style={{ padding:"2px 5px", textAlign:"left", fontWeight:700 }}>Peça</th>
                      <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>Larg</th>
                      <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>Alt</th>
                      <th style={{ padding:"2px 5px", textAlign:"left", fontWeight:700 }}>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pequenas.map((p, pi) => (
                      <tr key={pi} style={{ borderBottom:"1px solid #eee" }}>
                        <td style={{ padding:"2px 5px", fontWeight:700 }}>{String.fromCharCode(65 + pi)}</td>
                        <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{p.l}.0</td>
                        <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{p.a}.0</td>
                        <td style={{ padding:"2px 5px", color:"#333", fontWeight:700 }}>Ret {ci + 1} {p.l}.0 x {p.a}.0</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* LISTA TOTAL + RETALHOS */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
              <div>
                <div style={{ fontSize:"9px", fontWeight:700, marginBottom:"3px" }}>Lista total das peças desta montagem:</div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"9px" }}>
                  <thead>
                    <tr style={{ background:"#333", color:"white" }}>
                      <th style={{ padding:"2px 5px", textAlign:"left", fontWeight:700 }}>PEÇA</th>
                      <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>LARG X</th>
                      <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>ALT</th>
                      <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>QTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapa.placed.map((p, pi) => (
                      <tr key={pi} style={{ borderBottom:"1px solid #eee", background: pi % 2 === 0 ? "#f9f9f9" : "white" }}>
                        <td style={{ padding:"2px 5px", fontWeight:700 }}>{pi + 1}</td>
                        <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{p.l}.0 x</td>
                        <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{p.a}.0</td>
                        <td style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>1 —</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {retalhos.length > 0 && (
                <div>
                  <div style={{ fontSize:"9px", fontWeight:700, marginBottom:"3px", color:"#3d8c5c" }}>Retalhos aproveitáveis:</div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"9px" }}>
                    <thead>
                      <tr style={{ background:"#3d8c5c", color:"white" }}>
                        <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>LARG</th>
                        <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>ALT</th>
                        <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700 }}>M²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retalhos.map((f, fi) => (
                        <tr key={fi} style={{ borderBottom:"1px solid #d0e8d8", background: fi % 2 === 0 ? "#f0f9f4" : "white" }}>
                          <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{f.l}.0</td>
                          <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{f.a}.0</td>
                          <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#3d8c5c" }}>{((f.l * f.a) / 1e6).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* RODAPÉ */}
            <div style={{ marginTop:"12px", paddingTop:"6px", borderTop:"1px solid #ccc", fontSize:"8px", color:"#666", display:"flex", justifyContent:"space-between", fontWeight:700 }}>
              <span>Urban Glass · CNPJ 65.668.970/0001-05 · Juiz de Fora/MG</span>
              <span>Pedido {pedido.id} · Chapa {ci + 1}/{chapas.length} · {agora.toLocaleString("pt-BR")}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}