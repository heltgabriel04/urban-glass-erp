import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Rotas que o usuário de produção pode acessar
const ROTAS_PRODUCAO = ["/pedidos"];

// Rotas públicas (sem login)
const ROTAS_PUBLICAS = ["/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Deixa rotas públicas passarem
  if (ROTAS_PUBLICAS.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options as any);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Sem login → redireciona para /auth/login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Busca o role do usuário
  const { data: perfil } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  const role = perfil?.role ?? "admin";

  // Usuário de produção: só pode acessar /pedidos/*/producao
  if (role === "producao") {
    const podeAcessar =
      /^\/pedidos\/[^/]+\/producao(\/.*)?$/.test(pathname);

    if (!podeAcessar) {
      // Redireciona para uma página de acesso negado simples
      const url = request.nextUrl.clone();
      url.pathname = "/auth/acesso-negado";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/clientes/:path*",
    "/pedidos/:path*",
    "/financeiro/:path*",
    "/estoque/:path*",
    "/producao/:path*",
    "/otimizador/:path*",
    "/relatorios/:path*",
    "/retalhos/:path*",
    "/orcamentos/:path*",
    "/produtos/:path*",
    "/tabelas/:path*",
    "/fluxo/:path*",
    "/relatorios/:path*",
    "/dashboard/:path*",
  ],
};