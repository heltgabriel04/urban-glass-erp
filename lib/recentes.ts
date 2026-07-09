const CHAVE = "ug-recentes";
const LIMITE = 15;

export interface ItemRecente {
  tipo: "pedido" | "cliente" | "documento";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  ts: number;
}

export function registrarRecente(item: Omit<ItemRecente, "ts">): void {
  if (typeof window === "undefined") return;
  try {
    const atuais = getRecentes().filter(r => !(r.tipo === item.tipo && r.id === item.id));
    const novos = [{ ...item, ts: Date.now() }, ...atuais].slice(0, LIMITE);
    window.localStorage.setItem(CHAVE, JSON.stringify(novos));
  } catch {
    // localStorage indisponível (modo privado, quota) — recentes é conveniência, não crítico
  }
}

export function getRecentes(): ItemRecente[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return [];
    return JSON.parse(bruto) as ItemRecente[];
  } catch {
    return [];
  }
}
