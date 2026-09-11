import type { Metadata, Viewport } from 'next';

import { PwaRegistration } from '@/components/pwa/PwaRegistration';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'LMPC Compliance Checker',
  description: 'Check packaged-commodity labels against LMPC Rules 2011',
  applicationName: 'LMPC Inspector',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LMPC Inspector',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
