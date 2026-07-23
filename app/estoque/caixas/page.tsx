"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getTodasCaixas } from "@/services/lotes.service";
import { statusCaixa } from "@/lib/caixaEstoque";
import { formatDate, formatM2 } from "@/lib/formatters";
import type { LoteEstoque } from "@/types";

type FiltroStatus = "todas" | "fechada" | "aberta" | "esgotada";

const CHIP_STATUS: Record<"fechada" | "aberta" | "esgotada", string> = {
  fechada:  "chip cg",
  aberta:   "chip cy",
  esgotada: "chip cr",
};

export default function CaixasEstoquePage() {
  const router = useRouter();
  const [caixas, setCaixas]   = useState<LoteEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProduto, setFiltroProduto] = useState<number | "todas">("todas");
  const [filtroStatus, setFiltroStatus]   = useState<FiltroStatus>("todas");
  // Todas começam selecionadas — 1 clique em "Imprimir" continua imprimindo
  // tudo que está visível; a seleção só serve pra excluir (mesmo padrão de
  // app/pedidos/[id]/etiquetas/page.tsx).
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());

  useEffect(() => {
    getTodasCaixas().then(c => {
      setCaixas(c);
      setSelecionadas(new Set(c.map(item => item.id)));
      setLoading(false);
    });
  }, []);

  const produtosOpts = useMemo(() => {
    const porId = new Map<number, string>();
    caixas.forEach(c => porId.set(c.produto_id, c.produtos?.nome ?? `#${c.produto_id}`));
    return Array.from(porId.entries());
  }, [caixas]);

  const caixasFiltradas = caixas.filter(c => {
    if (filtroProduto !== "todas" && c.produto_id !== filtroProduto) return false;
    if (filtroStatus !== "todas" && statusCaixa(c.chapas_saldo, c.chapas_entrada) !== filtroStatus) return false;
    return true;
  });

  function toggleSelecao(id: number) {
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selecionarTodasVisiveis() {
    setSelecionadas(prev => {
      const next = new Set(prev);
      caixasFiltradas.forEach(c => next.add(c.id));
      return next;
    });
  }

  function limparSelecaoVisiveis() {
    setSelecionadas(prev => {
      const next = new Set(prev);
      caixasFiltradas.forEach(c => next.delete(c.id));
      return next;
    });
  }

  function imprimir(ids: number[]) {
    sessionStorage.setItem("caixas_etiquetas_ids", JSON.stringify(ids));
    router.push("/estoque/caixas/etiquetas");
  }

  const totalSelecionadasVisiveis = caixasFiltradas.filter(c => selecionadas.has(c.id)).length;

  if (loading) return <AppLayout><div className="con">Carregando…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="tb">
        <div>
          <div className="tb-title">Estoque · Caixas</div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>
            {caixasFiltradas.length} caixa{caixasFiltradas.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="fc sm" value={filtroProduto} onChange={e => setFiltroProduto(e.target.value === "todas" ? "todas" : Number(e.target.value))}>
            <option value="todas">Todos os produtos</option>
            {produtosOpts.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <select className="fc sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as FiltroStatus)}>
            <option value="todas">Todos os status</option>
            <option value="fechada">Fechada</option>
            <option value="aberta">Aberta</option>
            <option value="esgotada">Esgotada</option>
          </select>
          <button className="btn bg sm" onClick={selecionarTodasVisiveis}>Selecionar todas</button>
          <button className="btn bg sm" onClick={limparSelecaoVisiveis}>Limpar seleção</button>
          <button className="btn bp sm" onClick={() => imprimir(caixasFiltradas.filter(c => selecionadas.has(c.id)).map(c => c.id))} disabled={totalSelecionadasVisiveis === 0}>
            🖨 Imprimir selecionadas ({totalSelecionadasVisiveis})
          </button>
        </div>
      </div>

      <div className="con">
        <div className="tw" style={{ maxHeight: "calc(100vh - 160px)" }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Código</th>
                <th>Produto</th>
                <th>Medida</th>
                <th>Status</th>
                <th>Chapas (saldo/entrada)</th>
                <th>m² saldo</th>
                <th>Data de entrada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {caixasFiltradas.map(c => {
                const status = statusCaixa(c.chapas_saldo, c.chapas_entrada);
                return (
                  <tr key={c.id}>
                    <td>
                      <input type="checkbox" checked={selecionadas.has(c.id)} onChange={() => toggleSelecao(c.id)}
                        style={{ width: "14px", height: "14px", cursor: "pointer" }} />
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>{c.codigo}</td>
                    <td>{c.produtos?.nome ?? `#${c.produto_id}`}</td>
                    <td className="mono">{c.chapa_largura_mm ?? "—"} × {c.chapa_altura_mm ?? "—"} mm</td>
                    <td><span className={CHIP_STATUS[status]}>{status}</span></td>
                    <td className="mono">{c.chapas_saldo} / {c.chapas_entrada}</td>
                    <td className="mono">{formatM2(Number(c.m2_saldo))}</td>
                    <td className="mono">{c.dt_entrada_estimada ? "estimada" : formatDate(c.dt_entrada)}</td>
                    <td>
                      <button className="btn bw xs" onClick={() => imprimir([c.id])} title="Gerar/reimprimir etiqueta desta caixa">🖨</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
