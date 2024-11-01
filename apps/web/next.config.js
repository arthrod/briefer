const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
    esmExternals: 'loose',
  },
  transpilePackages: [],
  sassOptions: { implementation: 'sass-embedded' },
  webpack(config, { dev, isServer }) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    })
    if (dev && !isServer) {
      const originalEntry = config.entry
      config.entry = async () => {
        const wdrPath = path.resolve(__dirname, './scripts/wdyr.ts')
        const entries = await originalEntry()

        if (entries['main.js'] && !entries['main.js'].includes(wdrPath)) {
          entries['main.js'].push(wdrPath)
        }
        return entries
      }
    }

    return config
  },
  headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
