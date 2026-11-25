import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

/** Rotas acessíveis sem login. */
const PUBLIC_PATHS = ["/entrar", "/cadastro", "/recuperar-senha", "/auth/confirmar", "/configuracao-pendente"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessão do Supabase a cada requisição e faz o redirecionamento
 * "otimista" de quem não está logado. A autorização real é feita no servidor
 * (getUser + RLS); este filtro existe apenas para melhorar a experiência.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getSupabaseEnv();
  const { pathname } = request.nextUrl;

  if (!env) {
    if (pathname === "/configuracao-pendente") return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/configuracao-pendente";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);

  if (!isLoggedIn && !isPublicPath(pathname)) {
    // Endpoints de dados respondem 401 em vez de redirecionar para a tela de login.
    if (pathname.startsWith("/api/") || pathname === "/relatorios/exportar") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  if (isLoggedIn && (pathname === "/entrar" || pathname === "/cadastro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
