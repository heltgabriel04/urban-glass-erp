"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getPedidoById } from "@/services/pedidos.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import { isChapaInteira } from "@/lib/chapas";
import type { Pedido } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";
import corteCertoData from "@/data/etiquetas-corte-certo-p058-p059.json";

// Ajuste único para os pedidos P-058/P-059 (obra São Lourenço): a impressão das etiquetas
// segue a sequência real de corte do plano da Corte Certo (33 montagens = 33 chapas físicas),
// não o plano salvo no otimizador do sistema. Dados extraídos e casados por dimensão a partir
// do PDF do plano de corte + da Relação de Vidros do pedido. Ver conversa de 01/07/2026.
const TOTAL_MONTAGENS_CORTE_CERTO = 33;
interface PecaCorteCerto { ordem: number; montagem: number; tipo?: string; localizacao?: string; largura: number; altura: number; }
const CORTE_CERTO_MAP = corteCertoData as Record<string, PecaCorteCerto[]>;

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
  qrData: string;
  modoCaixa?: boolean;
  modoVidroCliente?: boolean;
  codigoAdicional?: string | null;
}

function QRCode({ data, size = 72 }: { data: string; size?: number }) {
  return (
    <QRCodeSVG
      value={data}
      size={size}
      bgColor="#ffffff"
      fgColor="#000000"
      level="M"
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
            <span className="et-lbl">{et.codigoAdicional ? "MEDIDAS / CÓDIGO" : "MEDIDAS"}</span>
            <span className="et-val et-medidas">
              L {et.largura} × H {et.altura} mm
              {et.codigoAdicional && <span className="et-codigo"> · {et.codigoAdicional}</span>}
            </span>
          </div>
          <div className="et-rodape-info">
            {et.modoCaixa ? (
              <>
                <span>Caixa: {et.chapaNum}/{et.totalChapas}</span>
                <span className="et-sep">·</span>
                <span>Chapas: {et.pecaNum}/{et.totalPecasNaChapa}</span>
                <span className="et-sep">·</span>
                <span>Total: {et.totalPecasGeral} chapas</span>
              </>
            ) : et.modoVidroCliente ? (
              <>
                <span>📦 Vidro do Cliente</span>
                <span className="et-sep">·</span>
                <span>Item: {et.chapaNum}/{et.totalChapas}</span>
                <span className="et-sep">·</span>
                <span>Peça: {et.pecaNum}/{et.totalPecasNaChapa}</span>
                <span className="et-sep">·</span>
                <span>Total geral: {et.totalPecasGeral}</span>
              </>
            ) : (
              <>
                <span># Montagem: {et.chapaNum}/{et.totalChapas} #</span>
                <span className="et-sep">·</span>
                <span>Peça: {et.pecaNum}/{et.totalPecasNaChapa}</span>
                <span className="et-sep">·</span>
                <span>Total geral: {et.totalPecasGeral}</span>
              </>
            )}
          </div>
          <div className="et-lote">Lote: {et.loteCorte}</div>
        </div>
        <div className="et-dir">
          <QRCode data={et.qrData} size={90} />
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
  const [modoVidroCliente, setModoVidroCliente] = useState(false);
  const [modoCorteCerto, setModoCorteCerto] = useState(false);
  const [chapasDisponiveis, setChapasDisponiveis] = useState<number[]>([]);

  useEffect(() => {
    async function load() {
      const corteCertoLista = CORTE_CERTO_MAP[id];
      if (corteCertoLista) {
        const ped = await getPedidoById(id);
        setPedido(ped);
        setModoCorteCerto(true);

        const hoje = new Date();
        const dd = String(hoje.getDate()).padStart(2, "0");
        const mm = String(hoje.getMonth() + 1).padStart(2, "0");
        const aa = String(hoje.getFullYear()).slice(-2);
        const lote = `${dd}${mm}${aa}-${id}`;

        const codigoFila = new Map<string, { codigo: string; restante: number }[]>();
        (ped?.itens_pedido ?? []).forEach((item) => {
          if (!item.codigo_adicional) return;
          const key = [item.largura, item.altura].sort((a, b) => a - b).join("x");
          const fila = codigoFila.get(key) ?? [];
          fila.push({ codigo: item.codigo_adicional, restante: item.quantidade });
          codigoFila.set(key, fila);
        });
        function buscarCodigo(l: number, a: number): string | null {
          const key = [l, a].sort((x, y) => x - y).join("x");
          const fila = codigoFila.get(key);
          if (!fila || fila.length === 0) return null;
          const entry = fila[0];
          entry.restante--;
          if (entry.restante <= 0) fila.shift();
          return entry.codigo;
        }

        const material = ped?.itens_pedido?.[0]?.produto_nome ?? "—";
        const contagemPorMontagem = new Map<number, number>();
        corteCertoLista.forEach(e => contagemPorMontagem.set(e.montagem, (contagemPorMontagem.get(e.montagem) ?? 0) + 1));
        const posDentroMontagem = new Map<number, number>();

        const ets: Etiqueta[] = corteCertoLista.map((e) => {
          const pos = (posDentroMontagem.get(e.montagem) ?? 0) + 1;
          posDentroMontagem.set(e.montagem, pos);
          return {
            pedidoId: id,
            clienteNome: ped?.clientes?.nome ?? "—",
            material,
            largura: e.largura,
            altura: e.altura,
            chapaNum: e.montagem,
            totalChapas: TOTAL_MONTAGENS_CORTE_CERTO,
            pecaNum: pos,
            totalPecasNaChapa: contagemPorMontagem.get(e.montagem) ?? 0,
            totalPecasGeral: corteCertoLista.length,
            loteCorte: lote,
            qrData: `https://urbanglasserp.vercel.app/api/r/${ped?.qr_token}`,
            codigoAdicional: buscarCodigo(e.largura, e.altura),
          };
        });

        setEtiquetas(ets);
        setTotalChapas(TOTAL_MONTAGENS_CORTE_CERTO);
        setChapasDisponiveis([...contagemPorMontagem.keys()].sort((a, b) => a - b));
        setLoading(false);
        return;
      }

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

        // Fila de códigos adicionais por dimensão (largura/altura, em qualquer ordem
        // por causa de peças rotacionadas), para casar com as peças já cortadas.
        const codigoFila = new Map<string, { codigo: string; restante: number }[]>();
        (ped?.itens_pedido ?? []).forEach((item) => {
          if (!item.codigo_adicional) return;
          const key = [item.largura, item.altura].sort((a, b) => a - b).join("x");
          const fila = codigoFila.get(key) ?? [];
          fila.push({ codigo: item.codigo_adicional, restante: item.quantidade });
          codigoFila.set(key, fila);
        });
        function buscarCodigo(l: number, a: number): string | null {
          const key = [l, a].sort((x, y) => x - y).join("x");
          const fila = codigoFila.get(key);
          if (!fila || fila.length === 0) return null;
          const entry = fila[0];
          entry.restante--;
          if (entry.restante <= 0) fila.shift();
          return entry.codigo;
        }

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
              qrData: `https://urbanglasserp.vercel.app/api/r/${ped?.qr_token}`,
              codigoAdicional:   pidDaPeca === id ? buscarCodigo(peca.l, peca.a) : null,
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

          // 3+3 vem 24 chapas por caixa; demais (4+4, etc.) vem 18
          function chapasPorCaixa(nome: string) {
            return nome.includes("3+3") ? 24 : 18;
          }

          const ets: Etiqueta[] = [];
          let caixaIdx = 1;

          itens.forEach((item) => {
            const porCaixa   = chapasPorCaixa(item.produto_nome);
            const numCaixas  = Math.ceil(item.quantidade / porCaixa);
            for (let c = 0; c < numCaixas; c++) {
              const nessaCaixa = (c === numCaixas - 1)
                ? item.quantidade - c * porCaixa
                : porCaixa;
              ets.push({
                pedidoId:          id,
                clienteNome:       ped?.clientes?.nome ?? "—",
                material:          item.produto_nome,
                largura:           item.largura,
                altura:            item.altura,
                chapaNum:          caixaIdx,
                totalChapas:       0, // preenchido abaixo
                pecaNum:           nessaCaixa,
                totalPecasNaChapa: porCaixa,
                totalPecasGeral:   totalGeral,
                loteCorte:         lote,
                qrData: `https://urbanglasserp.vercel.app/api/r/${ped?.qr_token}`,
                modoCaixa:         true,
              });
              caixaIdx++;
            }
          });

          const totalCaixas = ets.length;
          setTotalChapas(totalCaixas);
          setEtiquetas(ets.map(e => ({ ...e, totalChapas: totalCaixas })));
        } else if (itens.length > 0 && itens.every(i => i.vidro_cliente)) {
          // Vidro do cliente: não passa pelo otimizador de chapas (não é estoque próprio),
          // então a etiqueta é gerada direto a partir das peças do pedido, uma por unidade.
          setModoVidroCliente(true);
          const hoje = new Date();
          const dd  = String(hoje.getDate()).padStart(2, "0");
          const mm  = String(hoje.getMonth() + 1).padStart(2, "0");
          const aa  = String(hoje.getFullYear()).slice(-2);
          const lote = `${dd}${mm}${aa}-${id}`;

          const totalGeral = itens.reduce((s, i) => s + i.quantidade, 0);
          const ets: Etiqueta[] = [];

          itens.forEach((item, ii) => {
            for (let p = 0; p < item.quantidade; p++) {
              ets.push({
                pedidoId:          id,
                clienteNome:       ped?.clientes?.nome ?? "—",
                material:          item.produto_nome,
                largura:           item.largura,
                altura:            item.altura,
                chapaNum:          ii + 1,
                totalChapas:       itens.length,
                pecaNum:           p + 1,
                totalPecasNaChapa: item.quantidade,
                totalPecasGeral:   totalGeral,
                loteCorte:         lote,
                qrData: `https://urbanglasserp.vercel.app/api/r/${ped?.qr_token}`,
                modoVidroCliente:  true,
                codigoAdicional:   item.codigo_adicional,
              });
            }
          });

          setTotalChapas(itens.length);
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

  if (!pedido || (!otim && !modoChapa && !modoVidroCliente && !modoCorteCerto))
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", fontFamily: "Arial" }}>
        <div style={{ color: "#c00", fontWeight: 700 }}>Este pedido ainda não tem um plano de corte gerado.</div>
        <div style={{ color: "#666", fontSize: "13px" }}>Rode o Otimizador de Corte pra saber quantas chapas/peças imprimir.</div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => router.back()} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #ccc", cursor: "pointer" }}>
            ← Voltar
          </button>
          <button onClick={() => router.push(`/otimizador?pedido=${id}`)} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#3dffa0", fontWeight: 700, cursor: "pointer" }}>
            ◈ Ir para o Otimizador
          </button>
        </div>
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
        .et-cliente { font-size: 15px; font-weight: 900; }
        .et-pedido  { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
        .et-medidas {
          font-size: 16px; font-weight: 900;
          font-family: 'Courier New', monospace; color: #000;
        }
        .et-codigo {
          font-size: 15px; font-weight: 900;
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
        .et-lote {
          font-size: 9px; font-family: 'Courier New', monospace;
          color: #333; margin-top: 2px; font-weight: 700;
        }

        @media print {
          .toolbar, .info-bar { display: none !important; }

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

          /* Centralizada (margin auto) em vez de empurrada com margem fixa:
             o diálogo de impressão pode forçar "Margins: None" e ignorar o
             margin do @page, então o respiro fica todo de um lado só. Centralizar
             aqui é por dentro do próprio elemento e não depende dessa opção. */
          .etiqueta {
            display: flex; flex-direction: column;
            width: 87mm; height: 44mm; /* 50mm da página − 4mm de respiro no topo */
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
          .et-cliente { font-size: 8.5pt; color: #000 !important; font-weight: 900 !important; }
          .et-pedido  { font-size: 10pt; color: #000 !important; font-weight: 900 !important; }
          .et-medidas { font-size: 9pt; color: #000 !important; font-weight: 900 !important; }
          .et-codigo  { font-size: 8.5pt; color: #000 !important; font-weight: 900 !important; }
          .et-rodape-info { font-size: 7pt; color: #000 !important; font-weight: 700 !important; border-top: 0.3pt solid #ccc; padding-top: 2px; margin-top: 2px !important; }
          .et-lote    { font-size: 7pt; color: #000 !important; font-weight: 700 !important; margin-top: 1px !important; }
          .et-qrlbl   { font-size: 7pt; color: #000 !important; font-weight: 700 !important; }
          .et-dim     { margin-top: 0; }
        }
      `}</style>

      <div className="toolbar">
        <button className="btn-back" onClick={() => router.back()}>← Voltar</button>
        <div className="toolbar-title">
          Etiquetas — <span>{id}</span>
          <span style={{ fontSize: "11px", color: "#aaa", marginLeft: "12px" }}>
            {etiquetasFiltradas.length} etiqueta(s)
            {filtroChapa !== "todas" ? ` · ${modoVidroCliente ? "Item" : "Chapa"} ${filtroChapa}` : ""}
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
              <option value="todas">{modoVidroCliente ? "Todos os itens" : "Todas as chapas"}</option>
              {(modoCorteCerto ? chapasDisponiveis : Array.from({ length: totalChapas }, (_, i) => i + 1)).map((n) => (
                <option key={n} value={n}>
                  {modoVidroCliente ? `Item ${n}` : `Chapa ${n}`}
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
        {modoCorteCerto ? (
          <div>Tipo: <span>Plano de corte externo (Corte Certo) — ordem real de produção</span></div>
        ) : otim ? (
          <>
            <div>Otimização: <span>{new Date(otim.dt_otim).toLocaleDateString("pt-BR")}</span></div>
            <div>Aproveitamento: <span>{otim.aproveitamento}%</span></div>
          </>
        ) : modoVidroCliente ? (
          <div>Tipo: <span>Vidro do Cliente</span></div>
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