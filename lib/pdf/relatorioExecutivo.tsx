import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate, formatBRL } from "@/lib/formatters";

const AZUL = "#2d5fa6";
const VERDE = "#3d8c5c";
const VERMELHO = "#b23b3b";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#1a1a2e", fontFamily: "Helvetica" },
  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    borderBottomWidth: 3, borderBottomColor: AZUL, paddingBottom: 12, marginBottom: 18,
  },
  logo: { fontSize: 22, fontWeight: 700, color: AZUL },
  empresaInfo: { fontSize: 8, color: "#444", marginTop: 2 },
  tituloDoc: { fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, textAlign: "right" },
  periodoTxt: { fontSize: 16, fontWeight: 700, color: AZUL, textAlign: "right" },
  emissao: { fontSize: 9, color: "#333", marginTop: 6, textAlign: "right" },

  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  kpiBox: { flex: 1, padding: 10, backgroundColor: "#f0f4ff", borderRadius: 6 },
  kpiLabel: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.5, color: "#555", marginBottom: 5 },
  kpiValor: { fontSize: 15, fontWeight: 700 },

  bloco: { padding: 12, backgroundColor: "#f7f7f9", borderRadius: 6, marginBottom: 14 },
  blocoTitulo: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, color: AZUL },
  linha: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  label: { fontSize: 9, color: "#333" },
  valor: { fontSize: 9, fontWeight: 700, color: "#1a1a2e" },

  projRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  projBox: { flex: 1, padding: 10, backgroundColor: "#f7f7f9", borderRadius: 6, alignItems: "center" },
  projDias: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.5, color: "#555", marginBottom: 5 },
  projValor: { fontSize: 12, fontWeight: 700 },

  footer: { borderTopWidth: 2, borderTopColor: AZUL, paddingTop: 8, marginTop: 12 },
  footerTexto: { fontSize: 7, color: "#333" },
});

function cor(v: number) { return v >= 0 ? VERDE : VERMELHO; }

export interface RelatorioExecutivoDados {
  periodoLabel: string;
  saldoCaixa: number;
  aReceber: number;
  aPagar: number;
  receita: number;
  despesasTotal: number;
  resultado: number;
  despesasPorCategoria: { categoria: string; valor: number }[];
  projecao: { dias: number; saldo: number }[];
}

export function RelatorioExecutivoDocument({ dados }: { dados: RelatorioExecutivoDados }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.logo}>urbanglass</Text>
            <Text style={styles.empresaInfo}>Urban Glass Comércio Ltda</Text>
            <Text style={styles.empresaInfo}>CNPJ: 65.668.970/0001-05</Text>
            <Text style={styles.empresaInfo}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</Text>
          </View>
          <View>
            <Text style={styles.tituloDoc}>Relatório Executivo Financeiro</Text>
            <Text style={styles.periodoTxt}>{dados.periodoLabel}</Text>
            <Text style={styles.emissao}>Emitido em {formatDate(new Date().toISOString())}</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Saldo em Caixa</Text>
            <Text style={[styles.kpiValor, { color: cor(dados.saldoCaixa) }]}>{formatBRL(dados.saldoCaixa)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>A Receber (aberto)</Text>
            <Text style={styles.kpiValor}>{formatBRL(dados.aReceber)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>A Pagar (aberto)</Text>
            <Text style={styles.kpiValor}>{formatBRL(dados.aPagar)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Resultado do Período</Text>
            <Text style={[styles.kpiValor, { color: cor(dados.resultado) }]}>{formatBRL(dados.resultado)}</Text>
          </View>
        </View>

        <View style={styles.bloco}>
          <Text style={styles.blocoTitulo}>Resultado · Regime de Caixa (dinheiro que efetivamente movimentou)</Text>
          <View style={styles.linha}>
            <Text style={styles.label}>Receita recebida no período</Text>
            <Text style={styles.valor}>{formatBRL(dados.receita)}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.label}>Despesas pagas no período</Text>
            <Text style={styles.valor}>{formatBRL(dados.despesasTotal)}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.label}>Resultado</Text>
            <Text style={[styles.valor, { color: cor(dados.resultado) }]}>{formatBRL(dados.resultado)}</Text>
          </View>
        </View>

        {dados.despesasPorCategoria.length > 0 && (
          <View style={styles.bloco}>
            <Text style={styles.blocoTitulo}>Despesas por Categoria</Text>
            {dados.despesasPorCategoria.map(d => (
              <View style={styles.linha} key={d.categoria}>
                <Text style={styles.label}>{d.categoria}</Text>
                <Text style={styles.valor}>{formatBRL(d.valor)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.blocoTitulo}>Projeção de Caixa</Text>
        <View style={styles.projRow}>
          {dados.projecao.map(p => (
            <View style={styles.projBox} key={p.dias}>
              <Text style={styles.projDias}>Em {p.dias} dias</Text>
              <Text style={[styles.projValor, { color: cor(p.saldo) }]}>{formatBRL(p.saldo)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTexto}>
            Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG
          </Text>
          <Text style={[styles.footerTexto, { marginTop: 2 }]}>
            Números auditáveis em Contas a Pagar/Receber e Fluxo de Caixa — não são estimativa estatística.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
