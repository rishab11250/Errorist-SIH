import { type NextRequest, NextResponse } from 'next/server';

import { safeNextPath } from './lib/api-client';

const SESSION_COOKIE = 'lmpc_session';

export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = request.nextUrl.pathname === '/login';

  if (!hasSession && !isLogin) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  if (hasSession && isLogin) {
    const destination = safeNextPath(request.nextUrl.searchParams.get('next'));
    return NextResponse.redirect(new URL(destination, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|tesseract|sample-labels).*)'],
};
