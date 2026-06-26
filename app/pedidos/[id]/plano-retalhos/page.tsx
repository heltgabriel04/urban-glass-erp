"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPedidoById, getRetalhosUsadosPorPedido } from "@/services/pedidos.service";
import type { Pedido } from "@/types";

type RetalhoUso = Awaited<ReturnType<typeof getRetalhosUsadosPorPedido>>[number];

interface PecaAssignada {
  produto: string;
  largura: number;
  altura: number;
  rotacionada: boolean;
  pecaNum: number;
}

function nomesCompativeis(a: string, b: string): boolean {
  const n1 = a.toLowerCase().trim();
  const n2 = b.toLowerCase().trim();
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

function fitMode(retL: number, retA: number, pecaL: number, pecaA: number): "normal" | "rot" | false {
  if (retL >= pecaL && retA >= pecaA) return "normal";
  if (retL >= pecaA && retA >= pecaL) return "rot";
  return false;
}

function resolverAssignments(
  usos: RetalhoUso[],
  itens: any[]
): Map<number, PecaAssignada | null> {
  const result = new Map<number, PecaAssignada | null>();
  const itemContagem = new Map<number, number>();

  // Passa 1: usos com item_pedido_id explícito
  for (const uso of usos) {
    if (uso.item_pedido_id && uso.itens_pedido && uso.retalhos) {
      const item = uso.itens_pedido;
      const count = (itemContagem.get(item.id) ?? 0) + 1;
      itemContagem.set(item.id, count);
      const modo = fitMode(uso.retalhos.largura, uso.retalhos.altura, item.largura, item.altura);
      result.set(uso.id, {
        produto: item.produto_nome,
        largura: item.largura,
        altura: item.altura,
        rotacionada: modo === "rot",
        pecaNum: count,
      });
    }
  }

  // Passa 2: usos sem item_pedido_id — fallback por algoritmo
  for (const uso of usos) {
    if (!uso.item_pedido_id && uso.retalhos) {
      let melhor: any = null;
      for (const item of itens) {
        if ((item as any).vidro_cliente) continue;
        const usado = itemContagem.get(item.id) ?? 0;
        if (usado >= item.quantidade) continue;
        const modo = fitMode(uso.retalhos.largura, uso.retalhos.altura, item.largura, item.altura);
        if (modo === false) continue;
        if (!melhor || item.largura * item.altura < melhor.item.largura * melhor.item.altura) {
          melhor = { item, modo };
        }
      }
      if (melhor) {
        const count = (itemContagem.get(melhor.item.id) ?? 0) + 1;
        itemContagem.set(melhor.item.id, count);
        result.set(uso.id, {
          produto: melhor.item.produto_nome,
          largura: melhor.item.largura,
          altura: melhor.item.altura,
          rotacionada: melhor.modo === "rot",
          pecaNum: count,
        });
      } else {
        result.set(uso.id, null);
      }
    }
  }

  return result;
}

// ── SVG do retalho com a peça marcada ──────────────────────────
function RetalhoSVG({ retalhoL, retalhoA, peca, uid }: {
  retalhoL: number;
  retalhoA: number;
  peca: PecaAssignada | null;
  uid: string;
}) {
  const BASE = 500;
  const VW = BASE;
  const VH = Math.max(100, Math.round(BASE * retalhoA / retalhoL));
  const sx = VW / retalhoL;
  const sy = VH / retalhoA;

  const pecaL = peca ? (peca.rotacionada ? peca.altura : peca.largura) : 0;
  const pecaA = peca ? (peca.rotacionada ? peca.largura : peca.altura) : 0;
  const pw = pecaL * sx;
  const ph = pecaA * sy;

  const patGlass = `glass-${uid}`;
  const patHatch = `hatch-${uid}`;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width={VW}
      height={VH}
      style={{ display: "block", borderRadius: "4px", boxShadow: "0 1px 6px rgba(0,0,0,0.25)" }}
    >
      <defs>
        <pattern id={patGlass} patternUnits="userSpaceOnUse" width={12} height={12}>
          <line x1={0} y1={12} x2={12} y2={0} stroke="#e2e8f0" strokeWidth={0.5} />
        </pattern>
        <pattern id={patHatch} patternUnits="userSpaceOnUse" width={8} height={8}>
          <line x1={0} y1={8} x2={8} y2={0} stroke="rgba(99,102,241,0.3)" strokeWidth={1.2} />
        </pattern>
      </defs>

      {/* Fundo do retalho */}
      <rect x={0} y={0} width={VW} height={VH} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={1.5} rx={2} />
      <rect x={0} y={0} width={VW} height={VH} fill={`url(#${patGlass})`} />

      {/* Peça a cortar */}
      {peca && pw > 0 && ph > 0 && (
        <g>
          <rect x={1} y={1} width={pw} height={ph} fill="rgba(0,0,0,0.07)" rx={1} />
          <rect x={0} y={0} width={pw} height={ph} fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth={2} rx={1} />
          <rect x={0} y={0} width={pw} height={ph} fill={`url(#${patHatch})`} />

          {/* Linhas de corte */}
          {pw < VW && (
            <line x1={pw} y1={0} x2={pw} y2={VH}
              stroke="#ef4444" strokeWidth={1.5} strokeDasharray="7 4" opacity={0.85} />
          )}
          {ph < VH && (
            <line x1={0} y1={ph} x2={VW} y2={ph}
              stroke="#ef4444" strokeWidth={1.5} strokeDasharray="7 4" opacity={0.85} />
          )}

          {/* Rótulo dentro da peça */}
          {pw > 60 && ph > 36 && (
            <>
              <text
                x={pw / 2} y={ph / 2 - 7}
                fontSize={Math.min(15, Math.max(9, pw / 9))}
                fill="#3730a3" fontFamily="monospace" fontWeight="bold"
                textAnchor="middle" dominantBaseline="middle"
              >
                {peca.largura}×{peca.altura}mm
              </text>
              <text
                x={pw / 2} y={ph / 2 + 10}
                fontSize={Math.min(10, Math.max(7, pw / 14))}
                fill="#4338ca" fontFamily="monospace"
                textAnchor="middle"
              >
                {peca.produto.length > 22 ? peca.produto.slice(0, 21) + "…" : peca.produto}
                {peca.rotacionada ? " ↻" : ""}
              </text>
            </>
          )}
        </g>
      )}

      {/* Rótulo da sobra */}
      {peca && pw > 0 && (VW - pw > 40 || VH - ph > 24) && (
        <text
          x={pw + Math.max(12, (VW - pw) / 2)}
          y={Math.max(VH / 3, ph / 2 + 12)}
          fontSize={9} fill="#94a3b8" fontFamily="monospace"
          textAnchor="middle" dominantBaseline="middle" opacity={0.8}
        >
          sobra
        </text>
      )}

      {/* Barra inferior — largura do retalho */}
      <rect x={0} y={VH - 16} width={VW} height={16} fill="rgba(15,15,15,0.72)" />
      <text x={VW / 2} y={VH - 5} fontSize={9} fill="white" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
        ← {retalhoL} mm →
      </text>

      {/* Barra lateral — altura do retalho */}
      <rect x={VW - 16} y={0} width={16} height={VH} fill="rgba(15,15,15,0.72)" />
      <text
        x={VW - 5} y={VH / 2}
        fontSize={9} fill="white" fontFamily="monospace" fontWeight="bold"
        textAnchor="middle" dominantBaseline="middle"
        transform={`rotate(-90,${VW - 8},${VH / 2})`}
      >
        ↑ {retalhoA} mm ↓
      </text>

      <rect x={0} y={0} width={VW} height={VH} fill="none" stroke="#475569" strokeWidth={1.5} rx={2} />
    </svg>
  );
}

// ── Página principal ───────────────────────────────────────────
export default function PlanoRetalhos() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [usos, setUsos] = useState<RetalhoUso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [ped, us] = await Promise.all([getPedidoById(id), getRetalhosUsadosPorPedido(id)]);
      setPedido(ped);
      setUsos(us);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d1117", color: "#aaa", flexDirection: "column", gap: "12px", fontFamily: "Arial" }}>
      <div style={{ fontSize: "24px" }}>✂</div>
      <div>Carregando plano de retalhos...</div>
    </div>
  );

  if (!pedido || usos.length === 0) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", background: "#0d1117", fontFamily: "Arial" }}>
      <div style={{ color: "#f43f5e", fontWeight: 700 }}>Nenhum retalho vinculado a este pedido.</div>
      <button onClick={() => router.back()} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #333", background: "transparent", color: "#aaa", cursor: "pointer" }}>← Voltar</button>
    </div>
  );

  const assignments = resolverAssignments(usos, pedido.itens_pedido ?? []);
  const agora = new Date();

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

        .main { max-width: 680px; margin: 0 auto; padding: 24px 20px; display: flex; flex-direction: column; gap: 28px; }

        .card {
          background: #161b25; border: 1px solid #1f2937; border-radius: 10px; padding: 18px 20px;
        }

        .corte-tag {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.3);
          border-radius: 5px; padding: 3px 10px; font-size: 11px;
          font-family: monospace; color: #818cf8;
        }
        .sobra-tag {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3);
          border-radius: 5px; padding: 3px 10px; font-size: 11px;
          font-family: monospace; color: #34d399;
        }

        @media print {
          .no-print { display: none !important; }
          html, body { background: white; color: #000; }
          .main { padding: 0; max-width: 100%; }
          .card { background: white; border: 1px solid #ccc; border-radius: 6px; margin-bottom: 20px; break-inside: avoid; }
          @page { margin: 12mm; size: A4; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="toolbar no-print">
        <button className="btn-tb" onClick={() => router.back()}>← Voltar</button>
        <div style={{ flex: 1 }}>
          <span style={{ color: "#f9fafb", fontWeight: 700, fontSize: "14px" }}>Plano de Retalhos</span>
          <span style={{ color: "#3dffa0", fontWeight: 700, fontSize: "14px", marginLeft: "8px" }}>{pedido.id}</span>
          <span style={{ color: "#6b7280", fontSize: "11px", marginLeft: "16px", fontFamily: "monospace" }}>
            {usos.length} retalho{usos.length > 1 ? "s" : ""} · {pedido.clientes?.nome ?? "—"}
          </span>
        </div>
        <button className="btn-print" onClick={() => window.print()}>🖨 Imprimir PDF</button>
      </div>

      <div className="main">
        {/* Cabeçalho do documento */}
        <div className="card" style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "4px" }}>PLANO DE RETALHOS</div>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#f9fafb" }}>{pedido.id}</div>
              <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "3px" }}>
                {pedido.clientes?.nome ?? "—"} · Emitido em {agora.toLocaleString("pt-BR")}
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280", fontFamily: "monospace", background: "#111827", borderRadius: "7px", padding: "10px 14px", border: "1px solid #1f2937" }}>
              <div style={{ marginBottom: "4px" }}>Retalhos vinculados: <strong style={{ color: "#f9fafb" }}>{usos.length}</strong></div>
              <div>Emissão: <strong style={{ color: "#f9fafb" }}>{agora.toLocaleDateString("pt-BR")}</strong></div>
            </div>
          </div>
        </div>

        {/* Um card por retalho */}
        {usos.map((uso, idx) => {
          const ret = uso.retalhos;
          if (!ret) return null;
          const peca = assignments.get(uso.id) ?? null;

          const pecaL = peca ? (peca.rotacionada ? peca.altura : peca.largura) : 0;
          const pecaA = peca ? (peca.rotacionada ? peca.largura : peca.altura) : 0;

          // Cortes e sobras
          const sobraDir = peca ? ret.largura - pecaL : ret.largura;
          const sobraBaixo = peca ? ret.altura - pecaA : ret.altura;
          const m2Peca = peca ? (peca.largura * peca.altura) / 1e6 : 0;
          const m2Sobra = (ret.largura * ret.altura) / 1e6 - m2Peca;

          return (
            <div key={uso.id} className="card">
              {/* Cabeçalho do retalho */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "4px" }}>
                    RETALHO {idx + 1} DE {usos.length}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "18px", fontWeight: 900, color: "#3dffa0", fontFamily: "monospace" }}>{uso.retalho_id}</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#f9fafb" }}>{ret.produto_nome}</span>
                    {ret.espessura && <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "monospace" }}>{ret.espessura}mm</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: "#9ca3af", fontFamily: "monospace", marginTop: "4px" }}>
                    {ret.largura} × {ret.altura} mm · {Number(ret.m2).toFixed(4)} m²
                    {ret.box && <span style={{ marginLeft: "10px", color: "#6b7280" }}>Box {ret.box}</span>}
                    {ret.pedido_origem && (
                      <span style={{ marginLeft: "10px", color: "#6b7280" }}>
                        ↩ sobra de{" "}
                        <a href={`/pedidos/${ret.pedido_origem}`} style={{ color: "#60a5fa", textDecoration: "underline", textDecorationStyle: "dotted" }}>{ret.pedido_origem}</a>
                      </span>
                    )}
                    {ret.chapa_origem && !ret.pedido_origem && (
                      <span style={{ marginLeft: "10px", color: "#6b7280" }}>chapa {ret.chapa_origem}</span>
                    )}
                  </div>
                </div>
                {peca && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "flex-end" }}>
                    <span className="corte-tag">✂ Cortar: {peca.largura}×{peca.altura}mm{peca.rotacionada ? " ↻" : ""}</span>
                    {(sobraDir > 0 || sobraBaixo > 0) && (
                      <span className="sobra-tag">↺ Sobra: {m2Sobra.toFixed(4)} m²</span>
                    )}
                  </div>
                )}
              </div>

              {/* Diagrama SVG */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px", overflowX: "auto" }}>
                <RetalhoSVG
                  retalhoL={ret.largura}
                  retalhoA={ret.altura}
                  peca={peca}
                  uid={uso.retalho_id}
                />
              </div>

              {/* Instruções de corte */}
              {peca && (
                <div style={{ background: "#111827", borderRadius: "8px", padding: "12px 16px", border: "1px solid #1f2937" }}>
                  <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "10px" }}>INSTRUÇÕES DE CORTE</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {pecaL < ret.largura && (
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
                        <span style={{ color: "#ef4444", fontFamily: "monospace", fontWeight: 700, minWidth: "20px" }}>1.</span>
                        <span style={{ color: "#e2e8f0" }}>
                          Corte vertical a <strong style={{ color: "#ef4444", fontFamily: "monospace" }}>{pecaL}mm</strong> da borda esquerda
                          {sobraDir > 0 && <span style={{ color: "#6b7280" }}> (sobra {sobraDir}mm à direita)</span>}
                        </span>
                      </div>
                    )}
                    {pecaA < ret.altura && (
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
                        <span style={{ color: "#ef4444", fontFamily: "monospace", fontWeight: 700, minWidth: "20px" }}>{pecaL < ret.largura ? "2." : "1."}</span>
                        <span style={{ color: "#e2e8f0" }}>
                          Corte horizontal a <strong style={{ color: "#ef4444", fontFamily: "monospace" }}>{pecaA}mm</strong> da borda superior
                          {sobraBaixo > 0 && <span style={{ color: "#6b7280" }}> (sobra {sobraBaixo}mm abaixo)</span>}
                        </span>
                      </div>
                    )}
                    {pecaL === ret.largura && pecaA === ret.altura && (
                      <div style={{ fontSize: "12px", color: "#34d399" }}>✓ Retalho encaixa perfeitamente — nenhum corte necessário</div>
                    )}
                    {peca.rotacionada && (
                      <div style={{ fontSize: "11px", color: "#f59e0b", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "5px", padding: "5px 10px", marginTop: "2px" }}>
                        ↻ Peça rotacionada 90° — a dimensão {peca.altura}mm fica na largura e {peca.largura}mm na altura
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1f2937", fontSize: "11px", color: "#6b7280", fontFamily: "monospace" }}>
                    Peça: <strong style={{ color: "#818cf8" }}>{peca.produto}</strong> · {peca.largura}×{peca.altura}mm · {m2Peca.toFixed(4)} m²
                  </div>
                </div>
              )}

              {!peca && (
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: "#f59e0b" }}>
                  ⚠ Nenhuma peça do pedido foi associada a este retalho.
                  Acesse o pedido para vincular manualmente o item correto.
                </div>
              )}

              {/* Rodapé */}
              <div style={{ marginTop: "12px", fontSize: "9px", color: "#374151", fontFamily: "monospace", display: "flex", justifyContent: "space-between" }}>
                <span>Urban Glass · {pedido.id} · Retalho {uso.retalho_id}</span>
                <span>{agora.toLocaleString("pt-BR")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
