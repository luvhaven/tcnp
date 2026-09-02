import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { SafeProviders } from "@/components/providers/SafeProviders";

export const metadata: Metadata = {
  title: {
    default: "TCN Protocol Central Application",
    template: "%s · TCNP",
  },
  description: "Enterprise Central Application System for The Covenant Nation Protocol",
  applicationName: "TCN Protocol Central Application",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TCNP Central",
  },
  // Stop iOS from turning call-signs / IDs into phone links; explicit tel: links still work
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // Match the browser/PWA chrome to the active theme
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F26522" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1017" },
  ],
  width: "device-width",
  initialScale: 1,
  // NOTE: no maximumScale — pinch zoom must stay available (WCAG 1.4.4).
  // iOS input auto-zoom is prevented via 16px form-control font-size in globals.css.
  // Required for env(safe-area-inset-*) to resolve on notched devices
  viewportFit: "cover",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Apply saved theme before first paint — prevents light-mode flash for dark users */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('tcnp-theme');var d=t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <SafeProviders>
          {children}
        </SafeProviders>
      </body>
    </html>
  );
}
