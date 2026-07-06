import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { roleFromJwt } from "@/lib/auth/role";

function ultimaMeianoiteBRT(): Date {
  const nowUTC = new Date();
  // Desloca -3h para obter a data local em BRT
  const nowBRT = new Date(nowUTC.getTime() - 3 * 60 * 60 * 1000);
  // Meia-noite BRT = início do dia BRT convertido de volta para UTC (+3h)
  return new Date(Date.UTC(
    nowBRT.getUTCFullYear(),
    nowBRT.getUTCMonth(),
    nowBRT.getUTCDate(),
    3, 0, 0, 0
  ));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/auth")) {
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
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Encerra sessão se o último login ocorreu antes da meia-noite de hoje (BRT)
  const ultimoLogin = new Date(user.last_sign_in_at ?? 0);
  if (ultimoLogin < ultimaMeianoiteBRT()) {
    const redirect = NextResponse.redirect(
      new URL("/auth/login?expired=1", request.url)
    );
    // Remove todos os cookies de sessão do Supabase
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.startsWith("sb-")) {
        redirect.cookies.delete(cookie.name);
      }
    });
    return redirect;
  }

  // RBAC: perfil "producao" só acessa a tela de produção do pedido
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const role = roleFromJwt(session?.access_token);

  if (role === "producao") {
    const podeAcessar = /^\/pedidos\/[^/]+\/producao(\/.*)?$/.test(pathname);
    if (!podeAcessar) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login/acesso-negado";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Todas as páginas (login + RBAC enforçados), exceto estáticos, PWA (manifest/ícones/
  // service worker/offline), .well-known (assetlinks.json do Android App Links —
  // precisa ser público pro Android verificar o domínio), /auth e /api. Todos esses
  // precisam ser acessíveis sem sessão. As rotas /api são protegidas individualmente
  // nos próprios handlers.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192.png|icon-512.png|sw.js|offline.html|.well-known|auth).*)"],
};
