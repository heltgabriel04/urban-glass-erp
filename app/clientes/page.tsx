"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getClientes, createCliente, updateCliente, deletarCliente } from "@/services/clientes.service";
import { getFinanceiroClientes } from "@/services/financeiro.service";
import { formatBRL } from "@/lib/formatters";
import SearchInput from "@/components/ui/SearchInput";
import type { Cliente, FinanceiroCliente, ClienteInsert, TipoPessoa, IndIE } from "@/types";

type ClienteForm = ClienteInsert & { responsavel?: string; tel_responsavel?: string };

const VAZIO: ClienteForm = {
  nome: "", cnpj: "", cpf: "", tipo_pessoa: "PJ",
  responsavel: "",
  tel_responsavel: "",
  tel: "", email: "",
  endereco: "", cidade: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", uf: "", cod_ibge: "",
  ie: "", ind_ie: "9", consumidor_final: false, obs_nfe: "",
  pgto: "", tabela: "p", ativo: true, credito: 0,
};

function maskCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

function maskCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function maskTel(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
}

function maskCEP(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

function maskIE(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 13);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4");
}

async function buscarCep(cep: string) {
  const raw = cep.replace(/\D/g, "");
  if (raw.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch { return null; }
}

async function buscarCnpjApi(cnpj: string) {
  const raw = cnpj.replace(/\D/g, "");
  if (raw.length !== 14) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default function ClientesPage() {
  const [clientes, setClientes]       = useState<Cliente[]>([]);
  const [financeiro, setFinanceiro]   = useState<FinanceiroCliente[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filtro, setFiltro]           = useState("");
  const [modal, setModal]             = useState(false);
  const [aba, setAba]                 = useState<"geral" | "endereco" | "fiscal">("geral");
  const [form, setForm]               = useState<any>(VAZIO);
  const [editId, setEditId]           = useState<number | null>(null);
  const [salvando, setSalvando]       = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [cnpjStatus, setCnpjStatus]     = useState<"" | "ok" | "err">("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [clis, fin] = await Promise.all([getClientes(), getFinanceiroClientes()]);
    setClientes(clis);
    setFinanceiro(fin);
    setLoading(false);
  }

  function finDe(id: number) { return financeiro.find(f => f.cliente_id === id) ?? null; }

  function abrirNovo() { setForm(VAZIO); setEditId(null); setAba("geral"); setCnpjStatus(""); setModal(true); }

  function abrirEdit(c: Cliente) {
    setForm({
      nome: c.nome, cnpj: c.cnpj, cpf: c.cpf ?? "", tipo_pessoa: c.tipo_pessoa ?? "PJ",
      responsavel: (c as any).responsavel ?? "",
      tel_responsavel: (c as any).tel_responsavel ?? "",
      tel: c.tel, email: c.email,
      endereco: c.endereco, cidade: c.cidade,
      cep: c.cep ?? "", logradouro: c.logradouro ?? "", numero: c.numero ?? "",
      complemento: c.complemento ?? "", bairro: c.bairro ?? "",
      uf: c.uf ?? "", cod_ibge: c.cod_ibge ?? "",
      ie: c.ie ?? "", ind_ie: (c.ind_ie ?? "9") as IndIE,
      consumidor_final: c.consumidor_final ?? false,
      obs_nfe: c.obs_nfe ?? "",
      pgto: c.pgto, tabela: c.tabela, ativo: c.ativo,
    });
    setEditId(c.id); setAba("geral"); setCnpjStatus(""); setModal(true);
  }

  async function handleCnpjChange(masked: string) {
    F("cnpj", masked);
    setCnpjStatus("");
    const raw = masked.replace(/\D/g, "");
    if (raw.length !== 14) return;
    setBuscandoCnpj(true);
    const d = await buscarCnpjApi(raw);
    setBuscandoCnpj(false);
    if (!d) { setCnpjStatus("err"); return; }
    setCnpjStatus("ok");

    function toTitleCase(s: string) {
      return (s ?? "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    function maskCEPInline(v: string) {
      const n = v.replace(/\D/g, "").slice(0, 8);
      return n.replace(/^(\d{5})(\d)/, "$1-$2");
    }
    function maskTelInline(v: string) {
      const n = v.replace(/\D/g, "").slice(0, 11);
      if (n.length <= 10) return n.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
      return n.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
    }

    setForm((f: any) => ({
      ...f,
      nome:        f.nome        || toTitleCase(d.razao_social ?? ""),
      logradouro:  toTitleCase(d.logradouro  ?? "") || f.logradouro,
      numero:      d.numero      || f.numero,
      complemento: toTitleCase(d.complemento ?? "") || f.complemento,
      bairro:      toTitleCase(d.bairro      ?? "") || f.bairro,
      cidade:      toTitleCase(d.municipio   ?? "") || f.cidade,
      uf:          d.uf          || f.uf,
      cep:         d.cep ? maskCEPInline(d.cep) : f.cep,
      cod_ibge:    d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : f.cod_ibge,
      tel:         f.tel         || (d.ddd_telefone_1 ? maskTelInline(d.ddd_telefone_1) : ""),
      email:       f.email       || (d.email ?? "").toLowerCase(),
    }));
  }

  async function handleCepBlur() {
    if (!form.cep || form.cep.replace(/\D/g, "").length !== 8) return;
    setBuscandoCep(true);
    const data = await buscarCep(form.cep);
    setBuscandoCep(false);
    if (!data) return;
    setForm((f: any) => ({
      ...f,
      logradouro: data.logradouro ?? f.logradouro,
      bairro:     data.bairro     ?? f.bairro,
      cidade:     data.localidade ?? f.cidade,
      uf:         data.uf         ?? f.uf,
      cod_ibge:   data.ibge       ?? f.cod_ibge,
    }));
  }

  async function salvar() {
    if (!form.nome.trim()) return;
    setSalvando(true);
    if (editId) { await updateCliente(editId, form); } else { await createCliente(form); }
    setSalvando(false); setModal(false); load();
  }

  async function handleDeletar(c: Cliente) {
    if (!confirm(`Excluir "${c.nome}" permanentemente?`)) return;
    const ok = await deletarCliente(c.id);
    if (ok) load();
  }

  const filtrados = clientes.filter(c =>
    !filtro ||
    c.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    (c.cidade ?? "").toLowerCase().includes(filtro.toLowerCase()) ||
    (c.cnpj ?? "").includes(filtro) ||
    (c.cpf ?? "").includes(filtro)
  );

  const totalFaturado      = clientes.reduce((a, c) => a + Number(finDe(c.id)?.faturado ?? 0), 0);
  const totalAReceber      = clientes.reduce((a, c) => a + Number(finDe(c.id)?.a_receber ?? 0), 0);
  const totalInadimplentes = clientes.filter(c => { const f = finDe(c.id); return f && Number(f.recebido) === 0 && Number(f.faturado) > 0; }).length;

  const riscoChip = (fin: FinanceiroCliente | null) => {
    if (!fin || fin.faturado === 0) return <span className="chip cgr">—</span>;
    const pct = Number(fin.a_receber) / Number(fin.faturado);
    if (pct === 0)  return <span className="chip cg">Zero</span>;
    if (pct < 0.5)  return <span className="chip cy">Médio</span>;
    return <span className="chip cr">Alto</span>;
  };

  const F = (k: string, v: string | boolean) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Clientes</div>
        <SearchInput placeholder="Buscar cliente, cidade, CNPJ..." value={filtro} onChange={setFiltro} />
        <button className="btn bp sm" onClick={abrirNovo}>+ Novo Cliente</button>
      </div>

      <div className="con">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"20px" }}>
          {[
            { label:"Total",          value: String(clientes.length),    color:"var(--t1)",   sub:"clientes" },
            { label:"Faturado Total", value: formatBRL(totalFaturado),   color:"var(--acc)",  sub:"soma geral" },
            { label:"A Receber",      value: formatBRL(totalAReceber),   color:"var(--warn)", sub:"em aberto" },
            { label:"Inadimplentes",  value: String(totalInadimplentes), color:"var(--err)",  sub:"sem pagamento" },
          ].map(card => (
            <div key={card.label} style={{ background:"var(--surf1)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"16px 20px", display:"flex", flexDirection:"column", gap:"4px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{card.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, color:card.color, fontFamily:"'DM Mono', monospace", lineHeight:1.2 }}>{card.value}</div>
              <div style={{ fontSize:"11px", color:"var(--t3)" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? <div className="loading">Carregando clientes...</div> : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th><th>CPF / CNPJ</th><th>Responsável</th><th>Telefone</th><th>Cidade / UF</th>
                  <th>Fiscal</th><th>Tabela</th><th>Faturado</th><th>A Receber</th><th>Risco</th>
                  <th>Ações</th><th style={{ width:"40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr><td colSpan={12} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>Nenhum cliente encontrado</td></tr>
                )}
                {filtrados.map(c => {
                  const fin    = finDe(c.id);
                  const docNum = c.tipo_pessoa === "PF" ? c.cpf : c.cnpj;
                  const cidade = [c.cidade, c.uf].filter(Boolean).join(" / ");
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.nome}</strong>
                        {c.email && <div className="tdim">{c.email}</div>}
                        {!c.ativo && <span className="chip cr" style={{ fontSize:"9px", marginTop:"2px" }}>Inativo</span>}
                      </td>
                      <td className="mono">
                        <div style={{ fontSize:"10px", color:"var(--t3)" }}>{c.tipo_pessoa === "PF" ? "CPF" : "CNPJ"}</div>
                        {docNum || "—"}
                      </td>
                      <td>
                        {(c as any).responsavel ? (
                          <div>
                            <div style={{ fontSize:"12px" }}>{(c as any).responsavel}</div>
                            {(c as any).tel_responsavel && <div className="tdim">{(c as any).tel_responsavel}</div>}
                          </div>
                        ) : <span style={{ color:"var(--t3)" }}>—</span>}
                      </td>
                      <td className="mono">{c.tel || "—"}</td>
                      <td>{cidade || c.cidade || "—"}</td>
                      <td>
                        <div style={{ fontSize:"11px", display:"flex", flexDirection:"column", gap:"2px" }}>
                          <span className={`chip ${c.consumidor_final ? "cy" : "cgr"}`} style={{ fontSize:"9px" }}>
                            {c.consumidor_final ? "Cons. Final" : "Revenda"}
                          </span>
                          {c.ind_ie === "1" && <span className="chip cb"  style={{ fontSize:"9px" }}>Contrib. ICMS</span>}
                          {c.ind_ie === "2" && <span className="chip cgr" style={{ fontSize:"9px" }}>Isento IE</span>}
                          {c.ind_ie === "9" && <span className="chip cgr" style={{ fontSize:"9px" }}>Não Contrib.</span>}
                        </div>
                      </td>
                      <td><span className={`chip ${c.tabela === "g" ? "cb" : "cgr"}`}>{c.tabela === "g" ? "Grandes Cli." : "Padrão"}</span></td>
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
                          title="Excluir"
                          onClick={() => handleDeletar(c)}
                          style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="rgba(244,63,94,.15)"; b.style.borderColor="var(--err)"; b.style.color="var(--err)"; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="transparent"; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                        >🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="mov open">
          <div className="mod" style={{ width:"600px", maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
            <div className="mhd">
              <div className="mtit">{editId ? "Editar Cliente" : "Novo Cliente"}</div>
              <button className="mcl" onClick={() => setModal(false)}>✕</button>
            </div>

            <div style={{ display:"flex", gap:"2px", padding:"0 20px", borderBottom:"1px solid var(--b1)", flexShrink:0 }}>
              {(["geral","endereco","fiscal"] as const).map(a => (
                <button key={a} onClick={() => setAba(a)} style={{
                  padding:"8px 16px", fontSize:"12px", fontWeight:600, cursor:"pointer",
                  background:"transparent", border:"none", borderBottom:`2px solid ${aba === a ? "var(--acc)" : "transparent"}`,
                  color: aba === a ? "var(--acc)" : "var(--t3)", transition:"all .15s",
                }}>
                  {a === "geral" ? "Geral" : a === "endereco" ? "Endereço" : "Fiscal / NF-e"}
                </button>
              ))}
            </div>

            <div style={{ overflowY:"auto", padding:"20px", flex:1 }}>

              {aba === "geral" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>

                  {/* Tipo + Status */}
                  <div className="fr">
                    <div className="fg">
                      <label className="fl">Tipo de Pessoa *</label>
                      <select className="fc" value={form.tipo_pessoa} onChange={e => { F("tipo_pessoa", e.target.value); setCnpjStatus(""); }}>
                        <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                        <option value="PF">Pessoa Física (CPF)</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl">Status</label>
                      <select className="fc" value={form.ativo ? "1" : "0"} onChange={e => F("ativo", e.target.value === "1")}>
                        <option value="1">Ativo</option>
                        <option value="0">Inativo</option>
                      </select>
                    </div>
                  </div>

                  {/* CNPJ / CPF — primeiro campo para busca automática */}
                  <div className="fr">
                    {form.tipo_pessoa === "PJ" ? (
                      <div className="fg">
                        <label className="fl" style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                          CNPJ
                          {buscandoCnpj && <span style={{ fontSize:"10px", color:"var(--acc)", fontWeight:500 }}>buscando...</span>}
                          {!buscandoCnpj && cnpjStatus === "ok"  && <span style={{ fontSize:"10px", color:"var(--ok)",  fontWeight:600 }}>✓ dados preenchidos</span>}
                          {!buscandoCnpj && cnpjStatus === "err" && <span style={{ fontSize:"10px", color:"var(--warn)", fontWeight:600 }}>não encontrado</span>}
                        </label>
                        <input className="fc" value={form.cnpj} onChange={e => handleCnpjChange(maskCNPJ(e.target.value))} placeholder="00.000.000/0001-00" maxLength={18} inputMode="numeric" autoFocus />
                      </div>
                    ) : (
                      <div className="fg">
                        <label className="fl">CPF</label>
                        <input className="fc" value={form.cpf} onChange={e => F("cpf", maskCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} inputMode="numeric" autoFocus />
                      </div>
                    )}
                    <div className="fg">
                      <label className="fl">Telefone da Empresa</label>
                      <input className="fc" value={form.tel} onChange={e => F("tel", maskTel(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} inputMode="numeric" />
                    </div>
                  </div>

                  {/* Aviso de busca automática — só para PJ sem resultado ainda */}
                  {form.tipo_pessoa === "PJ" && cnpjStatus === "" && form.cnpj.replace(/\D/g, "").length < 14 && (
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"10px 14px", background:"rgba(99,102,241,.07)", border:"1px solid rgba(99,102,241,.2)", borderRadius:"8px" }}>
                      <span style={{ fontSize:"15px" }}>💡</span>
                      <span style={{ fontSize:"12px", color:"var(--t2)" }}>Preencha o CNPJ acima para buscar automaticamente razão social, endereço, telefone e e-mail da empresa.</span>
                    </div>
                  )}

                  <div className="fg">
                    <label className="fl">Nome / Razão Social *</label>
                    <input className="fc" value={form.nome} onChange={e => F("nome", e.target.value)} placeholder="Nome ou razão social" />
                  </div>

                  {/* Responsável */}
                  <div className="fr">
                    <div className="fg">
                      <label className="fl">Nome do Responsável</label>
                      <input className="fc" value={form.responsavel ?? ""} onChange={e => F("responsavel", e.target.value)} placeholder="Nome do contato / responsável" />
                    </div>
                    <div className="fg">
                      <label className="fl">Telefone do Responsável</label>
                      <input className="fc" value={form.tel_responsavel ?? ""} onChange={e => F("tel_responsavel", maskTel(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} inputMode="numeric" />
                    </div>
                  </div>

                  <div className="fg">
                    <label className="fl">E-mail</label>
                    <input className="fc" value={form.email} onChange={e => F("email", e.target.value)} placeholder="email@empresa.com" inputMode="email" />
                  </div>

                  <div className="fr">
                    <div className="fg">
                      <label className="fl">Forma de Pagamento</label>
                      <select className="fc" value={form.pgto} onChange={e => F("pgto", e.target.value)}>
                        <option value="">Selecione...</option>
                        <option>Dinheiro</option><option>PIX</option><option>Boleto</option>
                        <option>Cartão</option><option>Cheque</option><option>A Prazo</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl">Tabela de Preço</label>
                      <select className="fc" value={form.tabela} onChange={e => F("tabela", e.target.value)}>
                        <option value="p">Padrão</option>
                        <option value="g">Grandes Clientes</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {aba === "endereco" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                  <div className="fr">
                    <div className="fg" style={{ maxWidth:"160px" }}>
                      <label className="fl">CEP {buscandoCep && <span style={{ color:"var(--acc)", fontSize:"10px" }}>buscando...</span>}</label>
                      <input className="fc" value={form.cep} onChange={e => F("cep", maskCEP(e.target.value))} onBlur={handleCepBlur} placeholder="00000-000" maxLength={9} inputMode="numeric" />
                    </div>
                    <div className="fg">
                      <label className="fl">Logradouro</label>
                      <input className="fc" value={form.logradouro} onChange={e => F("logradouro", e.target.value)} placeholder="Rua, Av., Travessa..." />
                    </div>
                    <div className="fg" style={{ maxWidth:"100px" }}>
                      <label className="fl">Número</label>
                      <input className="fc" value={form.numero} onChange={e => F("numero", e.target.value)} placeholder="Nº" />
                    </div>
                  </div>
                  <div className="fr">
                    <div className="fg">
                      <label className="fl">Complemento</label>
                      <input className="fc" value={form.complemento} onChange={e => F("complemento", e.target.value)} placeholder="Sala, apto, bloco..." />
                    </div>
                    <div className="fg">
                      <label className="fl">Bairro</label>
                      <input className="fc" value={form.bairro} onChange={e => F("bairro", e.target.value)} placeholder="Bairro" />
                    </div>
                  </div>
                  <div className="fr">
                    <div className="fg">
                      <label className="fl">Cidade</label>
                      <input className="fc" value={form.cidade} onChange={e => F("cidade", e.target.value)} placeholder="Cidade" />
                    </div>
                    <div className="fg" style={{ maxWidth:"80px" }}>
                      <label className="fl">UF</label>
                      <input className="fc" value={form.uf} onChange={e => F("uf", e.target.value.toUpperCase().slice(0,2))} placeholder="MG" maxLength={2} />
                    </div>
                    <div className="fg">
                      <label className="fl">Cód. IBGE</label>
                      <input className="fc" value={form.cod_ibge} onChange={e => F("cod_ibge", e.target.value)} placeholder="Preenchido auto via CEP" inputMode="numeric" />
                    </div>
                  </div>
                  <div style={{ fontSize:"11px", color:"var(--t3)", background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px" }}>
                    💡 Digite o CEP e saia do campo — o endereço é preenchido automaticamente via ViaCEP.
                  </div>
                </div>
              )}

              {aba === "fiscal" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
                  <div className="fr">
                    <div className="fg">
                      <label className="fl">Inscrição Estadual (IE)</label>
                      <input className="fc" value={form.ie} onChange={e => F("ie", maskIE(e.target.value))} placeholder="000.000.000/0000" maxLength={17} inputMode="numeric" />
                    </div>
                    <div className="fg">
                      <label className="fl">Indicador IE *</label>
                      <select className="fc" value={form.ind_ie} onChange={e => F("ind_ie", e.target.value)}>
                        <option value="1">1 — Contribuinte ICMS</option>
                        <option value="2">2 — Contribuinte Isento</option>
                        <option value="9">9 — Não Contribuinte</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ background:"var(--surf2)", border:"1px solid var(--b1)", borderRadius:"10px", padding:"14px 16px" }}>
                    <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:"0.06em", marginBottom:"12px" }}>FINALIDADE DA OPERAÇÃO</div>
                    <div style={{ display:"flex", gap:"24px" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer", fontSize:"13px", color:"var(--t1)" }}>
                        <input type="radio" name="consumidor" checked={form.consumidor_final === false} onChange={() => F("consumidor_final", false)} style={{ accentColor:"var(--acc)" }} />
                        Revenda / Indústria
                      </label>
                      <label style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer", fontSize:"13px", color:"var(--t1)" }}>
                        <input type="radio" name="consumidor" checked={form.consumidor_final === true} onChange={() => F("consumidor_final", true)} style={{ accentColor:"var(--acc)" }} />
                        Consumidor Final
                      </label>
                    </div>
                    <div style={{ fontSize:"11px", color:"var(--t3)", marginTop:"8px" }}>
                      Consumidor final = pessoa física ou empresa que não revende o produto.
                    </div>
                  </div>

                  <div className="fg">
                    <label className="fl">Observações padrão na NF-e</label>
                    <textarea className="fc" value={form.obs_nfe} onChange={e => F("obs_nfe", e.target.value)} placeholder="Texto que aparece no campo de observações de todas as NF-e deste cliente" rows={3} style={{ resize:"vertical" }} />
                  </div>

                  <div style={{ background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)", borderRadius:"8px", padding:"10px 14px", fontSize:"12px", color:"var(--warn)" }}>
                    ⚠ Indicador IE e Consumidor Final impactam diretamente o XML da NF-e.
                  </div>
                </div>
              )}
            </div>

            <div style={{ display:"flex", gap:"8px", justifyContent:"space-between", padding:"16px 20px", borderTop:"1px solid var(--b1)", flexShrink:0 }}>
              <div style={{ display:"flex", gap:"6px" }}>
                {(["geral","endereco","fiscal"] as const).map((a) => (
                  <button key={a} onClick={() => setAba(a)} style={{ width:"8px", height:"8px", borderRadius:"50%", border:"none", cursor:"pointer", background: aba === a ? "var(--acc)" : "var(--surf3)" }} />
                ))}
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn bp" onClick={salvar} disabled={salvando || !form.nome.trim()}>
                  {salvando ? "Salvando..." : "Salvar Cliente"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}