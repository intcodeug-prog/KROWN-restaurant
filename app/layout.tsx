import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { OfflineSyncBanner } from '@/components/offline-sync-banner';
import { KrownAuthOverlay } from '@/components/krown-auth-overlay';
import { KrownSignOut } from '@/components/krown-sign-out';

const KROWN_LOGO = 'https://iili.io/nK49crl.png';
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'KROWN ERP | Multi-Branch Restaurant POS & Management System',
  description: 'Enterprise Multi-Branch Restaurant POS, Kitchen Display, Financial Analytics & Inventory System',
  manifest: '/manifest.json?v=20260911',
  icons: {
    icon: [{ url: `${KROWN_LOGO}?v=20260911`, type: 'image/png' }],
    shortcut: [{ url: `${KROWN_LOGO}?v=20260911`, type: 'image/png' }],
    apple: [{ url: `${KROWN_LOGO}?v=20260911`, type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'KROWN ERP' }
};

export const viewport: Viewport = {
  themeColor: '#f97316', width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json?v=20260911" />
        <link rel="icon" href={`${KROWN_LOGO}?v=20260911`} type="image/png" />
        <link rel="shortcut icon" href={`${KROWN_LOGO}?v=20260911`} type="image/png" />
        <link rel="apple-touch-icon" href={`${KROWN_LOGO}?v=20260911`} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.variable} font-sans bg-[#F4F4F6] dark:bg-[#0A0A0C] text-slate-900 dark:text-slate-100 min-h-screen selection:bg-orange-500/30`} suppressHydrationWarning>
        <OfflineSyncBanner />
        {children}
        <KrownSignOut />
        <KrownAuthOverlay />
      </body>
    </html>
  );
}
