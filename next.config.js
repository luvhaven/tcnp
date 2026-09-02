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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com",
      // Styles: self + inline + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts: self + Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com",
      // Images: Allow any image host because map tiles (TomTom, Carto, OSM, OpenSky) are highly dynamic and use many varying subdomains.
      "img-src * data: blob: 'unsafe-inline'",
      // Connections: self + Supabase REST, Realtime (WSS)
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://opensky-network.org https://www.youtube.com https://www.youtube-nocookie.com`,
      // Workers: self + blob (Next.js SW, Leaflet workers)
      "worker-src 'self' blob:",
      // Privacy-enhanced YouTube embeds are used by the members-only Training workspace.
      "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
      // Objects: none
      "object-src 'none'",
      // Upgrade insecure requests in production
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const nextConfig = {
  // Development and production previously shared `.next`. Running `next
  // build` while the dev server was open could overwrite the dev client
  // manifest and produce "__webpack_modules__[moduleId] is not a function".
  // Separate output directories make those workflows safe to run side by side.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
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
  // Map tiles MUST bypass the service worker entirely (NetworkOnly). The map
  // works on localhost and for logged-out visitors because no service worker
  // is intercepting requests there (next-pwa is disabled in dev, and the SW is
  // only registered after login). For a logged-in user the SW is active, and
  // next-pwa's default "cross-origin" route (NetworkFirst, a 32-entry cache
  // shared with every CDN asset, a 10s timeout, and a document-fallback error
  // handler) chokes on the 30-40+ simultaneous tile requests a single map view
  // fires — producing the blank/white map. Registering a NetworkOnly route for
  // the tile hosts ahead of that catch-all makes the SW pass tile requests
  // straight to the network, exactly as if no SW existed — matching the
  // known-good localhost behavior.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/([a-d]\.basemaps\.cartocdn\.com|[a-c]\.tile\.openstreetmap\.org|cartodb-basemaps-[a-d]\.global\.ssl\.fastly\.net|server\.arcgisonline\.com|api\.tomtom\.com)\//i,
        handler: "NetworkOnly",
      },
    ],
  },
});

module.exports = withPWA(nextConfig);
