/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack: (config) => {
    // wagmi/connectors is a barrel: importing `injected` from it also pulls in the
    // Coinbase and Base connectors, and those reach a broken optional dependency
    // (@coinbase/cdp-sdk -> @x402/*) that is not published for this version.
    // Ingot only ever uses the injected connector, so that whole subtree is stubbed
    // rather than shipping a connector set we do not offer.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
    };
    return config;
  },
};

export default nextConfig;
