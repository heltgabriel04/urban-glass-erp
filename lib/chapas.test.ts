import { describe, it, expect } from "vitest";
import { isChapaInteira } from "@/lib/chapas";

const chapas = [{ w: 3300, h: 2250 }, { w: 3660, h: 2140 }];

describe("isChapaInteira", () => {
  it("reconhece dimensão que bate com uma das chapas informadas", () => {
    expect(isChapaInteira(3300, 2250, chapas)).toBe(true);
  });

  it("reconhece a chapa girada (largura/altura trocadas)", () => {
    expect(isChapaInteira(2250, 3300, chapas)).toBe(true);
  });

  it("aceita variação dentro da tolerância de 50mm", () => {
    expect(isChapaInteira(3290, 2240, chapas)).toBe(true);
  });

  it("rejeita um retalho pequeno", () => {
    expect(isChapaInteira(800, 600, chapas)).toBe(false);
  });

  it("rejeita quando a lista de chapas está vazia (nenhum lote confirmado)", () => {
    expect(isChapaInteira(3300, 2250, [])).toBe(false);
  });

  it("reconhece uma segunda dimensão da lista, não só a primeira", () => {
    expect(isChapaInteira(3660, 2140, chapas)).toBe(true);
  });
});
