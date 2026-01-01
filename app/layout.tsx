import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { SafeProviders } from "@/components/providers/SafeProviders";

const inter = Inter({ subsets: ["latin"] });

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
