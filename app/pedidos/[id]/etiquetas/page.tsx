"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPedidoById } from "@/services/pedidos.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import { isChapaInteira } from "@/lib/chapas";
import type { Pedido } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";

interface PecaPlacada {
  x: number; y: number; l: number; a: number;
  idx: number; prod: string; rot: boolean;
}
interface ChapaData {
  W: number; H: number; prod: string;
  placed: PecaPlacada[];
  free: { x: number; y: number; l: number; a: number }[];
}

interface Etiqueta {
  pedidoId: string;
  clienteNome: string;
  material: string;
  largura: number;
  altura: number;
  chapaNum: number;
  totalChapas: number;
  pecaNum: number;
  totalPecasNaChapa: number;
  totalPecasGeral: number;
  loteCorte: string;
  qrUrl: string;
}

function QRCode({ url, size = 72 }: { url: string; size?: number }) {
  const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=2`;
  return (
    <img
      src={qrApi}
      alt="QR"
      width={size}
      height={size}
      style={{ display: "block", imageRendering: "pixelated" }}
    />
  );
}

function EtiquetaCard({ et, num }: { et: Etiqueta; num: number }) {
  return (
    <div className="etiqueta">
      <div className="et-topo">
        <div className="et-empresa">URBAN GLASS</div>
        <div className="et-seq">#{String(num).padStart(3, "0")}</div>
      </div>
      <div className="et-corpo">
        <div className="et-esq">
          <div className="et-linha">
            <span className="et-lbl">CLIENTE</span>
            <span className="et-val et-cliente">{et.clienteNome}</span>
          </div>
          <div className="et-linha">
            <span className="et-lbl">MATERIAL</span>
            <span className="et-val">{et.material}</span>
          </div>
          <div className="et-linha">
            <span className="et-lbl">PEDIDO</span>
            <span className="et-val et-pedido">{et.pedidoId}</span>
          </div>
          <div className="et-linha et-dim">
            <span className="et-lbl">MEDIDAS</span>
            <span className="et-val et-medidas">L {et.largura} × H {et.altura} mm</span>
          </div>
          <div className="et-rodape-info">
            <span># Montagem: {et.chapaNum}/{et.totalChapas} #</span>
            <span className="et-sep">·</span>
            <span>Peça: {et.pecaNum}/{et.totalPecasNaChapa}</span>
            <span className="et-sep">·</span>
            <span>Total geral: {et.totalPecasGeral}</span>
          </div>
          <div className="et-lote">Lote: {et.loteCorte}</div>
        </div>
        <div className="et-dir">
          <QRCode url={et.qrUrl} size={68} />
          <div className="et-qrlbl">ESCANEAR</div>
        </div>
      </div>
    </div>
  );
}

export default function EtiquetasPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [pedido, setPedido]           = useState<Pedido | null>(null);
  const [otim, setOtim]               = useState<HistoricoOtimizador | null>(null);
  const [etiquetas, setEtiquetas]     = useState<Etiqueta[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filtroChapa, setFiltroChapa] = useState<number | "todas">("todas");
  const [totalChapas, setTotalChapas] = useState(0);
  const [modoChapa, setModoChapa]     = useState(false);

  useEffect(() => {
    async function load() {
      const [ped, otims] = await Promise.all([
        getPedidoById(id),
        getOtimizacoesPorPedido(id),
      ]);
      setPedido(ped);

      if (otims.length > 0 && otims[0].chapas_json) {
        const o = otims[0];
        setOtim(o);
        const chapas = o.chapas_json as ChapaData[];
        setTotalChapas(chapas.length);

        const lote =
          new Date(o.dt_otim)
            .toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
            .replace(/\//g, "") +
          "-" + id;

        const totalGeral = chapas.reduce((s, c) => s + c.placed.length, 0);
        const ets: Etiqueta[] = [];

        chapas.forEach((chapa, ci) => {
          chapa.placed.forEach((peca, pi) => {
            const pidDaPeca = (peca as any).pedidoId ?? id;
            ets.push({
              pedidoId:          pidDaPeca,
              clienteNome:       ped?.clientes?.nome ?? "—",
              material:          peca.prod || chapa.prod,
              largura:           peca.l,
              altura:            peca.a,
              chapaNum:          ci + 1,
              totalChapas:       chapas.length,
              pecaNum:           pi + 1,
              totalPecasNaChapa: chapa.placed.length,
              totalPecasGeral:   totalGeral,
              loteCorte:         lote,
              qrUrl: `https://urbanglasserp.vercel.app/pedidos/${pidDaPeca}/producao`,
            });
          });
        });

        setEtiquetas(ets);
      } else {
        const itens = ped?.itens_pedido ?? [];
        if (itens.length > 0 && itens.every(i => isChapaInteira(i.largura, i.altura))) {
          setModoChapa(true);
          const hoje = new Date();
          const dd  = String(hoje.getDate()).padStart(2, "0");
          const mm  = String(hoje.getMonth() + 1).padStart(2, "0");
          const aa  = String(hoje.getFullYear()).slice(-2);
          const lote = `${dd}${mm}${aa}-${id}`;

          const totalGeral = itens.reduce((s, i) => s + i.quantidade, 0);
          setTotalChapas(totalGeral);

          const ets: Etiqueta[] = [];
          let chapaIdx = 1;
          itens.forEach((item) => {
            for (let q = 0; q < item.quantidade; q++) {
              ets.push({
                pedidoId:          id,
                clienteNome:       ped?.clientes?.nome ?? "—",
                material:          item.produto_nome,
                largura:           item.largura,
                altura:            item.altura,
                chapaNum:          chapaIdx,
                totalChapas:       totalGeral,
                pecaNum:           1,
                totalPecasNaChapa: 1,
                totalPecasGeral:   totalGeral,
                loteCorte:         lote,
                qrUrl: `https://urbanglasserp.vercel.app/pedidos/${id}/producao`,
              });
              chapaIdx++;
            }
          });

          setEtiquetas(ets);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const etiquetasFiltradas =
    filtroChapa === "todas"
      ? etiquetas
      : etiquetas.filter((e) => e.chapaNum === filtroChapa);

  if (loading)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial", color: "#333" }}>
        Gerando etiquetas...
      </div>
    );

  if (!pedido || (!otim && !modoChapa))
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", fontFamily: "Arial" }}>
        <div style={{ color: "#c00", fontWeight: 700 }}>Nenhuma otimização encontrada para este pedido.</div>
        <button onClick={() => router.back()} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #ccc", cursor: "pointer" }}>
          ← Voltar
        </button>
      </div>
    );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: Arial, sans-serif; background: #777; color: #000; }

        .toolbar {
          position: sticky; top: 0; z-index: 100;
          background: #111; padding: 8px 20px;
          display: flex; align-items: center; gap: 10px;
        }
        .toolbar-title { flex: 1; color: white; font-size: 13px; font-weight: 700; }
        .toolbar-title span { color: #3dffa0; }
        .btn-back {
          padding: 6px 12px; border-radius: 4px; border: 1px solid #555;
          background: transparent; color: #ccc; cursor: pointer; font-size: 12px; font-family: Arial;
        }
        .btn-print {
          padding: 7px 16px; border-radius: 4px; border: none;
          background: #3dffa0; color: #000; font-weight: 700; cursor: pointer; font-size: 12px; font-family: Arial;
        }
        .filtro-wrap { display: flex; align-items: center; gap: 6px; color: #aaa; font-size: 11px; }
        .filtro-wrap select {
          background: #222; border: 1px solid #444; border-radius: 4px;
          color: #eee; font-size: 11px; padding: 4px 8px; cursor: pointer;
        }
        .info-bar {
          background: #1a1a1a; padding: 6px 20px;
          font-size: 11px; color: #888; font-family: 'Courier New', monospace;
          display: flex; gap: 20px;
        }
        .info-bar span { color: #3dffa0; }

        .grid-wrapper {
          padding: 20px;
          display: flex; flex-direction: column; align-items: center; gap: 16px;
        }

        .etiqueta {
          width: 300px; height: 150px;
          background: white; border: 1.5px solid #888; border-radius: 6px;
          overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        }

        .et-topo {
          background: #000; color: white; padding: 3px 8px;
          display: flex; justify-content: space-between; align-items: center;
        }
        .et-empresa { font-size: 11px; font-weight: 900; letter-spacing: 2px; font-family: Arial Black, Arial, sans-serif; }
        .et-seq { font-size: 9px; font-family: 'Courier New', monospace; color: #aaa; }

        .et-corpo {
          flex: 1; display: flex; gap: 0; padding: 5px 6px 4px 6px;
        }
        .et-esq { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .et-dir {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 2px; flex-shrink: 0; margin-left: 5px;
        }
        .et-qrlbl { font-size: 6px; color: #888; letter-spacing: 1px; font-family: 'Courier New', monospace; text-align: center; }

        .et-linha { display: flex; flex-direction: column; gap: 0; }
        .et-lbl { font-size: 6px; font-weight: 700; letter-spacing: 1px; color: #888; line-height: 1; text-transform: uppercase; }
        .et-val { font-size: 10px; font-weight: 700; color: #000; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .et-cliente { font-size: 11px; font-weight: 900; }
        .et-pedido  { font-size: 12px; font-weight: 900; letter-spacing: 1px; }
        .et-medidas { font-size: 12px; font-weight: 900; font-family: 'Courier New', monospace; color: #111; }
        .et-dim { margin-top: 1px; }

        .et-rodape-info {
          margin-top: auto; font-size: 7.5px; font-family: 'Courier New', monospace;
          color: #333; font-weight: 700; border-top: 0.5px solid #ccc;
          padding-top: 2px; display: flex; gap: 3px; align-items: center; flex-wrap: wrap;
        }
        .et-sep { color: #bbb; }
        .et-lote { font-size: 6.5px; font-family: 'Courier New', monospace; color: #aaa; margin-top: 1px; }

@media print {
  .toolbar, .info-bar { display: none !important; }

  /* margem lateral 5mm + margem superior 3mm — igual ao sistema anterior */
  @page {
    size: 100mm 50mm;
    margin: 3mm 5mm 0mm 5mm;
  }

  html, body {
    background: white;
    margin: 0; padding: 0;
    width: 90mm; height: 47mm;
  }

  .grid-wrapper {
    display: block;
    padding: 0; margin: 0;
    width: 90mm;
    background: white;
  }

  .etiqueta {
    display: flex; flex-direction: column;
    width: 90mm; height: 47mm;
    box-sizing: border-box;
    border: 0.3pt solid #000; border-radius: 2mm;
    box-shadow: none; overflow: hidden;
    margin: 0;
    page-break-after: always; break-after: page;
  }

  /* forçar preto em todos os textos sobre fundo branco */
  .et-lbl, .et-val, .et-cliente, .et-pedido, .et-medidas,
  .et-rodape-info, .et-sep, .et-lote, .et-qrlbl { color: #000 !important; }

  .et-topo { padding: 3px 8px; }
  .et-corpo { padding: 4px 5px 3px 6px; }
  .et-dir img { width: 52px !important; height: 52px !important; }

  .et-empresa { font-size: 9pt; letter-spacing: 2px; }
  .et-seq     { font-size: 7pt; }
  .et-lbl     { font-size: 5pt; }
  .et-val     { font-size: 8pt; }
  .et-cliente { font-size: 9pt; }
  .et-pedido  { font-size: 10pt; }
  .et-medidas { font-size: 10pt; }
  .et-rodape-info { font-size: 6pt; }
  .et-lote    { font-size: 5pt; }
  .et-qrlbl   { font-size: 5pt; }
}
      `}</style>

      <div className="toolbar">
        <button className="btn-back" onClick={() => router.back()}>← Voltar</button>
        <div className="toolbar-title">
          Etiquetas — <span>{id}</span>
          <span style={{ fontSize: "11px", color: "#aaa", marginLeft: "12px" }}>
            {etiquetasFiltradas.length} etiqueta(s)
            {filtroChapa !== "todas" ? ` · Chapa ${filtroChapa}` : ""}
          </span>
        </div>

        {totalChapas > 1 && (
          <div className="filtro-wrap">
            <span>Filtrar:</span>
            <select
              value={filtroChapa}
              onChange={(e) =>
                setFiltroChapa(e.target.value === "todas" ? "todas" : Number(e.target.value))
              }
            >
              <option value="todas">Todas as chapas</option>
              {Array.from({ length: totalChapas }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Chapa {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}

        <button className="btn-print" onClick={() => window.print()}>
          🖨 Imprimir
        </button>
      </div>

      <div className="info-bar">
        <div>Pedido: <span>{id}</span></div>
        <div>Cliente: <span>{pedido.clientes?.nome ?? "—"}</span></div>
        {otim ? (
          <>
            <div>Otimização: <span>{new Date(otim.dt_otim).toLocaleDateString("pt-BR")}</span></div>
            <div>Aproveitamento: <span>{otim.aproveitamento}%</span></div>
          </>
        ) : (
          <div>Tipo: <span>Chapas inteiras</span></div>
        )}
        <div>Total de etiquetas: <span>{etiquetas.length}</span></div>
      </div>

      <div className="grid-wrapper">
        {etiquetasFiltradas.length === 0 ? (
          <div style={{ color: "white", padding: "40px", textAlign: "center" }}>
            Nenhuma peça encontrada nesta otimização.
          </div>
        ) : (
          etiquetasFiltradas.map((et, i) => (
            <EtiquetaCard key={i} et={et} num={i + 1} />
          ))
        )}
      </div>
    </>
  );
}