// Ordenação "natural" do código estruturado do plano de contas (ex: "1",
// "1.1", "1.2", "2", "6", "12") — comparar como texto faz "12" vir antes
// de "6" (String "1" < "6"), e a coluna `codigo` (número avulso digitado
// na hora de cadastrar) não necessariamente segue a hierarquia de
// `codigo_estruturado`. Compara segmento a segmento como número.
export function compararCodigoEstruturado(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export function ordenarPorCodigoEstruturado<T extends { codigo_estruturado: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => compararCodigoEstruturado(a.codigo_estruturado, b.codigo_estruturado));
}
