"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getFornecedores, createFornecedor, updateFornecedor, deletarFornecedor } from "@/services/fornecedores.service";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import SearchInput from "@/components/ui/SearchInput";
import type { Fornecedor, FornecedorInsert } from "@/types";

const VAZIO: FornecedorInsert = {
  nome: "", cnpj: "", tel: "", email: "", contato: "",
  cidade: "", uf: "", categoria: "", obs: "", ativo: true,
};

export default function FornecedoresPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FornecedorInsert>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setFornecedores(await getFornecedores());
    setLoading(false);
  }

  function abrirNovo() {
    setEditId(null);
    setForm(VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(f: Fornecedor) {
    setEditId(f.id);
    setForm({
      nome: f.nome, cnpj: f.cnpj, tel: f.tel, email: f.email, contato: f.contato,
      cidade: f.cidade, uf: f.uf, categoria: f.categoria, obs: f.obs, ativo: f.ativo,
    });
    setModalAberto(true);
  }

  function upd<K extends keyof FornecedorInsert>(campo: K, valor: FornecedorInsert[K]) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  async function salvar() {
    if (!form.nome.trim()) { toast("Informe o nome do fornecedor", "err"); return; }
    setSalvando(true);
    const res = editId != null
      ? await updateFornecedor(editId, form)
      : await createFornecedor(form);
    setSalvando(false);
    if (res) {
      toast(editId != null ? "Fornecedor atualizado" : "Fornecedor criado");
      setModalAberto(false);
      load();
    } else {
      toast("Erro ao salvar fornecedor", "err");
    }
  }

  async function handleDeletar(f: Fornecedor) {
    if (!(await confirm(`Excluir o fornecedor ${f.nome}?`, { perigo: true }))) return;
    const ok = await deletarFornecedor(f.id);
    if (ok) { toast("Fornecedor excluído"); load(); }
    else toast("Erro ao excluir fornecedor", "err");
  }

  async function toggleAtivo(f: Fornecedor) {
    const res = await updateFornecedor(f.id, { ativo: !f.ativo });
    if (res) load();
  }

  const filtrados = fornecedores.filter(f =>
    !busca ||
    f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    f.categoria.toLowerCase().includes(busca.toLowerCase()) ||
    f.cidade.toLowerCase().includes(busca.toLowerCase())
  );

  const totalAtivos = fornecedores.filter(f => f.ativo).length;

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Fornecedores</div>
        <SearchInput placeholder="Buscar por nome, categoria ou cidade..." value={busca} onChange={setBusca} />
        <button className="btn bp sm" onClick={abrirNovo}>+ Novo Fornecedor</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando fornecedores...</div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>Cidade/UF</th>
                  <th>Status</th>
                  <th style={{ width:"80px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign:"center", color:"var(--t3)", padding:"32px" }}>
                      Nenhum fornecedor encontrado
                    </td>
                  </tr>
                )}
                {filtrados.map(f => (
                  <tr key={f.id} style={{ cursor:"pointer" }} onClick={() => abrirEdicao(f)}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--surf2)"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                  >
                    <td><strong>{f.nome}</strong>{f.cnpj && <div className="tdim">{f.cnpj}</div>}</td>
                    <td>{f.categoria || "—"}</td>
                    <td>{f.contato || "—"}{f.email && <div className="tdim">{f.email}</div>}</td>
                    <td className="mono">{f.tel || "—"}</td>
                    <td>{f.cidade || "—"}{f.uf && ` / ${f.uf}`}</td>
                    <td>
                      <button
                        onClick={e => { e.stopPropagation(); toggleAtivo(f); }}
                        className={f.ativo ? "chip cg" : "chip cgr"}
                        style={{ border:"none", cursor:"pointer" }}
                        title="Alternar ativo/inativo"
                      >{f.ativo ? "Ativo" : "Inativo"}</button>
                    </td>
                    <td style={{ textAlign:"center" }}>
                      <button
                        title="Excluir fornecedor"
                        onClick={e => { e.stopPropagation(); handleDeletar(f); }}
                        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"28px", height:"28px", borderRadius:"6px", background:"transparent", border:"1px solid var(--b2)", color:"var(--t3)", fontSize:"13px", cursor:"pointer", transition:"all 0.15s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(244,63,94,.15)"; b.style.borderColor = "var(--err)"; b.style.color = "var(--err)"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "var(--b2)"; b.style.color = "var(--t3)"; }}
                      >🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalAberto && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModalAberto(false)}>
          <div className="mod" style={{ width:"560px" }}>
            <div className="mhd">
              <div className="mtit">{editId != null ? "Editar" : "Novo"} fornecedor</div>
              <button className="mcl" onClick={() => setModalAberto(false)} aria-label="Fechar">✕</button>
            </div>

            <div style={{ padding:"20px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
              <Campo label="Nome *" span2>
                <input className="fc" value={form.nome} onChange={e => upd("nome", e.target.value)} style={{ margin:0 }} />
              </Campo>
              <Campo label="CNPJ / CPF">
                <input className="fc" value={form.cnpj} onChange={e => upd("cnpj", e.target.value)} style={{ margin:0 }} />
              </Campo>
              <Campo label="Categoria">
                <input className="fc" placeholder="Vidro, ferragem, insumo..." value={form.categoria} onChange={e => upd("categoria", e.target.value)} style={{ margin:0 }} />
              </Campo>
              <Campo label="Pessoa de contato">
                <input className="fc" value={form.contato} onChange={e => upd("contato", e.target.value)} style={{ margin:0 }} />
              </Campo>
              <Campo label="Telefone">
                <input className="fc" value={form.tel} onChange={e => upd("tel", e.target.value)} style={{ margin:0 }} />
              </Campo>
              <Campo label="E-mail" span2>
                <input className="fc" value={form.email} onChange={e => upd("email", e.target.value)} style={{ margin:0 }} />
              </Campo>
              <Campo label="Cidade">
                <input className="fc" value={form.cidade} onChange={e => upd("cidade", e.target.value)} style={{ margin:0 }} />
              </Campo>
              <Campo label="UF">
                <input className="fc" maxLength={2} value={form.uf} onChange={e => upd("uf", e.target.value.toUpperCase())} style={{ margin:0 }} />
              </Campo>
              <Campo label="Observações" span2>
                <textarea className="fc" rows={2} value={form.obs} onChange={e => upd("obs", e.target.value)} style={{ margin:0, resize:"vertical" }} />
              </Campo>
            </div>

            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", padding:"16px 20px", borderTop:"1px solid var(--b1)" }}>
              <button className="btn bg" onClick={() => setModalAberto(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : editId != null ? "Salvar alterações" : "Criar fornecedor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function Campo({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"6px", gridColumn: span2 ? "1 / -1" : undefined }}>
      <label style={{ fontSize:"12px", color:"var(--t3)", fontWeight:600 }}>{label}</label>
      {children}
    </div>
  );
}
