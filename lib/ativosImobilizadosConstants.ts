import type { CategoriaAtivoImobilizado } from "@/types";

export const CATEGORIAS_ATIVO: { value: CategoriaAtivoImobilizado; label: string }[] = [
  { value: "maquinas_equipamentos", label: "Máquinas e Equipamentos" },
  { value: "veiculos", label: "Veículos" },
  { value: "moveis_utensilios", label: "Móveis e Utensílios" },
  { value: "informatica", label: "Informática" },
  { value: "imoveis", label: "Imóveis" },
  { value: "outros", label: "Outros" },
];

export function labelCategoriaAtivo(categoria: CategoriaAtivoImobilizado): string {
  return CATEGORIAS_ATIVO.find((c) => c.value === categoria)?.label ?? categoria;
}
