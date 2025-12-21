import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.texaspremiumins.com'
  
  // All public pages
  const routes = [
    { path: '', priority: 1.0, changeFreq: 'weekly' as const },
    // Personal Insurance
    { path: '/auto', priority: 0.9, changeFreq: 'monthly' as const },
    { path: '/motorcycle', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/boats', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/rv', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/sr22', priority: 0.8, changeFreq: 'monthly' as const },
    // Home Insurance
    { path: '/homeowners', priority: 0.9, changeFreq: 'monthly' as const },
    { path: '/renters', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/mobile-home', priority: 0.8, changeFreq: 'monthly' as const },
    // Commercial Insurance
    { path: '/commercial-auto', priority: 0.9, changeFreq: 'monthly' as const },
    { path: '/general-liability', priority: 0.8, changeFreq: 'monthly' as const },
    // Specialty
    { path: '/mexico-tourist', priority: 0.8, changeFreq: 'monthly' as const },
    { path: '/surety-bond', priority: 0.8, changeFreq: 'monthly' as const },
    // Other pages
    { path: '/view_documents', priority: 0.6, changeFreq: 'monthly' as const },
    { path: '/about', priority: 0.7, changeFreq: 'monthly' as const },
    { path: '/terms', priority: 0.3, changeFreq: 'yearly' as const },
  ]

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFreq,
    priority: route.priority,
  }))
}