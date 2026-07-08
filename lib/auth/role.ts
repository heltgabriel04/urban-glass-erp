// Lê o claim user_role do JWT do Supabase (injetado por hook no banco).
// Fail-safe: na dúvida, "visitante" (menor privilégio), nunca "admin".
export type Role = "admin" | "producao" | "visitante" | "financeiro";

const ROLES: Role[] = ["admin", "producao", "visitante", "financeiro"];

export function roleFromJwt(accessToken: string | undefined | null): Role {
  if (!accessToken) return "visitante";
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString("utf8")
    );
    const r = payload.user_role;
    return ROLES.includes(r) ? r : "visitante";
  } catch {
    return "visitante";
  }
}
