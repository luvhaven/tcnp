import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { SafeProviders } from "@/components/providers/SafeProviders";

// ─── Premium Typography ─────────────────────────────────────────────────────
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Enable Inter's optical improvements for sharper, more legible text
  // at all sizes — especially important for data-dense operations UIs
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "TCNP Journey Management",
  description: "Enterprise Journey Management System for The Covenant Nation Protocol",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TCNP Journey",
  },
};

export const viewport: Viewport = {
  themeColor: "#F26522",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents iOS zoom on form field focus
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <SafeProviders>
          {children}
        </SafeProviders>
      </body>
    </html>
  );
}
