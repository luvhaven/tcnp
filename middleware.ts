import { NextResponse, type NextRequest } from 'next/server'

/**
 * Keep routing middleware deterministic and network-free.
 *
 * Vercel runs this code before every matched page. Calling Supabase here meant
 * that a paused, deleted, misconfigured or temporarily slow project could hold
 * every request open until Vercel returned MIDDLEWARE_INVOCATION_TIMEOUT — even
 * for /login. Authentication is still verified by the login activation API,
 * protected server routes and Supabase RLS. The cookie check below is only a
 * fast navigation guard; it is not an authorization boundary.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/') {
    const destination = hasSupabaseSessionCookie(request) ? '/dashboard' : '/login'
    return NextResponse.redirect(new URL(destination, request.url))
  }

  if (isPublicPage(pathname)) {
    return NextResponse.next()
  }

  if (!hasSupabaseSessionCookie(request)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

function isPublicPage(pathname: string) {
  return pathname === '/login' || pathname === '/signup' || pathname === '/install'
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name, value }) => {
    if (!value) return false
    if (name === 'sb-access-token') return true

    // Current Supabase SSR cookies use sb-<project-ref>-auth-token and may be
    // split into numbered chunks when the encoded session is large.
    return /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name)
  })
}

export const config = {
  matcher: [
    // API handlers authenticate themselves and must return JSON status codes,
    // never HTML login redirects. Static/PWA assets must also bypass routing.
    '/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|sw.js.map|workbox-|worker-|fallback-|swe-worker|robots.txt|sitemap.xml|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|json|webmanifest|woff|woff2|ttf|eot|mp3|wav|ogg)$).*)',
  ],
}
