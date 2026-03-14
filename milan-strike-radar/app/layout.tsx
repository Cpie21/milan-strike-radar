import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

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

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5b748d" },
    { media: "(prefers-color-scheme: dark)", color: "#3A566C" },
  ],
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
        className={`${jetBrainsMono.variable} antialiased`}
      >
        <CSPostHogProvider>
          {children}
        </CSPostHogProvider>
      </body>
    </html>
  );
}
