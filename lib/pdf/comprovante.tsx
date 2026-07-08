import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate, formatBRL } from "@/lib/formatters";
import type { Lancamento, BaixaLancamento } from "@/types";

const AZUL = "#2d5fa6";
const VERDE = "#3d8c5c";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#1a1a2e", fontFamily: "Helvetica" },
  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    borderBottomWidth: 3, borderBottomColor: AZUL, paddingBottom: 12, marginBottom: 18,
  },
  logo: { fontSize: 22, fontWeight: 700, color: AZUL },
  empresaInfo: { fontSize: 8, color: "#444", marginTop: 2 },
  tituloDoc: { fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, textAlign: "right" },
  baixaId: { fontSize: 22, fontWeight: 700, color: AZUL, textAlign: "right" },
  emissao: { fontSize: 10, color: "#333", marginTop: 6, textAlign: "right" },

  bloco: { padding: 12, backgroundColor: "#f0f4ff", borderRadius: 6, marginBottom: 16 },
  blocoTitulo: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, color: AZUL },
  linha: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  label: { fontSize: 9, color: "#333" },
  valor: { fontSize: 9, fontWeight: 700, color: "#1a1a2e" },

  valorPagoBloco: {
    padding: 16, backgroundColor: "#eefaf1", borderRadius: 6, marginBottom: 16,
    alignItems: "center",
  },
  valorPagoLabel: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: VERDE, fontWeight: 700 },
  valorPagoNumero: { fontSize: 26, fontWeight: 700, color: VERDE, marginTop: 4 },

  footer: { borderTopWidth: 2, borderTopColor: AZUL, paddingTop: 8, marginTop: 12 },
  footerTexto: { fontSize: 7, color: "#333" },
});

export function ComprovanteDocument({ lancamento, baixa }: { lancamento: Lancamento; baixa: BaixaLancamento }) {
  const contraparte = lancamento.tipo === "Saída"
    ? (lancamento.fornecedor || "—")
    : (lancamento.clientes?.nome || "—");
  const jurosMulta = (baixa.valor_juros ?? 0) + (baixa.valor_multa ?? 0);
  const desconto = baixa.valor_desconto ?? 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.logo}>urbanglass</Text>
            <Text style={styles.empresaInfo}>Urban Glass Comércio Ltda</Text>
            <Text style={styles.empresaInfo}>CNPJ: 65.668.970/0001-05</Text>
            <Text style={styles.empresaInfo}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</Text>
            <Text style={styles.empresaInfo}>(32) 99986-0317</Text>
          </View>
          <View>
            <Text style={styles.tituloDoc}>Comprovante de {lancamento.tipo === "Saída" ? "Pagamento" : "Recebimento"}</Text>
            <Text style={styles.baixaId}>#{baixa.id}</Text>
            <Text style={styles.emissao}>Emissão: {formatDate(new Date().toISOString())}</Text>
          </View>
        </View>

        <View style={styles.bloco}>
          <Text style={styles.blocoTitulo}>Lançamento</Text>
          <View style={styles.linha}>
            <Text style={styles.label}>Descrição</Text>
            <Text style={styles.valor}>{lancamento.descricao}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.label}>{lancamento.tipo === "Saída" ? "Fornecedor" : "Cliente"}</Text>
            <Text style={styles.valor}>{contraparte}</Text>
          </View>
          {lancamento.documento && (
            <View style={styles.linha}>
              <Text style={styles.label}>Documento</Text>
              <Text style={styles.valor}>{lancamento.documento}</Text>
            </View>
          )}
          <View style={styles.linha}>
            <Text style={styles.label}>Valor do título</Text>
            <Text style={styles.valor}>{formatBRL(lancamento.valor)}</Text>
          </View>
        </View>

        <View style={styles.valorPagoBloco}>
          <Text style={styles.valorPagoLabel}>Valor {lancamento.tipo === "Saída" ? "pago" : "recebido"} nesta baixa</Text>
          <Text style={styles.valorPagoNumero}>{formatBRL(baixa.valor)}</Text>
        </View>

        <View style={styles.bloco}>
          <Text style={styles.blocoTitulo}>Detalhes da Baixa</Text>
          <View style={styles.linha}>
            <Text style={styles.label}>Data</Text>
            <Text style={styles.valor}>{formatDate(baixa.data)}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.label}>Conta</Text>
            <Text style={styles.valor}>{baixa.contas_bancarias?.nome ?? "—"}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.label}>Forma de pagamento</Text>
            <Text style={styles.valor}>{baixa.forma_pgto ?? "—"}</Text>
          </View>
          {jurosMulta > 0 && (
            <View style={styles.linha}>
              <Text style={styles.label}>Juros/Multa</Text>
              <Text style={styles.valor}>{formatBRL(jurosMulta)}</Text>
            </View>
          )}
          {desconto > 0 && (
            <View style={styles.linha}>
              <Text style={styles.label}>Desconto</Text>
              <Text style={styles.valor}>{formatBRL(desconto)}</Text>
            </View>
          )}
          {baixa.obs && (
            <View style={styles.linha}>
              <Text style={styles.label}>Observação</Text>
              <Text style={styles.valor}>{baixa.obs}</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTexto}>
            Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG
          </Text>
        </View>
      </Page>
    </Document>
  );
}
