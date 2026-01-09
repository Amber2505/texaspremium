import createMiddleware from 'next-intl/middleware';
 
export default createMiddleware({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  localeDetection: true,
  // Ensures /en/ or /es/ is always in the URL for better SEO indexing
  localePrefix: 'always' 
});
 
export const config = {
  // Matcher ignoring internal Next.js files and static assets
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};