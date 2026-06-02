import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/auth")) return NextResponse.next();

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
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Lê o role direto do JWT (injetado pelo hook do Supabase)
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  let role = "admin";

  if (jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      role = payload.user_role ?? "admin";
    } catch {}
  }

  if (role === "producao") {
    const podeAcessar = /^\/pedidos\/[^/]+\/producao(\/.*)?$/.test(pathname);
    if (!podeAcessar) {
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
    "/dashboard/:path*",
  ],
};