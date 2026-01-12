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
  const { pathname } = request.nextUrl;

  // ✅ 1. Handle the /quote redirect based on browser language
  if (pathname === '/quote') {
    // Detect language from headers or default to English
    const acceptLanguage = request.headers.get('accept-language');
    const locale = acceptLanguage?.toLowerCase().includes('es') ? 'es' : 'en';
    
    // Redirect to the appropriate /locale/auto
    return NextResponse.redirect(new URL(`/${locale}/auto`, request.url));
  }

  // 2. Run next-intl middleware for all other requests
  const response = intlMiddleware(request);
  
  // 3. Add pathname to headers for dynamic hreflang generation
  // Use pathname from request to ensure headers reflect the intended path
  response.headers.set('x-pathname', pathname);
  
  return response;
}

export const config = {
  // Matcher ignoring internal Next.js files and static assets
  // Added '/quote' specifically to ensure it's picked up by the matcher
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)', '/quote']
};