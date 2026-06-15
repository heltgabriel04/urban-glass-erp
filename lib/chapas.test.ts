import { describe, it, expect } from "vitest";
import { isChapaInteira } from "@/lib/chapas";

describe("isChapaInteira", () => {
  it("reconhece dimensões de chapa padrão", () => {
    expect(isChapaInteira(3300, 2250)).toBe(true);
  });

  it("reconhece a chapa girada (largura/altura trocadas)", () => {
    expect(isChapaInteira(2250, 3300)).toBe(true);
  });

  it("aceita variação dentro da tolerância de 50mm", () => {
    expect(isChapaInteira(3290, 2240)).toBe(true);
  });

  it("rejeita um retalho pequeno", () => {
    expect(isChapaInteira(800, 600)).toBe(false);
  });
});
