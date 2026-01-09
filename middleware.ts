// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

// Create the next-intl middleware
const intlMiddleware = createMiddleware({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  localeDetection: true,
  // Ensures /en/ or /es/ is always in the URL for better SEO indexing
  localePrefix: 'always'
});

export default function middleware(request: NextRequest) {
  // Run next-intl middleware
  const response = intlMiddleware(request);
  
  // 🔥 NEW: Add pathname to headers for dynamic hreflang generation
  // This allows your layout metadata to know the current path
  const pathname = request.nextUrl.pathname;
  response.headers.set('x-pathname', pathname);
  
  return response;
}

export const config = {
  // Matcher ignoring internal Next.js files and static assets
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};