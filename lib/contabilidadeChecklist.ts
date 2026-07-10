// Catálogo fixo dos itens do checklist mensal de fechamento — não fica em
// tabela porque é definido pelo sistema, não pelo usuário. Itens de fases
// futuras nascem como 'nao_aplicavel' ao semear um fechamento novo (ver
// getOrCreateFechamento em services/contabilidadeChecklist.service.ts) e
// não contam como pendência.

export interface ChecklistItemDef {
  key: string;
  label: string;
  area: "documentos_fiscais" | "estoque" | "ativo_imobilizado" | "cartoes";
  faseDisponivel: 1 | 2 | 3 | 4;
}

export const CHECKLIST_ITENS: ChecklistItemDef[] = [
  { key: "nf_compra",          label: "NF Compra",                          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_entrada",         label: "NF Entrada",                         area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_saida",           label: "NF Saída",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_perda",           label: "NF Perda",                           area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "nf_cancelada",       label: "NF Canceladas",                      area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "carta_correcao",     label: "Carta de Correção",                  area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "inutilizacao",       label: "Inutilização de Numeração",          area: "documentos_fiscais", faseDisponivel: 1 },
  { key: "estoque",            label: "Estoque / CMV",                      area: "estoque",            faseDisponivel: 2 },
  { key: "ativo_imobilizado",  label: "Ativo Imobilizado",                  area: "ativo_imobilizado",  faseDisponivel: 3 },
  { key: "cartoes_emprestimos", label: "Cartões / Empréstimos / Consórcios", area: "cartoes",           faseDisponivel: 4 },
];

export const FASE_ATUAL = 4;

export function itemDisponivel(item: ChecklistItemDef): boolean {
  return item.faseDisponivel <= FASE_ATUAL;
}

export function getChecklistItemDef(key: string): ChecklistItemDef | undefined {
  return CHECKLIST_ITENS.find((i) => i.key === key);
}
