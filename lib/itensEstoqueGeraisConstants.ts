import type { GrupoItemEstoqueGeral } from "@/types";

export const GRUPOS_ITEM_ESTOQUE: { value: GrupoItemEstoqueGeral; label: string }[] = [
  { value: "ferragens", label: "Ferragens" },
  { value: "perfis_aluminio", label: "Perfis/Alumínio" },
  { value: "insumos", label: "Insumos" },
  { value: "equipamentos", label: "Equipamentos" },
  { value: "consumiveis", label: "Consumíveis" },
  { value: "epis", label: "EPIs" },
  { value: "material_escritorio", label: "Material de Escritório" },
  { value: "outros", label: "Outros" },
];

export function labelGrupoItem(grupo: GrupoItemEstoqueGeral): string {
  return GRUPOS_ITEM_ESTOQUE.find((g) => g.value === grupo)?.label ?? grupo;
}
