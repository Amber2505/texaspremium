import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  // pdfjs-dist and canvas must stay as real files on disk at runtime — if
  // webpack bundles them into a vendor chunk, pdfjs's Node "fake worker"
  // fallback can't find pdf.worker.mjs next to it and throws
  // "Cannot find module .../pdf.worker.mjs".
  serverExternalPackages: ["pdfjs-dist", "canvas"],

  async redirects() {
    return [
      {
        source: '/P5AP8Pe',
        destination: 'https://texaspremiumins.com?utm_source=influencer&utm_medium=raviraj&utm_campaign=ravisocialmedia&utm_id=socialmedia_infl&utm_term=rajsocial&utm_content=rajsocial_v1',
        permanent: true,
      },
    ];
  },

  webpack: (config, { isServer }) => {
    // Stub "canvas" out ONLY for the client bundle — pdfjs-dist's browser
    // build probes for it. The server route needs the real module to render
    // PDF pages, so it must never be aliased away there.
    if (!isServer) {
      config.resolve.alias.canvas = false;
    }
    return config;
  },
};

export default withNextIntl(nextConfig);