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

const COLS = ["#1f4d32","#173d26","#255c3b","#1a4530","#204228","#2a5c3f","#1e3a2a","#18402e"];

function ChapaSVG({ chapa, bord }: { chapa: ChapaData; bord: number }) {
  const VW = 340, VH = Math.round(VW * chapa.H / chapa.W);
  const sx = VW / chapa.W, sy = VH / chapa.H;

  return (
    <svg viewBox={"0 0 " + VW + " " + VH} width="100%" style={{ display:"block", border:"1px solid #d0daf0", borderRadius:"6px", background:"#f7f9ff" }}>
      {/* Fundo */}
      <rect x={0} y={0} width={VW} height={VH} fill="#f0f4ff" />
      {/* Borda de lapidação */}
      {bord > 0 && (
        <rect x={0} y={0} width={VW} height={VH} fill="none" stroke="rgba(255,107,53,0.5)" strokeWidth={bord * sx * 2} />
      )}
      {/* Peças */}
      {chapa.placed.map((p, i) => {
        const x = (p.x + bord) * sx, y = (p.y + bord) * sy;
        const w = p.l * sx, h = p.a * sy;
        const label = p.l + "×" + p.a;
        const m2 = ((p.l * p.a) / 1e6).toFixed(3);
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={COLS[i % COLS.length]} stroke="rgba(61,255,160,.5)" strokeWidth={0.8} />
            {w > 28 && h > 14 && (
              <text x={x + 3} y={y + 10} fontSize={Math.max(6, Math.min(9, w / 7))} fill="rgba(220,255,235,.95)" fontFamily="Arial" fontWeight="bold">{label}</text>
            )}
            {w > 40 && h > 22 && (
              <text x={x + 3} y={y + 19} fontSize={Math.max(5, Math.min(7, w / 9))} fill="rgba(180,230,200,.8)" fontFamily="monospace">{m2}m²</text>
            )}
          </g>
        );
      })}
      {/* Borda externa */}
      <rect x={0} y={0} width={VW} height={VH} fill="none" stroke="#2d5fa6" strokeWidth={1.5} />
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
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"'DM Mono', monospace", color:"#888" }}>
      Carregando plano de corte...
    </div>
  );

  if (!pedido || !otim) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:"12px" }}>
      <div style={{ color:"#c00" }}>Nenhum plano de corte encontrado para este pedido.</div>
      <button onClick={() => router.back()} style={{ padding:"8px 16px", borderRadius:"6px", border:"1px solid #ccc", cursor:"pointer" }}>← Voltar</button>
    </div>
  );

  const bord = otim.borda ?? 3;
  const totalPecas = chapas.reduce((s, c) => s + c.placed.length, 0);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f6fb; font-family: Arial, sans-serif; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .chapa-block { page-break-inside: avoid; margin-bottom: 0 !important; }
          .page-break { page-break-before: always; }
          @page { margin: 8mm; size: A4 portrait; }
        }
      `}</style>

      {/* TOOLBAR */}
      <div className="no-print" style={{ position:"sticky", top:0, zIndex:100, background:"#1a1a2e", borderBottom:"1px solid #2d3a4a", padding:"10px 20px", display:"flex", alignItems:"center", gap:"10px" }}>
        <button onClick={() => router.back()} style={{ padding:"6px 12px", borderRadius:"6px", border:"1px solid #444", background:"transparent", color:"#ccc", cursor:"pointer", fontSize:"12px" }}>← Voltar ao Pedido</button>
        <div style={{ flex:1, fontSize:"13px", fontWeight:700, color:"white" }}>
          Plano de Corte — <span style={{ color:"#3dffa0" }}>{pedido.id}</span>
          <span style={{ fontSize:"11px", color:"#888", marginLeft:"12px", fontFamily:"monospace" }}>
            {otim.aproveitamento}% aproveitamento · {chapas.length} chapas · {totalPecas} peças
          </span>
        </div>
        <button onClick={() => window.print()} style={{ padding:"7px 16px", borderRadius:"6px", border:"none", background:"#3dffa0", color:"#000", fontWeight:700, cursor:"pointer", fontSize:"12px" }}>
          🖨 Imprimir Plano
        </button>
      </div>

      <div style={{ maxWidth:"210mm", margin:"0 auto", padding:"12px" }}>

        {/* CABEÇALHO */}
        <div style={{ background:"white", borderRadius:"8px", padding:"16px 20px", marginBottom:"12px", border:"1px solid #dde3f0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", paddingBottom:"12px", borderBottom:"3px solid #2d5fa6", marginBottom:"12px" }}>
            <div>
              <div style={{ fontSize:"20px", fontWeight:900, color:"#2d5fa6", letterSpacing:"-0.5px" }}>urbanglass</div>
              <div style={{ fontSize:"8px", color:"#888", textTransform:"uppercase", letterSpacing:"1.5px" }}>Urban Glass Comércio Ltda</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"9px", color:"#888", textTransform:"uppercase", letterSpacing:"2px" }}>Plano de Corte</div>
              <div style={{ fontSize:"22px", fontWeight:900, color:"#2d5fa6" }}>{pedido.id}</div>
              <div style={{ fontSize:"9px", color:"#555" }}>Emissão: <strong>{new Date().toLocaleDateString("pt-BR")}</strong></div>
              <div style={{ fontSize:"9px", color:"#555" }}>Otimizado em: <strong>{formatDate(otim.dt_otim)}</strong></div>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:"8px", marginBottom:"10px" }}>
            {[
              { label:"Cliente",        value: pedido.clientes?.nome ?? "—", color:"#1a1a2e" },
              { label:"Aproveitamento", value: otim.aproveitamento + "%",    color:"#155724" },
              { label:"Perda",          value: otim.perda + "%",             color:"#721c24" },
              { label:"Chapas",         value: String(chapas.length),        color:"#2d5fa6" },
              { label:"Total Peças",    value: String(totalPecas),           color:"#1a1a2e" },
            ].map(c => (
              <div key={c.label} style={{ background:"#f0f4ff", borderRadius:"5px", padding:"8px 10px" }}>
                <div style={{ fontSize:"8px", color:"#888", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:"2px" }}>{c.label}</div>
                <div style={{ fontSize:"14px", fontWeight:700, color:c.color, fontFamily:"monospace" }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:"9px", color:"#888", fontFamily:"monospace" }}>
            Chapa: {otim.chapa_w} × {otim.chapa_h} mm · Folga corte: {otim.kerf}mm · Borda lapidação: {bord}mm
          </div>
        </div>

        {/* CHAPAS */}
        {chapas.map((chapa, ci) => {
          const usedArea = chapa.placed.reduce((s, p) => s + p.l * p.a, 0);
          const aprovChapa = chapa.W * chapa.H > 0 ? ((usedArea / (chapa.W * chapa.H)) * 100).toFixed(1) : "0";
          const retalhos = chapa.free.filter(f => f.l >= 200 && f.a >= 200);

          return (
            <div key={ci} className={"chapa-block" + (ci > 0 ? " page-break" : "")} style={{ background:"white", borderRadius:"8px", border:"1px solid #dde3f0", marginBottom:"12px", overflow:"hidden" }}>

              {/* Header */}
              <div style={{ background:"#2d5fa6", padding:"8px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ color:"white", fontWeight:700, fontSize:"12px" }}>CHAPA {ci + 1} — {chapa.prod}</div>
                <div style={{ color:"rgba(255,255,255,.85)", fontSize:"10px", fontFamily:"monospace", display:"flex", gap:"14px" }}>
                  <span>{chapa.W} × {chapa.H} mm</span>
                  <span>{chapa.placed.length} peças</span>
                  <span>Aprov.: {aprovChapa}%</span>
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"45% 55%", gap:"0" }}>

                {/* SVG */}
                <div style={{ padding:"10px", borderRight:"1px solid #eef0f8" }}>
                  <ChapaSVG chapa={chapa} bord={bord} />
                  <div style={{ display:"flex", gap:"10px", marginTop:"6px", fontSize:"8px", color:"#888" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:"3px" }}>
                      <span style={{ width:"9px", height:"9px", background:"#1f4d32", display:"inline-block", borderRadius:"2px" }} />Peça cortada
                    </span>
                    <span style={{ display:"flex", alignItems:"center", gap:"3px" }}>
                      <span style={{ width:"9px", height:"9px", background:"rgba(255,107,53,0.35)", display:"inline-block", borderRadius:"2px" }} />Borda lapidação
                    </span>
                  </div>
                </div>

                {/* Tabela */}
                <div style={{ padding:"10px" }}>
                  <div style={{ fontSize:"9px", fontWeight:700, color:"#2d5fa6", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:"6px" }}>Sequência de Corte</div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"10px" }}>
                    <thead>
                      <tr style={{ background:"#f0f4ff" }}>
                        {["#","Dimensão (mm)","m²","Pos. X,Y","Rot."].map((h, i) => (
                          <th key={i} style={{ padding:"4px 5px", textAlign: i === 2 ? "right" : i === 4 ? "center" : "left", color:"#555", fontWeight:600, fontSize:"8px", borderBottom:"1px solid #dde3f0" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chapa.placed.map((p, pi) => (
                        <tr key={pi} style={{ borderBottom:"1px solid #f5f5f5" }}>
                          <td style={{ padding:"3px 5px", color:"#bbb", fontSize:"9px" }}>{pi + 1}</td>
                          <td style={{ padding:"3px 5px", fontFamily:"monospace", fontWeight:600, color:"#1a1a2e", fontSize:"10px" }}>{p.l} × {p.a}</td>
                          <td style={{ padding:"3px 5px", textAlign:"right", fontFamily:"monospace", color:"#2d5fa6", fontSize:"10px" }}>{((p.l * p.a) / 1e6).toFixed(3)}</td>
                          <td style={{ padding:"3px 5px", fontFamily:"monospace", fontSize:"9px", color:"#999" }}>{p.x},{p.y}</td>
                          <td style={{ padding:"3px 5px", textAlign:"center", fontSize:"9px", color: p.rot ? "#e67e22" : "#ccc" }}>{p.rot ? "90°" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:"#f0f4ff", borderTop:"2px solid #2d5fa6" }}>
                        <td colSpan={2} style={{ padding:"4px 5px", fontWeight:700, fontSize:"9px", color:"#2d5fa6" }}>Total</td>
                        <td style={{ padding:"4px 5px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#2d5fa6", fontSize:"10px" }}>{(usedArea / 1e6).toFixed(3)}</td>
                        <td colSpan={2} style={{ padding:"4px 5px", fontSize:"9px", color:"#888", textAlign:"right" }}>{aprovChapa}% aproveitado</td>
                      </tr>
                    </tfoot>
                  </table>

                  {retalhos.length > 0 && (
                    <div style={{ marginTop:"8px" }}>
                      <div style={{ fontSize:"8px", fontWeight:700, color:"#3d8c5c", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:"4px" }}>Retalhos Aproveitáveis</div>
                      {retalhos.map((f, fi) => (
                        <div key={fi} style={{ fontSize:"9px", fontFamily:"monospace", color:"#3d8c5c", padding:"2px 0", borderBottom:"1px dashed #d0e8d8" }}>
                          ↺ {f.l} × {f.a} mm — {((f.l * f.a) / 1e6).toFixed(4)} m²
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Rodapé da chapa */}
              <div style={{ background:"#f7f9ff", borderTop:"1px solid #eef0f8", padding:"6px 14px", display:"flex", justifyContent:"space-between", fontSize:"9px", color:"#999" }}>
                <span>Operador: _______________________</span>
                <span>Data/Hora: _______________________</span>
                <span>Conferência: _______________________</span>
              </div>
            </div>
          );
        })}

        {/* RODAPÉ */}
        <div style={{ background:"white", borderRadius:"8px", padding:"10px 16px", border:"1px solid #dde3f0", fontSize:"9px", color:"#aaa", display:"flex", justifyContent:"space-between" }}>
          <span>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Juiz de Fora/MG</span>
          <span>Gerado em {new Date().toLocaleString("pt-BR")} · Pedido {pedido.id}</span>
        </div>
      </div>
    </>
  );
}