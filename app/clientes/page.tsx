"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getClientes, createCliente, updateCliente, deletarCliente } from "@/services/clientes.service";
import { getFinanceiroClientes } from "@/services/financeiro.service";
import { formatBRL } from "@/lib/formatters";
import type { Cliente, FinanceiroCliente, ClienteInsert } from "@/types";

const VAZIO: ClienteInsert = {
  nome: "", cnpj: "", tel: "", email: "",
  endereco: "", cidade: "", pgto: "", tabela: "p", ativo: true,
};

export default function ClientesPage() {
  const [clientes, setClientes]     = useState<Cliente[]>([]);
  const [financeiro, setFinanceiro] = useState<FinanceiroCliente[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filtro, setFiltro]         = useState("");
  const [modal, setModal]           = useState(false);
  const [form, setForm]             = useState<ClienteInsert>(VAZIO);
  const [editId, setEditId]         = useState<number | null>(null);
  const [salvando, setSalvando]     = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [clis, fin] = await Promise.all([getClientes(), getFinanceiroClientes()]);
    setClientes(clis);
    setFinanceiro(fin);
    setLoading(false);
  }

  function finDe(id: number): FinanceiroCliente | null {
    return financeiro.find(f => f.cliente_id === id) ?? null;
  }

  function abrirNovo() { setForm(VAZIO); setEditId(null); setModal(true); }

  function abrirEdit(c: Cliente) {
    setForm({ nome:c.nome, cnpj:c.cnpj, tel:c.tel, email:c.email, endereco:c.endereco, cidade:c.cidade, pgto:c.pgto, tabela:c.tabela, ativo:c.ativo });
    setEditId(c.id); setModal(true);
  }

  async function salvar() {
    if (!form.nome.trim()) return;
    setSalvando(true);
    if (editId) { await updateCliente(editId, form); } else { await createCliente(form); }
    setSalvando(false); setModal(false); load();
  }

  async function handleDeletar(c: Cliente) {
    if (!confirm(`Excluir "${c.nome}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    const ok = await deletarCliente(c.id);
    if (ok) load();
  }

  const filtrados = clientes.filter(c =>
    !filtro ||
    c.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    c.cidade.toLowerCase().includes(filtro.toLowerCase()) ||
    c.cnpj.includes(filtro)
  );

  const totalFaturado      = clientes.reduce((a, c) => a + (finDe(c.id) ? Number(finDe(c.id)!.faturado) : 0), 0);
  const totalAReceber      = clientes.reduce((a, c) => a + (finDe(c.id) ? Number(finDe(c.id)!.a_receber) : 0), 0);
  const totalInadimplentes = clientes.filter(c => { const f = finDe(c.id); return f && Number(f.recebido) === 0 && Number(f.faturado) > 0; }).length;

  const riscoChip = (fin: FinanceiroCliente | null) => {
    if (!fin || fin.faturado === 0) return <span className="chip cgr">—</span>;
    const pct = Number(fin.a_receber) / Number(fin.faturado);
    if (pct === 0) return <span className="chip cg">Zero</span>;
    if (pct < 0.5) return <span className="chip cy">Médio</span>;
    return <span className="chip cr">Alto</span>;
  };

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Clientes</div>
        <div className="tb-search">
          <span className="tb-search-ic">⌕</span>
          <input placeholder="Buscar cliente, cidade, CNPJ..." value={filtro} onChange={e => setFiltro(e.target.value)} />
        </div>
        <button className="btn bp sm" onClick={abrirNovo}>+ Novo Cliente</button>
      </div>

      <div className="con">
        {/* CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total",          value: String(clientes.length),      color:"var(--t1)",   sub:"clientes" },
            { label:"Faturado Total", value: formatBRL(totalFaturado),     color:"var(--acc)",  sub:"soma geral" },
            { label:"A Receber",      value: formatBRL(totalAReceber),     color:"var(--warn)", sub:"em aberto" },
            { label:"Inadimplentes",  value: String(totalInadimplentes),   color:"var(--err)",  sub:"sem pagamento" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="loading">Carregando clientes...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th><th>CNPJ</th><th>Telefone</th><th>Cidade</th>
                  <th>Tabela</th><th>Faturado</th><th>A Receber</th><th>Risco</th>
                  <th>Ações</th><th style={{ width:"40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>Nenhum cliente encontrado</td></tr>
                )}
                {filtrados.map(c => {
                  const fin = finDe(c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.nome}</strong>
                        {c.email && <div className="tdim">{c.email}</div>}
                      </td>
                      <td className="mono">{c.cnpj || "—"}</td>
                      <td className="mono">{c.tel || "—"}</td>
                      <td>{c.cidade || "—"}</td>
                      <td>
                        <span className={`chip ${c.tabela === "g" ? "cb" : "cgr"}`}>
                          {c.tabela === "g" ? "Grandes Clientes" : "Padrão"}
                        </span>
                      </td>
                      <td className="mono">{fin ? formatBRL(fin.faturado) : "—"}</td>
                      <td className="mono" style={{ color: fin && Number(fin.a_receber) > 0 ? "var(--warn)" : "var(--t2)" }}>
                        {fin ? formatBRL(fin.a_receber) : "—"}
                      </td>
                      <td>{riscoChip(fin)}</td>
                      <td>
                        <div style={{ display:"flex", gap:"6px" }}>
                          <a href={`/clientes/${c.id}`} className="btn bg xs">Ver</a>
                          <button className="btn bg xs" onClick={() => abrirEdit(c)}>Editar</button>
                        </div>
                      </td>
                      <td style={{ width:"40px", textAlign:"center" }}>
                        <button
                          title="Excluir cliente"
                          onClick={() => handleDeletar(c)}
                          style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="mod" style={{ width:"560px" }}>
            <div className="mhd">
              <div className="mtit">{editId ? "Editar Cliente" : "Novo Cliente"}</div>
              <button className="mcl" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Nome *</label><input className="fc" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do cliente" /></div>
              <div className="fg"><label className="fl">CNPJ</label><input className="fc" value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" /></div>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Telefone</label><input className="fc" value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} placeholder="(00) 00000-0000" /></div>
              <div className="fg"><label className="fl">E-mail</label><input className="fc" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" /></div>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Endereço</label><input className="fc" value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Rua, número" /></div>
              <div className="fg"><label className="fl">Cidade</label><input className="fc" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} placeholder="Cidade/UF" /></div>
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">Forma de Pagamento</label>
                <select className="fc" value={form.pgto} onChange={e => setForm(f => ({ ...f, pgto: e.target.value }))}>
                  <option value="">Selecione...</option>
                  <option>Dinheiro</option><option>PIX</option><option>Boleto</option>
                  <option>Cartão</option><option>Cheque</option><option>A Prazo</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Tabela de Preço</label>
                <select className="fc" value={form.tabela} onChange={e => setForm(f => ({ ...f, tabela: e.target.value as "p" | "g" }))}>
                  <option value="p">Padrão</option>
                  <option value="g">Grandes Clientes</option>
                </select>
              </div>
            </div>
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", marginTop:"8px" }}>
              <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar Cliente"}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}