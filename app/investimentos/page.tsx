"use client";

import { useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { registrarLog } from "@/services/log.service";
import * as XLSX from "xlsx";

// ─── Posição Financeira (saldos, aporte, permuta) ────────

const BANCOS_POSICAO = [
  { nome: "Maxi Inter",       cor: "#ff7a00", ini: "MI" },
  { nome: "Urban Inter",      cor: "#e8650a", ini: "UI" },
  { nome: "ZRS Inter",        cor: "#f59e0b", ini: "ZI" },
  { nome: "Elobank Caixa",    cor: "#005ca9", ini: "EL" },
  { nome: "Cofre (dinheiro)", cor: "#10b981", ini: "CF" },
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

const BANCOS_POS_DEFAULT: SaldoBanco[] = [
  { id: "pre-1", banco: "Maxi Inter",       agencia: "", conta: "", saldo: 0 },
  { id: "pre-2", banco: "Urban Inter",      agencia: "", conta: "", saldo: 0 },
  { id: "pre-3", banco: "Cofre (dinheiro)", agencia: "", conta: "", saldo: 0 },
  { id: "pre-4", banco: "ZRS Inter",        agencia: "", conta: "", saldo: 0 },
  { id: "pre-5", banco: "Elobank Caixa",    agencia: "", conta: "", saldo: 0 },
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

const APORTE_DEFAULT: DadosAporte   = { valor: 0, moeda: "BRL", cotacao: 1, dataAporte: "", descricao: "Aporte realizado por Gabriel", observacoes: "" };
const PERMUTA_DEFAULT: DadosPermuta = { valorTotal: 0, valorRecebido: 0, dataInicio: "", descricao: "Permuta com Mendes & Mendes", status: "ativo", observacoes: "" };

const STATUS_PERMUTA = {
  ativo:     { label: "Ativo",     cor: "#3dffa0", bg: "rgba(61,255,160,.12)" },
  parcial:   { label: "Parcial",   cor: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  liquidado: { label: "Liquidado", cor: "#6b7280", bg: "rgba(107,114,128,.12)" },
};

interface PosFinProps {
  bancos: SaldoBanco[];
  setBancos: Dispatch<SetStateAction<SaldoBanco[]>>;
  aporte: DadosAporte;
  setAporte: Dispatch<SetStateAction<DadosAporte>>;
  permuta: DadosPermuta;
  setPermuta: Dispatch<SetStateAction<DadosPermuta>>;
}

function SecaoPosicaoFinanceira({ bancos, setBancos, aporte, setAporte, permuta, setPermuta }: PosFinProps) {
  const [adicionando,     setAdicionando]     = useState(false);
  const [novoBanco,       setNovoBanco]       = useState<Omit<SaldoBanco, "id">>({ banco: "", agencia: "", conta: "", saldo: 0 });
  const [aporteEdit,      setAporteEdit]      = useState<DadosAporte>(APORTE_DEFAULT);
  const [editandoAporte,  setEditandoAporte]  = useState(false);
  const [permutaEdit,     setPermutaEdit]     = useState<DadosPermuta>(PERMUTA_DEFAULT);
  const [editandoPermuta, setEditandoPermuta] = useState(false);
  const [abertoBancos,    setAbertoBancos]    = useState(false);
  const [abertoAporte,    setAbertoAporte]    = useState(false);
  const [abertoPermuta,   setAbertoPermuta]   = useState(false);
  const [abertoLanc,      setAbertoLanc]      = useState(false);
  const [lancamentos,     setLancamentos]     = useState<{ id: string; data: string; descricao: string; valor: number }[]>([]);

  useEffect(() => {
    setLancamentos(lsLoad<{ id: string; data: string; descricao: string; valor: number }[]>("ug_lancamentos_v1", []));
  }, []);
  useEffect(() => { lsSave("ug_lancamentos_v1", lancamentos); }, [lancamentos]);

  const totalBancos  = bancos.reduce((s, b) => s + b.saldo, 0);
  const bancoCor     = (nome: string) => BANCOS_POSICAO.find(b => b.nome === nome)?.cor ?? "#6b7280";
  const bancoIni     = (nome: string) => BANCOS_POSICAO.find(b => b.nome === nome)?.ini ?? nome.slice(0, 2).toUpperCase();
  const aporteEmBRL  = aporte.moeda === "BRL" ? aporte.valor : aporte.valor * aporte.cotacao;
  const saldoPermuta = permuta.valorTotal - permuta.valorRecebido;
  const pctPermuta   = permuta.valorTotal > 0 ? Math.min(100, (permuta.valorRecebido / permuta.valorTotal) * 100) : 0;

  function adicionarBanco() {
    if (!novoBanco.banco) return;
    setBancos(p => [...p, { ...novoBanco, id: Date.now().toString() }]);
    setNovoBanco({ banco: "", agencia: "", conta: "", saldo: 0 });
    setAdicionando(false);
  }
  function removerBanco(id: string) {
    if (!confirm("Remover este banco?")) return;
    setBancos(p => p.filter(b => b.id !== id));
  }
  function salvarAporte()  { setAporte(aporteEdit);   setEditandoAporte(false); }
  function salvarPermuta() { setPermuta(permutaEdit); setEditandoPermuta(false); }

  const chevron = (aberto: boolean, onToggle: () => void) => (
    <button onClick={onToggle} style={{ width: "28px", height: "28px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 }}>
      <span style={{ display: "inline-block", transition: "transform .2s", transform: aberto ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
    </button>
  );

  const secaoHdr = (acento: string, icone: string, tag: string, titulo: string, sub: string, direita: ReactNode, aberto: boolean, onToggle: () => void) => (
    <div onClick={onToggle} style={{ padding: "12px 16px", background: "var(--surf2)", borderBottom: aberto ? "1px solid var(--b1)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: `${acento}20`, border: `1px solid ${acento}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0 }}>{icone}</div>
        <div>
          <div style={{ fontSize: "9px", color: acento, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase" }}>{tag}</div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", marginTop: "1px" }}>{titulo}</div>
          <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>{sub}</div>
        </div>
      </div>
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {direita}
        {chevron(aberto, onToggle)}
      </div>
    </div>
  );

  const metricaCard = (label: string, value: string, cor: string, destaque = false) => (
    <div key={label} style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "11px 14px" }}>
      <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: destaque ? "17px" : "14px", fontWeight: destaque ? 800 : 700, color: cor, fontFamily: "'DM Mono', monospace" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "22px" }}>

      {/* ── SALDOS BANCÁRIOS ── */}
      <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid var(--acc2)", borderRadius: "12px", overflow: "hidden" }}>
        <div onClick={() => setAbertoBancos(v => !v)} style={{ padding: "12px 16px", background: "var(--surf2)", borderBottom: abertoBancos ? "1px solid var(--b1)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--t1)", display: "flex", alignItems: "center", gap: "8px" }}>🏦 Saldos Bancários</div>
            <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>Posição atual das contas — atualização manual</div>
          </div>
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>Saldo Consolidado</div>
              <div style={{ fontSize: "18px", fontWeight: 800, fontFamily: "'DM Mono', monospace", color: totalBancos >= 0 ? "var(--ok)" : "var(--err)" }}>{toBRL(totalBancos)}</div>
            </div>
            {abertoBancos && <button className="btn bp sm" onClick={() => { setAdicionando(true); }}>＋ Banco</button>}
            {chevron(abertoBancos, () => setAbertoBancos(v => !v))}
          </div>
        </div>
        {(abertoBancos || adicionando) && <div style={{ padding: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
            {bancos.map(banco => {
              const cor = bancoCor(banco.banco);
              const ini = bancoIni(banco.banco);
              return (
                <div key={banco.id} style={{ background: "var(--surf2)", border: "1px solid var(--b1)", borderLeft: `4px solid ${cor}`, borderRadius: "10px", padding: "14px 14px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "12px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 800, color: "white", flexShrink: 0, letterSpacing: "0.02em" }}>{ini}</div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t1)", flex: 1, lineHeight: 1.2 }}>{banco.banco}</div>
                    <button title="Remover" onClick={() => removerBanco(banco.id)} style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: "12px", padding: "2px 4px", borderRadius: "4px", lineHeight: 1 }}>✕</button>
                  </div>
                  <input
                    type="number" step="0.01"
                    value={banco.saldo || ""}
                    onChange={e => setBancos(p => p.map(b => b.id === banco.id ? { ...b, saldo: Number(e.target.value) } : b))}
                    placeholder="0,00"
                    className="fc"
                    style={{ width: "100%", margin: 0, fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: "13px", textAlign: "right", color: banco.saldo < 0 ? "var(--err)" : "var(--t1)", boxSizing: "border-box" }}
                  />
                  {banco.saldo !== 0 && (
                    <div style={{ fontSize: "10px", color: "var(--t3)", textAlign: "right", marginTop: "4px", fontFamily: "'DM Mono', monospace" }}>
                      {toBRL(banco.saldo)}
                    </div>
                  )}
                </div>
              );
            })}
            {adicionando && (
              <div style={{ background: "var(--surf2)", border: "1px dashed var(--acc)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--acc)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Novo Banco</div>
                <select className="fc" style={{ fontSize: "12px", margin: 0 }} value={novoBanco.banco}
                  onChange={e => setNovoBanco(p => ({ ...p, banco: e.target.value }))}>
                  <option value="">Selecionar...</option>
                  {BANCOS_POSICAO.map(bl => <option key={bl.nome} value={bl.nome}>{bl.nome}</option>)}
                </select>
                <input className="fc" type="number" step="0.01" placeholder="Saldo inicial (R$)" value={novoBanco.saldo || ""}
                  style={{ margin: 0, textAlign: "right", fontFamily: "'DM Mono', monospace" }}
                  onChange={e => setNovoBanco(p => ({ ...p, saldo: Number(e.target.value) }))} />
                <div style={{ display: "flex", gap: "6px" }}>
                  <button className="btn bp sm" style={{ flex: 1, fontSize: "11px" }} onClick={adicionarBanco} disabled={!novoBanco.banco}>Adicionar</button>
                  <button className="btn bg sm" style={{ fontSize: "11px" }} onClick={() => { setAdicionando(false); setNovoBanco({ banco: "", agencia: "", conta: "", saldo: 0 }); }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>}
      </div>

      {/* ── APORTE GABRIEL — EXTERIOR ── */}
      <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid #3b82f6", borderRadius: "12px", overflow: "hidden" }}>
        {secaoHdr("#3b82f6", "✈", "Aporte Exterior", "Aporte de Gabriel", "Investimento externo realizado pelo sócio",
          abertoAporte && <button className="btn bg sm" style={{ color: "#3b82f6", borderColor: "rgba(59,130,246,.4)" }}
            onClick={() => { setAporteEdit({ ...aporte }); setEditandoAporte(true); setAbertoAporte(true); }}>✎ Editar</button>,
          abertoAporte, () => setAbertoAporte(v => !v)
        )}
        {(abertoAporte || editandoAporte) && (!editandoAporte ? (

          <div style={{ padding: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: aporte.observacoes ? "16px" : 0 }}>
              {metricaCard(`Valor (${aporte.moeda})`,
                aporte.moeda === "BRL" ? toBRL(aporte.valor) : aporte.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + (aporte.moeda === "USD" ? " US$" : " €"),
                "#3b82f6", true)}
              {metricaCard(aporte.moeda !== "BRL" ? `Cotação (1 ${aporte.moeda})` : "Moeda", aporte.moeda === "BRL" ? "Real (BRL)" : toBRL(aporte.cotacao), "var(--t2)")}
              {metricaCard("Equivalente em BRL", toBRL(aporteEmBRL), "var(--ok)", true)}
              {metricaCard("Data do Aporte", aporte.dataAporte ? new Date(aporte.dataAporte + "T00:00:00").toLocaleDateString("pt-BR") : "—", "var(--t2)")}
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
              <div className="fg" style={{ margin: 0 }}><label className="fl">Valor</label>
                <input className="fc" type="number" step="0.01" value={aporteEdit.valor || ""}
                  onChange={e => setAporteEdit(p => ({ ...p, valor: Number(e.target.value) }))} /></div>
              <div className="fg" style={{ margin: 0 }}><label className="fl">Moeda</label>
                <select className="fc" value={aporteEdit.moeda}
                  onChange={e => setAporteEdit(p => ({ ...p, moeda: e.target.value as DadosAporte["moeda"] }))}>
                  <option value="BRL">BRL — Real</option>
                  <option value="USD">USD — Dólar</option>
                  <option value="EUR">EUR — Euro</option>
                </select></div>
              {aporteEdit.moeda !== "BRL" && (
                <div className="fg" style={{ margin: 0 }}><label className="fl">Cotação (R$)</label>
                  <input className="fc" type="number" step="0.0001" value={aporteEdit.cotacao || ""}
                    onChange={e => setAporteEdit(p => ({ ...p, cotacao: Number(e.target.value) }))} /></div>
              )}
              <div className="fg" style={{ margin: 0 }}><label className="fl">Data do Aporte</label>
                <input className="fc" type="date" value={aporteEdit.dataAporte}
                  onChange={e => setAporteEdit(p => ({ ...p, dataAporte: e.target.value }))} /></div>
            </div>
            <div className="fg" style={{ margin: 0 }}><label className="fl">Observações</label>
              <textarea className="fc" rows={2} value={aporteEdit.observacoes}
                onChange={e => setAporteEdit(p => ({ ...p, observacoes: e.target.value }))}
                style={{ resize: "vertical" as const, fontFamily: "inherit", minHeight: "60px" }} /></div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setEditandoAporte(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarAporte}>✓ Salvar</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── PERMUTA MENDES & MENDES ── */}
      <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid #8b5cf6", borderRadius: "12px", overflow: "hidden" }}>
        {secaoHdr("#8b5cf6", "⇄", "Permuta Comercial", "Mendes & Mendes", "Acordo de permuta com parceiro comercial",
          abertoPermuta && <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {!editandoPermuta && (
              <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px", background: STATUS_PERMUTA[permuta.status].bg, color: STATUS_PERMUTA[permuta.status].cor, border: `1px solid ${STATUS_PERMUTA[permuta.status].cor}50` }}>
                ● {STATUS_PERMUTA[permuta.status].label}
              </span>
            )}
            <button className="btn bg sm" style={{ color: "#8b5cf6", borderColor: "rgba(139,92,246,.4)" }}
              onClick={() => { setPermutaEdit({ ...permuta }); setEditandoPermuta(true); setAbertoPermuta(true); }}>✎ Editar</button>
          </div>,
          abertoPermuta, () => setAbertoPermuta(v => !v)
        )}
        {(abertoPermuta || editandoPermuta) && (!editandoPermuta ? (
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
              <div className="fg" style={{ margin: 0 }}><label className="fl">Valor Total (R$)</label>
                <input className="fc" type="number" step="0.01" value={permutaEdit.valorTotal || ""}
                  onChange={e => setPermutaEdit(p => ({ ...p, valorTotal: Number(e.target.value) }))} /></div>
              <div className="fg" style={{ margin: 0 }}><label className="fl">Já Recebido (R$)</label>
                <input className="fc" type="number" step="0.01" value={permutaEdit.valorRecebido || ""}
                  onChange={e => setPermutaEdit(p => ({ ...p, valorRecebido: Number(e.target.value) }))} /></div>
              <div className="fg" style={{ margin: 0 }}><label className="fl">Data de Início</label>
                <input className="fc" type="date" value={permutaEdit.dataInicio}
                  onChange={e => setPermutaEdit(p => ({ ...p, dataInicio: e.target.value }))} /></div>
              <div className="fg" style={{ margin: 0 }}><label className="fl">Status</label>
                <select className="fc" value={permutaEdit.status}
                  onChange={e => setPermutaEdit(p => ({ ...p, status: e.target.value as DadosPermuta["status"] }))}>
                  <option value="ativo">Ativo</option>
                  <option value="parcial">Parcial</option>
                  <option value="liquidado">Liquidado</option>
                </select></div>
            </div>
            <div className="fg" style={{ margin: 0 }}><label className="fl">Observações</label>
              <textarea className="fc" rows={2} value={permutaEdit.observacoes}
                onChange={e => setPermutaEdit(p => ({ ...p, observacoes: e.target.value }))}
                style={{ resize: "vertical" as const, fontFamily: "inherit", minHeight: "60px" }} /></div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn bg" onClick={() => setEditandoPermuta(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvarPermuta}>✓ Salvar</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── LANÇAMENTOS DETALHADOS ── */}
      <div style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderTop: "3px solid #14b8a6", borderRadius: "12px", overflow: "hidden" }}>
        {secaoHdr("#14b8a6", "≡", "Detalhamento", "Lançamentos", "Aportes e movimentações detalhados",
          abertoLanc && (
            <button className="btn bp sm" style={{ background: "transparent", color: "#14b8a6", borderColor: "rgba(20,184,166,.4)", fontSize: "11px" }}
              onClick={() => setLancamentos(p => [...p, { id: Date.now().toString(), data: new Date().toISOString().split("T")[0], descricao: "", valor: 0 }])}>
              ＋ Linha
            </button>
          ),
          abertoLanc, () => setAbertoLanc(v => !v)
        )}
        {abertoLanc && (
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 130px 28px", gap: "6px", padding: "8px 4px 6px", borderBottom: "1px solid var(--b1)", marginBottom: "4px" }}>
              {["Data", "Descrição", "Valor (R$)", ""].map(h => (
                <div key={h} style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, textAlign: h === "Valor (R$)" ? "right" : "left" }}>{h}</div>
              ))}
            </div>
            {lancamentos.length === 0 ? (
              <div style={{ textAlign: "center", padding: "18px 0", color: "var(--t3)", fontSize: "12px" }}>
                Nenhum lançamento — clique em <strong style={{ color: "#14b8a6" }}>＋ Linha</strong> para adicionar
              </div>
            ) : (
              <>
                {lancamentos.map(lanc => (
                  <div key={lanc.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr 130px 28px", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
                    <input type="date" className="fc" value={lanc.data}
                      style={{ margin: 0, fontSize: "11px", padding: "5px 8px" }}
                      onChange={e => setLancamentos(p => p.map(l => l.id === lanc.id ? { ...l, data: e.target.value } : l))} />
                    <input className="fc" placeholder="Descrição" value={lanc.descricao}
                      style={{ margin: 0, fontSize: "12px", padding: "5px 8px" }}
                      onChange={e => setLancamentos(p => p.map(l => l.id === lanc.id ? { ...l, descricao: e.target.value } : l))} />
                    <input type="number" step="0.01" className="fc" placeholder="0,00" value={lanc.valor || ""}
                      style={{ margin: 0, fontSize: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", padding: "5px 8px" }}
                      onChange={e => setLancamentos(p => p.map(l => l.id === lanc.id ? { ...l, valor: Number(e.target.value) } : l))} />
                    <button onClick={() => setLancamentos(p => p.filter(l => l.id !== lanc.id))}
                      style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: "12px", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px 0", borderTop: "1px solid var(--b1)", marginTop: "6px" }}>
                  <span style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{lancamentos.length} lançamento(s)</span>
                  <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#14b8a6" }}>
                    {toBRL(lancamentos.reduce((s, l) => s + l.valor, 0))}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────

const BANCOS_DEFAULT = ["Itaú Maxibuild", "ZRS"];
const CATS_DEFAULT   = ["Manutenção", "Equipamentos e Material"];

interface OpcaoLista { id: number; tipo: string; valor: string; parent?: string | null; }

interface Investimento {
  id: string;
  data: string;
  empresa: string;
  categoria: string | null;
  subcategoria: string | null;
  descricao: string;
  valor: number;
  observacoes: string | null;
  comprovante_url: string | null;
  created_at: string;
}

interface RowState {
  data: string;
  empresa: string;
  categoria: string;
  subcategoria: string;
  descricao: string;
  valor: number;
  observacoes: string;
  comprovante_url: string;
}

function hoje() { return new Date().toISOString().split("T")[0]; }
function fmtData(iso: string) { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); }
function labelMes(yyyyMM: string) {
  const [y, m] = yyyyMM.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

const EMPTY: RowState = {
  data: hoje(), empresa: "", categoria: "", subcategoria: "", descricao: "", valor: 0, observacoes: "", comprovante_url: "",
};

const SQL_MIGRACAO_COLUNAS = `-- Adiciona suporte a subcategorias em tabelas existentes:\nALTER TABLE inv_opcoes ADD COLUMN IF NOT EXISTS parent text;\nALTER TABLE investimentos ADD COLUMN IF NOT EXISTS subcategoria text;`;

export default function InvestimentosPage() {
  const [investimentos, setInvestimentos] = useState<Investimento[]>([]);
  const [loading, setLoading]             = useState(true);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editForm, setEditForm]           = useState<RowState>({ ...EMPTY });
  const [addingNew, setAddingNew]         = useState(false);
  const [newForm, setNewForm]             = useState<RowState>({ ...EMPTY });
  const [salvando, setSalvando]           = useState(false);
  const [busca, setBusca]                 = useState("");
  const [filtroBanco, setFiltroBanco]       = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroInicio, setFiltroInicio]   = useState("");
  const [filtroFim, setFiltroFim]         = useState("");
  const [opcoesDB, setOpcoesDB]           = useState<OpcaoLista[]>([]);
  const [semTabela, setSemTabela]         = useState(false);
  const [semColSubcat, setSemColSubcat]   = useState(false);
  const [erroRLS, setErroRLS]             = useState(false);
  const [modalListas, setModalListas]     = useState(false);
  const [novoBanco, setNovoBanco]         = useState("");
  const [novaCat, setNovaCat]             = useState("");
  const [catExpandida, setCatExpandida]   = useState<string | null>(null);
  const [novaSubcat, setNovaSubcat]       = useState("");
  const [corrigindo, setCorrigindo]       = useState(false);
  const [corrigido, setCorrigido]         = useState(false);
  const [bancosPos,  setBancosPos]        = useState<SaldoBanco[]>([]);
  const [aportePos,  setAportePos]        = useState<DadosAporte>(APORTE_DEFAULT);
  const [permutaPos, setPermutaPos]       = useState<DadosPermuta>(PERMUTA_DEFAULT);

  useEffect(() => {
    setBancosPos(lsLoad<SaldoBanco[]>(LS_BANCOS_KEY, BANCOS_POS_DEFAULT));
    const a = lsLoad<DadosAporte>(LS_APORTE_KEY, APORTE_DEFAULT);
    setAportePos(a);
    const p = lsLoad<DadosPermuta>(LS_PERMUTA_KEY, PERMUTA_DEFAULT);
    setPermutaPos(p);
  }, []);
  useEffect(() => { lsSave(LS_BANCOS_KEY,  bancosPos);  }, [bancosPos]);
  useEffect(() => { lsSave(LS_APORTE_KEY,  aportePos);  }, [aportePos]);
  useEffect(() => { lsSave(LS_PERMUTA_KEY, permutaPos); }, [permutaPos]);

  useEffect(() => { load(); }, []);

  // click outside the edit row → save
  const saveEditRef = useRef<() => void>(() => {});
  useEffect(() => { saveEditRef.current = saveEdit; });
  useEffect(() => {
    if (!editingId) return;
    function onMouseDown(e: MouseEvent) {
      if ((e.target as Element).closest("[data-edit-row]")) return;
      saveEditRef.current();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [editingId]);

  async function load() {
    setLoading(true);
    const [{ data }, { data: opts, error: erroOpts }] = await Promise.all([
      supabase.from("investimentos").select("*").order("data", { ascending: false }),
      supabase.from("inv_opcoes").select("*").order("valor"),
    ]);
    setInvestimentos((data ?? []) as Investimento[]);
    if (erroOpts) {
      setSemTabela(true);
    } else {
      setSemTabela(false);
      setOpcoesDB((opts ?? []) as OpcaoLista[]);
      // detect if new columns exist
      const optsArr = opts ?? [];
      const dataArr = data ?? [];
      const semParent = optsArr.length > 0 && !("parent" in optsArr[0]);
      const semSubcatInv = dataArr.length > 0 && !("subcategoria" in dataArr[0]);
      setSemColSubcat(semParent || semSubcatInv);
    }
    setLoading(false);
  }

  function startEdit(inv: Investimento) {
    if (editingId === inv.id) { setEditingId(null); return; }
    setAddingNew(false);
    setEditingId(inv.id);
    setEditForm({
      data: inv.data, empresa: inv.empresa, categoria: inv.categoria ?? "",
      subcategoria: inv.subcategoria ?? "",
      descricao: inv.descricao, valor: Number(inv.valor),
      observacoes: inv.observacoes ?? "", comprovante_url: inv.comprovante_url ?? "",
    });
  }

  function cancelEdit() { setEditingId(null); }

  function empresaCanonica(val: string): string {
    const norm = normalize(val);
    return listaBancos.find(b => normalize(b) === norm) ?? val.trim();
  }

  async function saveEdit() {
    if (!editingId || !editForm.empresa.trim() || !editForm.descricao.trim() || !editForm.valor) return;
    setSalvando(true);
    const payload: Record<string, unknown> = {
      data: editForm.data, empresa: empresaCanonica(editForm.empresa),
      categoria: editForm.categoria || null,
      descricao: editForm.descricao.trim(), valor: editForm.valor,
      observacoes: editForm.observacoes.trim() || null,
      comprovante_url: editForm.comprovante_url.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!semColSubcat) payload.subcategoria = editForm.subcategoria || null;
    const { error } = await supabase.from("investimentos").update(payload).eq("id", editingId);
    if (error) { alert("Erro: " + error.message); setSalvando(false); return; }
    registrarLog({ acao: "editou", tabela: "investimentos", registro_id: editingId, descricao: `Editou aporte de ${editForm.empresa}` });
    setSalvando(false); setEditingId(null); load();
  }

  function startAdd() {
    setEditingId(null);
    setNewForm({ ...EMPTY, data: hoje() });
    setAddingNew(true);
  }

  function cancelAdd() { setAddingNew(false); }

  async function saveAdd() {
    if (!newForm.empresa.trim() || !newForm.descricao.trim() || !newForm.valor) return;
    setSalvando(true);
    const payload: Record<string, unknown> = {
      data: newForm.data, empresa: empresaCanonica(newForm.empresa),
      categoria: newForm.categoria || null,
      descricao: newForm.descricao.trim(), valor: newForm.valor,
      observacoes: newForm.observacoes.trim() || null,
      comprovante_url: newForm.comprovante_url.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!semColSubcat) payload.subcategoria = newForm.subcategoria || null;
    const { error } = await supabase.from("investimentos").insert([payload] as never);
    if (error) { alert("Erro: " + error.message); setSalvando(false); return; }
    registrarLog({ acao: "criou", tabela: "investimentos", descricao: `Aporte ${formatBRL(newForm.valor)} · ${newForm.empresa}` });
    setSalvando(false); setAddingNew(false); load();
  }

  async function excluir(inv: Investimento) {
    if (!confirm(`Excluir aporte de ${formatBRL(Number(inv.valor))} de "${inv.empresa}"?\nEsta ação não pode ser desfeita.`)) return;
    await supabase.from("investimentos").delete().eq("id", inv.id);
    registrarLog({ acao: "excluiu", tabela: "investimentos", registro_id: inv.id, descricao: `Excluiu aporte de ${inv.empresa}` });
    if (editingId === inv.id) setEditingId(null);
    load();
  }

  async function corrigirBancos() {
    setCorrigindo(true);
    try {
      const r = await fetch("/api/admin/fix-banco-case", { method: "POST" });
      const d = await r.json();
      setCorrigido(true);
      await load();
      alert(`✓ Corrigido: ${d.fixedInvestimentos} registro(s) e ${d.fixedOpcoes} opção(ões) duplicada(s) removida(s).`);
    } catch {
      alert("Erro ao corrigir.");
    } finally {
      setCorrigindo(false);
    }
  }

  async function addOpcao(tipo: "banco" | "categoria", valor: string) {
    if (!valor.trim()) return;
    if (semTabela) { alert("Execute o SQL de migração primeiro."); return; }
    const { error } = await supabase.from("inv_opcoes").insert([{ tipo, valor: valor.trim() }] as never);
    if (error) {
      if (error.message.includes("row-level security")) setErroRLS(true);
      else alert("Erro ao adicionar: " + error.message);
      return;
    }
    if (tipo === "banco") setNovoBanco(""); else setNovaCat("");
    load();
  }

  async function addSubcat(cat: string, valor: string) {
    if (!valor.trim() || !cat) return;
    const { error } = await supabase.from("inv_opcoes").insert([{ tipo: "subcategoria", valor: valor.trim(), parent: cat }] as never);
    if (error) {
      if (error.message.includes("row-level security")) setErroRLS(true);
      else if (error.message.toLowerCase().includes("column") || error.message.toLowerCase().includes("parent")) setSemColSubcat(true);
      else alert("Erro ao adicionar subcategoria: " + error.message);
      return;
    }
    setNovaSubcat("");
    load();
  }

  async function removeOpcao(id: number) {
    const { error } = await supabase.from("inv_opcoes").delete().eq("id", id);
    if (error) { alert("Erro ao remover: " + error.message); return; }
    load();
  }

  async function removeCat(o: OpcaoLista) {
    // remove subcategories first, then the category itself
    const subs = opcoesDB.filter(s => s.tipo === "subcategoria" && s.parent === o.valor);
    for (const s of subs) await supabase.from("inv_opcoes").delete().eq("id", s.id);
    await removeOpcao(o.id);
  }

  // ─── derived ──────────────────────────────────────────────────────────────

  const filtered = investimentos.filter(inv => {
    const q = busca.toLowerCase();
    if (q && !inv.empresa.toLowerCase().includes(q) && !inv.descricao.toLowerCase().includes(q)) return false;
    if (filtroBanco && inv.empresa !== filtroBanco) return false;
    if (filtroCategoria && inv.categoria !== filtroCategoria) return false;
    if (filtroInicio && inv.data < filtroInicio + "-01") return false;
    if (filtroFim) {
      const [y, m] = filtroFim.split("-").map(Number);
      const ultimoDia = new Date(y, m, 0).getDate();
      if (inv.data > `${filtroFim}-${String(ultimoDia).padStart(2, "0")}`) return false;
    }
    return true;
  });

  const listaBancos = opcoesDB.filter(o => o.tipo === "banco").map(o => o.valor).length
    ? opcoesDB.filter(o => o.tipo === "banco").map(o => o.valor)
    : BANCOS_DEFAULT;
  const listaCats = opcoesDB.filter(o => o.tipo === "categoria").map(o => o.valor).length
    ? opcoesDB.filter(o => o.tipo === "categoria").map(o => o.valor)
    : CATS_DEFAULT;
  const subcatsDe = (cat: string) =>
    opcoesDB.filter(o => o.tipo === "subcategoria" && o.parent === cat).map(o => o.valor);

  const totalGeral      = investimentos.reduce((s, i) => s + Number(i.valor), 0);
  const totalFiltrado   = filtered.reduce((s, i) => s + Number(i.valor), 0);
  const maiorAporte     = investimentos.length ? Math.max(...investimentos.map(i => Number(i.valor))) : 0;
  const mediaAporte     = investimentos.length ? totalGeral / investimentos.length : 0;
  const totalBancosPos  = bancosPos.reduce((s, b) => s + b.saldo, 0);
  const aporteEmBRLPos  = aportePos.moeda === "BRL" ? aportePos.valor : aportePos.valor * aportePos.cotacao;
  const totalPosicaoGlobal = totalGeral + totalBancosPos + aporteEmBRLPos + permutaPos.valorTotal;
  const bancos        = [...new Set(investimentos.map(i => i.empresa))].sort();
  const normalize     = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const bancosNorm    = bancos.map(b => normalize(b));
  const temDupBanco   = bancosNorm.length !== new Set(bancosNorm).size;
  const temFiltro     = !!(busca || filtroBanco || filtroCategoria || filtroInicio || filtroFim);
  const categorias    = [...new Set(investimentos.map(i => i.categoria).filter(Boolean) as string[])].sort();
  const datas         = investimentos.map(i => i.data.substring(0, 7)).sort();
  const mesMin        = datas[0] ?? "";
  const mesMax        = datas[datas.length - 1] ?? "";

  const mesesPDF    = [...new Set(filtered.map(i => i.data.substring(0, 7)))].sort();
  const bancosNoPDF = [...new Set(filtered.map(i => i.empresa))].sort();
  const mediaPDF    = filtered.length ? totalFiltrado / filtered.length : 0;

  function labelPeriodoPDF() {
    if (filtroInicio && filtroFim) return `${labelMes(filtroInicio)} a ${labelMes(filtroFim)}`;
    if (filtroInicio) return `A partir de ${labelMes(filtroInicio)}`;
    if (filtroFim) return `Até ${labelMes(filtroFim)}`;
    return "Todos os períodos";
  }

  function handlePDF() {
    const orig = document.title;
    const banco = filtroBanco ? ` · ${filtroBanco}` : "";
    document.title = `Extrato de Investimentos - Urban Glass - ${new Date().toLocaleDateString("pt-BR")}${banco}`;
    window.print();
    setTimeout(() => { document.title = orig; }, 2000);
  }

  function handleExcel() {
    const rows = [
      ["Data", "Descrição", "Banco", "Valor (R$)", "Categoria", "Subcategoria", "Observação"],
      ...filtered.map(inv => [
        fmtData(inv.data),
        inv.descricao,
        inv.empresa,
        Number(inv.valor),
        inv.categoria ?? "",
        inv.subcategoria ?? "",
        inv.observacoes ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 13 }, { wch: 36 }, { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Investimentos");
    const bancoSlug   = filtroBanco ? `_${filtroBanco.replace(/\s+/g, "_")}` : "";
    const periodoSlug = filtroInicio ? `_${filtroInicio}` : "";
    const fimSlug     = filtroFim ? `_ate_${filtroFim}` : "";
    XLSX.writeFile(wb, `Investimentos_UrbanGlass${bancoSlug}${periodoSlug}${fimSlug}_${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  // ─── style tokens ─────────────────────────────────────────────────────────

  const G   = "#f59e0b";
  const GB  = "rgba(245,158,11,.10)";
  const GBR = "rgba(245,158,11,.22)";

  const ci: React.CSSProperties = {
    width: "100%", minWidth: 0, fontSize: "12px", padding: "4px 6px",
    background: "var(--surf1)", border: "1px solid var(--acc)", borderRadius: "4px",
    color: "var(--t1)", fontFamily: "inherit", boxSizing: "border-box",
  };

  const editActions = (onSave: () => void, onCancel: () => void) => (
    <div style={{ display: "flex", gap: "3px" }}>
      <button className="btn bp xs" title="Salvar (ou clique fora)" onClick={onSave} disabled={salvando}>✓</button>
      <button className="btn bg xs" onClick={onCancel}>✕</button>
    </div>
  );

  const editRow = (
    form: RowState,
    set: React.Dispatch<React.SetStateAction<RowState>>,
    onSave: () => void,
    onCancel: () => void,
    isNew: boolean,
    key?: string,
  ) => (
    <tr key={key} data-edit-row="" style={{ background: isNew ? "rgba(245,158,11,.05)" : "var(--surf2)", outline: `1px solid ${isNew ? GBR : "var(--acc)"}` }}>
      <td style={{ minWidth: "130px" }}>
        <DateInput value={form.data} onChange={v => set(f => ({ ...f, data: v }))} />
      </td>
      <td>
        <input style={ci} value={form.descricao} placeholder="Descrição *"
          autoFocus={isNew}
          onChange={e => set(f => ({ ...f, descricao: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && onSave()} />
      </td>
      <td>
        <select className="fc" style={{ margin: 0, width: "100%" }} value={form.empresa}
          onChange={e => set(f => ({ ...f, empresa: e.target.value }))}>
          <option value="">Selecione...</option>
          {listaBancos.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </td>
      <td style={{ minWidth: "150px" }}>
        <CurrencyInput value={form.valor} onChange={v => set(f => ({ ...f, valor: v }))} />
      </td>
      <td style={{ minWidth: "200px" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          <select className="fc" style={{ margin: 0, flex: 1 }} value={form.categoria}
            onChange={e => set(f => ({ ...f, categoria: e.target.value, subcategoria: "" }))}>
            <option value="">—</option>
            {listaCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {!semColSubcat && form.categoria && subcatsDe(form.categoria).length > 0 && (
            <select className="fc" style={{ margin: 0, flex: 1 }} value={form.subcategoria}
              onChange={e => set(f => ({ ...f, subcategoria: e.target.value }))}>
              <option value="">—</option>
              {subcatsDe(form.categoria).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </td>
      <td>
        <input style={ci} value={form.observacoes} placeholder="Observação..."
          onChange={e => set(f => ({ ...f, observacoes: e.target.value }))} />
      </td>
      <td>
        <input style={ci} value={form.comprovante_url} placeholder="https://..."
          onChange={e => set(f => ({ ...f, comprovante_url: e.target.value }))} />
      </td>
      <td>{editActions(onSave, onCancel)}</td>
    </tr>
  );

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <style>{`
        .inv-print { display: none; }
        @media print {
          .no-print, .sb { display: none !important; }
          body { background: white !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .inv-print { display: block !important; }
          @page { margin: 12mm 14mm; size: A4 portrait; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          .pdf-mes-block { page-break-inside: avoid; }
        }
        input[type="month"].fc { color-scheme: dark; }
      `}</style>

      {/* Top bar */}
      <div className="tb no-print">
        <div className="tb-title">Investimentos</div>
        <div style={{ display: "flex", gap: "8px" }}>
          {temDupBanco && !corrigido && (
            <button className="btn cy sm" onClick={corrigirBancos} disabled={corrigindo} title="Normalizar nomes duplicados de bancos">
              {corrigindo ? "Corrigindo..." : "⚠ Corrigir Bancos"}
            </button>
          )}
          <button className="btn bg sm" onClick={handlePDF} disabled={!filtered.length}>⬡ PDF</button>
          <button className="btn bg sm" onClick={handleExcel} disabled={!filtered.length}>↓ Excel</button>
          <button className="btn bg sm" onClick={() => setModalListas(true)}>⚙ Listas</button>
          <button className="btn bp sm" onClick={startAdd}>+ Novo Aporte</button>
        </div>
      </div>

      <div className="con no-print">

        {semTabela && (
          <div className="al al-w" style={{ marginBottom: "16px", fontSize: "12px" }}>
            <strong>⚠ Execute este SQL no Supabase para habilitar listas personalizadas e subcategorias:</strong>
            <code style={{ display: "block", marginTop: "8px", padding: "10px 14px", background: "rgba(0,0,0,.3)", borderRadius: "6px", fontFamily: "'DM Mono',monospace", fontSize: "11px", userSelect: "all", lineHeight: 1.8, whiteSpace: "pre" }}>{`CREATE TABLE IF NOT EXISTS inv_opcoes (\n  id serial PRIMARY KEY,\n  tipo text NOT NULL,\n  valor text NOT NULL,\n  parent text,\n  UNIQUE(tipo, valor)\n);\n\nINSERT INTO inv_opcoes (tipo, valor) VALUES\n  ('banco', 'Itaú Maxibuild'),\n  ('banco', 'ZRS'),\n  ('categoria', 'Manutenção'),\n  ('categoria', 'Equipamentos e Material')\nON CONFLICT DO NOTHING;\n\nALTER TABLE investimentos ADD COLUMN IF NOT EXISTS subcategoria text;`}</code>
          </div>
        )}

        {!semTabela && semColSubcat && (
          <div className="al al-w" style={{ marginBottom: "16px", fontSize: "12px" }}>
            <strong>⚠ Execute este SQL para habilitar subcategorias:</strong>
            <code style={{ display: "block", marginTop: "8px", padding: "10px 14px", background: "rgba(0,0,0,.3)", borderRadius: "6px", fontFamily: "'DM Mono',monospace", fontSize: "11px", userSelect: "all", lineHeight: 1.8, whiteSpace: "pre" }}>{SQL_MIGRACAO_COLUNAS}</code>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "22px" }}>
          {[
            { label: "Total Geral",          val: formatBRL(totalPosicaoGlobal), sub: `aportes · bancos · exterior · permuta`, c: G },
            { label: "Maior Aporte",       val: formatBRL(maiorAporte),  sub: "individual",                        c: G },
            { label: "Média por Aporte",   val: formatBRL(mediaAporte),  sub: "por registro",                      c: "var(--acc)" },
            { label: "Bancos / Origens",   val: String(bancos.length),   sub: "registrados",                       c: "var(--acc2)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "3px" }}>
              <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: s.c, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{s.val}</div>
              <div style={{ fontSize: "10px", color: "var(--t3)" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Posição Financeira */}
        <SecaoPosicaoFinanceira
          bancos={bancosPos}  setBancos={setBancosPos}
          aporte={aportePos}  setAporte={setAportePos}
          permuta={permutaPos} setPermuta={setPermutaPos}
        />

        {/* Filters */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap", alignItems: "center" }}>
          <input className="fc" placeholder="Buscar banco ou descrição..." value={busca}
            onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: "200px" }} />
          <select className="fc" style={{ minWidth: "160px" }} value={filtroBanco} onChange={e => setFiltroBanco(e.target.value)}>
            <option value="">Todos os bancos</option>
            {bancos.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="fc" style={{ minWidth: "170px" }} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--t3)", whiteSpace: "nowrap" }}>De</span>
            <input type="month" lang="pt-BR" className="fc" style={{ minWidth: "140px", margin: 0 }}
              min={mesMin} max={mesMax}
              value={filtroInicio} onChange={e => setFiltroInicio(e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--t3)", whiteSpace: "nowrap" }}>Até</span>
            <input type="month" lang="pt-BR" className="fc" style={{ minWidth: "140px", margin: 0 }}
              min={mesMin} max={mesMax}
              value={filtroFim} onChange={e => setFiltroFim(e.target.value)} />
          </div>
          {temFiltro && (
            <button className="btn bg sm" onClick={() => { setBusca(""); setFiltroBanco(""); setFiltroCategoria(""); setFiltroInicio(""); setFiltroFim(""); }}>
              ✕ Limpar
            </button>
          )}
        </div>

        {temFiltro && filtered.length > 0 && (
          <div style={{ marginBottom: "14px", padding: "9px 14px", background: GB, border: `1px solid ${GBR}`, borderRadius: "8px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: G }}>
            <span>{filtered.length} resultado(s){filtroBanco ? ` · ${filtroBanco}` : ""}{filtroCategoria ? ` · ${filtroCategoria}` : ""}{(filtroInicio || filtroFim) ? ` · ${labelPeriodoPDF()}` : ""}</span>
            <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{formatBRL(totalFiltrado)}</span>
          </div>
        )}

        {loading ? (
          <div className="loading">Carregando investimentos...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "90px" }}>Data</th>
                  <th style={{ width: "200px" }}>Descrição</th>
                  <th style={{ width: "140px" }}>Banco</th>
                  <th style={{ width: "120px", textAlign: "right" }}>Valor</th>
                  <th style={{ width: "180px" }}>Categoria</th>
                  <th style={{ width: "160px" }}>Observação</th>
                  <th style={{ width: "70px" }}>Link</th>
                  <th style={{ width: "72px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>

                {addingNew && editRow(newForm, setNewForm, saveAdd, cancelAdd, true, "__new__")}

                {filtered.length === 0 && !addingNew && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--t3)", padding: "32px" }}>
                      {investimentos.length === 0
                        ? 'Nenhum aporte registrado. Clique em "+ Novo Aporte" para começar.'
                        : "Nenhum resultado para os filtros selecionados."}
                    </td>
                  </tr>
                )}

                {filtered.map(inv => editingId === inv.id
                  ? editRow(editForm, setEditForm, saveEdit, cancelEdit, false, inv.id)
                  : (
                    <tr key={inv.id}
                      onClick={() => startEdit(inv)}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                    >
                      <td className="mono" style={{ fontSize: "12px" }}>{fmtData(inv.data)}</td>
                      <td style={{ fontSize: "13px", fontWeight: 500 }}>{inv.descricao}</td>
                      <td style={{ fontSize: "13px", fontWeight: 600 }}>{inv.empresa}</td>
                      <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: G, fontSize: "14px" }}>
                        {formatBRL(Number(inv.valor))}
                      </td>
                      <td>
                        {inv.categoria ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start" }}>
                            <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: GB, color: G, border: `1px solid ${GBR}` }}>
                              {inv.categoria}
                            </span>
                            {inv.subcategoria && (
                              <span style={{ fontSize: "10px", color: "var(--t3)", paddingLeft: "4px" }}>└ {inv.subcategoria}</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--t3)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--t3)" }}>{inv.observacoes || "—"}</td>
                      <td onClick={e => e.stopPropagation()}>
                        {inv.comprovante_url && inv.comprovante_url.startsWith("http") ? (
                          <a href={inv.comprovante_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: "12px", color: "var(--acc2)", textDecoration: "none" }}>
                            📎 Ver
                          </a>
                        ) : inv.comprovante_url ? (
                          <span style={{ fontSize: "11px", color: "var(--t3)" }}>{inv.comprovante_url}</span>
                        ) : (
                          <span style={{ color: "var(--t3)" }}>—</span>
                        )}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button
                          title="Excluir"
                          style={{ width: "28px", height: "28px", borderRadius: "6px", background: "transparent", border: "1px solid var(--b2)", color: "var(--t3)", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .1s" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "var(--err)"; e.currentTarget.style.borderColor = "var(--err)"; e.currentTarget.style.background = "rgba(244,63,94,.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.borderColor = "var(--b2)"; e.currentTarget.style.background = "transparent"; }}
                          onClick={() => excluir(inv)}
                        >🗑</button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>

              {investimentos.length > 0 && (
                <tfoot>
                  <tr style={{ background: "var(--surf1)" }}>
                    <td colSpan={3} style={{ padding: "10px 12px", fontSize: "12px", color: "var(--t3)", fontWeight: 600 }}>
                      {temFiltro ? `${filtered.length} de ${investimentos.length} aporte(s)` : `${investimentos.length} aporte(s)`}
                    </td>
                    <td className="mono" style={{ textAlign: "right", color: G, fontWeight: 700, padding: "10px 12px", fontSize: "14px" }}>
                      {formatBRL(temFiltro ? totalFiltrado : totalGeral)}
                    </td>
                    <td colSpan={4} style={{ fontSize: "11px", color: "var(--t3)", padding: "10px 12px" }}>total investido</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Gerenciar Listas ── */}
      {modalListas && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalListas(false)}>
          <div className="mod" style={{ width: "580px" }}>
            <div className="mhd">
              <div className="mtit">Gerenciar Listas</div>
              <button className="mcl" onClick={() => setModalListas(false)}>✕</button>
            </div>

            {semTabela && (
              <div style={{ background: "rgba(245,158,11,.12)", border: "1px solid var(--warn)", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "var(--warn)" }}>
                ⚠ A tabela <code style={{ fontFamily: "'DM Mono',monospace" }}>inv_opcoes</code> não existe ainda. Execute o SQL de migração mostrado na página.
              </div>
            )}

            {!semTabela && semColSubcat && (
              <div style={{ background: "rgba(245,158,11,.12)", border: "1px solid var(--warn)", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "var(--warn)" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>⚠ Execute o SQL para habilitar subcategorias:</div>
                <code style={{ display: "block", padding: "8px 10px", background: "rgba(0,0,0,.3)", borderRadius: "6px", fontFamily: "'DM Mono',monospace", fontSize: "11px", userSelect: "all", whiteSpace: "pre" }}>{SQL_MIGRACAO_COLUNAS}</code>
              </div>
            )}

            {erroRLS && (
              <div style={{ background: "rgba(245,158,11,.12)", border: "1px solid var(--warn)", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "var(--warn)" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>⚠ Row Level Security bloqueando. Execute:</div>
                <code style={{ display: "block", padding: "8px 10px", background: "rgba(0,0,0,.3)", borderRadius: "6px", fontFamily: "'DM Mono',monospace", fontSize: "11px", userSelect: "all" }}>
                  ALTER TABLE inv_opcoes DISABLE ROW LEVEL SECURITY;
                </code>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>

              {/* Bancos */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Bancos / Origens</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
                  {(opcoesDB.filter(o => o.tipo === "banco").length
                    ? opcoesDB.filter(o => o.tipo === "banco")
                    : BANCOS_DEFAULT.map((v, i) => ({ id: -i - 1, tipo: "banco", valor: v, parent: null }))
                  ).map(o => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--surf2)", borderRadius: "6px", border: "1px solid var(--b1)" }}>
                      <span style={{ fontSize: "13px" }}>{o.valor}</span>
                      {o.id > 0 && (
                        <button style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: "12px", padding: "0 2px" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "var(--err)")}
                          onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
                          onClick={() => removeOpcao(o.id)}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input className="fc" value={novoBanco} onChange={e => setNovoBanco(e.target.value)}
                    placeholder="Novo banco..." style={{ margin: 0, flex: 1 }}
                    onKeyDown={e => e.key === "Enter" && addOpcao("banco", novoBanco)} />
                  <button className="btn bp sm" onClick={() => addOpcao("banco", novoBanco)} disabled={!novoBanco.trim()}>+</button>
                </div>
              </div>

              {/* Categorias — expandable with subcategories */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Categorias</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
                  {(opcoesDB.filter(o => o.tipo === "categoria").length
                    ? opcoesDB.filter(o => o.tipo === "categoria")
                    : CATS_DEFAULT.map((v, i) => ({ id: -i - 1, tipo: "categoria", valor: v, parent: null }))
                  ).map(o => {
                    const subs = opcoesDB.filter(s => s.tipo === "subcategoria" && s.parent === o.valor);
                    const expanded = catExpandida === o.valor;
                    return (
                      <div key={o.id}>
                        {/* Category row */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", background: expanded ? `rgba(245,158,11,.08)` : "var(--surf2)", borderRadius: expanded ? "6px 6px 0 0" : "6px", border: `1px solid ${expanded ? GBR : "var(--b1)"}`, cursor: "pointer" }}
                          onClick={() => setCatExpandida(expanded ? null : o.valor)}>
                          <span style={{ fontSize: "10px", color: expanded ? G : "var(--t3)", transition: "transform .15s", display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                          <span style={{ fontSize: "13px", flex: 1 }}>{o.valor}</span>
                          {subs.length > 0 && (
                            <span style={{ fontSize: "10px", color: "var(--t3)", background: "var(--surf1)", padding: "1px 6px", borderRadius: "99px", border: "1px solid var(--b1)" }}>{subs.length}</span>
                          )}
                          {o.id > 0 && (
                            <button style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: "12px", padding: "0 2px" }}
                              onMouseEnter={e => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).style.color = "var(--err)"; }}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--t3)"}
                              onClick={e => { e.stopPropagation(); removeCat(o); }}>✕</button>
                          )}
                        </div>

                        {/* Subcategories panel */}
                        {expanded && (
                          <div style={{ padding: "8px 10px", background: "var(--surf1)", border: `1px solid ${GBR}`, borderTop: "none", borderRadius: "0 0 6px 6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                            {subs.length === 0 && (
                              <span style={{ fontSize: "11px", color: "var(--t3)", padding: "2px 4px" }}>Nenhuma subcategoria ainda.</span>
                            )}
                            {subs.map(s => (
                              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "var(--surf2)", borderRadius: "4px" }}>
                                <span style={{ fontSize: "12px", color: "var(--t2)" }}>└ {s.valor}</span>
                                <button style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                                  onMouseEnter={e => (e.currentTarget.style.color = "var(--err)")}
                                  onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
                                  onClick={() => removeOpcao(s.id)}>✕</button>
                              </div>
                            ))}
                            {!semColSubcat && (
                              <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                                <input className="fc" value={novaSubcat} onChange={e => setNovaSubcat(e.target.value)}
                                  placeholder="Nova subcategoria..." style={{ margin: 0, flex: 1, fontSize: "12px" }}
                                  onKeyDown={e => e.key === "Enter" && addSubcat(o.valor, novaSubcat)} />
                                <button className="btn bp sm" onClick={() => addSubcat(o.valor, novaSubcat)} disabled={!novaSubcat.trim()}>+</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input className="fc" value={novaCat} onChange={e => setNovaCat(e.target.value)}
                    placeholder="Nova categoria..." style={{ margin: 0, flex: 1 }}
                    onKeyDown={e => e.key === "Enter" && addOpcao("categoria", novaCat)} />
                  <button className="btn bp sm" onClick={() => addOpcao("categoria", novaCat)} disabled={!novaCat.trim()}>+</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── PDF / Print area ── */}
      <div className="inv-print" style={{ fontFamily: "Arial, sans-serif", color: "#111", background: "white", padding: "0" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", paddingBottom: "14px", borderBottom: "3px solid #2d5fa6" }}>
          <div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" }}>urbanglass</div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: "2px" }}>Urban Glass Comércio Ltda</div>
            <div style={{ fontSize: "9px", color: "#555", marginTop: "1px" }}>CNPJ: 65.668.970/0001-05</div>
            <div style={{ fontSize: "9px", color: "#555" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "4px" }}>Extrato de</div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-0.5px", lineHeight: 1 }}>Investimentos</div>
            <div style={{ fontSize: "10px", color: "#555", marginTop: "6px", fontWeight: 600 }}>{labelPeriodoPDF()}</div>
            {filtroBanco && <div style={{ fontSize: "10px", color: "#2d5fa6", marginTop: "3px", fontWeight: 700 }}>{filtroBanco}</div>}
            <div style={{ fontSize: "9px", color: "#888", marginTop: "4px" }}>
              Gerado em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Total do Período",   value: formatBRL(totalFiltrado),   color: "#2d5fa6" },
            { label: "Nº de Aportes",      value: String(filtered.length),    color: "#2d5fa6" },
            { label: "Média por Aporte",   value: formatBRL(mediaPDF),        color: "#444" },
            { label: "Bancos / Origens",   value: String(bancosNoPDF.length), color: "#444" },
          ].map(k => (
            <div key={k.label} style={{ background: "#f0f4ff", borderRadius: "8px", padding: "12px 14px", borderLeft: "3px solid #2d5fa6" }}>
              <div style={{ fontSize: "8px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "5px" }}>{k.label}</div>
              <div style={{ fontSize: "16px", fontWeight: 900, color: k.color, fontFamily: "monospace", lineHeight: 1 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Per-bank summary */}
        {bancosNoPDF.length > 1 && (
          <div style={{ marginBottom: "20px", pageBreakInside: "avoid" }}>
            <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#2d5fa6", marginBottom: "8px", borderBottom: "1px solid #d0daf0", paddingBottom: "4px" }}>
              Resumo por Banco / Origem
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#2d5fa6" }}>
                  {["Banco / Origem", "Aportes", "Total Investido", "% do Total"].map((h, i) => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: i === 0 ? "left" : i === 2 || i === 3 ? "right" : "center", color: "white", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bancosNoPDF.map((b, idx) => {
                  const its = filtered.filter(i => i.empresa === b);
                  const tot = its.reduce((s, i) => s + Number(i.valor), 0);
                  const pct = totalFiltrado > 0 ? (tot / totalFiltrado * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={b} style={{ background: idx % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ padding: "7px 10px", fontWeight: 700, borderBottom: "1px solid #e8edf8" }}>{b}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: "#555", borderBottom: "1px solid #e8edf8" }}>{its.length}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#2d5fa6", fontFamily: "monospace", borderBottom: "1px solid #e8edf8" }}>{formatBRL(tot)}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", color: "#666", borderBottom: "1px solid #e8edf8" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f0f4ff" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 800, fontSize: "10px" }}>Total</td>
                  <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700 }}>{filtered.length}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 900, color: "#2d5fa6", fontFamily: "monospace", fontSize: "12px" }}>{formatBRL(totalFiltrado)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700 }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Detail by month */}
        <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#2d5fa6", marginBottom: "10px", borderBottom: "1px solid #d0daf0", paddingBottom: "4px" }}>
          Detalhamento por Período
        </div>

        {mesesPDF.map(mes => {
          const itsMes = filtered.filter(i => i.data.startsWith(mes)).sort((a, b) => a.data.localeCompare(b.data));
          const totalMes = itsMes.reduce((s, i) => s + Number(i.valor), 0);
          return (
            <div key={mes} className="pdf-mes-block" style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#e8edf8", padding: "6px 10px", borderRadius: "4px 4px 0 0", borderLeft: "3px solid #2d5fa6" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, color: "#2d5fa6", textTransform: "capitalize" }}>{labelMes(mes)}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#2d5fa6", fontFamily: "monospace" }}>{itsMes.length} aporte(s) · {formatBRL(totalMes)}</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <thead>
                  <tr style={{ background: "#2d5fa6" }}>
                    {[
                      { h: "Data",       align: "left",  w: "68px"  },
                      { h: "Descrição",  align: "left",  w: "auto"  },
                      { h: "Banco",      align: "left",  w: "100px" },
                      { h: "Valor",      align: "right", w: "85px"  },
                      { h: "Categoria",  align: "left",  w: "80px"  },
                      { h: "Subcat.",    align: "left",  w: "80px"  },
                      { h: "Observação", align: "left",  w: "90px"  },
                    ].map(({ h, align, w }) => (
                      <th key={h} style={{ padding: "5px 7px", textAlign: align as "left" | "right", color: "white", fontWeight: 700, fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.5px", width: w }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itsMes.map((inv, idx) => (
                    <tr key={inv.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                      <td style={{ padding: "6px 7px", color: "#444", borderBottom: "1px solid #e8edf8", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "10px" }}>{fmtData(inv.data)}</td>
                      <td style={{ padding: "6px 7px", color: "#222", fontWeight: 600, borderBottom: "1px solid #e8edf8" }}>{inv.descricao}</td>
                      <td style={{ padding: "6px 7px", color: "#333", borderBottom: "1px solid #e8edf8" }}>{inv.empresa}</td>
                      <td style={{ padding: "6px 7px", color: "#2d5fa6", fontWeight: 700, textAlign: "right", borderBottom: "1px solid #e8edf8", whiteSpace: "nowrap", fontFamily: "monospace" }}>{formatBRL(Number(inv.valor))}</td>
                      <td style={{ padding: "6px 7px", color: "#d97706", borderBottom: "1px solid #e8edf8" }}>{inv.categoria ?? "—"}</td>
                      <td style={{ padding: "6px 7px", color: "#888", borderBottom: "1px solid #e8edf8" }}>{inv.subcategoria ?? "—"}</td>
                      <td style={{ padding: "6px 7px", color: "#666", borderBottom: "1px solid #e8edf8" }}>{inv.observacoes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f0f4ff" }}>
                    <td colSpan={3} style={{ padding: "6px 7px", fontWeight: 700, fontSize: "9px", color: "#2d5fa6", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                      Subtotal {labelMes(mes)}
                    </td>
                    <td style={{ padding: "6px 7px", fontWeight: 900, color: "#2d5fa6", textAlign: "right", fontFamily: "monospace", fontSize: "11px" }}>{formatBRL(totalMes)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}

        {/* Grand total */}
        <div style={{ marginTop: "8px", padding: "10px 14px", background: "#2d5fa6", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, color: "white", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Total Geral Investido · {filtered.length} aporte(s)
          </span>
          <span style={{ fontSize: "15px", fontWeight: 900, color: "white", fontFamily: "monospace" }}>{formatBRL(totalFiltrado)}</span>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "20px", paddingTop: "8px", borderTop: "2px solid #2d5fa6", display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#666", fontWeight: 600 }}>
          <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
          <div style={{ color: "#888", fontStyle: "italic" }}>Documento interno · não substitui NFe</div>
        </div>
      </div>
    </AppLayout>
  );
}
