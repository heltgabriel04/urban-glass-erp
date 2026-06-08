export const CHAPAS_PADRAO = [
  { label: "Chapa 4+4 Incolor — 3300 × 2250 mm",         w: 3300, h: 2250 },
  { label: "Chapa 3+3 Incolor — 3300 × 2250 mm",         w: 3300, h: 2250 },
  { label: "Chapa 4+4 Verde — 3300 × 2250 mm",           w: 3300, h: 2250 },
  { label: "Reflecta 4+4 — 2150 × 3660 mm",              w: 2150, h: 3660 },
  { label: "Reflecta 4+4 Silver Grey — 3660 × 2140 mm",  w: 3660, h: 2140 },
  { label: "Reflecta 4+4 Champagne — 3660 × 2140 mm",    w: 3660, h: 2140 },
  { label: "Euro Grey Laminado 4+4 — 3660 × 2140 mm",    w: 3660, h: 2140 },
  { label: "French Green Laminado 4+4 — 3660 × 2140 mm", w: 3660, h: 2140 },
  { label: "Reflecta Silver Grey 4mm — 3660 × 2140 mm",  w: 3660, h: 2140 },
  { label: "Reflecta Silver Grey 6mm — 3660 × 2140 mm",  w: 3660, h: 2140 },
  { label: "Vidro Monolítico 4mm — 3660 × 2140 mm",      w: 3660, h: 2140 },
  { label: "Vidro Monolítico 6mm — 3660 × 2140 mm",      w: 3660, h: 2140 },
  { label: "Personalizado",                               w: 3300, h: 2250 },
] as const;

export const PRODUTO_CHAPA: Record<string, number> = {
  "Vidro Laminado 4+4": 0, "Vidro Laminado 3+3": 1, "Verde Laminado 4+4": 2,
  "Reflecta 4+4 Prata": 3, "Reflecta 4+4 Silver Grey": 4, "Reflecta 4+4 Champagne": 5,
  "Laminado 4+4 Fumê": 6, "Vidro Monolítico 4mm": 10,
};

/** Retorna true se as dimensões correspondem a uma chapa inteira padrão (tolerância 50mm). */
export function isChapaInteira(largura: number, altura: number): boolean {
  return CHAPAS_PADRAO.some(c =>
    (Math.abs(largura - c.w) < 50 && Math.abs(altura - c.h) < 50) ||
    (Math.abs(largura - c.h) < 50 && Math.abs(altura - c.w) < 50)
  );
}
