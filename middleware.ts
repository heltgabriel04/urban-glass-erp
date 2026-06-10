import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

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

  const response = NextResponse.next();

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
    return NextResponse.redirect(new URL("/auth/login", request.url));
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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};