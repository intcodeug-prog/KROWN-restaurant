import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { OfflineSyncBanner } from '@/components/offline-sync-banner';
import { KrownAuthOverlay } from '@/components/krown-auth-overlay';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'KROWN ERP | Multi-Branch Restaurant POS & Management System',
  description: 'Enterprise Multi-Branch Restaurant POS, Kitchen Display, Financial Analytics & Inventory System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KROWN ERP'
  }
};

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.variable} font-sans bg-[#F4F4F6] dark:bg-[#0A0A0C] text-slate-900 dark:text-slate-100 min-h-screen selection:bg-orange-500/30`} suppressHydrationWarning>
        <OfflineSyncBanner />
        {children}
        <KrownAuthOverlay />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) { console.log('[PWA] ServiceWorker registered with scope:', registration.scope); },
                    function(err) { console.warn('[PWA] ServiceWorker registration failed:', err); }
                  );
                });
              }
            `
          }}
        />
      </body>
    </html>
  );
}
