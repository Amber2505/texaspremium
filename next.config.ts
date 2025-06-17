import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects(){
    return[{
      source: '/P5AP8Pe',
      destination:'https://texaspremiumins.com?utm_source=influencer&utm_medium=raviraj&utm_campaign=ravisocialmedia&utm_id=socialmedia_infl&utm_term=rajsocial&utm_content=rajsocial_v1',
      permanent: true,
    }]

  }
};

export default nextConfig;