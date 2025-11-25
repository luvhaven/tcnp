import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
  if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/signup')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated users away from auth pages
  if (user && (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Update user online status without ever blocking the request pipeline
  if (user) {
    try {
      await supabase.rpc('update_user_online_status', { p_is_online: true });
    } catch (error) {
      console.warn('⚠️ Failed to update user online status in middleware (non-fatal):', error);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
