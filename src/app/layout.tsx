import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

/**
 * IBM Plex — enterprise-grade readability for dense ledger UI.
 * Bricolage Grotesque — characterful display face for headings/brand.
 */
const body = IBM_Plex_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const display = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

// Apply the actual family on <body> so UI never falls back to unstyled system text
// when only the CSS variable is set.

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://ledgerly.app'
  ),
  title: 'Ledgerly — Estimates & invoices for any business',
  description:
    'Build professional estimates, collect e-signatures, send invoices, and get paid. For contractors, freelancers, agencies, and any business that bills clients.',
  icons: {
    icon: [{ url: '/brand/logo-mark.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/brand/logo-mark-rich.jpg' }],
  },
  other: {
    'lg-ui': 'v6-ledgerly-2026-07',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${body.variable} ${mono.variable} ${display.variable} ${body.className}`}>
        {children}
      </body>
    </html>
  );
}
