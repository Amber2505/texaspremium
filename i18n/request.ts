import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Define your supported languages
const locales = ['en', 'es'];

export default getRequestConfig(async ({ requestLocale }) => {
  // 1. Wait for the locale promise to resolve
  let locale = await requestLocale;

  // 2. SAFETY CHECK: If the URL has no locale (like /favicon.ico) 
  // or an invalid one, fallback to 'en'
  if (!locale || !locales.includes(locale as any)) {
    locale = 'en'; 
  }

  return {
    locale, // Now TypeScript is happy because locale is definitely a string
    messages: (await import(`../messages/${locale}.json`)).default
  };
});