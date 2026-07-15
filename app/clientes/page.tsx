"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getClientes, createCliente, updateCliente, deletarCliente } from "@/services/clientes.service";
import { getFinanceiroClientes } from "@/services/financeiro.service";
import { formatBRL } from "@/lib/formatters";
import SearchInput from "@/components/ui/SearchInput";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
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

async function buscarCnpjApi(cnpj: string): Promise<{ data: any; notFound: boolean } | null> {
  const raw = cnpj.replace(/\D/g, "");
  if (raw.length !== 14) return null;

  // Tenta BrasilAPI primeiro
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
    if (res.status === 404) return { data: null, notFound: true };
    if (res.ok) return { data: await res.json(), notFound: false };
    // rate-limit ou erro de servidor → tenta fallback abaixo
  } catch { /* fallback */ }

  // Fallback: ReceitaWS
  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${raw}`);
    if (!res.ok) return null;
    const d = await res.json();
    if (d.status === "ERROR") return { data: null, notFound: true };
    // Normaliza para o mesmo formato do BrasilAPI
    return {
      data: {
        razao_social:            d.nome,
        logradouro:              d.logradouro,
        numero:                  d.numero,
        complemento:             d.complemento,
        bairro:                  d.bairro,
        municipio:               d.municipio,
        uf:                      d.uf,
        cep:                     d.cep,
        ddd_telefone_1:          (d.telefone ?? "").replace(/\D/g, ""),
        email:                   d.email,
        codigo_municipio_ibge:   null,
      },
      notFound: false,
    };
  } catch { return null; }
}

export default function ClientesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
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
  const [cnpjStatus, setCnpjStatus]     = useState<"" | "ok" | "err" | "offline">("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [clis, fin] = await Promise.all([getClientes(), getFinanceiroClientes()]);
    setClientes(clis);
    setFinanceiro(fin);
    setLoading(false);
  }

  function finDe(id: number) { return financeiro.find(f => f.cliente_id === id) ?? null; }

  async function toggleBloqueioCredito(c: Cliente) {
    const bloquear = !c.bloqueado_credito;
    const res = await updateCliente(c.id, { bloqueado_credito: bloquear, bloqueado_credito_em: bloquear ? new Date().toISOString() : null });
    if (res) load();
  }

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
    const raw = masked.replace(/\D/g, "");

    if (cnpjStatus === "ok" && raw.length < 14) {
      setCnpjStatus("");
      setForm((f: any) => ({
        ...f,
        nome: "", logradouro: "", numero: "", complemento: "",
        bairro: "", cidade: "", uf: "", cep: "", cod_ibge: "",
        tel: "", email: "",
      }));
      return;
    }

    setCnpjStatus("");
    if (raw.length !== 14) return;
    setBuscandoCnpj(true);
    const result = await buscarCnpjApi(raw);
    setBuscandoCnpj(false);
    if (!result) { setCnpjStatus("offline"); return; }
    if (result.notFound) { setCnpjStatus("err"); return; }
    setCnpjStatus("ok");

    const d = result.data;
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
    if (!form.nome.trim()) { toast("Preencha o nome", "err"); return; }
    const doc = form.tipo_pessoa === "PF" ? form.cpf : form.cnpj;
    if (!doc || doc.replace(/\D/g, "").length === 0) {
      toast(`Preencha o ${form.tipo_pessoa === "PF" ? "CPF" : "CNPJ"}`, "err");
      return;
    }
    setSalvando(true);
    if (editId) { await updateCliente(editId, form); } else { await createCliente(form); }
    setSalvando(false); setModal(false); load();
  }

  async function handleDeletar(c: Cliente) {
    if (!(await confirm(`Excluir "${c.nome}" permanentemente?`, { perigo: true }))) return;
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
        <div className="g3 mb14">
          <div className="kpi">
            <div className="kpi-l">Faturado Total</div>
            <div className="kpi-v" style={{ color:"var(--acc)" }}>{formatBRL(totalFaturado)}</div>
            <div className="kpi-s up">{clientes.length} clientes cadastrados</div>
            <div className="kpi-bar" style={{ background:"var(--acc)", width:"65%" }} />
          </div>
          <div className="kpi">
            <div className="kpi-l">A Receber</div>
            <div className="kpi-v" style={{ color: totalAReceber > 0 ? "var(--warn)" : "var(--ok)" }}>{formatBRL(totalAReceber)}</div>
            <div className="kpi-s">saldo em aberto</div>
            <div className="kpi-bar" style={{ background: totalAReceber > 0 ? "var(--warn)" : "var(--ok)", width:"45%" }} />
          </div>
          <div className="kpi">
            <div className="kpi-l">Inadimplentes</div>
            <div className="kpi-v" style={{ color: totalInadimplentes > 0 ? "var(--err)" : "var(--ok)" }}>{totalInadimplentes}</div>
            <div className={`kpi-s ${totalInadimplentes > 0 ? "dn" : ""}`}>
              {totalInadimplentes > 0 ? "sem nenhum pagamento" : "sem inadimplencia"}
            </div>
            <div className="kpi-bar" style={{ background: totalInadimplentes > 0 ? "var(--err)" : "var(--ok)", width: totalInadimplentes > 0 ? "55%" : "5%" }} />
          </div>
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
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/clientes/${c.id}`)}
                      style={{ cursor:"pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                    >
                      <td>
                        <strong>{c.nome}</strong>
                        {c.email && <div className="tdim">{c.email}</div>}
                        {!c.ativo && <span className="chip cr" style={{ fontSize:"9px", marginTop:"2px" }}>Inativo</span>}
                        {c.bloqueado_credito && <span className="chip cr" style={{ fontSize:"9px", marginTop:"2px" }} title="Crédito bloqueado">⛔ Crédito bloqueado</span>}
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
                          <a href={`/clientes/${c.id}`} className="btn bg xs" onClick={e => e.stopPropagation()}>Ver</a>
                          <button className="btn bg xs" onClick={e => { e.stopPropagation(); abrirEdit(c); }}>Editar</button>
                          <button className="btn bg xs" style={{ color: c.bloqueado_credito ? "var(--ok)" : "var(--err)" }}
                            onClick={e => { e.stopPropagation(); toggleBloqueioCredito(c); }}>
                            {c.bloqueado_credito ? "Desbloquear" : "Bloquear crédito"}
                          </button>
                        </div>
                      </td>
                      <td style={{ width:"40px", textAlign:"center" }}>
                        <button
                          title="Excluir"
                          onClick={e => { e.stopPropagation(); handleDeletar(c); }}
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

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar Cliente" : "Novo Cliente"} width="600px" style={{ maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
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
                    <Campo label="Tipo de Pessoa *">
                      <select name="tipo_pessoa" className="fc" value={form.tipo_pessoa} onChange={e => { F("tipo_pessoa", e.target.value); setCnpjStatus(""); }}>
                        <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                        <option value="PF">Pessoa Física (CPF)</option>
                      </select>
                    </Campo>
                    <Campo label="Status">
                      <select name="ativo" className="fc" value={form.ativo ? "1" : "0"} onChange={e => F("ativo", e.target.value === "1")}>
                        <option value="1">Ativo</option>
                        <option value="0">Inativo</option>
                      </select>
                    </Campo>
                  </div>

                  {/* CNPJ / CPF — primeiro campo para busca automática */}
                  <div className="fr">
                    {form.tipo_pessoa === "PJ" ? (
                      <Campo
                        labelStyle={{ display:"flex", alignItems:"center", gap:"6px" }}
                        label={<>
                          CNPJ *
                          {buscandoCnpj && <span style={{ fontSize:"10px", color:"var(--acc)", fontWeight:500 }}>buscando...</span>}
                          {!buscandoCnpj && cnpjStatus === "ok"      && <span style={{ fontSize:"10px", color:"var(--ok)",   fontWeight:600 }}>✓ dados preenchidos</span>}
                          {!buscandoCnpj && cnpjStatus === "err"     && <span style={{ fontSize:"10px", color:"var(--warn)", fontWeight:600 }}>CNPJ não encontrado</span>}
                          {!buscandoCnpj && cnpjStatus === "offline" && <span style={{ fontSize:"10px", color:"var(--warn)", fontWeight:600 }}>serviço indisponível, tente novamente</span>}
                        </>}
                      >
                        <input name="cnpj" className="fc" value={form.cnpj} onChange={e => handleCnpjChange(maskCNPJ(e.target.value))} placeholder="00.000.000/0001-00" maxLength={18} inputMode="numeric" autoFocus />
                      </Campo>
                    ) : (
                      <Campo label="CPF *">
                        <input name="cpf" className="fc" value={form.cpf} onChange={e => F("cpf", maskCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} inputMode="numeric" autoFocus />
                      </Campo>
                    )}
                    <Campo label="Telefone da Empresa">
                      <input name="tel" className="fc" value={form.tel} onChange={e => F("tel", maskTel(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} inputMode="numeric" />
                    </Campo>
                  </div>

                  {/* Aviso de busca automática — só para PJ sem resultado ainda */}
                  {form.tipo_pessoa === "PJ" && cnpjStatus === "" && form.cnpj.replace(/\D/g, "").length < 14 && (
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"10px 14px", background:"rgba(99,102,241,.07)", border:"1px solid rgba(99,102,241,.2)", borderRadius:"8px" }}>
                      <span style={{ fontSize:"15px" }}>💡</span>
                      <span style={{ fontSize:"12px", color:"var(--t2)" }}>Preencha o CNPJ acima para buscar automaticamente razão social, endereço, telefone e e-mail da empresa.</span>
                    </div>
                  )}

                  <Campo label="Nome / Razão Social *">
                    <input name="nome" className="fc" value={form.nome} onChange={e => F("nome", e.target.value)} placeholder="Nome ou razão social" />
                  </Campo>

                  {/* Responsável */}
                  <div className="fr">
                    <Campo label="Nome do Responsável">
                      <input name="responsavel" className="fc" value={form.responsavel ?? ""} onChange={e => F("responsavel", e.target.value)} placeholder="Nome do contato / responsável" />
                    </Campo>
                    <Campo label="Telefone do Responsável">
                      <input name="tel_responsavel" className="fc" value={form.tel_responsavel ?? ""} onChange={e => F("tel_responsavel", maskTel(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} inputMode="numeric" />
                    </Campo>
                  </div>

                  <Campo label="E-mail">
                    <input name="email" className="fc" value={form.email} onChange={e => F("email", e.target.value)} placeholder="email@empresa.com" inputMode="email" />
                  </Campo>

                  <div className="fr">
                    <Campo label="Forma de Pagamento">
                      <select name="pgto" className="fc" value={form.pgto} onChange={e => F("pgto", e.target.value)}>
                        <option value="">Selecione...</option>
                        <option>Dinheiro</option><option>PIX</option><option>Boleto</option>
                        <option>Cartão</option><option>Cheque</option><option>A Prazo</option>
                      </select>
                    </Campo>
                    <Campo label="Tabela de Preço">
                      <select name="tabela" className="fc" value={form.tabela} onChange={e => F("tabela", e.target.value)}>
                        <option value="p">Padrão</option>
                        <option value="g">Grandes Clientes</option>
                      </select>
                    </Campo>
                  </div>
                </div>
              )}

              {aba === "endereco" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                  <div className="fr">
                    <Campo style={{ maxWidth:"160px" }} label={<>CEP {buscandoCep && <span style={{ color:"var(--acc)", fontSize:"10px" }}>buscando...</span>}</>}>
                      <input name="cep" className="fc" value={form.cep} onChange={e => F("cep", maskCEP(e.target.value))} onBlur={handleCepBlur} placeholder="00000-000" maxLength={9} inputMode="numeric" />
                    </Campo>
                    <Campo label="Logradouro">
                      <input name="logradouro" className="fc" value={form.logradouro} onChange={e => F("logradouro", e.target.value)} placeholder="Rua, Av., Travessa..." />
                    </Campo>
                    <Campo style={{ maxWidth:"100px" }} label="Número">
                      <input name="numero" className="fc" value={form.numero} onChange={e => F("numero", e.target.value)} placeholder="Nº" />
                    </Campo>
                  </div>
                  <div className="fr">
                    <Campo label="Complemento">
                      <input name="complemento" className="fc" value={form.complemento} onChange={e => F("complemento", e.target.value)} placeholder="Sala, apto, bloco..." />
                    </Campo>
                    <Campo label="Bairro">
                      <input name="bairro" className="fc" value={form.bairro} onChange={e => F("bairro", e.target.value)} placeholder="Bairro" />
                    </Campo>
                  </div>
                  <div className="fr">
                    <Campo label="Cidade">
                      <input name="cidade" className="fc" value={form.cidade} onChange={e => F("cidade", e.target.value)} placeholder="Cidade" />
                    </Campo>
                    <Campo style={{ maxWidth:"80px" }} label="UF">
                      <input name="uf" className="fc" value={form.uf} onChange={e => F("uf", e.target.value.toUpperCase().slice(0,2))} placeholder="MG" maxLength={2} />
                    </Campo>
                    <Campo label="Cód. IBGE">
                      <input name="cod_ibge" className="fc" value={form.cod_ibge} onChange={e => F("cod_ibge", e.target.value)} placeholder="Preenchido auto via CEP" inputMode="numeric" />
                    </Campo>
                  </div>
                  <div style={{ fontSize:"11px", color:"var(--t3)", background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px" }}>
                    💡 Digite o CEP e saia do campo — o endereço é preenchido automaticamente via ViaCEP.
                  </div>
                </div>
              )}

              {aba === "fiscal" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
                  <div className="fr">
                    <Campo label="Inscrição Estadual (IE)">
                      <input name="ie" className="fc" value={form.ie} onChange={e => F("ie", maskIE(e.target.value))} placeholder="000.000.000/0000" maxLength={17} inputMode="numeric" />
                    </Campo>
                    <Campo label="Indicador IE *">
                      <select name="ind_ie" className="fc" value={form.ind_ie} onChange={e => F("ind_ie", e.target.value)}>
                        <option value="1">1 — Contribuinte ICMS</option>
                        <option value="2">2 — Contribuinte Isento</option>
                        <option value="9">9 — Não Contribuinte</option>
                      </select>
                    </Campo>
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

                  <Campo label="Observações padrão na NF-e">
                    <textarea name="obs_nfe" className="fc" value={form.obs_nfe} onChange={e => F("obs_nfe", e.target.value)} placeholder="Texto que aparece no campo de observações de todas as NF-e deste cliente" rows={3} style={{ resize:"vertical" }} />
                  </Campo>

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
                <button className="btn bp" onClick={salvar} disabled={salvando || !form.nome.trim() || !(form.tipo_pessoa === "PF" ? form.cpf : form.cnpj)?.replace(/\D/g, "")}>
                  {salvando ? "Salvando..." : "Salvar Cliente"}
                </button>
              </div>
            </div>
      </Modal>
    </AppLayout>
  );
}