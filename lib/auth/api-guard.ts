import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { roleFromJwt, type Role } from "@/lib/auth/role";

/** Lê o usuário autenticado e seu perfil a partir dos cookies da requisição. */
export async function getApiAuth() {
  const cookieStore = await cookies(); // Next 15: cookies() é assíncrono
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { user, role: roleFromJwt(session?.access_token) };
}

/** Exige apenas que haja usuário autenticado. Retorna 401 se não houver. */
export async function requireAuth(): Promise<NextResponse | null> {
  const { user } = await getApiAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return null;
}

/** Exige um dos perfis informados. Retorna 401/403, ou null se autorizado. */
export async function requireRole(roles: Role[]): Promise<NextResponse | null> {
  const { user, role } = await getApiAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!roles.includes(role)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  return null;
}
