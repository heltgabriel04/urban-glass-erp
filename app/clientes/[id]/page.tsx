"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL, formatDate, formatPercent } from "@/lib/formatters";
import type { Cliente, Pedido, FinanceiroCliente } from "@/types";

const CHIP: Record<string, string> = {
  "Aguardando otimização":   "chip cy",
  "Em Produção – Corte":     "chip cp",
  "Em Produção – Lapidação": "chip co",
  "Separação":               "chip cb",
  "Saiu para entrega":       "chip cb",
  "Entregue":                "chip cg",
  "Finalizado":              "chip cg",
  "Cancelado":               "chip cr",
};

const IND_IE: Record<string, string> = {
  "1": "Contribuinte ICMS",
  "2": "Contribuinte Isento",
  "9": "Não Contribuinte",
};

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [fin, setFin]         = useState<FinanceiroCliente | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: cliData }, { data: pedData }, { data: finData }] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase.from("pedidos").select("*, itens_pedido(id)").eq("cliente_id", id).order("dt_pedido", { ascending: false }),
      supabase.from("financeiro_clientes").select("*").eq("cliente_id", id).single(),
    ]);
    setCliente(cliData as Cliente);
    setPedidos((pedData ?? []) as Pedido[]);
    setFin(finData as FinanceiroCliente ?? null);
    setLoading(false);
  }

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando cliente...</div></div></AppLayout>;
  if (!cliente) return <AppLayout><div className="con"><div style={{ color:"var(--err)", padding:"32px" }}>Cliente não encontrado.</div></div></AppLayout>;

  const faturado  = Number(fin?.faturado ?? 0);
  const recebido  = Number(fin?.recebido ?? 0);
  const aReceber  = Number(fin?.a_receber ?? 0);
  const pctRec    = faturado > 0 ? (recebido / faturado) * 100 : 0;
  const pedAtivos = pedidos.filter(p => !["Entregue","Finalizado","Cancelado"].includes(p.status));
  const ticketMed = pedidos.length > 0 ? faturado / pedidos.length : 0;

  const enderecoCompleto = [
    cliente.logradouro && cliente.numero
      ? `${cliente.logradouro}, ${cliente.numero}`
      : cliente.logradouro || cliente.endereco,
    cliente.complemento,
    cliente.bairro,
    cliente.cidade && cliente.uf ? `${cliente.cidade} / ${cliente.uf}` : cliente.cidade,
    cliente.cep,
  ].filter(Boolean).join(" — ");

  return (
    <AppLayout>
      <div className="tb">
        <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
        <div className="tb-title" style={{ flex:1 }}>
          {cliente.nome}
          {!cliente.ativo && <span className="chip cr" style={{ marginLeft:"10px", fontSize:"10px" }}>Inativo</span>}
        </div>
        <button className="btn bg sm" onClick={() => router.push(`/clientes?edit=${cliente.id}`)}>Editar Cliente</button>
      </div>

      <div className="con" style={{ display:"flex", flexDirection:"column", gap:"20px" }}>

        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px" }}>
          {[
            { label:"Total Faturado", value: formatBRL(faturado),  color:"var(--acc)",  sub: pedidos.length + " pedido(s)" },
            { label:"Recebido",       value: formatBRL(recebido),  color:"var(--ok)",   sub: formatPercent(pctRec) + " do faturado" },
            { label:"A Receber",      value: formatBRL(aReceber),  color: aReceber > 0 ? "var(--warn)" : "var(--t2)", sub: aReceber > 0 ? "⚠ Em aberto" : "✓ Quitado" },
            { label:"Ticket Médio",   value: formatBRL(ticketMed), color:"var(--acc2)", sub: pedAtivos.length + " em andamento" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Grid dados */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"16px" }}>

          {/* Dados gerais */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>DADOS CADASTRAIS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <Row label="Tipo"      value={cliente.tipo_pessoa === "PF" ? "Pessoa Física" : "Pessoa Jurídica"} />
              {cliente.tipo_pessoa === "PJ"
                ? <Row label="CNPJ"  value={cliente.cnpj || "—"} />
                : <Row label="CPF"   value={cliente.cpf  || "—"} />
              }
              <Row label="Telefone"  value={cliente.tel   || "—"} />
              <Row label="E-mail"    value={cliente.email || "—"} />
              <Row label="Pagamento" value={cliente.pgto  || "—"} />
              <Row label="Tabela"    value={cliente.tabela === "g" ? "Grandes Clientes" : "Padrão"} />
            </div>
          </div>

          {/* Endereço */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>ENDEREÇO</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              {cliente.logradouro ? (
                <>
                  <Row label="Logradouro"  value={`${cliente.logradouro}${cliente.numero ? ", " + cliente.numero : ""}`} />
                  {cliente.complemento && <Row label="Complemento" value={cliente.complemento} />}
                  {cliente.bairro      && <Row label="Bairro"      value={cliente.bairro} />}
                  <Row label="Cidade / UF" value={[cliente.cidade, cliente.uf].filter(Boolean).join(" / ") || "—"} />
                  {cliente.cep         && <Row label="CEP"         value={cliente.cep} />}
                  {cliente.cod_ibge    && <Row label="Cód. IBGE"   value={cliente.cod_ibge} />}
                </>
              ) : (
                <Row label="Endereço" value={cliente.endereco || "—"} />
              )}
            </div>
          </div>

          {/* Fiscal */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>DADOS FISCAIS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <Row label="Inscrição Estadual" value={cliente.ie || "—"} />
              <Row label="Indicador IE"       value={IND_IE[cliente.ind_ie ?? "9"] ?? "—"} />
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:"13px", color:"var(--t3)" }}>Consumidor Final</span>
                <span className={`chip ${cliente.consumidor_final ? "cy" : "cgr"}`}>
                  {cliente.consumidor_final ? "Sim" : "Não"}
                </span>
              </div>
              {cliente.obs_nfe && <Row label="Obs NF-e" value={cliente.obs_nfe} />}
            </div>

            {/* Alerta fiscal */}
            {!cliente.cnpj && !cliente.cpf && (
              <div style={{ marginTop:"14px", background:"rgba(244,63,94,.1)", border:"1px solid rgba(244,63,94,.3)", borderRadius:"8px", padding:"10px 12px", fontSize:"11px", color:"var(--err)" }}>
                ⚠ Sem CPF/CNPJ — não será possível emitir NF-e para este cliente.
              </div>
            )}
            {!cliente.logradouro && !cliente.endereco && (
              <div style={{ marginTop:"8px", background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)", borderRadius:"8px", padding:"10px 12px", fontSize:"11px", color:"var(--warn)" }}>
                ⚠ Endereço incompleto — preencha para emitir NF-e.
              </div>
            )}
          </div>
        </div>

        {/* Resumo financeiro */}
        <div className="card" style={{ padding:"20px 24px" }}>
          <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>RESUMO FINANCEIRO</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px", marginBottom:"16px" }}>
            <div><div style={{ fontSize:"11px", color:"var(--t3)" }}>Total faturado</div><div style={{ fontSize:"18px", fontWeight:700, color:"var(--acc)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(faturado)}</div></div>
            <div><div style={{ fontSize:"11px", color:"var(--t3)" }}>Recebido</div><div style={{ fontSize:"18px", fontWeight:700, color:"var(--ok)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(recebido)}</div></div>
            <div><div style={{ fontSize:"11px", color:"var(--t3)" }}>A receber</div><div style={{ fontSize:"18px", fontWeight:700, color: aReceber > 0 ? "var(--warn)" : "var(--t2)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(aReceber)}</div></div>
            <div><div style={{ fontSize:"11px", color:"var(--t3)" }}>Ticket médio</div><div style={{ fontSize:"18px", fontWeight:700, color:"var(--acc2)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(ticketMed)}</div></div>
          </div>
          <div style={{ height:"6px", borderRadius:"3px", background:"var(--surf3)", overflow:"hidden" }}>
            <div style={{ height:"100%", borderRadius:"3px", width:`${pctRec}%`, background: pctRec >= 100 ? "var(--ok)" : pctRec >= 50 ? "var(--acc)" : "var(--warn)", transition:"width .3s" }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--t3)", marginTop:"6px" }}>
            <span>Recebimento geral</span><span>{pctRec.toFixed(0)}%</span>
          </div>
        </div>

        {/* Histórico de pedidos */}
        <div className="card" style={{ padding:"20px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
            <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>HISTÓRICO DE PEDIDOS ({pedidos.length})</div>
            <a href="/pedidos/novo" className="btn bp xs">+ Novo Pedido</a>
          </div>

          {pedidos.length === 0 ? (
            <div style={{ color:"var(--t3)", padding:"24px 0", textAlign:"center" }}>Nenhum pedido registrado para este cliente.</div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr><th>Pedido</th><th>Data</th><th>Retirada</th><th>m²</th><th>Valor</th><th>Recebido</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {pedidos.map(p => {
                    const aberto  = Number(p.valor_total) - Number(p.valor_recebido);
                    const quitado = aberto <= 0;
                    return (
                      <tr key={p.id}>
                        <td><span className="mono" style={{ color:"var(--acc)" }}>{p.id}</span></td>
                        <td className="mono">{formatDate(p.dt_pedido)}</td>
                        <td className="mono">{formatDate(p.dt_retirada)}</td>
                        <td className="mono">{Number(p.m2_total).toFixed(2)} m²</td>
                        <td className="mono">{formatBRL(p.valor_total)}</td>
                        <td>
                          <span className="mono" style={{ color: quitado ? "var(--ok)" : "var(--warn)" }}>{formatBRL(p.valor_recebido)}</span>
                          {!quitado && <div className="tdim" style={{ color:"var(--err)" }}>− {formatBRL(aberto)}</div>}
                        </td>
                        <td><span className={CHIP[p.status] ?? "chip cgr"}>{p.status}</span></td>
                        <td><a href={`/pedidos/${p.id}`} className="btn bg xs">Ver</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pedidos.length > 0 && (
            <div className="totbar" style={{ marginTop:"12px" }}>
              <div className="ti"><div className="tl">Total Pedidos</div><div className="tv">{pedidos.length}</div></div>
              <div className="ti"><div className="tl">Em Andamento</div><div className="tv" style={{ color:"var(--acc2)" }}>{pedAtivos.length}</div></div>
              <div className="ti"><div className="tl">Valor Total</div><div className="tv" style={{ color:"var(--acc)" }}>{formatBRL(faturado)}</div></div>
              <div className="ti"><div className="tl">A Receber</div><div className="tv" style={{ color: aReceber > 0 ? "var(--warn)" : "var(--ok)" }}>{formatBRL(aReceber)}</div></div>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}

function Row({ label, value, accent, color }: { label: string; value: string | number; accent?: boolean; color?: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"12px" }}>
      <span style={{ fontSize:"13px", color:"var(--t3)", flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:"13px", fontWeight: accent ? 700 : 500, color: color ?? (accent ? "var(--acc)" : "var(--t1)"), textAlign:"right" }}>{value}</span>
    </div>
  );
}