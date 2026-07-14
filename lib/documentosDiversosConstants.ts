import type { CategoriaDocumentoDiverso } from "@/types";

export const CATEGORIAS_DOC_DIVERSO: { value: CategoriaDocumentoDiverso; label: string }[] = [
  { value: "energia", label: "Energia" },
  { value: "agua", label: "Água" },
  { value: "telefone_internet", label: "Telefone / Internet" },
  { value: "guia_imposto", label: "Guia de Imposto (DARF/GPS)" },
  { value: "boleto_diverso", label: "Boleto Diverso" },
  { value: "reembolso_funcionario", label: "Reembolso de Funcionário" },
  { value: "outros", label: "Outros" },
];

export function labelCategoriaDocDiverso(categoria: CategoriaDocumentoDiverso): string {
  return CATEGORIAS_DOC_DIVERSO.find((c) => c.value === categoria)?.label ?? categoria;
}
