"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatters";
import {
  getOrCreateFechamento,
  atualizarItemChecklist,
  uploadAnexoChecklistItem,
  concluirFechamento,
  reabrirFechamento,
} from "@/services/contabilidadeChecklist.service";
import { getChecklistItemDef } from "@/lib/contabilidadeChecklist";
import type { ChecklistItem, ContabilidadeFechamento, StatusChecklistItem } from "@/types";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const STATUS_LABEL: Record<StatusChecklistItem, string> = {
  pendente: "Pendente",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  nao_aplicavel: "N/A",
};
const STATUS_CHIP: Record<StatusChecklistItem, string> = {
  pendente: "chip cr",
  em_andamento: "chip cy",
  concluido: "chip cg",
  nao_aplicavel: "chip cgr",
};

export default function ChecklistMensalPage() {
  const { toast } = useToast();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [fechamento, setFechamento] = useState<ContabilidadeFechamento | null>(null);
  const [itens, setItens] = useState<ChecklistItem[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioEmail(data.user?.email ?? "sistema"));
  }, []);

  useEffect(() => { load(); }, [ano, mes]);

  async function load() {
    setLoading(true);
    const { fechamento: f, itens: i } = await getOrCreateFechamento(ano, mes);
    setFechamento(f);
    setItens(i);
    setLoading(false);
  }

  async function handleAtualizarItem(item: ChecklistItem, patch: Partial<ChecklistItem>) {
    const ok = await atualizarItemChecklist(item.id, {
      status: patch.status,
      responsavel: patch.responsavel,
      data_conclusao: patch.data_conclusao,
      observacao: patch.observacao,
    });
    if (ok) load();
  }

  async function handleUpload(item: ChecklistItem, file: File) {
    const url = await uploadAnexoChecklistItem(item.id, file);
    if (!url) { toast("Erro ao anexar arquivo", "err"); return; }
    const { error } = await supabase
      .from("contabilidade_checklist_itens")
      .update({ anexos: [...(item.anexos ?? []), url] } as never)
      .eq("id", item.id);
    if (error) { toast("Erro ao salvar anexo", "err"); return; }
    toast("Anexo adicionado");
    load();
  }

  async function handleConcluir() {
    if (!fechamento) return;
    setProcessando(true);
    const res = await concluirFechamento(fechamento.id, usuarioEmail);
    setProcessando(false);
    if (!res.ok) { toast(res.motivo ?? "Não foi possível concluir", "err"); return; }
    toast("Fechamento concluído");
    load();
  }

  async function handleReabrir() {
    if (!fechamento) return;
    setProcessando(true);
    const ok = await reabrirFechamento(fechamento.id);
    setProcessando(false);
    toast(ok ? "Fechamento reaberto" : "Erro ao reabrir", ok ? "ok" : "err");
    if (ok) load();
  }

  const aplicaveis = itens.filter((i) => i.status !== "nao_aplicavel");
  const pendentes = aplicaveis.filter((i) => i.status !== "concluido");

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Checklist Mensal</div>
      </div>
      <ContabilidadeTabs ativo="checklist" />

      <div className="con">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select className="fc" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: "140px" }}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input className="fc" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: "90px" }} />
          </div>

          {fechamento && (
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Fechamento</div>
                <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "'DM Mono', monospace", color: fechamento.percentual === 100 ? "var(--ok)" : "var(--t1)" }}>
                  {fechamento.percentual}%
                </div>
              </div>
              {fechamento.status === "concluido" ? (
                <button className="btn bg" onClick={handleReabrir} disabled={processando}>Reabrir Fechamento</button>
              ) : (
                <button className="btn bp" onClick={handleConcluir} disabled={processando || pendentes.length > 0}>
                  {processando ? "Processando..." : `Concluir Fechamento${pendentes.length > 0 ? ` (${pendentes.length} pendente${pendentes.length > 1 ? "s" : ""})` : ""}`}
                </button>
              )}
            </div>
          )}
        </div>

        {fechamento?.status === "concluido" && (
          <div style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "var(--ok)" }}>
            Fechamento concluído em {formatDate(fechamento.concluido_em)} por {fechamento.concluido_por}.
          </div>
        )}

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {itens.map((item) => {
              const def = getChecklistItemDef(item.item_key);
              const naoAplicavel = item.status === "nao_aplicavel";
              return (
                <div key={item.id} style={{
                  background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px",
                  padding: "14px 18px", opacity: naoAplicavel ? 0.55 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: naoAplicavel ? 0 : "10px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>
                      {def?.label ?? item.item_key}
                      {naoAplicavel && def && <span style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 500, marginLeft: "8px" }}>— disponível na Fase {def.faseDisponivel}</span>}
                    </div>
                    <span className={STATUS_CHIP[item.status]}>{STATUS_LABEL[item.status]}</span>
                  </div>

                  {!naoAplicavel && (
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr auto auto", gap: "10px", alignItems: "end" }}>
                      <div className="fg">
                        <label className="fl">Status</label>
                        <select className="fc" value={item.status} onChange={(e) => handleAtualizarItem(item, { status: e.target.value as StatusChecklistItem, data_conclusao: e.target.value === "concluido" ? new Date().toISOString().split("T")[0] : item.data_conclusao })}>
                          <option value="pendente">Pendente</option>
                          <option value="em_andamento">Em Andamento</option>
                          <option value="concluido">Concluído</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl">Responsável</label>
                        <input className="fc" defaultValue={item.responsavel ?? ""} onBlur={(e) => handleAtualizarItem(item, { responsavel: e.target.value || null })} />
                      </div>
                      <div className="fg">
                        <label className="fl">Observação</label>
                        <input className="fc" defaultValue={item.observacao ?? ""} onBlur={(e) => handleAtualizarItem(item, { observacao: e.target.value || null })} />
                      </div>
                      <div className="fg">
                        <label className="fl">Anexo</label>
                        <input className="fc" type="file" style={{ fontSize: "11px" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(item, f); }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                        {(item.anexos?.length ?? 0) > 0 ? `${item.anexos!.length} anexo(s)` : ""}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
