import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ROVA_ADMIN_TEST_BUILD === 'true' ? '.next-e2e' : '.next',
  transpilePackages: ["@rova/shared", "@rova/ui"],
  async headers(){return[{source:'/:path*',headers:[{key:'X-Frame-Options',value:'DENY'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'Permissions-Policy',value:'geolocation=(), microphone=(), camera=()'}]}];},
};

export default nextConfig;
