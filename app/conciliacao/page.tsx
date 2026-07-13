"use client";

import { useEffect, useRef, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getContasBancarias } from "@/services/contasBancarias.service";
import {
  getExtratos, getLinhasExtrato, criarExtratoComLinhas, sugerirMatch, confirmarMatch, ignorarLinha,
  type ExtratoImportado, type ExtratoLinha, type BaixaCandidata,
} from "@/services/conciliacao.service";
import { useToast } from "@/components/ui/toast";
import { Campo } from "@/components/ui/Campo";
import { formatBRL } from "@/lib/formatters";
import type { ContaBancaria } from "@/types";
import {
  DndContext, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

function fmtData(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export default function ConciliacaoPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [contaId, setContaId] = useState<string | number>("");
  const [extratos, setExtratos] = useState<ExtratoImportado[]>([]);
  const [extratoAbertoId, setExtratoAbertoId] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<ExtratoLinha[]>([]);
  const [sugestoes, setSugestoes] = useState<Map<number, BaixaCandidata[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [importando, setImportando] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [cs, es] = await Promise.all([getContasBancarias(true), getExtratos()]);
    setContas(cs);
    setExtratos(es);
    setLoading(false);
  }

  async function abrirExtrato(id: number) {
    setExtratoAbertoId(id);
    const ls = await getLinhasExtrato(id);
    setLinhas(ls);
    const map = new Map<number, BaixaCandidata[]>();
    for (const l of ls) {
      if (!l.conciliado && !l.ignorado) map.set(l.id, await sugerirMatch(l));
    }
    setSugestoes(map);
  }

  async function handleImportar() {
    const file = fileRef.current?.files?.[0];
    if (!contaId) { toast("Selecione a conta bancária", "err"); return; }
    if (!file) { toast("Selecione um arquivo CSV", "err"); return; }
    setImportando(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/bancos-caixa/importar-extrato", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { toast(json.error ?? "Erro ao importar", "err"); setImportando(false); return; }
      const extratoId = await criarExtratoComLinhas(Number(contaId), file.name, json.linhas);
      setImportando(false);
      if (extratoId) {
        toast(`${json.linhas.length} linha(s) importada(s)`);
        if (fileRef.current) fileRef.current.value = "";
        await load();
        abrirExtrato(extratoId);
      } else {
        toast("Erro ao salvar extrato", "err");
      }
    } catch {
      setImportando(false);
      toast("Erro ao importar extrato", "err");
    }
  }

  async function handleConfirmar(linhaId: number, baixaId: number) {
    const ok = await confirmarMatch(linhaId, baixaId);
    if (ok) { toast("Conciliado"); if (extratoAbertoId) abrirExtrato(extratoAbertoId); }
    else toast("Erro ao conciliar", "err");
  }

  async function handleIgnorar(linhaId: number) {
    const ok = await ignorarLinha(linhaId);
    if (ok) { toast("Linha ignorada"); if (extratoAbertoId) abrirExtrato(extratoAbertoId); }
    else toast("Erro ao ignorar", "err");
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const baixaId = active.data.current?.baixaId as number | undefined;
    if (!baixaId) return;
    const linhaId = Number(String(over.id).replace("linha-", ""));
    if (!linhaId) return;
    handleConfirmar(linhaId, baixaId);
  }

  const pendentes = linhas.filter(l => !l.conciliado && !l.ignorado);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Conciliação Bancária</div>
      </div>

      <div className="con">
        <div className="card" style={{ marginBottom: "20px" }}>
          <div className="ct">Importar extrato (CSV)</div>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <Campo style={{ minWidth: "220px" }} label="Conta Bancária">
              <select className="fc" value={contaId} onChange={e => setContaId(e.target.value)} style={{ margin: 0 }}>
                <option value="">Selecione...</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Arquivo CSV">
              <input ref={fileRef} type="file" accept=".csv" className="fc" style={{ margin: 0 }} />
            </Campo>
            <button className="btn bp sm" onClick={handleImportar} disabled={importando}>
              {importando ? "Importando..." : "Importar"}
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "8px" }}>
            Colunas esperadas: Data, Valor (negativo = saída), Descrição — nomes tolerantes a acento/ordem/maiúsculas.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "16px" }}>
          <div>
            <div className="ct">Extratos importados</div>
            {loading ? <div className="loading">Carregando...</div> : extratos.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>Nenhum extrato importado ainda.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {extratos.map(e => (
                  <button key={e.id} onClick={() => abrirExtrato(e.id)}
                    className={extratoAbertoId === e.id ? "btn bp sm" : "btn bg sm"}
                    style={{ textAlign: "left", justifyContent: "flex-start" }}>
                    <div>
                      <div>{e.contas_bancarias?.nome ?? "—"}</div>
                      <div style={{ fontSize: "10px", opacity: 0.7 }}>{e.arquivo_nome} · {new Date(e.importado_em).toLocaleDateString("pt-BR")}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            {extratoAbertoId === null ? (
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>Selecione um extrato à esquerda pra conciliar.</div>
            ) : (
              <>
                <div className="ct">Linhas do extrato — {pendentes.length} pendente(s)</div>
                <div style={{ fontSize: "11px", color: "var(--t3)", margin: "-4px 0 8px" }}>
                  Clique numa sugestão pra confirmar, ou arraste o chip até a linha certa.
                </div>
                <div className="tw">
                  <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Tipo</th>
                          <th style={{ textAlign: "right" }}>Valor</th>
                          <th>Descrição (banco)</th>
                          <th>Sugestão / Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(l => (
                          <LinhaExtratoRow
                            key={l.id} l={l} candidatas={sugestoes.get(l.id) ?? []}
                            onConfirmar={baixaId => handleConfirmar(l.id, baixaId)}
                            onIgnorar={() => handleIgnorar(l.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </DndContext>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function LinhaExtratoRow({ l, candidatas, onConfirmar, onIgnorar }: {
  l: ExtratoLinha; candidatas: BaixaCandidata[];
  onConfirmar: (baixaId: number) => void; onIgnorar: () => void;
}) {
  const podeSoltar = !l.conciliado && !l.ignorado;
  const { setNodeRef, isOver } = useDroppable({ id: `linha-${l.id}`, disabled: !podeSoltar });
  return (
    <tr ref={setNodeRef} style={{
      opacity: l.ignorado ? 0.5 : 1,
      background: isOver ? "rgba(61,255,160,0.1)" : undefined,
      transition: "background 0.12s",
    }}>
      <td className="mono" style={{ fontSize: "12px" }}>{fmtData(l.data)}</td>
      <td><span className={l.tipo === "Entrada" ? "chip cg" : "chip cr"}>{l.tipo}</span></td>
      <td className="mono" style={{ textAlign: "right" }}>{formatBRL(l.valor)}</td>
      <td style={{ fontSize: "12px", color: "var(--t3)" }}>{l.descricao_banco || "—"}</td>
      <td>
        {l.conciliado ? (
          <span className="chip cg">Conciliado</span>
        ) : l.ignorado ? (
          <span className="chip cgr">Ignorado</span>
        ) : candidatas.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {candidatas.map(c => (
              <CandidataChip key={c.baixaId} linhaId={l.id} candidata={c} onConfirmar={() => onConfirmar(c.baixaId)} />
            ))}
            <button className="btn bg xs" onClick={onIgnorar}>Ignorar linha</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--t3)" }}>Sem sugestão</span>
            <button className="btn bg xs" onClick={onIgnorar}>Ignorar</button>
          </div>
        )}
      </td>
    </tr>
  );
}

function CandidataChip({ linhaId, candidata, onConfirmar }: {
  linhaId: number; candidata: BaixaCandidata; onConfirmar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `cand-${linhaId}-${candidata.baixaId}`, data: { baixaId: candidata.baixaId },
  });
  return (
    <button
      ref={setNodeRef} {...listeners} {...attributes}
      className="btn bp xs" onClick={onConfirmar}
      title="Clique pra confirmar, ou arraste até a linha certa"
      style={{
        cursor: "grab",
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        opacity: isDragging ? 0.4 : 1,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      Confirmar: {candidata.descricao} · {formatBRL(candidata.valor)} ({fmtData(candidata.data)})
    </button>
  );
}
