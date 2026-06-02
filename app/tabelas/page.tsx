"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { TabelaPreco } from "@/types";

const VAZIO = {
  nome: "", tipo: "", lam: 110.20, ref: 160, ver: 130,
  lap: 8.50, fur: 12, min: 50, desco: 0, ativo: true,
};

export default function TabelasPage() {
  const [tabelas, setTabelas] = useState<TabelaPreco[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [editId, setEditId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("tabelas_preco").select("*").order("id");
    setTabelas(data as TabelaPreco[] || []);
    setLoading(false);
  }

  function abrirNovo() { setForm(VAZIO); setEditId(null); setModal(true); }

  function abrirEdit(t: TabelaPreco) {
    setForm({
      nome: t.nome, tipo: t.tipo, lam: t.lam, ref: t.ref, ver: t.ver,
      lap: t.lap, fur: t.fur, min: t.min, desco: (t as any).desco ?? 0, ativo: t.ativo,
    });
    setEditId(t.id);
    setModal(true);
  }

  async function salvar() {
    if (!form.nome) return;
    setSalvando(true);
    if (editId) {
      await supabase.from("tabelas_preco").update(form as never).eq("id", editId);
    } else {
      await supabase.from("tabelas_preco").insert([form as never]);
    }
    setSalvando(false); setModal(false); load();
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Tabelas de Preço</div>
        <button className="btn bp sm" onClick={abrirNovo}>+ Nova Tabela</button>
      </div>

      <div className="con">
        {loading ? (
          <div className="loading">Carregando tabelas...</div>
        ) : (
          <>
            <div className="g3 mb14">
              {tabelas.map(t => (
                <div key={t.id} className="card">
                  <div className="ct">
                    {t.nome}
                    <span className={`chip ${t.ativo ? "cg" : "cr"}`}>{t.ativo ? "Ativa" : "Inativa"}</span>
                  </div>
                  <div className="sr"><div className="sl">Laminado</div><div className="sv" style={{ color:"var(--acc)" }}>{formatBRL(t.lam)}/m²</div></div>
                  <div className="sr"><div className="sl">Reflecta</div><div className="sv" style={{ color:"var(--acc)" }}>{formatBRL(t.ref)}/m²</div></div>
                  <div className="sr"><div className="sl">Verde</div><div className="sv" style={{ color:"var(--acc)" }}>{formatBRL(t.ver)}/m²</div></div>
                  <div className="sr"><div className="sl">Lapidação</div><div className="sv">{formatBRL(t.lap)}/m²</div></div>
                  <div className="sr"><div className="sl">Furo</div><div className="sv">{formatBRL(t.fur)}/un</div></div>
                  <div className="sr"><div className="sl">Mínimo</div><div className="sv">{formatBRL(t.min)}</div></div>
                  <div className="sr"><div className="sl">Desconto</div><div className="sv">{(t as any).desco ?? 0}%</div></div>
                  <button className="btn bg sm" style={{ width:"100%", marginTop:"10px" }} onClick={() => abrirEdit(t)}>Editar Tabela</button>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="ct">Comparativo de Tabelas</div>
              <div className="tw" style={{ border:"none", borderRadius:0 }}>
                <table>
                  <thead>
                    <tr><th>Tabela</th><th>Laminado/m²</th><th>Reflecta/m²</th><th>Verde/m²</th><th>Lapidação/m²</th><th>Furo/un</th><th>Mínimo</th><th>Desconto</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {tabelas.map(t => (
                      <tr key={t.id}>
                        <td><strong>{t.nome}</strong></td>
                        <td className="mono" style={{ color:"var(--acc)" }}>{formatBRL(t.lam)}</td>
                        <td className="mono" style={{ color:"var(--acc)" }}>{formatBRL(t.ref)}</td>
                        <td className="mono" style={{ color:"var(--acc)" }}>{formatBRL(t.ver)}</td>
                        <td className="mono">{formatBRL(t.lap)}</td>
                        <td className="mono">{formatBRL(t.fur)}</td>
                        <td className="mono">{formatBRL(t.min)}</td>
                        <td className="mono">{(t as any).desco ?? 0}%</td>
                        <td><span className={t.ativo ? "chip cg" : "chip cr"}>{t.ativo ? "Ativa" : "Inativa"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="mov open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="mod" style={{ width:"520px" }}>
            <div className="mhd">
              <div className="mtit">{editId ? "Editar Tabela" : "Nova Tabela"}</div>
              <button className="mcl" onClick={() => setModal(false)}>✕</button>
            </div>

            <div className="fr mb14" style={{ marginBottom:"10px" }}>
              <div className="fg">
                <label className="fl">Nome *</label>
                <input className="fc" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Padrão" />
              </div>
              <div className="fg">
                <label className="fl">Tipo</label>
                <select className="fc" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="">Selecione...</option>
                  <option>Padrão</option>
                  <option>Grandes Clientes</option>
                  <option>Promocional</option>
                </select>
              </div>
            </div>

            <div className="fr3">
              <div className="fg"><label className="fl">Laminado (R$/m²)</label><CurrencyInput value={form.lam} onChange={v => setForm(f => ({ ...f, lam: v }))} /></div>
              <div className="fg"><label className="fl">Reflecta (R$/m²)</label><CurrencyInput value={form.ref} onChange={v => setForm(f => ({ ...f, ref: v }))} /></div>
              <div className="fg"><label className="fl">Verde (R$/m²)</label><CurrencyInput value={form.ver} onChange={v => setForm(f => ({ ...f, ver: v }))} /></div>
            </div>

            <div className="fr3">
              <div className="fg"><label className="fl">Lapidação (R$/m²)</label><CurrencyInput value={form.lap} onChange={v => setForm(f => ({ ...f, lap: v }))} /></div>
              <div className="fg"><label className="fl">Furo (R$/un)</label><CurrencyInput value={form.fur} onChange={v => setForm(f => ({ ...f, fur: v }))} /></div>
              <div className="fg"><label className="fl">Mínimo (R$)</label><CurrencyInput value={form.min} onChange={v => setForm(f => ({ ...f, min: v }))} /></div>
            </div>

            <div className="fr" style={{ marginBottom:"14px" }}>
              <div className="fg">
                <label className="fl">Desconto (%)</label>
                <input className="fc" type="number" min="0" max="100" step="0.5" value={form.desco || ""} onChange={e => setForm(f => ({ ...f, desco: parseFloat(e.target.value) || 0 }))} placeholder="0" />
              </div>
              <div className="fg">
                <label className="fl">Status</label>
                <select className="fc" value={form.ativo ? "1" : "0"} onChange={e => setForm(f => ({ ...f, ativo: e.target.value === "1" }))}>
                  <option value="1">Ativa</option>
                  <option value="0">Inativa</option>
                </select>
              </div>
            </div>

            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button className="btn bg" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar Tabela"}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}