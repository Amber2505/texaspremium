import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects(){
    return[{
      source: '/aZfGkRt',
      destination:'https://texaspremiumins.com?utm_source=flyers&utm_medium=distribution&utm_campaign=business_flyer&utm_id=business_flyer_dis&utm_term=business_fly_001&utm_content=business_fly_v1',
      permanent: true,
    }]

  }
};

export default nextConfig;
