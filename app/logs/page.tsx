"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";

import DateInput from "@/components/ui/DateInput";
import { Campo } from "@/components/ui/Campo";

interface LogAtividade {
  id: string;
  created_at: string;
  usuario_email: string | null;
  acao: string;
  tabela: string;
  registro_id: string | null;
  descricao: string;
  campos_alterados: Record<string, unknown> | null;
}

const ACAO_COR: Record<string, { bg: string; color: string }> = {
  criou:      { bg: "rgba(61,255,160,.15)",  color: "#3dffa0" },
  editou:     { bg: "rgba(0,200,255,.15)",   color: "#00c8ff" },
  excluiu:    { bg: "rgba(244,63,94,.15)",   color: "#f43f5e" },
  aprovou:    { bg: "rgba(61,255,160,.15)",  color: "#3dffa0" },
  rejeitou:   { bg: "rgba(244,63,94,.15)",   color: "#f43f5e" },
  emitiu:     { bg: "rgba(245,158,11,.15)",  color: "#f59e0b" },
  recebeu:    { bg: "rgba(61,255,160,.15)",  color: "#3dffa0" },
  pagou:      { bg: "rgba(61,255,160,.15)",  color: "#3dffa0" },
  cancelou:   { bg: "rgba(244,63,94,.15)",   color: "#f43f5e" },
  avançou:    { bg: "rgba(0,200,255,.15)",   color: "#00c8ff" },
  retrocedeu: { bg: "rgba(245,158,11,.15)",  color: "#f59e0b" },
};

function acaoCor(acao: string) {
  return ACAO_COR[acao] ?? { bg: "rgba(100,100,100,.12)", color: "#888" };
}

function fmtDt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function CamposAlterados({ campos }: { campos: Record<string, unknown> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "6px" }}>
      {Object.entries(campos).map(([k, v]) => {
        const isTransition = v && typeof v === "object" && !Array.isArray(v) && "de" in (v as object) && "para" in (v as object);
        const obj = v as Record<string, unknown>;
        return (
          <div key={k} style={{ fontSize: "11px", fontFamily: "'DM Mono',monospace", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--t3)", minWidth: "80px" }}>{k}:</span>
            {isTransition ? (
              <>
                <span style={{ color: "var(--t2)" }}>{String(obj.de)}</span>
                <span style={{ color: "var(--t3)" }}>→</span>
                <span style={{ color: "var(--acc)" }}>{String(obj.para)}</span>
              </>
            ) : (
              <span style={{ color: "var(--t2)" }}>{JSON.stringify(v)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const TABELAS_LABEL: Record<string, string> = {
  pedidos:       "Pedidos",
  clientes:      "Clientes",
  orcamentos:    "Orçamentos",
  notas_fiscais: "Notas Fiscais",
  lancamentos:   "Financeiro",
};

export default function LogsPage() {
  const [logs, setLogs]               = useState<LogAtividade[]>([]);
  const [todos, setTodos]             = useState<LogAtividade[]>([]);
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroTabela, setFiltroTabela]   = useState("");
  const [filtroData, setFiltroData]       = useState("");
  const [busca, setBusca]             = useState("");
  const [carregando, setCarregando]   = useState(true);
  const [expandido, setExpandido]     = useState<string | null>(null);
  const [ultimaAt, setUltimaAt]       = useState<Date | null>(null);

  function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true);
    fetch("/api/logs")
      .then(r => r.json())
      .then(data => {
        setTodos(Array.isArray(data) ? data : []);
        setUltimaAt(new Date());
        if (!silencioso) setCarregando(false);
      })
      .catch(() => { if (!silencioso) setCarregando(false); });
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(() => carregar(true), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    let f = todos;
    if (filtroUsuario) f = f.filter(l => l.usuario_email === filtroUsuario);
    if (filtroTabela)  f = f.filter(l => l.tabela === filtroTabela);
    if (filtroData)    f = f.filter(l => l.created_at.startsWith(filtroData));
    if (busca) {
      const q = busca.toLowerCase();
      f = f.filter(l =>
        l.descricao.toLowerCase().includes(q) ||
        (l.registro_id ?? "").toLowerCase().includes(q) ||
        (l.usuario_email ?? "").toLowerCase().includes(q)
      );
    }
    setLogs(f);
  }, [todos, filtroUsuario, filtroTabela, filtroData, busca]);

  const usuarios = [...new Set(todos.map(l => l.usuario_email).filter(Boolean))].sort() as string[];
  const tabelas  = [...new Set(todos.map(l => l.tabela))].sort();

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Histórico de Atividades</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>
            {carregando ? "Carregando..." : `${logs.length} registro(s)`}
            {ultimaAt && !carregando && (
              <span style={{ marginLeft: "8px", color: "var(--t3)", opacity: 0.6 }}>
                · atualizado {ultimaAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </span>
          <button
            className="btn bg sm"
            onClick={() => carregar()}
            disabled={carregando}
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            {carregando ? "⟳ Atualizando..." : "⟳ Atualizar"}
          </button>
        </div>
      </div>

      <div className="con">
        {/* Filtros */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px", alignItems: "flex-end" }}>
          <Campo style={{ margin: 0, minWidth: "220px" }} label="Buscar">
            <input className="fc" placeholder="pedido, usuário, descrição..." value={busca} onChange={e => setBusca(e.target.value)} />
          </Campo>
          <Campo style={{ margin: 0, minWidth: "200px" }} label="Usuário">
            <select className="fc" value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Campo>
          <Campo style={{ margin: 0, minWidth: "160px" }} label="Módulo">
            <select className="fc" value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)}>
              <option value="">Todos</option>
              {tabelas.map(t => <option key={t} value={t}>{TABELAS_LABEL[t] ?? t}</option>)}
            </select>
          </Campo>
          <Campo style={{ margin: 0 }} label="Data">
            <DateInput className="fc" value={filtroData} onChange={v => setFiltroData(v)} />
          </Campo>
          {(filtroUsuario || filtroTabela || filtroData || busca) && (
            <button className="btn bg sm" onClick={() => { setFiltroUsuario(""); setFiltroTabela(""); setFiltroData(""); setBusca(""); }}>
              ✕ Limpar filtros
            </button>
          )}
        </div>

        {/* Lista */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {carregando && (
            <div style={{ textAlign: "center", color: "var(--t3)", padding: "40px", fontSize: "12px" }}>Carregando logs...</div>
          )}
          {!carregando && logs.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--t3)", padding: "40px", fontSize: "12px" }}>
              {todos.length === 0 ? "Nenhuma atividade registrada ainda." : "Nenhum resultado para os filtros selecionados."}
            </div>
          )}
          {logs.map(log => {
            const cor = acaoCor(log.acao);
            const aberto = expandido === log.id;
            const temCampos = log.campos_alterados && Object.keys(log.campos_alterados).length > 0;
            return (
              <div key={log.id}
                onClick={() => temCampos ? setExpandido(aberto ? null : log.id) : undefined}
                style={{
                  padding: "12px 16px",
                  background: "var(--surf1)",
                  border: "1px solid var(--b1)",
                  borderLeft: `3px solid ${cor.color}`,
                  borderRadius: "8px",
                  cursor: temCampos ? "pointer" : "default",
                  transition: "border-color 0.15s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  {/* Ação */}
                  <span style={{
                    fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
                    background: cor.bg, color: cor.color, border: `1px solid ${cor.color}44`,
                    fontFamily: "'DM Mono',monospace", textTransform: "uppercase", whiteSpace: "nowrap",
                  }}>
                    {log.acao}
                  </span>

                  {/* Módulo */}
                  <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", background: "var(--surf2)", padding: "2px 7px", borderRadius: "99px", border: "1px solid var(--b2)", whiteSpace: "nowrap" }}>
                    {TABELAS_LABEL[log.tabela] ?? log.tabela}
                    {log.registro_id && <span style={{ marginLeft: "4px", color: "var(--acc2)" }}>· {log.registro_id}</span>}
                  </span>

                  {/* Descrição */}
                  <span style={{ flex: 1, fontSize: "13px", color: "var(--t1)", minWidth: "160px" }}>{log.descricao}</span>

                  {/* Usuário + Data */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", flexShrink: 0 }}>
                    <span style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono',monospace" }}>{log.usuario_email ?? "—"}</span>
                    <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{fmtDt(log.created_at)}</span>
                  </div>

                  {/* Indicador de detalhes */}
                  {temCampos && (
                    <span style={{ fontSize: "11px", color: "var(--t3)", transition: "transform 0.2s", display: "inline-block", transform: aberto ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>▾</span>
                  )}
                </div>

                {/* Campos alterados (expansível) */}
                {aberto && temCampos && (
                  <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--b1)" }}>
                    <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px", fontFamily: "'DM Mono',monospace" }}>Campos alterados</div>
                    <CamposAlterados campos={log.campos_alterados!} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
