"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidoById, avancarStatusPedido, registrarRecebimento } from "@/services/pedidos.service";
import { formatBRL, formatDate } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import type { Pedido } from "@/types";

const CHIP: Record<string, string> = {
  "Aguardando otimização":   "chip cy",
  "Em Produção – Corte":     "chip cp",
  "Em Produção – Lapidação": "chip co",
  "Separação":               "chip cb",
  "Entregue":                "chip cg",
  "Finalizado":              "chip cg",
  "Cancelado":               "chip cr",
};

const FLUXO = [
  "Aguardando otimização",
  "Em Produção – Corte",
  "Em Produção – Lapidação",
  "Separação",
  "Entregue",
  "Finalizado",
];

export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);
  const [recebendo, setRecebendo] = useState(false);
  const [valorRec, setValorRec] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const data = await getPedidoById(id);
    setPedido(data);
    setLoading(false);
  }

  async function handleAvancar() {
    if (!pedido) return;
    setSalvando(true);
    const result = await avancarStatusPedido(pedido.id, pedido.status);
    if (result) { toast(`${pedido.id} → ${result.status}`); }
    else toast("Erro ao avançar status", "err");
    await load();
    setSalvando(false);
  }

  async function handleReceber() {
    if (!pedido) return;
    const valor = parseFloat(valorRec.replace(",", "."));
    if (!valor || valor <= 0) { toast("Informe um valor válido", "warn"); return; }
    const aberto = Number(pedido.valor_total) - Number(pedido.valor_recebido);
    if (valor > aberto) { toast(`Valor máximo: ${formatBRL(aberto)}`, "warn"); return; }
    setSalvando(true);
    const result = await registrarRecebimento(pedido.id, valor);
    setSalvando(false);
    if (!result) { toast("Erro ao registrar recebimento", "err"); return; }
    toast(valor >= aberto ? `✓ Pedido ${pedido.id} quitado!` : `Recebimento de ${formatBRL(valor)} registrado`);
    setValorRec(""); setRecebendo(false);
    await load();
  }

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando pedido...</div></div></AppLayout>;
  if (!pedido) return <AppLayout><div className="con"><div style={{ color:"var(--err)", padding:"32px" }}>Pedido não encontrado.</div></div></AppLayout>;

  const aberto      = Number(pedido.valor_total) - Number(pedido.valor_recebido);
  const quitado     = aberto <= 0;
  const pctRec      = pedido.valor_total > 0 ? Math.min(100, (Number(pedido.valor_recebido) / Number(pedido.valor_total)) * 100) : 0;
  const statusIdx   = FLUXO.indexOf(pedido.status);
  const podeAvancar = !["Finalizado","Cancelado"].includes(pedido.status);
  const temItens    = (pedido.itens_pedido?.length ?? 0) > 0;

  return (
    <AppLayout>
      <div className="tb">
        <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
        <div className="tb-title" style={{ flex:1 }}>
          Pedido <span style={{ color:"var(--acc)" }}>{pedido.id}</span>
        </div>
        <span className={CHIP[pedido.status] ?? "chip cgr"}>{pedido.status}</span>
        {temItens && <a href={`/otimizador?pedido=${pedido.id}`} className="btn bg sm">◈ Otimizar Corte</a>}
        {podeAvancar && (
          <button className="btn bp sm" onClick={handleAvancar} disabled={salvando}>
            {salvando ? "Salvando..." : "Avançar Status →"}
          </button>
        )}
      </div>

      <div className="con" style={{ display:"flex", flexDirection:"column", gap:"20px" }}>

        {/* Progresso */}
        <div className="card" style={{ padding:"20px 24px" }}>
          <div style={{ display:"flex", alignItems:"flex-start" }}>
            {FLUXO.map((step, i) => {
              const done    = i < statusIdx;
              const current = i === statusIdx;
              const last    = i === FLUXO.length - 1;
              return (
                <div key={step} style={{ display:"flex", alignItems:"flex-start", flex: last ? 0 : 1, minWidth:0 }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"6px", minWidth:"72px" }}>
                    <div style={{
                      width:"28px", height:"28px", borderRadius:"50%",
                      background: done ? "var(--ok)" : current ? "var(--acc)" : "var(--surf3)",
                      border: current ? "2px solid var(--acc)" : "2px solid transparent",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:"12px", fontWeight:700,
                      color: done || current ? "#000" : "var(--t3)",
                      flexShrink:0,
                    }}>
                      {done ? "✓" : i + 1}
                    </div>
                    <div style={{
                      fontSize:"10px", textAlign:"center", lineHeight:1.2,
                      color: current ? "var(--acc)" : done ? "var(--ok)" : "var(--t3)",
                      fontWeight: current ? 700 : 400,
                      maxWidth:"72px",
                    }}>
                      {step}
                    </div>
                  </div>
                  {!last && (
                    <div style={{
                      flex:1, height:"2px", marginTop:"13px", marginLeft:"4px", marginRight:"4px",
                      background: done ? "var(--ok)" : "var(--surf3)",
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid info + financeiro */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" }}>
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>INFORMAÇÕES DO PEDIDO</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <Row label="Cliente"            value={pedido.clientes?.nome ?? "—"} />
              <Row label="Cidade"             value={pedido.clientes?.cidade ?? "—"} />
              <Row label="Telefone"           value={pedido.clientes?.tel ?? "—"} />
              <Row label="Data do pedido"     value={formatDate(pedido.dt_pedido)} />
              <Row label="Retirada prevista"  value={formatDate(pedido.dt_retirada)} />
              <Row label="m² total"           value={`${Number(pedido.m2_total).toFixed(2)} m²`} />
              <Row label="Forma de pagamento" value={pedido.forma_pgto || "—"} />
              {pedido.parcelas > 1 && <Row label="Parcelas" value={`${pedido.parcelas}×`} />}
              {pedido.obs && <Row label="Observações" value={pedido.obs} />}
            </div>
          </div>

          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>FINANCEIRO</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <Row label="Valor total" value={formatBRL(pedido.valor_total)} accent />
              <Row label="Recebido"    value={formatBRL(pedido.valor_recebido)} color={pedido.valor_recebido > 0 ? "var(--ok)" : "var(--t2)"} />
              <Row label="Em aberto"   value={formatBRL(Math.max(0, aberto))} color={quitado ? "var(--ok)" : "var(--err)"} />
            </div>
            <div style={{ marginTop:"20px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginBottom:"6px" }}>
                <span>Recebimento</span><span>{pctRec.toFixed(0)}%</span>
              </div>
              <div style={{ height:"6px", borderRadius:"3px", background:"var(--surf3)", overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:"3px", width:`${pctRec}%`, background: quitado ? "var(--ok)" : "var(--acc)", transition:"width .3s" }} />
              </div>
            </div>
            {!quitado && (
              <div style={{ marginTop:"20px" }}>
                {!recebendo ? (
                  <button className="btn bp sm" style={{ width:"100%" }} onClick={() => setRecebendo(true)}>+ Registrar Recebimento</button>
                ) : (
                  <div style={{ display:"flex", gap:"8px" }}>
                    <input type="text" placeholder="0,00" value={valorRec} onChange={e => setValorRec(e.target.value)} style={{ flex:1, background:"var(--surf2)", border:"1px solid var(--b2)", borderRadius:"6px", padding:"8px 12px", color:"var(--t1)", fontSize:"14px" }} autoFocus />
                    <button className="btn bp sm" onClick={handleReceber} disabled={salvando}>{salvando ? "..." : "Salvar"}</button>
                    <button className="btn bg sm" onClick={() => { setRecebendo(false); setValorRec(""); }}>✕</button>
                  </div>
                )}
              </div>
            )}
            {quitado && (
              <div style={{ marginTop:"16px", padding:"10px", background:"rgba(0,200,100,.08)", borderRadius:"8px", color:"var(--ok)", fontSize:"13px", textAlign:"center" }}>
                ✓ Pagamento quitado
              </div>
            )}
          </div>
        </div>

        {/* Itens */}
        <div className="card" style={{ padding:"20px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ITENS DO PEDIDO ({pedido.itens_pedido?.length ?? 0})</div>
            {temItens && <a href={`/otimizador?pedido=${pedido.id}`} className="btn bg xs">◈ Otimizar Corte</a>}
          </div>
          {!temItens ? (
            <div style={{ color:"var(--t3)", padding:"24px 0", textAlign:"center" }}>Nenhum item registrado neste pedido.</div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr><th>#</th><th>Produto</th><th>Dimensão</th><th>m²</th><th>Qtd</th><th>R$/m²</th><th>Lapidação</th><th>Subtotal</th></tr>
                </thead>
                <tbody>
                  {pedido.itens_pedido!.map((item, i) => (
                    <tr key={item.id}>
                      <td className="mono" style={{ color:"var(--t3)" }}>{i + 1}</td>
                      <td><strong>{item.produto_nome}</strong></td>
                      <td className="mono">{item.largura} × {item.altura} mm</td>
                      <td className="mono">{Number(item.m2).toFixed(3)}</td>
                      <td className="mono">{item.quantidade}</td>
                      <td className="mono">{formatBRL(item.valor_m2)}</td>
                      <td className="mono">{item.lapidacao > 0 ? formatBRL(item.lapidacao) : <span style={{ color:"var(--t3)" }}>—</span>}</td>
                      <td className="mono" style={{ color:"var(--acc)", fontWeight:600 }}>{formatBRL(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function Row({ label, value, accent, color }: { label: string; value: string | number; accent?: boolean; color?: string; }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"12px" }}>
      <span style={{ fontSize:"13px", color:"var(--t3)", flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:"13px", fontWeight: accent ? 700 : 500, color: color ?? (accent ? "var(--acc)" : "var(--t1)"), textAlign:"right" }}>{value}</span>
    </div>
  );
}