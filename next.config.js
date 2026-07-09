/** @type {import('next').NextConfig} */

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : '*.supabase.co'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(self), camera=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: self + inline (Next.js requires unsafe-inline for hydration)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Styles: self + inline + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts: self + Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com",
      // Images: Allow any image host because map tiles (TomTom, Carto, OSM, OpenSky) are highly dynamic and use many varying subdomains.
      "img-src * data: blob: 'unsafe-inline'",
      // Connections: self + Supabase REST, Realtime (WSS)
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://opensky-network.org`,
      // Workers: self + blob (Next.js SW, Leaflet workers)
      "worker-src 'self' blob:",
      // Frames: none
      "frame-src 'none'",
      // Objects: none
      "object-src 'none'",
      // Upgrade insecure requests in production
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  poweredByHeader: false,
  // TypeScript and ESLint errors MUST pass — they are your safety net.
  // Re-enable these only during an emergency hotfix and fix immediately after.
  // typescript: { ignoreBuildErrors: true },  // ← DO NOT UNCOMMENT without team approval
  // eslint: { ignoreDuringBuilds: true },      // ← DO NOT UNCOMMENT without team approval
  webpack(config) {
    // Work around lucide-react packaging issue where TriangleAlert references
    // a non-existent ./icons/triangle-alert.js file. Alias it to alert-triangle.
    config.resolve = config.resolve || {}
    config.resolve.alias = config.resolve.alias || {}
    config.resolve.alias['./icons/triangle-alert.js'] = 'lucide-react/dist/esm/icons/alert-triangle.js'

    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
};

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  scope: "/",
  sw: "sw.js",
  // iOS specific settings
  extendDefaultHandler: false,
  // Cache pages navigated to on the client so they work offline later
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Reload the app when connectivity returns instead of leaving stale offline UI
  reloadOnOnline: true,
  // Serve the branded offline page when a navigation misses cache while offline
  fallbacks: {
    document: "/offline.html",
  },
  // Map tiles need their own rule ahead of the default catch-all: the
  // library's built-in "cross-origin" route caps ALL cross-origin GET
  // requests (shared with every other CDN asset on the page) at just 32
  // cache entries and funnels errors through a document-fallback handler
  // meant for page navigations, not tile images — a single map view can
  // request 30-40+ unique tile URLs, so this thrashes/breaks in production
  // (where the service worker is active) even though it works locally
  // (where next-pwa is disabled in development and never intercepts these
  // requests at all).
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/([a-d]\.basemaps\.cartocdn\.com|[a-c]\.tile\.openstreetmap\.org|cartodb-basemaps-[a-d]\.global\.ssl\.fastly\.net|server\.arcgisonline\.com|api\.tomtom\.com)\//i,
        handler: "CacheFirst",
        options: {
          cacheName: "map-tiles",
          expiration: {
            maxEntries: 1000,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days — tile imagery rarely changes
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
});

module.exports = withPWA(nextConfig);
