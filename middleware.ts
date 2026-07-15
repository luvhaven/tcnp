import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // Safely resolve current user so middleware never crashes all routes if Supabase fails
  let user = null as any;
  try {
    const {
      data,
      error,
    } = await supabase.auth.getUser();

    if (error) {
      const message = (error as any)?.message || '';
      const name = (error as any)?.name || '';
      const isSessionMissing =
        name === 'AuthSessionMissingError' ||
        (typeof message === 'string' && message.toLowerCase().includes('auth session missing'));

      if (!isSessionMissing) {
        console.warn('⚠️ Supabase auth.getUser in middleware failed (non-fatal):', error);
      }
    }

    user = data?.user ?? null;
  } catch (error) {
    console.warn('⚠️ Unexpected error in Supabase auth middleware (treated as unauthenticated):', error);
    user = null;
  }

  // Protected routes
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/signup') &&
    !request.nextUrl.pathname.startsWith('/api/auth/signup')
  ) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Handle authenticated users and RBAC
  if (user) {
    // Redirect authenticated users away from auth pages
    if (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Verify activation_status for non-api dashboard routes
    if (request.nextUrl.pathname.startsWith('/dashboard') && !request.nextUrl.pathname.startsWith('/pending-approval')) {
      // Hardcode super admin override
      if (user.email === 'doriazowan@gmail.com') {
        // Allow full access
      } else {
        // Use Admin Client at the Edge to completely bypass RLS when reading activation_status
        const adminSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: dbUser } = await adminSupabase.from('users').select('activation_status').eq('id', user.id).single();

        if (!dbUser || dbUser.activation_status !== 'active') {
          // If strictly not active, aggressively destroy the session cookies and boot them to login
          const redirectRes = NextResponse.redirect(new URL('/login?error=pending_approval', request.url));
          redirectRes.cookies.set('sb-access-token', '', { maxAge: 0 });
          redirectRes.cookies.set('sb-refresh-token', '', { maxAge: 0 });

          return redirectRes;
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Exclude Next internals AND all public/PWA static assets from auth handling.
    // Previously the auth middleware caught /sw.js, /manifest.json, /workbox-*.js,
    // etc. and — for any request without a session cookie (including the browser's
    // own background manifest/SW checks) — redirected them to /login, returning
    // HTML instead of the real file. That silently broke service-worker
    // registration and made the manifest unreadable, so the browser never offered
    // the PWA "install" icon in the address bar. Serving these files directly,
    // regardless of auth state, is both correct and required for installability.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|sw.js.map|workbox-|worker-|fallback-|swe-worker|robots.txt|sitemap.xml|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|json|webmanifest|woff|woff2|ttf|eot|mp3|wav|ogg)$).*)',
  ],
};
