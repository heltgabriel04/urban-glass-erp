"use client";

import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/toast";
import {
  getConfigPadrao,
  salvarConfigPadrao,
  getProdutosComConfigFiscal,
  salvarConfigFiscalProduto,
  removerConfigFiscalProduto,
  aplicarPadraoATodos,
  PADRAO_FALLBACK,
  type ProdutoComConfig,
  type ConfigFiscalProdutoInput,
} from "@/services/contabilidade.service";
import type { ConfigFiscalPadrao } from "@/types";

// ─── Constantes ───────────────────────────────────────────
const CFOP_DENTRO = [
  { value: "5101", label: "5.101 — Venda produção própria" },
  { value: "5102", label: "5.102 — Venda de mercadoria de terceiros" },
  { value: "5405", label: "5.405 — Venda com substituição tributária" },
];
const CFOP_FORA = [
  { value: "6101", label: "6.101 — Venda produção própria" },
  { value: "6102", label: "6.102 — Venda de mercadoria de terceiros" },
  { value: "6405", label: "6.405 — Venda com substituição tributária" },
];
const CST_NORMAL = [
  { value: "00", label: "00 — Tributada integralmente" },
  { value: "10", label: "10 — Tributada com cobrança por ST" },
  { value: "20", label: "20 — Com redução de BC" },
  { value: "40", label: "40 — Isenta" },
  { value: "41", label: "41 — Não tributada" },
  { value: "50", label: "50 — Suspensão" },
  { value: "51", label: "51 — Diferimento" },
  { value: "60", label: "60 — ICMS cobrado anteriormente por ST" },
  { value: "90", label: "90 — Outros" },
];
const CSOSN = [
  { value: "101", label: "101 — Tributada pelo Simples com crédito" },
  { value: "102", label: "102 — Tributada pelo Simples sem crédito" },
  { value: "103", label: "103 — Isenção para faixa de receita" },
  { value: "300", label: "300 — Imune" },
  { value: "400", label: "400 — Não tributada pelo Simples" },
  { value: "500", label: "500 — ICMS cobrado anteriormente por ST" },
  { value: "900", label: "900 — Outros" },
];

// ─── Modal de config por produto ─────────────────────────
interface ModalProps {
  item: ProdutoComConfig;
  padrao: ConfigFiscalPadrao;
  onSalvar: (input: ConfigFiscalProdutoInput) => Promise<void>;
  onRemover: () => Promise<void>;
  onFechar: () => void;
  salvando: boolean;
}

function ModalProduto({ item, padrao, onSalvar, onRemover, onFechar, salvando }: ModalProps) {
  const { produto, config } = item;
  const cstOpcoes = padrao.regime === "simples" ? CSOSN : CST_NORMAL;

  const [ncm, setNcm]           = useState(config?.ncm         ?? padrao.ncm_padrao);
  const [cfopD, setCfopD]       = useState(config?.cfop_dentro ?? padrao.cfop_dentro_padrao);
  const [cfopF, setCfopF]       = useState(config?.cfop_fora   ?? padrao.cfop_fora_padrao);
  const [cst, setCst]           = useState(config?.cst_icms    ?? padrao.cst_icms_padrao);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Alíquotas sempre herdadas do padrão global
    await onSalvar({
      produto_id: produto.id,
      ncm,
      cfop_dentro: cfopD,
      cfop_fora:   cfopF,
      cst_icms:    cst,
      aliq_icms:   padrao.aliq_icms_dentro,
      aliq_pis:    padrao.aliq_pis,
      aliq_cofins: padrao.aliq_cofins,
      aliq_ipi:    padrao.aliq_ipi,
    });
  }

  return (
    <div className="mov open" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="mod" style={{ width: "560px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        <div className="mhd">
          <div>
            <div className="mtit">Classificação Fiscal</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginTop: "2px" }}>
              {produto.cod} · {produto.nome}
            </div>
          </div>
          <button className="mcl" onClick={onFechar}>✕</button>
        </div>

        <form
          id="form-fiscal-produto"
          onSubmit={handleSubmit}
          style={{ overflowY: "auto", padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}
        >

          {/* NCM */}
          <div className="fg">
            <label className="fl">NCM *</label>
            <input
              className="fc"
              value={ncm}
              onChange={(e) => setNcm(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="00000000"
              maxLength={8}
              required
              style={{ fontFamily: "'DM Mono', monospace", letterSpacing: "2px" }}
            />
            <span style={{ fontSize: "10px", color: "var(--t3)", marginTop: "3px", display: "block" }}>
              8 dígitos — vidro laminado: 7003.12.00
            </span>
          </div>

          {/* CFOP */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">CFOP Dentro do Estado (MG)</label>
              <select className="fc" value={cfopD} onChange={(e) => setCfopD(e.target.value)} required>
                {CFOP_DENTRO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">CFOP Fora do Estado</label>
              <select className="fc" value={cfopF} onChange={(e) => setCfopF(e.target.value)} required>
                {CFOP_FORA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* CST */}
          <div className="fg">
            <label className="fl">{padrao.regime === "simples" ? "CSOSN" : "CST ICMS"}</label>
            <select className="fc" value={cst} onChange={(e) => setCst(e.target.value)} required>
              {cstOpcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Info alíquotas */}
          <div style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "8px" }}>
              ALÍQUOTAS (herdadas dos Parâmetros Padrão)
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {[
                { label: "ICMS (MG)",   val: padrao.aliq_icms_dentro },
                { label: "ICMS (fora)", val: padrao.aliq_icms_fora },
                { label: "PIS",         val: padrao.aliq_pis },
                { label: "COFINS",      val: padrao.aliq_cofins },
                { label: "IPI",         val: padrao.aliq_ipi },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, fontFamily: "'DM Mono', monospace", color: val > 0 ? "var(--warn)" : "var(--t3)" }}>
                    {val.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: "1px solid var(--b1)", flexShrink: 0 }}>
          <div>
            {config && (
              <button
                type="button"
                className="btn bg sm"
                style={{ color: "var(--err)", borderColor: "var(--err)" }}
                onClick={onRemover}
                disabled={salvando}
              >
                Remover exceção
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn bg" onClick={onFechar} disabled={salvando}>Cancelar</button>
            <button type="submit" form="form-fiscal-produto" className="btn bp" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Seção: Parâmetros Padrão ─────────────────────────────
interface SecaoPadraoProps {
  padrao: ConfigFiscalPadrao;
  onChange: (p: ConfigFiscalPadrao) => void;
  onSalvar: () => Promise<void>;
  salvando: boolean;
}

function SecaoPadrao({ padrao, onChange, onSalvar, salvando }: SecaoPadraoProps) {
  const cstOpcoes = padrao.regime === "simples" ? CSOSN : CST_NORMAL;

  function set<K extends keyof ConfigFiscalPadrao>(k: K, v: ConfigFiscalPadrao[K]) {
    onChange({ ...padrao, [k]: v });
  }

  const totalImposto = padrao.aliq_icms_dentro + padrao.aliq_pis + padrao.aliq_cofins + padrao.aliq_ipi;

  return (
    <div
      style={{
        background: "var(--surf1)", border: "1px solid var(--b1)",
        borderRadius: "12px", overflow: "hidden", marginBottom: "20px",
      }}
    >
      <div
        style={{
          padding: "16px 20px", borderBottom: "1px solid var(--b1)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "var(--surf2)",
        }}
      >
        <div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>
            Parâmetros Fiscais Padrão
          </div>
          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>
            Alíquotas e códigos aplicados a todos os produtos — configure uma vez aqui
          </div>
        </div>
        <button
          className="btn bp sm"
          onClick={onSalvar}
          disabled={salvando}
        >
          {salvando ? "Salvando..." : "Salvar Parâmetros"}
        </button>
      </div>

      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>

        {/* Regime */}
        <div>
          <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "10px" }}>
            REGIME TRIBUTÁRIO
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["normal", "simples"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  set("regime", r);
                  if (r === "simples") {
                    set("cst_icms_padrao", "102");
                    onChange({ ...padrao, regime: r, cst_icms_padrao: "102", aliq_icms_dentro: 0, aliq_icms_fora: 0, aliq_pis: 0, aliq_cofins: 0 });
                  } else {
                    onChange({ ...padrao, regime: r, cst_icms_padrao: "00", aliq_icms_dentro: 18, aliq_icms_fora: 12, aliq_pis: 1.65, aliq_cofins: 7.6 });
                  }
                }}
                style={{
                  padding: "7px 18px", borderRadius: "8px", fontSize: "12px",
                  fontWeight: 600, cursor: "pointer", transition: "all .15s",
                  background: padrao.regime === r ? "var(--acc)" : "transparent",
                  border: `1px solid ${padrao.regime === r ? "var(--acc)" : "var(--b2)"}`,
                  color: padrao.regime === r ? "#000" : "var(--t3)",
                }}
              >
                {r === "normal" ? "Lucro Real / Presumido" : "Simples Nacional"}
              </button>
            ))}
          </div>
        </div>

        {/* Alíquotas */}
        <div>
          <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "12px" }}>
            ALÍQUOTAS (%)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
            {([
              { key: "aliq_icms_dentro", label: "ICMS Dentro do estado (MG)", hint: "ex: 18" },
              { key: "aliq_icms_fora",   label: "ICMS Fora do estado",        hint: "ex: 12" },
              { key: "aliq_pis",         label: "PIS",                        hint: "ex: 1.65" },
              { key: "aliq_cofins",      label: "COFINS",                     hint: "ex: 7.60" },
              { key: "aliq_ipi",         label: "IPI",                        hint: "ex: 0" },
            ] as const).map(({ key, label, hint }) => (
              <div key={key} className="fg">
                <label className="fl" style={{ fontSize: "10px" }}>{label}</label>
                <input
                  className="fc"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={padrao[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                  placeholder={hint}
                  style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Classificação padrão */}
        <div>
          <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "12px" }}>
            CLASSIFICAÇÃO PADRÃO (pré-preenchida ao configurar produtos)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
            <div className="fg">
              <label className="fl">NCM Padrão</label>
              <input
                className="fc"
                value={padrao.ncm_padrao}
                onChange={(e) => set("ncm_padrao", e.target.value.replace(/\D/g, "").slice(0, 8))}
                maxLength={8}
                style={{ fontFamily: "'DM Mono', monospace" }}
              />
            </div>
            <div className="fg">
              <label className="fl">{padrao.regime === "simples" ? "CSOSN" : "CST ICMS"} Padrão</label>
              <select className="fc" value={padrao.cst_icms_padrao} onChange={(e) => set("cst_icms_padrao", e.target.value)}>
                {cstOpcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">CFOP Dentro (MG)</label>
              <select className="fc" value={padrao.cfop_dentro_padrao} onChange={(e) => set("cfop_dentro_padrao", e.target.value)}>
                {CFOP_DENTRO.map((o) => <option key={o.value} value={o.value}>{o.value.replace(/(\d)(\d{3})/, "$1.$2")}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">CFOP Fora</label>
              <select className="fc" value={padrao.cfop_fora_padrao} onChange={(e) => set("cfop_fora_padrao", e.target.value)}>
                {CFOP_FORA.map((o) => <option key={o.value} value={o.value}>{o.value.replace(/(\d)(\d{3})/, "$1.$2")}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Simulação */}
        <div
          style={{
            background: "var(--surf2)", border: "1px solid var(--b1)",
            borderRadius: "8px", padding: "12px 16px",
            display: "flex", gap: "28px", alignItems: "center", flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em" }}>
            SIMULAÇÃO — R$ 1.000,00
          </div>
          {[
            { label: "ICMS",        val: 1000 * padrao.aliq_icms_dentro / 100 },
            { label: "PIS",         val: 1000 * padrao.aliq_pis / 100 },
            { label: "COFINS",      val: 1000 * padrao.aliq_cofins / 100 },
            { label: "IPI",         val: 1000 * padrao.aliq_ipi / 100 },
            { label: "Total impostos", val: 1000 * totalImposto / 100, destaque: true },
          ].map(({ label, val, destaque }) => (
            <div key={label}>
              <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase" }}>{label}</div>
              <div
                style={{
                  fontSize: destaque ? "15px" : "13px",
                  fontWeight: 700,
                  fontFamily: "'DM Mono', monospace",
                  color: destaque ? "var(--err)" : val > 0 ? "var(--warn)" : "var(--t3)",
                }}
              >
                R$ {val.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Seção: Investimentos & Posição Financeira ───────────

const BANCOS_LISTA = [
  { nome: "Nubank",           cor: "#820ad1", ini: "N"  },
  { nome: "Itaú",             cor: "#ec7000", ini: "I"  },
  { nome: "Bradesco",         cor: "#cc0000", ini: "B"  },
  { nome: "Banco do Brasil",  cor: "#f6c400", ini: "BB" },
  { nome: "Caixa",            cor: "#005ca9", ini: "C"  },
  { nome: "Santander",        cor: "#ec0000", ini: "S"  },
  { nome: "Inter",            cor: "#ff7a00", ini: "In" },
  { nome: "Sicoob",           cor: "#006b3f", ini: "Si" },
  { nome: "Sicredi",          cor: "#007040", ini: "Sc" },
  { nome: "C6 Bank",          cor: "#232323", ini: "C6" },
  { nome: "Outro",            cor: "#6b7280", ini: "?"  },
];

interface SaldoBanco  { id: string; banco: string; agencia: string; conta: string; saldo: number; }
interface DadosAporte { valor: number; moeda: "BRL" | "USD" | "EUR"; cotacao: number; dataAporte: string; descricao: string; observacoes: string; }
interface DadosPermuta { valorTotal: number; valorRecebido: number; dataInicio: string; descricao: string; status: "ativo" | "parcial" | "liquidado"; observacoes: string; }

const LS_BANCOS_KEY  = "ug_bancos_v1";
const LS_APORTE_KEY  = "ug_aporte_v1";
const LS_PERMUTA_KEY = "ug_permuta_v1";

function lsLoad<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function lsSave(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* */ }
}

const toBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const APORTE_DEFAULT: DadosAporte = { valor: 0, moeda: "BRL", cotacao: 1, dataAporte: "", descricao: "Aporte realizado por Gabriel", observacoes: "" };
const PERMUTA_DEFAULT: DadosPermuta = { valorTotal: 0, valorRecebido: 0, dataInicio: "", descricao: "Permuta com Mendes & Mendes", status: "ativo", observacoes: "" };

const STATUS_PERMUTA = {
  ativo:     { label: "Ativo",     cor: "#3dffa0", bg: "rgba(61,255,160,.12)" },
  parcial:   { label: "Parcial",   cor: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  liquidado: { label: "Liquidado", cor: "#6b7280", bg: "rgba(107,114,128,.12)" },
};

function SecaoInvestimentos() {
  const [bancos,          setBancos]          = useState<SaldoBanco[]>([]);
  const [adicionando,     setAdicionando]     = useState(false);
  const [editandoBanco,   setEditandoBanco]   = useState<string | null>(null);
  const [novoBanco,       setNovoBanco]       = useState<Omit<SaldoBanco, "id">>({ banco: "", agencia: "", conta: "", saldo: 0 });
  const [aporte,          setAporte]          = useState<DadosAporte>(APORTE_DEFAULT);
  const [aporteEdit,      setAporteEdit]      = useState<DadosAporte>(APORTE_DEFAULT);
  const [editandoAporte,  setEditandoAporte]  = useState(false);
  const [permuta,         setPermuta]         = useState<DadosPermuta>(PERMUTA_DEFAULT);
  const [permutaEdit,     setPermutaEdit]     = useState<DadosPermuta>(PERMUTA_DEFAULT);
  const [editandoPermuta, setEditandoPermuta] = useState(false);

  useEffect(() => {
    setBancos(lsLoad<SaldoBanco[]>(LS_BANCOS_KEY, []));
    const a = lsLoad<DadosAporte>(LS_APORTE_KEY, APORTE_DEFAULT);
    setAporte(a); setAporteEdit(a);
    const p = lsLoad<DadosPermuta>(LS_PERMUTA_KEY, PERMUTA_DEFAULT);
    setPermuta(p); setPermutaEdit(p);
  }, []);

  useEffect(() => { lsSave(LS_BANCOS_KEY, bancos); }, [bancos]);

  const totalBancos = bancos.reduce((s, b) => s + b.saldo, 0);
  const bancoCor = (nome: string) => BANCOS_LISTA.find(b => b.nome === nome)?.cor ?? "#6b7280";
  const bancoIni = (nome: string) => BANCOS_LISTA.find(b => b.nome === nome)?.ini ?? nome.slice(0, 2).toUpperCase();

  function adicionarBanco() {
    if (!novoBanco.banco) return;
    setBancos(p => [...p, { ...novoBanco, id: Date.now().toString() }]);
    setNovoBanco({ banco: "", agencia: "", conta: "", saldo: 0 });
    setAdicionando(false);
  }
  function removerBanco(id: string) {
    if (!confirm("Remover este banco?")) return;
    setBancos(p => p.filter(b => b.id !== id));
    if (editandoBanco === id) setEditandoBanco(null);
  }
  function salvarAporte() { setAporte(aporteEdit); lsSave(LS_APORTE_KEY, aporteEdit); setEditandoAporte(false); }
  function salvarPermuta() { setPermuta(permutaEdit); lsSave(LS_PERMUTA_KEY, permutaEdit); setEditandoPermuta(false); }

  const aporteEmBRL = aporte.moeda === "BRL" ? aporte.valor : aporte.valor * aporte.cotacao;
  const saldoPermuta = permuta.valorTotal - permuta.valorRecebido;
  const pctPermuta = permuta.valorTotal > 0 ? Math.min(100, (permuta.valorRecebido / permuta.valorTotal) * 100) : 0;

  const secaoHeader = (acento: string, icone: string, tag: string, titulo: string, sub: string, direita: React.ReactNode) => (
    <div style={{ padding: "16px 20px", background: "var(--surf2)", borderBottom: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: `${acento}20`, border: `1px solid ${acento}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>
          {icone}
        </div>
        <div>
          <div style={{ fontSize: "10px", color: acento, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase" }}>{tag}</div>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--t1)", marginTop: "1px" }}>{titulo}</div>
          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "1px" }}>{sub}</div>
        </div>
      </div>
      {direita}
    </div>
  );

  const metricaCard = (label: string, value: string, cor: string, destaque = false) => (
    <div key={label} style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "14px 16px" }}>
      <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: destaque ? "20px" : "16px", fontWeight: destaque ? 800 : 700, color: cor, fontFamily: "'DM Mono', monospace" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── 1. SALDOS BANCÁRIOS ── */}
      <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid var(--acc2)", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", background: "var(--surf2)", borderBottom: "1px solid var(--b1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", display: "flex", alignItems: "center", gap: "8px" }}>
              🏦 Saldos Bancários
            </div>
            <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>Posição atual das contas — atualização manual</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>Saldo Consolidado</div>
              <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "'DM Mono', monospace", color: totalBancos >= 0 ? "var(--ok)" : "var(--err)" }}>
                {toBRL(totalBancos)}
              </div>
            </div>
            <button className="btn bp sm" onClick={() => { setAdicionando(true); setEditandoBanco(null); }}>＋ Banco</button>
          </div>
        </div>

        <div style={{ padding: "20px" }}>
          {bancos.length === 0 && !adicionando ? (
            <div style={{ textAlign: "center", padding: "28px 0", color: "var(--t3)", fontSize: "13px" }}>
              Nenhuma conta cadastrada — clique em <strong style={{ color: "var(--acc)" }}>+ Banco</strong> para adicionar
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
              {bancos.map(banco => {
                const cor  = bancoCor(banco.banco);
                const ini  = bancoIni(banco.banco);
                const emEd = editandoBanco === banco.id;
                return (
                  <div key={banco.id} style={{ background: "var(--surf2)", border: `1px solid ${emEd ? cor : "var(--b1)"}`, borderLeft: `4px solid ${cor}`, borderRadius: "10px", padding: "16px", transition: "border-color .15s" }}>
                    {!emEd ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                          <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, color: "white", flexShrink: 0, letterSpacing: "0.5px" }}>
                            {ini}
                          </div>
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>{banco.banco}</div>
                            {(banco.agencia || banco.conta) && (
                              <div style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginTop: "1px" }}>
                                {banco.agencia && `Ag ${banco.agencia}`}{banco.agencia && banco.conta && " · "}{banco.conta && `Cc ${banco.conta}`}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: 800, color: banco.saldo >= 0 ? "var(--t1)" : "var(--err)", fontFamily: "'DM Mono', monospace", marginBottom: "12px", lineHeight: 1 }}>
                          {toBRL(banco.saldo)}
                        </div>
                        <button className="btn bg xs" style={{ width: "100%", color: "var(--t3)", fontSize: "11px" }} onClick={() => setEditandoBanco(banco.id)}>
                          ✎ Editar
                        </button>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: cor, textTransform: "uppercase", letterSpacing: "0.06em" }}>Editando</div>
                        <select className="fc" style={{ fontSize: "12px" }} value={banco.banco}
                          onChange={e => setBancos(p => p.map(b => b.id === banco.id ? { ...b, banco: e.target.value } : b))}>
                          {BANCOS_LISTA.map(bl => <option key={bl.nome} value={bl.nome}>{bl.nome}</option>)}
                        </select>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          <input className="fc" style={{ fontSize: "11px" }} placeholder="Agência" value={banco.agencia}
                            onChange={e => setBancos(p => p.map(b => b.id === banco.id ? { ...b, agencia: e.target.value } : b))} />
                          <input className="fc" style={{ fontSize: "11px" }} placeholder="Conta" value={banco.conta}
                            onChange={e => setBancos(p => p.map(b => b.id === banco.id ? { ...b, conta: e.target.value } : b))} />
                        </div>
                        <input className="fc" type="number" step="0.01" placeholder="Saldo (R$)" value={banco.saldo || ""}
                          onChange={e => setBancos(p => p.map(b => b.id === banco.id ? { ...b, saldo: Number(e.target.value) } : b))} />
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button className="btn bp sm" style={{ flex: 1, fontSize: "11px" }} onClick={() => setEditandoBanco(null)}>✓ Salvar</button>
                          <button className="btn bg xs" style={{ color: "var(--err)", borderColor: "var(--err)" }} onClick={() => removerBanco(banco.id)}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {adicionando && (
                <div style={{ background: "var(--surf2)", border: "1px dashed var(--acc)", borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--acc)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Novo Banco</div>
                  <select className="fc" style={{ fontSize: "12px" }} value={novoBanco.banco}
                    onChange={e => setNovoBanco(p => ({ ...p, banco: e.target.value }))}>
                    <option value="">Selecionar banco...</option>
                    {BANCOS_LISTA.map(bl => <option key={bl.nome} value={bl.nome}>{bl.nome}</option>)}
                  </select>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <input className="fc" style={{ fontSize: "11px" }} placeholder="Agência" value={novoBanco.agencia}
                      onChange={e => setNovoBanco(p => ({ ...p, agencia: e.target.value }))} />
                    <input className="fc" style={{ fontSize: "11px" }} placeholder="Conta" value={novoBanco.conta}
                      onChange={e => setNovoBanco(p => ({ ...p, conta: e.target.value }))} />
                  </div>
                  <input className="fc" type="number" step="0.01" placeholder="Saldo inicial (R$)" value={novoBanco.saldo || ""}
                    onChange={e => setNovoBanco(p => ({ ...p, saldo: Number(e.target.value) }))} />
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button className="btn bp sm" style={{ flex: 1, fontSize: "11px" }} onClick={adicionarBanco} disabled={!novoBanco.banco}>Adicionar</button>
                    <button className="btn bg sm" style={{ fontSize: "11px" }} onClick={() => { setAdicionando(false); setNovoBanco({ banco: "", agencia: "", conta: "", saldo: 0 }); }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 2. APORTE GABRIEL — EXTERIOR ── */}
      <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid #3b82f6", borderRadius: "12px", overflow: "hidden" }}>
        {secaoHeader(
          "#3b82f6", "✈", "Aporte Exterior", "Aporte de Gabriel",
          "Investimento externo realizado pelo sócio",
          <button className="btn bg sm" style={{ color: "#3b82f6", borderColor: "rgba(59,130,246,.4)" }}
            onClick={() => { setAporteEdit({ ...aporte }); setEditandoAporte(true); }}>
            ✎ Editar
          </button>
        )}

        {!editandoAporte ? (
          <div style={{ padding: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: aporte.observacoes ? "16px" : 0 }}>
              {metricaCard(
                `Valor (${aporte.moeda})`,
                aporte.moeda === "BRL"
                  ? toBRL(aporte.valor)
                  : aporte.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + (aporte.moeda === "USD" ? " US$" : " €"),
                "#3b82f6", true
              )}
              {metricaCard(
                aporte.moeda !== "BRL" ? `Cotação (1 ${aporte.moeda})` : "Moeda",
                aporte.moeda === "BRL" ? "Real (BRL)" : toBRL(aporte.cotacao),
                "var(--t2)"
              )}
              {metricaCard("Equivalente em BRL", toBRL(aporteEmBRL), "var(--ok)", true)}
              {metricaCard(
                "Data do Aporte",
                aporte.dataAporte ? new Date(aporte.dataAporte + "T00:00:00").toLocaleDateString("pt-BR") : "—",
                "var(--t2)"
              )}
            </div>
            {aporte.observacoes && (
              <div style={{ background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.2)", borderRadius: "8px", padding: "12px 16px" }}>
                <div style={{ fontSize: "9px", color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "4px" }}>Observações</div>
                <div style={{ fontSize: "13px", color: "var(--t2)", lineHeight: 1.5 }}>{aporte.observacoes}</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: aporteEdit.moeda !== "BRL" ? "2fr 1fr 1fr 1fr" : "2fr 1fr 1fr", gap: "12px" }}>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Valor</label>
                <input className="fc" type="number" step="0.01" value={aporteEdit.valor || ""}
                  onChange={e => setAporteEdit(p => ({ ...p, valor: Number(e.target.value) }))} />
              </div>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Moeda</label>
                <select className="fc" value={aporteEdit.moeda}
                  onChange={e => setAporteEdit(p => ({ ...p, moeda: e.target.value as DadosAporte["moeda"] }))}>
                  <option value="BRL">BRL — Real</option>
                  <option value="USD">USD — Dólar</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
              {aporteEdit.moeda !== "BRL" && (
                <div className="fg" style={{ margin: 0 }}>
                  <label className="fl">Cotação (R$)</label>
                  <input className="fc" type="number" step="0.0001" value={aporteEdit.cotacao || ""}
                    onChange={e => setAporteEdit(p => ({ ...p, cotacao: Number(e.target.value) }))} />
                </div>
              )}
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Data do Aporte</label>
                <input className="fc" type="date" value={aporteEdit.dataAporte}
                  onChange={e => setAporteEdit(p => ({ ...p, dataAporte: e.target.value }))} />
              </div>
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Observações</label>
              <textarea className="fc" rows={2} value={aporteEdit.observacoes}
                onChange={e => setAporteEdit(p => ({ ...p, observacoes: e.target.value }))}
                style={{ resize: "vertical" as const, fontFamily: "inherit", minHeight: "60px" }} />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setEditandoAporte(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarAporte}>✓ Salvar</button>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. PERMUTA MENDES & MENDES ── */}
      <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid #8b5cf6", borderRadius: "12px", overflow: "hidden" }}>
        {secaoHeader(
          "#8b5cf6", "⇄", "Permuta Comercial", "Mendes & Mendes",
          "Acordo de permuta com parceiro comercial",
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {!editandoPermuta && (
              <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px", background: STATUS_PERMUTA[permuta.status].bg, color: STATUS_PERMUTA[permuta.status].cor, border: `1px solid ${STATUS_PERMUTA[permuta.status].cor}50` }}>
                ● {STATUS_PERMUTA[permuta.status].label}
              </span>
            )}
            <button className="btn bg sm" style={{ color: "#8b5cf6", borderColor: "rgba(139,92,246,.4)" }}
              onClick={() => { setPermutaEdit({ ...permuta }); setEditandoPermuta(true); }}>
              ✎ Editar
            </button>
          </div>
        )}

        {!editandoPermuta ? (
          <div style={{ padding: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "16px" }}>
              {metricaCard("Valor Total",     toBRL(permuta.valorTotal),    "#8b5cf6", true)}
              {metricaCard("Valor Recebido",  toBRL(permuta.valorRecebido), "var(--ok)")}
              {metricaCard("Saldo a Receber", toBRL(saldoPermuta),          saldoPermuta > 0 ? "var(--warn)" : "var(--t3)")}
              {metricaCard("Data de Início",  permuta.dataInicio ? new Date(permuta.dataInicio + "T00:00:00").toLocaleDateString("pt-BR") : "—", "var(--t2)")}
            </div>

            {permuta.valorTotal > 0 && (
              <div style={{ marginBottom: permuta.observacoes ? "16px" : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
                  <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Progresso da Permuta</div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#8b5cf6", fontFamily: "'DM Mono', monospace" }}>{pctPermuta.toFixed(1)}% concluído</div>
                </div>
                <div style={{ height: "8px", background: "var(--surf2)", borderRadius: "99px", border: "1px solid var(--b1)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pctPermuta}%`, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)", borderRadius: "99px", transition: "width .4s ease" }} />
                </div>
              </div>
            )}

            {permuta.observacoes && (
              <div style={{ background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.2)", borderRadius: "8px", padding: "12px 16px" }}>
                <div style={{ fontSize: "9px", color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "4px" }}>Observações</div>
                <div style={{ fontSize: "13px", color: "var(--t2)", lineHeight: 1.5 }}>{permuta.observacoes}</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Valor Total (R$)</label>
                <input className="fc" type="number" step="0.01" value={permutaEdit.valorTotal || ""}
                  onChange={e => setPermutaEdit(p => ({ ...p, valorTotal: Number(e.target.value) }))} />
              </div>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Já Recebido (R$)</label>
                <input className="fc" type="number" step="0.01" value={permutaEdit.valorRecebido || ""}
                  onChange={e => setPermutaEdit(p => ({ ...p, valorRecebido: Number(e.target.value) }))} />
              </div>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Data de Início</label>
                <input className="fc" type="date" value={permutaEdit.dataInicio}
                  onChange={e => setPermutaEdit(p => ({ ...p, dataInicio: e.target.value }))} />
              </div>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Status</label>
                <select className="fc" value={permutaEdit.status}
                  onChange={e => setPermutaEdit(p => ({ ...p, status: e.target.value as DadosPermuta["status"] }))}>
                  <option value="ativo">Ativo</option>
                  <option value="parcial">Parcial</option>
                  <option value="liquidado">Liquidado</option>
                </select>
              </div>
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Observações</label>
              <textarea className="fc" rows={2} value={permutaEdit.observacoes}
                onChange={e => setPermutaEdit(p => ({ ...p, observacoes: e.target.value }))}
                style={{ resize: "vertical" as const, fontFamily: "inherit", minHeight: "60px" }} />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setEditandoPermuta(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarPermuta}>✓ Salvar</button>
            </div>
          </div>
        )}
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
  const [aba, setAba] = useState<"fiscal" | "investimentos" | "emitente">("fiscal");
  const [dados, setDados] = useState<ProdutoComConfig[]>([]);
  const [padrao, setPadrao] = useState<ConfigFiscalPadrao>({ ...PADRAO_FALLBACK });
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "configurado" | "pendente">("todos");
  const [editando, setEditando] = useState<ProdutoComConfig | null>(null);
  const [salvandoProduto, setSalvandoProduto] = useState(false);
  const [salvandoPadrao, setSalvandoPadrao] = useState(false);
  const [emitente, setEmitente] = useState<Emitente | null>(null);
  const [loadingEmitente, setLoadingEmitente] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [prods, pad] = await Promise.all([getProdutosComConfigFiscal(), getConfigPadrao()]);
    setDados(prods);
    setPadrao(pad);
    setLoading(false);
  }

  async function handleSalvarPadrao() {
    setSalvandoPadrao(true);
    const { id, updated_at, ...input } = padrao;
    const ok = await salvarConfigPadrao(input);
    setSalvandoPadrao(false);
    toast(ok ? "Parâmetros padrão salvos" : "Erro ao salvar parâmetros", ok ? "ok" : "err");
  }

  async function handleSalvarProduto(input: ConfigFiscalProdutoInput) {
    setSalvandoProduto(true);
    const ok = await salvarConfigFiscalProduto(input);
    setSalvandoProduto(false);
    if (!ok) { toast("Erro ao salvar", "err"); return; }
    toast("Configuração salva");
    setEditando(null);
    await load();
  }

  async function handleRemoverProduto() {
    if (!editando) return;
    if (!confirm(`Remover configuração específica de "${editando.produto.nome}"?\nO produto passará a usar os parâmetros padrão.`)) return;
    setSalvandoProduto(true);
    await removerConfigFiscalProduto(editando.produto.id);
    setSalvandoProduto(false);
    toast("Configuração específica removida — produto usa parâmetros padrão");
    setEditando(null);
    await load();
  }

  async function handleAplicarTodos() {
    const semConfig = dados.filter((d) => d.config === null);
    if (semConfig.length === 0) { toast("Todos os produtos já estão configurados"); return; }
    if (!confirm(`Aplicar parâmetros padrão nos ${semConfig.length} produto(s) sem configuração?`)) return;
    setSalvandoPadrao(true);
    const { ok, erro } = await aplicarPadraoATodos(semConfig.map((d) => d.produto), padrao);
    setSalvandoPadrao(false);
    toast(`${ok} produto(s) configurado(s)${erro > 0 ? `, ${erro} erro(s)` : ""}`, erro > 0 ? "warn" : "ok");
    await load();
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

  useEffect(() => { if (aba === "emitente") loadEmitente(); }, [aba]);

  const filtrados = useMemo(() => {
    let lista = dados;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter((d) =>
        d.produto.cod.toLowerCase().includes(q) ||
        d.produto.nome.toLowerCase().includes(q) ||
        (d.config?.ncm ?? "").includes(q)
      );
    }
    if (filtro === "configurado") lista = lista.filter((d) => d.config !== null);
    if (filtro === "pendente")    lista = lista.filter((d) => d.config === null);
    return lista;
  }, [dados, busca, filtro]);

  const totalConfigurados = dados.filter((d) => d.config !== null).length;
  const totalPendentes    = dados.filter((d) => d.config === null).length;

  const ABAS = [
    { id: "fiscal",        label: "Configuração Fiscal" },
    { id: "investimentos", label: "Investimentos" },
    { id: "emitente",      label: "Dados do Emitente" },
  ] as const;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Contabilidade</div>
        <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "6px", padding: "4px 10px" }}>
          Configurações Fiscais e Tributárias
        </div>
      </div>

      {editando && (
        <ModalProduto
          item={editando}
          padrao={padrao}
          onSalvar={handleSalvarProduto}
          onRemover={handleRemoverProduto}
          onFechar={() => setEditando(null)}
          salvando={salvandoProduto}
        />
      )}

      <div className="con">

        {/* Cards de resumo */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total de Produtos",          value: dados.length,        color: "var(--acc)",  sub: "cadastrados no sistema" },
            { label: "Classificados",              value: totalConfigurados,   color: "var(--ok)",   sub: "com NCM/CFOP/CST definidos" },
            { label: "Usando Parâmetros Padrão",   value: totalPendentes,      color: "var(--t3)",   sub: "sem classificação específica" },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px" }}>
              <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "4px" }}>{card.label}</div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: card.color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{card.value}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>{card.sub}</div>
            </div>
          ))}
        </div>

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
            >{a.label}</button>
          ))}
        </div>

        {/* ─── Aba Fiscal ───────────────────────────────── */}
        {aba === "fiscal" && (
          <>
            {/* Parâmetros padrão */}
            {loading ? (
              <div className="loading" style={{ marginBottom: "20px" }}>Carregando...</div>
            ) : (
              <SecaoPadrao
                padrao={padrao}
                onChange={setPadrao}
                onSalvar={handleSalvarPadrao}
                salvando={salvandoPadrao}
              />
            )}

            {/* Classificação por produto */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>
                  Classificação por Produto
                </div>
                <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>
                  Apenas NCM, CFOP e CST — configure somente produtos com classificação diferente do padrão
                </div>
              </div>
              {totalPendentes > 0 && (
                <button
                  className="btn bg sm"
                  onClick={handleAplicarTodos}
                  disabled={salvandoPadrao}
                  style={{ color: "var(--acc)", borderColor: "var(--acc)" }}
                >
                  Aplicar padrão nos {totalPendentes} pendentes
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
              <input
                className="fc"
                style={{ flex: 1, minWidth: "200px", maxWidth: "320px" }}
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
                  >{{ todos: "Todos", configurado: "Específicos", pendente: "Usando Padrão" }[f]}</button>
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
                      <th>Classificação</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(({ produto, config }) => (
                      <tr key={produto.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--t1)", fontSize: "13px" }}>{produto.nome}</div>
                          <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginTop: "1px" }}>
                            {produto.cod}
                            {produto.espessura && <span style={{ marginLeft: "6px", color: "var(--acc)" }}>{produto.espessura}mm</span>}
                          </div>
                        </td>

                        <td className="mono" style={{ fontSize: "13px" }}>
                          {config
                            ? <span style={{ letterSpacing: "1px" }}>{config.ncm.replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3")}</span>
                            : <span style={{ color: "var(--t3)", fontSize: "11px" }}>{padrao.ncm_padrao.replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3")} <span style={{ fontSize: "9px", opacity: 0.6 }}>(padrão)</span></span>
                          }
                        </td>

                        <td className="mono" style={{ fontSize: "12px" }}>
                          {config ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ color: "var(--t2)" }}>{config.cfop_dentro.replace(/(\d)(\d{3})/, "$1.$2")}</span>
                              <span style={{ color: "var(--t3)", fontSize: "11px" }}>{config.cfop_fora.replace(/(\d)(\d{3})/, "$1.$2")}</span>
                            </div>
                          ) : (
                            <span style={{ color: "var(--t3)", fontSize: "11px" }}>
                              {padrao.cfop_dentro_padrao.replace(/(\d)(\d{3})/, "$1.$2")} / {padrao.cfop_fora_padrao.replace(/(\d)(\d{3})/, "$1.$2")}
                              <span style={{ fontSize: "9px", opacity: 0.6 }}> (padrão)</span>
                            </span>
                          )}
                        </td>

                        <td className="mono">
                          <span style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "4px", padding: "2px 7px", fontSize: "11px", color: "var(--t2)", fontWeight: 600 }}>
                            {config?.cst_icms ?? padrao.cst_icms_padrao}
                            {!config && <span style={{ fontSize: "9px", opacity: 0.6 }}> (padrão)</span>}
                          </span>
                        </td>

                        <td>
                          {config
                            ? <span className="chip cg" style={{ fontSize: "11px" }}>Específico</span>
                            : <span className="chip cgr" style={{ fontSize: "11px" }}>Padrão</span>
                          }
                        </td>

                        <td>
                          <button className="btn bp xs" onClick={() => setEditando({ produto, config })}>
                            {config ? "Editar" : "Personalizar"}
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

        {/* ─── Aba Investimentos ────────────────────────── */}
        {aba === "investimentos" && <SecaoInvestimentos />}

        {/* ─── Aba Emitente ─────────────────────────────── */}
        {aba === "emitente" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {loadingEmitente ? (
              <div className="loading">Carregando...</div>
            ) : emitente ? (
              <div className="card" style={{ padding: "24px" }}>
                <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "18px" }}>
                  DADOS DA EMPRESA EMITENTE
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                  {[
                    { label: "Razão Social",      value: emitente.nome                                              },
                    { label: "Nome Fantasia",     value: emitente.fantasia                                          },
                    { label: "CNPJ",              value: emitente.cnpj,     mono: true                             },
                    { label: "Inscrição Estadual", value: emitente.ie,      mono: true                             },
                    { label: "Município / UF",    value: `${emitente.municipio} / ${emitente.uf}`                  },
                    { label: "CEP",               value: emitente.cep,      mono: true                             },
                  ].map(({ label, value, mono }) => (
                    <div key={label}>
                      <div style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: "14px", color: "var(--t1)", fontWeight: 600, fontFamily: mono ? "'DM Mono', monospace" : undefined }}>{value || "—"}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "16px", padding: "12px 16px", background: "var(--surf2)", borderRadius: "8px", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "2px" }}>ENDEREÇO COMPLETO</div>
                  <div style={{ fontSize: "13px", color: "var(--t2)" }}>
                    {[emitente.logradouro, emitente.numero, emitente.bairro].filter(Boolean).join(", ")}
                    {emitente.municipio && ` — ${emitente.municipio}/${emitente.uf}`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: "32px", textAlign: "center", color: "var(--t3)" }}>
                Não foi possível carregar os dados. Verifique as variáveis <code style={{ fontFamily: "'DM Mono', monospace" }}>EMITENTE_*</code>.
              </div>
            )}

            <div style={{ background: "rgba(45,95,166,.08)", border: "1px solid rgba(45,95,166,.25)", borderRadius: "10px", padding: "14px 18px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ fontSize: "18px" }}>ℹ️</div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--acc)", marginBottom: "4px" }}>Como alterar os dados do emitente</div>
                <div style={{ fontSize: "12px", color: "var(--t3)", lineHeight: 1.6 }}>
                  Os dados são configurados como variáveis de ambiente no servidor
                  (<code style={{ fontFamily: "'DM Mono', monospace", background: "var(--surf2)", padding: "1px 5px", borderRadius: "3px" }}>EMITENTE_*</code>).
                  Acesse as configurações de hospedagem e atualize as variáveis. Reinicie a aplicação após alterar.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
