import type { Metadata } from 'next';

import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'LMPC Compliance Checker',
  description: 'Check packaged-commodity labels against LMPC Rules 2011',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
