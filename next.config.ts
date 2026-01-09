import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/P5AP8Pe',
        destination: 'https://texaspremiumins.com?utm_source=influencer&utm_medium=raviraj&utm_campaign=ravisocialmedia&utm_id=socialmedia_infl&utm_term=rajsocial&utm_content=rajsocial_v1',
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);