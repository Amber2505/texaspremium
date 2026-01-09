// app/[locale]/sitemap.ts
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.texaspremiumins.com'
  const locales = ['en', 'es']
  
  const routes = [
    { path: '', priority: 1.0, changeFreq: 'weekly' as const },
    { path: '/auto', priority: 0.9, changeFreq: 'monthly' as const },
    { path: '/motorcycle', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/boats', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/rv', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/sr22', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/homeowners', priority: 0.9, changeFreq: 'monthly' as const },
    { path: '/renters', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/mobile-home', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/commercial-auto', priority: 0.9, changeFreq: 'monthly' as const },
    { path: '/general-liability', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/mexico-tourist', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/surety-bond', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/view_documents', priority: 0.6, changeFreq: 'monthly' as const },
    { path: '/about', priority: 0.7, changeFreq: 'monthly' as const },
    { path: '/terms', priority: 0.3, changeFreq: 'yearly' as const },
  ]

  // 🔥 IMPROVED: Add hreflang alternates for better multilingual SEO
  return routes.flatMap((route) =>
    locales.map((locale) => ({
      url: `${baseUrl}/${locale}${route.path}`,
      lastModified: new Date(),
      changeFrequency: route.changeFreq,
      priority: route.priority,
      // ✅ NEW: Tell Google about language alternatives
      alternates: {
        languages: {
          en: `${baseUrl}/en${route.path}`,
          es: `${baseUrl}/es${route.path}`,
        },
      },
    }))
  )
}