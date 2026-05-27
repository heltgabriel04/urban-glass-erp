import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  return NextResponse.next();
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
  ],
};