"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPedidoById } from "@/services/pedidos.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
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
    <svg viewBox={"0 0 " + VW + " " + VH} width="100%" style={{ display:"block", border:"1px solid #999", background:"white" }}>
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
        const fontSize = Math.max(8, Math.min(13, w / 5));
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={col} stroke={border} strokeWidth={1} />
            {w > 15 && h > 12 && (
              <text x={x + 4} y={y + fontSize + 2} fontSize={fontSize} fill={border} fontFamily="Arial" fontWeight="bold">
                {i + 1}
              </text>
            )}
            {w > 40 && h > 24 && (
              <text x={x + 4} y={y + fontSize * 2 + 5} fontSize={Math.max(7, fontSize - 2)} fill="#000" fontFamily="Arial" fontWeight="bold">
                {p.l}.0 x {p.a}.0
              </text>
            )}
          </g>
        );
      })}
      <text x={VW / 2} y={VH - 2} fontSize={9} fill="#333" fontFamily="Arial" fontWeight="bold" textAnchor="middle">
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
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"Arial", color:"#333" }}>
      Carregando plano de corte...
    </div>
  );

  if (!pedido || !otim) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:"12px" }}>
      <div style={{ color:"#c00", fontWeight:700 }}>Nenhum plano de corte encontrado.</div>
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
        html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #888; }
        .pagina-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px;
          gap: 16px;
        }
        .chapa-page {
          background: white;
          padding: 12mm;
          width: 210mm;
          min-height: 297mm;
          display: flex;
          flex-direction: column;
          gap: 6px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        }
        @media screen and (max-width: 900px) {
          .chapa-page {
            width: 100%;
            min-height: auto;
            padding: 4vw;
          }
        }
        @media print {
          .no-print { display: none !important; }
          html, body { background: white; margin: 0; padding: 0; }
          .pagina-wrapper { padding: 0; gap: 0; background: white; }
          .chapa-page {
            width: 100%;
            min-height: auto;
            padding: 8mm;
            box-shadow: none;
            page-break-after: always;
          }
          .chapa-page:last-child { page-break-after: avoid; }
          @page { margin: 0; size: A4 portrait; }
        }
        table { border-collapse: collapse; width: 100%; }
      `}</style>

      {/* TOOLBAR */}
      <div className="no-print" style={{ position:"sticky", top:0, zIndex:100, background:"#111", padding:"8px 20px", display:"flex", alignItems:"center", gap:"10px" }}>
        <button onClick={() => router.back()} style={{ padding:"6px 12px", borderRadius:"4px", border:"1px solid #555", background:"transparent", color:"#ccc", cursor:"pointer", fontSize:"12px" }}>← Voltar</button>
        <div style={{ flex:1, color:"white", fontSize:"13px", fontWeight:700 }}>
          Plano de Corte — <span style={{ color:"#3dffa0" }}>{pedido.id}</span>
          <span style={{ fontSize:"11px", color:"#aaa", marginLeft:"12px" }}>
            {otim.aproveitamento}% · {chapas.length} chapas · {totalPecas} peças
          </span>
        </div>
        <button onClick={() => window.print()} style={{ padding:"7px 16px", borderRadius:"4px", border:"none", background:"#3dffa0", color:"#000", fontWeight:700, cursor:"pointer", fontSize:"12px" }}>
          🖨 Imprimir
        </button>
      </div>

      <div className="pagina-wrapper">
        {chapas.map((chapa, ci) => {
          const usedArea = chapa.placed.reduce((s, p) => s + p.l * p.a, 0);
          const chapaM2  = chapa.W * chapa.H / 1e6;
          const usedM2   = usedArea / 1e6;
          const retalhos = chapa.free.filter(f => f.l >= 200 && f.a >= 200);
          const retM2    = retalhos.reduce((s, f) => s + f.l * f.a, 0) / 1e6;
          const aprovPct = chapaM2 > 0 ? ((usedM2 / chapaM2) * 100).toFixed(2) : "0";
          const perdaPct = chapaM2 > 0 ? (((chapaM2 - usedM2) / chapaM2) * 100).toFixed(2) : "0";
          const pequenas = chapa.placed.filter(p => (p.l / chapa.W) < 0.15 || (p.a / chapa.H) < 0.15);

          const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
            <th style={{ padding:"3px 6px", fontWeight:700, color:"white", fontSize:"9px", textAlign: right ? "right" : "left", background:"#222" }}>{children}</th>
          );
          const TD = ({ children, right, green }: { children: React.ReactNode; right?: boolean; green?: boolean }) => (
            <td style={{ padding:"3px 6px", fontWeight:700, color: green ? "#1e5c30" : "#000", fontSize:"9px", textAlign: right ? "right" : "left", fontFamily: right ? "monospace" : "Arial" }}>{children}</td>
          );

          return (
            <div key={ci} className="chapa-page">

              {/* CABEÇALHO */}
              <table>
                <tbody>
                  <tr>
                    <td style={{ verticalAlign:"top", width:"55%" }}>
                      <div style={{ fontSize:"16px", fontWeight:900 }}>urbanglass</div>
                      <div style={{ fontSize:"8px", textTransform:"uppercase", letterSpacing:"1px", fontWeight:700 }}>Urban Glass Comércio Ltda</div>
                      <div style={{ fontSize:"8px", color:"#444" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – JF/MG</div>
                    </td>
                    <td style={{ verticalAlign:"top", textAlign:"right" }}>
                      <div style={{ fontWeight:900, fontSize:"13px" }}>PLANO DE CORTE</div>
                      <div style={{ fontWeight:700, fontSize:"9px" }}>{agora.toLocaleTimeString("pt-BR")} &nbsp; {agora.toLocaleDateString("pt-BR")}</div>
                      <div style={{ fontWeight:700, fontSize:"9px" }}>Pedido: {pedido.id} &nbsp;·&nbsp; Chapa {ci + 1} de {chapas.length}</div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* INFO */}
              <div style={{ border:"1px solid #555", padding:"5px 8px", fontSize:"9px", background:"#f5f5f5" }}>
                <div style={{ fontWeight:700 }}>Projeto: {pedido.id} &nbsp;·&nbsp; Montagem {ci + 1} – Quantidade: 1</div>
                <div style={{ fontWeight:700 }}>Chapa utilizada: {chapa.W}.0 x {chapa.H}.0 mm</div>
                <div style={{ fontWeight:700 }}>Material: {chapa.prod}</div>
                <div style={{ fontWeight:700 }}>Cliente: {pedido.clientes?.nome ?? "—"}</div>
              </div>

              {/* TOTAIS */}
              <table style={{ border:"1px solid #555", fontSize:"9px" }}>
                <thead>
                  <tr><TH>  </TH><TH right>QTD:</TH><TH right>ÁREA (M²):</TH><TH right>%:</TH></tr>
                </thead>
                <tbody>
                  {[
                    { label:"Totais",   qtd: chapa.placed.length, m2: usedM2, pct: aprovPct, pctColor:"#155724" },
                    { label:"Peças",    qtd: chapa.placed.length, m2: usedM2, pct: aprovPct, pctColor:"#000" },
                    { label:"Retalhos", qtd: retalhos.length,     m2: retM2,  pct: (retM2 / chapaM2 * 100).toFixed(2), pctColor:"#1e5c30" },
                    { label:"Sobras",   qtd: 0,                   m2: 0,      pct: perdaPct, pctColor:"#721c24" },
                  ].map((row, ri) => (
                    <tr key={ri} style={{ borderBottom:"1px solid #ccc", background: ri % 2 === 0 ? "#f9f9f9" : "white" }}>
                      <td style={{ padding:"3px 6px", fontWeight:700, fontSize:"9px" }}>{row.label}</td>
                      <td style={{ padding:"3px 6px", fontWeight:700, fontSize:"9px", textAlign:"right" }}>{row.qtd}</td>
                      <td style={{ padding:"3px 6px", fontWeight:700, fontSize:"9px", textAlign:"right", fontFamily:"monospace" }}>{row.m2.toFixed(3)}</td>
                      <td style={{ padding:"3px 6px", fontWeight:700, fontSize:"9px", textAlign:"right", color: row.pctColor }}>{row.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* DIAGRAMA */}
              <ChapaSVG chapa={chapa} bord={bord} />

              {/* LEGENDA */}
              {pequenas.length > 0 && (
                <div>
                  <div style={{ fontSize:"9px", fontWeight:700, marginBottom:"3px" }}>Legenda para as peças pequenas:</div>
                  <table style={{ border:"1px solid #ccc", fontSize:"9px" }}>
                    <thead>
                      <tr style={{ background:"#ddd" }}>
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
                          <td style={{ padding:"2px 5px", fontWeight:700 }}>Ret {ci + 1} {p.l}.0 x {p.a}.0</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* LISTA + RETALHOS */}
              <div style={{ display:"grid", gridTemplateColumns: retalhos.length > 0 ? "1fr 1fr" : "1fr", gap:"8px" }}>
                <div>
                  <div style={{ fontSize:"9px", fontWeight:700, marginBottom:"3px" }}>Lista total das peças desta montagem:</div>
                  <table style={{ border:"1px solid #555", fontSize:"9px" }}>
                    <thead>
                      <tr style={{ background:"#222" }}>
                        <th style={{ padding:"2px 5px", textAlign:"left", fontWeight:700, color:"white", fontSize:"8px" }}>PEÇA</th>
                        <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700, color:"white", fontSize:"8px" }}>LARG X</th>
                        <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700, color:"white", fontSize:"8px" }}>ALT</th>
                        <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700, color:"white", fontSize:"8px" }}>QTD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chapa.placed.map((p, pi) => (
                        <tr key={pi} style={{ borderBottom:"1px solid #ddd", background: pi % 2 === 0 ? "#f9f9f9" : "white" }}>
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
                    <div style={{ fontSize:"9px", fontWeight:700, color:"#1e5c30", marginBottom:"3px" }}>Retalhos aproveitáveis:</div>
                    <table style={{ border:"1px solid #555", fontSize:"9px" }}>
                      <thead>
                        <tr style={{ background:"#1e5c30" }}>
                          <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700, color:"white", fontSize:"8px" }}>LARG</th>
                          <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700, color:"white", fontSize:"8px" }}>ALT</th>
                          <th style={{ padding:"2px 5px", textAlign:"right", fontWeight:700, color:"white", fontSize:"8px" }}>M²</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retalhos.map((f, fi) => (
                          <tr key={fi} style={{ borderBottom:"1px solid #ccc", background: fi % 2 === 0 ? "#f0f9f4" : "white" }}>
                            <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{f.l}.0</td>
                            <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{f.a}.0</td>
                            <td style={{ padding:"2px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#1e5c30" }}>{((f.l * f.a) / 1e6).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* RODAPÉ */}
              <div style={{ marginTop:"auto", paddingTop:"6px", borderTop:"1px solid #999", fontSize:"8px", color:"#333", display:"flex", justifyContent:"space-between", fontWeight:700 }}>
                <span>Urban Glass · CNPJ 65.668.970/0001-05 · Juiz de Fora/MG</span>
                <span>Pedido {pedido.id} · Chapa {ci + 1}/{chapas.length} · {agora.toLocaleString("pt-BR")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}