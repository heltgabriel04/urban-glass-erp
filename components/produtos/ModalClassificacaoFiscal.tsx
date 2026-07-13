"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { ConfigFiscalPadrao } from "@/types";
import type { ProdutoComConfig, ConfigFiscalProdutoInput } from "@/services/contabilidade.service";

export const CFOP_DENTRO = [
  { value: "5101", label: "5.101 — Venda produção própria" },
  { value: "5102", label: "5.102 — Venda de mercadoria de terceiros" },
  { value: "5405", label: "5.405 — Venda com substituição tributária" },
];
export const CFOP_FORA = [
  { value: "6101", label: "6.101 — Venda produção própria" },
  { value: "6102", label: "6.102 — Venda de mercadoria de terceiros" },
  { value: "6405", label: "6.405 — Venda com substituição tributária" },
];
export const CST_NORMAL = [
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
export const CSOSN = [
  { value: "101", label: "101 — Tributada pelo Simples com crédito" },
  { value: "102", label: "102 — Tributada pelo Simples sem crédito" },
  { value: "103", label: "103 — Isenção para faixa de receita" },
  { value: "300", label: "300 — Imune" },
  { value: "400", label: "400 — Não tributada pelo Simples" },
  { value: "500", label: "500 — ICMS cobrado anteriormente por ST" },
  { value: "900", label: "900 — Outros" },
];

interface ModalClassificacaoFiscalProps {
  item: ProdutoComConfig;
  padrao: ConfigFiscalPadrao;
  onSalvar: (input: ConfigFiscalProdutoInput) => Promise<void>;
  onRemover?: () => Promise<void>;
  onFechar: () => void;
  obrigatorio?: boolean;
  onCancelarObrigatorio?: () => Promise<void>;
  salvando: boolean;
}

export default function ModalClassificacaoFiscal({
  item, padrao, onSalvar, onRemover, onFechar, obrigatorio, onCancelarObrigatorio, salvando,
}: ModalClassificacaoFiscalProps) {
  const { produto, config } = item;
  const cstOpcoes = padrao.regime === "simples" ? CSOSN : CST_NORMAL;

  const [ncm, setNcm]     = useState(config?.ncm         ?? padrao.ncm_padrao);
  const [cfopD, setCfopD] = useState(config?.cfop_dentro ?? padrao.cfop_dentro_padrao);
  const [cfopF, setCfopF] = useState(config?.cfop_fora   ?? padrao.cfop_fora_padrao);
  const [cst, setCst]     = useState(config?.cst_icms    ?? padrao.cst_icms_padrao);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    <Modal
      open onClose={onFechar} width="560px" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      dismissible={!obrigatorio}
      title={<>
        Classificação Fiscal
        <div style={{ fontSize: "12px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", marginTop: "2px", fontWeight: 400 }}>
          {produto.cod} · {produto.nome}
        </div>
      </>}
    >
        {obrigatorio && (
          <div style={{ margin: "16px 20px 0", padding: "10px 14px", background: "rgba(245,158,11,.1)", border: "1px solid var(--warn)", borderRadius: "8px", fontSize: "12px", color: "var(--warn)" }}>
            ⚠ Produto criado — a classificação fiscal é obrigatória pra continuar. Cancelar aqui exclui o produto.
          </div>
        )}
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
            {!obrigatorio && config && onRemover && (
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
            <button
              type="button"
              className="btn bg"
              onClick={obrigatorio ? onCancelarObrigatorio : onFechar}
              disabled={salvando}
              style={obrigatorio ? { color: "var(--err)", borderColor: "var(--err)" } : undefined}
            >
              {obrigatorio ? "Cancelar e excluir produto" : "Cancelar"}
            </button>
            <button type="submit" form="form-fiscal-produto" className="btn bp" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

    </Modal>
  );
}
