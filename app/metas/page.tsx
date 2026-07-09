"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getMetas, salvarMeta } from "@/services/metas.service";
import { useToast } from "@/components/ui/toast";
import { formatBRL } from "@/lib/formatters";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { MetaFinanceira } from "@/types";

const MESES_LONGO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function MetasPage() {
  const { toast } = useToast();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [metas, setMetas] = useState<MetaFinanceira[]>([]);
  const [valores, setValores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [salvandoCel, setSalvandoCel] = useState<string | null>(null);

  useEffect(() => { load(); }, [ano]);

  async function load() {
    setLoading(true);
    const lista = await getMetas(ano);
    setMetas(lista);
    const mapa: Record<string, number> = {};
    for (const m of lista) mapa[`${m.mes}-${m.tipo}`] = Number(m.valor_meta);
    setValores(mapa);
    setLoading(false);
  }

  function valorDe(mes: number, tipo: "Entrada" | "Saída"): number {
    return valores[`${mes}-${tipo}`] ?? 0;
  }

  // CurrencyInput dispara onChange a cada dígito — só guarda localmente
  // aqui. O salvamento de verdade só acontece no blur, em `confirmar`.
  function editarLocal(mes: number, tipo: "Entrada" | "Saída", valor: number) {
    setValores(prev => ({ ...prev, [`${mes}-${tipo}`]: valor }));
  }

  async function confirmar(mes: number, tipo: "Entrada" | "Saída") {
    const key = `${mes}-${tipo}`;
    const valor = valores[key] ?? 0;
    const original = metas.find(m => m.mes === mes && m.tipo === tipo)?.valor_meta ?? 0;
    if (valor <= 0 || Number(valor) === Number(original)) return;
    setSalvandoCel(key);
    const res = await salvarMeta({ ano, mes, tipo, valor_meta: valor });
    setSalvandoCel(null);
    if (res) {
      setMetas(prev => [...prev.filter(m => !(m.mes === mes && m.tipo === tipo)), res]);
    } else {
      toast("Erro ao salvar meta", "err");
    }
  }

  const metaAnualEntrada = metas.filter(m => m.tipo === "Entrada").reduce((a, m) => a + Number(m.valor_meta), 0);
  const metaAnualSaida = metas.filter(m => m.tipo === "Saída").reduce((a, m) => a + Number(m.valor_meta), 0);

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Metas Financeiras</div>
        <select className="fc" style={{ margin: 0, width: "110px" }} value={ano} onChange={e => setAno(Number(e.target.value))}>
          {[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="con">
        <div className="al al-i" style={{ marginBottom: 16, fontSize: 12 }}>
          Defina quanto espera faturar (Entrada) e gastar (Saída) por mês. O Dashboard Financeiro usa isso pra
          mostrar o quanto já foi realizado em relação à meta — mês sem meta definida simplesmente não mostra a barra.
        </div>

        <div className="g3" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-l">Meta Anual · Entrada</div>
            <div className="kpi-v" style={{ color: "var(--ok)" }}>{formatBRL(metaAnualEntrada)}</div>
            <div className="kpi-s">{metas.filter(m => m.tipo === "Entrada").length}/12 meses definidos</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Meta Anual · Saída</div>
            <div className="kpi-v" style={{ color: "var(--err)" }}>{formatBRL(metaAnualSaida)}</div>
            <div className="kpi-s">{metas.filter(m => m.tipo === "Saída").length}/12 meses definidos</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Resultado Planejado</div>
            <div className="kpi-v" style={{ color: metaAnualEntrada - metaAnualSaida >= 0 ? "var(--ok)" : "var(--err)" }}>
              {formatBRL(metaAnualEntrada - metaAnualSaida)}
            </div>
            <div className="kpi-s">Entrada − Saída, ano {ano}</div>
          </div>
        </div>

        {loading ? <div className="loading">Carregando...</div> : (
          <div className="tw">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thM}>Mês</th>
                  <th style={{ ...thM, color: "var(--ok)" }}>Meta Entrada</th>
                  <th style={{ ...thM, color: "var(--err)" }}>Meta Saída</th>
                </tr>
              </thead>
              <tbody>
                {MESES_LONGO.map((label, i) => {
                  const mes = i + 1;
                  return (
                    <tr key={mes} style={{ borderBottom: "1px solid var(--b1)" }}>
                      <td style={{ padding: "8px 10px", fontSize: 12.5, fontWeight: 600 }}>{label}</td>
                      <td style={{ padding: "6px 10px" }}>
                        <CurrencyInput
                          value={valorDe(mes, "Entrada")}
                          onChange={v => editarLocal(mes, "Entrada", v)}
                          onBlur={() => confirmar(mes, "Entrada")}
                          style={{ margin: 0, width: "160px" }}
                          disabled={salvandoCel === `${mes}-Entrada`}
                        />
                      </td>
                      <td style={{ padding: "6px 10px" }}>
                        <CurrencyInput
                          value={valorDe(mes, "Saída")}
                          onChange={v => editarLocal(mes, "Saída", v)}
                          onBlur={() => confirmar(mes, "Saída")}
                          style={{ margin: 0, width: "160px" }}
                          disabled={salvandoCel === `${mes}-Saída`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

const thM: React.CSSProperties = {
  padding: "7px 10px", fontSize: 9, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t3)",
  borderBottom: "1px solid var(--b1)", textAlign: "left", background: "var(--surf2)",
};
