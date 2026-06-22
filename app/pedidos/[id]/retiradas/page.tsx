"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidoById } from "@/services/pedidos.service";
import { getRetiradasPorPedido, createRetirada, deletarRetirada, calcularSaldoItens } from "@/services/retiradas.service";
import { useToast } from "@/components/ui/toast";
import DateInput from "@/components/ui/DateInput";
import { formatDate } from "@/lib/formatters";
import type { Pedido, RetiradaPedido, SaldoItemRetirada } from "@/types";

function hoje() { return new Date().toISOString().split("T")[0]; }

const STATUS_CHIP: Record<SaldoItemRetirada["status"], string> = {
  Pendente: "chip cgr",
  Parcial:  "chip cy",
  Retirado: "chip cg",
};

interface SelecaoItem { sel: boolean; quantidade: number; obs: string }

export default function RetiradasPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [pedido, setPedido]       = useState<Pedido | null>(null);
  const [retiradas, setRetiradas] = useState<RetiradaPedido[]>([]);
  const [loading, setLoading]     = useState(true);
  const [salvando, setSalvando]   = useState(false);
  const [expandida, setExpandida] = useState<string | null>(null);

  const [novaData, setNovaData]           = useState(hoje());
  const [novoMotorista, setNovoMotorista] = useState("");
  const [novoVeiculo, setNovoVeiculo]     = useState("");
  const [selecao, setSelecao]             = useState<Record<number, SelecaoItem>>({});

  const [retiradaImprimir, setRetiradaImprimir] = useState<RetiradaPedido | null>(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [ped, rets] = await Promise.all([getPedidoById(id), getRetiradasPorPedido(id)]);
    setPedido(ped);
    setRetiradas(rets);

    const novoSaldo = calcularSaldoItens(ped?.itens_pedido ?? [], rets);
    setSelecao(Object.fromEntries(novoSaldo.map(s => [s.item_pedido_id, { sel: false, quantidade: 0, obs: "" }])));
    setNovaData(hoje());
    setNovoMotorista("");
    setNovoVeiculo("");
    setLoading(false);
  }

  const saldo: SaldoItemRetirada[] = useMemo(
    () => pedido ? calcularSaldoItens(pedido.itens_pedido ?? [], retiradas) : [],
    [pedido, retiradas]
  );

  const retiradasCronologicas = useMemo(
    () => [...retiradas].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [retiradas]
  );

  function numeroViagem(r: RetiradaPedido): number {
    return retiradasCronologicas.findIndex(x => x.id === r.id) + 1;
  }

  function totalPecas(r: RetiradaPedido): number {
    return (r.retiradas_pedido_itens ?? []).reduce((s, i) => s + i.quantidade, 0);
  }

  function toggleSelecionado(s: SaldoItemRetirada) {
    setSelecao(f => {
      const atual = f[s.item_pedido_id] ?? { sel: false, quantidade: 0, obs: "" };
      const novoSel = !atual.sel;
      return { ...f, [s.item_pedido_id]: { ...atual, sel: novoSel, quantidade: novoSel ? (atual.quantidade || s.quantidade_pendente) : 0 } };
    });
  }

  function setItemQuantidade(itemId: number, valor: number, max: number) {
    const v = Math.max(0, Math.min(Math.floor(valor) || 0, max));
    setSelecao(f => ({ ...f, [itemId]: { ...f[itemId], quantidade: v, sel: v > 0 } }));
  }

  function setItemObs(itemId: number, obs: string) {
    setSelecao(f => ({ ...f, [itemId]: { ...f[itemId], obs } }));
  }

  async function handleSalvarRetirada() {
    const itensPayload = Object.entries(selecao)
      .filter(([, v]) => v.sel && v.quantidade > 0)
      .map(([itemId, v]) => ({ item_pedido_id: Number(itemId), quantidade: v.quantidade, obs: v.obs || null }));

    if (itensPayload.length === 0) { toast("Selecione ao menos um item e a quantidade", "warn"); return; }

    setSalvando(true);
    const res = await createRetirada(
      id,
      { dt_retirada: novaData, motorista: novoMotorista || null, veiculo: novoVeiculo || null, obs: null },
      itensPayload
    );
    setSalvando(false);

    if (!res) { toast("Erro ao registrar retirada", "err"); return; }
    toast("✓ Retirada registrada");
    await load();
  }

  async function handleExcluirRetirada(retiradaId: string) {
    if (!confirm("Excluir esta retirada? O saldo dos itens voltará a ficar pendente.")) return;
    const res = await deletarRetirada(retiradaId, id);
    if (!res.ok) { toast("Erro ao excluir retirada", "err"); return; }
    toast("Retirada excluída");
    if (expandida === retiradaId) setExpandida(null);
    await load();
  }

  function handleImprimir(retirada: RetiradaPedido) {
    setRetiradaImprimir(retirada);
    setTimeout(() => window.print(), 80);
  }

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando retiradas...</div></div></AppLayout>;
  if (!pedido) return <AppLayout><div className="con" style={{ color: "var(--err)", padding: 32 }}>Pedido não encontrado.</div></AppLayout>;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb { display: none !important; }
          body { background: white !important; color: black !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .print-area { display: block !important; }
          .con { padding: 0 !important; }
          @page { margin: 0; size: A4; }
          .print-area * { font-weight: 700 !important; color: #000 !important; }
        }
        .print-area { display: none; }
        @media print { .print-area { display: block; } }
      `}</style>

      <AppLayout>
        <div className="tb no-print">
          <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
          <div className="tb-title" style={{ flex: 1 }}>
            Retiradas — <span style={{ color: "var(--acc)" }}>{pedido.id}</span>
          </div>
          <span className="chip cgr">{pedido.status}</span>
        </div>

        <div className="con no-print" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* ─── Registrar retirada ─── */}
          <div className="card">
            <div className="ct">Registrar retirada</div>

            <div className="fr3" style={{ marginBottom: 14 }}>
              <div className="fg">
                <label className="fl">Data da retirada</label>
                <DateInput value={novaData} onChange={setNovaData} className="fc" />
              </div>
              <div className="fg">
                <label className="fl">Motorista (opcional)</label>
                <input className="fc" value={novoMotorista} onChange={e => setNovoMotorista(e.target.value)} placeholder="Nome do motorista" />
              </div>
              <div className="fg">
                <label className="fl">Veículo (opcional)</label>
                <input className="fc" value={novoVeiculo} onChange={e => setNovoVeiculo(e.target.value)} placeholder="Placa / modelo" />
              </div>
            </div>

            {saldo.length === 0 ? (
              <div style={{ color: "var(--t3)", fontSize: 13 }}>Este pedido não possui itens cadastrados.</div>
            ) : (
              <div className="tw">
                <div style={{ display: "grid", gridTemplateColumns: "32px 2.2fr 110px 90px 110px 2fr", gap: 10, padding: "10px 14px", background: "var(--surf2)", borderBottom: "1px solid var(--b1)" }}>
                  {["", "Produto / Código", "Dimensão (mm)", "Pendente", "Qtd a retirar", "Obs. da peça"].map((h, i) => (
                    <div key={i} style={{ fontSize: 9.5, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 1.2, fontFamily: "'DM Mono', monospace" }}>{h}</div>
                  ))}
                </div>
                {saldo.map(s => {
                  const sel = selecao[s.item_pedido_id] ?? { sel: false, quantidade: 0, obs: "" };
                  const disponivel = s.quantidade_pendente > 0;
                  return (
                    <div
                      key={s.item_pedido_id}
                      style={{
                        display: "grid", gridTemplateColumns: "32px 2.2fr 110px 90px 110px 2fr", gap: 10,
                        padding: "10px 14px", borderBottom: "1px solid var(--b1)", alignItems: "center",
                        opacity: disponivel ? 1 : 0.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={sel.sel}
                        disabled={!disponivel}
                        onChange={() => toggleSelecionado(s)}
                        style={{ width: 16, height: 16, accentColor: "var(--acc)", cursor: disponivel ? "pointer" : "default" }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.produto_nome}</div>
                        {s.codigo_adicional && (
                          <div className="mono" style={{ fontSize: 11, color: "var(--acc2)" }}>Código: {s.codigo_adicional}</div>
                        )}
                      </div>
                      <div className="mono" style={{ fontSize: 12 }}>{s.largura} × {s.altura}</div>
                      <div>
                        {disponivel ? (
                          <span className="mono" style={{ fontSize: 12 }}>{s.quantidade_pendente} / {s.quantidade_total}</span>
                        ) : (
                          <span className={STATUS_CHIP[s.status]}>{s.status}</span>
                        )}
                      </div>
                      <input
                        className="fc" type="number" min={0} max={s.quantidade_pendente} disabled={!disponivel}
                        value={sel.quantidade}
                        onChange={e => setItemQuantidade(s.item_pedido_id, Number(e.target.value), s.quantidade_pendente)}
                      />
                      <input
                        className="fc" disabled={!disponivel}
                        value={sel.obs}
                        onChange={e => setItemObs(s.item_pedido_id, e.target.value)}
                        placeholder="Ex.: retrabalho de lapidação"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn bp sm" onClick={handleSalvarRetirada} disabled={salvando}>
                {salvando ? "Salvando..." : "Registrar Retirada"}
              </button>
            </div>
          </div>

          {/* ─── Viagens registradas ─── */}
          <div className="card">
            <div className="ct">Viagens registradas ({retiradas.length})</div>
            {retiradas.length === 0 ? (
              <div style={{ color: "var(--t3)", fontSize: 13 }}>Nenhuma retirada registrada ainda.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {retiradas.map(r => {
                  const aberta = expandida === r.id;
                  return (
                    <div key={r.id} style={{ border: "1px solid var(--b1)", borderRadius: "var(--r2)", overflow: "hidden" }}>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", background: "var(--surf2)" }}
                        onClick={() => setExpandida(aberta ? null : r.id)}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Viagem {numeroViagem(r)}</div>
                        <div style={{ fontSize: 12, color: "var(--t2)" }}>{formatDate(r.dt_retirada)}</div>
                        <div style={{ fontSize: 12, color: "var(--t3)" }}>{r.motorista || "—"}{r.veiculo ? ` · ${r.veiculo}` : ""}</div>
                        <div style={{ fontSize: 12, color: "var(--t3)" }}>{totalPecas(r)} peça(s)</div>
                        <div style={{ flex: 1 }} />
                        <button className="btn bg xs" onClick={e => { e.stopPropagation(); handleImprimir(r); }}>🖨 Romaneio</button>
                        <button className="btn bw xs" onClick={e => { e.stopPropagation(); handleExcluirRetirada(r.id); }}>🗑 Excluir</button>
                        <span style={{ color: "var(--t3)" }}>{aberta ? "▲" : "▼"}</span>
                      </div>
                      {aberta && (
                        <div className="tw" style={{ borderRadius: 0, borderTop: "none", borderLeft: "none", borderRight: "none" }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Produto</th>
                                <th>Dimensão (mm)</th>
                                <th>Qtd</th>
                                <th>Observação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(r.retiradas_pedido_itens ?? []).map(it => (
                                <tr key={it.id}>
                                  <td>{it.itens_pedido?.produto_nome ?? "—"}</td>
                                  <td className="mono">{it.itens_pedido?.largura} × {it.itens_pedido?.altura}</td>
                                  <td className="mono">{it.quantidade}</td>
                                  <td style={{ color: "var(--t2)" }}>{it.obs || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {r.obs && (
                            <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--t2)", borderTop: "1px solid var(--b1)" }}>
                              <strong style={{ color: "var(--t1)" }}>Obs. da viagem:</strong> {r.obs}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── ROMANEIO DE RETIRADA (impressão) ─── */}
        {retiradaImprimir && (
          <div className="print-area" style={{ padding: "20px 28px", fontFamily: "Arial, sans-serif", color: "#1a1a2e", background: "white", width: "210mm", minHeight: "auto", boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", paddingBottom: "16px", borderBottom: "3px solid #2d5fa6" }}>
              <div>
                <div style={{ fontSize: "26px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" }}>urbanglass</div>
                <div style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: "2px" }}>Urban Glass Comércio Ltda</div>
                <div style={{ fontSize: "9px", color: "#333", marginTop: "2px" }}>CNPJ: 65.668.970/0001-05</div>
                <div style={{ fontSize: "9px", color: "#333" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
                <div style={{ fontSize: "9px", color: "#333" }}>(32) 99986-0317</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "4px" }}>Romaneio de Retirada — Viagem {numeroViagem(retiradaImprimir)}</div>
                <div style={{ fontSize: "28px", fontWeight: 900, color: "#2d5fa6", letterSpacing: "-1px" }}>{pedido.id}</div>
                <div style={{ fontSize: "11px", color: "#333", marginTop: "6px" }}>Data da retirada: <strong>{formatDate(retiradaImprimir.dt_retirada)}</strong></div>
                <div style={{ fontSize: "9px", color: "#c00", marginTop: "6px", fontStyle: "italic" }}>⚠ Não tem validade fiscal</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "18px" }}>
              <div style={{ padding: "12px", background: "#f0f4ff", borderRadius: "8px", borderLeft: "4px solid #2d5fa6" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#2d5fa6", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Comprador</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>{pedido.clientes?.nome ?? "—"}</div>
                {pedido.clientes?.cidade && <div style={{ fontSize: "10px", color: "#333" }}>{pedido.clientes.cidade}</div>}
                {pedido.clientes?.tel && <div style={{ fontSize: "10px", color: "#333" }}>Tel: {pedido.clientes.tel}</div>}
              </div>
              <div style={{ padding: "12px", background: "#f0f4ff", borderRadius: "8px", borderLeft: "4px solid #3d8c5c" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#3d8c5c", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Dados da Viagem</div>
                <div style={{ fontSize: "11px", color: "#1a1a2e", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#333" }}>Motorista</span><strong>{retiradaImprimir.motorista || "—"}</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#333" }}>Veículo</span><strong>{retiradaImprimir.veiculo || "—"}</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#333" }}>Itens nesta viagem</span><strong>{(retiradaImprimir.retiradas_pedido_itens ?? []).length}</strong></div>
                </div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#2d5fa6" }}>
                  {["#", "Produto", "Dimensão (mm)", "Qtd", "Observação"].map((h, i) => (
                    <th key={i} style={{ padding: "8px", color: "white", fontWeight: 700, fontSize: "9px", textAlign: i === 0 || i === 3 ? "center" : "left", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(retiradaImprimir.retiradas_pedido_itens ?? []).map((item, i) => (
                  <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                    <td style={{ padding: "7px 8px", borderBottom: "1px solid #e8ecf5", textAlign: "center", color: "#000", fontSize: "10px", fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: "7px 8px", borderBottom: "1px solid #e8ecf5", fontWeight: 700, color: "#000" }}>{item.itens_pedido?.produto_nome ?? "—"}</td>
                    <td style={{ padding: "7px 8px", borderBottom: "1px solid #e8ecf5", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, color: "#000" }}>{item.itens_pedido?.largura} × {item.itens_pedido?.altura}</td>
                    <td style={{ padding: "7px 8px", borderBottom: "1px solid #e8ecf5", textAlign: "center", fontWeight: 700, color: "#000" }}>{item.quantidade}</td>
                    <td style={{ padding: "7px 8px", borderBottom: "1px solid #e8ecf5", color: "#000" }}>{item.obs || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {retiradaImprimir.obs && (
              <div style={{ padding: "10px 14px", background: "#fffbea", borderRadius: "8px", marginBottom: "16px", fontSize: "10px", borderLeft: "3px solid #f59e0b" }}>
                <strong style={{ color: "#92400e" }}>Observações da viagem:</strong> <span style={{ color: "#333", fontWeight: 700 }}>{retiradaImprimir.obs}</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "32px", marginBottom: "16px", marginTop: "32px" }}>
              {["Vendedor / Urban Glass", "Recebido por / Comprador", "Motorista / Entregador"].map(label => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ borderTop: "1px solid #999", paddingTop: "8px", fontSize: "10px", color: "#333", fontWeight: 700 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "2px solid #2d5fa6", paddingTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#333", fontWeight: 700 }}>
              <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
              <div style={{ color: "#c00", fontStyle: "italic", fontWeight: 700 }}>Este documento não substitui a Nota Fiscal Eletrônica</div>
            </div>
          </div>
        )}
      </AppLayout>
    </>
  );
}
