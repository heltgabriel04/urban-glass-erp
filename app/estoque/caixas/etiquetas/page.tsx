"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getCaixasPorIds } from "@/services/lotes.service";
import { formatDate, formatM2 } from "@/lib/formatters";
import type { LoteEstoque } from "@/types";

function EtiquetaCaixaCard({ c, num }: { c: LoteEstoque; num: number }) {
  const dataEntrada = c.dt_entrada_estimada ? "—" : formatDate(c.dt_entrada);
  const qrData = `https://urbanglasserp.vercel.app/api/cx/${c.qr_token}`;

  return (
    <div className="etiqueta">
      <div className="et-topo">
        <div className="et-empresa">URBAN GLASS</div>
        <div className="et-seq">#{String(num).padStart(3, "0")}</div>
      </div>
      <div className="et-corpo">
        <div className="et-esq">
          <div className="et-linha">
            <span className="et-lbl">CAIXA</span>
            <span className="et-val et-cliente">{c.codigo}</span>
          </div>
          <div className="et-linha">
            <span className="et-lbl">VIDRO</span>
            <span className="et-val">{c.produtos?.nome ?? `#${c.produto_id}`}</span>
          </div>
          <div className="et-linha">
            <span className="et-lbl">ESPESSURA / COR</span>
            <span className="et-val">{c.produtos?.espessura ?? "—"} · {c.produtos?.cor ?? "—"}</span>
          </div>
          <div className="et-linha et-dim">
            <span className="et-lbl">MEDIDA</span>
            <span className="et-val et-medidas">{c.chapa_largura_mm ?? "—"} × {c.chapa_altura_mm ?? "—"} mm</span>
          </div>
          <div className="et-rodape-info">
            <span>Chapas: {c.chapas_saldo}</span>
            <span className="et-sep">·</span>
            <span>Área: {formatM2(Number(c.m2_saldo))}</span>
            <span className="et-sep">·</span>
            <span>Entrada: {dataEntrada}</span>
          </div>
        </div>
        <div className="et-dir">
          <QRCodeSVG value={qrData} size={72} bgColor="#ffffff" fgColor="#000000" level="M" />
          <div className="et-qrlbl">ESCANEAR</div>
        </div>
      </div>
    </div>
  );
}

export default function EtiquetasCaixasPage() {
  const router = useRouter();
  const [caixas, setCaixas] = useState<LoteEstoque[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const raw = sessionStorage.getItem("caixas_etiquetas_ids");
      const ids: number[] = raw ? JSON.parse(raw) : [];
      if (ids.length === 0) { setLoading(false); return; }

      const data = await getCaixasPorIds(ids);
      const porId = new Map(data.map(c => [c.id, c]));
      setCaixas(ids.map(id => porId.get(id)).filter((c): c is LoteEstoque => !!c));
      setLoading(false);
    }
    load();
  }, []);

  if (loading)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial", color: "#333" }}>
        Gerando etiquetas...
      </div>
    );

  if (caixas.length === 0)
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", fontFamily: "Arial" }}>
        <div style={{ color: "#c00", fontWeight: 700 }}>Nenhuma caixa selecionada.</div>
        <button onClick={() => router.push("/estoque/caixas")} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #ccc", cursor: "pointer" }}>
          ← Voltar
        </button>
      </div>
    );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: Arial, sans-serif; background: #666; color: #000; height: auto; overflow-y: auto; }

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

        .grid-wrapper {
          padding: 24px;
          display: flex; flex-direction: column; align-items: center; gap: 20px;
        }

        .etiqueta {
          width: 500px; height: 250px;
          background: white;
          border: 2px solid #555;
          border-radius: 8px;
          overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }

        .et-topo {
          background: #000; color: white;
          padding: 6px 14px;
          display: flex; justify-content: space-between; align-items: center;
          flex-shrink: 0;
        }
        .et-empresa {
          font-size: 15px; font-weight: 900; letter-spacing: 3px;
          font-family: Arial Black, Arial, sans-serif;
        }
        .et-seq { font-size: 12px; font-family: 'Courier New', monospace; color: #bbb; }

        .et-corpo {
          flex: 1; display: flex; padding: 10px 12px 8px 14px; gap: 10px;
          min-height: 0;
        }
        .et-esq {
          flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0;
        }
        .et-dir {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 3px; flex-shrink: 0;
        }
        .et-qrlbl {
          font-size: 8px; color: #333; letter-spacing: 1px;
          font-family: 'Courier New', monospace; text-align: center; font-weight: 700;
        }

        .et-linha { display: flex; flex-direction: column; gap: 0; }
        .et-lbl {
          font-size: 8px; font-weight: 900; letter-spacing: 1.5px;
          color: #333; line-height: 1; text-transform: uppercase;
        }
        .et-val {
          font-size: 14px; font-weight: 700; color: #000;
          line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .et-cliente { font-size: 17px; font-weight: 900; }
        .et-medidas {
          font-size: 16px; font-weight: 900;
          font-family: 'Courier New', monospace; color: #000;
        }
        .et-dim { margin-top: 2px; }

        .et-rodape-info {
          margin-top: auto;
          font-size: 10px; font-family: 'Courier New', monospace;
          color: #000; font-weight: 700;
          border-top: 1px solid #ddd; padding-top: 4px;
          display: flex; gap: 4px; align-items: center; flex-wrap: wrap;
        }
        .et-sep { color: #888; }

        @media print {
          .toolbar { display: none !important; }

          @page {
            size: 100mm 50mm landscape;
            margin: 0;
          }

          html, body {
            background: white;
            margin: 0; padding: 0;
            width: 100mm; height: 50mm;
            overflow: visible;
          }

          .grid-wrapper {
            display: block;
            padding: 0; margin: 0;
            width: 100mm;
            background: white;
            overflow: visible;
          }

          .etiqueta {
            display: flex; flex-direction: column;
            width: 87mm; height: 44mm;
            box-sizing: border-box;
            border: none; border-radius: 0;
            box-shadow: none; overflow: hidden;
            margin: 4mm auto 0 auto; padding: 0;
            page-break-after: always; break-after: page;
          }

          .et-topo {
            padding: 3px 6px;
            background: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            flex-shrink: 0;
          }
          .et-corpo { padding: 3px 4px 3px 4px; gap: 6px; }
          .et-dir img { width: 64px !important; height: 64px !important; }

          .et-empresa { font-size: 9pt; letter-spacing: 2px; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .et-seq     { font-size: 7pt; color: #ccc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .et-lbl     { font-size: 7pt; color: #000 !important; font-weight: 900 !important; letter-spacing: 0.5px; }
          .et-val     { font-size: 8pt; color: #000 !important; font-weight: 900 !important; }
          .et-cliente { font-size: 10pt; color: #000 !important; font-weight: 900 !important; }
          .et-medidas { font-size: 9pt; color: #000 !important; font-weight: 900 !important; }
          .et-rodape-info { font-size: 7pt; color: #000 !important; font-weight: 700 !important; border-top: 0.3pt solid #ccc; padding-top: 2px; margin-top: 2px !important; }
          .et-qrlbl   { font-size: 7pt; color: #000 !important; font-weight: 700 !important; }
          .et-dim     { margin-top: 0; }
        }
      `}</style>

      <div className="toolbar">
        <button className="btn-back" onClick={() => router.push("/estoque/caixas")}>← Voltar</button>
        <div className="toolbar-title">
          Etiquetas de Caixas
          <span style={{ fontSize: "11px", color: "#aaa", marginLeft: "12px" }}>{caixas.length} etiqueta(s)</span>
        </div>
        <button className="btn-print" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      <div className="grid-wrapper">
        {caixas.map((c, i) => (
          <EtiquetaCaixaCard key={c.id} c={c} num={i + 1} />
        ))}
      </div>
    </>
  );
}
