import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/P5AP8Pe',
        destination: 'https://texaspremiumins.com?utm_source=influencer&utm_medium=raviraj&utm_campaign=ravisocialmedia&utm_id=socialmedia_infl&utm_term=rajsocial&utm_content=rajsocial_v1',
        permanent: true,
      },
    ];
  },

  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
};

export default withNextIntl(nextConfig);