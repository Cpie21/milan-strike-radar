import type { Metadata, Viewport } from "next";
import { Barlow_Semi_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});
// The figures' face (components/lab/theme.ts, TYPE).
const num = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-num", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://theitalystrike.com"),
  title: "意大利罢工查询",
  description: "Italy Strike Query - Real-time strike information for Italy",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "罢工查询",
  },
  icons: {
    icon: [
      { url: '/icon-v4.png?v=4', type: 'image/png' },
      { url: '/favicon.ico?v=4', type: 'image/x-icon' },
    ],
    apple: [
      { url: '/apple-touch-icon.png?v=4', type: 'image/png' },
    ],
  },
};

// Safari tints its status bar and toolbars from theme-color and the page
// background: both are the page's own near-black, so it runs edge to edge
// with no seam. LabApp retints theme-color on strike days to match the band
// at the top of the page.
export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  colorScheme: "dark",
  viewportFit: "cover",
};

import { CSPostHogProvider } from '../providers/PostHogProvider'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body
        className={`${jetBrainsMono.variable} ${num.variable} antialiased`}
      >
        <style>{'html,body{background:#0A0B0D;color-scheme:dark;overscroll-behavior-y:none}'}</style>
        <CSPostHogProvider>
          {children}
        </CSPostHogProvider>
      </body>
    </html>
  );
}
