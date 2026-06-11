"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/toast";
import {
  getProdutosComConfigFiscal,
  salvarConfigFiscal,
  type ProdutoComConfig,
  type ConfigFiscalInput,
} from "@/services/contabilidade.service";
import type { Produto, ConfigFiscalProduto } from "@/types";

// ─── Constantes ───────────────────────────────────────────
const CFOP_OPCOES = [
  { value: "5101", label: "5.101 — Venda produção própria (dentro do estado)" },
  { value: "5102", label: "5.102 — Venda de mercadoria de terceiros (dentro do estado)" },
  { value: "5405", label: "5.405 — Venda com substituição tributária (dentro do estado)" },
  { value: "5910", label: "5.910 — Remessa em bonificação" },
  { value: "6101", label: "6.101 — Venda produção própria (fora do estado)" },
  { value: "6102", label: "6.102 — Venda de mercadoria de terceiros (fora do estado)" },
  { value: "6405", label: "6.405 — Venda com substituição tributária (fora do estado)" },
];

const CST_ICMS_OPCOES = [
  { value: "00", label: "00 — Tributada integralmente" },
  { value: "10", label: "10 — Tributada com cobrança por ST" },
  { value: "20", label: "20 — Com redução de base de cálculo" },
  { value: "40", label: "40 — Isenta" },
  { value: "41", label: "41 — Não tributada" },
  { value: "50", label: "50 — Suspensão" },
  { value: "51", label: "51 — Diferimento" },
  { value: "60", label: "60 — ICMS cobrado anteriormente por ST" },
  { value: "70", label: "70 — Redução de BC e cobrança por ST" },
  { value: "90", label: "90 — Outros" },
];

const CSOSN_OPCOES = [
  { value: "101", label: "101 — Tributada pelo Simples com crédito" },
  { value: "102", label: "102 — Tributada pelo Simples sem crédito" },
  { value: "103", label: "103 — Isenção para faixa de receita" },
  { value: "300", label: "300 — Imune" },
  { value: "400", label: "400 — Não tributada pelo Simples" },
  { value: "500", label: "500 — ICMS cobrado anteriormente por ST" },
  { value: "900", label: "900 — Outros (Simples Nacional)" },
];

const CONFIG_VAZIA: Omit<ConfigFiscalInput, "produto_id"> = {
  ncm: "70031200",
  cfop_dentro: "5102",
  cfop_fora: "6102",
  cst_icms: "00",
  aliq_icms: 18,
  aliq_pis: 1.65,
  aliq_cofins: 7.6,
  aliq_ipi: 0,
};

// ─── Modal de edição ──────────────────────────────────────
interface ModalProps {
  produto: Produto;
  configInicial: ConfigFiscalProduto | null;
  onSalvar: (config: ConfigFiscalInput) => Promise<void>;
  onFechar: () => void;
  salvando: boolean;
}

function ModalConfig({ produto, configInicial, onSalvar, onFechar, salvando }: ModalProps) {
  const [form, setForm] = useState<Omit<ConfigFiscalInput, "produto_id">>(
    configInicial
      ? {
          ncm: configInicial.ncm,
          cfop_dentro: configInicial.cfop_dentro,
          cfop_fora: configInicial.cfop_fora,
          cst_icms: configInicial.cst_icms,
          aliq_icms: configInicial.aliq_icms,
          aliq_pis: configInicial.aliq_pis,
          aliq_cofins: configInicial.aliq_cofins,
          aliq_ipi: configInicial.aliq_ipi,
        }
      : { ...CONFIG_VAZIA }
  );
  const [regime, setRegime] = useState<"normal" | "simples">(
    configInicial?.cst_icms && configInicial.cst_icms.length === 3 ? "simples" : "normal"
  );

  function setF<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const cstOpcoes = regime === "simples" ? CSOSN_OPCOES : CST_ICMS_OPCOES;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSalvar({ produto_id: produto.id, ...form });
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.65)",
        zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <div
        style={{
          background: "var(--surf1)", border: "1px solid var(--b1)",
          borderRadius: "14px", width: "100%", maxWidth: "640px",
          maxHeight: "90vh", overflow: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "20px 24px", borderBottom: "1px solid var(--b1)",
          }}
        >
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--t1)" }}>
              Configuração Fiscal
            </div>
            <div
              style={{
                fontSize: "12px", color: "var(--t3)",
                fontFamily: "'DM Mono', monospace", marginTop: "2px",
              }}
            >
              {produto.cod} · {produto.nome}
            </div>
          </div>
          <button
            onClick={onFechar}
            style={{
              background: "transparent", border: "1px solid var(--b2)", borderRadius: "6px",
              color: "var(--t3)", width: "30px", height: "30px", cursor: "pointer",
              fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Regime tributário (toggle) */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "10px" }}>
              REGIME TRIBUTÁRIO DO PRODUTO
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {(["normal", "simples"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRegime(r);
                    setF("cst_icms", r === "simples" ? "102" : "00");
                    if (r === "simples") { setF("aliq_icms", 0); setF("aliq_pis", 0); setF("aliq_cofins", 0); }
                    else { setF("aliq_icms", 18); setF("aliq_pis", 1.65); setF("aliq_cofins", 7.6); }
                  }}
                  style={{
                    padding: "7px 16px", borderRadius: "7px", fontSize: "12px",
                    fontWeight: 600, cursor: "pointer", transition: "all .15s",
                    background: regime === r ? "var(--acc)" : "transparent",
                    border: `1px solid ${regime === r ? "var(--acc)" : "var(--b2)"}`,
                    color: regime === r ? "#000" : "var(--t3)",
                  }}
                >
                  {r === "normal" ? "Lucro Real / Presumido" : "Simples Nacional"}
                </button>
              ))}
            </div>
          </div>

          {/* NCM e CST */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "12px" }}>
              CLASSIFICAÇÃO FISCAL
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
              <div className="fg">
                <label className="fl">NCM *</label>
                <input
                  className="fc"
                  value={form.ncm}
                  onChange={(e) => setF("ncm", e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="00000000"
                  maxLength={8}
                  pattern="\d{8}"
                  required
                  style={{ fontFamily: "'DM Mono', monospace", letterSpacing: "1px" }}
                />
                <span style={{ fontSize: "10px", color: "var(--t3)", marginTop: "3px", display: "block" }}>
                  8 dígitos — vidro laminado: 70031200
                </span>
              </div>
              <div className="fg">
                <label className="fl">{regime === "simples" ? "CSOSN" : "CST ICMS"} *</label>
                <select
                  className="fc"
                  value={form.cst_icms}
                  onChange={(e) => setF("cst_icms", e.target.value)}
                  required
                >
                  {cstOpcoes.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* CFOP */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "12px" }}>
              CFOP — CÓDIGO FISCAL DE OPERAÇÕES
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="fg">
                <label className="fl">CFOP Dentro do Estado (MG) *</label>
                <select
                  className="fc"
                  value={form.cfop_dentro}
                  onChange={(e) => setF("cfop_dentro", e.target.value)}
                  required
                >
                  {CFOP_OPCOES.filter((o) => o.value.startsWith("5")).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="fg">
                <label className="fl">CFOP Fora do Estado *</label>
                <select
                  className="fc"
                  value={form.cfop_fora}
                  onChange={(e) => setF("cfop_fora", e.target.value)}
                  required
                >
                  {CFOP_OPCOES.filter((o) => o.value.startsWith("6")).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Alíquotas */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "12px" }}>
              ALÍQUOTAS (%)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
              {([
                { key: "aliq_icms",   label: "ICMS",   hint: "ex: 18" },
                { key: "aliq_pis",    label: "PIS",    hint: "ex: 1.65" },
                { key: "aliq_cofins", label: "COFINS", hint: "ex: 7.60" },
                { key: "aliq_ipi",    label: "IPI",    hint: "ex: 0" },
              ] as const).map(({ key, label, hint }) => (
                <div key={key} className="fg">
                  <label className="fl">{label} %</label>
                  <input
                    className="fc"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form[key]}
                    onChange={(e) => setF(key, Number(e.target.value))}
                    placeholder={hint}
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  />
                </div>
              ))}
            </div>

            {/* Preview dos cálculos para R$ 1.000 */}
            <div
              style={{
                marginTop: "12px", background: "var(--surf2)", borderRadius: "8px",
                padding: "12px 14px",
              }}
            >
              <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "8px" }}>
                SIMULAÇÃO PARA R$ 1.000,00 EM PRODUTOS
              </div>
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                {[
                  { label: "ICMS",   val: 1000 * form.aliq_icms / 100 },
                  { label: "PIS",    val: 1000 * form.aliq_pis / 100 },
                  { label: "COFINS", val: 1000 * form.aliq_cofins / 100 },
                  { label: "IPI",    val: 1000 * form.aliq_ipi / 100 },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <span style={{ fontSize: "10px", color: "var(--t3)" }}>{label}:  </span>
                    <span
                      style={{
                        fontSize: "12px", fontWeight: 700,
                        fontFamily: "'DM Mono', monospace",
                        color: val > 0 ? "var(--warn)" : "var(--t3)",
                      }}
                    >
                      R$ {val.toFixed(2)}
                    </span>
                  </div>
                ))}
                <div>
                  <span style={{ fontSize: "10px", color: "var(--t3)" }}>Total impostos:  </span>
                  <span
                    style={{
                      fontSize: "12px", fontWeight: 700,
                      fontFamily: "'DM Mono', monospace", color: "var(--err)",
                    }}
                  >
                    R$ {(1000 * (form.aliq_icms + form.aliq_pis + form.aliq_cofins + form.aliq_ipi) / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Ações */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "4px" }}>
            <button type="button" className="btn bg sm" onClick={onFechar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn bp sm" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar Configuração"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────
interface Emitente {
  nome: string; fantasia: string; cnpj: string; ie: string;
  logradouro: string; numero: string; bairro: string;
  municipio: string; uf: string; cep: string;
}

export default function ContabilidadePage() {
  const { toast } = useToast();
  const [aba, setAba] = useState<"fiscal" | "emitente">("fiscal");
  const [dados, setDados] = useState<ProdutoComConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "configurado" | "pendente">("todos");
  const [editando, setEditando] = useState<ProdutoComConfig | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [emitente, setEmitente] = useState<Emitente | null>(null);
  const [loadingEmitente, setLoadingEmitente] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setDados(await getProdutosComConfigFiscal());
    setLoading(false);
  }

  async function loadEmitente() {
    if (emitente) return;
    setLoadingEmitente(true);
    try {
      const res = await fetch("/api/notas/emitente");
      if (res.ok) setEmitente(await res.json());
    } catch { /* silencioso */ }
    setLoadingEmitente(false);
  }

  useEffect(() => {
    if (aba === "emitente") loadEmitente();
  }, [aba]);

  async function handleSalvar(config: ConfigFiscalInput) {
    setSalvando(true);
    const ok = await salvarConfigFiscal(config);
    setSalvando(false);
    if (!ok) { toast("Erro ao salvar configuração", "err"); return; }
    toast("Configuração fiscal salva com sucesso");
    setEditando(null);
    await load();
  }

  const filtrados = useMemo(() => {
    let lista = dados;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(
        (d) =>
          d.produto.cod.toLowerCase().includes(q) ||
          d.produto.nome.toLowerCase().includes(q) ||
          d.config?.ncm?.includes(q)
      );
    }
    if (filtro === "configurado") lista = lista.filter((d) => d.config !== null);
    if (filtro === "pendente")    lista = lista.filter((d) => d.config === null);
    return lista;
  }, [dados, busca, filtro]);

  const totalConfigurados = dados.filter((d) => d.config !== null).length;
  const totalPendentes    = dados.filter((d) => d.config === null).length;

  const ABAS = [
    { id: "fiscal",   label: "Configuração Fiscal" },
    { id: "emitente", label: "Dados do Emitente" },
  ] as const;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Contabilidade</div>
        <div
          style={{
            fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace",
            background: "var(--surf2)", border: "1px solid var(--b1)",
            borderRadius: "6px", padding: "4px 10px",
          }}
        >
          Configurações Fiscais e Tributárias
        </div>
      </div>

      {editando && (
        <ModalConfig
          produto={editando.produto}
          configInicial={editando.config}
          onSalvar={handleSalvar}
          onFechar={() => setEditando(null)}
          salvando={salvando}
        />
      )}

      <div className="con">

        {/* Sumário */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total de Produtos",      value: dados.length,        color: "var(--acc)",  sub: "cadastrados no sistema" },
            { label: "Configurados",           value: totalConfigurados,   color: "var(--ok)",   sub: "com parâmetros fiscais" },
            { label: "Pendentes de Configuração", value: totalPendentes,   color: totalPendentes > 0 ? "var(--warn)" : "var(--t3)", sub: "sem parâmetros fiscais" },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "var(--surf1)", border: "1px solid var(--b1)",
                borderRadius: "10px", padding: "16px 20px",
              }}
            >
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "4px" }}>
                {card.label}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>
                {card.value}
              </div>
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Aviso se há pendentes */}
        {totalPendentes > 0 && (
          <div
            style={{
              background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)",
              borderRadius: "10px", padding: "14px 18px", marginBottom: "20px",
              display: "flex", gap: "12px", alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: "18px" }}>⚠️</div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--warn)", marginBottom: "3px" }}>
                {totalPendentes} produto{totalPendentes !== 1 ? "s" : ""} sem configuração fiscal
              </div>
              <div style={{ fontSize: "12px", color: "var(--t3)", lineHeight: 1.5 }}>
                Produtos sem configuração fiscal usarão as alíquotas padrão do sistema (ICMS 18%/12%, PIS 1.65%, COFINS 7.6%).
                Configure cada produto para garantir conformidade tributária na emissão das NF-e.
              </div>
            </div>
          </div>
        )}

        {/* Abas */}
        <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--b1)", marginBottom: "20px" }}>
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              style={{
                padding: "10px 18px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: `2px solid ${aba === a.id ? "var(--acc)" : "transparent"}`,
                color: aba === a.id ? "var(--acc)" : "var(--t3)", transition: "all .15s",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* ─── Aba: Configuração Fiscal ─────────────────── */}
        {aba === "fiscal" && (
          <>
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
              <input
                className="fc"
                style={{ flex: 1, minWidth: "200px", maxWidth: "340px" }}
                placeholder="Buscar por código, nome ou NCM..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <div style={{ display: "flex", gap: "6px" }}>
                {(["todos", "configurado", "pendente"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFiltro(f)}
                    style={{
                      padding: "5px 12px", borderRadius: "6px", fontSize: "12px",
                      fontWeight: 600, cursor: "pointer",
                      background: filtro === f ? "var(--acc)" : "transparent",
                      border: `1px solid ${filtro === f ? "var(--acc)" : "var(--b2)"}`,
                      color: filtro === f ? "#000" : "var(--t3)", transition: "all .15s",
                    }}
                  >
                    {{ todos: "Todos", configurado: "Configurados", pendente: "Pendentes" }[f]}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="loading">Carregando produtos...</div>
            ) : filtrados.length === 0 ? (
              <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>
                Nenhum produto encontrado.
              </div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>NCM</th>
                      <th>CFOP Dentro / Fora</th>
                      <th>CST / CSOSN</th>
                      <th style={{ textAlign: "right" }}>ICMS %</th>
                      <th style={{ textAlign: "right" }}>PIS %</th>
                      <th style={{ textAlign: "right" }}>COFINS %</th>
                      <th style={{ textAlign: "right" }}>IPI %</th>
                      <th>Status</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(({ produto, config }) => (
                      <tr key={produto.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--t1)", fontSize: "13px" }}>
                            {produto.nome}
                          </div>
                          <div
                            style={{
                              fontSize: "11px", color: "var(--t3)",
                              fontFamily: "'DM Mono', monospace", marginTop: "1px",
                            }}
                          >
                            {produto.cod}
                            {produto.espessura && (
                              <span style={{ marginLeft: "6px", color: "var(--acc)" }}>
                                {produto.espessura}mm
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="mono" style={{ fontSize: "13px" }}>
                          {config ? (
                            <span style={{ letterSpacing: "1px", color: "var(--t1)" }}>
                              {config.ncm.replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3")}
                            </span>
                          ) : (
                            <span style={{ color: "var(--t3)" }}>—</span>
                          )}
                        </td>

                        <td className="mono" style={{ fontSize: "12px" }}>
                          {config ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ color: "var(--t2)" }}>
                                {config.cfop_dentro.replace(/(\d)(\d{3})/, "$1.$2")}
                              </span>
                              <span style={{ color: "var(--t3)", fontSize: "11px" }}>
                                {config.cfop_fora.replace(/(\d)(\d{3})/, "$1.$2")}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: "var(--t3)" }}>—</span>
                          )}
                        </td>

                        <td className="mono" style={{ fontSize: "12px" }}>
                          {config ? (
                            <span
                              style={{
                                background: "var(--surf2)", border: "1px solid var(--b1)",
                                borderRadius: "4px", padding: "2px 7px", fontSize: "11px",
                                color: "var(--t2)", fontWeight: 600,
                              }}
                            >
                              {config.cst_icms}
                            </span>
                          ) : (
                            <span style={{ color: "var(--t3)" }}>—</span>
                          )}
                        </td>

                        {(["aliq_icms", "aliq_pis", "aliq_cofins", "aliq_ipi"] as const).map((k) => (
                          <td key={k} style={{ textAlign: "right" }}>
                            {config ? (
                              <span
                                style={{
                                  fontFamily: "'DM Mono', monospace", fontSize: "12px",
                                  color: config[k] > 0 ? "var(--warn)" : "var(--t3)",
                                  fontWeight: config[k] > 0 ? 600 : 400,
                                }}
                              >
                                {config[k].toFixed(2)}%
                              </span>
                            ) : (
                              <span style={{ color: "var(--t3)", fontSize: "12px" }}>—</span>
                            )}
                          </td>
                        ))}

                        <td>
                          {config ? (
                            <span className="chip cg" style={{ fontSize: "11px" }}>Configurado</span>
                          ) : (
                            <span className="chip cy" style={{ fontSize: "11px" }}>Pendente</span>
                          )}
                        </td>

                        <td>
                          <button
                            className="btn bp xs"
                            onClick={() => setEditando({ produto, config })}
                          >
                            {config ? "Editar" : "Configurar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ─── Aba: Dados do Emitente ───────────────────── */}
        {aba === "emitente" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {loadingEmitente ? (
              <div className="loading">Carregando dados do emitente...</div>
            ) : emitente ? (
              <>
                <div
                  className="card"
                  style={{ padding: "24px" }}
                >
                  <div
                    style={{
                      fontSize: "11px", color: "var(--t3)", fontWeight: 700,
                      letterSpacing: "0.06em", marginBottom: "18px",
                    }}
                  >
                    DADOS DA EMPRESA EMITENTE
                  </div>

                  <div
                    style={{
                      display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px",
                    }}
                  >
                    {[
                      { label: "Razão Social",   value: emitente.nome      || "—" },
                      { label: "Nome Fantasia",  value: emitente.fantasia  || "—" },
                      { label: "CNPJ",           value: emitente.cnpj      || "—", mono: true },
                      { label: "Inscrição Estadual", value: emitente.ie    || "—", mono: true },
                      { label: "Município / UF", value: emitente.municipio && emitente.uf ? `${emitente.municipio} / ${emitente.uf}` : "—" },
                      { label: "CEP",            value: emitente.cep       || "—", mono: true },
                    ].map(({ label, value, mono }) => (
                      <div key={label}>
                        <div
                          style={{
                            fontSize: "10px", color: "var(--t3)", marginBottom: "3px",
                            textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600,
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: "14px", color: "var(--t1)", fontWeight: 600,
                            fontFamily: mono ? "'DM Mono', monospace" : undefined,
                            letterSpacing: mono ? "0.5px" : undefined,
                          }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: "20px", padding: "12px 16px",
                      background: "var(--surf2)", borderRadius: "8px",
                      border: "1px solid var(--b1)",
                    }}
                  >
                    <div style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "2px" }}>
                      ENDEREÇO COMPLETO
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--t2)" }}>
                      {[emitente.logradouro, emitente.numero, emitente.bairro]
                        .filter(Boolean)
                        .join(", ")}
                      {emitente.municipio && ` — ${emitente.municipio}/${emitente.uf}`}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(45,95,166,.08)", border: "1px solid rgba(45,95,166,.25)",
                    borderRadius: "10px", padding: "14px 18px",
                    display: "flex", gap: "12px", alignItems: "flex-start",
                  }}
                >
                  <div style={{ fontSize: "18px" }}>ℹ️</div>
                  <div>
                    <div
                      style={{
                        fontSize: "13px", fontWeight: 700, color: "var(--acc)", marginBottom: "4px",
                      }}
                    >
                      Como alterar os dados do emitente
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--t3)", lineHeight: 1.6 }}>
                      Os dados do emitente são configurados como variáveis de ambiente no servidor
                      (<code style={{ fontFamily: "'DM Mono', monospace", background: "var(--surf2)", padding: "1px 5px", borderRadius: "3px" }}>EMITENTE_*</code>).
                      Para alterar, acesse as configurações do servidor ou plataforma de hospedagem
                      e atualize as variáveis correspondentes. Após atualizar, reinicie a aplicação.
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div
                className="card"
                style={{ padding: "32px", textAlign: "center", color: "var(--t3)" }}
              >
                Não foi possível carregar os dados do emitente.
                Verifique as variáveis de ambiente <code style={{ fontFamily: "'DM Mono', monospace" }}>EMITENTE_*</code>.
              </div>
            )}

            {/* Informações sobre as alíquotas padrão do sistema */}
            <div className="card" style={{ padding: "24px" }}>
              <div
                style={{
                  fontSize: "11px", color: "var(--t3)", fontWeight: 700,
                  letterSpacing: "0.06em", marginBottom: "16px",
                }}
              >
                ALÍQUOTAS PADRÃO DO SISTEMA (fallback)
              </div>
              <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "14px", lineHeight: 1.6 }}>
                Quando um produto não possui configuração fiscal própria, o sistema utiliza estas alíquotas padrão na geração das NF-e.
                Para alterar, configure as alíquotas individualmente por produto na aba "Configuração Fiscal".
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                {[
                  { label: "ICMS (dentro do estado)", value: "18,00%", sub: "CFOP 5.xxx" },
                  { label: "ICMS (fora do estado)",   value: "12,00%", sub: "CFOP 6.xxx" },
                  { label: "PIS",                     value: "1,65%",  sub: "CST 01" },
                  { label: "COFINS",                  value: "7,60%",  sub: "CST 01" },
                ].map(({ label, value, sub }) => (
                  <div
                    key={label}
                    style={{
                      background: "var(--surf2)", border: "1px solid var(--b1)",
                      borderRadius: "8px", padding: "12px 14px",
                    }}
                  >
                    <div style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "4px", lineHeight: 1.3 }}>
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: "18px", fontWeight: 700, color: "var(--warn)",
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {value}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "3px" }}>
                      {sub}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
