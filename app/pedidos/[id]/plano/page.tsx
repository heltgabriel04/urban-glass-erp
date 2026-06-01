"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPedidoById } from "@/services/pedidos.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import type { Pedido } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";

interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; }
interface EspacoLivre { x: number; y: number; l: number; a: number; }
interface ChapaData { W: number; H: number; prod: string; placed: PecaPlacada[]; free: EspacoLivre[]; }

const COLS_PECA = ["#1f4d32","#173d26","#255c3b","#1a4530","#204228","#2a5c3f","#1e3a2a","#18402e"];

function ChapaCanvas({ chapa, idx, bord }: { chapa: ChapaData; idx: number; bord: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const displayW = cv.offsetWidth, displayH = cv.offsetHeight;
    cv.width = displayW * dpr; cv.height = displayH * dpr;
    ctx.scale(dpr, dpr);
    const CW = displayW - 8, CH = displayH - 8;
    const scale = Math.min(CW / chapa.W, CH / chapa.H);
    const dW = chapa.W * scale, dH = chapa.H * scale;
    const ox = (CW - dW) / 2 + 4, oy = (CH - dH) / 2 + 4;
    ctx.clearRect(0, 0, displayW, displayH);
    ctx.fillStyle = "#f7f9ff"; ctx.fillRect(ox, oy, dW, dH);
    ctx.strokeStyle = "#2d5fa6"; ctx.lineWidth = 1.5; ctx.strokeRect(ox, oy, dW, dH);
    if (bord > 0) {
      const bs = bord * scale;
      ctx.fillStyle = "rgba(255,107,53,0.08)";
      ctx.fillRect(ox, oy, dW, bs); ctx.fillRect(ox, oy + dH - bs, dW, bs);
      ctx.fillRect(ox, oy, bs, dH); ctx.fillRect(ox + dW - bs, oy, bs, dH);
    }
    chapa.placed.forEach((p, i) => {
      const px = ox + (p.x + bord) * scale, py = oy + (p.y + bord) * scale;
      const pw = p.l * scale, ph = p.a * scale;
      ctx.fillStyle = COLS_PECA[i % COLS_PECA.length];
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = "rgba(61,255,160,.6)"; ctx.lineWidth = 0.8;
      ctx.strokeRect(px, py, pw, ph);
      if (pw > 30 && ph > 16) {
        ctx.fillStyle = "rgba(220,255,235,.9)";
        ctx.font = `bold ${Math.max(7, Math.min(10, pw / 7))}px Arial`;
        ctx.fillText(p.l + "×" + p.a, px + 3, py + 11);
        if (ph > 22) {
          ctx.font = `${Math.max(6, Math.min(8, pw / 10))}px monospace`;
          ctx.fillStyle = "rgba(180,230,200,.8)";
          ctx.fillText(((p.l * p.a) / 1e6).toFixed(3) + "m²", px + 3, py + 20);
        }
      }
    });
  }, [chapa, bord]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display:"block", width:"100%", height:"220px", borderRadius:"6px" }}
    />
  );
}

export default function PlanoCorte() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido]       = useState<Pedido | null>(null);
  const [otim, setOtim]           = useState<HistoricoOtimizador | null>(null);
  const [chapas, setChapas]       = useState<ChapaData[]>([]);
  const [loading, setLoading]     = useState(true);

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
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"var(--bg)", color:"var(--t3)", fontFamily:"'DM Mono', monospace" }}>
      Carregando plano de corte...
    </div>
  );

  if (!pedido || !otim) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:"12px", background:"var(--bg)" }}>
      <div style={{ color:"var(--err)", fontSize:"14px" }}>Nenhum plano de corte encontrado para este pedido.</div>
      <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
    </div>
  );

  const bord = otim.borda ?? 3;
  const totalPecas = chapas.reduce((s, c) => s + c.placed.length, 0);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; }
          @page { margin: 10mm; size: A4; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* ── TOOLBAR ── */}
      <div className="no-print" style={{ position:"sticky", top:0, zIndex:100, background:"var(--surf1)", borderBottom:"1px solid var(--b1)", padding:"10px 20px", display:"flex", alignItems:"center", gap:"10px" }}>
        <button className="btn bg sm" onClick={() => router.back()}>← Voltar ao Pedido</button>
        <div style={{ flex:1, fontSize:"13px", fontWeight:700, color:"var(--t1)" }}>
          Plano de Corte — <span style={{ color:"var(--acc)" }}>{pedido.id}</span>
          <span style={{ fontSize:"11px", color:"var(--t3)", marginLeft:"12px", fontFamily:"'DM Mono', monospace" }}>
            {otim.aproveitamento}% aproveitamento · {chapas.length} chapas · {totalPecas} peças
          </span>
        </div>
        <button className="btn bp sm" onClick={() => window.print()}>🖨 Imprimir Plano</button>
      </div>

      <div style={{ padding:"20px 24px", background:"var(--bg)", minHeight:"100vh" }}>

        {/* ── CABEÇALHO DO DOCUMENTO ── */}
        <div style={{ background:"white", borderRadius:"10px", padding:"20px 24px", marginBottom:"16px", border:"1px solid var(--b1)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", paddingBottom:"14px", borderBottom:"3px solid #2d5fa6", marginBottom:"14px" }}>
            <div>
              <div style={{ fontSize:"22px", fontWeight:900, color:"#2d5fa6", letterSpacing:"-1px" }}>urbanglass</div>
              <div style={{ fontSize:"9px", color:"#888", textTransform:"uppercase", letterSpacing:"1.5px" }}>Urban Glass Comércio Ltda</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"11px", color:"#888", textTransform:"uppercase", letterSpacing:"2px", marginBottom:"2px" }}>Plano de Corte</div>
              <div style={{ fontSize:"24px", fontWeight:900, color:"#2d5fa6" }}>{pedido.id}</div>
              <div style={{ fontSize:"10px", color:"#555", marginTop:"4px" }}>Emissão: <strong>{new Date().toLocaleDateString("pt-BR")}</strong></div>
              <div style={{ fontSize:"10px", color:"#555" }}>Otimizado em: <strong>{formatDate(otim.dt_otim)}</strong></div>
            </div>
          </div>

          {/* Resumo */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:"10px", marginBottom:"14px" }}>
            {[
              { label:"Cliente",        value: pedido.clientes?.nome ?? "—", color:"#1a1a2e" },
              { label:"Aproveitamento", value: otim.aproveitamento + "%",     color:"#155724" },
              { label:"Perda",          value: otim.perda + "%",              color:"#721c24" },
              { label:"Chapas",         value: String(chapas.length),         color:"#2d5fa6" },
              { label:"Total Peças",    value: String(totalPecas),            color:"#1a1a2e" },
            ].map(c => (
              <div key={c.label} style={{ background:"#f0f4ff", borderRadius:"6px", padding:"10px 12px" }}>
                <div style={{ fontSize:"9px", color:"#888", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"3px" }}>{c.label}</div>
                <div style={{ fontSize:"16px", fontWeight:700, color:c.color, fontFamily:"monospace" }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Config da chapa */}
          <div style={{ fontSize:"10px", color:"#888", fontFamily:"monospace" }}>
            Chapa: {otim.chapa_w} × {otim.chapa_h} mm · Folga corte: {otim.kerf}mm · Borda lapidação: {bord}mm
          </div>
        </div>

        {/* ── CHAPAS ── */}
        {chapas.map((chapa, ci) => {
          const usedArea = chapa.placed.reduce((s, p) => s + p.l * p.a, 0);
          const totalArea = chapa.W * chapa.H;
          const aprovChapa = totalArea > 0 ? ((usedArea / totalArea) * 100).toFixed(1) : "0";

          return (
            <div key={ci} style={{ background:"white", borderRadius:"10px", border:"1px solid var(--b1)", marginBottom:"16px", overflow:"hidden" }} className={ci > 0 ? "page-break" : ""}>

              {/* Header da chapa */}
              <div style={{ background:"#2d5fa6", padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ color:"white", fontWeight:700, fontSize:"13px" }}>
                  CHAPA {ci + 1} — {chapa.prod}
                </div>
                <div style={{ color:"rgba(255,255,255,.8)", fontSize:"11px", fontFamily:"monospace", display:"flex", gap:"16px" }}>
                  <span>{chapa.W} × {chapa.H} mm</span>
                  <span>{chapa.placed.length} peças</span>
                  <span>Aproveitamento: {aprovChapa}%</span>
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0" }}>

                {/* Canvas visual */}
                <div style={{ padding:"12px", borderRight:"1px solid #e8ecf5" }}>
                  <ChapaCanvas chapa={chapa} idx={ci} bord={bord} />
                  <div style={{ display:"flex", gap:"12px", marginTop:"8px", fontSize:"9px", color:"#888" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:"4px" }}><span style={{ width:"10px", height:"10px", background:"#1f4d32", display:"inline-block", borderRadius:"2px" }} />Peça cortada</span>
                    <span style={{ display:"flex", alignItems:"center", gap:"4px" }}><span style={{ width:"10px", height:"10px", background:"rgba(255,107,53,0.3)", display:"inline-block", borderRadius:"2px" }} />Borda lapidação</span>
                  </div>
                </div>

                {/* Tabela de peças */}
                <div style={{ padding:"12px" }}>
                  <div style={{ fontSize:"10px", fontWeight:700, color:"#2d5fa6", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"8px" }}>
                    Sequência de Corte
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"11px" }}>
                    <thead>
                      <tr style={{ background:"#f0f4ff" }}>
                        <th style={{ padding:"5px 6px", textAlign:"left", color:"#555", fontWeight:600, fontSize:"9px" }}>#</th>
                        <th style={{ padding:"5px 6px", textAlign:"left", color:"#555", fontWeight:600, fontSize:"9px" }}>Dimensão (mm)</th>
                        <th style={{ padding:"5px 6px", textAlign:"right", color:"#555", fontWeight:600, fontSize:"9px" }}>m²</th>
                        <th style={{ padding:"5px 6px", textAlign:"left", color:"#555", fontWeight:600, fontSize:"9px" }}>Pos. X,Y</th>
                        <th style={{ padding:"5px 6px", textAlign:"center", color:"#555", fontWeight:600, fontSize:"9px" }}>Rot.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chapa.placed.map((p, pi) => (
                        <tr key={pi} style={{ borderBottom:"1px solid #f0f0f0" }}>
                          <td style={{ padding:"4px 6px", color:"#aaa", fontSize:"10px" }}>{pi + 1}</td>
                          <td style={{ padding:"4px 6px", fontFamily:"monospace", fontWeight:600, color:"#1a1a2e" }}>{p.l} × {p.a}</td>
                          <td style={{ padding:"4px 6px", textAlign:"right", fontFamily:"monospace", color:"#2d5fa6" }}>{((p.l * p.a) / 1e6).toFixed(3)}</td>
                          <td style={{ padding:"4px 6px", fontFamily:"monospace", fontSize:"10px", color:"#888" }}>{p.x},{p.y}</td>
                          <td style={{ padding:"4px 6px", textAlign:"center", fontSize:"10px", color: p.rot ? "#e67e22" : "#aaa" }}>{p.rot ? "90°" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:"#f7f9ff", borderTop:"2px solid #2d5fa6" }}>
                        <td colSpan={2} style={{ padding:"5px 6px", fontWeight:700, fontSize:"10px", color:"#2d5fa6" }}>Total</td>
                        <td style={{ padding:"5px 6px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#2d5fa6" }}>
                          {(usedArea / 1e6).toFixed(3)}
                        </td>
                        <td colSpan={2} style={{ padding:"5px 6px", fontSize:"10px", color:"#888", textAlign:"right" }}>
                          {aprovChapa}% aproveitado
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Retalhos desta chapa */}
                  {chapa.free.filter(f => f.l >= 200 && f.a >= 200).length > 0 && (
                    <div style={{ marginTop:"10px" }}>
                      <div style={{ fontSize:"9px", fontWeight:700, color:"#3d8c5c", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"5px" }}>
                        Retalhos Aproveitáveis
                      </div>
                      {chapa.free.filter(f => f.l >= 200 && f.a >= 200).map((f, fi) => (
                        <div key={fi} style={{ fontSize:"10px", fontFamily:"monospace", color:"#3d8c5c", padding:"3px 0", borderBottom:"1px dashed #d0e8d8" }}>
                          ↺ {f.l} × {f.a} mm — {((f.l * f.a) / 1e6).toFixed(4)} m²
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Rodapé da chapa */}
              <div style={{ background:"#f7f9ff", borderTop:"1px solid #e8ecf5", padding:"8px 16px", display:"flex", justifyContent:"space-between", fontSize:"10px", color:"#888" }}>
                <span>Operador: ___________________________</span>
                <span>Data/Hora: ___________________________</span>
                <span>Conferência: ___________________________</span>
              </div>
            </div>
          );
        })}

        {/* ── RODAPÉ DO DOCUMENTO ── */}
        <div style={{ background:"white", borderRadius:"10px", padding:"14px 20px", border:"1px solid var(--b1)", fontSize:"10px", color:"#888", display:"flex", justifyContent:"space-between" }}>
          <span>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Juiz de Fora/MG</span>
          <span>Plano gerado em {new Date().toLocaleString("pt-BR")} · Pedido {pedido.id}</span>
        </div>
      </div>
    </>
  );
}